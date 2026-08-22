"use strict";

class EntrainmentTimelineProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const settings = options.processorOptions;
    this.audio = settings.audio;
    this.startFrame = Math.round(settings.startTime * sampleRate);
    this.masterVolume = this.audio.masterVolume;
    this.rampCoefficient = 1 - Math.exp(-1 / (sampleRate * this.audio.rampSec));
    this.states = ["left", "right"].map((side) => ({
      channel: this.audio.channels[side],
      index: -1,
      segmentStartSec: 0,
      segmentEndSec: 0,
      carrierPhase: 0,
      pulsePhase: (this.audio.channels[side].phaseDeg % 360) / 360,
      gateLevel: 0,
      complete: false,
    }));
  }

  segmentAt(state, localSec) {
    if (state.complete) return null;
    if (state.index < 0) {
      state.index = 0;
      state.segmentStartSec = 0;
      state.segmentEndSec = state.channel.segments[0].durationSec;
    }
    while (localSec >= state.segmentEndSec) {
      state.index += 1;
      if (state.index >= state.channel.segments.length) {
        state.complete = true;
        return null;
      }
      state.segmentStartSec = state.segmentEndSec;
      const segment = state.channel.segments[state.index];
      state.segmentEndSec += segment.durationSec;
      if (segment.resetPhaseDeg !== undefined) state.pulsePhase = (segment.resetPhaseDeg % 360) / 360;
    }
    return state.channel.segments[state.index];
  }

  renderChannel(state, frame) {
    const elapsedSec = (frame - this.startFrame) / sampleRate;
    const localSec = elapsedSec - state.channel.delaySec;
    if (localSec < 0) return 0;
    const segment = this.segmentAt(state, localSec);
    if (!segment) {
      state.gateLevel += (0 - state.gateLevel) * this.rampCoefficient;
      return 0;
    }

    const fraction = Math.max(0, Math.min(1, (localSec - state.segmentStartSec) / segment.durationSec));
    const carrierHz = segment.carrierHz + (segment.carrierHzEnd - segment.carrierHz) * fraction;
    const pulseHz = segment.pulseHz + (segment.pulseHzEnd - segment.pulseHz) * fraction;
    const duty = segment.duty + (segment.dutyEnd - segment.duty) * fraction;
    const volume = segment.volume + (segment.volumeEnd - segment.volume) * fraction;
    const gateTarget = pulseHz === 0 || state.pulsePhase < duty ? 1 : 0;
    state.gateLevel += (gateTarget - state.gateLevel) * this.rampCoefficient;
    const value = Math.sin(state.carrierPhase * Math.PI * 2) * state.gateLevel * volume * this.masterVolume;
    state.carrierPhase = (state.carrierPhase + carrierHz / sampleRate) % 1;
    if (pulseHz !== 0) state.pulsePhase = (state.pulsePhase + pulseHz / sampleRate) % 1;
    return value;
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output?.length) return true;
    for (let sample = 0; sample < output[0].length; sample += 1) {
      const frame = currentFrame + sample;
      output[0][sample] = frame < this.startFrame ? 0 : this.renderChannel(this.states[0], frame);
      if (output[1]) output[1][sample] = frame < this.startFrame ? 0 : this.renderChannel(this.states[1], frame);
    }
    return true;
  }
}

registerProcessor("entrainment-timeline", EntrainmentTimelineProcessor);
