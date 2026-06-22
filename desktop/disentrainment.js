const refs = {
  runtimeStatus: document.getElementById("runtimeStatus"),
  profileSelect: document.getElementById("profileSelect"),
  launcherBtn: document.getElementById("launcherBtn"),
  sourceMode: document.getElementById("sourceMode"),
  boardId: document.getElementById("boardId"),
  serialPort: document.getElementById("serialPort"),
  measureSeconds: document.getElementById("measureSeconds"),
  condition: document.getElementById("condition"),
  dfLow: document.getElementById("dfLow"),
  dfHigh: document.getElementById("dfHigh"),
  sessionTags: document.getElementById("sessionTags"),
  sessionNotes: document.getElementById("sessionNotes"),
  montageStatus: document.getElementById("montageStatus"),
  headMontage: document.getElementById("headMontage"),
  montagePreBtn: document.getElementById("montagePreBtn"),
  montageProtocolBtn: document.getElementById("montageProtocolBtn"),
  montageOffsetBtn: document.getElementById("montageOffsetBtn"),
  montagePostBtn: document.getElementById("montagePostBtn"),
  endDisentrainmentSessionBtn: document.getElementById("endDisentrainmentSessionBtn"),
  priorSessionSelect: document.getElementById("priorSessionSelect"),
  loadPriorSessionBtn: document.getElementById("loadPriorSessionBtn"),
  priorSessionStatus: document.getElementById("priorSessionStatus"),
  montagePreset: document.getElementById("montagePreset"),
  captureBatchSize: document.getElementById("captureBatchSize"),
  captureBatch: document.getElementById("captureBatch"),
  applyPresetBtn: document.getElementById("applyPresetBtn"),
  prevBatchBtn: document.getElementById("prevBatchBtn"),
  nextBatchBtn: document.getElementById("nextBatchBtn"),
  batchStatus: document.getElementById("batchStatus"),
  siteRows: document.getElementById("siteRows"),
  addSiteBtn: document.getElementById("addSiteBtn"),
  measureBtn: document.getElementById("measureBtn"),
  postMeasureBtn: document.getElementById("postMeasureBtn"),
  measureAllPreBtn: document.getElementById("measureAllPreBtn"),
  measureAllPostBtn: document.getElementById("measureAllPostBtn"),
  runSequenceBtn: document.getElementById("runSequenceBtn"),
  carrierHz: document.getElementById("carrierHz"),
  manualPulseHz: document.getElementById("manualPulseHz"),
  dutyPercent: document.getElementById("dutyPercent"),
  volume: document.getElementById("volume"),
  testToneBtn: document.getElementById("testToneBtn"),
  stopToneBtn: document.getElementById("stopToneBtn"),
  toneStatus: document.getElementById("toneStatus"),
  protocolSummary: document.getElementById("protocolSummary"),
  protocolSite: document.getElementById("protocolSite"),
  protocolMode: document.getElementById("protocolMode"),
  stage1OffsetMode: document.getElementById("stage1OffsetMode"),
  stage1Percent: document.getElementById("stage1Percent"),
  stage1AheadMin: document.getElementById("stage1AheadMin"),
  stage1BehindMin: document.getElementById("stage1BehindMin"),
  stage1Repeats: document.getElementById("stage1Repeats"),
  stage2OffsetMode: document.getElementById("stage2OffsetMode"),
  stage2Percent: document.getElementById("stage2Percent"),
  stage2AheadMin: document.getElementById("stage2AheadMin"),
  stage2BehindMin: document.getElementById("stage2BehindMin"),
  stage2Repeats: document.getElementById("stage2Repeats"),
  adaptiveDfWindowSeconds: document.getElementById("adaptiveDfWindowSeconds"),
  startProtocolBtn: document.getElementById("startProtocolBtn"),
  stopProtocolBtn: document.getElementById("stopProtocolBtn"),
  protocolProgress: document.getElementById("protocolProgress"),
  protocolStatus: document.getElementById("protocolStatus"),
  offsetStatus: document.getElementById("offsetStatus"),
  offsetSite: document.getElementById("offsetSite"),
  offsetBaselineSeconds: document.getElementById("offsetBaselineSeconds"),
  offsetScoreMetric: document.getElementById("offsetScoreMetric"),
  offsetGradientWindowSeconds: document.getElementById("offsetGradientWindowSeconds"),
  offsetMeasureDuringStim: document.getElementById("offsetMeasureDuringStim"),
  offsetGradientStatus: document.getElementById("offsetGradientStatus"),
  offsetTrialRows: document.getElementById("offsetTrialRows"),
  offsetMeasureBaselineBtn: document.getElementById("offsetMeasureBaselineBtn"),
  offsetAddTrialBtn: document.getElementById("offsetAddTrialBtn"),
  offsetSaveSettingsBtn: document.getElementById("offsetSaveSettingsBtn"),
  offsetRunBtn: document.getElementById("offsetRunBtn"),
  offsetStopBtn: document.getElementById("offsetStopBtn"),
  offsetProgress: document.getElementById("offsetProgress"),
  offsetResultBody: document.getElementById("offsetResultBody"),
  bandTabs: document.getElementById("bandTabs"),
  bandSummary: document.getElementById("bandSummary"),
  bandChart: document.getElementById("bandChart"),
  bandPreValueHead: document.getElementById("bandPreValueHead"),
  bandPreSpreadHead: document.getElementById("bandPreSpreadHead"),
  bandPostValueHead: document.getElementById("bandPostValueHead"),
  bandPostSpreadHead: document.getElementById("bandPostSpreadHead"),
  bandPreBody: document.getElementById("bandPreBody"),
  bandPostBody: document.getElementById("bandPostBody"),
  resultSource: document.getElementById("resultSource"),
  mapTableBody: document.getElementById("mapTableBody"),
};

const LOCATIONS = [
  "Fp1",
  "FPo1",
  "FPo2",
  "Fp2",
  "F7",
  "F3",
  "Fz",
  "F4",
  "F8",
  "T3",
  "C3",
  "Cz",
  "C4",
  "T4",
  "T5",
  "P3",
  "Pz",
  "P4",
  "T6",
  "O1",
  "Oz",
  "O2",
];

const SITE_LAYOUT = {
  FPo1: { x: 44, y: 11 },
  FPo2: { x: 56, y: 11 },
  Fp1: { x: 36, y: 17 },
  Fp2: { x: 64, y: 17 },
  F7: { x: 22, y: 31 },
  F3: { x: 38, y: 32 },
  Fz: { x: 50, y: 29 },
  F4: { x: 62, y: 32 },
  F8: { x: 78, y: 31 },
  T3: { x: 15, y: 50 },
  C3: { x: 36, y: 50 },
  Cz: { x: 50, y: 50 },
  C4: { x: 64, y: 50 },
  T4: { x: 85, y: 50 },
  T5: { x: 22, y: 70 },
  P3: { x: 38, y: 68 },
  Pz: { x: 50, y: 72 },
  P4: { x: 62, y: 68 },
  T6: { x: 78, y: 70 },
  O1: { x: 40, y: 86 },
  Oz: { x: 50, y: 90 },
  O2: { x: 60, y: 86 },
};

const MONTAGE_PRESETS = {
  cz: ["Cz"],
  "1020": LOCATIONS,
  posterior: ["P3", "Pz", "P4", "O1", "Oz", "O2"],
};

const CLINICALQ_BANDS = {
  delta: { label: "Delta", low: 1.5, high: 2.5 },
  theta: { label: "Theta", low: 3, high: 7 },
  alpha: { label: "Alpha", low: 8, high: 12 },
  beta: { label: "Beta", low: 16, high: 25 },
  smr: { label: "SMR", low: 12, high: 15 },
};

const RESULT_VIEWS = {
  all: { label: "All / DF", rangeLabel: "1-30 Hz", mode: "all" },
  df: { label: "DF Hz", rangeLabel: "Dominant frequency", mode: "df" },
  ...CLINICALQ_BANDS,
};

const DEFAULT_OFFSET_TRIALS = [
  { mode: "percent", value: 3, direction: "ahead", stimSeconds: 8, measureSeconds: 20 },
  { mode: "percent", value: 7, direction: "ahead", stimSeconds: 8, measureSeconds: 20 },
  { mode: "percent", value: 12, direction: "alternate", stimSeconds: 8, measureSeconds: 20 },
];

const state = {
  profiles: [],
  sessions: [],
  activeProfileId: "default",
  currentSessionStartedAt: new Date().toISOString(),
  loadedSessionId: "",
  selectedSite: "Cz",
  preRows: [],
  postRows: [],
  measuredRows: [],
  siteProgress: {},
  measuring: false,
  protocol: null,
  selectedBand: "all",
  preOutputPath: "",
  postOutputPath: "",
  activeBatchIndex: 0,
  offsetBaselineRows: [],
  offsetResults: [],
  offsetFinder: {
    running: false,
    cancelled: false,
  },
  liveContext: null,
  adaptiveProtocol: null,
};

function num(ref, fallback) {
  const value = Number(ref?.value);
  return Number.isFinite(value) ? value : fallback;
}

function fmt(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "-";
}

function parseTags(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function summarize(values) {
  const clean = values.map(Number).filter(Number.isFinite);
  if (!clean.length) return { mean: NaN, sd: NaN, n: 0 };
  const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  const variance =
    clean.length > 1
      ? clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (clean.length - 1)
      : 0;
  return { mean, sd: Math.sqrt(variance), n: clean.length };
}

function bandStats(row, band) {
  const stats = row.clinicalq_band_stats?.[band];
  if (stats) {
    return {
      mean: Number(stats.mean_amplitude),
      sd: Number(stats.sd_amplitude),
      windows: Number(stats.window_count),
    };
  }
  const fallback = row.clinicalq_amplitudes?.[band] ?? row.amplitudes?.[band];
  return { mean: Number(fallback), sd: 0, windows: 1 };
}

function rowsForBand(rows, band) {
  return rows
    .map((row) => ({ ...row, band: bandStats(row, band) }))
    .filter((row) => Number.isFinite(row.band.mean))
    .sort((a, b) => a.band.mean - b.band.mean);
}

function dominantFrequencyAmplitude(row) {
  const direct = Number(row.dominant_frequency_amplitude);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const df = Number(row.dominant_frequency_hz);
  const spectrum = Array.isArray(row.spectrum_1_30_hz) ? row.spectrum_1_30_hz : [];
  if (!Number.isFinite(df) || !spectrum.length) return NaN;
  let best = null;
  for (const bin of spectrum) {
    const hz = Number(bin.hz);
    const amplitude = Number(bin.amplitude);
    if (!Number.isFinite(hz) || !Number.isFinite(amplitude)) continue;
    const distance = Math.abs(hz - df);
    if (!best || distance < best.distance) best = { distance, amplitude };
  }
  return best ? best.amplitude : NaN;
}

function rowsForAllFrequencies(rows) {
  return rows
    .map((row) => ({
      ...row,
      band: {
        mean: Number(row.amplitude_sum),
        sd: Number(row.amplitude_std),
        df: Number(row.dominant_frequency_hz),
        dfAmplitude: dominantFrequencyAmplitude(row),
      },
    }))
    .filter((row) => Number.isFinite(row.band.mean))
    .sort((a, b) => a.band.mean - b.band.mean);
}

function rowsForDominantFrequency(rows) {
  return rows
    .map((row) => ({
      ...row,
      band: {
        mean: Number(row.dominant_frequency_hz),
        sd: 0,
        dfAmplitude: dominantFrequencyAmplitude(row),
      },
    }))
    .filter((row) => Number.isFinite(row.band.mean))
    .sort((a, b) => a.band.mean - b.band.mean);
}

function rowsForResultView(rows, view) {
  if (view === "all") return rowsForAllFrequencies(rows);
  if (view === "df") return rowsForDominantFrequency(rows);
  return rowsForBand(rows, view);
}

function sleepMs(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function offsetSettingsKey(profileId = state.activeProfileId) {
  return `disentrainment-offset-settings:${profileId || "default"}`;
}

function defaultOffsetSettings() {
  return {
    site: "Cz",
    baselineSeconds: 20,
    scoreMetric: "total",
    gradientWindowSeconds: 2,
    measureDuringStim: true,
    trials: DEFAULT_OFFSET_TRIALS.map((trial) => ({ ...trial })),
  };
}

function offsetLabelForMetric(metric) {
  if (metric === "total") return "1-30 Hz Sum";
  return CLINICALQ_BANDS[metric]?.label || metric;
}

function metricForRow(row, metric) {
  if (metric === "total") return Number(row.amplitude_sum);
  return bandStats(row, metric).mean;
}

function rowsForOffsetSelection(rows) {
  return rows.filter((row) => row.location === selectedOffsetSite());
}

function selectedOffsetSite() {
  return refs.offsetSite.value || "Cz";
}

function offsetMeasurementRows() {
  return [{ location: selectedOffsetSite(), channel: 1 }];
}

function selectedOffsetLocations() {
  return [selectedOffsetSite()];
}

function rowForLocation(rows, location) {
  return rows.find((row) => row.location === location) || null;
}

function markSiteProgress(location, updates = {}) {
  if (!location) return;
  state.siteProgress[location] = {
    ...(state.siteProgress[location] || {}),
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  renderMontage();
}

function siteStatus(location) {
  const progress = state.siteProgress[location] || {};
  return {
    pre: Boolean(progress.pre || rowForLocation(state.preRows, location)),
    entrained: Boolean(progress.entrained || progress.offset),
    post: Boolean(progress.post || rowForLocation(state.postRows, location)),
    offset: Boolean(progress.offset),
  };
}

function siteStatusClass(location) {
  const status = siteStatus(location);
  if (status.post) return "status-post";
  if (status.entrained) return "status-entrained";
  if (status.pre) return "status-pre";
  return "";
}

function latestPriorSiteOrder() {
  const startedAt = Date.parse(state.currentSessionStartedAt);
  const currentProfile = selectedProfilePayload().id;
  for (const session of state.sessions || []) {
    if (session.id === state.loadedSessionId) continue;
    if (session.profile_id !== currentProfile) continue;
    if (Date.parse(session.created_at || "") >= startedAt) continue;
    const order = session.summary?.site_order;
    if (Array.isArray(order) && order.length) {
      return order.map((item) => (typeof item === "string" ? item : item.location)).filter(Boolean);
    }
  }
  return [];
}

function recommendedNextSite() {
  for (const location of latestPriorSiteOrder()) {
    if (!LOCATIONS.includes(location)) continue;
    if (!siteStatus(location).post) return location;
  }
  return "";
}

function renderMontage() {
  if (!refs.headMontage) return;
  const recommended = recommendedNextSite();
  refs.headMontage.innerHTML = "";
  for (const location of LOCATIONS) {
    const coord = SITE_LAYOUT[location];
    if (!coord) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = ["montage-site", siteStatusClass(location)]
      .concat(location === state.selectedSite ? ["selected"] : [])
      .concat(location === recommended ? ["recommended"] : [])
      .filter(Boolean)
      .join(" ");
    button.style.setProperty("--x", `${coord.x}%`);
    button.style.setProperty("--y", `${coord.y}%`);
    button.textContent = location;
    const status = siteStatus(location);
    const parts = [
      status.pre ? "pre" : "",
      status.entrained ? "entrained" : "",
      status.post ? "post" : "",
      location === recommended ? "next from prior order" : "",
    ].filter(Boolean);
    button.title = parts.length ? `${location}: ${parts.join(", ")}` : `${location}: not started`;
    button.addEventListener("click", () => selectSite(location));
    refs.headMontage.appendChild(button);
  }
  if (refs.montageStatus) {
    const status = siteStatus(state.selectedSite);
    const phase = status.post ? "post recorded" : status.entrained ? "entrained" : status.pre ? "pre recorded" : "not started";
    refs.montageStatus.textContent =
      `Selected site: ${state.selectedSite} (${phase})` +
      (recommended ? ` | next from prior session: ${recommended}` : "");
  }
}

function selectSite(location) {
  if (!LOCATIONS.includes(location)) return;
  state.selectedSite = location;
  if ([...refs.offsetSite.options].some((option) => option.value === location)) refs.offsetSite.value = location;
  if ([...refs.protocolSite.options].some((option) => option.value === location)) refs.protocolSite.value = location;
  renderMontage();
}

function selectedSiteRows() {
  return [{ location: state.selectedSite || "Cz", channel: 1 }];
}

function meanMetric(rows, metric) {
  const values = rows.map((row) => metricForRow(row, metric)).filter(Number.isFinite);
  if (!values.length) return NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function meanDominantFrequency(rows) {
  const values = rows.map((row) => Number(row.dominant_frequency_hz)).filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampPulseHz(value) {
  return Math.max(0.5, Math.min(45, Number(value)));
}

function setView(view) {
  const target = document.getElementById(view);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  if (window.location.hash.slice(1) !== view) {
    window.history.replaceState(null, "", `#${view}`);
  }
}

function selectedProfilePayload() {
  const profile = state.profiles.find((item) => item.id === refs.profileSelect.value) || state.profiles[0];
  return profile ? { id: profile.id, name: profile.name } : { id: "default", name: "Default Profile" };
}

function renderProfiles() {
  refs.profileSelect.innerHTML = "";
  for (const profile of state.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    refs.profileSelect.appendChild(option);
  }
  refs.profileSelect.value = state.activeProfileId;
}

async function loadProfiles() {
  const payload = await window.disentrainmentTools.listProfiles();
  state.profiles = payload.profiles || [];
  state.activeProfileId = payload.activeProfileId || "default";
  state.sessions = payload.sessions || [];
  renderProfiles();
  loadOffsetSettings();
  renderSessionHistory();
  renderMontage();
}

const tone = new window.IsochronicTone();

function disentrainmentSessions() {
  return (state.sessions || []).filter((session) => {
    const kind = String(session.run_kind || "");
    return kind === "disentrainment-summary" || kind === "disentrainment" || session.applet === "disentrainment";
  });
}

function renderSessionHistory() {
  refs.priorSessionSelect.innerHTML = "";
  const sessions = disentrainmentSessions();
  if (!sessions.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No prior runs";
    refs.priorSessionSelect.appendChild(option);
    refs.loadPriorSessionBtn.disabled = true;
    return;
  }
  refs.loadPriorSessionBtn.disabled = false;
  for (const session of sessions) {
    const option = document.createElement("option");
    option.value = session.id;
    const date = session.created_at ? new Date(session.created_at).toLocaleString() : "Unknown date";
    const count = session.summary?.site_count ? ` ${session.summary.site_count} sites` : "";
    option.textContent = `${date} - ${session.run_kind || "run"}${count}`;
    refs.priorSessionSelect.appendChild(option);
  }
}

async function refreshProfileSessions() {
  const payload = await window.disentrainmentTools.listSessions(selectedProfilePayload().id);
  state.sessions = payload.sessions || [];
  renderSessionHistory();
  renderMontage();
}

function currentSessionSummaryPayload() {
  return {
    profile: selectedProfilePayload(),
    tags: parseTags(refs.sessionTags.value),
    notes: refs.sessionNotes.value.trim(),
    selectedSite: state.selectedSite,
    selectedBand: state.selectedBand,
    preRows: state.preRows,
    postRows: state.postRows,
    offsetResults: state.offsetResults,
    siteProgress: state.siteProgress,
  };
}

async function endDisentrainmentSession() {
  try {
    const payload = currentSessionSummaryPayload();
    if (!payload.preRows.length && !payload.postRows.length && !Object.keys(payload.siteProgress || {}).length) {
      refs.priorSessionStatus.textContent = "Nothing to save yet.";
      return;
    }
    const result = await window.disentrainmentTools.saveSessionSummary(payload);
    state.loadedSessionId = result.session?.id || "";
    refs.priorSessionStatus.textContent = `Saved session summary: ${result.outputPath || result.session?.id || "saved"}.`;
    state.currentSessionStartedAt = new Date().toISOString();
    await refreshProfileSessions();
  } catch (err) {
    refs.priorSessionStatus.textContent = `Could not save session: ${err.message || err}`;
  }
}

function loadSummaryResult(result = {}, session = {}) {
  state.loadedSessionId = session.id || "";
  state.selectedSite = LOCATIONS.includes(result.selected_site) ? result.selected_site : state.selectedSite;
  state.selectedBand = result.selected_band || state.selectedBand;
  state.preRows = Array.isArray(result.preRows) ? result.preRows : [];
  state.postRows = Array.isArray(result.postRows) ? result.postRows : [];
  state.measuredRows = state.preRows;
  state.offsetResults = Array.isArray(result.offsetResults) ? result.offsetResults : [];
  state.siteProgress = result.siteProgress && typeof result.siteProgress === "object" ? result.siteProgress : {};
  selectSite(state.selectedSite);
  renderMeasuredRows();
  renderBandViews();
  renderOffsetResults();
  refs.resultSource.textContent = session.output_path || "loaded session summary";
}

function loadMeasurementResult(result = {}, session = {}) {
  const rows = extractMeasurementRows(result).sort((a, b) => a.amplitude_sum - b.amplitude_sum);
  const tags = session.tags || [];
  const phase = tags.includes("disentrainment-post") || result?.metadata?.session_phase === "post" ? "post" : "pre";
  if (phase === "post") {
    state.postRows = upsertRows(state.postRows, rows);
    for (const row of rows) markSiteProgress(row.location, { post: true });
  } else {
    state.preRows = upsertRows(state.preRows, rows);
    state.measuredRows = state.preRows;
    for (const row of rows) markSiteProgress(row.location, { pre: true });
  }
  if (rows[0]?.location) selectSite(rows[0].location);
  renderMeasuredRows();
  renderBandViews();
  refs.resultSource.textContent = session.output_path || "loaded measurement run";
}

async function loadPriorSession() {
  const sessionId = refs.priorSessionSelect.value;
  if (!sessionId) return;
  try {
    const payload = await window.disentrainmentTools.loadSession(sessionId);
    if (!payload.result) {
      refs.priorSessionStatus.textContent = "Selected run has no readable result file.";
      return;
    }
    if (payload.result.run_kind === "disentrainment-summary" || Array.isArray(payload.result.preRows)) {
      loadSummaryResult(payload.result, payload.session);
    } else {
      loadMeasurementResult(payload.result, payload.session);
    }
    const when = payload.session?.created_at ? new Date(payload.session.created_at).toLocaleString() : "selected run";
    refs.priorSessionStatus.textContent = `Loaded ${when}. Results chart now reflects that run.`;
  } catch (err) {
    refs.priorSessionStatus.textContent = `Could not load run: ${err.message || err}`;
  }
}

function renderSites() {
  refs.siteRows.innerHTML = "";
  const rows = getAllSiteRows();
  for (const item of rows) {
    refs.siteRows.appendChild(siteRowElement(item.location, item.channel));
  }
  renderBatchOptions();
}

function siteRowElement(location = "Cz", channel = 1) {
  const row = document.createElement("div");
  row.className = "site-row";

  const siteLabel = document.createElement("label");
  siteLabel.textContent = "Site";
  const site = document.createElement("select");
  site.dataset.role = "site";
  for (const loc of LOCATIONS) {
    const option = document.createElement("option");
    option.value = loc;
    option.textContent = loc;
    site.appendChild(option);
  }
  site.value = location;
  site.addEventListener("change", () => {
    refs.montagePreset.value = "custom";
    renderBatchOptions();
  });
  siteLabel.appendChild(site);

  const channelLabel = document.createElement("label");
  channelLabel.textContent = "Channel";
  const ch = document.createElement("input");
  ch.dataset.role = "channel";
  ch.type = "number";
  ch.min = "1";
  ch.max = "1";
  ch.value = "1";
  ch.readOnly = true;
  ch.addEventListener("change", () => {
    refs.montagePreset.value = "custom";
    renderBatchOptions();
  });
  channelLabel.appendChild(ch);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "x";
  remove.addEventListener("click", () => {
    if (refs.siteRows.children.length > 1) {
      row.remove();
      refs.montagePreset.value = "custom";
      renderBatchOptions();
    }
  });

  row.append(siteLabel, channelLabel, remove);
  return row;
}

function getAllSiteRows() {
  const rows = [...refs.siteRows.querySelectorAll(".site-row")];
  if (!rows.length) return [{ location: "Cz", channel: 1 }];
  return rows.map((row) => ({
    location: row.querySelector('[data-role="site"]').value,
    channel: Number(row.querySelector('[data-role="channel"]').value),
  }));
}

function batchSize() {
  refs.captureBatchSize.value = "1";
  return 1;
}

function plannedBatches() {
  const allRows = getAllSiteRows();
  const size = batchSize();
  const batches = [];
  for (let i = 0; i < allRows.length; i += size) {
    batches.push(
      allRows.slice(i, i + size).map((row, index) => ({
        location: row.location,
        channel: 1,
      }))
    );
  }
  return batches.length ? batches : [[{ location: "Cz", channel: 1 }]];
}

function getActiveSiteRows() {
  const batches = plannedBatches();
  const index = Math.max(0, Math.min(state.activeBatchIndex, batches.length - 1));
  state.activeBatchIndex = index;
  return batches[index];
}

function renderBatchOptions() {
  const batches = plannedBatches();
  if (state.activeBatchIndex >= batches.length) state.activeBatchIndex = batches.length - 1;
  refs.captureBatch.innerHTML = "";
  batches.forEach((batch, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `Site ${index + 1}: ${batch.map((row) => row.location).join(", ")}`;
    refs.captureBatch.appendChild(option);
  });
  refs.captureBatch.value = String(state.activeBatchIndex);
  const active = batches[state.activeBatchIndex] || [];
  refs.batchStatus.textContent =
    `Selected site ${state.activeBatchIndex + 1}/${batches.length}: ` +
    active.map((row) => `${row.location} -> Ch 1`).join(", ");
  renderOffsetSiteOptions();
}

function populateSites(preset) {
  const locations = MONTAGE_PRESETS[preset] || MONTAGE_PRESETS.cz;
  refs.siteRows.innerHTML = "";
  locations.forEach((location, index) => {
    refs.siteRows.appendChild(siteRowElement(location, 1));
  });
  state.activeBatchIndex = 0;
  renderBatchOptions();
}

function sessionMetadataConfig() {
  return {
    profile: selectedProfilePayload(),
    tags: parseTags(refs.sessionTags.value),
    notes: refs.sessionNotes.value.trim(),
  };
}

function buildMeasureConfig(phase = "pre", options = {}) {
  const channels = {};
  const rows = options.rows || getActiveSiteRows();
  for (const row of rows) {
    if (!Number.isInteger(row.channel) || row.channel < 1 || row.channel > 16) {
      throw new Error("Channels must be 1-16.");
    }
    if (Object.prototype.hasOwnProperty.call(channels, row.location)) {
      throw new Error(`Duplicate site: ${row.location}`);
    }
    channels[row.location] = row.channel;
  }
  const sourceMode = refs.sourceMode.value;
  const tags = parseTags(refs.sessionTags.value);
  const phaseTag = `disentrainment-${phase}`;
  if (!tags.includes(phaseTag)) tags.push(phaseTag);
  for (const tag of options.extraTags || []) {
    if (!tags.includes(tag)) tags.push(tag);
  }
  return {
    profile: selectedProfilePayload(),
    tags,
    notes: refs.sessionNotes.value.trim(),
    session_phase: phase,
    epoch_seconds: Math.max(1, Math.round(Number(options.epochSeconds ?? num(refs.measureSeconds, 10)))),
    sampling_rate: 250,
    fast_mode: sourceMode === "synthetic",
    condition: refs.condition.value,
    dominant_range_hz: [num(refs.dfLow, 1), num(refs.dfHigh, 30)],
    dominant_window_seconds: 1.0,
    norms_dataset: "none",
    record_raw_eeg: true,
    board: {
      board_id: sourceMode === "synthetic" ? "synthetic" : refs.boardId.value,
      serial_port: refs.serialPort.value || "COM5",
      use_synthetic: sourceMode === "synthetic",
      available_channels: Object.values(channels),
      seed: 42,
    },
    channels,
  };
}

function buildLiveConfig(phase = "live", options = {}) {
  const config = buildMeasureConfig(phase, {
    epochSeconds: Math.max(1, Math.round(Number(options.totalSeconds ?? 1))),
    extraTags: options.extraTags || ["live-gradient"],
    rows: options.rows,
  });
  return {
    ...config,
    total_seconds: Math.max(0.25, Number(options.totalSeconds ?? 1)),
    window_seconds: Math.max(0.5, Number(options.windowSeconds ?? 2)),
    dominant_window_seconds: Math.max(0.5, Number(options.dominantWindowSeconds ?? options.windowSeconds ?? 2)),
    score_metric: options.scoreMetric || "total",
    selected_locations: options.selectedLocations || [],
    fast_mode: false,
  };
}

function setBusy(isBusy, label = "") {
  state.measuring = isBusy;
  const disabled = isBusy || state.offsetFinder.running;
  refs.measureBtn.disabled = disabled;
  refs.postMeasureBtn.disabled = disabled;
  refs.measureAllPreBtn.disabled = disabled;
  refs.measureAllPostBtn.disabled = disabled;
  refs.runSequenceBtn.disabled = disabled;
  refs.startProtocolBtn.disabled = disabled;
  refs.montagePreBtn.disabled = disabled;
  refs.montageProtocolBtn.disabled = disabled;
  refs.montageOffsetBtn.disabled = disabled;
  refs.montagePostBtn.disabled = disabled;
  refs.endDisentrainmentSessionBtn.disabled = disabled;
  refs.offsetMeasureBaselineBtn.disabled = disabled;
  refs.offsetAddTrialBtn.disabled = disabled;
  refs.offsetSaveSettingsBtn.disabled = disabled;
  refs.offsetRunBtn.disabled = disabled;
  if (label) refs.runtimeStatus.textContent = label;
}

function extractMeasurementRows(result) {
  return (result?.locations || []).map((row) => ({
    location: row.location,
    channel: row.channel,
    dominant_frequency_hz: Number(row.dominant_frequency_hz),
    dominant_frequency_amplitude: Number(row.dominant_frequency_amplitude),
    amplitude_sum: Number(row.spectrum_1_30_amplitude_sum),
    amplitude_std: Number(row.spectrum_1_30_amplitude_std),
    spectrum_1_30_hz: row.spectrum_1_30_hz || [],
    clinicalq_amplitudes: row.clinicalq_amplitudes || {},
    clinicalq_band_stats: row.clinicalq_band_stats || {},
    amplitudes: row.amplitudes || {},
  }));
}

function upsertRows(existing, incoming) {
  const byLocation = new Map(existing.map((row) => [row.location, row]));
  for (const row of incoming) {
    byLocation.set(row.location, row);
  }
  return [...byLocation.values()].sort((a, b) => a.amplitude_sum - b.amplitude_sum);
}

async function runMeasurement(phase, options = {}) {
  const payload = await window.disentrainmentTools.measure(buildMeasureConfig(phase, options));
  return {
    payload,
    rows: extractMeasurementRows(payload.result).sort((a, b) => a.amplitude_sum - b.amplitude_sum),
  };
}

async function runLiveMeasurement(phase, options = {}) {
  const payload = await window.disentrainmentTools.measureLive(buildLiveConfig(phase, options));
  return payload.result;
}

async function measureDominantFrequency(phase = "pre") {
  try {
    const label = phase === "post" ? "post" : "pre";
    const activeRows = selectedSiteRows();
    setBusy(true, `Measuring selected ${label} site: ${activeRows.map((row) => row.location).join(", ")}...`);
    const { payload, rows } = await runMeasurement(label, { rows: activeRows });
    if (label === "post") {
      state.postRows = upsertRows(state.postRows, rows);
      state.postOutputPath = payload.outputPath || "";
      for (const row of rows) markSiteProgress(row.location, { post: true });
    } else {
      state.preRows = upsertRows(state.preRows, rows);
      state.measuredRows = state.preRows;
      state.preOutputPath = payload.outputPath || "";
      for (const row of rows) markSiteProgress(row.location, { pre: true });
    }
    renderMeasuredRows();
    renderBandViews();
    const sourceLabel = [
      state.preOutputPath ? `pre: ${state.preOutputPath}` : "",
      state.postOutputPath ? `post: ${state.postOutputPath}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    refs.resultSource.textContent = sourceLabel || "measurement complete";
    refs.runtimeStatus.textContent = `Measured ${rows.length} selected ${label} site(s).`;
    return true;
  } catch (err) {
    refs.runtimeStatus.textContent = `Measurement failed: ${err.message || err}`;
    return false;
  } finally {
    setBusy(false);
  }
}

async function measureAllBatches(phase = "pre") {
  const label = phase === "post" ? "post" : "pre";
  const batches = plannedBatches();
  const previousBatch = state.activeBatchIndex;
  let collected = [];
  try {
    setBusy(true, `Measuring queued ${label} sites...`);
    for (let index = 0; index < batches.length; index += 1) {
      const rows = batches[index];
      state.activeBatchIndex = index;
      renderBatchOptions();
      const mapping = rows.map((row) => `${row.location} -> Ch ${row.channel}`).join(", ");
      if (refs.sourceMode.value !== "synthetic") {
        const proceed = window.confirm(`Connect site ${index + 1}/${batches.length}:\n${mapping}\n\nStart measurement?`);
        if (!proceed) break;
      }
      refs.runtimeStatus.textContent = `Measuring ${label} site ${index + 1}/${batches.length}: ${mapping}`;
      const { payload, rows: measuredRows } = await runMeasurement(label, {
        rows,
        extraTags: [`site-run-${index + 1}`],
      });
      collected = upsertRows(collected, measuredRows);
      if (label === "post") {
        state.postRows = upsertRows(state.postRows, measuredRows);
        state.postOutputPath = payload.outputPath || "";
        for (const row of measuredRows) markSiteProgress(row.location, { post: true });
      } else {
        state.preRows = upsertRows(state.preRows, measuredRows);
        state.measuredRows = state.preRows;
        state.preOutputPath = payload.outputPath || "";
        for (const row of measuredRows) markSiteProgress(row.location, { pre: true });
      }
      renderMeasuredRows();
      renderBandViews();
    }
    refs.runtimeStatus.textContent = `Measured ${collected.length} queued ${label} site(s).`;
  } catch (err) {
    refs.runtimeStatus.textContent = `Queued site measurement failed: ${err.message || err}`;
  } finally {
    state.activeBatchIndex = previousBatch;
    renderBatchOptions();
    setBusy(false);
  }
}

function renderProtocolOptions() {
  const previous = refs.protocolSite.value;
  refs.protocolSite.innerHTML = "";
  for (const row of state.preRows) {
    const option = document.createElement("option");
    option.value = row.location;
    option.textContent = `${row.location} (${fmt(row.dominant_frequency_hz, 2)} Hz)`;
    refs.protocolSite.appendChild(option);
  }
  if ([...refs.protocolSite.options].some((option) => option.value === previous)) {
    refs.protocolSite.value = previous;
  } else if (refs.protocolSite.options.length) {
    refs.protocolSite.value = refs.protocolSite.options[0].value;
  }
}

function renderOffsetSiteOptions() {
  const previous = refs.offsetSite.value || "Cz";
  const rows = state.offsetBaselineRows.length ? state.offsetBaselineRows : state.preRows;
  const rowByLocation = new Map(rows.map((row) => [row.location, row]));
  refs.offsetSite.innerHTML = "";
  for (const location of LOCATIONS) {
    const row = rowByLocation.get(location);
    const option = document.createElement("option");
    option.value = location;
    option.textContent = row ? `${location} (${fmt(row.dominant_frequency_hz, 2)} Hz)` : location;
    refs.offsetSite.appendChild(option);
  }
  refs.offsetSite.value = LOCATIONS.includes(previous) ? previous : "Cz";
}

function appendMapRows(rows, phase) {
  const spec = protocolOffsetSpec(1);
  for (const row of rows) {
    const tr = document.createElement("tr");
    const ahead = protocolPulseForDirection(row.dominant_frequency_hz, spec, "ahead");
    const behind = protocolPulseForDirection(row.dominant_frequency_hz, spec, "behind");
    for (const value of [
      phase,
      row.location,
      row.channel,
      fmt(row.dominant_frequency_hz, 2),
      fmt(row.amplitude_sum, 2),
      fmt(row.amplitude_std, 2),
      fmt(ahead, 2),
      fmt(behind, 2),
    ]) {
      const td = document.createElement("td");
      td.textContent = String(value);
      tr.appendChild(td);
    }
    refs.mapTableBody.appendChild(tr);
  }
}

function renderMeasuredRows() {
  refs.mapTableBody.innerHTML = "";
  renderProtocolOptions();
  renderOffsetSiteOptions();
  renderMontage();
  appendMapRows(state.preRows, "pre");
  appendMapRows(state.postRows, "post");
  renderProtocolSummary();
}

function renderBandTabs() {
  refs.bandTabs.innerHTML = "";
  for (const [band, meta] of Object.entries(RESULT_VIEWS)) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = meta.label;
    button.className = band === state.selectedBand ? "active" : "";
    button.addEventListener("click", () => {
      state.selectedBand = band;
      renderBandViews();
    });
    refs.bandTabs.appendChild(button);
  }
}

function setBandTableHeaders(view) {
  const isAllView = view === "all";
  const isDfView = view === "df";
  refs.bandPreValueHead.textContent = isAllView || isDfView ? "DF Hz" : "Mean";
  refs.bandPreSpreadHead.textContent = isAllView ? "1-30 Sum" : isDfView ? "" : "SD";
  refs.bandPostValueHead.textContent = isAllView || isDfView ? "DF Hz" : "Mean";
  refs.bandPostSpreadHead.textContent = isAllView ? "1-30 Sum" : isDfView ? "" : "SD";
}

function appendBandRows(target, rows, view = "all") {
  const isAllView = view === "all";
  const isDfView = view === "df";
  target.innerHTML = "";
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "No measurement.";
    tr.appendChild(td);
    target.appendChild(tr);
    return;
  }
  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    const values = isAllView
      ? [index + 1, row.location, row.channel, fmt(row.band.df, 2), fmt(row.band.mean, 2)]
      : isDfView
        ? [index + 1, row.location, row.channel, fmt(row.band.mean, 2), ""]
        : [index + 1, row.location, row.channel, fmt(row.band.mean, 2), fmt(row.band.sd, 2)];
    for (const value of values) {
      const td = document.createElement("td");
      td.textContent = String(value);
      tr.appendChild(td);
    }
    target.appendChild(tr);
  });
}

function renderBandViews() {
  renderBandTabs();
  const view = RESULT_VIEWS[state.selectedBand] ? state.selectedBand : "all";
  state.selectedBand = view;
  const meta = RESULT_VIEWS[view];
  const isAllView = view === "all";
  const isDfView = view === "df";
  const preRows = rowsForResultView(state.preRows, view);
  const postRows = rowsForResultView(state.postRows, view);
  setBandTableHeaders(view);
  renderBandChart(preRows, postRows, meta, view);
  appendBandRows(refs.bandPreBody, preRows, view);
  appendBandRows(refs.bandPostBody, postRows, view);

  const pre = summarize(preRows.map((row) => row.band.mean));
  const post = summarize(postRows.map((row) => row.band.mean));
  if (isAllView) {
    refs.bandSummary.textContent =
      `${meta.rangeLabel} summed amplitude sorted ascending; labels include DF | ` +
      `pre N=${pre.n} mean ${fmt(pre.mean, 2)} SD ${fmt(pre.sd, 2)} | ` +
      `post N=${post.n} mean ${fmt(post.mean, 2)} SD ${fmt(post.sd, 2)}`;
  } else if (isDfView) {
    refs.bandSummary.textContent =
      `${meta.rangeLabel} sorted ascending | ` +
      `pre N=${pre.n} mean DF ${fmt(pre.mean, 2)} Hz SD ${fmt(pre.sd, 2)} | ` +
      `post N=${post.n} mean DF ${fmt(post.mean, 2)} Hz SD ${fmt(post.sd, 2)}`;
  } else {
    refs.bandSummary.textContent =
      `${meta.label} ${meta.low}-${meta.high} Hz | ` +
      `pre N=${pre.n} mean ${fmt(pre.mean, 2)} SD ${fmt(pre.sd, 2)} | ` +
      `post N=${post.n} mean ${fmt(post.mean, 2)} SD ${fmt(post.sd, 2)}`;
  }
}

function renderBandChart(preRows, postRows, meta, view = "all") {
  const isAllView = view === "all";
  const isDfView = view === "df";
  refs.bandChart.innerHTML = "";
  const ns = "http://www.w3.org/2000/svg";
  const sites = Array.from(new Set([...preRows, ...postRows].map((row) => row.location)));
  if (!sites.length) {
    const empty = document.createElement("div");
    empty.className = "status";
    empty.style.padding = "14px";
    empty.textContent = isAllView || isDfView ? "No dominant-frequency data yet." : "No band data yet.";
    refs.bandChart.appendChild(empty);
    return;
  }

  const byPre = new Map(preRows.map((row) => [row.location, row]));
  const byPost = new Map(postRows.map((row) => [row.location, row]));
  sites.sort((a, b) => {
    const av = byPre.get(a)?.band.mean ?? byPost.get(a)?.band.mean ?? 0;
    const bv = byPre.get(b)?.band.mean ?? byPost.get(b)?.band.mean ?? 0;
    return av - bv;
  });

  const width = Math.max(760, sites.length * 58 + 120);
  const height = 300;
  const margin = { top: 36, right: 24, bottom: 56, left: 54 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;
  const maxValue = Math.max(
    1,
    ...sites.flatMap((site) => {
      const pre = byPre.get(site)?.band;
      const post = byPost.get(site)?.band;
      return [pre ? pre.mean + pre.sd : 0, post ? post.mean + post.sd : 0];
    })
  );
  const y = (value) => margin.top + chartH - (Math.max(0, value) / maxValue) * chartH;
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const title = document.createElementNS(ns, "text");
  title.setAttribute("x", margin.left);
  title.setAttribute("y", 20);
  title.setAttribute("class", "chart-label");
  title.textContent = isAllView
    ? "1-30 Hz summed amplitude by site; labels include DF"
    : isDfView
      ? "Dominant frequency by site, sorted ascending"
      : `${meta.label} ${meta.low}-${meta.high} Hz mean amplitude with SD`;
  svg.appendChild(title);

  for (let i = 0; i <= 4; i += 1) {
    const value = (maxValue / 4) * i;
    const yy = y(value);
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", margin.left);
    line.setAttribute("x2", width - margin.right);
    line.setAttribute("y1", yy);
    line.setAttribute("y2", yy);
    line.setAttribute("stroke", "#d7ddd7");
    svg.appendChild(line);
    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", margin.left - 8);
    label.setAttribute("y", yy + 4);
    label.setAttribute("text-anchor", "end");
    label.setAttribute("class", "chart-axis");
    label.textContent = fmt(value, 0);
    svg.appendChild(label);
  }

  const groupW = chartW / sites.length;
  const barW = Math.min(18, Math.max(8, groupW / 4));
  sites.forEach((site, index) => {
    const center = margin.left + groupW * index + groupW / 2;
    const values = [
      { row: byPre.get(site), x: center - barW - 2, cls: "chart-pre" },
      { row: byPost.get(site), x: center + 2, cls: "chart-post" },
    ];
    for (const item of values) {
      if (!item.row) continue;
      const mean = item.row.band.mean;
      const sd = item.row.band.sd;
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", item.x);
      rect.setAttribute("y", y(mean));
      rect.setAttribute("width", barW);
      rect.setAttribute("height", margin.top + chartH - y(mean));
      rect.setAttribute("class", item.cls);
      svg.appendChild(rect);

      const xMid = item.x + barW / 2;
      const err = document.createElementNS(ns, "line");
      err.setAttribute("x1", xMid);
      err.setAttribute("x2", xMid);
      err.setAttribute("y1", y(mean + sd));
      err.setAttribute("y2", y(Math.max(0, mean - sd)));
      err.setAttribute("class", "chart-sd");
      svg.appendChild(err);
      for (const capY of [y(mean + sd), y(Math.max(0, mean - sd))]) {
        const cap = document.createElementNS(ns, "line");
        cap.setAttribute("x1", xMid - 5);
        cap.setAttribute("x2", xMid + 5);
        cap.setAttribute("y1", capY);
        cap.setAttribute("y2", capY);
        cap.setAttribute("class", "chart-sd");
        svg.appendChild(cap);
      }
    }
    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", center);
    label.setAttribute("y", isAllView ? height - 34 : height - 26);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "chart-axis");
    label.textContent = site;
    svg.appendChild(label);
    if (isAllView || isDfView) {
      const df = isDfView
        ? byPre.get(site)?.band.mean ?? byPost.get(site)?.band.mean
        : byPre.get(site)?.band.df ?? byPost.get(site)?.band.df;
      const dfLabel = document.createElementNS(ns, "text");
      dfLabel.setAttribute("x", center);
      dfLabel.setAttribute("y", height - 18);
      dfLabel.setAttribute("text-anchor", "middle");
      dfLabel.setAttribute("class", "chart-axis");
      dfLabel.textContent = `${fmt(df, 2)} Hz`;
      svg.appendChild(dfLabel);
    }
  });

  const preLegend = document.createElementNS(ns, "rect");
  preLegend.setAttribute("x", width - 150);
  preLegend.setAttribute("y", 12);
  preLegend.setAttribute("width", 12);
  preLegend.setAttribute("height", 12);
  preLegend.setAttribute("class", "chart-pre");
  svg.appendChild(preLegend);
  const preText = document.createElementNS(ns, "text");
  preText.setAttribute("x", width - 132);
  preText.setAttribute("y", 22);
  preText.setAttribute("class", "chart-label");
  preText.textContent = "Pre";
  svg.appendChild(preText);
  const postLegend = document.createElementNS(ns, "rect");
  postLegend.setAttribute("x", width - 92);
  postLegend.setAttribute("y", 12);
  postLegend.setAttribute("width", 12);
  postLegend.setAttribute("height", 12);
  postLegend.setAttribute("class", "chart-post");
  svg.appendChild(postLegend);
  const postText = document.createElementNS(ns, "text");
  postText.setAttribute("x", width - 74);
  postText.setAttribute("y", 22);
  postText.setAttribute("class", "chart-label");
  postText.textContent = "Post";
  svg.appendChild(postText);

  refs.bandChart.appendChild(svg);
}

function offsetTrialRowElement(trial = {}, index = 0) {
  const row = document.createElement("div");
  row.className = "offset-trial-row";
  row.setAttribute("aria-label", `Offset trial ${index + 1}`);

  const rank = document.createElement("div");
  rank.className = "trial-index";
  const rankNumber = document.createElement("strong");
  rankNumber.textContent = String(index + 1);
  const rankText = document.createElement("span");
  rankText.textContent = "Trial";
  rank.append(rankNumber, rankText);

  const labelText = (text) => {
    const span = document.createElement("span");
    span.className = "sr-only";
    span.textContent = text;
    return span;
  };

  const modeLabel = document.createElement("label");
  modeLabel.className = "compact-field";
  modeLabel.appendChild(labelText(`Trial ${index + 1} mode`));
  const mode = document.createElement("select");
  mode.dataset.role = "mode";
  for (const [value, label] of [
    ["percent", "%"],
    ["hz", "Hz"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    mode.appendChild(option);
  }
  mode.value = trial.mode || "percent";
  modeLabel.appendChild(mode);

  const valueLabel = document.createElement("label");
  valueLabel.className = "compact-field";
  valueLabel.appendChild(labelText(`Trial ${index + 1} offset`));
  const value = document.createElement("input");
  value.dataset.role = "value";
  value.type = "number";
  value.min = "0";
  value.max = "50";
  value.step = "0.1";
  value.value = String(trial.value ?? 3);
  valueLabel.appendChild(value);

  const directionLabel = document.createElement("label");
  directionLabel.className = "compact-field";
  directionLabel.appendChild(labelText(`Trial ${index + 1} direction`));
  const direction = document.createElement("select");
  direction.dataset.role = "direction";
  for (const [value, label] of [
    ["ahead", "Ahead"],
    ["behind", "Behind"],
    ["alternate", "Ahead then Behind"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    direction.appendChild(option);
  }
  direction.value = trial.direction || "ahead";
  directionLabel.appendChild(direction);

  const stimLabel = document.createElement("label");
  stimLabel.className = "compact-field";
  stimLabel.appendChild(labelText(`Trial ${index + 1} stimulation seconds`));
  const stim = document.createElement("input");
  stim.dataset.role = "stimSeconds";
  stim.type = "number";
  stim.min = "0.1";
  stim.max = "600";
  stim.step = "0.1";
  stim.value = String(trial.stimSeconds ?? 8);
  stimLabel.appendChild(stim);

  const measureLabel = document.createElement("label");
  measureLabel.className = "compact-field";
  measureLabel.appendChild(labelText(`Trial ${index + 1} post measurement seconds`));
  const measure = document.createElement("input");
  measure.dataset.role = "measureSeconds";
  measure.type = "number";
  measure.min = "1";
  measure.max = "600";
  measure.step = "1";
  measure.value = String(trial.measureSeconds ?? 20);
  measureLabel.appendChild(measure);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "icon-button";
  remove.setAttribute("aria-label", `Remove trial ${index + 1}`);
  remove.title = "Remove trial";
  remove.textContent = "x";
  remove.addEventListener("click", () => {
    if (refs.offsetTrialRows.children.length > 1) {
      row.remove();
      renumberOffsetTrials();
    }
  });

  row.append(rank, modeLabel, valueLabel, directionLabel, stimLabel, measureLabel, remove);
  return row;
}

function renumberOffsetTrials() {
  [...refs.offsetTrialRows.querySelectorAll(".trial-index")].forEach((node, index) => {
    const strong = node.querySelector("strong");
    if (strong) strong.textContent = String(index + 1);
  });
  [...refs.offsetTrialRows.querySelectorAll(".offset-trial-row")].forEach((row, index) => {
    row.setAttribute("aria-label", `Offset trial ${index + 1}`);
    const remove = row.querySelector(".icon-button");
    if (remove) remove.setAttribute("aria-label", `Remove trial ${index + 1}`);
  });
}

function renderOffsetTrials(trials = DEFAULT_OFFSET_TRIALS) {
  refs.offsetTrialRows.innerHTML = "";
  for (const [index, trial] of trials.slice(0, 10).entries()) {
    refs.offsetTrialRows.appendChild(offsetTrialRowElement(trial, index));
  }
  if (!refs.offsetTrialRows.children.length) {
    refs.offsetTrialRows.appendChild(offsetTrialRowElement(DEFAULT_OFFSET_TRIALS[0], 0));
  }
}

function getOffsetTrials() {
  const rows = [...refs.offsetTrialRows.querySelectorAll(".offset-trial-row")].slice(0, 10);
  return rows.map((row, index) => {
    const mode = row.querySelector('[data-role="mode"]').value;
    const value = Math.max(0, Number(row.querySelector('[data-role="value"]').value));
    const direction = row.querySelector('[data-role="direction"]').value;
    const stimSeconds = Math.max(0.1, Number(row.querySelector('[data-role="stimSeconds"]').value));
    const measureSeconds = Math.max(1, Math.round(Number(row.querySelector('[data-role="measureSeconds"]').value)));
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Trial ${index + 1} needs a positive offset.`);
    if (!Number.isFinite(stimSeconds) || !Number.isFinite(measureSeconds)) {
      throw new Error(`Trial ${index + 1} has invalid timing.`);
    }
    return { mode, value, direction, stimSeconds, measureSeconds };
  });
}

function currentOffsetSettings() {
  return {
    site: selectedOffsetSite(),
    baselineSeconds: Math.max(1, Math.round(num(refs.offsetBaselineSeconds, 20))),
    scoreMetric: refs.offsetScoreMetric.value || "total",
    gradientWindowSeconds: Math.max(0.5, num(refs.offsetGradientWindowSeconds, 2)),
    measureDuringStim: refs.offsetMeasureDuringStim.value !== "no",
    trials: getOffsetTrials(),
  };
}

function applyOffsetSettings(settings) {
  const resolved = { ...defaultOffsetSettings(), ...(settings || {}) };
  if (LOCATIONS.includes(resolved.site)) refs.offsetSite.value = resolved.site;
  refs.offsetBaselineSeconds.value = String(resolved.baselineSeconds || 20);
  refs.offsetScoreMetric.value = resolved.scoreMetric || "total";
  refs.offsetGradientWindowSeconds.value = String(resolved.gradientWindowSeconds || 2);
  refs.offsetMeasureDuringStim.value = resolved.measureDuringStim === false ? "no" : "yes";
  renderOffsetTrials(Array.isArray(resolved.trials) ? resolved.trials : DEFAULT_OFFSET_TRIALS);
}

function loadOffsetSettings() {
  try {
    const raw = window.localStorage.getItem(offsetSettingsKey());
    applyOffsetSettings(raw ? JSON.parse(raw) : defaultOffsetSettings());
  } catch {
    applyOffsetSettings(defaultOffsetSettings());
  }
}

function saveOffsetSettings() {
  const settings = currentOffsetSettings();
  window.localStorage.setItem(offsetSettingsKey(), JSON.stringify(settings));
  refs.offsetStatus.textContent = `Saved offset finder settings for ${selectedProfilePayload().name}.`;
}

function renderOffsetResults() {
  refs.offsetResultBody.innerHTML = "";
  if (!state.offsetResults.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 11;
    td.textContent = "No offset trials.";
    tr.appendChild(td);
    refs.offsetResultBody.appendChild(tr);
    return;
  }

  const best = state.offsetResults.reduce((winner, row) => {
    if (!winner) return row;
    return row.reductionPct > winner.reductionPct ? row : winner;
  }, null);

  for (const result of state.offsetResults) {
    const tr = document.createElement("tr");
    if (best && result.id === best.id) tr.className = "best-row";
    const offsetText = `${fmt(result.offsetValue, 2)} ${result.mode === "percent" ? "%" : "Hz"}`;
    for (const value of [
      best && result.id === best.id ? `${result.trialIndex} best` : result.trialIndex,
      offsetText,
      result.direction,
      fmt(result.pulseHz, 2),
      fmt(result.equivalentPercent, 2),
      result.siteCount,
      fmt(result.baselineMetric, 2),
      fmt(result.postMetric, 2),
      fmt(result.reductionPct, 2),
      fmt(result.gradientMean, 3),
      fmt(result.gradientSd, 3),
    ]) {
      const td = document.createElement("td");
      td.textContent = String(value);
      tr.appendChild(td);
    }
    refs.offsetResultBody.appendChild(tr);
  }
}

async function playManualTone() {
  const pulseHz = num(refs.manualPulseHz, 10);
  await tone.start({
    carrierHz: num(refs.carrierHz, 220),
    pulseHz,
    duty: num(refs.dutyPercent, 50) / 100,
    volume: num(refs.volume, 0.12),
  });
  refs.toneStatus.textContent = `Playing ${fmt(pulseHz, 2)} Hz pulses.`;
}

function stopAudio() {
  tone.stop();
  refs.toneStatus.textContent = "Idle.";
}

function selectedProtocolRows() {
  const selected = refs.protocolSite.value || state.preRows[0]?.location;
  return state.preRows.filter((row) => row.location === selected);
}

function protocolOffsetSpec(stage) {
  const modeRef = stage === 1 ? refs.stage1OffsetMode : refs.stage2OffsetMode;
  const valueRef = stage === 1 ? refs.stage1Percent : refs.stage2Percent;
  return {
    mode: modeRef.value === "hz" ? "hz" : "percent",
    value: Math.max(0, num(valueRef, stage === 1 ? 5 : 1)),
  };
}

function protocolOffsetHz(df, spec) {
  return spec.mode === "hz" ? spec.value : df * (spec.value / 100);
}

function protocolPulseForDirection(df, spec, direction) {
  const offsetHz = protocolOffsetHz(df, spec);
  return clampPulseHz(direction === "behind" ? df - offsetHz : df + offsetHz);
}

function protocolOffsetLabel(block) {
  return block.mode === "hz" ? `${fmt(block.offsetValue, 2)} Hz` : `${fmt(block.offsetValue, 1)}%`;
}

function addStageBlocks(blocks, row, spec, aheadMin, behindMin, repeats) {
  const offsetHz = protocolOffsetHz(row.dominant_frequency_hz, spec);
  for (let i = 0; i < repeats; i += 1) {
    if (aheadMin > 0) {
      blocks.push({
        site: row.location,
        df: row.dominant_frequency_hz,
        direction: "ahead",
        mode: spec.mode,
        offsetValue: spec.value,
        offsetHz,
        percent: spec.mode === "percent" ? spec.value : (offsetHz / row.dominant_frequency_hz) * 100,
        seconds: aheadMin * 60,
        pulseHz: protocolPulseForDirection(row.dominant_frequency_hz, spec, "ahead"),
      });
    }
    if (behindMin > 0) {
      blocks.push({
        site: row.location,
        df: row.dominant_frequency_hz,
        direction: "behind",
        mode: spec.mode,
        offsetValue: spec.value,
        offsetHz,
        percent: spec.mode === "percent" ? spec.value : (offsetHz / row.dominant_frequency_hz) * 100,
        seconds: behindMin * 60,
        pulseHz: protocolPulseForDirection(row.dominant_frequency_hz, spec, "behind"),
      });
    }
  }
}

function buildProtocolBlocks() {
  const rows = selectedProtocolRows().filter((row) => Number.isFinite(row.dominant_frequency_hz) && row.dominant_frequency_hz > 0);
  const blocks = [];
  for (const row of rows) {
    addStageBlocks(
      blocks,
      row,
      protocolOffsetSpec(1),
      num(refs.stage1AheadMin, 4),
      num(refs.stage1BehindMin, 4),
      Math.max(0, Math.round(num(refs.stage1Repeats, 2)))
    );
    addStageBlocks(
      blocks,
      row,
      protocolOffsetSpec(2),
      num(refs.stage2AheadMin, 1),
      num(refs.stage2BehindMin, 1),
      Math.max(0, Math.round(num(refs.stage2Repeats, 4)))
    );
  }
  return blocks;
}

function selectedProtocolMode() {
  return refs.protocolMode.value === "adaptive" ? "adaptive" : "fixed";
}

function protocolDurationLabel(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (minutes && secs) return `${minutes}m ${secs}s`;
  if (minutes) return `${minutes}m`;
  return `${secs}s`;
}

function renderProtocolSummary() {
  const isAdaptive = selectedProtocolMode() === "adaptive";
  refs.adaptiveDfWindowSeconds.disabled = !isAdaptive;
  refs.startProtocolBtn.textContent = isAdaptive ? "Start Adaptive Protocol" : "Start Fixed DF Protocol";
  refs.montageProtocolBtn.textContent = `Pre + ${isAdaptive ? "Adaptive" : "Fixed"} Protocol + Post`;
  refs.runSequenceBtn.textContent = `Current Pre + ${isAdaptive ? "Adaptive" : "Fixed"} Protocol + Post`;

  if (!state.preRows.length) {
    refs.protocolSummary.textContent = "No pre DF measured.";
    return;
  }

  const rows = selectedProtocolRows();
  if (!rows.length) {
    refs.protocolSummary.textContent = "Select a site with pre DF.";
    return;
  }

  const row = rows[0];
  const blocks = buildProtocolBlocks();
  if (!blocks.length) {
    refs.protocolSummary.textContent = `${row.location} pre DF ${fmt(row.dominant_frequency_hz, 2)} Hz | no active stages.`;
    return;
  }

  const totalSeconds = blocks.reduce((sum, block) => sum + block.seconds, 0);
  const stage1 = protocolOffsetSpec(1);
  const stage2 = protocolOffsetSpec(2);
  const modeLabel = isAdaptive
    ? `Adaptive live DF, ${fmt(num(refs.adaptiveDfWindowSeconds, 2), 1)}s window`
    : "Fixed DF from pre";
  refs.protocolSummary.textContent =
    `${modeLabel} | ${row.location} pre DF ${fmt(row.dominant_frequency_hz, 2)} Hz | ` +
    `${blocks.length} blocks, ${protocolDurationLabel(totalSeconds)} | ` +
    `Stage 1 ${fmt(stage1.value, stage1.mode === "hz" ? 2 : 1)} ${stage1.mode === "hz" ? "Hz" : "%"} | ` +
    `Stage 2 ${fmt(stage2.value, stage2.mode === "hz" ? 2 : 1)} ${stage2.mode === "hz" ? "Hz" : "%"}`;
}

async function startProtocol(options = {}) {
  const blocks = buildProtocolBlocks();
  if (!blocks.length) {
    refs.protocolStatus.textContent = "Measure pre DF before starting.";
    return false;
  }
  const totalSeconds = blocks.reduce((sum, block) => sum + block.seconds, 0);
  state.protocol = {
    blocks,
    totalSeconds,
    startedAt: Date.now(),
    blockStartedAt: Date.now(),
    blockIndex: 0,
    timer: null,
    measurePostOnComplete: Boolean(options.measurePostOnComplete),
    completing: false,
  };
  const first = blocks[0];
  await tone.start({
    carrierHz: num(refs.carrierHz, 220),
    pulseHz: first.pulseHz,
    duty: num(refs.dutyPercent, 50) / 100,
    volume: num(refs.volume, 0.12),
  });
  refs.measureBtn.disabled = true;
  refs.postMeasureBtn.disabled = true;
  refs.measureAllPreBtn.disabled = true;
  refs.measureAllPostBtn.disabled = true;
  refs.runSequenceBtn.disabled = true;
  refs.startProtocolBtn.disabled = true;
  refs.montagePreBtn.disabled = true;
  refs.montageProtocolBtn.disabled = true;
  refs.montageOffsetBtn.disabled = true;
  refs.montagePostBtn.disabled = true;
  refs.endDisentrainmentSessionBtn.disabled = true;
  state.protocol.timer = window.setInterval(updateProtocol, 250);
  updateProtocol();
  return true;
}

async function startAdaptiveProtocol(options = {}) {
  const blocks = buildProtocolBlocks();
  if (!blocks.length) {
    refs.protocolStatus.textContent = "Measure pre DF before starting adaptive protocol.";
    return false;
  }
  const totalSeconds = blocks.reduce((sum, block) => sum + block.seconds, 0);
  const windowSeconds = Math.max(0.5, num(refs.adaptiveDfWindowSeconds, 2));
  state.adaptiveProtocol = {
    running: true,
    blocks,
    totalSeconds,
    elapsedBeforeBlock: 0,
    currentBlock: null,
    gradients: [],
    measurePostOnComplete: Boolean(options.measurePostOnComplete),
  };
  refs.measureBtn.disabled = true;
  refs.postMeasureBtn.disabled = true;
  refs.measureAllPreBtn.disabled = true;
  refs.measureAllPostBtn.disabled = true;
  refs.runSequenceBtn.disabled = true;
  refs.startProtocolBtn.disabled = true;
  refs.montagePreBtn.disabled = true;
  refs.montageProtocolBtn.disabled = true;
  refs.montageOffsetBtn.disabled = true;
  refs.montagePostBtn.disabled = true;
  refs.endDisentrainmentSessionBtn.disabled = true;

  try {
    for (const block of blocks) {
      if (!state.adaptiveProtocol?.running) break;
      state.adaptiveProtocol.currentBlock = block;
      const initialPulse = block.pulseHz;
      await tone.start({
        carrierHz: num(refs.carrierHz, 220),
        pulseHz: initialPulse,
        duty: num(refs.dutyPercent, 50) / 100,
        volume: num(refs.volume, 0.12),
      });
      state.liveContext = {
        kind: "adaptive",
        block,
        offsetValue: block.offsetValue,
        mode: block.mode,
        direction: block.direction,
      };
      refs.protocolStatus.textContent = `Adaptive ${block.site} ${block.direction} ${protocolOffsetLabel(block)} | waiting for live DF...`;
      const liveResult = await runLiveMeasurement(`adaptive-${block.site}-${block.direction}`, {
        totalSeconds: block.seconds,
        windowSeconds,
        dominantWindowSeconds: windowSeconds,
        scoreMetric: "total",
        rows: [{ location: block.site, channel: state.preRows.find((row) => row.location === block.site)?.channel || 1 }],
        selectedLocations: [block.site],
        extraTags: ["adaptive-disentrainment", `site-${block.site}`],
      });
      for (const windowRow of liveResult?.windows || []) {
        const gradient = Number(windowRow.drop_gradient_per_second);
        if (Number.isFinite(gradient)) state.adaptiveProtocol.gradients.push(gradient);
      }
      state.adaptiveProtocol.elapsedBeforeBlock += block.seconds;
      stopAudio();
    }
    if (state.adaptiveProtocol?.running) {
      const shouldMeasurePost = state.adaptiveProtocol.measurePostOnComplete;
      for (const site of new Set(blocks.map((block) => block.site))) {
        markSiteProgress(site, { entrained: true });
      }
      const gradientSummary = summarize(state.adaptiveProtocol.gradients);
      refs.protocolStatus.textContent = shouldMeasurePost
        ? "Adaptive protocol complete. Measuring post..."
        : `Adaptive protocol complete. Mean drop gradient ${fmt(gradientSummary.mean, 3)} uV/s SD ${fmt(gradientSummary.sd, 3)}.`;
      if (shouldMeasurePost) await measureDominantFrequency("post");
    } else {
      refs.protocolStatus.textContent = "Adaptive protocol stopped.";
    }
  } catch (err) {
    refs.protocolStatus.textContent = `Adaptive protocol failed: ${err.message || err}`;
  } finally {
    state.liveContext = null;
    state.adaptiveProtocol = null;
    stopAudio();
    refs.protocolProgress.value = 0;
    refs.measureBtn.disabled = false;
    refs.postMeasureBtn.disabled = false;
    refs.measureAllPreBtn.disabled = false;
    refs.measureAllPostBtn.disabled = false;
    refs.runSequenceBtn.disabled = false;
    refs.startProtocolBtn.disabled = false;
    refs.montagePreBtn.disabled = false;
    refs.montageProtocolBtn.disabled = false;
    refs.montageOffsetBtn.disabled = false;
    refs.montagePostBtn.disabled = false;
    refs.endDisentrainmentSessionBtn.disabled = false;
  }
  return true;
}

function startSelectedProtocol(options = {}) {
  return selectedProtocolMode() === "adaptive" ? startAdaptiveProtocol(options) : startProtocol(options);
}

function updateProtocol() {
  const protocol = state.protocol;
  if (!protocol) return;
  let elapsed = (Date.now() - protocol.startedAt) / 1000;
  if (elapsed >= protocol.totalSeconds) {
    void finishProtocol();
    return;
  }

  let cursor = 0;
  let index = 0;
  for (; index < protocol.blocks.length; index += 1) {
    const nextCursor = cursor + protocol.blocks[index].seconds;
    if (elapsed < nextCursor) break;
    cursor = nextCursor;
  }
  if (index !== protocol.blockIndex) {
    protocol.blockIndex = index;
    tone.setPulse(protocol.blocks[index].pulseHz);
    tone.setCarrier(num(refs.carrierHz, 220));
  }

  const block = protocol.blocks[index];
  const remaining = Math.max(0, block.seconds - (elapsed - cursor));
  refs.protocolProgress.value = elapsed / protocol.totalSeconds;
  refs.protocolStatus.textContent =
    `${block.site} ${block.direction} ${protocolOffsetLabel(block)} | DF ${fmt(block.df, 2)} Hz | pulses ${fmt(block.pulseHz, 2)} Hz | ${fmt(remaining, 0)}s left`;
  refs.toneStatus.textContent = `Protocol pulses ${fmt(block.pulseHz, 2)} Hz.`;
}

async function finishProtocol() {
  const protocol = state.protocol;
  if (!protocol || protocol.completing) return;
  protocol.completing = true;
  if (protocol.timer) window.clearInterval(protocol.timer);
  const shouldMeasurePost = protocol.measurePostOnComplete;
  for (const site of new Set((protocol.blocks || []).map((block) => block.site))) {
    markSiteProgress(site, { entrained: true });
  }
  state.protocol = null;
  refs.protocolProgress.value = 1;
  refs.protocolStatus.textContent = shouldMeasurePost ? "Protocol complete. Measuring post..." : "Protocol complete.";
  stopAudio();
  refs.measureBtn.disabled = false;
  refs.postMeasureBtn.disabled = false;
  refs.measureAllPreBtn.disabled = false;
  refs.measureAllPostBtn.disabled = false;
  refs.runSequenceBtn.disabled = false;
  refs.startProtocolBtn.disabled = false;
  refs.montagePreBtn.disabled = false;
  refs.montageProtocolBtn.disabled = false;
  refs.montageOffsetBtn.disabled = false;
  refs.montagePostBtn.disabled = false;
  refs.endDisentrainmentSessionBtn.disabled = false;
  if (shouldMeasurePost) await measureDominantFrequency("post");
}

function stopProtocol(message = "Protocol stopped.") {
  if (state.protocol?.timer) window.clearInterval(state.protocol.timer);
  state.protocol = null;
  if (state.adaptiveProtocol?.running) {
    state.adaptiveProtocol.running = false;
    window.disentrainmentTools.stop().catch(() => {});
  }
  state.liveContext = null;
  refs.protocolProgress.value = 0;
  refs.protocolStatus.textContent = message;
  stopAudio();
  refs.measureBtn.disabled = false;
  refs.postMeasureBtn.disabled = false;
  refs.measureAllPreBtn.disabled = false;
  refs.measureAllPostBtn.disabled = false;
  refs.runSequenceBtn.disabled = false;
  refs.startProtocolBtn.disabled = false;
  refs.montagePreBtn.disabled = false;
  refs.montageProtocolBtn.disabled = false;
  refs.montageOffsetBtn.disabled = false;
  refs.montagePostBtn.disabled = false;
  refs.endDisentrainmentSessionBtn.disabled = false;
}

function setOffsetRunning(isRunning) {
  state.offsetFinder.running = isRunning;
  refs.offsetSite.disabled = isRunning;
  refs.offsetBaselineSeconds.disabled = isRunning;
  refs.offsetScoreMetric.disabled = isRunning;
  refs.offsetGradientWindowSeconds.disabled = isRunning;
  refs.offsetMeasureDuringStim.disabled = isRunning;
  refs.offsetTrialRows.querySelectorAll("input, select, button").forEach((control) => {
    control.disabled = isRunning;
  });
  refs.offsetMeasureBaselineBtn.disabled = isRunning;
  refs.offsetAddTrialBtn.disabled = isRunning;
  refs.offsetSaveSettingsBtn.disabled = isRunning;
  refs.offsetRunBtn.disabled = isRunning;
  refs.offsetStopBtn.disabled = !isRunning;
  refs.measureBtn.disabled = isRunning;
  refs.postMeasureBtn.disabled = isRunning;
  refs.measureAllPreBtn.disabled = isRunning;
  refs.measureAllPostBtn.disabled = isRunning;
  refs.runSequenceBtn.disabled = isRunning;
  refs.startProtocolBtn.disabled = isRunning;
  refs.montagePreBtn.disabled = isRunning;
  refs.montageProtocolBtn.disabled = isRunning;
  refs.montageOffsetBtn.disabled = isRunning;
  refs.montagePostBtn.disabled = isRunning;
  refs.endDisentrainmentSessionBtn.disabled = isRunning;
}

async function measureOffsetBaseline() {
  const seconds = Math.max(1, Math.round(num(refs.offsetBaselineSeconds, 20)));
  const site = selectedOffsetSite();
  setBusy(true, `Measuring ${site} offset baseline...`);
  try {
    const { rows } = await runMeasurement("offset-baseline", {
      rows: offsetMeasurementRows(),
      epochSeconds: seconds,
      extraTags: ["offset-finder", `site-${site}`],
    });
    state.offsetBaselineRows = rows;
    for (const row of rows) markSiteProgress(row.location, { pre: true });
    renderOffsetSiteOptions();
    refs.offsetStatus.textContent = `Offset baseline measured at ${site}.`;
    return true;
  } catch (err) {
    refs.offsetStatus.textContent = `Offset baseline failed: ${err.message || err}`;
    return false;
  } finally {
    setBusy(false);
  }
}

function offsetHzForTrial(trial, baseDf) {
  if (trial.mode === "hz") return Math.abs(Number(trial.value));
  return Math.abs(baseDf * (Number(trial.value) / 100));
}

function pulseForDirection(baseDf, offsetHz, direction) {
  return clampPulseHz(direction === "behind" ? baseDf - offsetHz : baseDf + offsetHz);
}

async function stimulateOffsetTrial(trial, baseDf, trialIndex, totalTrials, settings, measurementRows) {
  const offsetHz = offsetHzForTrial(trial, baseDf);
  const aheadPulse = pulseForDirection(baseDf, offsetHz, "ahead");
  const behindPulse = pulseForDirection(baseDf, offsetHz, "behind");
  const startPulse = trial.direction === "behind" ? behindPulse : aheadPulse;
  let liveResult = null;
  let liveDone = false;
  await tone.start({
    carrierHz: num(refs.carrierHz, 220),
    pulseHz: startPulse,
    duty: num(refs.dutyPercent, 50) / 100,
    volume: num(refs.volume, 0.12),
  });

  const started = Date.now();
  const totalMs = Math.max(100, trial.stimSeconds * 1000);
  const halfMs = totalMs / 2;
  let switched = false;
  if (settings.measureDuringStim) {
    state.liveContext = {
      kind: "offset",
      trialIndex,
      direction: trial.direction,
      offsetText: `${fmt(trial.value, 2)} ${trial.mode === "percent" ? "%" : "Hz"}`,
    };
    runLiveMeasurement(`offset-live-${trialIndex}`, {
      totalSeconds: trial.stimSeconds,
      windowSeconds: settings.gradientWindowSeconds,
      dominantWindowSeconds: settings.gradientWindowSeconds,
      scoreMetric: settings.scoreMetric,
      rows: measurementRows,
      selectedLocations: selectedOffsetLocations(),
      extraTags: ["offset-finder", "live-gradient", `offset-${trialIndex}`],
    })
      .then((result) => {
        liveResult = result;
      })
      .catch((err) => {
        refs.offsetGradientStatus.textContent = `Current gradient: live error ${err.message || err}`;
      })
      .finally(() => {
        liveDone = true;
      });
  }

  while (Date.now() - started < totalMs || (settings.measureDuringStim && !liveDone)) {
    if (state.offsetFinder.cancelled) break;
    const elapsedMs = Date.now() - started;
    if (trial.direction === "alternate" && !switched && elapsedMs >= halfMs) {
      tone.setPulse(behindPulse);
      switched = true;
    }
    refs.offsetProgress.value = Math.min(0.98, (trialIndex - 1 + elapsedMs / totalMs) / Math.max(1, totalTrials));
    refs.offsetStatus.textContent =
      `Trial ${trialIndex}: stimulating ${fmt(startPulse, 2)} Hz` +
      (trial.direction === "alternate" && switched ? ` then ${fmt(behindPulse, 2)} Hz` : "");
    await sleepMs(100);
  }
  if (settings.measureDuringStim && !liveDone && state.offsetFinder.cancelled) {
    await window.disentrainmentTools.stop().catch(() => {});
  }
  while (settings.measureDuringStim && !liveDone && !state.offsetFinder.cancelled) {
    await sleepMs(50);
  }
  state.liveContext = null;
  stopAudio();
  const summary = liveResult?.summary || {};
  return {
    offsetHz,
    pulseHz: trial.direction === "behind" ? behindPulse : aheadPulse,
    equivalentPercent: baseDf > 0 ? (offsetHz / baseDf) * 100 : NaN,
    liveSummary: summary,
  };
}

async function runOffsetFinder() {
  if (state.offsetFinder.running) return;
  let settings;
  try {
    settings = currentOffsetSettings();
  } catch (err) {
    refs.offsetStatus.textContent = err.message || String(err);
    return;
  }

  state.offsetFinder.cancelled = false;
  state.offsetResults = [];
  renderOffsetResults();
  setOffsetRunning(true);
  refs.offsetProgress.value = 0;

  try {
    if (!state.offsetBaselineRows.length || !rowsForOffsetSelection(state.offsetBaselineRows).length) {
      refs.offsetStatus.textContent = "Measuring offset baseline...";
      const ok = await measureOffsetBaseline();
      if (!ok || state.offsetFinder.cancelled) return;
    }

    const baselineRows = rowsForOffsetSelection(state.offsetBaselineRows);
    if (!baselineRows.length) throw new Error("Measure an offset baseline for the selected site first.");
    const measurementRows = baselineRows.map((row, index) => ({
      location: row.location,
      channel: row.channel || index + 1,
    }));
    const baseDf = meanDominantFrequency(baselineRows);
    if (!Number.isFinite(baseDf)) throw new Error("No usable dominant frequency in offset baseline.");

    const metric = settings.scoreMetric;
    const baselineMetric = meanMetric(baselineRows, metric);
    if (!Number.isFinite(baselineMetric)) throw new Error(`No usable ${offsetLabelForMetric(metric)} baseline value.`);

    for (const [index, trial] of settings.trials.entries()) {
      if (state.offsetFinder.cancelled) break;
      const trialIndex = index + 1;
      const stim = await stimulateOffsetTrial(trial, baseDf, trialIndex, settings.trials.length, settings, measurementRows);
      if (state.offsetFinder.cancelled) break;

      refs.offsetStatus.textContent = `Trial ${trialIndex}: measuring post response...`;
      const site = selectedOffsetSite();
      const { rows: postRows } = await runMeasurement(`offset-trial-${trialIndex}`, {
        rows: measurementRows,
        epochSeconds: trial.measureSeconds,
        extraTags: ["offset-finder", `site-${site}`, `offset-${trialIndex}`],
      });
      const postSelectedRows = rowsForOffsetSelection(postRows);
      const postMetric = meanMetric(postSelectedRows, metric);
      const reductionPct = baselineMetric > 0 ? ((baselineMetric - postMetric) / baselineMetric) * 100 : NaN;
      for (const row of postSelectedRows) markSiteProgress(row.location, { entrained: true, offset: true, post: true });

      state.offsetResults.push({
        id: `${Date.now()}-${trialIndex}`,
        trialIndex,
        mode: trial.mode,
        offsetValue: trial.value,
        direction: trial.direction,
        stimSeconds: trial.stimSeconds,
        measureSeconds: trial.measureSeconds,
        siteCount: postSelectedRows.length,
        baselineMetric,
        postMetric,
        reductionPct,
        pulseHz: stim.pulseHz,
        equivalentPercent: stim.equivalentPercent,
        gradientMean: Number(stim.liveSummary?.mean_drop_gradient_per_second),
        gradientSd: Number(stim.liveSummary?.sd_drop_gradient_per_second),
      });
      renderOffsetResults();
      refs.offsetProgress.value = trialIndex / settings.trials.length;
    }

    if (state.offsetResults.length) {
      const best = state.offsetResults.reduce((winner, row) => (row.reductionPct > winner.reductionPct ? row : winner));
      refs.offsetStatus.textContent =
        `Recommended offset: ${fmt(best.equivalentPercent, 2)}% ` +
        `(${fmt(best.offsetValue, 2)} ${best.mode === "percent" ? "%" : "Hz"}, ${best.direction}) ` +
        `using ${offsetLabelForMetric(metric)} drop ${fmt(best.reductionPct, 2)}%.`;
    } else {
      refs.offsetStatus.textContent = state.offsetFinder.cancelled ? "Offset finder stopped." : "No offset trials completed.";
    }
  } catch (err) {
    refs.offsetStatus.textContent = `Offset finder failed: ${err.message || err}`;
  } finally {
    stopAudio();
    setOffsetRunning(false);
  }
}

function stopOffsetFinder() {
  state.offsetFinder.cancelled = true;
  refs.offsetStatus.textContent = "Stopping offset finder...";
  stopAudio();
  window.disentrainmentTools.stop().catch(() => {});
}

async function runPreProtocolPost() {
  const measured = await measureDominantFrequency("pre");
  if (!measured) return;
  await startSelectedProtocol({ measurePostOnComplete: true });
}

refs.addSiteBtn.addEventListener("click", () => {
  const rows = getAllSiteRows();
  refs.siteRows.appendChild(siteRowElement(LOCATIONS[Math.min(rows.length, LOCATIONS.length - 1)], 1));
  refs.montagePreset.value = "custom";
  renderBatchOptions();
});

refs.measureBtn.addEventListener("click", () => measureDominantFrequency("pre"));
refs.postMeasureBtn.addEventListener("click", () => measureDominantFrequency("post"));
refs.measureAllPreBtn.addEventListener("click", () => measureAllBatches("pre"));
refs.measureAllPostBtn.addEventListener("click", () => measureAllBatches("post"));
refs.runSequenceBtn.addEventListener("click", runPreProtocolPost);
refs.montagePreBtn.addEventListener("click", () => measureDominantFrequency("pre"));
refs.montageProtocolBtn.addEventListener("click", runPreProtocolPost);
refs.montageOffsetBtn.addEventListener("click", () => {
  refs.offsetSite.value = state.selectedSite;
  setView("offset");
  runOffsetFinder();
});
refs.montagePostBtn.addEventListener("click", () => measureDominantFrequency("post"));
refs.endDisentrainmentSessionBtn.addEventListener("click", endDisentrainmentSession);
refs.loadPriorSessionBtn.addEventListener("click", loadPriorSession);
refs.applyPresetBtn.addEventListener("click", () => populateSites(refs.montagePreset.value));
refs.captureBatchSize.addEventListener("change", () => {
  state.activeBatchIndex = 0;
  renderBatchOptions();
});
refs.captureBatch.addEventListener("change", () => {
  state.activeBatchIndex = Number(refs.captureBatch.value) || 0;
  renderBatchOptions();
  selectSite(getActiveSiteRows()[0]?.location || "Cz");
});
refs.prevBatchBtn.addEventListener("click", () => {
  state.activeBatchIndex = Math.max(0, state.activeBatchIndex - 1);
  renderBatchOptions();
  selectSite(getActiveSiteRows()[0]?.location || "Cz");
});
refs.nextBatchBtn.addEventListener("click", () => {
  state.activeBatchIndex = Math.min(plannedBatches().length - 1, state.activeBatchIndex + 1);
  renderBatchOptions();
  selectSite(getActiveSiteRows()[0]?.location || "Cz");
});
refs.offsetMeasureBaselineBtn.addEventListener("click", measureOffsetBaseline);
refs.offsetSite.addEventListener("change", () => {
  const site = selectedOffsetSite();
  state.selectedSite = site;
  state.offsetBaselineRows = [];
  state.offsetResults = [];
  renderOffsetSiteOptions();
  renderOffsetResults();
  renderMontage();
  refs.offsetStatus.textContent = `Ready to measure ${site} baseline.`;
});
refs.offsetAddTrialBtn.addEventListener("click", () => {
  if (refs.offsetTrialRows.children.length >= 10) {
    refs.offsetStatus.textContent = "Offset finder supports up to 10 trials.";
    return;
  }
  refs.offsetTrialRows.appendChild(offsetTrialRowElement(DEFAULT_OFFSET_TRIALS[0], refs.offsetTrialRows.children.length));
});
refs.offsetSaveSettingsBtn.addEventListener("click", () => {
  try {
    saveOffsetSettings();
  } catch (err) {
    refs.offsetStatus.textContent = `Could not save settings: ${err.message || err}`;
  }
});
refs.offsetRunBtn.addEventListener("click", runOffsetFinder);
refs.offsetStopBtn.addEventListener("click", stopOffsetFinder);
refs.testToneBtn.addEventListener("click", playManualTone);
refs.stopToneBtn.addEventListener("click", () => {
  stopProtocol("Protocol stopped.");
  stopAudio();
});
refs.startProtocolBtn.addEventListener("click", () => startSelectedProtocol());
refs.stopProtocolBtn.addEventListener("click", () => stopProtocol("Protocol stopped."));
refs.volume.addEventListener("input", () => tone.setVolume(num(refs.volume, 0.12)));
refs.carrierHz.addEventListener("change", () => tone.setCarrier(num(refs.carrierHz, 220)));
[
  refs.protocolSite,
  refs.protocolMode,
  refs.adaptiveDfWindowSeconds,
  refs.stage1OffsetMode,
  refs.stage1Percent,
  refs.stage1AheadMin,
  refs.stage1BehindMin,
  refs.stage1Repeats,
  refs.stage2OffsetMode,
  refs.stage2Percent,
  refs.stage2AheadMin,
  refs.stage2BehindMin,
  refs.stage2Repeats,
].forEach((control) => {
  control.addEventListener("change", renderProtocolSummary);
});
refs.stage1Percent.addEventListener("change", renderMeasuredRows);
refs.stage1OffsetMode.addEventListener("change", renderMeasuredRows);
refs.sourceMode.addEventListener("change", () => {
  const synthetic = refs.sourceMode.value === "synthetic";
  refs.boardId.disabled = synthetic;
  refs.serialPort.disabled = synthetic;
});
refs.profileSelect.addEventListener("change", async () => {
  state.activeProfileId = refs.profileSelect.value;
  await window.disentrainmentTools.setActiveProfile(refs.profileSelect.value);
  state.offsetBaselineRows = [];
  state.offsetResults = [];
  loadOffsetSettings();
  await refreshProfileSessions();
  renderOffsetSiteOptions();
  renderOffsetResults();
  refs.offsetStatus.textContent = "Loaded offset finder settings.";
});
refs.launcherBtn.addEventListener("click", () => window.disentrainmentTools.openApplet("launcher"));

window.disentrainmentTools.onSessionEvent((event) => {
  if (event.event === "baseline_tick") {
    refs.runtimeStatus.textContent = `Measuring: ${event.seconds_remaining}s remaining`;
  } else if (event.event === "live_window") {
    const drop = Number(event.drop_gradient_per_second);
    const pct = Number(event.drop_percent_per_second);
    if (state.liveContext?.kind === "offset") {
      refs.offsetGradientStatus.textContent =
        `Current gradient: ${fmt(drop, 3)} uV/s (${fmt(pct, 3)}%/s drop) | ` +
        `${offsetLabelForMetric(event.metric)} ${fmt(event.aggregate_metric, 2)}`;
    } else if (state.liveContext?.kind === "adaptive") {
      const block = state.liveContext.block;
      const df = Number(event.dominant_frequency_hz);
      if (Number.isFinite(df) && df > 0) {
        const pulse = protocolPulseForDirection(df, block, block.direction);
        tone.setPulse(pulse);
        const elapsed = (state.adaptiveProtocol?.elapsedBeforeBlock || 0) + Number(event.elapsed_seconds || 0);
        const total = state.adaptiveProtocol?.totalSeconds || block.seconds;
        refs.protocolProgress.value = Math.min(1, elapsed / total);
        refs.protocolStatus.textContent =
          `Adaptive ${block.site} ${block.direction} ${protocolOffsetLabel(block)} | ` +
          `DF ${fmt(df, 2)} Hz -> pulses ${fmt(pulse, 2)} Hz | gradient ${fmt(drop, 3)} uV/s`;
        refs.toneStatus.textContent = `Adaptive pulses ${fmt(pulse, 2)} Hz.`;
      }
    }
  } else if (event.event === "runner_spawned") {
    refs.runtimeStatus.textContent = "Measurement running...";
  } else if (event.event === "error") {
    refs.runtimeStatus.textContent = `Error: ${event.message}`;
  }
});

populateSites("cz");
refs.boardId.disabled = true;
refs.serialPort.disabled = true;
applyOffsetSettings(defaultOffsetSettings());
refs.offsetStopBtn.disabled = true;
renderMeasuredRows();
renderBandViews();
renderOffsetResults();
if (["offset", "results"].includes(window.location.hash.slice(1))) {
  requestAnimationFrame(() => setView(window.location.hash.slice(1)));
}

window.disentrainmentTools
  .checkPython()
  .then((result) => {
    refs.runtimeStatus.textContent = result.ok ? `${result.message} | ${result.python}` : result.message;
  })
  .catch((err) => {
    refs.runtimeStatus.textContent = `Runtime check failed: ${err.message || err}`;
  });

loadProfiles().catch((err) => {
  refs.runtimeStatus.textContent = `Profile load failed: ${err.message || err}`;
});
