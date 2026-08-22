(function attachEntrainmentCore(root) {
  "use strict";

  const PROFILE_FORMAT = "entrainment-profile";
  const BACKUP_FORMAT = "entrainment-backup";
  const PROFILE_VERSION = 2;
  const BACKUP_VERSION = 2;
  const OUTPUTS = ["audio", "visual"];
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

  function validateAudioSegment(input, index, side, pathPrefix = "profile.audio.channels") {
    const path = `${pathPrefix}.${side}.segments[${index}]`;
    object(input, path);
    knownKeys(input, ["durationSec", "carrierHz", "carrierHzEnd", "pulseHz", "pulseHzEnd", "duty", "dutyEnd", "volume", "volumeEnd", "resetPhaseDeg"], path);
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
      ...(input.resetPhaseDeg === undefined ? {} : { resetPhaseDeg: number(input.resetPhaseDeg, `${path}.resetPhaseDeg`, 0, 360) }),
    };
  }

  function validateVisualSegment(input, index, side) {
    const path = `profile.visual.channels.${side}.segments[${index}]`;
    object(input, path);
    knownKeys(input, ["durationSec", "pulseHz", "pulseHzEnd", "duty", "dutyEnd", "intensity", "intensityEnd"], path);
    const pulseHz = pulseNumber(input.pulseHz, `${path}.pulseHz`);
    const pulseHzEnd = pulseNumber(input.pulseHzEnd ?? pulseHz, `${path}.pulseHzEnd`);
    if ((pulseHz === 0) !== (pulseHzEnd === 0)) fail(`${path} cannot ramp between dark and flashing; use adjacent segments`);
    const duty = number(input.duty ?? 0.5, `${path}.duty`, 0.05, 0.95);
    const intensity = number(input.intensity, `${path}.intensity`, 0, 1);
    return {
      durationSec: number(input.durationSec, `${path}.durationSec`, 1, 7200),
      pulseHz,
      pulseHzEnd,
      duty,
      dutyEnd: number(input.dutyEnd ?? duty, `${path}.dutyEnd`, 0.05, 0.95),
      intensity,
      intensityEnd: number(input.intensityEnd ?? intensity, `${path}.intensityEnd`, 0, 1),
    };
  }

  function validateChannel(input, side, kind, durationSec) {
    const path = `profile.${kind}.channels.${side}`;
    object(input, path);
    knownKeys(input, ["delaySec", "phaseDeg", "segments"], path);
    if (!Array.isArray(input.segments) || input.segments.length < 1 || input.segments.length > 128) {
      fail(`${path}.segments must contain 1-128 segments`);
    }
    const delaySec = number(input.delaySec ?? 0, `${path}.delaySec`, 0, 10800);
    const phaseDeg = number(input.phaseDeg ?? 0, `${path}.phaseDeg`, 0, 360);
    const validate = kind === "audio" ? validateAudioSegment : validateVisualSegment;
    const segments = input.segments.map((segment, index) => validate(segment, index, side));
    if (delaySec + segments.reduce((sum, segment) => sum + segment.durationSec, 0) > durationSec) {
      fail(`${path} may not exceed profile.durationSec including its delay`);
    }
    return { delaySec, phaseDeg, segments };
  }

  function validateChannels(input, kind, durationSec) {
    object(input, `profile.${kind}.channels`);
    knownKeys(input, ["left", "right"], `profile.${kind}.channels`);
    if (!input.left || !input.right) fail(`profile.${kind}.channels must contain left and right`);
    return {
      left: validateChannel(input.left, "left", kind, durationSec),
      right: validateChannel(input.right, "right", kind, durationSec),
    };
  }

  function validateAudio(input, durationSec) {
    object(input, "profile.audio");
    knownKeys(input, ["masterVolume", "rampSec", "channels"], "profile.audio");
    return {
      masterVolume: number(input.masterVolume ?? 0.12, "profile.audio.masterVolume", 0, 0.8),
      rampSec: number(input.rampSec ?? 0.01, "profile.audio.rampSec", 0.001, 0.03),
      channels: validateChannels(input.channels, "audio", durationSec),
    };
  }

  function validateVisual(input, durationSec) {
    object(input, "profile.visual");
    knownKeys(input, ["channels"], "profile.visual");
    return { channels: validateChannels(input.channels, "visual", durationSec) };
  }

  function validateRequiredOutputs(input, described) {
    if (!Array.isArray(input)) fail("profile.requiredOutputs must be an array");
    const result = input.map((value, index) => string(value, `profile.requiredOutputs[${index}]`, { min: 1, max: 20 }));
    if (new Set(result).size !== result.length) fail("profile.requiredOutputs must not contain duplicates");
    for (const output of result) {
      if (!OUTPUTS.includes(output)) fail(`profile.requiredOutputs contains unsupported output ${output}`);
      if (!described.includes(output)) fail(`profile.requiredOutputs cannot require missing profile.${output}`);
    }
    return result;
  }

  function validateProfileV2(input) {
    object(input, "profile");
    knownKeys(input, ["format", "version", "method", "id", "name", "description", "durationSec", "requiredOutputs", "audio", "visual"], "profile");
    if (input.format !== PROFILE_FORMAT) fail(`profile.format must be ${PROFILE_FORMAT}`);
    if (input.version !== PROFILE_VERSION) fail(`profile.version must be ${PROFILE_VERSION}`);
    if (input.method !== "hemispheric") fail("profile.method must be hemispheric");
    const durationSec = number(input.durationSec, "profile.durationSec", 1, 10800);
    const described = OUTPUTS.filter((output) => input[output] !== undefined);
    if (!described.length) fail("profile must describe audio, visual, or both");
    const profile = {
      format: PROFILE_FORMAT,
      version: PROFILE_VERSION,
      method: "hemispheric",
      id: id(input.id, "profile.id"),
      name: string(input.name, "profile.name", { min: 1, max: 80 }),
      description: string(input.description ?? "", "profile.description", { max: 500 }),
      durationSec,
      requiredOutputs: validateRequiredOutputs(input.requiredOutputs ?? [], described),
    };
    if (input.audio !== undefined) profile.audio = validateAudio(input.audio, durationSec);
    if (input.visual !== undefined) profile.visual = validateVisual(input.visual, durationSec);
    return profile;
  }

  function validateLegacyProfile(input) {
    object(input, "profile");
    knownKeys(input, ["format", "version", "method", "id", "name", "description", "masterVolume", "rampSec", "channels"], "profile");
    if (input.format !== PROFILE_FORMAT) fail(`profile.format must be ${PROFILE_FORMAT}`);
    if (input.version !== 1) fail("profile.version must be 1 or 2");
    if (input.method !== "hemispheric") fail("profile.method must be hemispheric");
    object(input.channels, "profile.channels");
    knownKeys(input.channels, ["left", "right"], "profile.channels");
    if (!input.channels.left || !input.channels.right) fail("profile.channels must contain left and right");

    function migrateLegacyChannel(channel, side) {
      const path = `profile.channels.${side}`;
      object(channel, path);
      knownKeys(channel, ["delaySec", "segments"], path);
      if (!Array.isArray(channel.segments) || channel.segments.length < 1 || channel.segments.length > 128) fail(`${path}.segments must contain 1-128 segments`);
      const legacy = channel.segments.map((segment, index) => {
        object(segment, `${path}.segments[${index}]`);
        knownKeys(segment, ["durationSec", "carrierHz", "carrierHzEnd", "pulseHz", "pulseHzEnd", "duty", "dutyEnd", "volume", "volumeEnd", "phaseDeg"], `${path}.segments[${index}]`);
        const { phaseDeg: _legacyPhase, ...audioSegment } = segment;
        const clean = validateAudioSegment(audioSegment, index, side, "profile.channels");
        return { clean, phaseDeg: number(segment.phaseDeg ?? 0, `${path}.segments[${index}].phaseDeg`, 0, 360) };
      });
      const initialPhase = legacy[0].phaseDeg;
      return {
        delaySec: number(channel.delaySec ?? 0, `${path}.delaySec`, 0, 10800),
        phaseDeg: initialPhase,
        segments: legacy.map(({ clean, phaseDeg }, index) => (
          index > 0 && phaseDeg !== legacy[index - 1].phaseDeg ? { ...clean, resetPhaseDeg: phaseDeg } : clean
        )),
      };
    }

    const channels = {
      left: migrateLegacyChannel(input.channels.left, "left"),
      right: migrateLegacyChannel(input.channels.right, "right"),
    };
    const durationSec = Math.max(...Object.values(channels).map((channel) => channel.delaySec + channel.segments.reduce((sum, segment) => sum + segment.durationSec, 0)));
    return validateProfileV2({
      format: PROFILE_FORMAT,
      version: PROFILE_VERSION,
      method: "hemispheric",
      id: input.id,
      name: input.name,
      description: input.description,
      durationSec,
      requiredOutputs: ["audio"],
      audio: { masterVolume: input.masterVolume, rampSec: input.rampSec, channels },
    });
  }

  function validateProfile(input) {
    if (input?.version === 1) return validateLegacyProfile(input);
    return validateProfileV2(input);
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
    knownKeys(input, ["id", "profileId", "startedAt", "endedAt", "status", "before", "after", "note", "beforeNote", "afterNote", "outputsUsed"], "session");
    const profileId = id(input.profileId, "session.profileId");
    if (!profiles.has(profileId)) fail("session.profileId refers to an unknown profile");
    const startedAt = isoDate(input.startedAt, "session.startedAt");
    const endedAt = isoDate(input.endedAt, "session.endedAt");
    if (Date.parse(endedAt) < Date.parse(startedAt)) fail("session.endedAt cannot precede session.startedAt");
    if (!["completed", "stopped"].includes(input.status)) fail("session.status must be completed or stopped");
    if (!Array.isArray(input.outputsUsed ?? ["audio"])) fail("session.outputsUsed must be an array");
    const outputsUsed = (input.outputsUsed ?? ["audio"]).map((output, index) => string(output, `session.outputsUsed[${index}]`, { min: 1, max: 20 }));
    if (!outputsUsed.length || new Set(outputsUsed).size !== outputsUsed.length || outputsUsed.some((output) => !OUTPUTS.includes(output))) {
      fail("session.outputsUsed must contain unique audio and/or visual values");
    }
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
      outputsUsed,
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
    if (input.version !== 1 && input.version !== BACKUP_VERSION) fail(`backup.version must be 1 or ${BACKUP_VERSION}`);
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
    return validateProfile(profile).durationSec;
  }

  function channelAtTime(channel, elapsedSec, kind = "audio") {
    const localTime = elapsedSec - channel.delaySec;
    const first = channel.segments[0];
    const initial = kind === "audio"
      ? { carrierHz: first.carrierHz, pulseHz: first.pulseHz, duty: first.duty, volume: 0, phaseDeg: channel.phaseDeg }
      : { pulseHz: first.pulseHz, duty: first.duty, intensity: 0, phaseDeg: channel.phaseDeg };
    if (localTime < 0) return { index: -1, fraction: 0, active: false, ...initial };
    let phaseDeg = channel.phaseDeg;
    let offset = 0;
    for (let index = 0; index < channel.segments.length; index += 1) {
      const segment = channel.segments[index];
      if (segment.resetPhaseDeg !== undefined) phaseDeg = segment.resetPhaseDeg;
      if (localTime < offset + segment.durationSec) {
        const fraction = Math.max(0, Math.min(1, (localTime - offset) / segment.durationSec));
        const common = {
          index,
          fraction,
          active: true,
          pulseHz: segment.pulseHz + (segment.pulseHzEnd - segment.pulseHz) * fraction,
          duty: segment.duty + (segment.dutyEnd - segment.duty) * fraction,
          phaseDeg,
        };
        return kind === "audio"
          ? { ...common, carrierHz: segment.carrierHz + (segment.carrierHzEnd - segment.carrierHz) * fraction, volume: segment.volume + (segment.volumeEnd - segment.volume) * fraction }
          : { ...common, intensity: segment.intensity + (segment.intensityEnd - segment.intensity) * fraction };
      }
      offset += segment.durationSec;
    }
    const last = channel.segments.at(-1);
    return kind === "audio"
      ? { index: channel.segments.length, fraction: 1, active: false, carrierHz: last.carrierHzEnd, pulseHz: last.pulseHzEnd, duty: last.dutyEnd, volume: 0, phaseDeg }
      : { index: channel.segments.length, fraction: 1, active: false, pulseHz: last.pulseHzEnd, duty: last.dutyEnd, intensity: 0, phaseDeg };
  }

  function atTime(profile, elapsedSec) {
    const clean = validateProfile(profile);
    if (!clean.audio) return { left: null, right: null };
    return {
      left: channelAtTime(clean.audio.channels.left, elapsedSec, "audio"),
      right: channelAtTime(clean.audio.channels.right, elapsedSec, "audio"),
    };
  }

  function visualAtTime(profile, elapsedSec) {
    const clean = validateProfile(profile);
    if (!clean.visual) return { left: null, right: null };
    return {
      left: channelAtTime(clean.visual.channels.left, elapsedSec, "visual"),
      right: channelAtTime(clean.visual.channels.right, elapsedSec, "visual"),
    };
  }

  function selectOutputs(profile, { visual = false } = {}) {
    const clean = validateProfile(profile);
    const outputs = [];
    if (clean.audio) outputs.push("audio");
    if (clean.visual && visual) outputs.push("visual");
    const missing = clean.requiredOutputs.filter((output) => !outputs.includes(output));
    if (missing.length) fail(`session requires ${missing.join(" and ")}`);
    if (!outputs.length) fail("session has no available output");
    return outputs;
  }

  class SessionRunner {
    constructor(tone, timers = root, visual = null) {
      this.tone = tone ?? (root.IsochronicTone ? new root.IsochronicTone() : null);
      this.timers = timers;
      this.visual = visual;
      this.active = null;
      this.starting = false;
      this.visual?.addEventListener?.("fault", () => {
        if (this.active?.outputs.includes("visual")) this.stop("device-fault");
      });
    }

    nowMs() {
      return this.timers.performance?.now?.() ?? root.performance?.now?.() ?? Date.now();
    }

    async start(input, callbacks = {}) {
      if (this.starting) fail("session is already starting");
      if (this.active) this.stop("replaced");
      const profile = validateProfile(input);
      const wantsVisual = callbacks.useVisual === true;
      const visualReady = wantsVisual && this.visual?.connected === true;
      const outputs = selectOutputs(profile, { visual: visualReady });
      if (outputs.includes("audio") && !this.tone) fail("IsochronicTone must be loaded before an audio session");

      this.starting = true;
      let audioStarted = false;
      let visualArmed = false;
      try {
        if (outputs.includes("audio")) await this.tone.prepareTimeline();
        if (outputs.includes("visual")) {
          await this.visual.loadSchedule(profile.visual, profile.durationSec);
          await this.visual.synchronize();
        }

        const startPerformanceMs = this.nowMs() + (outputs.includes("visual") ? 2000 : 180);
        const startAudioSec = outputs.includes("audio") ? this.tone.contextTimeForPerformance(startPerformanceMs) : null;
        if (outputs.includes("visual")) {
          await this.visual.arm(startPerformanceMs);
          visualArmed = true;
        }
        if (outputs.includes("audio")) {
          await this.tone.startTimeline(profile.audio, startAudioSec);
          audioStarted = true;
        }
        if (outputs.includes("visual")) {
          const referenceElapsedUs = outputs.includes("audio")
            ? () => ((this.tone.ctx?.currentTime ?? startAudioSec) - startAudioSec) * 1000000
            : () => (this.nowMs() - startPerformanceMs) * 1000;
          await this.visual.commit(referenceElapsedUs);
        }

        const stateHandler = () => this.reportAudioState();
        this.active = {
          profile,
          outputs,
          callbacks,
          startPerformanceMs,
          startAudioSec,
          lastAudioState: this.tone?.ctx?.state ?? "running",
          stateHandler,
          timer: this.timers.setInterval(() => this.tick(), 250),
        };
        this.tone?.ctx?.addEventListener?.("statechange", stateHandler);
        callbacks.onStart?.({ outputs: [...outputs], startPerformanceMs });
        this.tick();
        return { profile, outputs: [...outputs] };
      } catch (error) {
        if (audioStarted) this.tone.stop();
        if (visualArmed) this.visual.stop().catch(() => {});
        throw error;
      } finally {
        this.starting = false;
      }
    }

    reportAudioState() {
      if (!this.active?.outputs.includes("audio")) return;
      const audioState = this.tone.ctx?.state ?? "running";
      if (audioState === this.active.lastAudioState) return;
      this.active.lastAudioState = audioState;
      if (audioState !== "running" && this.active.outputs.includes("visual")) {
        this.stop("audio-interrupted");
        return;
      }
      this.active.callbacks.onAudioState?.(audioState);
    }

    elapsedSec() {
      if (!this.active) return 0;
      if (this.active.outputs.length === 1 && this.active.outputs[0] === "audio") {
        return Math.max(0, (this.tone.ctx?.currentTime ?? this.active.startAudioSec) - this.active.startAudioSec);
      }
      return Math.max(0, (this.nowMs() - this.active.startPerformanceMs) / 1000);
    }

    tick() {
      if (!this.active) return;
      const active = this.active;
      this.reportAudioState();
      if (!this.active) return;
      const elapsedSec = this.elapsedSec();
      if (elapsedSec >= active.profile.durationSec) {
        this.finish("completed", active.profile.durationSec);
        return;
      }
      active.callbacks.onProgress?.({
        elapsedSec,
        durationSec: active.profile.durationSec,
        audio: active.profile.audio ? atTime(active.profile, elapsedSec) : null,
        visual: active.profile.visual ? visualAtTime(active.profile, elapsedSec) : null,
      });
    }

    async resumeAudio() {
      if (this.active?.outputs.includes("visual")) fail("A visual session must be restarted to restore synchronization");
      if (this.tone?.ctx?.state !== "running") await this.tone?.ctx?.resume?.();
    }

    stop(status = "stopped") {
      if (!this.active) return;
      this.finish(status, this.elapsedSec());
    }

    finish(status, elapsedSec) {
      const active = this.active;
      if (!active) return;
      this.active = null;
      this.timers.clearInterval(active.timer);
      this.tone?.ctx?.removeEventListener?.("statechange", active.stateHandler);
      if (active.outputs.includes("audio")) this.tone.stop();
      if (active.outputs.includes("visual")) this.visual.stop().catch(() => {});
      active.callbacks.onEnd?.({ status, elapsedSec, durationSec: active.profile.durationSec, outputs: [...active.outputs] });
    }
  }

  const api = {
    LocalStore,
    SessionRunner,
    atTime,
    emptyBackup,
    parseProfileFile,
    selectOutputs,
    totalDuration,
    validateBackup,
    validateGoal,
    validateProfile,
    visualAtTime,
  };

  root.EntrainmentCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
