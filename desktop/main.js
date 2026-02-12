const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const readline = require("readline");

let mainWindow = null;
let activeRun = null;

function backendDir() {
  return path.resolve(__dirname, "..", "backend");
}

function pythonBin() {
  return process.env.CLINICALQ_PYTHON || "python";
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

function createWindow() {
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

async function runSession(config) {
  if (activeRun) {
    throw new Error("A session is already running.");
  }

  const runId = `clinicalq-${Date.now()}`;
  const runDir = path.join(app.getPath("userData"), "runs", runId);
  fs.mkdirSync(runDir, { recursive: true });

  const configPath = path.join(runDir, "session-config.json");
  const outputPath = path.join(runDir, "session-result.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");

  const env = { ...process.env };
  const pyPath = backendDir();
  env.PYTHONPATH = env.PYTHONPATH ? `${pyPath}${path.delimiter}${env.PYTHONPATH}` : pyPath;

  const child = spawn(
    pythonBin(),
    ["-m", "clinicalq_backend.cli", "run", "--config", configPath, "--output", outputPath],
    {
      cwd: backendDir(),
      env,
      windowsHide: true,
    }
  );

  activeRun = { child, runId, outputPath };
  sendEvent({ event: "runner_spawned", runId, outputPath });

  const stdoutRl = readline.createInterface({ input: child.stdout });
  stdoutRl.on("line", (line) => {
    const text = (line || "").trim();
    if (!text) return;
    try {
      const payload = JSON.parse(text);
      sendEvent(payload);
    } catch {
      sendEvent({ event: "log", stream: "stdout", message: text });
    }
  });

  const stderrRl = readline.createInterface({ input: child.stderr });
  stderrRl.on("line", (line) => {
    const text = (line || "").trim();
    if (text) sendEvent({ event: "log", stream: "stderr", message: text });
  });

  return await new Promise((resolve, reject) => {
    child.once("error", (err) => {
      activeRun = null;
      reject(err);
    });

    child.once("close", (code) => {
      activeRun = null;
      if (code !== 0) return reject(new Error(`Backend process exited with code ${code}`));
      if (!fs.existsSync(outputPath)) return reject(new Error("Session completed but no result file was produced."));
      const result = parseJsonWithFallback(fs.readFileSync(outputPath, "utf8"), outputPath);
      resolve({ runId, outputPath, result });
    });
  });
}

ipcMain.handle("check-python", () => {
  const out = spawnSync(pythonBin(), ["--version"], { encoding: "utf8", windowsHide: true });
  if (out.status !== 0) {
    return { ok: false, message: out.stderr?.trim() || out.stdout?.trim() || "Unable to run python." };
  }
  return { ok: true, message: out.stdout?.trim() || out.stderr?.trim() || "Python detected.", backendDir: backendDir() };
});

ipcMain.handle("start-session", async (_event, config) => {
  return await runSession(config);
});

ipcMain.handle("stop-session", () => {
  if (!activeRun || !activeRun.child || activeRun.child.killed) return { stopped: false, reason: "No active session." };
  activeRun.child.kill("SIGTERM");
  sendEvent({ event: "session_stopped" });
  return { stopped: true };
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
