const assert = require("assert");
const {
  normalizeIsochronicParams,
  buildIsochronicPulseEvents,
} = require("../isochronic");
const { IsochronicTone: ConsumerTone } = require("../../consumer-app/isochronic");

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

{
  const params = normalizeIsochronicParams({
    carrierHz: 10_000,
    pulseHz: 0,
    duty: 2,
    volume: 2,
    rampSec: 1,
  });
  assert.equal(params.carrierHz, 1200);
  assert.equal(params.pulseHz, 0.5);
  assert.equal(params.duty, 0.95);
  assert.equal(params.volume, 0.8);
  assert.equal(params.rampSec, 0.03);
}

{
  const plan = buildIsochronicPulseEvents({
    nextPulseTime: 0,
    horizonTime: 0.31,
    pulseHz: 10,
    duty: 0.5,
    rampSec: 0.01,
  });
  approx(plan.cycle, 0.1);
  approx(plan.onSec, 0.05);
  approx(plan.ramp, 0.01);
  assert.equal(plan.events.length, 20);
  assert.equal(plan.events[0].type, "set");
  assert.equal(plan.events[1].type, "ramp");
  approx(plan.events[0].time, 0);
  approx(plan.events[1].time, 0.01);
  approx(plan.events[2].time, 0.04);
  approx(plan.events[3].time, 0.05);
  approx(plan.events[4].time, 0.1);
  assert.ok(plan.nextPulseTime >= 0.31);
  for (let i = 1; i < plan.events.length; i += 1) {
    assert.ok(plan.events[i].time >= plan.events[i - 1].time, "events should be monotonic");
  }
}

{
  const plan = buildIsochronicPulseEvents({
    nextPulseTime: 0,
    horizonTime: 0.1,
    pulseHz: 45,
    duty: 0.95,
    rampSec: 0.03,
  });
  assert.ok(plan.ramp <= plan.cycle / 6);
  assert.ok(plan.ramp <= plan.onSec / 3);
  assert.ok(plan.events.every((event) => Number.isFinite(event.time)));
  assert.ok(plan.events.every((event) => event.value === 0 || event.value === 1));
}

{
  const resets = [];
  const gain = {
    value: 0,
    cancelAndHoldAtTime: (time) => resets.push(["cancel", time]),
    setTargetAtTime: (value, time) => resets.push(["target", value, time]),
  };
  const tone = new ConsumerTone();
  tone.ctx = { currentTime: 100 };
  tone.channels.left = {
    carrierHz: 220,
    pulseHz: 14,
    duty: 0.5,
    volume: 1,
    phaseDeg: 0,
    nextPulseTime: 100.2,
    osc: { frequency: { setValueAtTime() {} } },
    gate: { gain },
    level: { gain: { setTargetAtTime() {} } },
  };

  tone.setChannel("left", { pulseHz: 14.1 });
  assert.equal(tone.channels.left.nextPulseTime, 100.2, "nonzero pulse changes must preserve the pulse train");
  assert.equal(resets.length, 0, "ramps and stepped protocols must not insert a dropout");

  tone.setChannel("left", { pulseHz: 0 });
  assert.deepEqual(resets.at(-1), ["target", 1, 100], "silent/continuous segments must still switch modes");

  resets.length = 0;
  tone.setChannel("left", { pulseHz: 18 });
  assert.deepEqual(resets.at(-1), ["target", 0, 100], "pulsing must restart after a continuous segment");

  resets.length = 0;
  tone.setChannel("left", { phaseDeg: 180 });
  assert.equal(resets[0][0], "cancel", "hemisphere phase changes must still resynchronize the channel");
}

console.log("isochronic scheduler tests passed");
