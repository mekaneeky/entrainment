const refs = {
  mode: document.getElementById("mode"),
  serialPort: document.getElementById("serialPort"),
  epochSeconds: document.getElementById("epochSeconds"),
  repositionSeconds: document.getElementById("repositionSeconds"),
  useSynthetic: document.getElementById("useSynthetic"),
  fastMode: document.getElementById("fastMode"),
  includeFrontalBaseline: document.getElementById("includeFrontalBaseline"),
  manualReposition: document.getElementById("manualReposition"),
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
  eventLog: document.getElementById("eventLog"),
  resultsTableBody: document.querySelector("#resultsTable tbody"),
  summary: document.getElementById("summary"),
  probeList: document.getElementById("probeList"),
};

let running = false;
let pendingReadyLocation = null;
let activeLocation = null;

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
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return Number(value).toFixed(3);
}

function statusBadge(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "in_range") return { text: "IN", cls: "in" };
  if (normalized === "out_of_range") return { text: "OUT", cls: "out" };
  return { text: "MISSING", cls: "missing" };
}

function clearResults() {
  refs.resultsTableBody.innerHTML = "";
  refs.probeList.innerHTML = "";
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

function renderResults(payload) {
  const result = payload?.result || payload;
  const metrics = result?.metrics || [];
  const summary = result?.summary || {};

  refs.resultsTableBody.innerHTML = "";

  for (const metric of metrics) {
    const tr = document.createElement("tr");
    tr.className = metric.status === "OUT_OF_RANGE" ? "out" : metric.status === "IN_RANGE" ? "in" : "";

    const badge = statusBadge(metric.status);
    const cells = [metric.location, metric.metric, formatValue(metric.value), metric.normal_range, "", metric.probe || ""];

    cells.forEach((value, idx) => {
      const td = document.createElement("td");
      if (idx === 4) {
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

  refs.summary.textContent = `In range: ${summary.in_range ?? 0} | Out of range: ${summary.out_of_range ?? 0} | Missing: ${
    summary.missing ?? 0
  }`;

  refs.probeList.innerHTML = "";
  const probes = summary.potential_symptom_questions || [];
  if (!probes.length) {
    const li = document.createElement("li");
    li.textContent = "No out-of-range symptom probes generated.";
    refs.probeList.appendChild(li);
  } else {
    for (const probe of probes) {
      const li = document.createElement("li");
      li.textContent = probe;
      refs.probeList.appendChild(li);
    }
  }
}

function setRunningState(isRunning) {
  running = isRunning;
  refs.startBtn.disabled = isRunning;
  refs.stopBtn.disabled = !isRunning;
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
    bandState.sequence = null;
    bandState.index = null;
    bandState.label = null;
    resetBandState(`${Date.now()}`);
  }
  if (event.event === "epoch_start") {
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
  }
  if (event.event === "reposition_complete") {
    setReadyState(null);
  }
  if (event.event === "session_complete" || event.event === "error" || event.event === "session_stopped") {
    setReadyState(null);
  }

  const text = summarizeEvent(event);
  appendEventRow(text);
  refs.liveEvent.textContent = text;
});

refs.startBtn.addEventListener("click", async () => {
  if (running) return;

  setRunningState(true);
  setReadyState(null);
  clearResults();

  try {
    const config = buildConfig();
    const payload = await window.clinicalQ.startSession(config);
    renderResults(payload.result);
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
window.addEventListener("resize", drawBandpower);

refs.mode.addEventListener("change", syncRepositionUi);
refs.manualReposition.addEventListener("change", syncRepositionUi);
syncRepositionUi();
syncBandpowerUi();

checkPython().catch((err) => {
  refs.pythonStatus.textContent = `Runtime check failed: ${err.message || err}`;
});
