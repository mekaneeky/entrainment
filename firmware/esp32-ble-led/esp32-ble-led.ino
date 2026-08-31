#include <Arduino.h>
#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLESecurity.h>
#include <BLEUtils.h>
#include <Preferences.h>
#include <esp_gap_ble_api.h>
#include <esp_timer.h>
#include <soc/gpio_struct.h>

#include "visual_protocol.h"

using namespace visual_protocol;

// 0 = consumer pairing (LE Secure Connections "Just Works": encrypted, bonded,
// no PIN). 1 = legacy per-unit six-digit passkey entry for dev boards.
#define DEV_PASSKEY_PAIRING 0

#if DEV_PASSKEY_PAIRING
constexpr uint16_t SECURE_READ_PERMISSION = ESP_GATT_PERM_READ_ENC_MITM;
constexpr uint16_t SECURE_WRITE_PERMISSION = ESP_GATT_PERM_WRITE_ENC_MITM;
#else
constexpr uint16_t SECURE_READ_PERMISSION = ESP_GATT_PERM_READ_ENCRYPTED;
constexpr uint16_t SECURE_WRITE_PERMISSION = ESP_GATT_PERM_WRITE_ENCRYPTED;
#endif

constexpr bool BUILTIN_LED_TEST = false;
constexpr uint8_t BUILTIN_LED_PIN = 2;
constexpr uint8_t LEFT_LED_PIN = 18;
constexpr uint8_t RIGHT_LED_PIN = 19;
constexpr uint8_t BOND_RESET_PIN = 0;
constexpr uint8_t MAX_SEGMENTS = 128;
constexpr uint16_t MAX_FREQUENCY_CENTIHZ = 4500;
constexpr uint8_t MAX_INTENSITY_BYTE = 64;
constexpr uint32_t MAX_SESSION_MS = 3UL * 60UL * 60UL * 1000UL;
constexpr uint32_t TIMER_HZ = 1000000;
constexpr uint32_t SCHEDULER_TICK_US = 500;
constexpr uint32_t FAST_ADVERTISING_MS = 60000;
constexpr uint16_t FAST_ADVERTISING_MIN = 160;   // 100 ms, in 0.625 ms BLE units
constexpr uint16_t FAST_ADVERTISING_MAX = 320;   // 200 ms
constexpr uint16_t SLOW_ADVERTISING_MIN = 1200;  // 750 ms
constexpr uint16_t SLOW_ADVERTISING_MAX = 1600;  // 1000 ms
constexpr uint32_t IDLE_CPU_MHZ = 80;
constexpr uint32_t SESSION_CPU_MHZ = 240;
constexpr TickType_t LOOP_IDLE_TICKS = pdMS_TO_TICKS(50);
constexpr char DEVICE_NAME[] = "Entrainment-Goggles";

constexpr char SERVICE_UUID[] = "7b5d1001-7f4b-4c7f-9d25-20f8c4f3a001";
constexpr char INFO_UUID[] = "7b5d1002-7f4b-4c7f-9d25-20f8c4f3a001";
constexpr char CONTROL_UUID[] = "7b5d1003-7f4b-4c7f-9d25-20f8c4f3a001";
constexpr char EVENT_UUID[] = "7b5d1004-7f4b-4c7f-9d25-20f8c4f3a001";

struct Segment {
  uint32_t durationMs;
  uint16_t frequencyStart;
  uint16_t frequencyEnd;
  uint8_t dutyStart;
  uint8_t dutyEnd;
  uint8_t intensityStart;
  uint8_t intensityEnd;
};

struct ChannelPlan {
  uint32_t delayMs;
  uint16_t phaseCentiDeg;
  uint8_t expectedCount;
  uint8_t receivedCount;
  bool loaded;
  Segment segments[MAX_SEGMENTS];
};

struct Schedule {
  uint32_t sessionId;
  uint32_t durationMs;
  uint32_t expectedCrc;
  uint32_t runningCrc;
  bool valid;
  ChannelPlan channels[2];
};

struct ChannelRuntime {
  uint8_t segmentIndex;
  uint64_t segmentStartUs;
  uint64_t segmentEndUs;
  uint64_t lastUpdateUs;
  uint32_t phase;
  bool initialized;
};

struct QueuedPacket {
  uint8_t length;
  uint8_t bytes[PACKET_BYTES];
};

Schedule schedulePlan{};
ChannelRuntime runtimeState[2]{};
BLEServer *bleServer = nullptr;
BLEAdvertising *bleAdvertising = nullptr;
BLECharacteristic *infoCharacteristic = nullptr;
BLECharacteristic *eventCharacteristic = nullptr;
QueueHandle_t commandQueue = nullptr;
hw_timer_t *waveTimer = nullptr;
Preferences preferences;
portMUX_TYPE stateMux = portMUX_INITIALIZER_UNLOCKED;

volatile State deviceState = BOOT;
volatile bool connected = false;
volatile bool authenticated = false;
volatile bool armCommitted = false;
volatile uint64_t startDeviceUs = 0;
volatile uint32_t lastHeartbeatUs = 0;
volatile uint32_t heartbeatTimeoutUs = 4000000;
volatile uint8_t asyncOpcode = 0;
volatile uint8_t asyncFaultCode = 0;
volatile bool queueOverflow = false;
volatile uint64_t testStartedUs = 0;
volatile uint64_t testUntilUs = 0;
volatile uint32_t testHalfPeriodUs = 250000;
volatile uint8_t testEyeMask = 0;
volatile bool testActive = false;
volatile uint64_t lastSchedulerTickUs = 0;
volatile uint32_t maxSchedulerGapUs = 0;
volatile int32_t timelineCorrectionAppliedUs = 0;
volatile int32_t timelineCorrectionRemainingUs = 0;
volatile uint8_t correctionTick = 0;

bool haveSequence = false;
uint8_t lastSequence = 0;
uint8_t lastOpcode = 0;
uint8_t lastStatus = SUCCESS;
bool schedulerRunning = false;
bool slowAdvertising = false;
volatile bool restartAdvertising = false;
uint32_t advertisingStartedMs = 0;

inline void IRAM_ATTR writePin(uint8_t pin, bool on) {
  if (on) GPIO.out_w1ts = 1UL << pin;
  else GPIO.out_w1tc = 1UL << pin;
}

void IRAM_ATTR setEyeOutputs(bool left, bool right) {
  if (BUILTIN_LED_TEST) {
    writePin(BUILTIN_LED_PIN, left || right);
    return;
  }
  writePin(LEFT_LED_PIN, left);
  writePin(RIGHT_LED_PIN, right);
}

void IRAM_ATTR darkOutputs() { setEyeOutputs(false, false); }

uint64_t deviceTimeUs() { return static_cast<uint64_t>(esp_timer_get_time()); }

bool startScheduler() {
  if (schedulerRunning) return true;
  if (getCpuFrequencyMhz() != SESSION_CPU_MHZ && !setCpuFrequencyMhz(SESSION_CPU_MHZ)) return false;
  lastSchedulerTickUs = 0;
  timerStart(waveTimer);
  schedulerRunning = true;
  return true;
}

void updatePowerMode() {
  const bool needed = testActive || deviceState == ARMED || deviceState == RUNNING;
  if (!needed && schedulerRunning) {
    timerStop(waveTimer);
    schedulerRunning = false;
    lastSchedulerTickUs = 0;
  }
  const uint32_t targetMhz = connected ? SESSION_CPU_MHZ : IDLE_CPU_MHZ;
  if (!schedulerRunning && getCpuFrequencyMhz() != targetMhz) setCpuFrequencyMhz(targetMhz);
}

void startAdvertising(bool slow) {
  if (!bleAdvertising || connected) return;
  bleAdvertising->stop();
  bleAdvertising->setMinInterval(slow ? SLOW_ADVERTISING_MIN : FAST_ADVERTISING_MIN);
  bleAdvertising->setMaxInterval(slow ? SLOW_ADVERTISING_MAX : FAST_ADVERTISING_MAX);
  bleAdvertising->start();
  slowAdvertising = slow;
  advertisingStartedMs = millis();
}

void updateAdvertising() {
  if (restartAdvertising) {
    restartAdvertising = false;
    startAdvertising(false);
  } else if (!connected && !slowAdvertising && static_cast<uint32_t>(millis() - advertisingStartedMs) >= FAST_ADVERTISING_MS) {
    startAdvertising(true);
  }
}

void clearSchedule() {
  memset(&schedulePlan, 0, sizeof(schedulePlan));
  schedulePlan.runningCrc = 0xFFFFFFFFUL;
  memset(runtimeState, 0, sizeof(runtimeState));
}

void IRAM_ATTR failDarkFromTimer(uint8_t code) {
  darkOutputs();
  testActive = false;
  schedulePlan.valid = false;
  armCommitted = false;
  deviceState = FAULT_STATE;
  asyncFaultCode = code;
  asyncOpcode = FAULT_EVENT;
}

void failDark(uint8_t code) {
  portENTER_CRITICAL(&stateMux);
  darkOutputs();
  testActive = false;
  schedulePlan.valid = false;
  armCommitted = false;
  deviceState = FAULT_STATE;
  asyncFaultCode = code;
  asyncOpcode = FAULT_EVENT;
  portEXIT_CRITICAL(&stateMux);
}

uint32_t IRAM_ATTR interpolate(uint32_t start, uint32_t end, uint64_t elapsed, uint64_t duration) {
  if (!duration || elapsed >= duration) return end;
  const int64_t delta = static_cast<int64_t>(end) - start;
  return static_cast<uint32_t>(static_cast<int64_t>(start) + delta * static_cast<int64_t>(elapsed) / static_cast<int64_t>(duration));
}

bool IRAM_ATTR renderEye(uint8_t eye, uint64_t now, uint64_t sessionElapsedUs) {
  ChannelPlan &channel = schedulePlan.channels[eye];
  ChannelRuntime &runtime = runtimeState[eye];
  const uint64_t delayUs = static_cast<uint64_t>(channel.delayMs) * 1000ULL;
  if (sessionElapsedUs < delayUs || !channel.receivedCount) return false;
  if (!runtime.initialized) {
    runtime.initialized = true;
    runtime.segmentIndex = 0;
    runtime.segmentStartUs = delayUs;
    runtime.segmentEndUs = delayUs + static_cast<uint64_t>(channel.segments[0].durationMs) * 1000ULL;
    runtime.lastUpdateUs = startDeviceUs + delayUs;
    runtime.phase = static_cast<uint32_t>(static_cast<uint64_t>(channel.phaseCentiDeg % 36000) * 0x100000000ULL / 36000ULL);
  }
  while (sessionElapsedUs >= runtime.segmentEndUs) {
    runtime.segmentIndex++;
    if (runtime.segmentIndex >= channel.receivedCount) return false;
    runtime.segmentStartUs = runtime.segmentEndUs;
    runtime.segmentEndUs += static_cast<uint64_t>(channel.segments[runtime.segmentIndex].durationMs) * 1000ULL;
  }
  Segment &segment = channel.segments[runtime.segmentIndex];
  const uint64_t localUs = sessionElapsedUs - runtime.segmentStartUs;
  const uint64_t durationUs = static_cast<uint64_t>(segment.durationMs) * 1000ULL;
  const uint32_t frequency = interpolate(segment.frequencyStart, segment.frequencyEnd, localUs, durationUs);
  const uint32_t duty = interpolate(segment.dutyStart, segment.dutyEnd, localUs, durationUs);
  const uint32_t intensity = interpolate(segment.intensityStart, segment.intensityEnd, localUs, durationUs);
  const uint64_t deltaUs = now > runtime.lastUpdateUs ? now - runtime.lastUpdateUs : 0;
  runtime.lastUpdateUs = now;
  if (frequency) {
    const uint64_t increment = static_cast<uint64_t>(frequency) * deltaUs * 0x100000000ULL / 100000000ULL;
    runtime.phase += static_cast<uint32_t>(increment);
  }
  return frequency >= 50 && intensity > 0 && static_cast<uint8_t>(runtime.phase >> 24) < duty;
}

void IRAM_ATTR schedulerInterrupt() {
  const uint64_t now = static_cast<uint64_t>(esp_timer_get_time());
  const uint64_t schedulerGap = lastSchedulerTickUs ? now - lastSchedulerTickUs : 0;
  if ((deviceState == ARMED || deviceState == RUNNING) && schedulerGap > maxSchedulerGapUs) maxSchedulerGapUs = schedulerGap;
  if ((deviceState == ARMED || deviceState == RUNNING) && schedulerGap > 10000) {
    failDarkFromTimer(8);
    lastSchedulerTickUs = now;
    return;
  }
  lastSchedulerTickUs = now;
  if (testUntilUs) {
    if (now >= testUntilUs) {
      testUntilUs = 0;
      testActive = false;
      darkOutputs();
    } else {
      const bool on = ((now - testStartedUs) / testHalfPeriodUs) % 2 == 0;
      setEyeOutputs(on && (testEyeMask & 1), on && (testEyeMask & 2));
    }
  }
  if (deviceState == ARMED) {
    if (static_cast<uint32_t>(now) - lastHeartbeatUs > heartbeatTimeoutUs) {
      failDarkFromTimer(1);
      return;
    }
    if (now >= startDeviceUs) {
      if (!armCommitted) {
        failDarkFromTimer(2);
        return;
      }
      memset(runtimeState, 0, sizeof(runtimeState));
      deviceState = RUNNING;
      asyncOpcode = STATE;
    }
  }
  if (deviceState != RUNNING) return;
  if (static_cast<uint32_t>(now) - lastHeartbeatUs > heartbeatTimeoutUs) {
    failDarkFromTimer(1);
    return;
  }
  if (timelineCorrectionRemainingUs && ++correctionTick >= 5) {
    const int8_t step = timelineCorrectionRemainingUs > 0 ? 1 : -1;
    timelineCorrectionAppliedUs += step;
    timelineCorrectionRemainingUs -= step;
    correctionTick = 0;
  }
  const int64_t correctedElapsed = static_cast<int64_t>(now - startDeviceUs) + timelineCorrectionAppliedUs;
  const uint64_t elapsedUs = correctedElapsed > 0 ? static_cast<uint64_t>(correctedElapsed) : 0;
  if (elapsedUs >= static_cast<uint64_t>(schedulePlan.durationMs) * 1000ULL) {
    darkOutputs();
    schedulePlan.valid = false;
    armCommitted = false;
    deviceState = connected ? CONNECTED : ADVERTISING;
    asyncOpcode = COMPLETE;
    return;
  }
  setEyeOutputs(renderEye(0, now, elapsedUs), renderEye(1, now, elapsedUs));
}

void buildInfoPacket(uint8_t *bytes) {
  buildPacket(bytes, INFO, 0);
  bytes[4] = 1;
  bytes[5] = 0;
  bytes[6] = 0;
  writeU16(bytes + 7, BUILTIN_LED_TEST ? 1 : 0);
  bytes[9] = MAX_SEGMENTS;
  writeU16(bytes + 10, MAX_FREQUENCY_CENTIHZ);
  writeU16(bytes + 12, 250);
  bytes[14] = 2;
  writeU32(bytes + 15, static_cast<uint32_t>(ESP.getEfuseMac()));
  finishPacket(bytes);
}

void sendPacket(uint8_t opcode, uint8_t sequence, const uint8_t *payload = nullptr) {
  if (!connected || !eventCharacteristic) return;
  uint8_t bytes[PACKET_BYTES];
  buildPacket(bytes, opcode, sequence);
  if (payload) memcpy(bytes + 4, payload, PAYLOAD_BYTES);
  finishPacket(bytes);
  eventCharacteristic->setValue(bytes, sizeof(bytes));
  eventCharacteristic->indicate();
}

void sendAck(uint8_t sequence, uint8_t opcode, uint8_t status) {
  uint8_t payload[PAYLOAD_BYTES]{};
  payload[0] = opcode;
  payload[1] = status;
  payload[2] = deviceState;
  writeU64(payload + 3, deviceTimeUs());
  sendPacket(ACK, sequence, payload);
  lastOpcode = opcode;
  lastStatus = status;
}

void updateScheduleCrc(uint8_t opcode, const uint8_t *payload) {
  schedulePlan.runningCrc = crc32Update(schedulePlan.runningCrc, &opcode, 1);
  schedulePlan.runningCrc = crc32Update(schedulePlan.runningCrc, payload, PAYLOAD_BYTES);
}

bool validFrequencyPair(uint16_t start, uint16_t end) {
  if (start == 0 || end == 0) return start == 0 && end == 0;
  return start >= 50 && start <= MAX_FREQUENCY_CENTIHZ && end >= 50 && end <= MAX_FREQUENCY_CENTIHZ;
}

bool validateCompleteSchedule() {
  if ((schedulePlan.runningCrc ^ 0xFFFFFFFFUL) != schedulePlan.expectedCrc) return false;
  for (uint8_t eye = 0; eye < 2; ++eye) {
    const ChannelPlan &channel = schedulePlan.channels[eye];
    if (!channel.loaded || channel.receivedCount != channel.expectedCount) return false;
    uint64_t total = channel.delayMs;
    for (uint8_t index = 0; index < channel.receivedCount; ++index) total += channel.segments[index].durationMs;
    if (total > schedulePlan.durationMs) return false;
  }
  return true;
}

uint8_t processCommand(const uint8_t *bytes) {
  const uint8_t opcode = bytes[2];
  const uint8_t *payload = bytes + 4;
  if (opcode != STOP && !authenticated) return NOT_AUTHENTICATED;
  if (opcode == HELLO || opcode == STATUS_REQUEST) return SUCCESS;
  if (opcode == LOAD_BEGIN) {
    if (deviceState != CONNECTED && deviceState != READY) return BAD_STATE;
    const uint32_t durationMs = readU32(payload + 4);
    const uint8_t leftCount = payload[12];
    const uint8_t rightCount = payload[13];
    if (!readU32(payload) || durationMs < 1000 || durationMs > MAX_SESSION_MS || !leftCount || !rightCount || leftCount > MAX_SEGMENTS || rightCount > MAX_SEGMENTS) return BAD_VALUE;
    clearSchedule();
    schedulePlan.sessionId = readU32(payload);
    schedulePlan.durationMs = durationMs;
    schedulePlan.expectedCrc = readU32(payload + 8);
    schedulePlan.channels[0].expectedCount = leftCount;
    schedulePlan.channels[1].expectedCount = rightCount;
    deviceState = LOADING;
    return SUCCESS;
  }
  if (opcode == LOAD_CHANNEL) {
    if (deviceState != LOADING) return BAD_STATE;
    const uint8_t eye = payload[0];
    if (eye > 1 || schedulePlan.channels[eye].loaded || readU32(payload + 1) > schedulePlan.durationMs || readU16(payload + 5) > 36000 || payload[7] != schedulePlan.channels[eye].expectedCount) return BAD_VALUE;
    ChannelPlan &channel = schedulePlan.channels[eye];
    channel.delayMs = readU32(payload + 1);
    channel.phaseCentiDeg = readU16(payload + 5);
    channel.loaded = true;
    updateScheduleCrc(opcode, payload);
    return SUCCESS;
  }
  if (opcode == LOAD_SEGMENT) {
    if (deviceState != LOADING) return BAD_STATE;
    const uint8_t eye = payload[0];
    const uint8_t index = payload[1];
    if (eye > 1) return BAD_VALUE;
    ChannelPlan &channel = schedulePlan.channels[eye];
    const uint32_t durationMs = readU32(payload + 2);
    const uint16_t frequencyStart = readU16(payload + 6);
    const uint16_t frequencyEnd = readU16(payload + 8);
    if (!channel.loaded || index != channel.receivedCount || index >= channel.expectedCount || durationMs < 1000 || durationMs > 7200000UL ||
        !validFrequencyPair(frequencyStart, frequencyEnd) || payload[10] < 13 || payload[10] > 242 || payload[11] < 13 || payload[11] > 242 ||
        payload[12] > MAX_INTENSITY_BYTE || payload[13] > MAX_INTENSITY_BYTE || payload[14] != 0) return BAD_VALUE;
    channel.segments[index] = {durationMs, frequencyStart, frequencyEnd, payload[10], payload[11], payload[12], payload[13]};
    channel.receivedCount++;
    updateScheduleCrc(opcode, payload);
    return SUCCESS;
  }
  if (opcode == LOAD_COMMIT) {
    if (deviceState != LOADING) return BAD_STATE;
    if (readU32(payload) != schedulePlan.sessionId || readU32(payload + 4) != schedulePlan.expectedCrc || !validateCompleteSchedule()) return BAD_SCHEDULE;
    schedulePlan.valid = true;
    deviceState = READY;
    return SUCCESS;
  }
  if (opcode == ARM) {
    if (deviceState != READY || !schedulePlan.valid) return BAD_STATE;
    if (readU32(payload) != schedulePlan.sessionId) return BAD_SESSION;
    const uint64_t requestedStart = readU64(payload + 4);
    const uint64_t now = deviceTimeUs();
    const uint16_t timeoutMs = readU16(payload + 12);
    if (requestedStart < now + 1000000ULL || requestedStart > now + 10000000ULL || timeoutMs < 3000 || timeoutMs > 5000) return TOO_LATE;
    if (!startScheduler()) return INTERNAL_ERROR;
    portENTER_CRITICAL(&stateMux);
    startDeviceUs = requestedStart;
    heartbeatTimeoutUs = static_cast<uint32_t>(timeoutMs) * 1000UL;
    lastHeartbeatUs = static_cast<uint32_t>(now);
    armCommitted = false;
    deviceState = ARMED;
    maxSchedulerGapUs = 0;
    timelineCorrectionAppliedUs = 0;
    timelineCorrectionRemainingUs = 0;
    correctionTick = 0;
    portEXIT_CRITICAL(&stateMux);
    return SUCCESS;
  }
  if (opcode == COMMIT) {
    if (deviceState != ARMED || readU32(payload) != schedulePlan.sessionId) return BAD_STATE;
    if (startDeviceUs < deviceTimeUs() + 500000ULL) return TOO_LATE;
    portENTER_CRITICAL(&stateMux);
    armCommitted = true;
    lastHeartbeatUs = static_cast<uint32_t>(deviceTimeUs());
    portEXIT_CRITICAL(&stateMux);
    return SUCCESS;
  }
  if (opcode == HEARTBEAT) {
    if ((deviceState != ARMED && deviceState != RUNNING) || readU32(payload) != schedulePlan.sessionId) return BAD_STATE;
    portENTER_CRITICAL(&stateMux);
    lastHeartbeatUs = static_cast<uint32_t>(deviceTimeUs());
    portEXIT_CRITICAL(&stateMux);
    return SUCCESS;
  }
  if (opcode == ADJUST) {
    if (deviceState != RUNNING || readU32(payload) != schedulePlan.sessionId) return BAD_STATE;
    const int32_t correctionUs = static_cast<int32_t>(readU32(payload + 4));
    if (correctionUs < -20000 || correctionUs > 20000) return BAD_VALUE;
    portENTER_CRITICAL(&stateMux);
    timelineCorrectionRemainingUs = correctionUs;
    portEXIT_CRITICAL(&stateMux);
    return SUCCESS;
  }
  if (opcode == STOP) {
    portENTER_CRITICAL(&stateMux);
    darkOutputs();
    testUntilUs = 0;
    testActive = false;
    armCommitted = false;
    clearSchedule();
    deviceState = connected ? CONNECTED : ADVERTISING;
    portEXIT_CRITICAL(&stateMux);
    return SUCCESS;
  }
  if (opcode == TEST) {
    if (deviceState != CONNECTED && deviceState != READY) return BAD_STATE;
    const uint8_t eyes = payload[0];
    const uint16_t frequency = readU16(payload + 1);
    const uint16_t durationMs = readU16(payload + 3);
    if (!(eyes & 3) || frequency < 100 || frequency > 500 || durationMs < 250 || durationMs > 1500 || payload[5] > 26) return BAD_VALUE;
    const uint64_t now = deviceTimeUs();
    testEyeMask = eyes & 3;
    testHalfPeriodUs = 50000000UL / frequency;
    testStartedUs = now;
    testUntilUs = now + static_cast<uint64_t>(durationMs) * 1000ULL;
    testActive = true;
    if (!startScheduler()) {
      testUntilUs = 0;
      testActive = false;
      return INTERNAL_ERROR;
    }
    return SUCCESS;
  }
  return BAD_VALUE;
}

void handlePacket(const QueuedPacket &packet) {
  const bool valid = validPacket(packet.bytes, packet.length);
  const uint8_t sequence = packet.length > 3 ? packet.bytes[3] : 0;
  const uint8_t opcode = packet.length > 2 ? packet.bytes[2] : 0;
  if (!valid) {
    if (deviceState == ARMED || deviceState == RUNNING) failDark(3);
    sendAck(sequence, opcode, BAD_PACKET);
    return;
  }
  if (haveSequence) {
    if (sequence == lastSequence && opcode == lastOpcode) {
      sendAck(sequence, opcode, lastStatus);
      return;
    }
    if (sequence != static_cast<uint8_t>(lastSequence + 1)) {
      if (deviceState == ARMED || deviceState == RUNNING) failDark(4);
      sendAck(sequence, opcode, BAD_SEQUENCE);
      return;
    }
  }
  haveSequence = true;
  lastSequence = sequence;
  if (opcode == SYNC) {
    if (!authenticated) {
      sendAck(sequence, opcode, NOT_AUTHENTICATED);
      return;
    }
    uint8_t payload[PAYLOAD_BYTES]{};
    writeU64(payload, deviceTimeUs());
    sendPacket(SYNC_REPLY, sequence, payload);
    lastOpcode = opcode;
    lastStatus = SUCCESS;
    return;
  }
  const uint8_t status = processCommand(packet.bytes);
  if (status != SUCCESS && (deviceState == ARMED || deviceState == RUNNING) && opcode != STOP) failDark(5);
  sendAck(sequence, opcode, status);
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *) override {
    connected = true;
    restartAdvertising = false;
    authenticated = false;
    haveSequence = false;
    darkOutputs();
    deviceState = CONNECTED;
  }
  void onDisconnect(BLEServer *) override {
    portENTER_CRITICAL(&stateMux);
    connected = false;
    authenticated = false;
    armCommitted = false;
    testUntilUs = 0;
    testActive = false;
    darkOutputs();
    clearSchedule();
    deviceState = ADVERTISING;
    restartAdvertising = true;
    portEXIT_CRITICAL(&stateMux);
  }
};

class SecurityCallbacks : public BLESecurityCallbacks {
  bool onSecurityRequest() override { return true; }
  void onAuthenticationComplete(esp_ble_auth_cmpl_t result) override {
    authenticated = result.success;
    if (!result.success) failDark(6);
  }
};

class ControlCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    const String value = characteristic->getValue();
    QueuedPacket packet{};
    packet.length = min(static_cast<size_t>(255), value.length());
    const size_t copied = min(value.length(), static_cast<size_t>(PACKET_BYTES));
    memcpy(packet.bytes, value.c_str(), copied);
    if (xQueueSend(commandQueue, &packet, 0) != pdTRUE) queueOverflow = true;
  }
};

uint32_t loadOrCreatePasskey() {
  preferences.begin("entrainment", false);
  uint32_t passkey = preferences.getUInt("pairing", 0);
  if (passkey < 100000 || passkey > 999999) {
    passkey = 100000 + esp_random() % 900000;
    preferences.putUInt("pairing", passkey);
  }
  preferences.end();
  return passkey;
}

void removeAllBonds() {
  int count = esp_ble_get_bond_device_num();
  if (count <= 0) return;
  esp_ble_bond_dev_t *devices = static_cast<esp_ble_bond_dev_t *>(malloc(sizeof(esp_ble_bond_dev_t) * count));
  if (!devices) return;
  int found = count;
  if (esp_ble_get_bond_device_list(&found, devices) == ESP_OK) {
    for (int index = 0; index < found; ++index) esp_ble_remove_bond_device(devices[index].bd_addr);
  }
  free(devices);
}

void setup() {
  pinMode(BUILTIN_LED_PIN, OUTPUT);
  pinMode(LEFT_LED_PIN, OUTPUT);
  pinMode(RIGHT_LED_PIN, OUTPUT);
  pinMode(BOND_RESET_PIN, INPUT_PULLUP);
  darkOutputs();
  Serial.begin(115200);
  clearSchedule();
  commandQueue = xQueueCreate(8, sizeof(QueuedPacket));
  waveTimer = timerBegin(TIMER_HZ);
  timerAttachInterrupt(waveTimer, &schedulerInterrupt);
  timerAlarm(waveTimer, SCHEDULER_TICK_US, true, 0);
  timerStop(waveTimer);

  BLEDevice::init(DEVICE_NAME);
  if (digitalRead(BOND_RESET_PIN) == LOW) removeAllBonds();
  BLESecurity *security = new BLESecurity();
#if DEV_PASSKEY_PAIRING
  const uint32_t passkey = loadOrCreatePasskey();
  security->setPassKey(true, passkey);
  security->setCapability(ESP_IO_CAP_OUT);
  security->setAuthenticationMode(true, true, true);
#else
  // Consumer pairing: LE Secure Connections "Just Works". Encrypted and bonded,
  // no PIN prompt; phones pair from the Chrome device picker without a code.
  security->setCapability(ESP_IO_CAP_NONE);
  security->setAuthenticationMode(true, false, true);
#endif
  BLEDevice::setSecurityCallbacks(new SecurityCallbacks());

  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());
  bleServer->advertiseOnDisconnect(false);
  BLEService *service = bleServer->createService(SERVICE_UUID);
  infoCharacteristic = service->createCharacteristic(INFO_UUID, BLECharacteristic::PROPERTY_READ);
  uint8_t info[PACKET_BYTES];
  buildInfoPacket(info);
  infoCharacteristic->setValue(info, sizeof(info));
  infoCharacteristic->setAccessPermissions(ESP_GATT_PERM_READ);
  BLECharacteristic *control = service->createCharacteristic(CONTROL_UUID, BLECharacteristic::PROPERTY_WRITE);
  control->setCallbacks(new ControlCallbacks());
  control->setAccessPermissions(SECURE_WRITE_PERMISSION);
  eventCharacteristic = service->createCharacteristic(EVENT_UUID, BLECharacteristic::PROPERTY_INDICATE);
  eventCharacteristic->setAccessPermissions(SECURE_READ_PERMISSION);
  BLE2902 *descriptor = new BLE2902();
  descriptor->setAccessPermissions(SECURE_READ_PERMISSION | SECURE_WRITE_PERMISSION);
  eventCharacteristic->addDescriptor(descriptor);
  service->start();
  bleAdvertising = bleServer->getAdvertising();
  bleAdvertising->addServiceUUID(SERVICE_UUID);
  bleAdvertising->setScanResponse(true);
  startAdvertising(false);
  deviceState = ADVERTISING;
  setCpuFrequencyMhz(IDLE_CPU_MHZ);

  Serial.printf("Ready: %s firmware 1.0.0\n", DEVICE_NAME);
#if DEV_PASSKEY_PAIRING
  Serial.printf("Unique pairing code: %06lu\n", static_cast<unsigned long>(passkey));
#else
  Serial.println("Pairing: Just Works (no PIN)");
#endif
  Serial.println(BUILTIN_LED_TEST ? "Output: GPIO2 development mirror (do not wear)" : "Output: GPIO18 left, GPIO19 right");
  Serial.println("Power: 80 MHz while disconnected; 240 MHz after connection; 2 kHz scheduler only while active");
  Serial.println("Advertising: 100-200 ms for 60 s, then 750-1000 ms");
  Serial.println("Hold BOOT while resetting to remove bonded phones.");
}

void loop() {
  QueuedPacket packet;
  const bool received = xQueueReceive(commandQueue, &packet, LOOP_IDLE_TICKS) == pdTRUE;
  updatePowerMode();
  if (queueOverflow) {
    queueOverflow = false;
    failDark(7);
  }
  if (received) handlePacket(packet);
  while (xQueueReceive(commandQueue, &packet, 0) == pdTRUE) handlePacket(packet);
  uint8_t event = 0;
  uint8_t faultCode = 0;
  portENTER_CRITICAL(&stateMux);
  if (asyncOpcode) {
    event = asyncOpcode;
    faultCode = asyncFaultCode;
    asyncOpcode = 0;
  }
  portEXIT_CRITICAL(&stateMux);
  if (event == STATE) {
    uint8_t payload[PAYLOAD_BYTES]{};
    payload[0] = deviceState;
    sendPacket(STATE, 0, payload);
  } else if (event == COMPLETE) {
    uint8_t payload[PAYLOAD_BYTES]{};
    writeU32(payload, maxSchedulerGapUs);
    sendPacket(COMPLETE, 0, payload);
  } else if (event == FAULT_EVENT) {
    uint8_t payload[PAYLOAD_BYTES]{};
    payload[0] = faultCode;
    sendPacket(FAULT_EVENT, 0, payload);
  }
  updatePowerMode();
  updateAdvertising();
}
