const refs = {
  analysisType: document.getElementById("analysisType"),
  coherenceNorms: document.getElementById("coherenceNorms"),
  zscoreMode: document.getElementById("zscoreMode"),
  subjectAge: document.getElementById("subjectAge"),
  mode: document.getElementById("mode"),
  serialPort: document.getElementById("serialPort"),
  epochSeconds: document.getElementById("epochSeconds"),
  repositionSeconds: document.getElementById("repositionSeconds"),
  useSynthetic: document.getElementById("useSynthetic"),
  fastMode: document.getElementById("fastMode"),
  includeFrontalBaseline: document.getElementById("includeFrontalBaseline"),
  manualReposition: document.getElementById("manualReposition"),
  soundCues: document.getElementById("soundCues"),
  cueLead: document.getElementById("cueLead"),
  chCz: document.getElementById("chCz"),
  chO1: document.getElementById("chO1"),
  chFz: document.getElementById("chFz"),
  chF3: document.getElementById("chF3"),
  chF4: document.getElementById("chF4"),
  clinicalqChannelMapSection: document.getElementById("clinicalqChannelMapSection"),
  qeegSettings: document.getElementById("qeegSettings"),
  qeegHardware: document.getElementById("qeegHardware"),
  qeegElectrodesPerReading: document.getElementById("qeegElectrodesPerReading"),
  qeegReadingCount: document.getElementById("qeegReadingCount"),
  qeegActiveReading: document.getElementById("qeegActiveReading"),
  qeegPairCoverage: document.getElementById("qeegPairCoverage"),
  qeegTargetLocations: document.getElementById("qeegTargetLocations"),
  qeegAutoPlanBtn: document.getElementById("qeegAutoPlanBtn"),
  qeegAnalyzePlanBtn: document.getElementById("qeegAnalyzePlanBtn"),
  qeegCombineRuns: document.getElementById("qeegCombineRuns"),
  qeegPlanSummary: document.getElementById("qeegPlanSummary"),
  qeegReadings: document.getElementById("qeegReadings"),
  qeegChannelTableBody: document.getElementById("qeegChannelTableBody"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  readyBtn: document.getElementById("readyBtn"),
  readyHint: document.getElementById("readyHint"),
  followActive: document.getElementById("followActive"),
  bandLoc: document.getElementById("bandLoc"),
  bandDelta: document.getElementById("bandDelta"),
  bandTheta: document.getElementById("bandTheta"),
  bandAlpha: document.getElementById("bandAlpha"),
  bandBeta: document.getElementById("bandBeta"),
  bandHiBeta: document.getElementById("bandHiBeta"),
  bandCanvas: document.getElementById("bandCanvas"),
  bandValues: document.getElementById("bandValues"),
  pythonStatus: document.getElementById("pythonStatus"),
  liveEvent: document.getElementById("liveEvent"),
  cueBanner: document.getElementById("cueBanner"),
  countdown: document.getElementById("countdown"),
  eventLog: document.getElementById("eventLog"),
  resultsTableBody: document.querySelector("#resultsTable tbody"),
  summary: document.getElementById("summary"),
  probeList: document.getElementById("probeList"),
  openResultBtn: document.getElementById("openResultBtn"),
  resultFilter: document.getElementById("resultFilter"),
  resultSource: document.getElementById("resultSource"),
  keyMetrics: document.getElementById("keyMetrics"),
  vizMetricType: document.getElementById("vizMetricType"),
  vizSiteBand: document.getElementById("vizSiteBand"),
  vizPairBand: document.getElementById("vizPairBand"),
  vizPairMetric: document.getElementById("vizPairMetric"),
  vizPairThreshold: document.getElementById("vizPairThreshold"),
  vizPairShowAll: document.getElementById("vizPairShowAll"),
  vizHeadCanvas: document.getElementById("vizHeadCanvas"),
  vizPairCanvas: document.getElementById("vizPairCanvas"),
  vizSummary: document.getElementById("vizSummary"),
};

const BAND_META = {
  delta: { label: "Delta", color: "#a9302f" },
  theta: { label: "Theta", color: "#0b8da3" },
  alpha: { label: "Alpha", color: "#9b5b00" },
  beta: { label: "Beta", color: "#1f7d48" },
  hibeta: { label: "HiBeta", color: "#2b3a46" },
};

const LEGACY_LOCATION_MAP = {
  T3: "T7",
  T4: "T8",
  T5: "P7",
  T6: "P8",
};

const DISPLAY_LOCATION_MAP = {
  T7: "T3",
  T8: "T4",
  P7: "T5",
  P8: "T6",
};

const HEAD_COORDS_1020 = {
  FP1: [-0.45, 0.92],
  FP2: [0.45, 0.92],
  F7: [-0.82, 0.46],
  F3: [-0.46, 0.52],
  FZ: [0.0, 0.56],
  F4: [0.46, 0.52],
  F8: [0.82, 0.46],
  T7: [-0.9, 0.0],
  C3: [-0.5, 0.02],
  CZ: [0.0, 0.0],
  C4: [0.5, 0.02],
  T8: [0.9, 0.0],
  P7: [-0.8, -0.46],
  P3: [-0.46, -0.46],
  PZ: [0.0, -0.5],
  P4: [0.46, -0.46],
  P8: [0.8, -0.46],
  O1: [-0.34, -0.86],
  OZ: [0.0, -0.9],
  O2: [0.34, -0.86],
};

const HARDWARE_PROFILES = {
  cyton: {
    id: "cyton",
    boardId: "cyton",
    maxChannels: 8,
    referenceMap: {
      CZ: 1,
      O1: 2,
      FZ: 3,
      F3: 4,
      F4: 5,
      O2: 6,
      PZ: 7,
      C3: 8,
    },
  },
  cyton_daisy: {
    id: "cyton_daisy",
    boardId: "cyton_daisy",
    maxChannels: 16,
    referenceMap: {
      FP1: 1,
      FP2: 2,
      F7: 3,
      F3: 4,
      FZ: 5,
      F4: 6,
      F8: 7,
      T7: 8,
      C3: 9,
      CZ: 10,
      C4: 11,
      T8: 12,
      P3: 13,
      PZ: 14,
      P4: 15,
      O1: 16,
    },
  },
};

const DEFAULT_TARGET_LOCATIONS = [
  "FP1",
  "FP2",
  "F7",
  "F3",
  "FZ",
  "F4",
  "F8",
  "T3",
  "C3",
  "CZ",
  "C4",
  "T4",
  "T5",
  "P3",
  "PZ",
  "P4",
  "T6",
  "O1",
  "O2",
];

let running = false;
let pendingReadyLocation = null;
let activeLocation = null;
let audioCtx = null;
let epochContext = null;
let nextWarnedEpochKey = null;
let lastEpochLabel = null;

const bandState = {
  epochKey: null,
  sequence: null,
  index: null,
  label: null,
  byLocation: {},
};

const qeegState = {
  readings: [],
  activeReading: 0,
};

const resultState = {
  metrics: [],
  summary: { in_range: 0, out_of_range: 0, missing: 0, potential_symptom_questions: [] },
  sourceLabel: "live session",
  rawResult: null,
  coherenceRows: [],
  combinedRuns: 0,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function canonicalLocation(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  return LEGACY_LOCATION_MAP[raw] || raw;
}

function displayLocation(value) {
  const canonical = canonicalLocation(value);
  if (!canonical) return "";
  return DISPLAY_LOCATION_MAP[canonical] || canonical;
}

function displayLocationLabel(text) {
  return String(text || "").replace(/\b(T7|T8|P7|P8)\b/gi, (match) => {
    const key = String(match).toUpperCase();
    return DISPLAY_LOCATION_MAP[key] || key;
  });
}

function parseLocationList(text) {
  const out = [];
  const seen = new Set();
  const parts = String(text || "").split(/[\s,;|]+/g);
  for (const part of parts) {
    const loc = canonicalLocation(part);
    if (!loc) continue;
    if (!/^[A-Z0-9]+$/.test(loc)) continue;
    if (seen.has(loc)) continue;
    seen.add(loc);
    out.push(loc);
  }
  return out;
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return Number.NaN;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function formatValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return numeric.toFixed(3);
}

function normalizeStatus(status) {
  const normalized = String(status || "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
  if (["IN_RANGE", "IN", "PASS", "OK"].includes(normalized)) return "IN_RANGE";
  if (["OUT_OF_RANGE", "OUT", "FAIL"].includes(normalized)) return "OUT_OF_RANGE";
  return "MISSING";
}

function statusBadge(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "IN_RANGE") return { text: "IN", cls: "in" };
  if (normalized === "OUT_OF_RANGE") return { text: "OUT", cls: "out" };
  return { text: "MISSING", cls: "missing" };
}

function pairKey(a, b) {
  const left = canonicalLocation(a);
  const right = canonicalLocation(b);
  if (!left || !right || left === right) return "";
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function pairFromKey(key) {
  const [left, right] = String(key || "").split("|");
  return [left || "", right || ""];
}

function allPairsFromLocations(locations) {
  const out = [];
  for (let i = 0; i < locations.length; i += 1) {
    for (let j = i + 1; j < locations.length; j += 1) {
      out.push([locations[i], locations[j]]);
    }
  }
  return out;
}

function selectedAnalysisType() {
  return String(refs.analysisType?.value || "clinicalq").toLowerCase();
}

function selectedZscoreMode() {
  return String(refs.zscoreMode?.value || "global").toLowerCase();
}

function selectedHardwareProfile() {
  const key = String(refs.qeegHardware?.value || "cyton").toLowerCase();
  return HARDWARE_PROFILES[key] || HARDWARE_PROFILES.cyton;
}

function hardwareMaxChannels() {
  return selectedHardwareProfile().maxChannels;
}

function electrodesPerReading() {
  const maxCh = hardwareMaxChannels();
  const raw = Number(refs.qeegElectrodesPerReading?.value || maxCh);
  const value = clamp(Number.isFinite(raw) ? Math.floor(raw) : maxCh, 2, maxCh);
  if (refs.qeegElectrodesPerReading) {
    refs.qeegElectrodesPerReading.max = String(maxCh);
    refs.qeegElectrodesPerReading.value = String(value);
  }
  return value;
}

function readingCount() {
  const raw = Number(refs.qeegReadingCount?.value || 2);
  const value = clamp(Number.isFinite(raw) ? Math.floor(raw) : 2, 1, 6);
  if (refs.qeegReadingCount) refs.qeegReadingCount.value = String(value);
  return value;
}

function ensureReadingSlots() {
  const count = readingCount();
  while (qeegState.readings.length < count) {
    qeegState.readings.push({ locations: [], channelMap: {} });
  }
  if (qeegState.readings.length > count) qeegState.readings.length = count;
  qeegState.activeReading = clamp(qeegState.activeReading, 0, Math.max(0, count - 1));
}

function ensureBandLocationSeries(loc) {
  const key = canonicalLocation(loc);
  if (!key) return;
  if (!Object.prototype.hasOwnProperty.call(bandState.byLocation, key)) {
    bandState.byLocation[key] = { delta: [], theta: [], alpha: [], beta: [], hibeta: [] };
  }
}

function refreshBandLocationOptions(preferred = "") {
  if (!refs.bandLoc) return;
  const sorted = Object.keys(bandState.byLocation).sort();
  const desired = canonicalLocation(preferred) || canonicalLocation(refs.bandLoc.value);
  refs.bandLoc.innerHTML = "";
  for (const loc of sorted) {
    const option = document.createElement("option");
    option.value = loc;
    option.textContent = displayLocation(loc);
    refs.bandLoc.appendChild(option);
  }
  if (!sorted.length) return;
  refs.bandLoc.value = sorted.includes(desired) ? desired : sorted[0];
}

function seedBandLocations(locations) {
  for (const loc of locations) ensureBandLocationSeries(loc);
  refreshBandLocationOptions(activeLocation || "");
}

function fillMissingChannelAssignments(readingIndex) {
  const reading = qeegState.readings[readingIndex];
  if (!reading) return;
  const profile = selectedHardwareProfile();
  const maxCh = profile.maxChannels;
  const refMap = profile.referenceMap;

  const normalized = {};
  const used = new Set();

  for (const loc of reading.locations) {
    const current = Number(reading.channelMap?.[loc]);
    if (Number.isInteger(current) && current >= 1 && current <= maxCh) {
      normalized[loc] = current;
      used.add(current);
    }
  }

  const nextFree = () => {
    for (let ch = 1; ch <= maxCh; ch += 1) {
      if (!used.has(ch)) return ch;
    }
    return 1;
  };

  for (const loc of reading.locations) {
    if (Object.prototype.hasOwnProperty.call(normalized, loc)) continue;
    const ref = Number(refMap?.[loc]);
    let chosen = Number.isInteger(ref) && ref >= 1 && ref <= maxCh && !used.has(ref) ? ref : nextFree();
    normalized[loc] = chosen;
    used.add(chosen);
  }

  reading.channelMap = normalized;
}

function duplicateChannels(channelMap) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of Object.values(channelMap || {})) {
    const ch = Number(value);
    if (!Number.isInteger(ch)) continue;
    if (seen.has(ch)) dupes.add(ch);
    seen.add(ch);
  }
  return [...dupes].sort((a, b) => a - b);
}

function targetLocations() {
  const list = parseLocationList(refs.qeegTargetLocations?.value || "");
  return list.length ? list : [...DEFAULT_TARGET_LOCATIONS];
}

function targetPairKeySet() {
  const set = new Set();
  const locations = targetLocations();
  for (const [a, b] of allPairsFromLocations(locations)) {
    const key = pairKey(a, b);
    if (key) set.add(key);
  }
  return set;
}

function suggestPlacementForMissing(missingPairKeys, capacity) {
  if (!missingPairKeys.length || capacity <= 1) return [];

  const missingPairs = missingPairKeys.map((key) => pairFromKey(key));
  const candidates = new Set();
  for (const [a, b] of missingPairs) {
    if (a) candidates.add(a);
    if (b) candidates.add(b);
  }

  const selected = [];
  while (selected.length < capacity && candidates.size > selected.length) {
    let best = "";
    let bestGain = -1;

    for (const loc of candidates) {
      if (selected.includes(loc)) continue;
      let gain = 0;
      for (const [a, b] of missingPairs) {
        const currentCovered = selected.includes(a) && selected.includes(b);
        if (currentCovered) continue;
        const nextCovered = (a === loc || selected.includes(a)) && (b === loc || selected.includes(b));
        if (nextCovered) gain += 1;
      }
      if (gain > bestGain) {
        bestGain = gain;
        best = loc;
      }
    }

    if (!best) break;
    selected.push(best);
    if (bestGain <= 0 && selected.length >= 2) break;
  }

  return selected;
}

function analyzeQeegPlan() {
  const targetPairs = targetPairKeySet();
  const coveredPairs = new Set();
  const perReading = [];

  for (const reading of qeegState.readings) {
    const localPairs = allPairsFromLocations(reading.locations);
    let matched = 0;
    for (const [a, b] of localPairs) {
      const key = pairKey(a, b);
      if (!key) continue;
      if (!targetPairs.size || targetPairs.has(key)) {
        if (!coveredPairs.has(key)) matched += 1;
        coveredPairs.add(key);
      }
    }
    perReading.push({
      electrodes: reading.locations.length,
      pairs: localPairs.length,
      targetPairsCoveredNow: matched,
    });
  }

  const missing = [];
  for (const key of targetPairs) {
    if (!coveredPairs.has(key)) missing.push(key);
  }

  const suggestion = suggestPlacementForMissing(missing, electrodesPerReading());
  return {
    targetLocationCount: targetLocations().length,
    targetPairCount: targetPairs.size,
    coveredPairCount: coveredPairs.size,
    missingPairCount: missing.length,
    missingPairKeys: missing,
    suggestion,
    perReading,
  };
}

function renderActiveReadingSelector() {
  if (!refs.qeegActiveReading) return;
  refs.qeegActiveReading.innerHTML = "";
  for (let i = 0; i < qeegState.readings.length; i += 1) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = `Reading ${i + 1}`;
    refs.qeegActiveReading.appendChild(option);
  }
  refs.qeegActiveReading.value = String(qeegState.activeReading);
}

function renderQeegReadings() {
  if (!refs.qeegReadings) return;
  refs.qeegReadings.innerHTML = "";
  const limit = electrodesPerReading();

  qeegState.readings.forEach((reading, idx) => {
    const card = document.createElement("div");
    card.className = "qeeg-reading-card";

    const head = document.createElement("div");
    head.className = "qeeg-reading-head";

    const title = document.createElement("div");
    title.className = "qeeg-reading-title";
    title.textContent = `Reading ${idx + 1}`;

    const stats = document.createElement("div");
    stats.className = "qeeg-reading-stats";
    stats.textContent = `${reading.locations.length}/${limit} electrodes`;

    head.appendChild(title);
    head.appendChild(stats);

    const row = document.createElement("div");
    row.className = "grid two-col";

    const label = document.createElement("label");
    label.textContent = "Mounted locations";
    const area = document.createElement("textarea");
    area.rows = 2;
    area.value = reading.locations.map((loc) => displayLocation(loc)).join(", ");
    area.placeholder = "Example: F3, F4, Cz, Pz, O1";
    area.addEventListener("change", () => {
      const parsed = parseLocationList(area.value).slice(0, limit);
      reading.locations = parsed;
      fillMissingChannelAssignments(idx);
      if (idx === qeegState.activeReading) {
        renderQeegChannelMap();
        seedBandLocations(parsed);
      }
      renderQeegReadings();
      updateQeegPlanSummary();
    });
    label.appendChild(area);

    const controls = document.createElement("div");
    controls.className = "actions";

    const useBtn = document.createElement("button");
    useBtn.type = "button";
    useBtn.className = idx === qeegState.activeReading ? "primary" : "secondary";
    useBtn.textContent = idx === qeegState.activeReading ? "Active Reading" : "Use For Next Run";
    useBtn.disabled = idx === qeegState.activeReading;
    useBtn.addEventListener("click", () => {
      qeegState.activeReading = idx;
      renderActiveReadingSelector();
      renderQeegReadings();
      renderQeegChannelMap();
      seedBandLocations(reading.locations);
      syncSessionUi();
    });
    controls.appendChild(useBtn);

    row.appendChild(label);
    row.appendChild(controls);

    card.appendChild(head);
    card.appendChild(row);
    refs.qeegReadings.appendChild(card);
  });
}

function renderQeegChannelMap() {
  if (!refs.qeegChannelTableBody) return;
  const reading = qeegState.readings[qeegState.activeReading];
  refs.qeegChannelTableBody.innerHTML = "";
  if (!reading || !reading.locations.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 2;
    td.textContent = "No locations defined for this reading.";
    tr.appendChild(td);
    refs.qeegChannelTableBody.appendChild(tr);
    return;
  }

  fillMissingChannelAssignments(qeegState.activeReading);
  const maxCh = hardwareMaxChannels();

  for (const loc of reading.locations) {
    const tr = document.createElement("tr");

    const locTd = document.createElement("td");
    locTd.textContent = displayLocation(loc);
    tr.appendChild(locTd);

    const chTd = document.createElement("td");
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = String(maxCh);
    input.value = String(reading.channelMap?.[loc] || "");
    input.addEventListener("change", () => {
      const numeric = Number(input.value);
      if (Number.isInteger(numeric) && numeric >= 1 && numeric <= maxCh) {
        reading.channelMap[loc] = numeric;
      }
      updateQeegPlanSummary();
    });
    chTd.appendChild(input);
    tr.appendChild(chTd);

    refs.qeegChannelTableBody.appendChild(tr);
  }
}

function updateQeegPlanSummary() {
  if (!refs.qeegPlanSummary) return;
  const report = analyzeQeegPlan();
  const missingPreview = report.missingPairKeys
    .slice(0, 12)
    .map((key) => pairFromKey(key).map((loc) => displayLocation(loc)).join("-"));
  const activeMap = qeegState.readings[qeegState.activeReading]?.channelMap || {};
  const dupes = duplicateChannels(activeMap);

  const lines = [
    `Target locations: ${report.targetLocationCount}`,
    `Target pairs: ${report.targetPairCount}`,
    `Covered pairs: ${report.coveredPairCount}`,
    `Missing pairs: ${report.missingPairCount}`,
  ];

  if (dupes.length) {
    lines.push(`Warning: duplicate channel assignments in active reading: ${dupes.join(", ")}`);
  }

  if (report.suggestion.length) {
    lines.push(
      `Suggested next placement (${electrodesPerReading()} max): ${report.suggestion
        .map((loc) => displayLocation(loc))
        .join(", ")}`
    );
  }

  if (missingPreview.length) {
    lines.push(`Missing pair examples: ${missingPreview.join(", ")}${report.missingPairCount > missingPreview.length ? " ..." : ""}`);
  }

  refs.qeegPlanSummary.textContent = lines.join(" | ");
}

function autoPlanReadings() {
  ensureReadingSlots();
  const targets = targetLocations();
  const capacity = electrodesPerReading();
  let cursor = 0;

  for (let i = 0; i < qeegState.readings.length; i += 1) {
    const base = targets.slice(cursor, cursor + capacity);
    cursor += base.length;

    const fill = [];
    let ptr = 0;
    while (base.length + fill.length < capacity && targets.length) {
      const candidate = targets[ptr % targets.length];
      if (!base.includes(candidate) && !fill.includes(candidate)) fill.push(candidate);
      ptr += 1;
      if (ptr > targets.length * 2) break;
    }

    qeegState.readings[i].locations = [...base, ...fill].slice(0, capacity);
    fillMissingChannelAssignments(i);
  }

  renderQeegReadings();
  renderQeegChannelMap();
  updateQeegPlanSummary();

  const active = qeegState.readings[qeegState.activeReading];
  seedBandLocations(active?.locations || []);
}

function initializeQeegPlanner() {
  ensureReadingSlots();

  if (!refs.qeegTargetLocations?.value?.trim()) {
    refs.qeegTargetLocations.value = DEFAULT_TARGET_LOCATIONS.join(", ");
  }

  autoPlanReadings();
  renderActiveReadingSelector();

  if (refs.qeegActiveReading) {
    refs.qeegActiveReading.addEventListener("change", () => {
      const idx = Number(refs.qeegActiveReading.value);
      qeegState.activeReading = clamp(Number.isFinite(idx) ? idx : 0, 0, Math.max(0, qeegState.readings.length - 1));
      renderQeegReadings();
      renderQeegChannelMap();
      updateQeegPlanSummary();
      const active = qeegState.readings[qeegState.activeReading];
      seedBandLocations(active?.locations || []);
      syncSessionUi();
    });
  }

  if (refs.qeegHardware) {
    refs.qeegHardware.addEventListener("change", () => {
      electrodesPerReading();
      for (let i = 0; i < qeegState.readings.length; i += 1) fillMissingChannelAssignments(i);
      renderQeegReadings();
      renderQeegChannelMap();
      updateQeegPlanSummary();
      syncSessionUi();
    });
  }

  if (refs.qeegElectrodesPerReading) {
    refs.qeegElectrodesPerReading.addEventListener("change", () => {
      const limit = electrodesPerReading();
      for (let i = 0; i < qeegState.readings.length; i += 1) {
        qeegState.readings[i].locations = qeegState.readings[i].locations.slice(0, limit);
        fillMissingChannelAssignments(i);
      }
      renderQeegReadings();
      renderQeegChannelMap();
      updateQeegPlanSummary();
    });
  }

  if (refs.qeegReadingCount) {
    refs.qeegReadingCount.addEventListener("change", () => {
      ensureReadingSlots();
      renderActiveReadingSelector();
      renderQeegReadings();
      renderQeegChannelMap();
      updateQeegPlanSummary();
      syncSessionUi();
    });
  }

  if (refs.qeegTargetLocations) {
    refs.qeegTargetLocations.addEventListener("change", () => {
      updateQeegPlanSummary();
    });
  }

  if (refs.qeegPairCoverage) {
    refs.qeegPairCoverage.addEventListener("change", () => {
      updateQeegPlanSummary();
    });
  }

  if (refs.qeegAutoPlanBtn) {
    refs.qeegAutoPlanBtn.addEventListener("click", () => {
      autoPlanReadings();
      appendEventRow("QEEG auto-plan generated.");
    });
  }

  if (refs.qeegAnalyzePlanBtn) {
    refs.qeegAnalyzePlanBtn.addEventListener("click", () => {
      updateQeegPlanSummary();
      appendEventRow("QEEG plan coverage updated.");
    });
  }
}

function shouldLogEvent(name) {
  return !["epoch_tick", "reposition_tick", "bandpower"].includes(String(name || ""));
}

function cueLeadSeconds() {
  const value = Number(refs.cueLead?.value);
  if (!Number.isFinite(value)) return 3;
  return clamp(Math.floor(value), 0, 10);
}

function ensureAudio() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  return audioCtx;
}

async function warmAudio() {
  if (!refs.soundCues?.checked) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") await ctx.resume();
  } catch {
    // ignore
  }
}

function beepOnce(freq, durationSec) {
  if (!refs.soundCues?.checked) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => undefined);

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.value = 0.04;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + durationSec);
}

function cuePattern(label) {
  const normalized = String(label || "").toUpperCase();
  if (normalized === "EO") return { freq: 660, count: 1 };
  if (normalized === "EC" || normalized === "FRONTAL_EC") return { freq: 440, count: 2 };
  if (["READ", "COUNT", "OMNI", "TEST", "HARMONIC"].includes(normalized)) return { freq: 880, count: 3 };
  return { freq: 520, count: 1 };
}

function playCue(label) {
  const pat = cuePattern(label);
  for (let i = 0; i < pat.count; i += 1) {
    window.setTimeout(() => beepOnce(pat.freq, 0.12), i * 160);
  }
}

function setCueBanner(text) {
  if (!refs.cueBanner) return;
  refs.cueBanner.textContent = text || "";
}

function setCountdown(text) {
  if (!refs.countdown) return;
  refs.countdown.textContent = text || "";
}

function resetBandState(epochKeyValue) {
  bandState.epochKey = epochKeyValue;
  for (const loc of Object.keys(bandState.byLocation)) {
    bandState.byLocation[loc] = { delta: [], theta: [], alpha: [], beta: [], hibeta: [] };
  }
  drawBandpower();
}

function nowStamp() {
  return new Date().toLocaleTimeString();
}

function appendEventRow(text) {
  if (!refs.eventLog) return;
  const row = document.createElement("div");
  row.className = "event-row";
  row.textContent = `[${nowStamp()}] ${text}`;
  refs.eventLog.prepend(row);
}

function setReadyState(location) {
  pendingReadyLocation = location || null;
  if (!refs.readyBtn || !refs.readyHint) return;
  if (pendingReadyLocation) {
    const shown = displayLocationLabel(pendingReadyLocation);
    refs.readyBtn.disabled = false;
    refs.readyBtn.textContent = `Ready: ${shown}`;
    refs.readyHint.textContent = "After moving the electrode, click Ready to continue.";
  } else {
    refs.readyBtn.disabled = true;
    refs.readyBtn.textContent = "Ready";
    refs.readyHint.textContent = "";
  }
}

function epochKey(event) {
  if (!event) return "";
  return `${event.sequence}-${event.index}-${event.label}`;
}

function numberList(text) {
  const matches = String(text || "").match(/-?\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches.map((item) => Number(item)).filter((item) => Number.isFinite(item));
}

function inferStatusFromRange(value, normalRange) {
  if (!Number.isFinite(value)) return "MISSING";
  const text = String(normalRange || "").trim();
  if (!text || text === "-") return "MISSING";

  const absMatch = text.match(/abs.*<=\s*(-?\d+(?:\.\d+)?)/i);
  if (absMatch) {
    const limit = Number(absMatch[1]);
    if (Number.isFinite(limit)) return Math.abs(value) <= limit ? "IN_RANGE" : "OUT_OF_RANGE";
  }

  const lteMatch = text.match(/^\s*<=\s*(-?\d+(?:\.\d+)?)/);
  if (lteMatch) {
    const limit = Number(lteMatch[1]);
    if (Number.isFinite(limit)) return value <= limit ? "IN_RANGE" : "OUT_OF_RANGE";
  }

  const gteMatch = text.match(/^\s*>=\s*(-?\d+(?:\.\d+)?)/);
  if (gteMatch) {
    const limit = Number(gteMatch[1]);
    if (Number.isFinite(limit)) return value >= limit ? "IN_RANGE" : "OUT_OF_RANGE";
  }

  const ltMatch = text.match(/^\s*<\s*(-?\d+(?:\.\d+)?)/);
  if (ltMatch) {
    const limit = Number(ltMatch[1]);
    if (Number.isFinite(limit)) return value < limit ? "IN_RANGE" : "OUT_OF_RANGE";
  }

  const gtMatch = text.match(/^\s*>\s*(-?\d+(?:\.\d+)?)/);
  if (gtMatch) {
    const limit = Number(gtMatch[1]);
    if (Number.isFinite(limit)) return value > limit ? "IN_RANGE" : "OUT_OF_RANGE";
  }

  const rangeMatch = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    const low = Number(rangeMatch[1]);
    const high = Number(rangeMatch[2]);
    if (Number.isFinite(low) && Number.isFinite(high)) {
      const min = Math.min(low, high);
      const max = Math.max(low, high);
      return value >= min && value <= max ? "IN_RANGE" : "OUT_OF_RANGE";
    }
  }

  const nums = numberList(text);
  if (nums.length === 1 && /abs/i.test(text)) {
    return Math.abs(value) <= nums[0] ? "IN_RANGE" : "OUT_OF_RANGE";
  }

  return "MISSING";
}

function normalizeMetricRecord(metric) {
  const location = String(metric?.location ?? metric?.site ?? metric?.channel ?? "-");
  const name = String(metric?.metric ?? metric?.name ?? metric?.label ?? "-");
  const normalRange = String(metric?.normal_range ?? metric?.normalRange ?? metric?.norm ?? metric?.range ?? "-");
  const value = toFiniteNumber(metric?.value);
  const left = toFiniteNumber(metric?.left_value ?? metric?.leftValue ?? metric?.left ?? metric?.f3);
  const right = toFiniteNumber(metric?.right_value ?? metric?.rightValue ?? metric?.right ?? metric?.f4);
  const probe = String(metric?.probe ?? metric?.note ?? metric?.question ?? "");
  const formula = String(metric?.formula ?? "");

  const explicitStatus = normalizeStatus(metric?.status ?? metric?.result ?? metric?.range_status ?? metric?.rangeStatus);
  const status = explicitStatus !== "MISSING" ? explicitStatus : inferStatusFromRange(value, normalRange);

  return {
    location,
    metric: name,
    value,
    left_value: Number.isFinite(left) ? left : Number.NaN,
    right_value: Number.isFinite(right) ? right : Number.NaN,
    normal_range: normalRange,
    status,
    probe,
    formula,
  };
}

function findMetricsContainer(root) {
  if (!root || typeof root !== "object") return null;
  const queue = [root];
  const seen = new Set();

  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);

    if (Array.isArray(node.metrics)) return node;
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return null;
}

function extractCoherenceRows(root) {
  if (!root || typeof root !== "object") return [];
  const queue = [root];
  const seen = new Set();

  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);

    const rows = node?.derived?.coherence?.rows;
    if (Array.isArray(rows)) return rows;

    for (const value of Object.values(node)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return [];
}

function summarizeMetrics(metrics) {
  const summary = { in_range: 0, out_of_range: 0, missing: 0, potential_symptom_questions: [] };
  const seenProbes = new Set();
  for (const metric of metrics) {
    const status = normalizeStatus(metric.status);
    if (status === "IN_RANGE") summary.in_range += 1;
    else if (status === "OUT_OF_RANGE") summary.out_of_range += 1;
    else summary.missing += 1;

    if (status === "OUT_OF_RANGE" && metric.probe) {
      const probe = String(metric.probe).trim();
      if (probe && !seenProbes.has(probe)) {
        seenProbes.add(probe);
        summary.potential_symptom_questions.push(probe);
      }
    }
  }
  return summary;
}

function selectedResultFilter() {
  return String(refs.resultFilter?.value || "all").toLowerCase();
}

function isMetricVisible(metric) {
  const mode = selectedResultFilter();
  const status = normalizeStatus(metric.status);
  if (mode === "out") return status === "OUT_OF_RANGE";
  if (mode === "in") return status === "IN_RANGE";
  if (mode === "missing") return status === "MISSING";
  return true;
}

function renderResultTable(metrics) {
  if (!refs.resultsTableBody) return;
  refs.resultsTableBody.innerHTML = "";
  if (!metrics.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.textContent = "No metrics match the current filter.";
    tr.appendChild(td);
    refs.resultsTableBody.appendChild(tr);
    return;
  }

  for (const metric of metrics) {
    const status = normalizeStatus(metric.status);
    const tr = document.createElement("tr");
    tr.className = status === "OUT_OF_RANGE" ? "out" : status === "IN_RANGE" ? "in" : "";

    const badge = statusBadge(status);
    const cells = [
      displayLocationLabel(metric.location),
      metric.metric,
      formatValue(metric.value),
      formatValue(metric.left_value),
      formatValue(metric.right_value),
      metric.normal_range,
      "",
      metric.probe || "",
    ];

    cells.forEach((value, idx) => {
      const td = document.createElement("td");
      if (idx === 6) {
        const span = document.createElement("span");
        span.className = `badge ${badge.cls}`;
        span.textContent = badge.text;
        td.appendChild(span);
      } else {
        td.textContent = String(value ?? "");
      }
      tr.appendChild(td);
    });

    refs.resultsTableBody.appendChild(tr);
  }
}

function renderProbeList(summary) {
  if (!refs.probeList) return;
  refs.probeList.innerHTML = "";
  const probes = summary.potential_symptom_questions || [];
  if (!probes.length) {
    const li = document.createElement("li");
    li.textContent = "No out-of-range symptom probes generated.";
    refs.probeList.appendChild(li);
    return;
  }

  for (const probe of probes) {
    const li = document.createElement("li");
    li.textContent = probe;
    refs.probeList.appendChild(li);
  }
}

function clearResults() {
  resultState.metrics = [];
  resultState.summary = { in_range: 0, out_of_range: 0, missing: 0, potential_symptom_questions: [] };
  resultState.sourceLabel = "live session";
  resultState.rawResult = null;
  resultState.coherenceRows = [];
  resultState.combinedRuns = 0;

  if (refs.resultsTableBody) refs.resultsTableBody.innerHTML = "";
  if (refs.probeList) refs.probeList.innerHTML = "";
  if (refs.keyMetrics) refs.keyMetrics.innerHTML = "";
  if (refs.resultSource) refs.resultSource.textContent = "Source: live session";
  if (refs.summary) refs.summary.textContent = "Running session...";

  redrawVisualizations();
}

function redrawResults() {
  const visibleMetrics = resultState.metrics.filter((metric) => isMetricVisible(metric));
  renderResultTable(visibleMetrics);
  renderProbeList(resultState.summary);

  const total = resultState.metrics.length;
  const shown = visibleMetrics.length;
  const filter = selectedResultFilter();
  const filterNote = filter === "all" ? `Showing ${shown}.` : `Showing ${shown}/${total}.`;
  if (refs.summary) {
    refs.summary.textContent = `In range: ${resultState.summary.in_range} | Out of range: ${resultState.summary.out_of_range} | Missing: ${resultState.summary.missing} | ${filterNote}`;
  }

  if (refs.resultSource) refs.resultSource.textContent = `Source: ${resultState.sourceLabel || "live session"}`;
}

function metricNeedsBand(metricType) {
  return ["coherence", "phase", "asymmetry", "total_coherence", "band_amplitude", "absolute_power", "relative_power"].includes(
    String(metricType || "")
  );
}

function syncVizUi() {
  const metricType = String(refs.vizMetricType?.value || "absolute_power");
  const needsBand = metricNeedsBand(metricType);
  if (refs.vizSiteBand) refs.vizSiteBand.disabled = !needsBand;
}

function metricLocationKey(rawLocation) {
  const text = String(rawLocation || "").trim();
  if (!text) return "loc:-";

  const pairMatch = text.match(/^([A-Za-z0-9]+)\s*[\/|-]\s*([A-Za-z0-9]+)$/);
  if (pairMatch) {
    const key = pairKey(pairMatch[1], pairMatch[2]);
    return key ? `pair:${key}` : `raw:${text.toUpperCase()}`;
  }

  const canonical = canonicalLocation(text);
  return canonical ? `loc:${canonical}` : `raw:${text.toUpperCase()}`;
}

function metricRecordKey(metric) {
  const locKey = metricLocationKey(metric?.location);
  const name = String(metric?.metric || "")
    .trim()
    .toLowerCase();
  return `${locKey}|${name}`;
}

function mergeMetrics(existing, incoming) {
  const map = new Map();
  for (const metric of existing || []) map.set(metricRecordKey(metric), metric);
  for (const metric of incoming || []) map.set(metricRecordKey(metric), metric);
  return [...map.values()];
}

function coherenceRowId(row) {
  const metricType = String(row?.metric_type || "");
  const band = String(row?.band || "");
  const pair = rowPair(row);
  if (pair) {
    const key = pairKey(pair[0], pair[1]);
    return `${metricType}|${band}|pair:${key || ""}`;
  }
  const location = rowLocation(row);
  return `${metricType}|${band}|loc:${location || ""}`;
}

function mergeCoherenceRows(existing, incoming) {
  const merged = new Map();

  const ingest = (row) => {
    const key = coherenceRowId(row);
    if (!key) return;
    const weightRaw = Number(row?.n_epochs);
    const weight = Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : 1;
    const value = Number(row?.value);
    const z = Number(row?.zscore);
    const clone = JSON.parse(JSON.stringify(row));

    if (!merged.has(key)) {
      merged.set(key, {
        row: clone,
        weight,
        valueSum: Number.isFinite(value) ? value * weight : 0,
        zSum: Number.isFinite(z) ? z * weight : 0,
        hasValue: Number.isFinite(value),
        hasZ: Number.isFinite(z),
      });
      return;
    }

    const current = merged.get(key);
    current.weight += weight;
    if (Number.isFinite(value)) {
      current.valueSum += value * weight;
      current.hasValue = true;
    }
    if (Number.isFinite(z)) {
      current.zSum += z * weight;
      current.hasZ = true;
    }

    current.row.n_epochs = current.weight;
    if (current.hasValue) current.row.value = current.valueSum / current.weight;
    if (current.hasZ) current.row.zscore = current.zSum / current.weight;

    const existingSource = String(current.row.norm_source || "");
    const nextSource = String(row?.norm_source || "");
    if (existingSource && nextSource && existingSource !== nextSource) {
      current.row.norm_source = "combined";
    } else if (!existingSource && nextSource) {
      current.row.norm_source = nextSource;
    }

    const keyList = [...(Array.isArray(current.row.norm_keys) ? current.row.norm_keys : []), ...(Array.isArray(row?.norm_keys) ? row.norm_keys : [])];
    if (keyList.length) current.row.norm_keys = [...new Set(keyList)];
  };

  for (const row of existing || []) ingest(row);
  for (const row of incoming || []) ingest(row);

  return [...merged.values()].map((entry) => entry.row);
}

function rowLocation(row) {
  if (!row || typeof row !== "object") return "";
  if (row.location) return canonicalLocation(row.location);

  const keys = Array.isArray(row.norm_keys) ? row.norm_keys : [];
  for (const keyRaw of keys) {
    const key = String(keyRaw || "");

    let match = key.match(/^[A-Z_]+:([^:]+):[a-z]+$/i);
    if (match) return canonicalLocation(match[1]);

    match = key.match(/^(?:RATIO_THETA_BETA|PAF|TOTAMP):([^:]+)$/i);
    if (match) return canonicalLocation(match[1]);

    match = key.match(/^TOTCOH:([^:]+):[a-z]+$/i);
    if (match) return canonicalLocation(match[1]);
  }

  return "";
}

function rowPair(row) {
  if (!row || typeof row !== "object") return null;

  if (Array.isArray(row.pair) && row.pair.length === 2) {
    const left = canonicalLocation(row.pair[0]);
    const right = canonicalLocation(row.pair[1]);
    if (left && right && left !== right) return [left, right];
  }

  const keys = Array.isArray(row.norm_keys) ? row.norm_keys : [];
  for (const keyRaw of keys) {
    const key = String(keyRaw || "");
    const match = key.match(/^[A-Z_]+:([A-Za-z0-9]+)-([A-Za-z0-9]+):[a-z]+$/);
    if (match) {
      const left = canonicalLocation(match[1]);
      const right = canonicalLocation(match[2]);
      if (left && right && left !== right) return [left, right];
    }
  }

  return null;
}

function projectHeadPoint(loc, cx, cy, radius) {
  const coords = HEAD_COORDS_1020[canonicalLocation(loc)];
  if (!coords) return null;
  const x = cx + coords[0] * radius;
  const y = cy - coords[1] * radius;
  return [x, y];
}

function zColor(z) {
  if (!Number.isFinite(z)) return "rgba(170,170,170,0.7)";
  const t = Math.min(1, Math.abs(z) / 3.0);
  if (z >= 0) {
    const r = Math.round(160 + 95 * t);
    const g = Math.round(200 - 150 * t);
    const b = Math.round(200 - 170 * t);
    return `rgba(${r},${g},${b},0.9)`;
  }
  const r = Math.round(200 - 170 * t);
  const g = Math.round(210 - 140 * t);
  const b = Math.round(170 + 85 * t);
  return `rgba(${r},${g},${b},0.9)`;
}

function resizeCanvasToDisplaySize(canvas) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, dpr };
}

function drawHeadBase(ctx, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.36;

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "rgba(248, 250, 252, 0.95)";
  ctx.strokeStyle = "rgba(20, 33, 42, 0.35)";
  ctx.lineWidth = Math.max(1, Math.round(width * 0.003));
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.08, cy - radius * 1.02);
  ctx.lineTo(cx, cy - radius * 1.18);
  ctx.lineTo(cx + radius * 0.08, cy - radius * 1.02);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx - radius * 1.02, cy, radius * 0.08, -Math.PI / 3, Math.PI / 3);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx + radius * 1.02, cy, radius * 0.08, (2 * Math.PI) / 3, (4 * Math.PI) / 3);
  ctx.stroke();

  return { cx, cy, radius };
}

function drawZMap() {
  const canvas = refs.vizHeadCanvas;
  if (!canvas) return { points: 0, label: "" };
  const size = resizeCanvasToDisplaySize(canvas);
  if (!size) return { points: 0, label: "" };

  const ctx = canvas.getContext("2d");
  if (!ctx) return { points: 0, label: "" };

  const { cx, cy, radius } = drawHeadBase(ctx, size.width, size.height);
  const metricType = String(refs.vizMetricType?.value || "absolute_power");
  const band = String(refs.vizSiteBand?.value || "alpha");

  const pointsByLoc = new Map();
  for (const row of resultState.coherenceRows) {
    if (String(row?.metric_type || "") !== metricType) continue;
    if (metricNeedsBand(metricType) && String(row?.band || "") !== band) continue;

    const loc = rowLocation(row);
    if (!loc || loc === "GLOBAL") continue;

    const z = Number(row?.zscore);
    if (!Number.isFinite(z)) continue;
    pointsByLoc.set(loc, z);
  }

  const points = [...pointsByLoc.entries()].map(([loc, z]) => ({ loc, z }));
  if (!points.length) {
    ctx.fillStyle = "rgba(20, 33, 42, 0.6)";
    ctx.font = `${Math.max(14, Math.floor(size.width * 0.03))}px Bahnschrift, sans-serif`;
    ctx.fillText("No z-score points for selected metric/band.", size.width * 0.08, size.height * 0.5);
    return { points: 0, label: `${metricType}${metricNeedsBand(metricType) ? ` ${band}` : ""}` };
  }

  ctx.font = `${Math.max(11, Math.floor(size.width * 0.02))}px Bahnschrift, sans-serif`;
  for (const point of points) {
    const xy = projectHeadPoint(point.loc, cx, cy, radius);
    if (!xy) continue;

    const [x, y] = xy;
    ctx.fillStyle = zColor(point.z);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(6, Math.floor(size.width * 0.015)), 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(20, 33, 42, 0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "rgba(20, 33, 42, 0.85)";
    ctx.fillText(displayLocation(point.loc), x + 7, y - 7);
  }

  ctx.fillStyle = "rgba(20, 33, 42, 0.75)";
  ctx.font = `${Math.max(12, Math.floor(size.width * 0.02))}px Bahnschrift, sans-serif`;
  ctx.fillText("z: -3 (blue) to +3 (red)", 8, size.height - 8);

  return { points: points.length, label: `${metricType}${metricNeedsBand(metricType) ? ` ${band}` : ""}` };
}

function drawPairMap() {
  const canvas = refs.vizPairCanvas;
  if (!canvas) return { lines: 0, hyper: 0, hypo: 0, label: "" };
  const size = resizeCanvasToDisplaySize(canvas);
  if (!size) return { lines: 0, hyper: 0, hypo: 0, label: "" };

  const ctx = canvas.getContext("2d");
  if (!ctx) return { lines: 0, hyper: 0, hypo: 0, label: "" };

  const { cx, cy, radius } = drawHeadBase(ctx, size.width, size.height);
  const metricType = String(refs.vizPairMetric?.value || "coherence");
  const band = String(refs.vizPairBand?.value || "alpha");
  const threshold = Math.max(0, Number(refs.vizPairThreshold?.value || 2.0));
  const showAll = Boolean(refs.vizPairShowAll?.checked);

  const lines = [];
  for (const row of resultState.coherenceRows) {
    if (String(row?.metric_type || "") !== metricType) continue;
    if (String(row?.band || "") !== band) continue;

    const z = Number(row?.zscore);
    if (!Number.isFinite(z)) continue;
    if (!showAll && Math.abs(z) < threshold) continue;

    const pair = rowPair(row);
    if (!pair) continue;

    const p1 = projectHeadPoint(pair[0], cx, cy, radius);
    const p2 = projectHeadPoint(pair[1], cx, cy, radius);
    if (!p1 || !p2) continue;

    lines.push({ pair, z, p1, p2 });
  }

  if (!lines.length) {
    ctx.fillStyle = "rgba(20, 33, 42, 0.6)";
    ctx.font = `${Math.max(14, Math.floor(size.width * 0.03))}px Bahnschrift, sans-serif`;
    ctx.fillText("No pair lines for selected metric/band.", size.width * 0.08, size.height * 0.5);
    return { lines: 0, hyper: 0, hypo: 0, label: `${metricType} ${band}` };
  }

  let hyper = 0;
  let hypo = 0;
  const locSet = new Set();

  for (const line of lines) {
    locSet.add(line.pair[0]);
    locSet.add(line.pair[1]);
    if (line.z >= threshold) hyper += 1;
    if (line.z <= -threshold) hypo += 1;

    ctx.strokeStyle = zColor(line.z);
    ctx.lineWidth = 1 + Math.min(5, Math.abs(line.z));
    ctx.beginPath();
    ctx.moveTo(line.p1[0], line.p1[1]);
    ctx.lineTo(line.p2[0], line.p2[1]);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(20, 33, 42, 0.85)";
  ctx.font = `${Math.max(11, Math.floor(size.width * 0.02))}px Bahnschrift, sans-serif`;

  for (const loc of locSet) {
    const xy = projectHeadPoint(loc, cx, cy, radius);
    if (!xy) continue;
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.arc(xy[0], xy[1], Math.max(4, Math.floor(size.width * 0.01)), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(20, 33, 42, 0.6)";
    ctx.stroke();
    ctx.fillStyle = "rgba(20, 33, 42, 0.85)";
    ctx.fillText(displayLocation(loc), xy[0] + 5, xy[1] - 5);
  }

  ctx.fillStyle = "rgba(20, 33, 42, 0.75)";
  ctx.fillText(`Threshold: ${showAll ? "all" : `|z| >= ${threshold.toFixed(1)}`}`, 8, size.height - 8);

  return { lines: lines.length, hyper, hypo, label: `${metricType} ${band}` };
}

function redrawVisualizations() {
  const map = drawZMap();
  const pair = drawPairMap();

  if (refs.vizSummary) {
    const parts = [];
    if (resultState.coherenceRows.length) {
      parts.push(`Z-map: ${map.points} sites (${map.label})`);
      parts.push(`Pair map: ${pair.lines} lines (${pair.label})`);
      parts.push(`Hyper lines: ${pair.hyper}`);
      parts.push(`Hypo lines: ${pair.hypo}`);
    } else {
      parts.push("Run or open a coherence result to render head maps.");
    }
    refs.vizSummary.textContent = parts.join(" | ");
  }
}

function renderResults(payload, sourceLabel = "live session", options = {}) {
  const root = payload?.result || payload;
  const container = findMetricsContainer(root);
  if (!container) {
    throw new Error("Could not find a metrics[] array in the selected JSON.");
  }
  const merge = Boolean(options?.merge);

  const metrics = Array.isArray(container.metrics) ? container.metrics.map(normalizeMetricRecord) : [];
  const summary = summarizeMetrics(metrics);
  const summaryProbes = Array.isArray(container?.summary?.potential_symptom_questions)
    ? container.summary.potential_symptom_questions
    : [];

  for (const probe of summaryProbes) {
    const text = String(probe || "").trim();
    if (!text) continue;
    if (!summary.potential_symptom_questions.includes(text)) summary.potential_symptom_questions.push(text);
  }

  const incomingRows = extractCoherenceRows(root);

  if (merge) {
    resultState.metrics = mergeMetrics(resultState.metrics, metrics);
    resultState.summary = summarizeMetrics(resultState.metrics);
    resultState.sourceLabel = `combined coherence runs (${Math.max(1, resultState.combinedRuns + 1)})`;
    resultState.rawResult = root;
    resultState.coherenceRows = mergeCoherenceRows(resultState.coherenceRows, incomingRows);
    resultState.combinedRuns = Math.max(1, resultState.combinedRuns + 1);
  } else {
    resultState.metrics = metrics;
    resultState.summary = summary;
    resultState.sourceLabel = sourceLabel || "live session";
    resultState.rawResult = root;
    resultState.coherenceRows = incomingRows;
    resultState.combinedRuns = 1;
  }

  redrawResults();
  redrawVisualizations();
}

function setRunningState(isRunning) {
  running = isRunning;
  if (refs.startBtn) refs.startBtn.disabled = isRunning;
  if (refs.stopBtn) refs.stopBtn.disabled = !isRunning;
  if (refs.openResultBtn) refs.openResultBtn.disabled = isRunning;
}

function selectedBands() {
  return {
    delta: Boolean(refs.bandDelta?.checked),
    theta: Boolean(refs.bandTheta?.checked),
    alpha: Boolean(refs.bandAlpha?.checked),
    beta: Boolean(refs.bandBeta?.checked),
    hibeta: Boolean(refs.bandHiBeta?.checked),
  };
}

function selectedLocation() {
  return canonicalLocation(refs.bandLoc?.value || "");
}

function drawBandpower() {
  const canvas = refs.bandCanvas;
  if (!canvas) return;
  const size = resizeCanvasToDisplaySize(canvas);
  if (!size) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const loc = selectedLocation();
  const bands = selectedBands();
  const data = bandState.byLocation[loc] || {};
  const keys = Object.keys(BAND_META).filter((key) => bands[key]);

  const padding = { left: 44, right: 12, top: 10, bottom: 22 };
  const plotW = size.width - padding.left - padding.right;
  const plotH = size.height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, size.width, size.height);
  ctx.fillStyle = "rgba(255, 255, 255, 0.0)";
  ctx.fillRect(0, 0, size.width, size.height);

  let yMax = 0;
  let xMax = 0;
  for (const key of keys) {
    const series = data[key] || [];
    xMax = Math.max(xMax, series.length);
    for (const value of series) {
      if (Number.isFinite(value)) yMax = Math.max(yMax, value);
    }
  }

  if (!Number.isFinite(yMax) || yMax <= 0) yMax = 1.0;
  yMax *= 1.1;

  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + plotW, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.font = `${Math.max(11, Math.floor(11 * (size.dpr / (window.devicePixelRatio || 1))))}px Bahnschrift, sans-serif`;
  ctx.fillText(`${yMax.toFixed(1)} uV`, 6, padding.top + 10);
  ctx.fillText("0", 6, padding.top + plotH);

  const title = bandState.label ? `${displayLocation(loc)} ${bandState.label}` : displayLocation(loc);
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillText(title, padding.left, padding.top + 10);

  const n = Math.max(2, xMax);
  const xStep = plotW / (n - 1);

  for (const key of keys) {
    const series = data[key] || [];
    if (series.length < 2) continue;

    ctx.strokeStyle = BAND_META[key].color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < series.length; i += 1) {
      const value = series[i];
      const x = padding.left + xStep * i;
      const y = padding.top + plotH - (Math.max(0, value) / yMax) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const parts = [];
  for (const key of keys) {
    const series = data[key] || [];
    const last = series.length ? series[series.length - 1] : null;
    if (!Number.isFinite(last)) continue;
    parts.push(`${BAND_META[key].label}: ${last.toFixed(2)} uV`);
  }

  if (refs.bandValues) {
    refs.bandValues.textContent = parts.length ? parts.join("   ") : "Waiting for bandpower data...";
  }
}

function syncBandpowerUi() {
  const follow = Boolean(refs.followActive?.checked);
  if (refs.bandLoc) refs.bandLoc.disabled = follow;
  drawBandpower();
}

async function checkPython() {
  const status = await window.clinicalQ.checkPython();
  if (refs.pythonStatus) {
    refs.pythonStatus.textContent = status.ok ? `Runtime OK: ${status.message}` : `Runtime error: ${status.message}`;
  }
}

function summarizeEvent(event) {
  switch (event.event) {
    case "session_start":
      return `Session started (${event.mode}).`;
    case "board_ready":
      return `Board ready at ${event.sampling_rate} Hz. EEG channels: ${event.eeg_channels?.join(", ")}`;
    case "sequence_start":
      return `Sequence ${event.sequence} started.`;
    case "epoch_start":
      return `${event.sequence} E${event.index} ${event.label}: ${event.instruction}`;
    case "epoch_tick":
      return `${event.sequence} E${event.index} ${event.label}: ${event.seconds_remaining}s remaining`;
    case "epoch_complete":
      return `${event.sequence} E${event.index} ${event.label} captured.`;
    case "reposition_start":
      if (event.mode === "manual") return `Reposition electrode to ${displayLocationLabel(event.next_location)}, then click Ready.`;
      return `Reposition electrode to ${displayLocationLabel(event.next_location)}.`;
    case "reposition_tick":
      return `Reposition countdown: ${event.seconds_remaining}s`;
    case "reposition_waiting":
      return `Waiting for readiness: ${displayLocationLabel(event.next_location)}`;
    case "reposition_input_eof":
      return `No stdin available; proceeding to ${displayLocationLabel(event.next_location)}.`;
    case "reposition_complete":
      return `Reposition complete: ${displayLocationLabel(event.next_location)}`;
    case "analysis_complete":
      return `Analysis ready: ${event.metrics} metrics (${event.out_of_range} out-of-range).`;
    case "session_complete":
      return `Session complete. Result saved: ${event.output_path}`;
    case "coherence_session_complete":
      return `Coherence session complete. Result saved: ${event.output_path}`;
    case "session_stopped":
      return "Session stopped.";
    case "coherence_session_stopped":
      return "Coherence session stopped.";
    case "error":
      return `Error: ${event.message}`;
    case "log":
      return `${event.stream}: ${event.message}`;
    default:
      return JSON.stringify(event);
  }
}

function buildClinicalQConfig() {
  const isSequential = refs.mode?.value === "sequential";
  const manualAdvance = isSequential && refs.manualReposition?.checked;

  return {
    mode: refs.mode?.value || "sequential",
    epoch_seconds: Number(refs.epochSeconds?.value || 15),
    reposition_seconds: Number(refs.repositionSeconds?.value || 20),
    reposition_mode: manualAdvance ? "manual" : "timer",
    live_bandpower: true,
    live_window_seconds: 2.0,
    sampling_rate: 250,
    fast_mode: Boolean(refs.fastMode?.checked),
    include_frontal_baseline: Boolean(refs.includeFrontalBaseline?.checked),
    board: {
      board_id: "cyton",
      serial_port: refs.serialPort?.value || "COM3",
      use_synthetic: Boolean(refs.useSynthetic?.checked),
      available_channels: [1, 2, 3, 4, 5, 6, 7, 8],
      seed: 42,
    },
    channels: {
      Cz: Number(refs.chCz?.value || 1),
      O1: Number(refs.chO1?.value || 2),
      Fz: Number(refs.chFz?.value || 3),
      F3: Number(refs.chF3?.value || 4),
      F4: Number(refs.chF4?.value || 5),
    },
    sequential_order: ["O1", "Cz", "Fz", "F3", "F4"],
  };
}

function coherencePairsForReading(locations) {
  const localPairs = allPairsFromLocations(locations);
  if (String(refs.qeegPairCoverage?.value || "all_within_reading") !== "target_pairs_only") {
    return localPairs;
  }

  const targetSet = targetPairKeySet();
  return localPairs.filter((pair) => targetSet.has(pairKey(pair[0], pair[1])));
}

function buildCoherenceConfig() {
  const profile = selectedHardwareProfile();
  const maxCh = profile.maxChannels;

  const active = qeegState.readings[qeegState.activeReading];
  if (!active || !active.locations.length) {
    throw new Error("Active QEEG reading has no locations. Configure at least 2 locations.");
  }

  fillMissingChannelAssignments(qeegState.activeReading);

  const locations = active.locations.slice(0, electrodesPerReading());
  if (locations.length < 2) {
    throw new Error("At least 2 locations are required for coherence.");
  }

  const channels = {};
  for (const loc of locations) {
    const ch = Number(active.channelMap?.[loc]);
    if (!Number.isInteger(ch) || ch < 1 || ch > maxCh) {
      throw new Error(`Invalid channel mapping for ${loc}. Use 1-${maxCh}.`);
    }
    channels[loc] = ch;
  }

  const pairs = coherencePairsForReading(locations);
  if (!pairs.length) {
    throw new Error("No coherence pairs selected for the active reading.");
  }

  const zscoreMode = selectedZscoreMode();
  const ageValue = Number(refs.subjectAge?.value);

  return {
    mode: "simultaneous",
    epoch_seconds: Number(refs.epochSeconds?.value || 30),
    reposition_seconds: 0,
    reposition_mode: "timer",
    norms_dataset: String(refs.coherenceNorms?.value || "ds003775"),
    zscore_mode: zscoreMode,
    subject_age: zscoreMode === "age" && Number.isFinite(ageValue) ? ageValue : null,
    sampling_rate: 250,
    fast_mode: Boolean(refs.fastMode?.checked),
    board: {
      board_id: profile.boardId,
      serial_port: refs.serialPort?.value || "COM3",
      use_synthetic: Boolean(refs.useSynthetic?.checked),
      available_channels: Array.from({ length: maxCh }, (_x, i) => i + 1),
      seed: 42,
    },
    channels,
    pairs,
  };
}

function buildConfig() {
  if (selectedAnalysisType() === "coherence") return buildCoherenceConfig();
  return buildClinicalQConfig();
}

function syncSessionUi() {
  const analysisType = selectedAnalysisType();
  const isCoherence = analysisType === "coherence";
  const zscoreMode = selectedZscoreMode();

  if (isCoherence && refs.mode) refs.mode.value = "simultaneous";

  if (refs.mode) refs.mode.disabled = isCoherence;
  const isSequential = refs.mode?.value === "sequential";

  if (refs.manualReposition) refs.manualReposition.disabled = isCoherence || !isSequential;
  const manual = isSequential && refs.manualReposition?.checked;
  if (refs.repositionSeconds) refs.repositionSeconds.disabled = isCoherence || manual;
  if (refs.includeFrontalBaseline) refs.includeFrontalBaseline.disabled = isCoherence;

  if (refs.coherenceNorms) refs.coherenceNorms.disabled = !isCoherence;
  if (refs.zscoreMode) refs.zscoreMode.disabled = !isCoherence;
  if (refs.subjectAge) refs.subjectAge.disabled = !isCoherence || zscoreMode !== "age";

  if (refs.clinicalqChannelMapSection) {
    refs.clinicalqChannelMapSection.style.display = isCoherence ? "none" : "block";
  }
  if (refs.qeegSettings) {
    refs.qeegSettings.style.display = isCoherence ? "block" : "none";
  }

  if (refs.startBtn) {
    refs.startBtn.textContent = isCoherence
      ? `Start Coherence Reading ${qeegState.activeReading + 1}`
      : "Start ClinicalQ Session";
  }

  if (isCoherence) {
    const active = qeegState.readings[qeegState.activeReading];
    seedBandLocations(active?.locations || []);
  } else {
    seedBandLocations(["CZ", "O1", "FZ", "F3", "F4"]);
  }
}

window.clinicalQ.onSessionEvent((event) => {
  if (event.event === "session_start") {
    setReadyState(null);
    epochContext = null;
    nextWarnedEpochKey = null;
    lastEpochLabel = null;
    setCueBanner("");
    setCountdown("");
    bandState.sequence = null;
    bandState.index = null;
    bandState.label = null;
    resetBandState(`${Date.now()}`);
  }

  if (event.event === "epoch_start") {
    epochContext = event;
    nextWarnedEpochKey = null;
    setCueBanner(`NOW: ${event.label} | ${event.instruction || ""}`);
    if (lastEpochLabel !== event.label) {
      playCue(event.label);
      lastEpochLabel = event.label;
    }
    setCountdown(`${event.sequence} E${event.index} ${event.label}: ${event.seconds}s`);

    bandState.sequence = event.sequence;
    bandState.index = event.index;
    bandState.label = event.label;

    if (Array.isArray(event.locations)) {
      seedBandLocations(event.locations);
    }

    resetBandState(`${event.sequence}-${event.index}-${event.label}`);

    if (refs.followActive?.checked && Array.isArray(event.locations) && event.locations.length === 1) {
      activeLocation = canonicalLocation(event.locations[0]);
      if (refs.bandLoc && activeLocation) refs.bandLoc.value = activeLocation;
    }
    syncBandpowerUi();
  }

  if (event.event === "epoch_tick") {
    setCountdown(`${event.sequence} E${event.index} ${event.label}: ${event.seconds_remaining}s remaining`);

    const lead = cueLeadSeconds();
    if (lead > 0 && Number(event.seconds_remaining) === lead && epochContext) {
      const key = epochKey(epochContext);
      const nextEpoch = epochContext.next_epoch;
      if (nextEpoch && nextWarnedEpochKey !== key && String(nextEpoch.label || "") !== String(epochContext.label || "")) {
        nextWarnedEpochKey = key;
        setCueBanner(`UP NEXT: ${nextEpoch.label} | ${nextEpoch.instruction || ""}`);
        playCue(nextEpoch.label);
      }
    }
  }

  if (event.event === "bandpower") {
    const features = event.features || {};
    for (const [locRaw, values] of Object.entries(features)) {
      const loc = canonicalLocation(locRaw);
      if (!loc) continue;
      ensureBandLocationSeries(loc);
      for (const key of Object.keys(BAND_META)) {
        const value = Number(values?.[key]);
        if (Number.isFinite(value)) bandState.byLocation[loc][key].push(value);
      }
    }
    refreshBandLocationOptions(activeLocation || "");
    drawBandpower();
  }

  if (event.event === "reposition_start" && event.mode === "manual") {
    setReadyState(event.next_location);
    setCueBanner(`MOVE ELECTRODE: ${displayLocationLabel(event.next_location)} | Click Ready when stable.`);
    setCountdown("");
  }

  if (event.event === "reposition_start" && event.mode === "timer") {
    setCueBanner(`MOVE ELECTRODE: ${displayLocationLabel(event.next_location)}`);
    setCountdown("");
  }

  if (event.event === "reposition_tick") setCountdown(`Reposition: ${event.seconds_remaining}s`);
  if (event.event === "reposition_complete") {
    setReadyState(null);
    setCountdown("");
  }

  if (
    event.event === "session_complete" ||
    event.event === "coherence_session_complete" ||
    event.event === "error" ||
    event.event === "session_stopped" ||
    event.event === "coherence_session_stopped"
  ) {
    setReadyState(null);
    setCountdown("");
  }

  const text = summarizeEvent(event);
  if (shouldLogEvent(event.event)) appendEventRow(text);
  if (!["epoch_tick", "reposition_tick", "bandpower"].includes(event.event) && refs.liveEvent) {
    refs.liveEvent.textContent = text;
  }
});

if (refs.startBtn) {
  refs.startBtn.addEventListener("click", async () => {
    if (running) return;
    const analysisType = selectedAnalysisType();
    const combineCoherenceRuns = analysisType === "coherence" && Boolean(refs.qeegCombineRuns?.checked);
    const mergeWithExisting = combineCoherenceRuns && resultState.coherenceRows.length > 0;

    setRunningState(true);
    setReadyState(null);
    setCueBanner("");
    setCountdown("");
    if (!mergeWithExisting) {
      clearResults();
    } else if (refs.summary) {
      refs.summary.textContent = "Running next coherence reading; results will be merged.";
    }

    try {
      await warmAudio();
      const config = buildConfig();

      if (analysisType === "coherence") {
        seedBandLocations(Object.keys(config.channels || {}));
      }

      const payload =
        analysisType === "coherence"
          ? await window.clinicalQ.startCoherenceSession(config)
          : await window.clinicalQ.startSession(config);

      const sourceNote =
        analysisType === "coherence"
          ? `${payload.outputPath || payload.output_path || "live session"} | Reading ${qeegState.activeReading + 1}`
          : payload.outputPath || payload.output_path || "live session";

      renderResults(payload.result, sourceNote, { merge: mergeWithExisting });
      if (refs.liveEvent) refs.liveEvent.textContent = `Completed. Output: ${payload.outputPath || payload.output_path || "saved"}`;
    } catch (err) {
      if (refs.liveEvent) refs.liveEvent.textContent = `Failed: ${err.message || err}`;
      appendEventRow(`Failure: ${err.message || err}`);
      if (refs.summary) refs.summary.textContent = "Session failed.";
    } finally {
      setRunningState(false);
    }
  });
}

if (refs.stopBtn) {
  refs.stopBtn.addEventListener("click", async () => {
    if (!running) return;
    const analysisType = selectedAnalysisType();
    const result =
      analysisType === "coherence" ? await window.clinicalQ.stopCoherenceSession() : await window.clinicalQ.stopSession();
    appendEventRow(result.stopped ? "Stop signal sent." : `Stop ignored: ${result.reason}`);
    setReadyState(null);
    setRunningState(false);
  });
}

if (refs.readyBtn) {
  refs.readyBtn.addEventListener("click", async () => {
    if (!pendingReadyLocation) return;
    const response = await window.clinicalQ.sendCommand({ command: "ready", next_location: pendingReadyLocation });
    if (response?.ok) {
      refs.readyBtn.disabled = true;
      if (refs.readyHint) refs.readyHint.textContent = `Ready sent for ${displayLocationLabel(pendingReadyLocation)}.`;
    } else {
      appendEventRow(`Ready failed: ${response?.message || "unknown error"}`);
    }
  });
}

if (refs.openResultBtn) {
  refs.openResultBtn.addEventListener("click", async () => {
    if (running) return;
    try {
      const picked = await window.clinicalQ.openResultFile();
      if (!picked || picked.canceled) return;
      renderResults(picked.result, picked.filePath || "result file");
      if (refs.liveEvent) refs.liveEvent.textContent = `Loaded result: ${picked.filePath || "file"}`;
      appendEventRow(`Loaded result file: ${picked.filePath || "unknown path"}`);
    } catch (err) {
      if (refs.liveEvent) refs.liveEvent.textContent = `Open failed: ${err.message || err}`;
      appendEventRow(`Open result failed: ${err.message || err}`);
    }
  });
}

if (refs.followActive) refs.followActive.addEventListener("change", syncBandpowerUi);
if (refs.bandLoc) refs.bandLoc.addEventListener("change", syncBandpowerUi);
if (refs.bandDelta) refs.bandDelta.addEventListener("change", drawBandpower);
if (refs.bandTheta) refs.bandTheta.addEventListener("change", drawBandpower);
if (refs.bandAlpha) refs.bandAlpha.addEventListener("change", drawBandpower);
if (refs.bandBeta) refs.bandBeta.addEventListener("change", drawBandpower);
if (refs.bandHiBeta) refs.bandHiBeta.addEventListener("change", drawBandpower);
if (refs.resultFilter) refs.resultFilter.addEventListener("change", redrawResults);

if (refs.vizMetricType) {
  refs.vizMetricType.addEventListener("change", () => {
    syncVizUi();
    redrawVisualizations();
  });
}
if (refs.vizSiteBand) refs.vizSiteBand.addEventListener("change", redrawVisualizations);
if (refs.vizPairBand) refs.vizPairBand.addEventListener("change", redrawVisualizations);
if (refs.vizPairMetric) refs.vizPairMetric.addEventListener("change", redrawVisualizations);
if (refs.vizPairThreshold) refs.vizPairThreshold.addEventListener("change", redrawVisualizations);
if (refs.vizPairShowAll) refs.vizPairShowAll.addEventListener("change", redrawVisualizations);

window.addEventListener("resize", () => {
  drawBandpower();
  redrawVisualizations();
});

if (refs.mode) refs.mode.addEventListener("change", syncSessionUi);
if (refs.manualReposition) refs.manualReposition.addEventListener("change", syncSessionUi);
if (refs.analysisType) refs.analysisType.addEventListener("change", syncSessionUi);
if (refs.zscoreMode) refs.zscoreMode.addEventListener("change", syncSessionUi);

initializeQeegPlanner();
seedBandLocations(["CZ", "O1", "FZ", "F3", "F4"]);
syncSessionUi();
syncBandpowerUi();
updateQeegPlanSummary();
syncVizUi();
redrawVisualizations();

checkPython().catch((err) => {
  if (refs.pythonStatus) refs.pythonStatus.textContent = `Runtime check failed: ${err.message || err}`;
});
