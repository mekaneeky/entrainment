(function attachEntrainmentCore(root) {
  "use strict";

  const PROFILE_FORMAT = "entrainment-profile";
  const BACKUP_FORMAT = "entrainment-backup";
  const BACKUP_VERSION = 1;
  const STORE_KEY = "entrainment.consumer";
  const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
  const MAX_PROFILE_BYTES = 256 * 1024;
  const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

  function fail(message) {
    throw new TypeError(message);
  }

  function object(value, path) {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${path} must be an object`);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail(`${path} must be a plain object`);
    return value;
  }

  function knownKeys(value, allowed, path) {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) fail(`${path}.${key} is not supported`);
    }
  }

  function string(value, path, { min = 0, max = 2000 } = {}) {
    if (typeof value !== "string") fail(`${path} must be text`);
    const result = value.trim();
    if (result.length < min || result.length > max) fail(`${path} must be ${min}-${max} characters`);
    return result;
  }

  function id(value, path) {
    const result = string(value, path, { min: 1, max: 80 });
    if (!ID_PATTERN.test(result)) fail(`${path} may contain lowercase letters, numbers, - and _`);
    return result;
  }

  function number(value, path, min, max) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      fail(`${path} must be a number from ${min} to ${max}`);
    }
    return value;
  }

  function pulseNumber(value, path) {
    const result = number(value, path, 0, 45);
    if (result > 0 && result < 0.5) fail(`${path} must be 0 for continuous sound or 0.5-45 for pulsing`);
    return result;
  }

  function isoDate(value, path) {
    const result = string(value, path, { min: 10, max: 40 });
    if (!Number.isFinite(Date.parse(result))) fail(`${path} must be an ISO date`);
    return result;
  }

  function validateSegment(input, index, side) {
    const path = `profile.channels.${side}.segments[${index}]`;
    object(input, path);
    knownKeys(input, ["durationSec", "carrierHz", "carrierHzEnd", "pulseHz", "pulseHzEnd", "duty", "dutyEnd", "volume", "volumeEnd", "phaseDeg"], path);
    const carrierHz = number(input.carrierHz, `${path}.carrierHz`, 40, 1200);
    const pulseHz = pulseNumber(input.pulseHz, `${path}.pulseHz`);
    const pulseHzEnd = pulseNumber(input.pulseHzEnd ?? pulseHz, `${path}.pulseHzEnd`);
    if ((pulseHz === 0) !== (pulseHzEnd === 0)) fail(`${path} cannot ramp between continuous and pulsed sound; use adjacent segments`);
    const duty = number(input.duty ?? 0.5, `${path}.duty`, 0.05, 0.95);
    const volume = number(input.volume ?? 1, `${path}.volume`, 0, 1);
    return {
      durationSec: number(input.durationSec, `${path}.durationSec`, 1, 7200),
      carrierHz,
      carrierHzEnd: number(input.carrierHzEnd ?? carrierHz, `${path}.carrierHzEnd`, 40, 1200),
      pulseHz,
      pulseHzEnd,
      duty,
      dutyEnd: number(input.dutyEnd ?? duty, `${path}.dutyEnd`, 0.05, 0.95),
      volume,
      volumeEnd: number(input.volumeEnd ?? volume, `${path}.volumeEnd`, 0, 1),
      phaseDeg: number(input.phaseDeg ?? 0, `${path}.phaseDeg`, 0, 360),
    };
  }

  function validateChannel(input, side) {
    const path = `profile.channels.${side}`;
    object(input, path);
    knownKeys(input, ["delaySec", "segments"], path);
    if (!Array.isArray(input.segments) || input.segments.length < 1 || input.segments.length > 128) {
      fail(`${path}.segments must contain 1-128 segments`);
    }
    const delaySec = number(input.delaySec ?? 0, `${path}.delaySec`, 0, 10800);
    const segments = input.segments.map((segment, index) => validateSegment(segment, index, side));
    if (delaySec + segments.reduce((sum, segment) => sum + segment.durationSec, 0) > 10800) {
      fail(`${path} may not exceed 3 hours including its delay`);
    }
    return { delaySec, segments };
  }

  function validateProfile(input) {
    object(input, "profile");
    knownKeys(input, ["format", "version", "method", "id", "name", "description", "masterVolume", "rampSec", "channels"], "profile");
    if (input.format !== PROFILE_FORMAT) fail(`profile.format must be ${PROFILE_FORMAT}`);
    if (input.version !== 1) fail("profile.version must be 1");
    if (input.method !== "hemispheric") fail("profile.method must be hemispheric");
    object(input.channels, "profile.channels");
    knownKeys(input.channels, ["left", "right"], "profile.channels");
    if (!input.channels.left || !input.channels.right) fail("profile.channels must contain left and right");
    return {
      format: PROFILE_FORMAT,
      version: 1,
      method: "hemispheric",
      id: id(input.id, "profile.id"),
      name: string(input.name, "profile.name", { min: 1, max: 80 }),
      description: string(input.description ?? "", "profile.description", { max: 500 }),
      masterVolume: number(input.masterVolume ?? 0.12, "profile.masterVolume", 0, 0.8),
      rampSec: number(input.rampSec ?? 0.01, "profile.rampSec", 0.001, 0.03),
      channels: { left: validateChannel(input.channels.left, "left"), right: validateChannel(input.channels.right, "right") },
    };
  }

  function parseJsonFile(source, expectedFormat, maxBytes) {
    if (typeof source !== "string") fail("file contents must be text");
    if (source.length > maxBytes) fail("file is too large");
    let parsed;
    try {
      parsed = JSON.parse(source);
    } catch {
      fail("file is not valid JSON");
    }
    if (parsed?.format !== expectedFormat) fail(`file format must be ${expectedFormat}`);
    return parsed;
  }

  function parseProfileFile(source) {
    return validateProfile(parseJsonFile(source, PROFILE_FORMAT, MAX_PROFILE_BYTES));
  }

  function validateGoal(input) {
    object(input, "goal");
    knownKeys(input, ["id", "label", "question", "lowLabel", "highLabel", "min", "max", "direction", "createdAt", "archived"], "goal");
    const min = number(input.min ?? 1, "goal.min", -1000000, 1000000);
    const max = number(input.max ?? 10, "goal.max", -1000000, 1000000);
    if (max <= min) fail("goal.max must be greater than goal.min");
    if (!['higher', 'lower'].includes(input.direction ?? "higher")) fail("goal.direction must be higher or lower");
    if (input.archived !== undefined && typeof input.archived !== "boolean") fail("goal.archived must be true or false");
    const label = string(input.label, "goal.label", { min: 1, max: 100 });
    return {
      id: id(input.id, "goal.id"),
      label,
      question: string(input.question ?? label, "goal.question", { min: 1, max: 240 }),
      lowLabel: string(input.lowLabel ?? "Not at all", "goal.lowLabel", { min: 1, max: 60 }),
      highLabel: string(input.highLabel ?? "Completely", "goal.highLabel", { min: 1, max: 60 }),
      min,
      max,
      direction: input.direction ?? "higher",
      createdAt: isoDate(input.createdAt ?? new Date().toISOString(), "goal.createdAt"),
      archived: input.archived ?? false,
    };
  }

  function validateScores(input, path, goals) {
    object(input ?? {}, path);
    const result = {};
    for (const [goalId, value] of Object.entries(input ?? {})) {
      id(goalId, `${path} key`);
      const goal = goals.get(goalId);
      if (!goal) fail(`${path}.${goalId} refers to an unknown goal`);
      result[goalId] = number(value, `${path}.${goalId}`, goal.min, goal.max);
    }
    return result;
  }

  function validateSession(input, goals, profiles) {
    object(input, "session");
    knownKeys(input, ["id", "profileId", "startedAt", "endedAt", "status", "before", "after", "note", "beforeNote", "afterNote"], "session");
    const profileId = id(input.profileId, "session.profileId");
    if (!profiles.has(profileId)) fail("session.profileId refers to an unknown profile");
    const startedAt = isoDate(input.startedAt, "session.startedAt");
    const endedAt = isoDate(input.endedAt, "session.endedAt");
    if (Date.parse(endedAt) < Date.parse(startedAt)) fail("session.endedAt cannot precede session.startedAt");
    if (!["completed", "stopped"].includes(input.status)) fail("session.status must be completed or stopped");
    return {
      id: id(input.id, "session.id"),
      profileId,
      startedAt,
      endedAt,
      status: input.status,
      before: validateScores(input.before, "session.before", goals),
      after: validateScores(input.after, "session.after", goals),
      note: string(input.note ?? "", "session.note", { max: 2000 }),
      beforeNote: string(input.beforeNote ?? "", "session.beforeNote", { max: 2000 }),
      afterNote: string(input.afterNote ?? "", "session.afterNote", { max: 2000 }),
    };
  }

  function emptyBackup() {
    return { format: BACKUP_FORMAT, version: BACKUP_VERSION, goals: [], profiles: [], sessions: [] };
  }

  function validateBackup(input) {
    object(input, "backup");
    knownKeys(input, ["format", "version", "goals", "profiles", "sessions"], "backup");
    if (input.format !== BACKUP_FORMAT) fail(`backup.format must be ${BACKUP_FORMAT}`);
    // ponytail: version 1 only; add a migration when version 2 actually exists.
    if (input.version !== BACKUP_VERSION) fail(`backup.version must be ${BACKUP_VERSION}`);
    if (![input.goals, input.profiles, input.sessions].every(Array.isArray)) fail("backup collections must be arrays");
    const goals = input.goals.map(validateGoal);
    const profiles = input.profiles.map(validateProfile);
    const goalMap = new Map(goals.map((goal) => [goal.id, goal]));
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    if (goalMap.size !== goals.length) fail("goal ids must be unique");
    if (profileMap.size !== profiles.length) fail("profile ids must be unique");
    const sessions = input.sessions.map((session) => validateSession(session, goalMap, profileMap));
    if (new Set(sessions.map((session) => session.id)).size !== sessions.length) fail("session ids must be unique");
    return { format: BACKUP_FORMAT, version: BACKUP_VERSION, goals, profiles, sessions };
  }

  function makeId(prefix) {
    const random = root.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}_${random}`.toLowerCase();
  }

  class LocalStore {
    constructor(storage = root.localStorage) {
      if (!storage?.getItem || !storage?.setItem) fail("a localStorage-compatible store is required");
      this.storage = storage;
    }

    load() {
      const source = this.storage.getItem(STORE_KEY);
      if (source === null) return emptyBackup();
      try {
        return validateBackup(JSON.parse(source));
      } catch (error) {
        throw new Error(`Saved data is unreadable and was left untouched: ${error.message}`);
      }
    }

    save(data) {
      const clean = validateBackup(data);
      this.storage.setItem(STORE_KEY, JSON.stringify(clean));
      return clean;
    }

    putGoal(input) {
      const data = this.load();
      const goal = validateGoal({ ...input, id: input.id ?? makeId("goal") });
      const index = data.goals.findIndex((item) => item.id === goal.id);
      if (index < 0) data.goals.push(goal); else data.goals[index] = goal;
      this.save(data);
      return goal;
    }

    putProfile(input) {
      const data = this.load();
      const profile = validateProfile(input);
      const index = data.profiles.findIndex((item) => item.id === profile.id);
      if (index < 0) data.profiles.push(profile); else data.profiles[index] = profile;
      this.save(data);
      return profile;
    }

    recordSession(input) {
      const data = this.load();
      const now = new Date().toISOString();
      const session = validateSession(
        {
          ...input,
          id: input.id ?? makeId("session"),
          startedAt: input.startedAt ?? now,
          endedAt: input.endedAt ?? now,
          status: input.status ?? "completed",
        },
        new Map(data.goals.map((goal) => [goal.id, goal])),
        new Map(data.profiles.map((profile) => [profile.id, profile]))
      );
      const index = data.sessions.findIndex((item) => item.id === session.id);
      if (index < 0) data.sessions.push(session); else data.sessions[index] = session;
      this.save(data);
      return session;
    }

    progress(goalId) {
      const data = this.load();
      const goal = data.goals.find((item) => item.id === goalId);
      if (!goal) fail("unknown goal");
      return data.sessions.flatMap((session) => {
        const before = session.before[goalId];
        const after = session.after[goalId];
        if (!Number.isFinite(before) || !Number.isFinite(after)) return [];
        const change = after - before;
        return [{
          sessionId: session.id,
          date: session.endedAt,
          before,
          after,
          change,
          improvement: goal.direction === "higher" ? change : -change,
        }];
      }).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    }

    exportData() {
      return JSON.stringify(this.load(), null, 2);
    }

    importData(source) {
      const clean = validateBackup(parseJsonFile(source, BACKUP_FORMAT, MAX_BACKUP_BYTES));
      this.storage.setItem(STORE_KEY, JSON.stringify(clean));
      return clean;
    }
  }

  function totalDuration(profile) {
    return Math.max(...Object.values(profile.channels).map((channel) => (
      channel.delaySec + channel.segments.reduce((sum, segment) => sum + segment.durationSec, 0)
    )));
  }

  function channelAtTime(channel, elapsedSec) {
    const localTime = elapsedSec - channel.delaySec;
    const first = channel.segments[0];
    if (localTime < 0) return { index: -1, fraction: 0, active: false, carrierHz: first.carrierHz, pulseHz: first.pulseHz, duty: first.duty, volume: 0, phaseDeg: first.phaseDeg };
    let offset = 0;
    for (let index = 0; index < channel.segments.length; index += 1) {
      const segment = channel.segments[index];
      if (localTime < offset + segment.durationSec) {
        const fraction = Math.max(0, Math.min(1, (localTime - offset) / segment.durationSec));
        return {
          index,
          fraction,
          active: true,
          carrierHz: segment.carrierHz + (segment.carrierHzEnd - segment.carrierHz) * fraction,
          pulseHz: segment.pulseHz + (segment.pulseHzEnd - segment.pulseHz) * fraction,
          duty: segment.duty + (segment.dutyEnd - segment.duty) * fraction,
          volume: segment.volume + (segment.volumeEnd - segment.volume) * fraction,
          phaseDeg: segment.phaseDeg,
        };
      }
      offset += segment.durationSec;
    }
    const last = channel.segments.at(-1);
    return { index: channel.segments.length, fraction: 1, active: false, carrierHz: last.carrierHzEnd, pulseHz: last.pulseHzEnd, duty: last.dutyEnd, volume: 0, phaseDeg: last.phaseDeg };
  }

  function atTime(profile, elapsedSec) {
    return {
      left: channelAtTime(profile.channels.left, elapsedSec),
      right: channelAtTime(profile.channels.right, elapsedSec),
    };
  }

  class SessionRunner {
    constructor(tone, timers = root) {
      this.tone = tone ?? (root.IsochronicTone ? new root.IsochronicTone() : null);
      if (!this.tone) fail("IsochronicTone must be loaded before SessionRunner");
      this.timers = timers;
      this.active = null;
      this.starting = false;
    }

    async start(input, callbacks = {}) {
      if (this.starting) fail("session is already starting");
      if (this.active) this.stop("replaced");
      const profile = validateProfile(input);
      const first = atTime(profile, 0);
      this.starting = true;
      try {
        await this.tone.start({
          left: { ...first.left, startDelaySec: profile.channels.left.delaySec },
          right: { ...first.right, startDelaySec: profile.channels.right.delaySec },
          masterVolume: profile.masterVolume,
          rampSec: profile.rampSec,
        });
      } finally {
        this.starting = false;
      }
      const stateHandler = () => this.reportAudioState();
      this.active = {
        profile,
        callbacks,
        startedAt: this.tone.ctx?.currentTime ?? 0,
        lastChannels: { left: { ...first.left }, right: { ...first.right } },
        lastAudioState: this.tone.ctx?.state ?? "running",
        stateHandler,
        timer: this.timers.setInterval(() => this.tick(), 250),
      };
      this.tone.ctx?.addEventListener?.("statechange", stateHandler);
      this.tick();
      return profile;
    }

    reportAudioState() {
      if (!this.active) return;
      const audioState = this.tone.ctx?.state ?? "running";
      if (audioState === this.active.lastAudioState) return;
      this.active.lastAudioState = audioState;
      this.active.callbacks.onAudioState?.(audioState);
    }

    tick() {
      if (!this.active) return;
      const { profile, callbacks } = this.active;
      this.reportAudioState();
      const elapsedSec = Math.max(0, (this.tone.ctx?.currentTime ?? 0) - this.active.startedAt);
      const durationSec = totalDuration(profile);
      if (elapsedSec >= durationSec) {
        this.finish("completed", durationSec);
        return;
      }
      const point = atTime(profile, elapsedSec);
      for (const side of ["left", "right"]) {
        const next = point[side];
        const last = this.active.lastChannels[side];
        const update = {};
        if (Math.abs(next.carrierHz - last.carrierHz) >= 0.5) update.carrierHz = next.carrierHz;
        if (Math.abs(next.pulseHz - last.pulseHz) >= 0.05) update.pulseHz = next.pulseHz;
        if (Math.abs(next.duty - last.duty) >= 0.005) update.duty = next.duty;
        if (Math.abs(next.volume - last.volume) >= 0.005 || next.active !== last.active) update.volume = next.volume;
        if (next.phaseDeg !== last.phaseDeg) update.phaseDeg = next.phaseDeg;
        if (Object.keys(update).length) this.tone.setChannel(side, update);
        Object.assign(last, update, { active: next.active });
      }
      callbacks.onProgress?.({ elapsedSec, durationSec, ...point });
    }

    async resumeAudio() {
      if (this.tone.ctx?.state !== "running") await this.tone.ctx?.resume?.();
    }

    stop(status = "stopped") {
      if (!this.active) return;
      const elapsedSec = Math.max(0, (this.tone.ctx?.currentTime ?? 0) - this.active.startedAt);
      this.finish(status, elapsedSec);
    }

    finish(status, elapsedSec) {
      const active = this.active;
      this.active = null;
      this.timers.clearInterval(active.timer);
      this.tone.ctx?.removeEventListener?.("statechange", active.stateHandler);
      this.tone.stop();
      active.callbacks.onEnd?.({ status, elapsedSec, durationSec: totalDuration(active.profile) });
    }
  }

  const api = {
    LocalStore,
    SessionRunner,
    atTime,
    emptyBackup,
    parseProfileFile,
    totalDuration,
    validateBackup,
    validateGoal,
    validateProfile,
  };

  root.EntrainmentCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
