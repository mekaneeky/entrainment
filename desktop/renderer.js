const refs = {
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
};

let running = false;
let pendingReadyLocation = null;
let activeLocation = null;
let audioCtx = null;
let epochContext = null;
let nextWarnedEpochKey = null;
let lastEpochLabel = null;

const BAND_META = {
  delta: { label: "Delta", color: "#a9302f" },
  theta: { label: "Theta", color: "#0b8da3" },
  alpha: { label: "Alpha", color: "#9b5b00" },
  beta: { label: "Beta", color: "#1f7d48" },
  hibeta: { label: "HiBeta", color: "#2b3a46" },
};

const bandState = {
  epochKey: null,
  sequence: null,
  index: null,
  label: null,
  byLocation: {
    Cz: {},
    O1: {},
    Fz: {},
    F3: {},
    F4: {},
  },
};

const resultState = {
  metrics: [],
  summary: { in_range: 0, out_of_range: 0, missing: 0, potential_symptom_questions: [] },
  sourceLabel: "live session",
};

function shouldLogEvent(name) {
  return !["epoch_tick", "reposition_tick", "bandpower"].includes(String(name || ""));
}

function cueLeadSeconds() {
  const value = Number(refs.cueLead?.value);
  if (!Number.isFinite(value)) return 3;
  return Math.max(0, Math.min(10, Math.floor(value)));
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
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
  } catch {
    // ignore - some environments disallow resuming outside a gesture
  }
}

function beepOnce(freq, durationSec) {
  if (!refs.soundCues?.checked) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    // Best effort - if it fails, user can toggle cues off.
    ctx.resume().catch(() => undefined);
  }

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

function resetBandState(epochKey) {
  bandState.epochKey = epochKey;
  for (const loc of Object.keys(bandState.byLocation)) {
    bandState.byLocation[loc] = { delta: [], theta: [], alpha: [], beta: [], hibeta: [] };
  }
  drawBandpower();
}

function nowStamp() {
  return new Date().toLocaleTimeString();
}

function appendEventRow(text) {
  const row = document.createElement("div");
  row.className = "event-row";
  row.textContent = `[${nowStamp()}] ${text}`;
  refs.eventLog.prepend(row);
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
  if (["MISSING", "NA", "N/A", ""].includes(normalized)) return "MISSING";
  return "MISSING";
}

function statusBadge(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "IN_RANGE") return { text: "IN", cls: "in" };
  if (normalized === "OUT_OF_RANGE") return { text: "OUT", cls: "out" };
  return { text: "MISSING", cls: "missing" };
}

function clearResults() {
  resultState.metrics = [];
  resultState.summary = { in_range: 0, out_of_range: 0, missing: 0, potential_symptom_questions: [] };
  resultState.sourceLabel = "live session";
  refs.resultsTableBody.innerHTML = "";
  refs.probeList.innerHTML = "";
  if (refs.keyMetrics) refs.keyMetrics.innerHTML = "";
  if (refs.resultSource) refs.resultSource.textContent = "Source: live session";
  refs.summary.textContent = "Running session...";
}

function setReadyState(location) {
  pendingReadyLocation = location || null;
  if (pendingReadyLocation) {
    refs.readyBtn.disabled = false;
    refs.readyBtn.textContent = `Ready: ${pendingReadyLocation}`;
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

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return Number.NaN;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
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

  // fallback for unusual norms that still include a single numeric limit
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
      metric.location,
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

function redrawResults() {
  const visibleMetrics = resultState.metrics.filter((metric) => isMetricVisible(metric));
  renderResultTable(visibleMetrics);
  renderProbeList(resultState.summary);

  const total = resultState.metrics.length;
  const shown = visibleMetrics.length;
  const filter = selectedResultFilter();
  const filterNote = filter === "all" ? `Showing ${shown}.` : `Showing ${shown}/${total}.`;
  refs.summary.textContent = `In range: ${resultState.summary.in_range} | Out of range: ${resultState.summary.out_of_range} | Missing: ${resultState.summary.missing} | ${filterNote}`;

  if (refs.resultSource) refs.resultSource.textContent = `Source: ${resultState.sourceLabel || "live session"}`;
}

function renderResults(payload, sourceLabel = "live session") {
  const container = findMetricsContainer(payload?.result || payload);
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
  redrawResults();
}

function setRunningState(isRunning) {
  running = isRunning;
  refs.startBtn.disabled = isRunning;
  refs.stopBtn.disabled = !isRunning;
  if (refs.openResultBtn) refs.openResultBtn.disabled = isRunning;
}

function buildConfig() {
  const isSequential = refs.mode.value === "sequential";
  const manualAdvance = isSequential && refs.manualReposition.checked;
  return {
    mode: refs.mode.value,
    epoch_seconds: Number(refs.epochSeconds.value || 15),
    reposition_seconds: Number(refs.repositionSeconds.value || 20),
    reposition_mode: manualAdvance ? "manual" : "timer",
    live_bandpower: true,
    live_window_seconds: 2.0,
    sampling_rate: 250,
    fast_mode: refs.fastMode.checked,
    include_frontal_baseline: refs.includeFrontalBaseline.checked,
    board: {
      board_id: "cyton",
      serial_port: refs.serialPort.value || "COM3",
      use_synthetic: refs.useSynthetic.checked,
      available_channels: [1, 2, 3, 4, 5, 6, 7, 8],
      seed: 42,
    },
    channels: {
      Cz: Number(refs.chCz.value || 1),
      O1: Number(refs.chO1.value || 2),
      Fz: Number(refs.chFz.value || 3),
      F3: Number(refs.chF3.value || 4),
      F4: Number(refs.chF4.value || 5),
    },
    sequential_order: ["O1", "Cz", "Fz", "F3", "F4"],
  };
}

async function checkPython() {
  const status = await window.clinicalQ.checkPython();
  refs.pythonStatus.textContent = status.ok ? `Runtime OK: ${status.message}` : `Runtime error: ${status.message}`;
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
      if (event.mode === "manual") {
        return `Reposition electrode to ${event.next_location}, then click Ready.`;
      }
      return `Reposition electrode to ${event.next_location}.`;
    case "reposition_tick":
      return `Reposition countdown: ${event.seconds_remaining}s`;
    case "reposition_waiting":
      return `Waiting for readiness: ${event.next_location}`;
    case "reposition_input_eof":
      return `No stdin available; proceeding to ${event.next_location}.`;
    case "reposition_complete":
      return `Reposition complete: ${event.next_location}`;
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
  return String(refs.bandLoc?.value || "Cz");
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
  const keys = Object.keys(BAND_META).filter((k) => bands[k]);

  const padding = { left: 44, right: 12, top: 10, bottom: 22 };
  const plotW = size.width - padding.left - padding.right;
  const plotH = size.height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, size.width, size.height);

  // background
  ctx.fillStyle = "rgba(255, 255, 255, 0.0)";
  ctx.fillRect(0, 0, size.width, size.height);

  // figure out y range
  let yMax = 0;
  let xMax = 0;
  for (const key of keys) {
    const series = data[key] || [];
    xMax = Math.max(xMax, series.length);
    for (const v of series) {
      if (Number.isFinite(v)) yMax = Math.max(yMax, v);
    }
  }
  if (!Number.isFinite(yMax) || yMax <= 0) yMax = 1.0;
  yMax *= 1.1;

  // grid
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + plotW, y);
    ctx.stroke();
  }

  // y labels
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.font = `${Math.max(11, Math.floor(11 * (size.dpr / (window.devicePixelRatio || 1))))}px Bahnschrift, sans-serif`;
  ctx.fillText(`${yMax.toFixed(1)} uV`, 6, padding.top + 10);
  ctx.fillText("0", 6, padding.top + plotH);

  // title
  const title = bandState.label ? `${loc} ${bandState.label}` : `${loc}`;
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillText(title, padding.left, padding.top + 10);

  // plot series
  const n = Math.max(2, xMax);
  const xStep = plotW / (n - 1);

  for (const key of keys) {
    const series = data[key] || [];
    if (series.length < 2) continue;

    ctx.strokeStyle = BAND_META[key].color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < series.length; i += 1) {
      const v = series[i];
      const x = padding.left + xStep * i;
      const y = padding.top + plotH - (Math.max(0, v) / yMax) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // current values
  const parts = [];
  for (const key of keys) {
    const series = data[key] || [];
    const last = series.length ? series[series.length - 1] : null;
    if (last === null || last === undefined || !Number.isFinite(last)) continue;
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
    resetBandState(`${event.sequence}-${event.index}-${event.label}`);
    if (refs.followActive?.checked && Array.isArray(event.locations) && event.locations.length === 1) {
      activeLocation = event.locations[0];
      if (refs.bandLoc) refs.bandLoc.value = activeLocation;
    }
    syncBandpowerUi();
  }
  if (event.event === "epoch_tick") {
    setCountdown(`${event.sequence} E${event.index} ${event.label}: ${event.seconds_remaining}s remaining`);

    const lead = cueLeadSeconds();
    if (lead > 0 && Number(event.seconds_remaining) === lead && epochContext) {
      const ctxKey = epochKey(epochContext);
      const nextEpoch = epochContext.next_epoch;
      if (
        nextEpoch &&
        nextWarnedEpochKey !== ctxKey &&
        String(nextEpoch.label || "") !== String(epochContext.label || "")
      ) {
        nextWarnedEpochKey = ctxKey;
        setCueBanner(`UP NEXT: ${nextEpoch.label} | ${nextEpoch.instruction || ""}`);
        playCue(nextEpoch.label);
      }
    }
  }
  if (event.event === "bandpower") {
    const features = event.features || {};
    for (const [loc, vals] of Object.entries(features)) {
      const dest = bandState.byLocation[loc];
      if (!dest) continue;
      for (const key of Object.keys(BAND_META)) {
        const v = Number(vals?.[key]);
        if (Number.isFinite(v)) dest[key].push(v);
      }
    }
    drawBandpower();
  }
  if (event.event === "reposition_start" && event.mode === "manual") {
    setReadyState(event.next_location);
    setCueBanner(`MOVE ELECTRODE: ${event.next_location} | Click Ready when stable.`);
    setCountdown("");
  }
  if (event.event === "reposition_start" && event.mode === "timer") {
    setCueBanner(`MOVE ELECTRODE: ${event.next_location}`);
    setCountdown("");
  }
  if (event.event === "reposition_tick") {
    setCountdown(`Reposition: ${event.seconds_remaining}s`);
  }
  if (event.event === "reposition_complete") {
    setReadyState(null);
    setCountdown("");
  }
  if (event.event === "session_complete" || event.event === "error" || event.event === "session_stopped") {
    setReadyState(null);
    setCountdown("");
  }

  const text = summarizeEvent(event);
  if (shouldLogEvent(event.event)) {
    appendEventRow(text);
  }
  if (!["epoch_tick", "reposition_tick", "bandpower"].includes(event.event)) {
    refs.liveEvent.textContent = text;
  }
});

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
    renderResults(payload.result, payload.outputPath || payload.output_path || "live session");
    refs.liveEvent.textContent = `Completed. Output: ${payload.outputPath || payload.output_path || "saved"}`;
  } catch (err) {
    refs.liveEvent.textContent = `Failed: ${err.message || err}`;
    appendEventRow(`Failure: ${err.message || err}`);
    refs.summary.textContent = "Session failed.";
  } finally {
    setRunningState(false);
  }
});

refs.stopBtn.addEventListener("click", async () => {
  if (!running) return;
  const result = await window.clinicalQ.stopSession();
  appendEventRow(result.stopped ? "Stop signal sent." : `Stop ignored: ${result.reason}`);
  setReadyState(null);
  setRunningState(false);
});

refs.readyBtn.addEventListener("click", async () => {
  if (!pendingReadyLocation) return;
  const response = await window.clinicalQ.sendCommand({ command: "ready", next_location: pendingReadyLocation });
  if (response?.ok) {
    refs.readyBtn.disabled = true;
    refs.readyHint.textContent = `Ready sent for ${pendingReadyLocation}.`;
  } else {
    appendEventRow(`Ready failed: ${response?.message || "unknown error"}`);
  }
});

if (refs.openResultBtn) {
  refs.openResultBtn.addEventListener("click", async () => {
    if (running) return;
    try {
      const picked = await window.clinicalQ.openResultFile();
      if (!picked || picked.canceled) return;
      renderResults(picked.result, picked.filePath || "result file");
      refs.liveEvent.textContent = `Loaded result: ${picked.filePath || "file"}`;
      appendEventRow(`Loaded result file: ${picked.filePath || "unknown path"}`);
    } catch (err) {
      refs.liveEvent.textContent = `Open failed: ${err.message || err}`;
      appendEventRow(`Open result failed: ${err.message || err}`);
    }
  });
}

function syncRepositionUi() {
  const isSequential = refs.mode.value === "sequential";
  refs.manualReposition.disabled = !isSequential;
  const manual = isSequential && refs.manualReposition.checked;
  refs.repositionSeconds.disabled = manual;
}

if (refs.followActive) refs.followActive.addEventListener("change", syncBandpowerUi);
if (refs.bandLoc) refs.bandLoc.addEventListener("change", syncBandpowerUi);
if (refs.bandDelta) refs.bandDelta.addEventListener("change", drawBandpower);
if (refs.bandTheta) refs.bandTheta.addEventListener("change", drawBandpower);
if (refs.bandAlpha) refs.bandAlpha.addEventListener("change", drawBandpower);
if (refs.bandBeta) refs.bandBeta.addEventListener("change", drawBandpower);
if (refs.bandHiBeta) refs.bandHiBeta.addEventListener("change", drawBandpower);
if (refs.resultFilter) refs.resultFilter.addEventListener("change", redrawResults);
window.addEventListener("resize", drawBandpower);

refs.mode.addEventListener("change", syncRepositionUi);
refs.manualReposition.addEventListener("change", syncRepositionUi);
syncRepositionUi();
syncBandpowerUi();

checkPython().catch((err) => {
  refs.pythonStatus.textContent = `Runtime check failed: ${err.message || err}`;
});
