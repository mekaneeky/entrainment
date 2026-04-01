const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const readline = require("readline");

let mainWindow = null;
let activeRun = null;
let plannerWindow = null;

function plannerModeEnabled() {
  return process.argv.includes("--planner");
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

function createWindow() {
  if (plannerModeEnabled()) {
    mainWindow = createPlannerWindow();
    return;
  }

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
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");

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
      resolve({ runId, outputPath, result });
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

ipcMain.handle("check-python", () => {
  try {
    const runtime = resolvePythonRuntime({ requireBackendImports: true });
    return { ok: true, message: runtime.version, backendDir: backendDir(), python: runtime.label };
  } catch (err) {
    return { ok: false, message: err?.message || String(err), backendDir: backendDir() };
  }
});

ipcMain.handle("start-session", async (_event, config) => {
  return await runSession(config);
});

ipcMain.handle("start-coherence-session", async (_event, config) => {
  return await runCoherenceSession(config);
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
