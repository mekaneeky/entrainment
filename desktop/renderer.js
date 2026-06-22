const refs = {
  clinicalLauncherBtn: document.getElementById("clinicalLauncherBtn"),
  profileSelect: document.getElementById("profileSelect"),
  sessionTags: document.getElementById("sessionTags"),
  sessionNotes: document.getElementById("sessionNotes"),
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
  clinicalqLocationSection: document.getElementById("clinicalqLocationSection"),
  clinicalqSoundProbeSection: document.getElementById("clinicalqSoundProbeSection"),
  locO1: document.getElementById("locO1"),
  locCz: document.getElementById("locCz"),
  locFz: document.getElementById("locFz"),
  locF3: document.getElementById("locF3"),
  locF4: document.getElementById("locF4"),
  probeSubAlpha: document.getElementById("probeSubAlpha"),
  probeSubBeta: document.getElementById("probeSubBeta"),
  probeSubBetaLevel: document.getElementById("probeSubBetaLevel"),
  probeSleepSupport: document.getElementById("probeSleepSupport"),
  probeSweep: document.getElementById("probeSweep"),
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
  clinicalHeadCanvas: document.getElementById("clinicalHeadCanvas"),
  clinicalHeadLegend: document.getElementById("clinicalHeadLegend"),
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
  CZ: "Cz",
  FZ: "Fz",
  PZ: "Pz",
  OZ: "Oz",
  FPZ: "FPz",
  FPO1: "FPo1",
  FPO2: "FPo2",
  T7: "T3",
  T8: "T4",
  P7: "T5",
  P8: "T6",
};

const CLINICALQ_LOCATION_ORDER = ["O1", "Cz", "Fz", "F3", "F4"];

const HEAD_POSITIONS = {
  Fp1: [0.38, 0.16],
  FPz: [0.5, 0.13],
  Fp2: [0.62, 0.16],
  F7: [0.22, 0.31],
  F3: [0.37, 0.32],
  Fz: [0.5, 0.29],
  F4: [0.63, 0.32],
  F8: [0.78, 0.31],
  T3: [0.18, 0.52],
  C3: [0.36, 0.52],
  Cz: [0.5, 0.5],
  C4: [0.64, 0.52],
  T4: [0.82, 0.52],
  T5: [0.24, 0.72],
  P3: [0.39, 0.71],
  Pz: [0.5, 0.73],
  P4: [0.61, 0.71],
  T6: [0.76, 0.72],
  O1: [0.42, 0.88],
  Oz: [0.5, 0.9],
  O2: [0.58, 0.88],
};

const CLINICALQ_LOCATION_REFS = {
  O1: "locO1",
  Cz: "locCz",
  Fz: "locFz",
  F3: "locF3",
  F4: "locF4",
};

const CLINICALQ_CHANNEL_REFS = {
  O1: "chO1",
  Cz: "chCz",
  Fz: "chFz",
  F3: "chF3",
  F4: "chF4",
};

const CLINICALQ_PROBES = {
  sub_alpha: {
    checkboxRef: "probeSubAlpha",
    label: "OMNI",
    file: "../output/subliminal_sounds/sub_alpha_omni_10hz.wav",
    requires: ["Cz"],
  },
  sub_beta: {
    checkboxRef: "probeSubBeta",
    label: "SUB_BETA",
    selectRef: "probeSubBetaLevel",
    file: () => {
      const level = String(refs.probeSubBetaLevel?.value || "17");
      return `../output/subliminal_sounds/sub_beta_serene_25hz_minus${level}db.wav`;
    },
    requires: ["O1"],
  },
  sleep_support: {
    checkboxRef: "probeSleepSupport",
    label: "SLEEP_SUPPORT",
    file: "../output/subliminal_sounds/sleep_support_sinusoidal.wav",
    requires: ["O1"],
  },
  sweep: {
    checkboxRef: "probeSweep",
    label: "SWEEP",
    file: "../output/subliminal_sounds/sweep_complex_harmonic.wav",
    requires: ["F3", "F4"],
  },
};

const PROBE_BY_LABEL = Object.fromEntries(
  Object.entries(CLINICALQ_PROBES).map(([key, value]) => [value.label, { id: key, ...value }])
);

let running = false;
let pendingReadyLocation = null;
let activeLocation = null;
let audioCtx = null;
let activeProbeAudio = null;
let epochContext = null;
let nextWarnedEpochKey = null;
let lastEpochLabel = null;

const profileState = {
  profiles: [],
  activeProfileId: "default",
};

const bandState = {
  epochKey: null,
  sequence: null,
  index: null,
  label: null,
  byLocation: {},
};

const resultState = {
  metrics: [],
  summary: { in_range: 0, out_of_range: 0, missing: 0, potential_symptom_questions: [] },
  sourceLabel: "live session",
  rawResult: null,
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

function selectedClinicalqLocations() {
  const selected = CLINICALQ_LOCATION_ORDER.filter((loc) => Boolean(refs[CLINICALQ_LOCATION_REFS[loc]]?.checked));
  return selected;
}

function selectedClinicalqSoundProbes() {
  const selectedLocations = new Set(selectedClinicalqLocations());
  return Object.entries(CLINICALQ_PROBES)
    .filter(([, def]) => Boolean(refs[def.checkboxRef]?.checked))
    .filter(([, def]) => (def.requires || []).every((loc) => selectedLocations.has(loc)))
    .map(([key]) => key);
}

function clinicalqChannelMapForLocations(locations) {
  const channels = {};
  for (const loc of locations) {
    const refName = CLINICALQ_CHANNEL_REFS[loc];
    channels[loc] = Number(refs[refName]?.value || 1);
  }
  return channels;
}

function syncClinicalqLocationControls() {
  for (const loc of CLINICALQ_LOCATION_ORDER) {
    const locationInput = refs[CLINICALQ_LOCATION_REFS[loc]];
    const channelInput = refs[CLINICALQ_CHANNEL_REFS[loc]];
    if (locationInput) locationInput.disabled = running;
    if (channelInput) channelInput.disabled = running || !Boolean(locationInput?.checked);
  }
  const selectedLocations = new Set(selectedClinicalqLocations());
  for (const def of Object.values(CLINICALQ_PROBES)) {
    const input = refs[def.checkboxRef];
    if (!input) continue;
    const missingRequiredLocation = (def.requires || []).some((loc) => !selectedLocations.has(loc));
    input.disabled = running || missingRequiredLocation;
    if (def.selectRef && refs[def.selectRef]) {
      refs[def.selectRef].disabled = running || missingRequiredLocation || !input.checked;
    }
  }
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
  if (normalized === "EC" || normalized === "FRONTAL_EC" || normalized === "SWEEP_POST") return { freq: 440, count: 2 };
  if (["READ", "COUNT", "OMNI", "SUB_BETA", "SLEEP_SUPPORT", "SWEEP"].includes(normalized)) {
    return { freq: 880, count: 3 };
  }
  return { freq: 520, count: 1 };
}

function playCue(label) {
  const pat = cuePattern(label);
  for (let i = 0; i < pat.count; i += 1) {
    window.setTimeout(() => beepOnce(pat.freq, 0.12), i * 160);
  }
}

function stopProbeAudio() {
  if (!activeProbeAudio) return;
  try {
    activeProbeAudio.pause();
    activeProbeAudio.currentTime = 0;
  } catch {
    // ignore
  }
  activeProbeAudio = null;
}

function playProbeAudio(label) {
  const normalized = String(label || "").toUpperCase();
  const def = PROBE_BY_LABEL[normalized];
  stopProbeAudio();
  if (!def) return;

  const file = typeof def.file === "function" ? def.file() : def.file;
  if (!file) return;

  const audio = new Audio(file);
  audio.loop = true;
  audio.volume = 1.0;
  activeProbeAudio = audio;
  audio.play().catch((err) => {
    appendEventRow(`Probe audio could not start: ${err?.message || err}`);
  });
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

function headStatusForMetrics(metrics) {
  const map = new Map();
  for (const metric of metrics) {
    const loc = displayLocation(metric.location);
    if (!loc || loc === "-") continue;
    const current = map.get(loc) || { in: 0, out: 0, missing: 0, worst: 0 };
    const status = normalizeStatus(metric.status);
    if (status === "OUT_OF_RANGE") {
      current.out += 1;
      current.worst = Math.max(current.worst, Math.abs(Number(metric.value) || 0));
    } else if (status === "IN_RANGE") {
      current.in += 1;
    } else {
      current.missing += 1;
    }
    map.set(loc, current);
  }
  return map;
}

function drawClinicalHeadMap(metrics) {
  const canvas = refs.clinicalHeadCanvas;
  if (!canvas) return;
  const size = resizeCanvasToDisplaySize(canvas);
  if (!size) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = size.width;
  const height = size.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.38;
  const statusByLoc = headStatusForMetrics(metrics);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfb";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#9ba79f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius * 0.86, radius, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.11, cy - radius * 0.98);
  ctx.lineTo(cx, cy - radius * 1.1);
  ctx.lineTo(cx + radius * 0.11, cy - radius * 0.98);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - radius * 0.88, cy, radius * 0.08, Math.PI * 0.55, Math.PI * 1.45);
  ctx.arc(cx + radius * 0.88, cy, radius * 0.08, Math.PI * 1.55, Math.PI * 0.45);
  ctx.stroke();

  for (const [loc, pos] of Object.entries(HEAD_POSITIONS)) {
    const x = pos[0] * width;
    const y = pos[1] * height;
    const status = statusByLoc.get(loc) || { in: 0, out: 0, missing: 0 };
    const total = status.in + status.out + status.missing;
    const color = status.out ? "#a9302f" : status.in ? "#1f7d48" : "#d7ddd7";
    const r = status.out ? 15 : 12;
    ctx.fillStyle = color;
    ctx.globalAlpha = total ? 0.9 : 0.45;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#1d2525";
    ctx.font = "12px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText(loc, x, y + r + 13);
  }
  ctx.textAlign = "left";
}

function renderClinicalHeadLegend(metrics) {
  if (!refs.clinicalHeadLegend) return;
  refs.clinicalHeadLegend.innerHTML = "";
  const map = headStatusForMetrics(metrics);
  const rows = [...map.entries()]
    .filter(([, status]) => status.in + status.out + status.missing > 0)
    .sort((a, b) => b[1].out - a[1].out || a[0].localeCompare(b[0]));
  if (!rows.length) {
    const row = document.createElement("div");
    row.className = "headmap-item";
    row.innerHTML = "<strong>-</strong><span>No mapped metrics yet.</span><span></span>";
    refs.clinicalHeadLegend.appendChild(row);
    return;
  }
  for (const [loc, status] of rows.slice(0, 8)) {
    const row = document.createElement("div");
    row.className = "headmap-item";
    const name = document.createElement("strong");
    name.textContent = loc;
    const detail = document.createElement("span");
    detail.textContent = `${status.in} in, ${status.out} out, ${status.missing} missing`;
    const badge = document.createElement("span");
    badge.className = `badge ${status.out ? "out" : "in"}`;
    badge.textContent = status.out ? "OUT" : "IN";
    row.appendChild(name);
    row.appendChild(detail);
    row.appendChild(badge);
    refs.clinicalHeadLegend.appendChild(row);
  }
}

function clearResults() {
  resultState.metrics = [];
  resultState.summary = { in_range: 0, out_of_range: 0, missing: 0, potential_symptom_questions: [] };
  resultState.sourceLabel = "live session";
  resultState.rawResult = null;

  if (refs.resultsTableBody) refs.resultsTableBody.innerHTML = "";
  if (refs.probeList) refs.probeList.innerHTML = "";
  if (refs.keyMetrics) refs.keyMetrics.innerHTML = "";
  drawClinicalHeadMap([]);
  renderClinicalHeadLegend([]);
  if (refs.resultSource) refs.resultSource.textContent = "Source: live session";
  if (refs.summary) refs.summary.textContent = "Running session...";
}

function redrawResults() {
  const visibleMetrics = resultState.metrics.filter((metric) => isMetricVisible(metric));
  renderResultTable(visibleMetrics);
  renderProbeList(resultState.summary);
  drawClinicalHeadMap(resultState.metrics);
  renderClinicalHeadLegend(resultState.metrics);

  const total = resultState.metrics.length;
  const shown = visibleMetrics.length;
  const filter = selectedResultFilter();
  const filterNote = filter === "all" ? `Showing ${shown}.` : `Showing ${shown}/${total}.`;
  if (refs.summary) {
    refs.summary.textContent = `In range: ${resultState.summary.in_range} | Out of range: ${resultState.summary.out_of_range} | Missing: ${resultState.summary.missing} | ${filterNote}`;
  }

  if (refs.resultSource) refs.resultSource.textContent = `Source: ${resultState.sourceLabel || "live session"}`;
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

function renderResults(payload, sourceLabel = "live session") {
  const root = payload?.result || payload;
  const container = findMetricsContainer(root);
  if (!container) {
    throw new Error("Could not find a metrics[] array in the selected JSON.");
  }

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

  resultState.metrics = metrics;
  resultState.summary = summary;
  resultState.sourceLabel = sourceLabel || "live session";
  resultState.rawResult = root;

  redrawResults();
}

function setRunningState(isRunning) {
  running = isRunning;
  if (refs.startBtn) refs.startBtn.disabled = isRunning;
  if (refs.stopBtn) refs.stopBtn.disabled = !isRunning;
  if (refs.openResultBtn) refs.openResultBtn.disabled = isRunning;
  syncSessionUi();
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

function parseTags(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function selectedProfilePayload() {
  const profile = profileState.profiles.find((item) => item.id === refs.profileSelect?.value) || profileState.profiles[0];
  return profile ? { id: profile.id, name: profile.name } : { id: "default", name: "Default Profile" };
}

function sessionMetadataConfig() {
  return {
    profile: selectedProfilePayload(),
    tags: parseTags(refs.sessionTags?.value),
    notes: String(refs.sessionNotes?.value || "").trim(),
  };
}

function renderProfiles() {
  if (!refs.profileSelect) return;
  refs.profileSelect.innerHTML = "";
  for (const profile of profileState.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    refs.profileSelect.appendChild(option);
  }
  refs.profileSelect.value = profileState.activeProfileId;
}

async function loadProfiles() {
  const payload = await window.clinicalQ.listProfiles();
  profileState.profiles = payload.profiles || [];
  profileState.activeProfileId = payload.activeProfileId || "default";
  renderProfiles();
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
    case "session_stopped":
      return "Session stopped.";
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
  const selectedLocations = selectedClinicalqLocations();
  if (!selectedLocations.length) {
    throw new Error("Select at least one ClinicalQ position.");
  }
  const selectedSoundProbes = selectedClinicalqSoundProbes();

  return {
    ...sessionMetadataConfig(),
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
    channels: clinicalqChannelMapForLocations(selectedLocations),
    selected_locations: selectedLocations,
    sound_probes: selectedSoundProbes,
    sequential_order: CLINICALQ_LOCATION_ORDER.filter((loc) => selectedLocations.includes(loc)),
  };
}

function buildConfig() {
  return buildClinicalQConfig();
}

function syncSessionUi() {
  const isSequential = refs.mode?.value === "sequential";

  if (refs.mode) refs.mode.disabled = running;
  if (refs.manualReposition) refs.manualReposition.disabled = running || !isSequential;
  const manual = isSequential && refs.manualReposition?.checked;
  if (refs.repositionSeconds) refs.repositionSeconds.disabled = running || manual;
  if (refs.includeFrontalBaseline) refs.includeFrontalBaseline.disabled = running;
  if (refs.serialPort) refs.serialPort.disabled = running;
  if (refs.useSynthetic) refs.useSynthetic.disabled = running;
  if (refs.fastMode) refs.fastMode.disabled = running;
  if (refs.soundCues) refs.soundCues.disabled = running;
  if (refs.cueLead) refs.cueLead.disabled = running;

  syncClinicalqLocationControls();

  if (refs.startBtn) {
    refs.startBtn.textContent = "Start ClinicalQ Session";
  }

  seedBandLocations(selectedClinicalqLocations());
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
    playProbeAudio(event.label);
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

  if (event.event === "epoch_complete") {
    stopProbeAudio();
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
    event.event === "error" ||
    event.event === "session_stopped"
  ) {
    setReadyState(null);
    setCountdown("");
    stopProbeAudio();
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

    setRunningState(true);
    setReadyState(null);
    setCueBanner("");
    setCountdown("");
    clearResults();

    try {
      await warmAudio();
      const config = buildConfig();
      const payload = await window.clinicalQ.startSession(config);
      const sourceNote = payload.outputPath || payload.output_path || "live session";

      renderResults(payload.result, sourceNote);
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
    const result = await window.clinicalQ.stopSession();
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

if (refs.clinicalLauncherBtn) {
  refs.clinicalLauncherBtn.addEventListener("click", () => window.clinicalQ.openApplet("launcher"));
}

if (refs.followActive) refs.followActive.addEventListener("change", syncBandpowerUi);
if (refs.bandLoc) refs.bandLoc.addEventListener("change", syncBandpowerUi);
if (refs.bandDelta) refs.bandDelta.addEventListener("change", drawBandpower);
if (refs.bandTheta) refs.bandTheta.addEventListener("change", drawBandpower);
if (refs.bandAlpha) refs.bandAlpha.addEventListener("change", drawBandpower);
if (refs.bandBeta) refs.bandBeta.addEventListener("change", drawBandpower);
if (refs.bandHiBeta) refs.bandHiBeta.addEventListener("change", drawBandpower);
if (refs.resultFilter) refs.resultFilter.addEventListener("change", redrawResults);

window.addEventListener("resize", () => {
  drawBandpower();
  drawClinicalHeadMap(resultState.metrics);
});

if (refs.mode) refs.mode.addEventListener("change", syncSessionUi);
if (refs.manualReposition) refs.manualReposition.addEventListener("change", syncSessionUi);
for (const refName of Object.values(CLINICALQ_LOCATION_REFS)) {
  if (refs[refName]) refs[refName].addEventListener("change", syncSessionUi);
}
for (const def of Object.values(CLINICALQ_PROBES)) {
  if (refs[def.checkboxRef]) refs[def.checkboxRef].addEventListener("change", syncSessionUi);
}
if (refs.profileSelect) {
  refs.profileSelect.addEventListener("change", async () => {
    profileState.activeProfileId = refs.profileSelect.value;
    await window.clinicalQ.setActiveProfile(refs.profileSelect.value);
  });
}
seedBandLocations(selectedClinicalqLocations());
syncSessionUi();
syncBandpowerUi();
drawClinicalHeadMap([]);
renderClinicalHeadLegend([]);

checkPython().catch((err) => {
  if (refs.pythonStatus) refs.pythonStatus.textContent = `Runtime check failed: ${err.message || err}`;
});

loadProfiles().catch((err) => {
  appendEventRow(`Profile load failed: ${err.message || err}`);
});
