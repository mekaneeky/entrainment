const assert = require("assert");
const fs = require("fs");
const { parseProfileFile } = require("./core");
const {
  GogglesController,
  OP,
  CALIBRATION,
  crc8,
  finishCrc32,
  packet,
  readPacket,
  serializeVisualSchedule,
  analyzeFlashLatency,
  calibrationVisual,
} = require("./goggles");

const profile = parseProfileFile(fs.readFileSync(`${__dirname}/profile.visual.example.json`, "utf8"));
const schedule = serializeVisualSchedule(profile.visual);
assert.equal(schedule.definitions.length, 4);
assert.equal(schedule.definitions[0].opcode, OP.LOAD_CHANNEL);
assert.equal(schedule.definitions[1].opcode, OP.LOAD_SEGMENT);
assert.equal(schedule.checksum, finishCrc32(schedule.definitions.reduce((crc, definition) => {
  const bytes = new Uint8Array([definition.opcode, ...definition.payload]);
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return crc >>> 0;
}, 0xffffffff)));

const valid = packet(OP.HELLO, 9);
assert.equal(valid.length, 20);
assert.equal(crc8(valid, 19), valid[19]);
assert.equal(readPacket(valid)[3], 9);
const corrupted = valid.slice();
corrupted[8] ^= 1;
assert.throws(() => readPacket(corrupted), /invalid BLE packet/);

const fakeClock = { value: 0, now() { this.value += 1; return this.value; } };
const timers = {
  setTimeout,
  clearTimeout,
  setInterval() { return 1; },
  clearInterval() {},
};
const controller = new GogglesController({ bluetooth: null, clock: fakeClock, timers });
const writes = [];
controller.device = { gatt: { connected: true } };
controller.events = {};
controller.info = { maxSegmentsPerEye: 128, maxFrequencyHz: 45, maxIntensity: 0.25 };
controller.control = {
  async writeValueWithResponse(bytes) {
    writes.push(bytes.slice());
    const payload = new Uint8Array(15);
    const data = new DataView(payload.buffer);
    let responseOpcode = OP.ACK;
    if (bytes[2] === OP.SYNC) {
      responseOpcode = OP.SYNC_REPLY;
      data.setBigUint64(0, BigInt(1000000 + fakeClock.value * 1000), true);
    } else {
      payload[0] = bytes[2];
      payload[1] = 0;
      payload[2] = 4;
    }
    controller.onEvent(new DataView(packet(responseOpcode, bytes[3], payload).buffer));
  },
};

(async () => {
  await controller.loadSchedule(profile.visual, profile.durationSec);
  assert.deepEqual(writes.slice(0, 7).map((bytes) => bytes[2]), [
    OP.LOAD_BEGIN,
    OP.LOAD_CHANNEL,
    OP.LOAD_SEGMENT,
    OP.LOAD_CHANNEL,
    OP.LOAD_SEGMENT,
    OP.LOAD_COMMIT,
  ]);
  const model = await controller.synchronize(3);
  assert.ok(model.uncertaintyMs <= 1);
  const ordinaryBleClock = { value: 0, now() { this.value += 120; return this.value; } };
  const ordinaryBleController = new GogglesController({ bluetooth: null, clock: ordinaryBleClock, timers });
  ordinaryBleController.send = async () => ({ deviceUs: ordinaryBleClock.value * 1000 });
  assert.equal((await ordinaryBleController.synchronize(3)).uncertaintyMs, 60, "ordinary BLE jitter must not abort scheduling");
  const unstableBleClock = { value: 0, now() { this.value += 220; return this.value; } };
  const unstableBleController = new GogglesController({ bluetooth: null, clock: unstableBleClock, timers });
  unstableBleController.send = async () => ({ deviceUs: unstableBleClock.value * 1000 });
  await assert.rejects(() => unstableBleController.synchronize(3), /too unstable/);
  let heartbeatTick;
  const heartbeatOps = [];
  const heartbeatController = new GogglesController({
    bluetooth: null,
    clock: fakeClock,
    timers: { ...timers, setInterval(callback) { heartbeatTick = callback; return 1; } },
  });
  heartbeatController.device = { gatt: { connected: true } };
  heartbeatController.control = {};
  heartbeatController.events = {};
  heartbeatController.sessionId = 7;
  heartbeatController.send = async (opcode) => heartbeatOps.push(opcode);
  heartbeatController.startHeartbeat();
  for (let count = 0; count < 31; count += 1) await heartbeatTick();
  heartbeatController.stopHeartbeat();
  assert.deepEqual(heartbeatOps, Array(31).fill(OP.HEARTBEAT), "heartbeats must not trigger noisy mid-session resynchronization");
  const start = fakeClock.now() + 2000;
  await controller.arm(start);
  await controller.commit();
  controller.referenceElapsedUs = () => 3001000;
  controller.startDeviceUs = 1000000;
  controller.synchronize = async () => controller.clockModel;
  controller.deviceTimeForPerformance = () => 4000000;
  await controller.correctDrift();
  await controller.stop();
  assert.equal(controller.state, "ready");
  assert.ok(writes.some((bytes) => bytes[2] === OP.ARM));
  const adjustment = writes.find((bytes) => bytes[2] === OP.ADJUST);
  assert.ok(adjustment, "expected a bounded running clock correction");
  assert.equal(new DataView(adjustment.buffer, adjustment.byteOffset).getInt32(8, true), 1000);
  assert.ok(writes.some((bytes) => bytes[2] === OP.STOP));
  console.log("goggles protocol tests passed");

  const labController = new GogglesController({ bluetooth: null, clock: { now: () => 5000 }, timers });
  const labWrites = [];
  labController.device = { gatt: { connected: true } };
  labController.events = {};
  labController.info = { maxSegmentsPerEye: 128 };
  labController.control = {
    async writeValueWithResponse(bytes) {
      labWrites.push(bytes.slice());
      const payload = new Uint8Array(15);
      payload[0] = bytes[2];
      payload[1] = 0;
      payload[2] = 4;
      labController.onEvent(new DataView(packet(OP.ACK, bytes[3], payload).buffer));
    },
  };
  labController.deviceTimeForPerformance = (ms) => ms * 1000;
  assert.equal(labController.flashLatencyMs, 0);
  labController.setFlashLatency(25);
  await labController.arm(8000);
  const armWrite = labWrites.find((bytes) => bytes[2] === OP.ARM);
  const armView = new DataView(armWrite.buffer, armWrite.byteOffset);
  assert.equal(armView.getBigUint64(8, true), BigInt(7975000), "arm must start the device early by the measured flash latency");
  assert.equal(labController.compensationUs, 25000);
  labController.startDeviceUs = 7975000;
  labController.referenceElapsedUs = () => 3000000;
  labController.synchronize = async () => labController.clockModel;
  labController.deviceTimeForPerformance = () => 7975000 + 3025000;
  await labController.correctDrift();
  assert.ok(!labWrites.some((bytes) => bytes[2] === OP.ADJUST), "compensated drift math must not fight the flash latency offset");
  labController.deviceTimeForPerformance = () => 7975000 + 3010000;
  await labController.correctDrift();
  const labAdjustment = labWrites.filter((bytes) => bytes[2] === OP.ADJUST).at(-1);
  assert.ok(labAdjustment, "expected a correction when the compensation is missing from the reference");
  assert.equal(new DataView(labAdjustment.buffer, labAdjustment.byteOffset).getInt32(8, true), 15000);
  assert.throws(() => labController.setFlashLatency(-1), /0-250/);
  assert.throws(() => labController.setFlashLatency(251), /0-250/);

  const calibrationSchedule = serializeVisualSchedule(calibrationVisual(0.4));
  const deviceCappedSchedule = serializeVisualSchedule(calibrationVisual(), 0.25);
  assert.equal(CALIBRATION.durationSec, 8, "the app must be able to read the camera calibration duration");
  assert.deepEqual(calibrationSchedule.definitions.map((definition) => definition.opcode), [OP.LOAD_CHANNEL, OP.LOAD_SEGMENT, OP.LOAD_CHANNEL, OP.LOAD_SEGMENT]);
  assert.equal(calibrationSchedule.definitions[1].payload[12], Math.round(0.4 * 255));
  assert.equal(deviceCappedSchedule.definitions[1].payload[12], Math.round(0.25 * 255), "normalized intensity must be scaled by the characterized device ceiling");

  const startMs = 100000;
  const square = [];
  for (let tMs = startMs - 200; tMs <= startMs + 8500; tMs += 16) {
    const sessionMs = ((tMs - startMs - 12) % 200 + 200) % 200;
    square.push({ tMs, luma: sessionMs < 50 ? 160 : 20 });
  }
  const measured = analyzeFlashLatency(square, { startPerformanceMs: startMs });
  assert.ok(Math.abs(measured.latencyMs - 12) <= 4, `expected ~12 ms latency, got ${measured.latencyMs}`);
  assert.ok(measured.onsets >= 38 && measured.matched >= 35);
  assert.throws(() => analyzeFlashLatency(square.slice(0, 4), { startPerformanceMs: startMs }), /Not enough camera frames/);
  assert.throws(() => analyzeFlashLatency(square.map((sample) => ({ ...sample, luma: 90 })), { startPerformanceMs: startMs }), /visible enough/);
  console.log("goggles calibration tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
