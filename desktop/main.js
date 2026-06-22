const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const readline = require("readline");

let mainWindow = null;
let activeRun = null;
let plannerWindow = null;

function clinicalqModeEnabled() {
  return process.argv.includes("--clinicalq");
}

function plannerModeEnabled() {
  return process.argv.includes("--planner");
}

function nfModeEnabled() {
  return process.argv.includes("--nf");
}

function disentrainmentModeEnabled() {
  return process.argv.includes("--disentrainment");
}

function offsetFinderModeEnabled() {
  return process.argv.includes("--offset-finder");
}

function launcherModeEnabled() {
  return process.argv.includes("--launcher");
}

function backendDir() {
  return path.resolve(__dirname, "..", "backend");
}

function backendPythonEnv() {
  const env = { ...process.env };
  const pyPath = backendDir();
  env.PYTHONPATH = env.PYTHONPATH ? `${pyPath}${path.delimiter}${env.PYTHONPATH}` : pyPath;
  return env;
}

function pythonCandidates() {
  const override = (process.env.CLINICALQ_PYTHON || "").trim();
  if (override) {
    return [{ command: override, preArgs: [], label: override }];
  }

  if (process.platform === "win32") {
    return [
      { command: "python", preArgs: [], label: "python" },
      { command: "py", preArgs: ["-3"], label: "py -3" },
    ];
  }

  return [
    { command: "python3", preArgs: [], label: "python3" },
    { command: "python", preArgs: [], label: "python" },
  ];
}

function summarizeProcessOutput(out) {
  const raw = out.stderr?.trim() || out.stdout?.trim() || `exit code ${out.status ?? "unknown"}`;
  return raw.replace(/\s+/g, " ");
}

function resolvePythonRuntime({ requireBackendImports = false } = {}) {
  const failures = [];

  for (const candidate of pythonCandidates()) {
    const versionOut = spawnSync(candidate.command, [...candidate.preArgs, "--version"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (versionOut.status !== 0) {
      failures.push(`${candidate.label}: ${summarizeProcessOutput(versionOut)}`);
      continue;
    }

    const version = versionOut.stdout?.trim() || versionOut.stderr?.trim() || "Python detected.";
    if (!requireBackendImports) {
      return { ...candidate, version };
    }

    const importOut = spawnSync(
      candidate.command,
      [...candidate.preArgs, "-c", "import numpy; import clinicalq_backend.cli"],
      {
        cwd: backendDir(),
        env: backendPythonEnv(),
        encoding: "utf8",
        windowsHide: true,
      }
    );
    if (importOut.status !== 0) {
      failures.push(`${candidate.label} imports: ${summarizeProcessOutput(importOut)}`);
      continue;
    }

    return { ...candidate, version };
  }

  const details = failures.length ? ` ${failures.join(" | ")}` : "";
  throw new Error(`Unable to find a usable Python runtime.${details}`);
}

function sendEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("session-event", payload);
  }
}

function parseJsonWithFallback(raw, sourceLabel) {
  try {
    return JSON.parse(raw);
  } catch {
    const normalized = raw.replace(/\b-?Infinity\b/g, "null").replace(/\bNaN\b/g, "null");
    try {
      return JSON.parse(normalized);
    } catch (err) {
      throw new Error(`Invalid JSON in ${sourceLabel}: ${err?.message || String(err)}`);
    }
  }
}

function createPlannerWindow() {
  if (plannerWindow && !plannerWindow.isDestroyed()) {
    plannerWindow.focus();
    return plannerWindow;
  }

  plannerWindow = new BrowserWindow({
    width: 1220,
    height: 880,
    minWidth: 980,
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  plannerWindow.loadFile(path.join(__dirname, "planner.html"));
  plannerWindow.on("closed", () => {
    plannerWindow = null;
  });
  return plannerWindow;
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return parseJsonWithFallback(fs.readFileSync(filePath, "utf8"), filePath);
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function slugify(value) {
  const raw = String(value || "").trim().toLowerCase();
  const slug = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "profile";
}

function profileStoreDir() {
  return path.join(app.getPath("userData"), "profiles");
}

function profileIndexPath() {
  return path.join(profileStoreDir(), "profiles.json");
}

function profileStatePath() {
  return path.join(profileStoreDir(), "state.json");
}

function sessionsIndexPath() {
  return path.join(app.getPath("userData"), "sessions.json");
}

function ensureProfileStore() {
  fs.mkdirSync(profileStoreDir(), { recursive: true });
  const index = readJsonFile(profileIndexPath(), null);
  if (index && Array.isArray(index.profiles) && index.profiles.length) return index;

  const now = new Date().toISOString();
  const created = {
    profiles: [
      {
        id: "default",
        name: "Default Profile",
        created_at: now,
        updated_at: now,
        notes: "",
      },
    ],
  };
  writeJsonFile(profileIndexPath(), created);
  writeJsonFile(profileStatePath(), { active_profile_id: "default" });
  return created;
}

function listProfiles() {
  const index = ensureProfileStore();
  const state = readJsonFile(profileStatePath(), { active_profile_id: "default" });
  return { profiles: index.profiles, activeProfileId: state.active_profile_id || "default" };
}

function getProfile(profileId) {
  const { profiles } = listProfiles();
  return profiles.find((profile) => profile.id === profileId) || profiles[0];
}

function createProfile(input) {
  const name = String(input?.name || "").trim();
  if (!name) throw new Error("Profile name is required.");
  const index = ensureProfileStore();
  const base = slugify(name);
  let id = base;
  let suffix = 2;
  while (index.profiles.some((profile) => profile.id === id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  const now = new Date().toISOString();
  const profile = { id, name, created_at: now, updated_at: now, notes: String(input?.notes || "") };
  index.profiles.push(profile);
  writeJsonFile(profileIndexPath(), index);
  writeJsonFile(profileStatePath(), { active_profile_id: id });
  return { profile, ...listProfiles() };
}

function setActiveProfile(profileId) {
  const profile = getProfile(profileId);
  writeJsonFile(profileStatePath(), { active_profile_id: profile.id });
  return { profile, ...listProfiles() };
}

function listSessions(profileId = null) {
  const index = readJsonFile(sessionsIndexPath(), { sessions: [] });
  const sessions = Array.isArray(index.sessions) ? index.sessions : [];
  return profileId ? sessions.filter((session) => session.profile_id === profileId) : sessions;
}

function normalizeTags(rawTags) {
  if (Array.isArray(rawTags)) {
    return rawTags.map((tag) => String(tag).trim()).filter(Boolean);
  }
  return String(rawTags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function profilePayloadFromConfig(config) {
  const profileId = config?.profile?.id || config?.profile_id || listProfiles().activeProfileId;
  const profile = getProfile(profileId);
  return { id: profile.id, name: profile.name };
}

function registerSession(record) {
  const index = readJsonFile(sessionsIndexPath(), { sessions: [] });
  const sessions = Array.isArray(index.sessions) ? index.sessions.filter((item) => item.id !== record.id) : [];
  sessions.unshift(record);
  writeJsonFile(sessionsIndexPath(), { sessions });
  return record;
}

function readSessionPayload(sessionId) {
  const session = listSessions().find((item) => item.id === sessionId);
  if (!session) throw new Error("Session not found.");
  if (!session.output_path || !fs.existsSync(session.output_path)) {
    return { session, result: null };
  }
  return {
    session,
    result: parseJsonWithFallback(fs.readFileSync(session.output_path, "utf8"), session.output_path),
  };
}

function saveDisentrainmentSessionSummary(input = {}) {
  const profile = profilePayloadFromConfig(input);
  const now = new Date().toISOString();
  const runId = `disentrainment-summary-${Date.now()}`;
  const runDir = path.join(app.getPath("userData"), "runs", runId);
  fs.mkdirSync(runDir, { recursive: true });
  const outputPath = path.join(runDir, "disentrainment-session-summary.json");
  const preRows = Array.isArray(input.preRows) ? input.preRows : [];
  const postRows = Array.isArray(input.postRows) ? input.postRows : [];
  const siteProgress = input.siteProgress && typeof input.siteProgress === "object" ? input.siteProgress : {};
  const siteOrder = preRows
    .slice()
    .sort((a, b) => Number(a.dominant_frequency_amplitude ?? a.amplitude_sum) - Number(b.dominant_frequency_amplitude ?? b.amplitude_sum))
    .map((row) => row.location)
    .filter(Boolean);
  const payload = {
    schema_version: 1,
    run_kind: "disentrainment-summary",
    profile,
    profile_id: profile.id,
    profile_name: profile.name,
    created_at: now,
    selected_site: input.selectedSite || null,
    selected_band: input.selectedBand || "delta",
    tags: normalizeTags(input.tags),
    notes: String(input.notes || ""),
    preRows,
    postRows,
    offsetResults: Array.isArray(input.offsetResults) ? input.offsetResults : [],
    siteProgress,
  };
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
  const completedSites = Object.entries(siteProgress).filter(([, status]) => status?.post || status?.entrained).length;
  const record = registerSession({
    id: runId,
    run_kind: "disentrainment-summary",
    applet: "disentrainment",
    profile_id: profile.id,
    profile_name: profile.name,
    tags: payload.tags,
    notes: payload.notes,
    created_at: now,
    output_path: outputPath,
    summary: {
      site_count: new Set([...preRows, ...postRows].map((row) => row.location).filter(Boolean)).size,
      pre_count: preRows.length,
      post_count: postRows.length,
      entrained_count: completedSites,
      site_order: siteOrder,
      selected_band: payload.selected_band,
    },
  });
  return { session: record, outputPath, result: payload };
}

function createNfWindow() {
  mainWindow = new BrowserWindow({
    width: 1260,
    height: 860,
    minWidth: 980,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "nf.html"));
  return mainWindow;
}

function createDisentrainmentWindow() {
  mainWindow = new BrowserWindow({
    width: 1260,
    height: 860,
    minWidth: 980,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "disentrainment.html"));
  return mainWindow;
}

function createOffsetFinderWindow() {
  const win = createDisentrainmentWindow();
  win.loadFile(path.join(__dirname, "disentrainment.html"), { hash: "offset" });
  return win;
}

function createClinicalQWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1120,
    minHeight: 760,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  return mainWindow;
}

function createLauncherWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "launcher.html"));
  return mainWindow;
}

function loadApplet(applet) {
  const target = String(applet || "launcher").toLowerCase();
  if (!mainWindow || mainWindow.isDestroyed()) createLauncherWindow();
  if (target === "clinicalq") {
    mainWindow.setSize(1360, 900);
    mainWindow.loadFile(path.join(__dirname, "index.html"));
    return { ok: true, applet: target };
  }
  if (target === "nf") {
    mainWindow.setSize(1260, 860);
    mainWindow.loadFile(path.join(__dirname, "nf.html"));
    return { ok: true, applet: target };
  }
  if (target === "disentrainment") {
    mainWindow.setSize(1260, 860);
    mainWindow.loadFile(path.join(__dirname, "disentrainment.html"));
    return { ok: true, applet: target };
  }
  if (target === "offset-finder") {
    mainWindow.setSize(1260, 860);
    mainWindow.loadFile(path.join(__dirname, "disentrainment.html"), { hash: "offset" });
    return { ok: true, applet: target };
  }
  if (target === "planner") {
    createPlannerWindow();
    return { ok: true, applet: target };
  }
  mainWindow.setSize(1180, 760);
  mainWindow.loadFile(path.join(__dirname, "launcher.html"));
  return { ok: true, applet: "launcher" };
}

function createWindow() {
  if (plannerModeEnabled()) {
    mainWindow = createPlannerWindow();
    return;
  }

  if (nfModeEnabled()) {
    createNfWindow();
    return;
  }

  if (offsetFinderModeEnabled()) {
    createOffsetFinderWindow();
    return;
  }

  if (disentrainmentModeEnabled()) {
    createDisentrainmentWindow();
    return;
  }

  if (clinicalqModeEnabled()) {
    createClinicalQWindow();
    return;
  }

  createLauncherWindow();
}

function stopActiveRun(stopEventName = "session_stopped") {
  if (!activeRun || !activeRun.child || activeRun.child.killed) return { stopped: false, reason: "No active session." };
  activeRun.child.kill("SIGTERM");
  sendEvent({ event: stopEventName });
  return { stopped: true };
}

async function runBackendCli({
  config,
  subcommand,
  configFileName,
  outputFileName,
  runKind = "clinicalq",
}) {
  if (activeRun) {
    throw new Error("A session is already running.");
  }

  const runId = `${runKind}-${Date.now()}`;
  const runDir = path.join(app.getPath("userData"), "runs", runId);
  fs.mkdirSync(runDir, { recursive: true });

  const configPath = path.join(runDir, configFileName);
  const outputPath = path.join(runDir, outputFileName);
  const profile = profilePayloadFromConfig(config || {});
  const tags = normalizeTags(config?.tags || config?.session_tags);
  const notes = String(config?.notes || "");
  const shouldRecordRaw = ["clinicalq", "baseline", "disentrainment"].includes(runKind);
  const rawRecordingPath = shouldRecordRaw ? path.join(runDir, "raw-eeg.npz") : null;
  const enrichedConfig = {
    ...config,
    session_id: runId,
    profile,
    profile_id: profile.id,
    tags,
    notes,
  };
  if (shouldRecordRaw) {
    enrichedConfig.record_raw_eeg = config?.record_raw_eeg !== false;
    enrichedConfig.raw_recording_path = rawRecordingPath;
  }
  fs.writeFileSync(configPath, JSON.stringify(enrichedConfig, null, 2), "utf8");

  const runtime = resolvePythonRuntime({ requireBackendImports: true });
  const env = backendPythonEnv();

  const child = spawn(
    runtime.command,
    [...runtime.preArgs, "-m", "clinicalq_backend.cli", subcommand, "--config", configPath, "--output", outputPath],
    {
      cwd: backendDir(),
      env,
      windowsHide: true,
    }
  );

  const stderrLines = [];
  let backendError = "";

  activeRun = { child, runId, outputPath, runKind };
  sendEvent({ event: "runner_spawned", runId, outputPath, runKind });

  const stdoutRl = readline.createInterface({ input: child.stdout });
  stdoutRl.on("line", (line) => {
    const text = (line || "").trim();
    if (!text) return;
    try {
      const payload = JSON.parse(text);
      if (!Object.prototype.hasOwnProperty.call(payload, "runKind")) {
        payload.runKind = runKind;
      }
      if (payload?.event === "error" && payload?.message) {
        backendError = String(payload.message);
      }
      sendEvent(payload);
    } catch {
      sendEvent({ event: "log", stream: "stdout", message: text, runKind });
    }
  });

  const stderrRl = readline.createInterface({ input: child.stderr });
  stderrRl.on("line", (line) => {
    const text = (line || "").trim();
    if (!text) return;
    stderrLines.push(text);
    if (stderrLines.length > 30) stderrLines.shift();
    sendEvent({ event: "log", stream: "stderr", message: text, runKind });
  });

  return await new Promise((resolve, reject) => {
    child.once("error", (err) => {
      activeRun = null;
      reject(new Error(`Failed to launch backend: ${err?.message || String(err)}`));
    });

    child.once("close", (code, signal) => {
      activeRun = null;
      if (code !== 0) {
        const details = [];
        if (backendError) details.push(`backend error: ${backendError}`);
        if (stderrLines.length) details.push(`stderr: ${stderrLines.slice(-6).join(" | ")}`);
        const suffix = details.length ? ` (${details.join("; ")})` : "";
        if (code === null) return reject(new Error(`Backend process terminated by signal ${signal || "unknown"}${suffix}`));
        return reject(new Error(`Backend process exited with code ${code}${suffix}`));
      }
      if (!fs.existsSync(outputPath)) return reject(new Error("Session completed but no result file was produced."));
      const result = parseJsonWithFallback(fs.readFileSync(outputPath, "utf8"), outputPath);
      const summary = result?.summary || {};
      const rawRecording = result?.metadata?.raw_recording || null;
      const sessionRecord = registerSession({
        id: runId,
        run_kind: runKind,
        applet: runKind === "baseline" ? "norms" : runKind,
        profile_id: profile.id,
        profile_name: profile.name,
        tags,
        notes,
        created_at: new Date().toISOString(),
        config_path: configPath,
        output_path: outputPath,
        raw_recording_path: rawRecording?.path || (rawRecordingPath && fs.existsSync(rawRecordingPath) ? rawRecordingPath : null),
        summary: {
          out_of_range: summary.out_of_range ?? summary.norm_out_of_range ?? null,
          in_range: summary.in_range ?? summary.norm_in_range ?? null,
          missing: summary.missing ?? summary.norm_missing ?? null,
          protocol_id: summary.protocol_id ?? null,
          reward_percent: summary.reward_percent ?? null,
          window_count: summary.window_count ?? null,
        },
      });
      resolve({ runId, outputPath, result, session: sessionRecord });
    });
  });
}

async function runSession(config) {
  return await runBackendCli({
    config,
    subcommand: "run",
    configFileName: "session-config.json",
    outputFileName: "session-result.json",
    runKind: "clinicalq",
  });
}

async function runCoherenceSession(config) {
  return await runBackendCli({
    config,
    subcommand: "run-coherence",
    configFileName: "coherence-config.json",
    outputFileName: "coherence-result.json",
    runKind: "coherence",
  });
}

async function runBaselineSession(config) {
  return await runBackendCli({
    config,
    subcommand: "run-baseline",
    configFileName: "baseline-config.json",
    outputFileName: "baseline-result.json",
    runKind: "baseline",
  });
}

async function runNfTrainingSession(config) {
  return await runBackendCli({
    config,
    subcommand: "run-nf-training",
    configFileName: "nf-training-config.json",
    outputFileName: "nf-training-result.json",
    runKind: "nf-training",
  });
}

async function runDisentrainmentMeasure(config) {
  return await runBackendCli({
    config,
    subcommand: "run-baseline",
    configFileName: "disentrainment-config.json",
    outputFileName: "disentrainment-measurement.json",
    runKind: "disentrainment",
  });
}

async function runDisentrainmentLiveWindows(config) {
  return await runBackendCli({
    config,
    subcommand: "run-live-windows",
    configFileName: "disentrainment-live-config.json",
    outputFileName: "disentrainment-live-windows.json",
    runKind: "disentrainment-live",
  });
}

async function runProgressAnalysis(config) {
  return await runBackendCli({
    config,
    subcommand: "analyze-progress",
    configFileName: "progress-config.json",
    outputFileName: "progress-result.json",
    runKind: "progress",
  });
}

ipcMain.handle("check-python", () => {
  try {
    const runtime = resolvePythonRuntime({ requireBackendImports: true });
    return { ok: true, message: runtime.version, backendDir: backendDir(), python: runtime.label };
  } catch (err) {
    return { ok: false, message: err?.message || String(err), backendDir: backendDir() };
  }
});

ipcMain.handle("profiles-list", () => {
  const data = listProfiles();
  return { ...data, sessions: listSessions(data.activeProfileId) };
});

ipcMain.handle("profiles-create", (_event, input) => {
  const data = createProfile(input || {});
  return { ...data, sessions: listSessions(data.activeProfileId) };
});

ipcMain.handle("profiles-set-active", (_event, profileId) => {
  const data = setActiveProfile(profileId);
  return { ...data, sessions: listSessions(data.activeProfileId) };
});

ipcMain.handle("sessions-list", (_event, profileId) => {
  return { sessions: listSessions(profileId || null) };
});

ipcMain.handle("sessions-read", (_event, sessionId) => {
  return readSessionPayload(sessionId);
});

ipcMain.handle("save-disentrainment-session-summary", (_event, input) => {
  return saveDisentrainmentSessionSummary(input || {});
});

ipcMain.handle("open-applet", (_event, applet) => {
  return loadApplet(applet);
});

ipcMain.handle("start-session", async (_event, config) => {
  return await runSession(config);
});

ipcMain.handle("start-coherence-session", async (_event, config) => {
  return await runCoherenceSession(config);
});

ipcMain.handle("start-baseline-session", async (_event, config) => {
  return await runBaselineSession(config);
});

ipcMain.handle("start-nf-training-session", async (_event, config) => {
  return await runNfTrainingSession(config);
});

ipcMain.handle("measure-disentrainment", async (_event, config) => {
  return await runDisentrainmentMeasure(config);
});

ipcMain.handle("measure-disentrainment-live", async (_event, config) => {
  return await runDisentrainmentLiveWindows(config);
});

ipcMain.handle("analyze-progress", async (_event, config) => {
  return await runProgressAnalysis(config);
});

ipcMain.handle("stop-session", () => {
  return stopActiveRun("session_stopped");
});

ipcMain.handle("stop-coherence-session", () => {
  return stopActiveRun("coherence_session_stopped");
});

ipcMain.handle("open-result-file", async () => {
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: "Open ClinicalQ Session Result",
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (picked.canceled || !picked.filePaths.length) return { canceled: true };

  const filePath = picked.filePaths[0];
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = parseJsonWithFallback(raw, filePath);
  return { canceled: false, filePath, result: parsed };
});

ipcMain.handle("open-eeg-recording-files", async () => {
  const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  const picked = await dialog.showOpenDialog(owner, {
    title: "Open EEG Recording Files",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "EEG Recordings", extensions: ["edf", "fif", "csv", "tsv", "txt"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (picked.canceled || !picked.filePaths.length) return { canceled: true };
  return { canceled: false, filePaths: picked.filePaths };
});

ipcMain.handle("open-progress-files", async () => {
  const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  const picked = await dialog.showOpenDialog(owner, {
    title: "Open NF Progress Files",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "NF Progress Files", extensions: ["csv", "txt", "json"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (picked.canceled || !picked.filePaths.length) return { canceled: true };
  return { canceled: false, filePaths: picked.filePaths };
});

ipcMain.handle("open-progress-directory", async () => {
  const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  const picked = await dialog.showOpenDialog(owner, {
    title: "Open NF Progress Directory",
    properties: ["openDirectory"],
  });
  if (picked.canceled || !picked.filePaths.length) return { canceled: true };
  return { canceled: false, directoryPath: picked.filePaths[0] };
});

ipcMain.handle("open-planner-window", () => {
  createPlannerWindow();
  return { ok: true };
});

ipcMain.handle("send-command", (_event, command) => {
  if (!activeRun || !activeRun.child || activeRun.child.killed || !activeRun.child.stdin) {
    return { ok: false, message: "No active session." };
  }
  try {
    activeRun.child.stdin.write(`${JSON.stringify(command)}\n`);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err?.message || String(err) };
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (activeRun && activeRun.child && !activeRun.child.killed) {
    activeRun.child.kill("SIGTERM");
  }
});
