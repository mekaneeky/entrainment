const refs = {
  runtimeStatus: document.getElementById("runtimeStatus"),
  launcherBtn: document.getElementById("launcherBtn"),
  tabs: [...document.querySelectorAll(".tab")],
  baselineView: document.getElementById("baselineView"),
  trainView: document.getElementById("trainView"),
  programsView: document.getElementById("programsView"),
  progressView: document.getElementById("progressView"),
  profileSelect: document.getElementById("profileSelect"),
  sessionTags: document.getElementById("sessionTags"),
  sessionNotes: document.getElementById("sessionNotes"),
  sourceMode: document.getElementById("sourceMode"),
  serialPort: document.getElementById("serialPort"),
  baselineSeconds: document.getElementById("baselineSeconds"),
  electrodeCount: document.getElementById("electrodeCount"),
  baselineCondition: document.getElementById("baselineCondition"),
  baselineNorms: document.getElementById("baselineNorms"),
  baselineZMode: document.getElementById("baselineZMode"),
  baselineAge: document.getElementById("baselineAge"),
  baselineUnits: document.getElementById("baselineUnits"),
  electrodeRows: document.getElementById("electrodeRows"),
  runBaselineBtn: document.getElementById("runBaselineBtn"),
  baselineCanvas: document.getElementById("baselineCanvas"),
  baselineTableBody: document.querySelector("#baselineTable tbody"),
  trainProtocol: document.getElementById("trainProtocol"),
  browseProtocolBtn: document.getElementById("browseProtocolBtn"),
  trainPresetSelect: document.getElementById("trainPresetSelect"),
  saveTrainPresetBtn: document.getElementById("saveTrainPresetBtn"),
  deleteTrainPresetBtn: document.getElementById("deleteTrainPresetBtn"),
  protocolDialog: document.getElementById("protocolDialog"),
  closeProtocolDialogBtn: document.getElementById("closeProtocolDialogBtn"),
  protocolCards: document.getElementById("protocolCards"),
  trainSourceMode: document.getElementById("trainSourceMode"),
  trainSerialPort: document.getElementById("trainSerialPort"),
  trainSeconds: document.getElementById("trainSeconds"),
  trainWindowSeconds: document.getElementById("trainWindowSeconds"),
  trainRewardBand: document.getElementById("trainRewardBand"),
  startTrainBtn: document.getElementById("startTrainBtn"),
  stopTrainBtn: document.getElementById("stopTrainBtn"),
  trainChannelRows: document.getElementById("trainChannelRows"),
  thresholdRewardMin: document.getElementById("thresholdRewardMin"),
  thresholdSmrMin: document.getElementById("thresholdSmrMin"),
  thresholdAlphaMin: document.getElementById("thresholdAlphaMin"),
  thresholdThetaMax: document.getElementById("thresholdThetaMax"),
  thresholdSlowMax: document.getElementById("thresholdSlowMax"),
  thresholdFastMax: document.getElementById("thresholdFastMax"),
  thresholdAsymMax: document.getElementById("thresholdAsymMax"),
  thresholdAlphaMax: document.getElementById("thresholdAlphaMax"),
  thresholdThetaBetaMax: document.getElementById("thresholdThetaBetaMax"),
  thresholdHiBetaMin: document.getElementById("thresholdHiBetaMin"),
  thresholdHiBetaMax: document.getElementById("thresholdHiBetaMax"),
  rewardSoundMode: document.getElementById("rewardSoundMode"),
  alertSoundMode: document.getElementById("alertSoundMode"),
  visualFeedbackMode: document.getElementById("visualFeedbackMode"),
  trainFeedbackCanvas: document.getElementById("trainFeedbackCanvas"),
  trainRewardPct: document.getElementById("trainRewardPct"),
  trainStreak: document.getElementById("trainStreak"),
  trainWindowCount: document.getElementById("trainWindowCount"),
  trainLastFeedback: document.getElementById("trainLastFeedback"),
  trainMetricsTableBody: document.querySelector("#trainMetricsTable tbody"),
  trainEventLog: document.getElementById("trainEventLog"),
  programSelect: document.getElementById("programSelect"),
  programName: document.getElementById("programName"),
  programSourceMode: document.getElementById("programSourceMode"),
  programSerialPort: document.getElementById("programSerialPort"),
  programClinicalQSeconds: document.getElementById("programClinicalQSeconds"),
  programTrainSeconds: document.getElementById("programTrainSeconds"),
  saveProgramBtn: document.getElementById("saveProgramBtn"),
  deleteProgramBtn: document.getElementById("deleteProgramBtn"),
  runProgramBtn: document.getElementById("runProgramBtn"),
  stopProgramBtn: document.getElementById("stopProgramBtn"),
  addClinicalQStepBtn: document.getElementById("addClinicalQStepBtn"),
  addProtocolStepBtn: document.getElementById("addProtocolStepBtn"),
  addDecisionStepBtn: document.getElementById("addDecisionStepBtn"),
  programStepList: document.getElementById("programStepList"),
  programEventLog: document.getElementById("programEventLog"),
  programStepCount: document.getElementById("programStepCount"),
  programLastClinicalQ: document.getElementById("programLastClinicalQ"),
  programPathCount: document.getElementById("programPathCount"),
  chooseProgressFilesBtn: document.getElementById("chooseProgressFilesBtn"),
  chooseProgressDirBtn: document.getElementById("chooseProgressDirBtn"),
  useProfileSessionsBtn: document.getElementById("useProfileSessionsBtn"),
  includeBrainbayLogs: document.getElementById("includeBrainbayLogs"),
  plotZscores: document.getElementById("plotZscores"),
  analyzeProgressBtn: document.getElementById("analyzeProgressBtn"),
  progressSource: document.getElementById("progressSource"),
  progressSummary: document.getElementById("progressSummary"),
  metricSearch: document.getElementById("metricSearch"),
  metricList: document.getElementById("metricList"),
  progressCanvas: document.getElementById("progressCanvas"),
  progressTableBody: document.querySelector("#progressTable tbody"),
};

const DEFAULT_EEG_FILTERS = { enabled: true, l_freq: 0.3, h_freq: 45, notch_hz: 60, notch_width_hz: 2 };
const TRAIN_PRESETS_KEY = "entrainment.nf.trainPresets.v1";
const PROGRAMS_KEY = "entrainment.nf.programs.v1";

const LOCATIONS = [
  "Fp1",
  "Fp2",
  "FPz",
  "FPo2",
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

const DEFAULT_LOCS = ["O1", "Cz", "Fz", "F3", "F4", "T3", "T4", "Pz"];
const BAND_ORDER = ["delta", "theta", "alpha", "smr", "beta", "hibeta"];
const BAND_LABELS = { delta: "Delta", theta: "Theta", alpha: "Alpha", smr: "SMR", beta: "Beta", hibeta: "HiBeta" };
const COLORS = ["#225c8a", "#276b4b", "#a0661f", "#a23b32", "#5b5f77", "#16737d", "#7a4d1f", "#3f6b2f"];

const TRAIN_PROTOCOLS = [
  { id: "reward_smr_inhibit_theta", label: "Reward SMR, inhibit theta", group: "Cz / SMR", detail: "Cz SMR reward with theta inhibit.", channels: { Cz: 1 } },
  { id: "reward_2inhibit_1channel", label: "1-channel reward + slow/fast inhibits", group: "Single site", detail: "Flexible reward band with slow and fast inhibits.", channels: { Cz: 1 } },
  { id: "fpo2_reward_2inhibit_1channel", label: "FPo2 reward + slow/fast inhibits", group: "Frontal pole", detail: "FPo2 variant of the 1-channel reward protocol.", channels: { FPo2: 1 } },
  { id: "alpha_theta_inhibit_delta_hibeta", label: "Alpha/theta reward, delta/hibeta inhibits", group: "O1", detail: "O1 alpha/theta reward with low/high inhibits.", channels: { O1: 1 } },
  { id: "o1_theta_beta_ratio_downtrain", label: "O1 theta/beta downtrain", group: "O1", detail: "Downtrain O1 theta/beta ratio.", channels: { O1: 1 } },
  { id: "f3f4_theta_alpha_balanced", label: "F3/F4 theta-alpha balance", group: "Frontal pair", detail: "Balance F3/F4 theta-alpha ratios.", channels: { F3: 1, F4: 2 } },
  { id: "f3f4_band_asymmetry_reduce", label: "F3/F4 asymmetry reduce", group: "Frontal pair", detail: "Reduce theta, alpha, and beta asymmetry.", channels: { F3: 1, F4: 2 } },
  { id: "f3f4_alpha_downtrain_ch3_ch4", label: "F3/F4 alpha downtrain", group: "Frontal pair", detail: "Manual alpha downtraining on channels 3 and 4.", channels: { F3: 3, F4: 4 } },
  { id: "fz_hibeta_beta_ratio", label: "Fz hibeta/beta ratio", group: "Fz", detail: "Keep Fz hibeta/beta ratio in range.", channels: { Fz: 1 } },
  { id: "fehmi_5site_summed_alpha_synchrony", label: "Fehmi 5-site summed alpha", group: "Synchrony", detail: "Five-site summed narrow-alpha feedback.", channels: { Oz: 1, Cz: 2, T3: 3, T4: 4, FPz: 5 } },
];

const DEFAULT_DECISION_RULES = [
  { mode: "match", match: "O1 theta beta", protocol_id: "o1_theta_beta_ratio_downtrain", seconds: 120 },
  { mode: "match", match: "Cz theta smr", protocol_id: "reward_smr_inhibit_theta", seconds: 120 },
  { mode: "match", match: "Fz hibeta beta", protocol_id: "fz_hibeta_beta_ratio", seconds: 120 },
  { mode: "match", match: "F3 F4 asymmetry", protocol_id: "f3f4_band_asymmetry_reduce", seconds: 120 },
  { mode: "fallback", match: "", protocol_id: "reward_2inhibit_1channel", seconds: 120 },
];

const BUILTIN_PROGRAMS = [
  {
    id: "guided-clinicalq",
    name: "ClinicalQ guided training",
    readonly: true,
    steps: [
      { type: "clinicalq", label: "Pre ClinicalQ" },
      { type: "decision", label: "Choose protocols from ClinicalQ", rules: DEFAULT_DECISION_RULES },
      { type: "clinicalq", label: "Post ClinicalQ" },
    ],
  },
  {
    id: "o1-then-cz-smr",
    name: "O1 then Cz SMR",
    readonly: true,
    steps: [
      { type: "protocol", label: "O1 theta/beta", protocol_id: "o1_theta_beta_ratio_downtrain", seconds: 120 },
      { type: "protocol", label: "Cz SMR", protocol_id: "reward_smr_inhibit_theta", seconds: 120 },
    ],
  },
];

const state = {
  baselineResult: null,
  trainRunning: false,
  trainWindows: [],
  trainHeaders: [],
  trainLastValues: {},
  trainRewardWindows: 0,
  trainStreak: 0,
  trainOutputPath: "",
  progressPaths: [],
  progressResult: null,
  selectedMetrics: new Set(),
  profiles: [],
  activeProfileId: "default",
  trainPresets: [],
  programs: [],
  currentProgram: null,
  programRunning: false,
  programStopRequested: false,
  lastClinicalQResult: null,
};

function formatValue(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(digits);
}

function canonicalLoc(value) {
  return String(value || "").trim().toUpperCase();
}

function displayDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

function parseTags(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function selectedProfilePayload() {
  const profile = state.profiles.find((item) => item.id === refs.profileSelect?.value) || state.profiles[0];
  return profile ? { id: profile.id, name: profile.name } : { id: "default", name: "Default Profile" };
}

function sessionMetadataConfig() {
  return {
    profile: selectedProfilePayload(),
    tags: parseTags(refs.sessionTags?.value),
    notes: String(refs.sessionNotes?.value || "").trim(),
  };
}

function readLocalJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function renderProfiles() {
  if (!refs.profileSelect) return;
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
  const payload = await window.nfTools.listProfiles();
  state.profiles = payload.profiles || [];
  state.activeProfileId = payload.activeProfileId || "default";
  renderProfiles();
}

function setBusy(isBusy, label = "") {
  refs.runBaselineBtn.disabled = isBusy;
  refs.startTrainBtn.disabled = isBusy || state.trainRunning;
  refs.runProgramBtn.disabled = isBusy || state.programRunning;
  refs.analyzeProgressBtn.disabled = isBusy;
  if (label) refs.runtimeStatus.textContent = label;
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

function clearCanvas(canvas, message = "") {
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfb";
  ctx.fillRect(0, 0, width, height);
  if (message) {
    ctx.fillStyle = "#697370";
    ctx.font = "13px Segoe UI";
    ctx.fillText(message, 18, 28);
  }
}

function renderElectrodes() {
  const count = Math.max(1, Math.min(8, Number(refs.electrodeCount.value || 1)));
  refs.electrodeCount.value = String(count);
  refs.electrodeRows.innerHTML = "";
  for (let i = 0; i < count; i += 1) {
    const row = document.createElement("div");
    row.className = "electrode-row";

    const channel = document.createElement("label");
    channel.textContent = "Channel";
    const channelInput = document.createElement("input");
    channelInput.type = "number";
    channelInput.min = "1";
    channelInput.max = "8";
    channelInput.value = String(i + 1);
    channelInput.dataset.role = "channel";
    channel.appendChild(channelInput);

    const site = document.createElement("label");
    site.textContent = "Site";
    const select = document.createElement("select");
    select.dataset.role = "site";
    for (const loc of LOCATIONS) {
      const option = document.createElement("option");
      option.value = loc;
      option.textContent = loc;
      select.appendChild(option);
    }
    select.value = DEFAULT_LOCS[i] || LOCATIONS[i] || "Cz";
    site.appendChild(select);

    row.appendChild(channel);
    row.appendChild(site);
    refs.electrodeRows.appendChild(row);
  }
}

function syncBaselineNormControls() {
  const normsEnabled = refs.baselineNorms.value !== "none";
  refs.baselineZMode.disabled = !normsEnabled;
  refs.baselineAge.disabled = !normsEnabled || refs.baselineZMode.value !== "age";
  refs.baselineUnits.disabled = !normsEnabled;
}

function syncConditionNormHint() {
  if (refs.baselineCondition.value === "EO" && refs.baselineNorms.value === "dvs_608_cleaned") {
    refs.baselineNorms.value = "dvs_608_eo_cleaned";
  }
  if (refs.baselineCondition.value === "EC" && refs.baselineNorms.value === "dvs_608_eo_cleaned") {
    refs.baselineNorms.value = "dvs_608_cleaned";
  }
  syncBaselineNormControls();
}

function buildBaselineConfig() {
  const channels = {};
  const rows = [...refs.electrodeRows.querySelectorAll(".electrode-row")];
  for (const row of rows) {
    const ch = Number(row.querySelector('[data-role="channel"]').value);
    const loc = canonicalLoc(row.querySelector('[data-role="site"]').value);
    if (!Number.isInteger(ch) || ch < 1 || ch > 8) throw new Error("Channels must be 1-8.");
    if (!loc) continue;
    if (Object.prototype.hasOwnProperty.call(channels, loc)) throw new Error(`Duplicate site: ${loc}`);
    channels[loc] = ch;
  }
  return {
    ...sessionMetadataConfig(),
    epoch_seconds: Number(refs.baselineSeconds.value || 60),
    sampling_rate: 250,
    fast_mode: refs.sourceMode.value === "synthetic",
    condition: refs.baselineCondition.value || "EC",
    dominant_range_hz: [1, 40],
    filters: { ...DEFAULT_EEG_FILTERS },
    norms_dataset: refs.baselineNorms.value || "dvs_608_cleaned",
    zscore_mode: refs.baselineZMode.value || "global",
    subject_age: refs.baselineZMode.value === "age" ? Number(refs.baselineAge.value || 35) : null,
    norm_signal_unit: refs.baselineUnits.value || "uV",
    board: {
      board_id: refs.sourceMode.value === "synthetic" ? "synthetic" : "cyton",
      serial_port: refs.serialPort.value || "COM3",
      use_synthetic: refs.sourceMode.value === "synthetic",
      available_channels: Object.values(channels),
      seed: 42,
    },
    channels,
  };
}

function qeegSummary(row) {
  const scores = row.norm_scores || [];
  if (!scores.length) return "Off";
  const outScores = scores
    .filter((score) => score.status === "OUT_OF_RANGE" && Number.isFinite(Number(score.zscore)))
    .sort((a, b) => Math.abs(Number(b.zscore)) - Math.abs(Number(a.zscore)));
  const out = scores.filter((score) => score.status === "OUT_OF_RANGE").length;
  const missing = scores.filter((score) => score.status === "MISSING").length;
  if (out === 0 && missing === 0) return "In range";
  const parts = [];
  if (out) parts.push(`${out} out`);
  if (missing) parts.push(`${missing} missing`);
  if (outScores.length) {
    parts.push(
      outScores
        .map((score) => `${score.band} ${score.metric_type === "absolute_power" ? "AP" : "RP"} z=${formatValue(score.zscore, 1)}`)
        .join("; ")
    );
  }
  return parts.join(" | ");
}

function renderBaselineTable(result) {
  refs.baselineTableBody.innerHTML = "";
  for (const row of result?.locations || []) {
    const tr = document.createElement("tr");
    const cells = [
      row.location,
      ...BAND_ORDER.map((band) => formatValue(row.amplitudes?.[band])),
      formatValue(row.dominant_frequency_hz),
      qeegSummary(row),
    ];
    for (const cell of cells) {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    }
    refs.baselineTableBody.appendChild(tr);
  }
}

function drawBaseline(result) {
  const rows = result?.locations || [];
  if (!rows.length) {
    clearCanvas(refs.baselineCanvas, "No baseline result.");
    return;
  }
  const { ctx, width, height } = setupCanvas(refs.baselineCanvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfb";
  ctx.fillRect(0, 0, width, height);

  const margin = { left: 48, right: 16, top: 18, bottom: 52 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const maxVal = Math.max(1, ...rows.flatMap((row) => BAND_ORDER.map((band) => Number(row.amplitudes?.[band] || 0))));

  ctx.strokeStyle = "#d7ddd7";
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + plotH);
  ctx.lineTo(margin.left + plotW, margin.top + plotH);
  ctx.stroke();

  ctx.fillStyle = "#697370";
  ctx.font = "11px Segoe UI";
  for (let i = 0; i <= 4; i += 1) {
    const y = margin.top + plotH - (plotH * i) / 4;
    const val = (maxVal * i) / 4;
    ctx.fillText(formatValue(val, 1), 8, y + 4);
    ctx.strokeStyle = "#edf0ed";
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + plotW, y);
    ctx.stroke();
  }

  const groupW = plotW / rows.length;
  const barW = Math.max(4, Math.min(14, (groupW - 14) / BAND_ORDER.length));
  rows.forEach((row, rowIndex) => {
    const baseX = margin.left + rowIndex * groupW + groupW / 2 - (barW * BAND_ORDER.length) / 2;
    BAND_ORDER.forEach((band, bandIndex) => {
      const value = Number(row.amplitudes?.[band] || 0);
      const h = (value / maxVal) * plotH;
      ctx.fillStyle = COLORS[bandIndex % COLORS.length];
      ctx.fillRect(baseX + bandIndex * barW, margin.top + plotH - h, Math.max(2, barW - 1), h);
    });
    ctx.fillStyle = "#1d2525";
    ctx.fillText(row.location, margin.left + rowIndex * groupW + 6, height - 28);
  });

  BAND_ORDER.forEach((band, idx) => {
    const x = margin.left + idx * 76;
    const y = height - 10;
    ctx.fillStyle = COLORS[idx % COLORS.length];
    ctx.fillRect(x, y - 8, 10, 8);
    ctx.fillStyle = "#37413d";
    ctx.fillText(BAND_LABELS[band], x + 14, y);
  });
}

async function runBaseline() {
  try {
    setBusy(true, "Measuring baseline...");
    const payload = await window.nfTools.startBaselineSession(buildBaselineConfig());
    state.baselineResult = payload.result;
    renderBaselineTable(payload.result);
    drawBaseline(payload.result);
    if (payload.outputPath) {
      state.progressPaths.push(payload.outputPath);
      refs.progressSource.textContent = `${state.progressPaths.length} selected file(s).`;
    }
    refs.runtimeStatus.textContent = `Baseline saved: ${payload.outputPath || "done"}`;
  } catch (err) {
    refs.runtimeStatus.textContent = `Baseline failed: ${err.message || err}`;
  } finally {
    setBusy(false);
  }
}

function currentTrainProtocol() {
  return TRAIN_PROTOCOLS.find((protocol) => protocol.id === refs.trainProtocol?.value) || TRAIN_PROTOCOLS[0];
}

function protocolById(protocolId) {
  return TRAIN_PROTOCOLS.find((protocol) => protocol.id === protocolId) || TRAIN_PROTOCOLS[0];
}

function renderTrainProtocols() {
  if (!refs.trainProtocol) return;
  refs.trainProtocol.innerHTML = "";
  for (const protocol of TRAIN_PROTOCOLS) {
    const option = document.createElement("option");
    option.value = protocol.id;
    option.textContent = protocol.label;
    refs.trainProtocol.appendChild(option);
  }
  refs.trainProtocol.value = "o1_theta_beta_ratio_downtrain";
}

function renderProtocolCards() {
  if (!refs.protocolCards) return;
  refs.protocolCards.innerHTML = "";
  for (const protocol of TRAIN_PROTOCOLS) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `protocol-card${protocol.id === refs.trainProtocol.value ? " active" : ""}`;
    card.innerHTML = `
      <strong>${protocol.label}</strong>
      <span>${protocol.group}</span>
      <span>${protocol.detail}</span>
      <span>${Object.keys(protocol.channels).join(", ")}</span>
    `;
    card.addEventListener("click", () => {
      refs.trainProtocol.value = protocol.id;
      renderTrainChannels();
      renderProtocolCards();
      refs.protocolDialog?.close();
    });
    refs.protocolCards.appendChild(card);
  }
}

function renderTrainChannelRows(channels) {
  if (!refs.trainChannelRows) return;
  refs.trainChannelRows.innerHTML = "";
  for (const [siteName, channelNumber] of Object.entries(channels || {})) {
    const row = document.createElement("div");
    row.className = "electrode-row";

    const channel = document.createElement("label");
    channel.textContent = "Channel";
    const channelInput = document.createElement("input");
    channelInput.type = "number";
    channelInput.min = "1";
    channelInput.max = "16";
    channelInput.value = String(channelNumber);
    channelInput.dataset.role = "train-channel";
    channel.appendChild(channelInput);

    const site = document.createElement("label");
    site.textContent = "Site";
    const select = document.createElement("select");
    select.dataset.role = "train-site";
    for (const loc of LOCATIONS) {
      const option = document.createElement("option");
      option.value = loc;
      option.textContent = loc;
      select.appendChild(option);
    }
    select.value = siteName;
    site.appendChild(select);

    row.appendChild(channel);
    row.appendChild(site);
    refs.trainChannelRows.appendChild(row);
  }
}

function renderTrainChannels() {
  renderTrainChannelRows(currentTrainProtocol().channels);
}

function buildTrainChannels() {
  const channels = {};
  for (const row of [...refs.trainChannelRows.querySelectorAll(".electrode-row")]) {
    const ch = Number(row.querySelector('[data-role="train-channel"]').value);
    const loc = canonicalLoc(row.querySelector('[data-role="train-site"]').value);
    if (!Number.isInteger(ch) || ch < 1 || ch > 16) throw new Error("Training channels must be 1-16.");
    if (!loc) continue;
    if (Object.prototype.hasOwnProperty.call(channels, loc)) throw new Error(`Duplicate training site: ${loc}`);
    channels[loc] = ch;
  }
  return channels;
}

function currentThresholds() {
  return {
    reward_min: thresholdNumber(refs.thresholdRewardMin, 4),
    smr_min: thresholdNumber(refs.thresholdSmrMin, 4),
    alpha_min: thresholdNumber(refs.thresholdAlphaMin, 4),
    theta_max: thresholdNumber(refs.thresholdThetaMax, 7),
    slow_max: thresholdNumber(refs.thresholdSlowMax, 6),
    fast_max: thresholdNumber(refs.thresholdFastMax, 3),
    asym_max_pct: thresholdNumber(refs.thresholdAsymMax, 15),
    alpha_max: thresholdNumber(refs.thresholdAlphaMax, 10),
    theta_beta_max: thresholdNumber(refs.thresholdThetaBetaMax, 2.2),
    hibeta_beta_min: thresholdNumber(refs.thresholdHiBetaMin, 0.45),
    hibeta_beta_max: thresholdNumber(refs.thresholdHiBetaMax, 0.55),
  };
}

function applyThresholds(thresholds = {}) {
  refs.thresholdRewardMin.value = thresholds.reward_min ?? 4;
  refs.thresholdSmrMin.value = thresholds.smr_min ?? 4;
  refs.thresholdAlphaMin.value = thresholds.alpha_min ?? 4;
  refs.thresholdThetaMax.value = thresholds.theta_max ?? 7;
  refs.thresholdSlowMax.value = thresholds.slow_max ?? 6;
  refs.thresholdFastMax.value = thresholds.fast_max ?? 3;
  refs.thresholdAsymMax.value = thresholds.asym_max_pct ?? 15;
  refs.thresholdAlphaMax.value = thresholds.alpha_max ?? 10;
  refs.thresholdThetaBetaMax.value = thresholds.theta_beta_max ?? 2.2;
  refs.thresholdHiBetaMin.value = thresholds.hibeta_beta_min ?? 0.45;
  refs.thresholdHiBetaMax.value = thresholds.hibeta_beta_max ?? 0.55;
}

function captureTrainPreset(name) {
  return {
    id: uid("preset"),
    name,
    protocol_id: currentTrainProtocol().id,
    seconds: Number(refs.trainSeconds.value || 120),
    window_seconds: Number(refs.trainWindowSeconds.value || 1),
    reward_band: refs.trainRewardBand.value || "alpha",
    channels: buildTrainChannels(),
    thresholds: currentThresholds(),
    reward_sound: refs.rewardSoundMode.value,
    alert_sound: refs.alertSoundMode.value,
    visual: refs.visualFeedbackMode.value,
  };
}

function renderTrainPresets() {
  if (!refs.trainPresetSelect) return;
  refs.trainPresetSelect.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Built-in defaults";
  refs.trainPresetSelect.appendChild(empty);
  for (const preset of state.trainPresets) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name;
    refs.trainPresetSelect.appendChild(option);
  }
}

function loadTrainPresets() {
  const saved = readLocalJson(TRAIN_PRESETS_KEY, []);
  state.trainPresets = Array.isArray(saved) ? saved : [];
  renderTrainPresets();
}

function saveTrainPresets() {
  writeLocalJson(TRAIN_PRESETS_KEY, state.trainPresets);
  renderTrainPresets();
  renderProgram();
}

function applyTrainPreset(preset) {
  if (!preset) return;
  refs.trainProtocol.value = preset.protocol_id || currentTrainProtocol().id;
  renderTrainChannels();
  if (preset.channels) {
    renderTrainChannelRows(preset.channels);
  }
  refs.trainSeconds.value = preset.seconds ?? refs.trainSeconds.value;
  refs.trainWindowSeconds.value = preset.window_seconds ?? refs.trainWindowSeconds.value;
  refs.trainRewardBand.value = preset.reward_band || refs.trainRewardBand.value;
  applyThresholds(preset.thresholds || {});
  refs.rewardSoundMode.value = preset.reward_sound || refs.rewardSoundMode.value;
  refs.alertSoundMode.value = preset.alert_sound || refs.alertSoundMode.value;
  refs.visualFeedbackMode.value = preset.visual || refs.visualFeedbackMode.value;
  drawTrainFeedback();
}

function thresholdNumber(ref, fallback) {
  const value = Number(ref?.value);
  return Number.isFinite(value) ? value : fallback;
}

function buildTrainConfig() {
  const channels = buildTrainChannels();
  return {
    ...sessionMetadataConfig(),
    protocol_id: currentTrainProtocol().id,
    total_seconds: Number(refs.trainSeconds.value || 120),
    window_seconds: Number(refs.trainWindowSeconds.value || 1),
    sampling_rate: 250,
    fast_mode: false,
    condition: "NF",
    filters: { ...DEFAULT_EEG_FILTERS },
    reward_band: refs.trainRewardBand.value || "alpha",
    thresholds: currentThresholds(),
    board: {
      board_id: refs.trainSourceMode.value === "synthetic" ? "synthetic" : "cyton",
      serial_port: refs.trainSerialPort.value || "COM3",
      use_synthetic: refs.trainSourceMode.value === "synthetic",
      available_channels: Object.values(channels),
      seed: 42,
    },
    channels,
  };
}

let trainAudioCtx = null;
let trainIsoTone = null;
let lastTrainSoundAt = 0;

function ensureTrainAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!trainAudioCtx) trainAudioCtx = new Ctx();
  if (trainAudioCtx.state === "suspended") trainAudioCtx.resume().catch(() => undefined);
  return trainAudioCtx;
}

function playTrainBeep(freq, durationSec = 0.08, volume = 0.04) {
  const ctx = ensureTrainAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + durationSec);
}

async function stopTrainIso() {
  if (!trainIsoTone) return;
  trainIsoTone.stop();
  trainIsoTone = null;
}

async function handleTrainAudio(values, feedback) {
  const now = performance.now();
  const rewardMode = refs.rewardSoundMode.value;
  const alertMode = refs.alertSoundMode.value;
  const alphaHigh = Number(values?.alpha_high_tone || 0) > 0;

  if (feedback > 0 && rewardMode === "iso") {
    if (!trainIsoTone) {
      trainIsoTone = new window.IsochronicTone();
      await trainIsoTone.start({ pulseHz: 10, carrierHz: 220, volume: 0.08 });
    }
  } else if (trainIsoTone) {
    await stopTrainIso();
  }

  if (now - lastTrainSoundAt < 260) return;
  if (feedback > 0 && rewardMode === "chime") {
    playTrainBeep(740, 0.07, 0.035);
    window.setTimeout(() => playTrainBeep(990, 0.08, 0.03), 85);
    lastTrainSoundAt = now;
  } else if (feedback > 0 && rewardMode === "tone") {
    playTrainBeep(660, 0.12, 0.04);
    lastTrainSoundAt = now;
  } else if (feedback <= 0 && alertMode === "soft") {
    playTrainBeep(220, 0.05, 0.018);
    lastTrainSoundAt = now;
  } else if (alphaHigh && alertMode === "alpha") {
    playTrainBeep(420, 0.08, 0.025);
    window.setTimeout(() => playTrainBeep(315, 0.08, 0.025), 90);
    lastTrainSoundAt = now;
  }
}

function appendTrainEvent(text) {
  if (!refs.trainEventLog) return;
  const row = document.createElement("div");
  row.className = "train-event";
  row.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  refs.trainEventLog.prepend(row);
}

function resetTrainState() {
  state.trainWindows = [];
  state.trainHeaders = [];
  state.trainLastValues = {};
  state.trainRewardWindows = 0;
  state.trainStreak = 0;
  state.trainOutputPath = "";
  if (refs.trainMetricsTableBody) refs.trainMetricsTableBody.innerHTML = "";
  if (refs.trainEventLog) refs.trainEventLog.innerHTML = "";
  updateTrainStats(0);
  drawTrainFeedback();
}

function updateTrainStats(feedback) {
  const count = state.trainWindows.length;
  const pct = count ? (state.trainRewardWindows / count) * 100 : 0;
  refs.trainRewardPct.textContent = `${formatValue(pct, 0)}%`;
  refs.trainStreak.textContent = String(state.trainStreak);
  refs.trainWindowCount.textContent = String(count);
  refs.trainLastFeedback.textContent = formatValue(feedback, 0);
}

function renderTrainMetrics() {
  if (!refs.trainMetricsTableBody) return;
  refs.trainMetricsTableBody.innerHTML = "";
  const labels = state.trainHeaders.length ? state.trainHeaders : Object.keys(state.trainLastValues);
  for (const label of labels) {
    const tr = document.createElement("tr");
    const metric = document.createElement("td");
    metric.textContent = label;
    const value = document.createElement("td");
    value.textContent = formatValue(state.trainLastValues[label], label.endsWith("_pass") || label === "feedback" ? 0 : 2);
    tr.appendChild(metric);
    tr.appendChild(value);
    refs.trainMetricsTableBody.appendChild(tr);
  }
}

function drawTrainFeedback() {
  if (!refs.trainFeedbackCanvas) return;
  const { ctx, width, height } = setupCanvas(refs.trainFeedbackCanvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfb";
  ctx.fillRect(0, 0, width, height);

  const windows = state.trainWindows.slice(-80);
  const feedback = Number(state.trainLastValues.feedback || 0);
  const mode = refs.visualFeedbackMode?.value || "meter";
  const pct = state.trainWindows.length ? (state.trainRewardWindows / state.trainWindows.length) * 100 : 0;

  if (mode === "bars") {
    const labels = state.trainHeaders.filter((label) => !label.endsWith("_pass")).slice(0, 8);
    const max = Math.max(1, ...labels.map((label) => Number(state.trainLastValues[label] || 0)));
    labels.forEach((label, idx) => {
      const x = 26 + idx * ((width - 52) / Math.max(1, labels.length));
      const barW = Math.max(18, (width - 80) / Math.max(1, labels.length) - 8);
      const h = (Number(state.trainLastValues[label] || 0) / max) * (height - 82);
      ctx.fillStyle = COLORS[idx % COLORS.length];
      ctx.fillRect(x, height - 42 - h, barW, h);
      ctx.fillStyle = "#37413d";
      ctx.font = "11px Segoe UI";
      ctx.fillText(label.slice(0, 12), x, height - 18);
    });
  } else if (mode === "field") {
    const radius = 18 + feedback * 0.9;
    for (let i = 0; i < 36; i += 1) {
      const angle = (Math.PI * 2 * i) / 36 + windows.length * 0.08;
      const wobble = 10 * Math.sin(i + windows.length * 0.23);
      const x = width / 2 + Math.cos(angle) * (radius + wobble);
      const y = height / 2 + Math.sin(angle) * (radius * 0.62 + wobble);
      ctx.fillStyle = feedback > 0 ? "#276b4b" : "#a23b32";
      ctx.globalAlpha = 0.25 + (i % 5) * 0.1;
      ctx.beginPath();
      ctx.arc(x, y, 5 + (i % 4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    const cx = width / 2;
    const cy = height / 2 - 8;
    const r = Math.min(width, height) * 0.28;
    ctx.lineWidth = 18;
    ctx.strokeStyle = "#eef2ef";
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.85, Math.PI * 2.15);
    ctx.stroke();
    ctx.strokeStyle = feedback > 0 ? "#276b4b" : "#a23b32";
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.85, Math.PI * (0.85 + 1.3 * (pct / 100)));
    ctx.stroke();
    ctx.fillStyle = "#1d2525";
    ctx.font = "42px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText(`${formatValue(pct, 0)}%`, cx, cy + 14);
    ctx.font = "13px Segoe UI";
    ctx.fillStyle = "#697370";
    ctx.fillText("reward windows", cx, cy + 42);
    ctx.textAlign = "left";
  }

  if (windows.length > 1) {
    const x0 = 18;
    const y0 = height - 36;
    const plotW = width - 36;
    ctx.strokeStyle = "#225c8a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    windows.forEach((windowItem, idx) => {
      const x = x0 + (idx / (windows.length - 1)) * plotW;
      const y = y0 - (Number(windowItem.feedback || 0) / 100) * 34;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

function setTrainRunning(isRunning) {
  state.trainRunning = isRunning;
  refs.startTrainBtn.disabled = isRunning;
  refs.stopTrainBtn.disabled = !isRunning;
  refs.runBaselineBtn.disabled = isRunning;
  refs.analyzeProgressBtn.disabled = isRunning;
  for (const element of [
    refs.trainProtocol,
    refs.trainSourceMode,
    refs.trainSeconds,
    refs.trainWindowSeconds,
    refs.trainRewardBand,
  ]) {
    if (element) element.disabled = isRunning;
  }
  refs.trainSerialPort.disabled = isRunning || refs.trainSourceMode.value === "synthetic";
}

async function startTraining() {
  try {
    setTrainRunning(true);
    resetTrainState();
    const ctx = ensureTrainAudio();
    if (ctx?.resume) await ctx.resume().catch(() => undefined);
    refs.runtimeStatus.textContent = "Training...";
    const payload = await window.nfTools.startTrainingSession(buildTrainConfig());
    state.trainOutputPath = payload.outputPath || "";
    if (payload.outputPath) {
      state.progressPaths.push(payload.outputPath);
      state.progressPaths = [...new Set(state.progressPaths)];
      refs.progressSource.textContent = `${state.progressPaths.length} selected file(s).`;
    }
    refs.runtimeStatus.textContent = `Training saved: ${payload.outputPath || "done"}`;
  } catch (err) {
    refs.runtimeStatus.textContent = `Training failed: ${err.message || err}`;
    appendTrainEvent(`Failed: ${err.message || err}`);
  } finally {
    await stopTrainIso();
    setTrainRunning(false);
  }
}

async function stopTraining() {
  await window.nfTools.stop();
  await stopTrainIso();
  appendTrainEvent("Stop signal sent.");
  setTrainRunning(false);
}

function defaultProgram() {
  return clone(BUILTIN_PROGRAMS[0]);
}

function allPrograms() {
  return [...BUILTIN_PROGRAMS.map(clone), ...state.programs.map(clone)];
}

function loadPrograms() {
  const saved = readLocalJson(PROGRAMS_KEY, []);
  state.programs = Array.isArray(saved) ? saved : [];
  state.currentProgram = defaultProgram();
  renderProgramSelect();
  renderProgram();
}

function savePrograms() {
  writeLocalJson(PROGRAMS_KEY, state.programs);
  renderProgramSelect();
}

function saveCurrentProgram() {
  if (!state.currentProgram) return;
  const name = String(refs.programName.value || "").trim() || "Untitled program";
  const program = {
    ...clone(state.currentProgram),
    id: state.currentProgram.readonly ? uid("program") : state.currentProgram.id || uid("program"),
    name,
    readonly: false,
  };
  const index = state.programs.findIndex((item) => item.id === program.id);
  if (index >= 0) state.programs[index] = program;
  else state.programs.push(program);
  state.currentProgram = clone(program);
  savePrograms();
  refs.programSelect.value = program.id;
  renderProgram();
  appendProgramEvent(`Saved program: ${program.name}.`);
}

function deleteCurrentProgram() {
  if (!state.currentProgram || state.currentProgram.readonly) return;
  state.programs = state.programs.filter((program) => program.id !== state.currentProgram.id);
  state.currentProgram = defaultProgram();
  savePrograms();
  renderProgram();
  appendProgramEvent("Deleted program.");
}

function renderProtocolOptions(select, selectedId) {
  select.innerHTML = "";
  for (const protocol of TRAIN_PROTOCOLS) {
    const option = document.createElement("option");
    option.value = protocol.id;
    option.textContent = protocol.label;
    select.appendChild(option);
  }
  select.value = selectedId || TRAIN_PROTOCOLS[0].id;
}

function renderPresetOptions(select, selectedId) {
  select.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Protocol defaults";
  select.appendChild(empty);
  for (const preset of state.trainPresets) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name;
    select.appendChild(option);
  }
  select.value = selectedId || "";
}

function presetById(presetId) {
  return state.trainPresets.find((preset) => preset.id === presetId) || null;
}

function renderProgramSelect() {
  if (!refs.programSelect) return;
  refs.programSelect.innerHTML = "";
  for (const program of allPrograms()) {
    const option = document.createElement("option");
    option.value = program.id;
    option.textContent = program.readonly ? `${program.name} (built-in)` : program.name;
    refs.programSelect.appendChild(option);
  }
  refs.programSelect.value = state.currentProgram?.id || BUILTIN_PROGRAMS[0].id;
}

function setCurrentProgram(program) {
  state.currentProgram = clone(program || defaultProgram());
  refs.programName.value = state.currentProgram.name || "Untitled program";
  renderProgramSelect();
  renderProgram();
}

function stepLabel(step) {
  if (step.label) return step.label;
  if (step.type === "clinicalq") return "ClinicalQ";
  if (step.type === "decision") return "Decision";
  return protocolById(step.protocol_id).label;
}

function updateProgramSummary() {
  if (!state.currentProgram) return;
  const steps = state.currentProgram.steps || [];
  const paths = steps
    .filter((step) => step.type === "decision")
    .flatMap((step) => step.rules || [])
    .length;
  refs.programStepCount.textContent = String(steps.length);
  refs.programPathCount.textContent = String(paths);
  const summary = state.lastClinicalQResult?.summary;
  refs.programLastClinicalQ.textContent = summary ? `${summary.out_of_range || 0} out` : "none";
}

function renderProgram() {
  if (!refs.programStepList || !state.currentProgram) return;
  refs.programName.value = state.currentProgram.name || "";
  refs.deleteProgramBtn.disabled = Boolean(state.currentProgram.readonly);
  refs.programStepList.innerHTML = "";
  (state.currentProgram.steps || []).forEach((step, index) => renderProgramStep(step, index));
  updateProgramSummary();
}

function renderProgramStep(step, index) {
  const card = document.createElement("div");
  card.className = "program-step";

  const head = document.createElement("div");
  head.className = "program-step-head";

  const num = document.createElement("strong");
  num.textContent = String(index + 1);

  const typeLabel = document.createElement("label");
  typeLabel.textContent = "Type";
  const type = document.createElement("select");
  type.innerHTML = `
    <option value="clinicalq">ClinicalQ</option>
    <option value="protocol">Protocol</option>
    <option value="decision">Decision</option>
  `;
  type.value = step.type || "protocol";
  type.addEventListener("change", () => {
    step.type = type.value;
    if (step.type === "decision" && !step.rules) step.rules = clone(DEFAULT_DECISION_RULES);
    if (step.type === "protocol" && !step.protocol_id) step.protocol_id = TRAIN_PROTOCOLS[0].id;
    renderProgram();
  });
  typeLabel.appendChild(type);

  const label = document.createElement("label");
  label.textContent = "Label";
  const labelInput = document.createElement("input");
  labelInput.value = stepLabel(step);
  labelInput.addEventListener("input", () => {
    step.label = labelInput.value;
  });
  label.appendChild(labelInput);

  const up = document.createElement("button");
  up.type = "button";
  up.textContent = "Up";
  up.disabled = index === 0;
  up.addEventListener("click", () => {
    const steps = state.currentProgram.steps;
    [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]];
    renderProgram();
  });

  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "Delete";
  del.addEventListener("click", () => {
    state.currentProgram.steps.splice(index, 1);
    renderProgram();
  });

  head.append(num, typeLabel, label, up, del);
  card.appendChild(head);

  if (step.type === "protocol") {
    const body = document.createElement("div");
    body.className = "program-step-body";
    const presetLabel = document.createElement("label");
    presetLabel.textContent = "Preset";
    const preset = document.createElement("select");
    renderPresetOptions(preset, step.preset_id);
    preset.addEventListener("change", () => {
      step.preset_id = preset.value;
      const found = presetById(preset.value);
      if (found) {
        step.protocol_id = found.protocol_id;
        step.seconds = found.seconds;
        step.label = found.name;
      }
      renderProgram();
    });
    presetLabel.appendChild(preset);

    const protocolLabel = document.createElement("label");
    protocolLabel.textContent = "Protocol";
    const protocol = document.createElement("select");
    renderProtocolOptions(protocol, step.protocol_id);
    protocol.addEventListener("change", () => {
      step.protocol_id = protocol.value;
      step.label = protocolById(protocol.value).label;
      renderProgram();
    });
    protocolLabel.appendChild(protocol);

    const secondsLabel = document.createElement("label");
    secondsLabel.textContent = "Seconds";
    const seconds = document.createElement("input");
    seconds.type = "number";
    seconds.min = "10";
    seconds.max = "3600";
    seconds.value = step.seconds || refs.programTrainSeconds.value || 120;
    seconds.addEventListener("input", () => {
      step.seconds = Number(seconds.value || 120);
    });
    secondsLabel.appendChild(seconds);
    body.append(presetLabel, protocolLabel, secondsLabel);
    card.appendChild(body);
  } else if (step.type === "decision") {
    const rules = document.createElement("div");
    rules.className = "program-rule-list";
    for (const [ruleIndex, rule] of (step.rules || []).entries()) {
      const row = document.createElement("div");
      row.className = "program-rule";

      let matchLabel;
      if (rule.mode === "fallback") {
        matchLabel = document.createElement("div");
        matchLabel.className = "fallback-note";
        matchLabel.innerHTML = "<span>Fallback</span><strong>If no rule matches</strong>";
      } else {
        matchLabel = document.createElement("label");
        matchLabel.textContent = "Match text";
        const match = document.createElement("input");
        match.value = rule.match || "";
        match.placeholder = "O1 theta beta";
        match.addEventListener("input", () => {
          rule.match = match.value;
        });
        matchLabel.appendChild(match);
      }

      const protocolLabel = document.createElement("label");
      protocolLabel.textContent = "Run protocol";
      const protocol = document.createElement("select");
      renderProtocolOptions(protocol, rule.protocol_id);
      protocol.addEventListener("change", () => {
        rule.protocol_id = protocol.value;
      });
      protocolLabel.appendChild(protocol);

      const secondsLabel = document.createElement("label");
      secondsLabel.textContent = "Seconds";
      const seconds = document.createElement("input");
      seconds.type = "number";
      seconds.min = "10";
      seconds.max = "3600";
      seconds.value = rule.seconds || refs.programTrainSeconds.value || 120;
      seconds.addEventListener("input", () => {
        rule.seconds = Number(seconds.value || 120);
      });
      secondsLabel.appendChild(seconds);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => {
        step.rules.splice(ruleIndex, 1);
        renderProgram();
      });
      row.append(matchLabel, protocolLabel, secondsLabel, remove);
      rules.appendChild(row);
    }
    const addRule = document.createElement("button");
    addRule.type = "button";
    addRule.textContent = "Add Rule";
    addRule.addEventListener("click", () => {
      step.rules = step.rules || [];
      step.rules.push({ mode: "match", match: "", protocol_id: TRAIN_PROTOCOLS[0].id, seconds: Number(refs.programTrainSeconds.value || 120) });
      renderProgram();
    });
    const addFallback = document.createElement("button");
    addFallback.type = "button";
    addFallback.textContent = "Add Fallback";
    addFallback.addEventListener("click", () => {
      step.rules = step.rules || [];
      step.rules.push({ mode: "fallback", match: "", protocol_id: TRAIN_PROTOCOLS[0].id, seconds: Number(refs.programTrainSeconds.value || 120) });
      renderProgram();
    });
    card.append(rules, addRule, addFallback);
  }

  refs.programStepList.appendChild(card);
}

function appendProgramEvent(text) {
  if (!refs.programEventLog) return;
  const row = document.createElement("div");
  row.className = "train-event";
  row.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  refs.programEventLog.prepend(row);
}

function addProgramStep(type) {
  state.currentProgram.steps = state.currentProgram.steps || [];
  if (type === "clinicalq") {
    state.currentProgram.steps.push({ type: "clinicalq", label: "ClinicalQ" });
  } else if (type === "decision") {
    state.currentProgram.steps.push({ type: "decision", label: "ClinicalQ decision", rules: clone(DEFAULT_DECISION_RULES) });
  } else {
    state.currentProgram.steps.push({
      type: "protocol",
      label: protocolById(refs.trainProtocol.value).label,
      protocol_id: refs.trainProtocol.value,
      seconds: Number(refs.programTrainSeconds.value || refs.trainSeconds.value || 120),
    });
  }
  renderProgram();
}

function buildProgramClinicalQConfig() {
  const channels = { Cz: 1, O1: 2, Fz: 3, F3: 4, F4: 5 };
  return {
    ...sessionMetadataConfig(),
    mode: "simultaneous",
    epoch_seconds: Number(refs.programClinicalQSeconds.value || 60),
    reposition_seconds: 0,
    sampling_rate: 250,
    fast_mode: refs.programSourceMode.value === "synthetic",
    live_bandpower: true,
    include_frontal_baseline: true,
    selected_locations: ["O1", "Cz", "Fz", "F3", "F4"],
    sound_probes: [],
    filters: { ...DEFAULT_EEG_FILTERS },
    board: {
      board_id: refs.programSourceMode.value === "synthetic" ? "synthetic" : "cyton",
      serial_port: refs.programSerialPort.value || "COM3",
      use_synthetic: refs.programSourceMode.value === "synthetic",
      available_channels: Object.values(channels),
      seed: 42,
    },
    channels,
  };
}

function buildProtocolConfig(protocolId, seconds, presetId = "") {
  const preset = presetById(presetId);
  const protocol = protocolById(preset?.protocol_id || protocolId);
  const channels = preset?.channels || protocol.channels;
  return {
    ...sessionMetadataConfig(),
    protocol_id: protocol.id,
    total_seconds: Number(seconds || preset?.seconds || refs.programTrainSeconds.value || 120),
    window_seconds: Number(preset?.window_seconds || refs.trainWindowSeconds.value || 1),
    sampling_rate: 250,
    fast_mode: refs.programSourceMode.value === "synthetic",
    condition: "NF",
    filters: { ...DEFAULT_EEG_FILTERS },
    reward_band: preset?.reward_band || refs.trainRewardBand.value || "alpha",
    thresholds: preset?.thresholds || currentThresholds(),
    board: {
      board_id: refs.programSourceMode.value === "synthetic" ? "synthetic" : "cyton",
      serial_port: refs.programSerialPort.value || "COM3",
      use_synthetic: refs.programSourceMode.value === "synthetic",
      available_channels: Object.values(channels),
      seed: 42,
    },
    channels,
  };
}

function clinicalQHaystack(metric) {
  return [
    metric.location,
    metric.metric,
    metric.status,
    metric.probe,
    metric.normal_range,
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

function ruleMatchesClinicalQ(rule, result) {
  const tokens = String(rule.match || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return false;
  return (result?.metrics || []).some((metric) => {
    if (!String(metric.status || "").toUpperCase().includes("OUT")) return false;
    const haystack = clinicalQHaystack(metric);
    return tokens.every((token) => haystack.includes(token));
  });
}

function decisionProtocols(step, result) {
  const rules = step.rules || [];
  const matches = rules.filter((rule) => rule.mode !== "fallback" && ruleMatchesClinicalQ(rule, result));
  return matches.length ? matches : rules.filter((rule) => rule.mode === "fallback");
}

function setProgramRunning(isRunning) {
  state.programRunning = isRunning;
  refs.runProgramBtn.disabled = isRunning;
  refs.stopProgramBtn.disabled = !isRunning;
  refs.startTrainBtn.disabled = isRunning;
  refs.runBaselineBtn.disabled = isRunning;
  refs.analyzeProgressBtn.disabled = isRunning;
}

async function runProgramProtocol(protocolId, seconds, presetId = "") {
  const preset = presetById(presetId);
  const protocol = protocolById(preset?.protocol_id || protocolId);
  appendProgramEvent(`Training: ${preset?.name || protocol.label}.`);
  const payload = await window.nfTools.startTrainingSession(buildProtocolConfig(protocol.id, seconds, presetId));
  if (payload.outputPath) state.progressPaths.push(payload.outputPath);
  appendProgramEvent(`Saved training: ${payload.outputPath || "done"}.`);
  return payload;
}

async function runProgramClinicalQ(label) {
  appendProgramEvent(`${label || "ClinicalQ"} running.`);
  const payload = await window.nfTools.startClinicalQSession(buildProgramClinicalQConfig());
  state.lastClinicalQResult = payload.result;
  if (payload.outputPath) state.progressPaths.push(payload.outputPath);
  appendProgramEvent(`${label || "ClinicalQ"} saved: ${payload.outputPath || "done"}.`);
  updateProgramSummary();
  return payload;
}

async function runProgram() {
  if (!state.currentProgram || state.programRunning) return;
  state.programStopRequested = false;
  setProgramRunning(true);
  refs.runtimeStatus.textContent = `Program running: ${state.currentProgram.name}`;
  appendProgramEvent(`Started ${state.currentProgram.name}.`);
  try {
    for (const step of state.currentProgram.steps || []) {
      if (state.programStopRequested) break;
      if (step.type === "clinicalq") {
        await runProgramClinicalQ(stepLabel(step));
      } else if (step.type === "decision") {
        const rules = decisionProtocols(step, state.lastClinicalQResult);
        appendProgramEvent(rules.length ? `Decision selected ${rules.length} path(s).` : "Decision selected no paths.");
        for (const rule of rules) {
          if (state.programStopRequested) break;
          await runProgramProtocol(rule.protocol_id, rule.seconds || refs.programTrainSeconds.value);
        }
      } else {
        await runProgramProtocol(step.protocol_id, step.seconds || refs.programTrainSeconds.value, step.preset_id);
      }
    }
    state.progressPaths = [...new Set(state.progressPaths)];
    refs.progressSource.textContent = `${state.progressPaths.length} selected file(s).`;
    refs.runtimeStatus.textContent = state.programStopRequested ? "Program stopped." : "Program complete.";
    appendProgramEvent(state.programStopRequested ? "Stopped." : "Complete.");
  } catch (err) {
    refs.runtimeStatus.textContent = `Program failed: ${err.message || err}`;
    appendProgramEvent(`Failed: ${err.message || err}`);
  } finally {
    setProgramRunning(false);
    updateProgramSummary();
  }
}

async function stopProgram() {
  state.programStopRequested = true;
  await window.nfTools.stop();
  setProgramRunning(false);
  appendProgramEvent("Stop signal sent.");
}

function updateProgressSummary() {
  if (!refs.progressSummary) return;
  const cells = [...refs.progressSummary.querySelectorAll("div")];
  const result = state.progressResult;
  const sessions = result?.sessions || [];
  const latestDate = sessions.length ? displayDate(sessions[sessions.length - 1].date) : "-";
  const values = [sessions.length, result?.metrics?.length || 0, state.selectedMetrics.size, latestDate];
  cells.forEach((cell, idx) => {
    const span = cell.querySelector("span");
    if (span) span.textContent = String(values[idx] ?? "-");
  });
}

function renderMetricList() {
  const query = String(refs.metricSearch.value || "").trim().toLowerCase();
  const metrics = state.progressResult?.metrics || [];
  refs.metricList.innerHTML = "";
  for (const metric of metrics) {
    const haystack = `${metric.label} ${metric.key} ${metric.source}`.toLowerCase();
    if (query && !haystack.includes(query)) continue;
    const row = document.createElement("label");
    row.className = "metric-item";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = state.selectedMetrics.has(metric.key);
    input.addEventListener("change", () => {
      if (input.checked) state.selectedMetrics.add(metric.key);
      else state.selectedMetrics.delete(metric.key);
      updateProgressSummary();
      drawProgress();
      renderProgressTable();
    });
    const name = document.createElement("div");
    name.className = "metric-name";
    name.textContent = metric.label || metric.key;
    const count = document.createElement("div");
    count.className = "metric-count";
    count.textContent = String(metric.count || 0);
    row.appendChild(input);
    row.appendChild(name);
    row.appendChild(count);
    refs.metricList.appendChild(row);
  }
}

function selectDefaultMetrics() {
  state.selectedMetrics.clear();
  const metrics = state.progressResult?.metrics || [];
  const preferred = metrics.filter((metric) => Number(metric.count || 0) > 1).slice(0, 5);
  const fallback = metrics.slice(0, 5);
  for (const metric of (preferred.length ? preferred : fallback)) {
    state.selectedMetrics.add(metric.key);
  }
  updateProgressSummary();
}

function pointValue(point) {
  if (refs.plotZscores.checked && Number.isFinite(Number(point.zscore))) return Number(point.zscore);
  return Number(point.value);
}

function drawProgress() {
  const result = state.progressResult;
  const selected = [...state.selectedMetrics];
  if (!result || !selected.length) {
    clearCanvas(refs.progressCanvas, "No metrics selected.");
    return;
  }

  const series = selected
    .map((key) => ({ key, points: result.series?.[key] || [] }))
    .filter((item) => item.points.length);
  const values = series.flatMap((item) => item.points.map(pointValue)).filter(Number.isFinite);
  if (!values.length) {
    clearCanvas(refs.progressCanvas, "No numeric points.");
    return;
  }

  const { ctx, width, height } = setupCanvas(refs.progressCanvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfb";
  ctx.fillRect(0, 0, width, height);

  const margin = { left: 58, right: 22, top: 20, bottom: 58 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  let minVal = Math.min(...values);
  let maxVal = Math.max(...values);
  if (refs.plotZscores.checked) {
    minVal = Math.min(minVal, -2);
    maxVal = Math.max(maxVal, 2);
  }
  if (Math.abs(maxVal - minVal) < 0.001) {
    maxVal += 1;
    minVal -= 1;
  }
  const scaleY = (value) => margin.top + plotH - ((value - minVal) / (maxVal - minVal)) * plotH;

  const sessions = result.sessions || [];
  const xForDate = (date) => {
    const idx = sessions.findIndex((session) => session.date === date);
    if (sessions.length <= 1) return margin.left + plotW / 2;
    return margin.left + (Math.max(0, idx) / (sessions.length - 1)) * plotW;
  };

  ctx.strokeStyle = "#d7ddd7";
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + plotH);
  ctx.lineTo(margin.left + plotW, margin.top + plotH);
  ctx.stroke();

  ctx.font = "11px Segoe UI";
  ctx.fillStyle = "#697370";
  for (let i = 0; i <= 4; i += 1) {
    const value = minVal + ((maxVal - minVal) * i) / 4;
    const y = scaleY(value);
    ctx.fillText(formatValue(value, refs.plotZscores.checked ? 1 : 2), 10, y + 4);
    ctx.strokeStyle = "#edf0ed";
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + plotW, y);
    ctx.stroke();
  }

  if (refs.plotZscores.checked) {
    for (const z of [-2, 0, 2]) {
      const y = scaleY(z);
      ctx.strokeStyle = z === 0 ? "#9ba79f" : "#d9b0aa";
      ctx.setLineDash(z === 0 ? [] : [5, 4]);
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + plotW, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  series.forEach((item, idx) => {
    const color = COLORS[idx % COLORS.length];
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    item.points.forEach((point, pointIndex) => {
      const x = xForDate(point.date);
      const y = scaleY(pointValue(point));
      if (pointIndex === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    item.points.forEach((point) => {
      const x = xForDate(point.date);
      const y = scaleY(pointValue(point));
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  const step = Math.max(1, Math.ceil((result.sessions || []).length / 6));
  (result.sessions || []).forEach((session, idx) => {
    if (idx % step !== 0 && idx !== result.sessions.length - 1) return;
    const x = xForDate(session.date);
    ctx.fillStyle = "#697370";
    ctx.save();
    ctx.translate(x - 4, height - 16);
    ctx.rotate(-0.5);
    ctx.fillText(displayDate(session.date), 0, 0);
    ctx.restore();
  });

  selected.slice(0, 6).forEach((key, idx) => {
    const metric = (result.metrics || []).find((item) => item.key === key);
    const x = margin.left + idx * 150;
    ctx.fillStyle = COLORS[idx % COLORS.length];
    ctx.fillRect(x, 8, 10, 8);
    ctx.fillStyle = "#37413d";
    ctx.fillText((metric?.label || key).slice(0, 22), x + 14, 16);
  });
}

function statusBadge(status) {
  const raw = String(status || "").toUpperCase();
  const span = document.createElement("span");
  if (raw.includes("IN")) {
    span.className = "badge in";
    span.textContent = "IN";
  } else if (raw.includes("OUT")) {
    span.className = "badge out";
    span.textContent = "OUT";
  } else if (raw) {
    span.className = "badge missing";
    span.textContent = raw.slice(0, 8);
  } else {
    span.textContent = "-";
  }
  return span;
}

function renderProgressTable() {
  refs.progressTableBody.innerHTML = "";
  const result = state.progressResult;
  if (!result) return;
  const metricMap = new Map((result.metrics || []).map((metric) => [metric.key, metric]));
  const rows = [];
  for (const key of state.selectedMetrics) {
    const metric = metricMap.get(key);
    for (const point of result.series?.[key] || []) {
      rows.push({ key, metric, point });
    }
  }
  rows.sort((a, b) => String(a.point.date).localeCompare(String(b.point.date)));
  for (const row of rows.slice(-200)) {
    const tr = document.createElement("tr");
    const date = document.createElement("td");
    date.textContent = displayDate(row.point.date);
    const metric = document.createElement("td");
    metric.textContent = row.metric?.label || row.key;
    const value = document.createElement("td");
    value.textContent = formatValue(pointValue(row.point), refs.plotZscores.checked ? 2 : 3);
    const status = document.createElement("td");
    status.appendChild(statusBadge(row.point.status));
    const source = document.createElement("td");
    source.textContent = row.point.title || "";
    tr.appendChild(date);
    tr.appendChild(metric);
    tr.appendChild(value);
    tr.appendChild(status);
    tr.appendChild(source);
    refs.progressTableBody.appendChild(tr);
  }
}

async function chooseProgressFiles() {
  const picked = await window.nfTools.openProgressFiles();
  if (!picked || picked.canceled) return;
  state.progressPaths.push(...(picked.filePaths || []));
  state.progressPaths = [...new Set(state.progressPaths)];
  refs.progressSource.textContent = `${state.progressPaths.length} selected file(s).`;
}

async function chooseProgressDirectory() {
  const picked = await window.nfTools.openProgressDirectory();
  if (!picked || picked.canceled) return;
  state.progressPaths.push(picked.directoryPath);
  state.progressPaths = [...new Set(state.progressPaths)];
  refs.progressSource.textContent = `${state.progressPaths.length} selected path(s).`;
}

async function useProfileSessions() {
  const payload = await window.nfTools.listSessions(refs.profileSelect?.value || state.activeProfileId);
  const paths = (payload.sessions || []).map((session) => session.output_path).filter(Boolean);
  state.progressPaths.push(...paths);
  state.progressPaths = [...new Set(state.progressPaths)];
  refs.progressSource.textContent = `${state.progressPaths.length} profile/result path(s).`;
}

async function analyzeProgress() {
  try {
    setBusy(true, "Analyzing progress...");
    const payload = await window.nfTools.analyzeProgress({
      paths: state.progressPaths,
      include_default_brainbay_dir: Boolean(refs.includeBrainbayLogs.checked),
    });
    state.progressResult = payload.result;
    selectDefaultMetrics();
    renderMetricList();
    updateProgressSummary();
    drawProgress();
    renderProgressTable();
    refs.progressSource.textContent = `${payload.result.sessions?.length || 0} session file(s), ${payload.result.metrics?.length || 0} metrics.`;
    refs.runtimeStatus.textContent = `Progress saved: ${payload.outputPath || "done"}`;
  } catch (err) {
    refs.runtimeStatus.textContent = `Progress failed: ${err.message || err}`;
  } finally {
    setBusy(false);
  }
}

function switchView(view) {
  refs.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  refs.baselineView.classList.toggle("active", view === "baseline");
  refs.trainView.classList.toggle("active", view === "train");
  refs.programsView.classList.toggle("active", view === "programs");
  refs.progressView.classList.toggle("active", view === "progress");
  drawBaseline(state.baselineResult);
  drawTrainFeedback();
  drawProgress();
}

window.nfTools.onSessionEvent((event) => {
  if (event.event === "baseline_tick") {
    refs.runtimeStatus.textContent = `Baseline: ${event.seconds_remaining}s remaining`;
  } else if (event.event === "nf_training_start") {
    state.trainHeaders = event.headers || [];
    refs.runtimeStatus.textContent = `Training: ${event.protocol_label || event.protocol_id}`;
    appendTrainEvent(`Started ${event.protocol_label || event.protocol_id}.`);
  } else if (event.event === "nf_training_window") {
    const values = event.values || {};
    const feedback = Number(event.feedback || values.feedback || 0);
    state.trainLastValues = values;
    state.trainWindows.push({ feedback, values, elapsed_seconds: event.elapsed_seconds });
    if (feedback > 0) {
      state.trainRewardWindows += 1;
      state.trainStreak += 1;
    } else {
      state.trainStreak = 0;
    }
    updateTrainStats(feedback);
    renderTrainMetrics();
    drawTrainFeedback();
    handleTrainAudio(values, feedback).catch(() => {});
  } else if (event.event === "nf_training_complete") {
    refs.runtimeStatus.textContent = `Training complete: ${formatValue(event.reward_percent, 0)}% reward.`;
    appendTrainEvent(`Complete: ${formatValue(event.reward_percent, 0)}% reward.`);
    stopTrainIso().catch(() => {});
  } else if (event.event === "runner_spawned") {
    refs.runtimeStatus.textContent = `${event.runKind || "session"} running...`;
  } else if (event.event === "error") {
    refs.runtimeStatus.textContent = `Error: ${event.message}`;
  }
});

refs.tabs.forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
refs.launcherBtn.addEventListener("click", () => window.nfTools.openApplet("launcher"));
refs.electrodeCount.addEventListener("change", renderElectrodes);
refs.sourceMode.addEventListener("change", () => {
  refs.serialPort.disabled = refs.sourceMode.value === "synthetic";
});
refs.baselineCondition.addEventListener("change", syncConditionNormHint);
refs.baselineNorms.addEventListener("change", syncBaselineNormControls);
refs.baselineZMode.addEventListener("change", syncBaselineNormControls);
refs.trainProtocol.addEventListener("change", () => {
  renderTrainChannels();
  renderProtocolCards();
});
refs.browseProtocolBtn.addEventListener("click", () => {
  renderProtocolCards();
  refs.protocolDialog?.showModal();
});
refs.closeProtocolDialogBtn.addEventListener("click", () => refs.protocolDialog?.close());
refs.trainPresetSelect.addEventListener("change", () => {
  const preset = state.trainPresets.find((item) => item.id === refs.trainPresetSelect.value);
  if (preset) applyTrainPreset(preset);
});
refs.saveTrainPresetBtn.addEventListener("click", () => {
  const name = window.prompt("Preset name", currentTrainProtocol().label);
  if (!name) return;
  const preset = captureTrainPreset(name.trim());
  state.trainPresets.push(preset);
  saveTrainPresets();
  refs.trainPresetSelect.value = preset.id;
  refs.runtimeStatus.textContent = `Preset saved: ${preset.name}`;
});
refs.deleteTrainPresetBtn.addEventListener("click", () => {
  const id = refs.trainPresetSelect.value;
  if (!id) return;
  state.trainPresets = state.trainPresets.filter((preset) => preset.id !== id);
  saveTrainPresets();
  refs.runtimeStatus.textContent = "Preset deleted.";
});
refs.trainSourceMode.addEventListener("change", () => {
  refs.trainSerialPort.disabled = refs.trainSourceMode.value === "synthetic" || state.trainRunning;
});
refs.programSourceMode.addEventListener("change", () => {
  refs.programSerialPort.disabled = refs.programSourceMode.value === "synthetic" || state.programRunning;
});
refs.programSelect.addEventListener("change", () => {
  const program = allPrograms().find((item) => item.id === refs.programSelect.value);
  setCurrentProgram(program);
});
refs.programName.addEventListener("input", () => {
  if (state.currentProgram) state.currentProgram.name = refs.programName.value;
});
refs.saveProgramBtn.addEventListener("click", saveCurrentProgram);
refs.deleteProgramBtn.addEventListener("click", deleteCurrentProgram);
refs.runProgramBtn.addEventListener("click", runProgram);
refs.stopProgramBtn.addEventListener("click", stopProgram);
refs.addClinicalQStepBtn.addEventListener("click", () => addProgramStep("clinicalq"));
refs.addProtocolStepBtn.addEventListener("click", () => addProgramStep("protocol"));
refs.addDecisionStepBtn.addEventListener("click", () => addProgramStep("decision"));
refs.startTrainBtn.addEventListener("click", startTraining);
refs.stopTrainBtn.addEventListener("click", stopTraining);
refs.visualFeedbackMode.addEventListener("change", drawTrainFeedback);
if (refs.profileSelect) {
  refs.profileSelect.addEventListener("change", async () => {
    state.activeProfileId = refs.profileSelect.value;
    await window.nfTools.setActiveProfile(refs.profileSelect.value);
  });
}
refs.runBaselineBtn.addEventListener("click", runBaseline);
refs.chooseProgressFilesBtn.addEventListener("click", chooseProgressFiles);
refs.chooseProgressDirBtn.addEventListener("click", chooseProgressDirectory);
refs.useProfileSessionsBtn.addEventListener("click", useProfileSessions);
refs.analyzeProgressBtn.addEventListener("click", analyzeProgress);
refs.metricSearch.addEventListener("input", renderMetricList);
refs.plotZscores.addEventListener("change", () => {
  drawProgress();
  renderProgressTable();
});
window.addEventListener("resize", () => {
  drawBaseline(state.baselineResult);
  drawTrainFeedback();
  drawProgress();
});

renderElectrodes();
renderTrainProtocols();
renderTrainChannels();
renderProtocolCards();
loadTrainPresets();
loadPrograms();
refs.serialPort.disabled = true;
refs.trainSerialPort.disabled = true;
refs.programSerialPort.disabled = true;
syncBaselineNormControls();
clearCanvas(refs.baselineCanvas, "No baseline result.");
clearCanvas(refs.trainFeedbackCanvas, "No training session.");
clearCanvas(refs.progressCanvas, "No progress result.");
updateProgressSummary();

loadProfiles().catch((err) => {
  refs.runtimeStatus.textContent = `Profile load failed: ${err.message || err}`;
});

window.nfTools
  .checkPython()
  .then((result) => {
    refs.runtimeStatus.textContent = result.ok ? `${result.message} | ${result.python}` : result.message;
  })
  .catch((err) => {
    refs.runtimeStatus.textContent = `Runtime check failed: ${err.message || err}`;
  });
