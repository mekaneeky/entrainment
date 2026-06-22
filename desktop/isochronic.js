(function attachIsochronic(root) {
  const MIN_PULSE_HZ = 0.5;
  const MAX_PULSE_HZ = 45;
  const MIN_DUTY = 0.05;
  const MAX_DUTY = 0.95;
  const DEFAULT_RAMP_SEC = 0.01;
  const START_DELAY_SEC = 0.04;

  function finiteNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeIsochronicParams(input = {}) {
    return {
      carrierHz: clamp(finiteNumber(input.carrierHz, 220), 40, 1200),
      pulseHz: clamp(finiteNumber(input.pulseHz, 10), MIN_PULSE_HZ, MAX_PULSE_HZ),
      duty: clamp(finiteNumber(input.duty, 0.5), MIN_DUTY, MAX_DUTY),
      volume: clamp(finiteNumber(input.volume, 0.12), 0, 0.8),
      rampSec: clamp(finiteNumber(input.rampSec, DEFAULT_RAMP_SEC), 0.001, 0.03),
    };
  }

  function buildIsochronicPulseEvents({ nextPulseTime, horizonTime, pulseHz, duty, rampSec }) {
    const hz = clamp(finiteNumber(pulseHz, 10), MIN_PULSE_HZ, MAX_PULSE_HZ);
    const cycle = 1 / hz;
    const onSec = Math.max(0.01, cycle * clamp(finiteNumber(duty, 0.5), MIN_DUTY, MAX_DUTY));
    const ramp = Math.min(clamp(finiteNumber(rampSec, DEFAULT_RAMP_SEC), 0.001, 0.03), onSec / 3, cycle / 6);
    const events = [];
    let cursor = finiteNumber(nextPulseTime, 0);
    const horizon = finiteNumber(horizonTime, cursor);

    while (cursor < horizon) {
      const start = cursor;
      const off = start + onSec;
      events.push({ type: "set", value: 0, time: start });
      events.push({ type: "ramp", value: 1, time: start + ramp });
      events.push({ type: "set", value: 1, time: Math.max(start + ramp, off - ramp) });
      events.push({ type: "ramp", value: 0, time: off });
      events.push({ type: "set", value: 0, time: start + cycle });
      cursor += cycle;
    }

    return { events, nextPulseTime: cursor, cycle, onSec, ramp };
  }

  class IsochronicTone {
    constructor() {
      this.ctx = null;
      this.osc = null;
      this.gate = null;
      this.master = null;
      this.timer = null;
      this.nextPulseTime = 0;
      this.carrierHz = 220;
      this.pulseHz = 10;
      this.duty = 0.5;
      this.volume = 0.12;
      this.rampSec = DEFAULT_RAMP_SEC;
    }

    ensureContext() {
      if (this.ctx) return this.ctx;
      const Ctx = root.AudioContext || root.webkitAudioContext;
      this.ctx = new Ctx();
      return this.ctx;
    }

    async start(params) {
      const ctx = this.ensureContext();
      if (ctx.state === "suspended") await ctx.resume();
      this.stop();

      const normalized = normalizeIsochronicParams(params);
      this.carrierHz = normalized.carrierHz;
      this.pulseHz = normalized.pulseHz;
      this.duty = normalized.duty;
      this.volume = normalized.volume;
      this.rampSec = normalized.rampSec;

      this.osc = ctx.createOscillator();
      this.gate = ctx.createGain();
      this.master = ctx.createGain();
      this.osc.type = "sine";
      this.osc.frequency.setValueAtTime(this.carrierHz, ctx.currentTime);
      this.gate.gain.setValueAtTime(0, ctx.currentTime);
      this.master.gain.setValueAtTime(this.volume, ctx.currentTime);
      this.osc.connect(this.gate);
      this.gate.connect(this.master);
      this.master.connect(ctx.destination);
      this.osc.start();
      this.nextPulseTime = ctx.currentTime + START_DELAY_SEC;
      this.timer = root.setInterval(() => this.schedule(), 25);
      this.schedule();
    }

    setPulse(pulseHz) {
      this.pulseHz = normalizeIsochronicParams({ pulseHz }).pulseHz;
      if (!this.ctx || !this.gate) return;
      const now = this.ctx.currentTime;
      if (typeof this.gate.gain.cancelAndHoldAtTime === "function") {
        this.gate.gain.cancelAndHoldAtTime(now);
      } else {
        const current = finiteNumber(this.gate.gain.value, 0);
        this.gate.gain.cancelScheduledValues(now);
        this.gate.gain.setValueAtTime(current, now);
      }
      this.gate.gain.setTargetAtTime(0, now, 0.008);
      this.nextPulseTime = now + START_DELAY_SEC;
    }

    setCarrier(carrierHz) {
      this.carrierHz = normalizeIsochronicParams({ carrierHz }).carrierHz;
      if (this.osc && this.ctx) this.osc.frequency.setValueAtTime(this.carrierHz, this.ctx.currentTime);
    }

    setVolume(volume) {
      this.volume = normalizeIsochronicParams({ volume }).volume;
      if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }

    schedule() {
      if (!this.ctx || !this.gate || !this.timer) return;
      const plan = buildIsochronicPulseEvents({
        nextPulseTime: this.nextPulseTime,
        horizonTime: this.ctx.currentTime + 0.25,
        pulseHz: this.pulseHz,
        duty: this.duty,
        rampSec: this.rampSec,
      });
      for (const event of plan.events) {
        if (event.type === "ramp") {
          this.gate.gain.linearRampToValueAtTime(event.value, event.time);
        } else {
          this.gate.gain.setValueAtTime(event.value, event.time);
        }
      }
      this.nextPulseTime = plan.nextPulseTime;
    }

    stop() {
      if (this.timer) {
        root.clearInterval(this.timer);
        this.timer = null;
      }
      const osc = this.osc;
      const gate = this.gate;
      const master = this.master;
      if (this.ctx && gate) {
        const now = this.ctx.currentTime;
        gate.gain.cancelScheduledValues(now);
        gate.gain.setTargetAtTime(0, now, 0.012);
      }
      if (osc) {
        try {
          osc.stop((this.ctx?.currentTime || 0) + 0.05);
        } catch {
          // already stopped
        }
      }
      root.setTimeout?.(() => {
        try {
          osc?.disconnect();
          gate?.disconnect();
          master?.disconnect();
        } catch {
          // already disconnected
        }
      }, 90);
      this.osc = null;
      this.gate = null;
      this.master = null;
    }
  }

  const api = {
    IsochronicTone,
    normalizeIsochronicParams,
    buildIsochronicPulseEvents,
  };

  root.IsochronicTone = IsochronicTone;
  root.IsochronicAudio = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
