(function attachIsochronic(root) {
  "use strict";

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

  function normalizeChannelParams(input = {}, fallback = {}) {
    const rawPulse = finiteNumber(input.pulseHz, finiteNumber(fallback.pulseHz, 10));
    const rawPhase = finiteNumber(input.phaseDeg, finiteNumber(fallback.phaseDeg, 0));
    return {
      carrierHz: clamp(finiteNumber(input.carrierHz, finiteNumber(fallback.carrierHz, 220)), 40, 1200),
      pulseHz: rawPulse === 0 ? 0 : clamp(rawPulse, MIN_PULSE_HZ, MAX_PULSE_HZ),
      duty: clamp(finiteNumber(input.duty, finiteNumber(fallback.duty, 0.5)), MIN_DUTY, MAX_DUTY),
      volume: clamp(finiteNumber(input.volume, finiteNumber(fallback.volume, 1)), 0, 1),
      phaseDeg: ((rawPhase % 360) + 360) % 360,
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
      this.channels = { left: null, right: null };
      this.merger = null;
      this.master = null;
      this.timer = null;
      this.masterVolume = 0.12;
      this.rampSec = DEFAULT_RAMP_SEC;
    }

    ensureContext() {
      if (this.ctx) return this.ctx;
      const Ctx = root.AudioContext || root.webkitAudioContext;
      this.ctx = new Ctx();
      return this.ctx;
    }

    createChannel(side, params) {
      const ctx = this.ctx;
      const channel = { ...normalizeChannelParams(params) };
      channel.startDelaySec = clamp(finiteNumber(params.startDelaySec, 0), 0, 10800);
      channel.osc = ctx.createOscillator();
      channel.gate = ctx.createGain();
      channel.level = ctx.createGain();
      channel.osc.type = "sine";
      channel.osc.frequency.setValueAtTime(channel.carrierHz, ctx.currentTime);
      channel.gate.gain.setValueAtTime(channel.pulseHz === 0 ? 1 : 0, ctx.currentTime);
      channel.level.gain.setValueAtTime(channel.volume, ctx.currentTime);
      channel.osc.connect(channel.gate);
      channel.gate.connect(channel.level);
      channel.level.connect(this.merger, 0, side === "left" ? 0 : 1);
      channel.osc.start();
      channel.nextPulseTime = ctx.currentTime + channel.startDelaySec + START_DELAY_SEC + (channel.pulseHz ? channel.phaseDeg / 360 / channel.pulseHz : 0);
      return channel;
    }

    async start(params = {}) {
      const ctx = this.ensureContext();
      if (ctx.state !== "running") await ctx.resume();
      this.stop();
      if (!params.left || !params.right) throw new TypeError("left and right channel settings are required");
      this.rampSec = clamp(finiteNumber(params.rampSec, DEFAULT_RAMP_SEC), 0.001, 0.03);
      this.masterVolume = clamp(finiteNumber(params.masterVolume, 0.12), 0, 0.8);

      this.merger = ctx.createChannelMerger(2);
      this.master = ctx.createGain();
      this.master.gain.setValueAtTime(this.masterVolume, ctx.currentTime);
      this.merger.connect(this.master);
      this.master.connect(ctx.destination);
      this.channels.left = this.createChannel("left", params.left);
      this.channels.right = this.createChannel("right", params.right);
      this.timer = root.setInterval(() => this.schedule(), 25);
      this.schedule();
    }

    resetPulse(channel) {
      if (!this.ctx || !channel?.gate) return;
      const now = this.ctx.currentTime;
      const gain = channel.gate.gain;
      if (typeof gain.cancelAndHoldAtTime === "function") gain.cancelAndHoldAtTime(now);
      else {
        const current = finiteNumber(gain.value, 0);
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(current, now);
      }
      gain.setTargetAtTime(channel.pulseHz === 0 ? 1 : 0, now, 0.008);
      channel.nextPulseTime = now + START_DELAY_SEC + (channel.pulseHz ? channel.phaseDeg / 360 / channel.pulseHz : 0);
    }

    setChannel(side, params = {}) {
      if (side !== "left" && side !== "right") throw new TypeError("channel must be left or right");
      const channel = this.channels[side];
      if (!channel || !this.ctx) return;
      const next = normalizeChannelParams(params, channel);
      let reset = false;
      if (params.carrierHz !== undefined && next.carrierHz !== channel.carrierHz) {
        channel.carrierHz = next.carrierHz;
        channel.osc.frequency.setValueAtTime(next.carrierHz, this.ctx.currentTime);
      }
      if (params.pulseHz !== undefined && next.pulseHz !== channel.pulseHz) { channel.pulseHz = next.pulseHz; reset = true; }
      if (params.duty !== undefined) channel.duty = next.duty;
      if (params.phaseDeg !== undefined && next.phaseDeg !== channel.phaseDeg) { channel.phaseDeg = next.phaseDeg; reset = true; }
      if (params.volume !== undefined && next.volume !== channel.volume) {
        channel.volume = next.volume;
        channel.level.gain.setTargetAtTime(next.volume, this.ctx.currentTime, 0.02);
      }
      if (reset) this.resetPulse(channel);
    }

    setBoth(params) {
      this.setChannel("left", params);
      this.setChannel("right", params);
    }

    setMasterVolume(volume) {
      this.masterVolume = clamp(finiteNumber(volume, 0.12), 0, 0.8);
      if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.02);
    }

    scheduleChannel(channel) {
      if (!this.ctx || !channel?.gate || channel.pulseHz === 0) return;
      if (channel.nextPulseTime < this.ctx.currentTime) {
        channel.nextPulseTime = this.ctx.currentTime + START_DELAY_SEC + channel.phaseDeg / 360 / channel.pulseHz;
      }
      const plan = buildIsochronicPulseEvents({
        nextPulseTime: channel.nextPulseTime,
        horizonTime: this.ctx.currentTime + 0.25,
        pulseHz: channel.pulseHz,
        duty: channel.duty,
        rampSec: this.rampSec,
      });
      for (const event of plan.events) {
        if (event.type === "ramp") channel.gate.gain.linearRampToValueAtTime(event.value, event.time);
        else channel.gate.gain.setValueAtTime(event.value, event.time);
      }
      channel.nextPulseTime = plan.nextPulseTime;
    }

    schedule() {
      if (!this.timer) return;
      this.scheduleChannel(this.channels.left);
      this.scheduleChannel(this.channels.right);
    }

    stop() {
      if (this.timer) {
        root.clearInterval(this.timer);
        this.timer = null;
      }
      const channels = Object.values(this.channels).filter(Boolean);
      const merger = this.merger;
      const master = this.master;
      if (this.ctx) {
        const now = this.ctx.currentTime;
        for (const channel of channels) {
          channel.gate.gain.cancelScheduledValues(now);
          channel.gate.gain.setTargetAtTime(0, now, 0.012);
          try { channel.osc.stop(now + 0.05); } catch {}
        }
      }
      root.setTimeout?.(() => {
        try {
          for (const channel of channels) { channel.osc.disconnect(); channel.gate.disconnect(); channel.level.disconnect(); }
          merger?.disconnect();
          master?.disconnect();
        } catch {}
      }, 90);
      this.channels = { left: null, right: null };
      this.merger = null;
      this.master = null;
    }
  }

  const api = { IsochronicTone, normalizeChannelParams, buildIsochronicPulseEvents };

  root.IsochronicTone = IsochronicTone;
  root.IsochronicAudio = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
