(function attachGoggles(root) {
  "use strict";

  const SERVICE_UUID = "7b5d1001-7f4b-4c7f-9d25-20f8c4f3a001";
  const INFO_UUID = "7b5d1002-7f4b-4c7f-9d25-20f8c4f3a001";
  const CONTROL_UUID = "7b5d1003-7f4b-4c7f-9d25-20f8c4f3a001";
  const EVENT_UUID = "7b5d1004-7f4b-4c7f-9d25-20f8c4f3a001";
  const MAGIC = 0xe7;
  const VERSION = 1;
  const PACKET_BYTES = 20;
  const MAX_CLOCK_UNCERTAINTY_MS = 100;

  const OP = Object.freeze({
    INFO: 0x01,
    HELLO: 0x02,
    LOAD_BEGIN: 0x10,
    LOAD_CHANNEL: 0x11,
    LOAD_SEGMENT: 0x12,
    LOAD_COMMIT: 0x13,
    SYNC: 0x20,
    ARM: 0x21,
    COMMIT: 0x22,
    ADJUST: 0x23,
    HEARTBEAT: 0x24,
    STOP: 0x25,
    TEST: 0x26,
    STATUS: 0x27,
    ACK: 0x80,
    SYNC_REPLY: 0x81,
    STATE: 0x82,
    FAULT: 0x83,
    COMPLETE: 0x84,
  });

  const DEVICE_STATES = ["boot", "advertising", "connected", "loading", "ready", "armed", "running", "fault"];

  function crc8(bytes, length = bytes.length) {
    let crc = 0;
    for (let index = 0; index < length; index += 1) {
      crc ^= bytes[index];
      for (let bit = 0; bit < 8; bit += 1) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
    return crc;
  }

  function crc32(bytes, seed = 0xffffffff) {
    let crc = seed >>> 0;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return crc >>> 0;
  }

  function finishCrc32(crc) { return (crc ^ 0xffffffff) >>> 0; }

  function packet(opcode, sequence, payload = new Uint8Array()) {
    if (payload.length > 15) throw new RangeError("BLE packet payload exceeds 15 bytes");
    const bytes = new Uint8Array(PACKET_BYTES);
    bytes[0] = MAGIC;
    bytes[1] = VERSION;
    bytes[2] = opcode;
    bytes[3] = sequence & 0xff;
    bytes.set(payload, 4);
    bytes[19] = crc8(bytes, 19);
    return bytes;
  }

  function readPacket(value) {
    const bytes = value instanceof Uint8Array
      ? value
      : new Uint8Array(value.buffer, value.byteOffset ?? 0, value.byteLength);
    if (bytes.length !== PACKET_BYTES || bytes[0] !== MAGIC || bytes[1] !== VERSION || crc8(bytes, 19) !== bytes[19]) {
      throw new Error("Goggles sent an invalid BLE packet");
    }
    return bytes;
  }

  function view(payload) { return new DataView(payload.buffer, payload.byteOffset, payload.byteLength); }
  function writeUint64(dataView, offset, value) { dataView.setBigUint64(offset, BigInt(Math.round(value)), true); }
  function readUint64(dataView, offset) { return Number(dataView.getBigUint64(offset, true)); }

  function makePayload(fill) {
    const payload = new Uint8Array(15);
    fill(view(payload), payload);
    return payload;
  }

  function quantize(value, scale, max) { return Math.max(0, Math.min(max, Math.round(value * scale))); }

  function serializeVisualSchedule(visual, intensityScale = 1) {
    const definitions = [];
    for (const [eye, side] of [[0, "left"], [1, "right"]]) {
      const channel = visual.channels[side];
      definitions.push({
        opcode: OP.LOAD_CHANNEL,
        payload: makePayload((data) => {
          data.setUint8(0, eye);
          data.setUint32(1, Math.round(channel.delaySec * 1000), true);
          data.setUint16(5, quantize(channel.phaseDeg, 100, 36000), true);
          data.setUint8(7, channel.segments.length);
        }),
      });
      channel.segments.forEach((segment, index) => definitions.push({
        opcode: OP.LOAD_SEGMENT,
        payload: makePayload((data) => {
          data.setUint8(0, eye);
          data.setUint8(1, index);
          data.setUint32(2, Math.round(segment.durationSec * 1000), true);
          data.setUint16(6, quantize(segment.pulseHz, 100, 4500), true);
          data.setUint16(8, quantize(segment.pulseHzEnd, 100, 4500), true);
          data.setUint8(10, quantize(segment.duty, 255, 255));
          data.setUint8(11, quantize(segment.dutyEnd, 255, 255));
          data.setUint8(12, quantize(segment.intensity * intensityScale, 255, 255));
          data.setUint8(13, quantize(segment.intensityEnd * intensityScale, 255, 255));
          data.setUint8(14, 0);
        }),
      }));
    }
    let checksum = 0xffffffff;
    for (const definition of definitions) checksum = crc32(new Uint8Array([definition.opcode, ...definition.payload]), checksum);
    return { definitions, checksum: finishCrc32(checksum) };
  }

  const BaseEventTarget = root.EventTarget || class {
    addEventListener() {}
    dispatchEvent() {}
  };

  class GogglesController extends BaseEventTarget {
    constructor({ bluetooth = root.navigator?.bluetooth, clock = root.performance, timers = root } = {}) {
      super();
      this.bluetooth = bluetooth;
      this.clock = clock;
      this.timers = timers;
      this.device = null;
      this.server = null;
      this.control = null;
      this.events = null;
      this.info = null;
      this.state = "disconnected";
      this.sequence = 0;
      this.pending = new Map();
      this.sessionId = 0;
      this.clockModel = null;
      this.clockHistory = [];
      this.heartbeatTimer = null;
      this.heartbeatBusy = false;
      this.referenceElapsedUs = null;
      this.startPerformanceMs = 0;
      this.startDeviceUs = 0;
      this.flashLatencyMs = 0;
      this.compensationUs = 0;
      this.intentionalDisconnect = false;
      this.handleEvent = (event) => this.onEvent(event.target.value);
      this.handleDisconnect = () => this.onDisconnect();
    }

    get connected() { return Boolean(this.device?.gatt?.connected && this.control && this.events); }

    emit(type, detail = {}) {
      const event = root.CustomEvent ? new root.CustomEvent(type, { detail }) : Object.assign(new Event(type), { detail });
      this.dispatchEvent(event);
    }

    setState(state, detail = {}) {
      this.state = state;
      this.emit("statechange", { state, ...detail });
    }

    fail(error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.setState("fault", { message: failure.message });
      this.emit("fault", { error: failure });
      return failure;
    }

    async connect() {
      if (this.connected) return this.info;
      if (!this.bluetooth?.requestDevice) throw new Error("Web Bluetooth is unavailable. Use Chrome on Android over HTTPS.");
      this.setState("connecting");
      try {
        this.device = await this.bluetooth.requestDevice({ filters: [{ services: [SERVICE_UUID] }] });
        this.device.addEventListener("gattserverdisconnected", this.handleDisconnect);
        this.server = await this.device.gatt.connect();
        const service = await this.server.getPrimaryService(SERVICE_UUID);
        const infoCharacteristic = await service.getCharacteristic(INFO_UUID);
        this.control = await service.getCharacteristic(CONTROL_UUID);
        this.events = await service.getCharacteristic(EVENT_UUID);
        this.info = this.parseInfo(await infoCharacteristic.readValue());
        this.events.addEventListener("characteristicvaluechanged", this.handleEvent);
        await this.events.startNotifications();
        await this.send(OP.HELLO);
        this.setState("ready", { info: this.info });
        return this.info;
      } catch (error) {
        this.disconnect();
        throw this.fail(error);
      }
    }

    parseInfo(value) {
      const bytes = readPacket(value);
      if (bytes[2] !== OP.INFO) throw new Error("Connected device is not supported goggles");
      const data = new DataView(bytes.buffer, bytes.byteOffset + 4, 15);
      const info = {
        firmware: `${data.getUint8(0)}.${data.getUint8(1)}.${data.getUint8(2)}`,
        flags: data.getUint16(3, true),
        maxSegmentsPerEye: data.getUint8(5),
        maxFrequencyHz: data.getUint16(6, true) / 100,
        maxIntensity: data.getUint16(8, true) / 1000,
        channels: data.getUint8(10),
        deviceId: data.getUint32(11, true).toString(16).padStart(8, "0"),
      };
      if (info.maxSegmentsPerEye < 1 || info.channels < 1 || info.maxFrequencyHz < 1 || info.maxIntensity <= 0 || info.maxIntensity > 1) throw new Error("Goggles reported invalid capabilities");
      info.developmentOutput = Boolean(info.flags & 1);
      return info;
    }

    onDisconnect() {
      this.stopHeartbeat();
      for (const pending of this.pending.values()) pending.reject(new Error("Goggles disconnected"));
      this.pending.clear();
      this.control = null;
      this.events = null;
      const wasIntentional = this.intentionalDisconnect;
      this.intentionalDisconnect = false;
      this.setState("disconnected");
      if (!wasIntentional) this.emit("fault", { error: new Error("Goggles disconnected") });
    }

    disconnect() {
      this.stopHeartbeat();
      if (this.events) this.events.removeEventListener("characteristicvaluechanged", this.handleEvent);
      if (this.device?.gatt?.connected) {
        this.intentionalDisconnect = true;
        this.device.gatt.disconnect();
      }
      this.control = null;
      this.events = null;
      this.setState("disconnected");
    }

    onEvent(value) {
      let bytes;
      try { bytes = readPacket(value); } catch (error) { this.fail(error); return; }
      const opcode = bytes[2];
      const sequence = bytes[3];
      const data = new DataView(bytes.buffer, bytes.byteOffset + 4, 15);
      const pending = this.pending.get(sequence);
      if (opcode === OP.ACK && pending) {
        const status = data.getUint8(1);
        this.pending.delete(sequence);
        if (status !== 0) pending.reject(new Error(`Goggles rejected command ${data.getUint8(0)} (error ${status})`));
        else if (pending.expected !== OP.ACK) pending.reject(new Error(`Goggles returned an unexpected acknowledgement for command ${data.getUint8(0)}`));
        else pending.resolve({ state: DEVICE_STATES[data.getUint8(2)] ?? "unknown" });
        return;
      }
      if (opcode === OP.SYNC_REPLY && pending) {
        if (pending.expected !== OP.SYNC_REPLY) {
          this.pending.delete(sequence);
          pending.reject(new Error("Goggles returned an unexpected clock response"));
          return;
        }
        this.pending.delete(sequence);
        pending.resolve({ deviceUs: readUint64(data, 0) });
        return;
      }
      if (opcode === OP.STATE) {
        this.setState(DEVICE_STATES[data.getUint8(0)] ?? "unknown");
      } else if (opcode === OP.FAULT) {
        this.fail(new Error(`Goggles fault ${data.getUint8(0)}`));
      } else if (opcode === OP.COMPLETE) {
        this.stopHeartbeat();
        this.setState("ready");
        this.emit("complete", { maxSchedulerGapUs: data.getUint32(0, true) });
      }
    }

    send(opcode, payload, expected = OP.ACK, timeoutMs = 2500) {
      if (!this.connected) return Promise.reject(new Error("Goggles are not connected"));
      const sequence = this.sequence = (this.sequence + 1) & 0xff;
      const bytes = packet(opcode, sequence, payload);
      return new Promise((resolve, reject) => {
        const timeout = this.timers.setTimeout(() => {
          this.pending.delete(sequence);
          reject(new Error(`Goggles did not acknowledge command ${opcode}`));
        }, timeoutMs);
        this.pending.set(sequence, {
          expected,
          resolve: (result) => { this.timers.clearTimeout(timeout); resolve(result); },
          reject: (error) => { this.timers.clearTimeout(timeout); reject(error); },
        });
        this.control.writeValueWithResponse(bytes).catch((error) => {
          const pending = this.pending.get(sequence);
          if (!pending) return;
          this.pending.delete(sequence);
          pending.reject(error);
        });
      });
    }

    async loadSchedule(visual, durationSec) {
      if (!this.connected) throw new Error("Connect goggles before loading a visual session");
      const counts = [visual.channels.left.segments.length, visual.channels.right.segments.length];
      if (counts.some((count) => count > this.info.maxSegmentsPerEye)) throw new Error("Visual session exceeds the goggles segment limit");
      for (const channel of Object.values(visual.channels)) {
        for (const segment of channel.segments) {
          if (Math.max(segment.pulseHz, segment.pulseHzEnd) > this.info.maxFrequencyHz) throw new Error("Visual session exceeds the goggles frequency limit");
          if (Math.min(segment.intensity, segment.intensityEnd) < 0 || Math.max(segment.intensity, segment.intensityEnd) > 1) throw new Error("Visual intensity must be between 0 and 1");
        }
      }
      const { definitions, checksum } = serializeVisualSchedule(visual, this.info.maxIntensity);
      this.sessionId = root.crypto.getRandomValues(new Uint32Array(1))[0] || 1;
      this.setState("loading");
      await this.send(OP.LOAD_BEGIN, makePayload((data) => {
        data.setUint32(0, this.sessionId, true);
        data.setUint32(4, Math.round(durationSec * 1000), true);
        data.setUint32(8, checksum, true);
        data.setUint8(12, counts[0]);
        data.setUint8(13, counts[1]);
      }));
      for (const definition of definitions) await this.send(definition.opcode, definition.payload);
      await this.send(OP.LOAD_COMMIT, makePayload((data) => {
        data.setUint32(0, this.sessionId, true);
        data.setUint32(4, checksum, true);
      }));
      this.setState("ready");
    }

    async synchronize(probes = 8) {
      const samples = [];
      for (let index = 0; index < probes; index += 1) {
        const before = this.clock.now();
        const result = await this.send(OP.SYNC, undefined, OP.SYNC_REPLY);
        const after = this.clock.now();
        samples.push({ midpointMs: (before + after) / 2, deviceUs: result.deviceUs, rttMs: after - before });
      }
      const best = [...samples].sort((a, b) => a.rttMs - b.rttMs).slice(0, Math.min(3, samples.length));
      const chosen = best.sort((a, b) => a.deviceUs - a.midpointMs * 1000 - (b.deviceUs - b.midpointMs * 1000))[Math.floor(best.length / 2)];
      this.clockHistory.push(chosen);
      this.clockHistory = this.clockHistory.slice(-8);
      let slope = 1000;
      const first = this.clockHistory[0];
      const last = this.clockHistory.at(-1);
      if (last.midpointMs - first.midpointMs > 10000) {
        slope = (last.deviceUs - first.deviceUs) / (last.midpointMs - first.midpointMs);
        slope = Math.max(999.5, Math.min(1000.5, slope));
      }
      this.clockModel = { performanceMs: chosen.midpointMs, deviceUs: chosen.deviceUs, deviceUsPerMs: slope, uncertaintyMs: chosen.rttMs / 2 };
      if (this.clockModel.uncertaintyMs > MAX_CLOCK_UNCERTAINTY_MS) throw new Error("Bluetooth timing is too unstable to schedule the goggles");
      return { ...this.clockModel };
    }

    deviceTimeForPerformance(performanceMs) {
      if (!this.clockModel) throw new Error("Goggles clock is not synchronized");
      return this.clockModel.deviceUs + (performanceMs - this.clockModel.performanceMs) * this.clockModel.deviceUsPerMs;
    }

    setFlashLatency(ms) {
      const value = Math.round(Number(ms));
      if (!Number.isFinite(value) || value < 0 || value > 250) throw new RangeError("Flash latency must be 0-250 ms");
      this.flashLatencyMs = value;
      return value;
    }

    async arm(startPerformanceMs) {
      const latencyUs = Math.round(this.flashLatencyMs * 1000);
      const startDeviceUs = this.deviceTimeForPerformance(startPerformanceMs) - latencyUs;
      const deviceNowUs = this.deviceTimeForPerformance(this.clock.now());
      if (startDeviceUs - deviceNowUs < 1000000) throw new Error("Not enough synchronized lead time to arm goggles");
      await this.send(OP.ARM, makePayload((data) => {
        data.setUint32(0, this.sessionId, true);
        writeUint64(data, 4, startDeviceUs);
        data.setUint16(12, 4000, true);
      }));
      this.startPerformanceMs = startPerformanceMs;
      this.startDeviceUs = startDeviceUs;
      this.compensationUs = latencyUs;
      this.setState("armed");
    }

    async commit(referenceElapsedUs) {
      await this.send(OP.COMMIT, makePayload((data) => data.setUint32(0, this.sessionId, true)));
      this.referenceElapsedUs = referenceElapsedUs;
      this.startHeartbeat();
      this.setState("armed");
    }

    startHeartbeat() {
      this.stopHeartbeat();
      this.heartbeatTimer = this.timers.setInterval(async () => {
        if (!this.connected || !this.sessionId || this.heartbeatBusy) return;
        this.heartbeatBusy = true;
        try {
          await this.send(OP.HEARTBEAT, makePayload((data) => data.setUint32(0, this.sessionId, true)), OP.ACK, 1800);
        } catch (error) { this.fail(error); }
        finally { this.heartbeatBusy = false; }
      }, 1000);
    }

    async correctDrift() {
      if (!this.referenceElapsedUs) return;
      await this.synchronize(3);
      const now = this.clock.now();
      const expectedUs = this.referenceElapsedUs() + this.compensationUs;
      if (!Number.isFinite(expectedUs) || expectedUs < 0) throw new Error("Session reference clock is unavailable");
      const actualUs = this.deviceTimeForPerformance(now) - this.startDeviceUs;
      const correctionUs = Math.round(expectedUs - actualUs);
      if (Math.abs(correctionUs) > 20000) throw new Error("Audio and visual clocks drifted beyond the safe correction range");
      if (Math.abs(correctionUs) < 250) return;
      await this.send(OP.ADJUST, makePayload((data) => {
        data.setUint32(0, this.sessionId, true);
        data.setInt32(4, correctionUs, true);
      }));
    }

    stopHeartbeat() {
      if (this.heartbeatTimer) this.timers.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      this.heartbeatBusy = false;
    }

    async stop() {
      this.stopHeartbeat();
      if (!this.connected) return;
      const sessionId = this.sessionId;
      this.sessionId = 0;
      this.referenceElapsedUs = null;
      await this.send(OP.STOP, makePayload((data) => data.setUint32(0, sessionId, true)), OP.ACK, 1200);
      this.setState("ready");
    }

    async testLight(eyeMask = 3) {
      await this.send(OP.TEST, makePayload((data) => {
        data.setUint8(0, eyeMask & 3);
        data.setUint16(1, 200, true);
        data.setUint16(3, 1000, true);
        data.setUint8(5, 26);
      }));
    }
  }

  const CALIBRATION = Object.freeze({ pulseHz: 5, duty: 0.25, durationSec: 8 });

  function calibrationVisual(maxIntensity = 1) {
    const intensity = Math.max(0.1, Math.min(1, Number(maxIntensity) || 1));
    const segment = {
      durationSec: CALIBRATION.durationSec,
      pulseHz: CALIBRATION.pulseHz,
      pulseHzEnd: CALIBRATION.pulseHz,
      duty: CALIBRATION.duty,
      dutyEnd: CALIBRATION.duty,
      intensity,
      intensityEnd: intensity,
    };
    return { channels: { left: { delaySec: 0, phaseDeg: 0, segments: [segment] }, right: { delaySec: 0, phaseDeg: 0, segments: [{ ...segment }] } } };
  }

  function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function analyzeFlashLatency(samples, { startPerformanceMs, pulseHz = CALIBRATION.pulseHz, duty = CALIBRATION.duty, durationSec = CALIBRATION.durationSec, windowMs = 60 } = {}) {
    if (!Array.isArray(samples) || samples.length < 8) throw new Error("Not enough camera frames were captured");
    const cycleMs = 1000 / pulseHz;
    const inRange = samples.filter((sample) => sample.tMs >= startPerformanceMs - cycleMs / 2 && sample.tMs <= startPerformanceMs + durationSec * 1000);
    if (inRange.length < 8) throw new Error("Camera frames did not cover the calibration window");
    const lumas = inRange.map((sample) => sample.luma).sort((a, b) => a - b);
    const low = lumas[Math.floor(lumas.length * 0.1)];
    const high = lumas[Math.floor(lumas.length * 0.9)];
    const contrast = high - low;
    if (contrast < 8) throw new Error("The flashes were not visible enough. Aim the camera at the LEDs in dim light.");
    const threshold = low + contrast * 0.5;
    const onsets = [];
    for (let index = 1; index < inRange.length; index += 1) {
      const before = inRange[index - 1];
      const after = inRange[index];
      if (after.tMs - before.tMs > 150) continue;
      if (before.luma < threshold && after.luma >= threshold) {
        const fraction = (threshold - before.luma) / (after.luma - before.luma);
        onsets.push(before.tMs + (after.tMs - before.tMs) * fraction);
      }
    }
    const minimumOnsets = Math.floor(durationSec * pulseHz * 0.5);
    if (onsets.length < minimumOnsets) throw new Error("Only some flashes were seen. Hold the LEDs inside the frame for the whole test.");
    const errors = [];
    for (const onset of onsets) {
      let phase = ((onset - startPerformanceMs) % cycleMs + cycleMs) % cycleMs;
      if (phase > cycleMs / 2) phase -= cycleMs;
      if (Math.abs(phase) <= windowMs) errors.push(phase);
    }
    if (errors.length < 5) throw new Error("Flashes did not line up with any expected onset within ±60 ms");
    return { latencyMs: Math.round(median(errors)), onsets: onsets.length, matched: errors.length, contrast };
  }

  const api = { GogglesController, OP, SERVICE_UUID, CALIBRATION, crc8, crc32, finishCrc32, packet, readPacket, serializeVisualSchedule, analyzeFlashLatency, calibrationVisual, median };
  root.EntrainmentGoggles = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
