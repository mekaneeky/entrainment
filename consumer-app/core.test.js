const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  LocalStore,
  SessionRunner,
  atTime,
  parseProfileFile,
  totalDuration,
  validateProfile,
} = require("./core");

const profile = validateProfile({
  format: "entrainment-profile",
  version: 1,
  method: "hemispheric",
  id: "hemisphere-cycle",
  name: "Hemisphere cycle",
  masterVolume: 0.1,
  rampSec: 0.01,
  channels: {
    left: {
      segments: [
        { durationSec: 4, carrierHz: 200, carrierHzEnd: 220, pulseHz: 10, pulseHzEnd: 8, duty: 0.4, dutyEnd: 0.6, volume: 0.5, volumeEnd: 1, phaseDeg: 0 },
        { durationSec: 2, carrierHz: 210, pulseHz: 0, volume: 0.8 },
      ],
    },
    right: {
      delaySec: 1,
      segments: [
        { durationSec: 2, carrierHz: 240, pulseHz: 10, phaseDeg: 180 },
        { durationSec: 4, carrierHz: 218, pulseHz: 0, volume: 0.7 },
      ],
    },
  },
});

assert.equal(parseProfileFile(JSON.stringify(profile)).method, "hemispheric");
assert.equal(parseProfileFile(fs.readFileSync(`${__dirname}/profile.example.json`, "utf8")).version, 1);
for (const file of JSON.parse(fs.readFileSync(`${__dirname}/protocols/index.json`, "utf8"))) {
  assert.equal(parseProfileFile(fs.readFileSync(path.resolve(__dirname, file), "utf8")).version, 1);
}
assert.equal(totalDuration(profile), 7);
assert.equal(atTime(profile, 0).right.active, false);
assert.equal(atTime(profile, 1.5).right.phaseDeg, 180);
assert.equal(atTime(profile, 4.5).left.pulseHz, 0);
assert.throws(() => parseProfileFile(JSON.stringify({ ...profile, server: "https://example.com" })), /server is not supported/);
assert.throws(() => validateProfile({
  ...profile,
  channels: { ...profile.channels, left: { segments: [{ durationSec: 2, carrierHz: 200, pulseHz: 0, pulseHzEnd: 10 }] } },
}), /cannot ramp between continuous and pulsed/);

class MemoryStorage {
  getItem(key) { return this[key] ?? null; }
  setItem(key, value) { this[key] = value; }
}

const store = new LocalStore(new MemoryStorage());
store.putProfile(profile);
const goal = store.putGoal({
  id: "anxiety",
  label: "Feel calmer",
  question: "How anxious do you feel right now?",
  lowLabel: "Not anxious",
  highLabel: "Extremely anxious",
  min: 1,
  max: 10,
  direction: "lower",
});
store.recordSession({
  id: "session_one",
  profileId: profile.id,
  startedAt: "2026-07-26T01:00:00.000Z",
  endedAt: "2026-07-26T01:06:00.000Z",
  before: { anxiety: 8 },
  after: { anxiety: 5 },
  beforeNote: "Tense shoulders",
  afterNote: "Breathing feels easier",
});
store.recordSession({
  id: "session_one",
  profileId: profile.id,
  startedAt: "2026-07-26T01:00:00.000Z",
  endedAt: "2026-07-26T01:06:00.000Z",
  before: { anxiety: 8 },
  after: { anxiety: 4 },
});
assert.equal(goal.question, "How anxious do you feel right now?");
assert.equal(store.load().sessions.length, 1);
assert.equal(store.load().sessions[0].after.anxiety, 4);
assert.deepEqual(store.progress("anxiety")[0], {
  sessionId: "session_one",
  date: "2026-07-26T01:06:00.000Z",
  before: 8,
  after: 4,
  change: -4,
  improvement: 4,
});
assert.equal(new LocalStore(new MemoryStorage()).importData(store.exportData()).sessions.length, 1);

let scheduledTick;
let ended;
const calls = [];
const tone = {
  ctx: { currentTime: 10, state: "running", resume: async () => {} },
  async start(settings) { calls.push(["start", settings]); },
  setChannel(side, settings) { calls.push([side, settings]); },
  stop() { calls.push(["stop"]); },
};

(async () => {
  const runner = new SessionRunner(tone, {
    setInterval(callback) { scheduledTick = callback; return 1; },
    clearInterval() {},
  });
  await runner.start(profile, { onEnd: (result) => { ended = result; } });
  assert.equal(calls[0][1].right.volume, 0);
  tone.ctx.currentTime = 11.5;
  scheduledTick();
  assert.ok(calls.some(([side, settings]) => side === "right" && settings.volume === 1));
  tone.ctx.currentTime = 14.5;
  scheduledTick();
  assert.ok(calls.some(([side, settings]) => side === "left" && settings.pulseHz === 0));
  tone.ctx.currentTime = 17;
  scheduledTick();
  assert.equal(ended.status, "completed");
  assert.equal(calls.at(-1)[0], "stop");
  console.log("consumer core tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
