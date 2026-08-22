(() => {
  "use strict";

  const Core = window.EntrainmentCore;
  const store = new Core.LocalStore();
  const goggles = new window.EntrainmentGoggles.GogglesController();
  const runner = new Core.SessionRunner(undefined, window, goggles);
  const screens = new Map([...document.querySelectorAll("[data-screen]")].map((node) => [node.dataset.screen, node]));
  const mainScreens = new Set(["home", "progress", "sessions"]);
  const history = [];
  const goalPresets = {
    settle: { label: "Settle my body", question: "How settled does your body feel right now?", low: "Not settled", high: "Deeply settled", direction: "higher" },
    focus: { label: "Focus my mind", question: "How focused does your mind feel right now?", low: "Scattered", high: "Fully focused", direction: "higher" },
    sleep: { label: "Sleep more easily", question: "How ready for sleep do you feel right now?", low: "Wide awake", high: "Ready for sleep", direction: "higher" },
    custom: { label: "", question: "", low: "Not at all", high: "Completely", direction: "higher" },
  };
  const state = {
    screen: "welcome",
    activeGoalId: localStorage.getItem("entrainment.activeGoal") || "",
    activeProfileId: localStorage.getItem("entrainment.activeProfile") || "",
    range: "1M",
    pending: null,
    wakeLock: null,
    ending: false,
    useVisual: false,
    labBusy: false,
  };
  try { goggles.setFlashLatency(Number(localStorage.getItem("entrainment.flashLatencyMs")) || 0); } catch {}
  let toastTimer;

  const $ = (selector) => document.querySelector(selector);

  function data() { return store.load(); }
  function activeGoal() { const all = data(); return all.goals.find((goal) => goal.id === state.activeGoalId) || all.goals[0]; }
  function activeProfile() { const all = data(); return all.profiles.find((profile) => profile.id === state.activeProfileId) || all.profiles[0]; }
  function makeId(prefix) { return `${prefix}_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`.toLowerCase(); }
  function formatTime(seconds) { const value = Math.max(0, Math.ceil(seconds)); return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }
  function formatDuration(seconds) { return seconds < 60 ? `${seconds} sec` : `${Math.round(seconds / 60)} min`; }
  function formatDate(value) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }

  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("visible"), 3200);
  }

  function navigate(name, remember = true) {
    if (!screens.has(name)) return;
    if (remember && state.screen !== name) history.push(state.screen);
    for (const [key, screen] of screens) screen.hidden = key !== name;
    state.screen = name;
    $(".app-shell").classList.toggle("immersive-mode", screens.get(name).classList.contains("immersive"));
    $("#main-nav").hidden = !mainScreens.has(name);
    document.querySelectorAll("#main-nav [data-nav]").forEach((button) => {
      if (button.dataset.nav === name) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
    const heading = screens.get(name).querySelector("h1");
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
    if (name === "home" || name === "progress" || name === "sessions") renderAll();
    if (name === "prepare") renderPreparation();
  }

  function goBack() { navigate(history.pop() || "home", false); }

  function updateGoalCopy() {
    const goal = activeGoal();
    if (!goal) return;
    $("#home-goal-label").textContent = goal.label;
    $("#home-goal-question").textContent = goal.question;
    $("#before-question").textContent = goal.question;
    $("#after-question").textContent = goal.question;
    for (const prefix of ["before", "after"]) {
      $(`#${prefix}-low`).textContent = `${goal.min} · ${goal.lowLabel}`;
      $(`#${prefix}-high`).textContent = `${goal.max} · ${goal.highLabel}`;
      const slider = $(`#${prefix}-rating`);
      slider.min = goal.min;
      slider.max = goal.max;
      if (Number(slider.value) < goal.min || Number(slider.value) > goal.max) slider.value = String((goal.min + goal.max) / 2);
      $(`#${prefix}-output`).textContent = slider.value;
    }
  }

  function renderGoalSelects() {
    const goals = data().goals.filter((goal) => !goal.archived);
    if (!goals.some((goal) => goal.id === state.activeGoalId)) state.activeGoalId = goals[0]?.id || "";
    for (const selector of ["#home-goal", "#progress-goal"]) {
      const select = $(selector);
      select.replaceChildren(...goals.map((goal) => new Option(goal.label, goal.id)));
      select.value = state.activeGoalId;
    }
    updateGoalCopy();
  }

  function renderProfiles() {
    const profiles = data().profiles;
    if (!profiles.some((profile) => profile.id === state.activeProfileId)) state.activeProfileId = profiles[0]?.id || "";
    const select = $("#profile-select");
    select.replaceChildren(...profiles.map((profile) => new Option(profile.name, profile.id)));
    select.value = state.activeProfileId;
    const profile = activeProfile();
    const outputs = profile ? [profile.audio ? "Audio" : null, profile.visual ? "Visual" : null].filter(Boolean) : [];
    const method = outputs.join(" + ").toLowerCase();
    $("#profile-name").textContent = profile?.name || "Import a session profile";
    $("#profile-description").textContent = profile?.description || "No profile is available yet.";
    $("#profile-duration").textContent = profile ? `${formatDuration(Core.totalDuration(profile))} · ${method}` : "";
    $("#listening-title").textContent = profile?.name || "Listening";
    $("#signal-method").textContent = profile?.audio ? `${method} · headphones` : method;
    $("#profile-outputs").replaceChildren(...outputs.map((output) => {
      const badge = document.createElement("span");
      const required = profile.requiredOutputs.includes(output.toLowerCase());
      badge.textContent = `${output}${required ? " required" : " optional"}`;
      return badge;
    }));
    $("#audio-level-controls").hidden = !profile?.audio;
    const visualOption = $("#visual-option");
    visualOption.hidden = !profile?.visual;
    if (profile?.visual) {
      const required = profile.requiredOutputs.includes("visual");
      if (required) state.useVisual = true;
      $("#use-visual").checked = state.useVisual;
      $("#use-visual").disabled = required;
      $("#visual-requirement").textContent = required ? "Required" : "Optional";
      $("#visual-option-copy").textContent = required
        ? "This protocol only starts after compatible goggles are connected."
        : "Leave this off for an audio-only session. The protocol itself is unchanged.";
    } else {
      state.useVisual = false;
    }
    renderPreparation();
  }

  function renderPreparation() {
    const profile = activeProfile();
    const wantsVisual = Boolean(profile?.visual && state.useVisual);
    $("#goggles-panel").hidden = !wantsVisual;
    $("#prepare-list").hidden = wantsVisual;
    $("#prepare-lead").textContent = wantsVisual
      ? "Connect headphones and goggles, complete the light check, then settle somewhere safe."
      : profile?.audio ? "Connect headphones, settle somewhere safe, then place your phone down." : "Prepare your equipment and settle somewhere safe.";
    if (!wantsVisual) {
      $("#start-session").disabled = false;
      return;
    }
    const connected = goggles.connected;
    $("#goggles-kind").textContent = profile.requiredOutputs.includes("visual") ? "Required equipment" : "Optional equipment";
    const stateLabels = { disconnected: "Not connected", connecting: "Connecting…", ready: "Ready", loading: "Loading…", armed: "Synchronized", running: "Running", fault: "Fault" };
    $("#goggles-state").textContent = stateLabels[goggles.state] || goggles.state;
    $("#goggles-state").classList.toggle("ready", connected && goggles.state !== "fault");
    $("#connect-goggles").hidden = connected;
    $("#connect-goggles").disabled = goggles.state === "connecting";
    $("#test-goggles").hidden = !connected;
    if (connected) {
      const development = goggles.info?.developmentOutput;
      $("#goggles-detail").textContent = development
        ? `Firmware ${goggles.info.firmware} · GPIO2 development mirror · keep it off your face`
        : `Device ${goggles.info.deviceId} · firmware ${goggles.info.firmware} · two light channels`;
    } else {
      $("#goggles-detail").textContent = "Chrome will ask for the unique six-digit code printed on the device. For this dev board, read it from Serial Monitor.";
    }
    $("#start-session").disabled = !connected || !$("#visual-confirm").checked || goggles.state === "fault";
  }

  function labUnlocked() { return localStorage.getItem("entrainment.labUnlocked") === "1"; }

  function renderLab() {
    const unlocked = labUnlocked();
    $("#lab-tools").hidden = !unlocked;
    if (!unlocked) return;
    const connected = goggles.connected;
    $("#lab-current").textContent = `${goggles.flashLatencyMs} ms`;
    if (!Number.isFinite(Number($("#lab-latency-input").value)) || $("#lab-latency-input").value === "") $("#lab-latency-input").value = String(goggles.flashLatencyMs);
    $("#lab-connect").hidden = connected;
    $("#lab-connect").disabled = goggles.state === "connecting" || state.labBusy;
    $("#lab-measure").disabled = !connected || state.labBusy;
    $("#lab-save").disabled = state.labBusy;
    $("#lab-reset").disabled = state.labBusy;
  }

  function applyFlashLatency(ms, fromMeasurement = false) {
    const value = goggles.setFlashLatency(ms);
    localStorage.setItem("entrainment.flashLatencyMs", String(value));
    $("#lab-latency-input").value = String(value);
    renderLab();
    toast(fromMeasurement ? `Flashes arrive about ${value} ms late · offset applied` : `Flash offset saved: ${value} ms`);
  }

  function sampleCameraFrames(video, durationMs) {
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 36;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const samples = [];
    const startedAt = performance.now();
    let anchorWallMs = null;
    return new Promise((resolve) => {
      setTimeout(() => resolve(samples), durationMs + 2500);
      const draw = (mediaTimeSec) => {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        let total = 0;
        for (let index = 0; index < data.length; index += 4) total += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
        samples.push({
          tMs: anchorWallMs === null ? performance.now() : anchorWallMs + mediaTimeSec * 1000,
          luma: total / (data.length / 4),
        });
        if (performance.now() - startedAt >= durationMs) return resolve(samples);
        schedule();
      };
      const schedule = () => {
        if (typeof video.requestVideoFrameCallback === "function") {
          video.requestVideoFrameCallback((_now, metadata) => {
            if (anchorWallMs === null) anchorWallMs = performance.now() - metadata.mediaTime * 1000;
            draw(metadata.mediaTime);
          });
        } else {
          requestAnimationFrame(() => draw(null));
        }
      };
      schedule();
    });
  }

  async function releaseLabCamera() {
    const video = $("#lab-video");
    video.srcObject?.getTracks?.().forEach((track) => track.stop());
    video.srcObject = null;
    video.hidden = true;
  }

  async function runFlashCalibration() {
    const GogglesApi = window.EntrainmentGoggles;
    if (!goggles.connected) throw new Error("Connect the goggles first.");
    const status = $("#lab-status");
    status.textContent = "Requesting camera…";
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 320 }, height: { ideal: 240 } }, audio: false });
    const video = $("#lab-video");
    try {
      video.srcObject = stream;
      video.hidden = false;
      await video.play();
      status.textContent = "Point the LEDs at the camera in dim light. Keep them in frame for ~10 seconds…";
      await goggles.loadSchedule(GogglesApi.calibrationVisual(goggles.info?.maxIntensity ?? 1), GogglesApi.CALIBRATION.durationSec + 4);
      await goggles.synchronize();
      const startAt = performance.now() + 1500;
      await goggles.arm(startAt);
      const finished = sampleCameraFrames(video, 1500 + GogglesApi.CALIBRATION.durationSec * 1000 + 400);
      await goggles.commit(() => (performance.now() - startAt) * 1000);
      const result = GogglesApi.analyzeFlashLatency(await finished, { startPerformanceMs: startAt });
      applyFlashLatency(result.latencyMs, true);
      status.textContent = `Matched ${result.matched} of ${result.onsets} flashes · offset ${result.latencyMs >= 0 ? "+" : ""}${result.latencyMs} ms saved.`;
    } catch (error) {
      status.textContent = error.message || String(error);
      throw error;
    } finally {
      await goggles.stop().catch(() => {});
      await releaseLabCamera();
      state.labBusy = false;
      renderLab();
    }
  }

  function rangeStart(range) {
    const days = { "7D": 7, "1M": 30, "3M": 90, "1Y": 365 }[range];
    return days ? Date.now() - days * 86400000 : -Infinity;
  }

  function chartGeometry(points, goal, width, height, pad, valueKey = "after") {
    if (!points.length) return { path: "", circles: [] };
    const dates = points.map((point) => Date.parse(point.date));
    const first = Math.min(...dates);
    const last = Math.max(...dates);
    const span = Math.max(1, last - first);
    const scale = Math.max(1, goal.max - goal.min);
    const positions = points.map((point, index) => ({
      x: points.length === 1 ? width / 2 : pad + ((dates[index] - first) / span) * (width - pad * 2),
      y: pad + ((goal.max - point[valueKey]) / scale) * (height - pad * 2),
    }));
    const path = positions.length < 2 ? "" : positions.slice(1).reduce((value, point, index) => {
      const previous = positions[index];
      const middle = (previous.x + point.x) / 2;
      return `${value} C${middle.toFixed(1)} ${previous.y.toFixed(1)} ${middle.toFixed(1)} ${point.y.toFixed(1)} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    }, `M${positions[0].x.toFixed(1)} ${positions[0].y.toFixed(1)}`);
    return {
      path,
      circles: positions,
    };
  }

  function svgCircle({ x, y }, className, radius = 4) {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x.toFixed(1)); circle.setAttribute("cy", y.toFixed(1)); circle.setAttribute("r", radius);
    if (className) circle.setAttribute("class", className);
    return circle;
  }

  function drawChart(pathNode, pointsNode, titleNode, emptyNode, points, goal, width, height, pad) {
    const geometry = chartGeometry(points, goal, width, height, pad);
    pathNode.setAttribute("d", geometry.path);
    pointsNode.replaceChildren(...geometry.circles.map((point) => svgCircle(point)));
    emptyNode.hidden = points.length > 0;
    titleNode.textContent = points.length ? `${points.length} after-session ratings for ${goal.label}` : `No progress observations for ${goal.label}`;
  }

  function renderCharts() {
    const goal = activeGoal();
    if (!goal) return;
    const all = store.progress(goal.id);
    const month = all.filter((point) => Date.parse(point.date) >= rangeStart("1M"));
    drawChart($("#mini-path"), $("#mini-points"), $("#mini-chart-label"), $("#home-chart-empty"), month, goal, 320, 120, 10);
    $("#mini-empty-line").style.display = month.length ? "none" : "";
    const points = all.filter((point) => Date.parse(point.date) >= rangeStart(state.range));
    drawChart($("#progress-path"), $("#progress-points"), $("#progress-chart-title"), $("#progress-empty"), points, goal, 320, 220, 24);
    $("#progress-empty-line").style.display = points.length ? "none" : "";
    const before = chartGeometry(points, goal, 320, 220, 24, "before").circles;
    const after = chartGeometry(points, goal, 320, 220, 24).circles;
    $("#progress-before-points").replaceChildren(...before.map((point) => svgCircle(point)));
    $("#progress-change-lines").replaceChildren(...before.map((point, index) => {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", point.x.toFixed(1)); line.setAttribute("y1", point.y.toFixed(1));
      line.setAttribute("x2", after[index].x.toFixed(1)); line.setAttribute("y2", after[index].y.toFixed(1));
      return line;
    }));
    $("#chart-high").textContent = goal.max;
    $("#chart-mid").textContent = (goal.min + goal.max) / 2;
    $("#chart-low").textContent = goal.min;
    $("#progress-range-label").textContent = ({ "7D": "7-day view", "1M": "30-day view", "3M": "90-day view", "1Y": "1-year view", ALL: "All observations" })[state.range];
    $("#progress-start").textContent = state.range === "ALL" ? (points[0] ? formatDate(points[0].date) : "First mark") : formatDate(rangeStart(state.range));
    $("#progress-end").textContent = "Today";
    if (!points.length) {
      $("#progress-summary").textContent = "Your observations will build the chart.";
      $("#progress-meta").textContent = "Complete a before-and-after check-in to add a point.";
      return;
    }
    const average = points.reduce((sum, point) => sum + point.improvement, 0) / points.length;
    const latest = points.at(-1);
    $("#progress-summary").textContent = `Latest after-session rating: ${latest.after} of ${goal.max}.`;
    $("#progress-meta").textContent = `${points.length} paired check-in${points.length === 1 ? "" : "s"} · average same-session change ${average >= 0 ? "+" : ""}${average.toFixed(1)} toward your chosen direction`;
  }

  function renderSessions() {
    const all = data();
    const profiles = new Map(all.profiles.map((profile) => [profile.id, profile.name]));
    const goals = new Map(all.goals.map((goal) => [goal.id, goal]));
    const list = $("#session-list");
    const sessions = [...all.sessions].sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
    if (!sessions.length) {
      const empty = document.createElement("p"); empty.className = "empty-row"; empty.textContent = "No sessions saved yet."; list.replaceChildren(empty); return;
    }
    list.replaceChildren(...sessions.map((session) => {
      const goalId = Object.keys(session.after)[0] || Object.keys(session.before)[0];
      const before = session.before[goalId]; const after = session.after[goalId];
      const row = document.createElement("article"); row.className = "session-row";
      const text = document.createElement("div");
      const name = document.createElement("strong"); name.textContent = profiles.get(session.profileId) || "Imported profile";
      const meta = document.createElement("small"); meta.textContent = `${new Date(session.endedAt).toLocaleString()} · ${session.outputsUsed.join(" + ")} · ${goals.get(goalId)?.label || "No check-in"} · ${session.status}`;
      text.append(name, meta);
      const score = document.createElement("span"); score.className = "session-score"; score.textContent = Number.isFinite(before) && Number.isFinite(after) ? `${before} → ${after}` : "—";
      row.append(text, score); return row;
    }));
  }

  function renderAll() {
    const hour = new Date().getHours();
    $("#home-greeting").textContent = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    renderGoalSelects(); renderProfiles(); renderCharts(); renderSessions(); renderLab();
  }

  async function ensureBuiltInProfiles() {
    const response = await fetch("./protocols/index.json");
    if (!response.ok) throw new Error("Built-in protocols could not be loaded");
    const paths = await response.json();
    if (!Array.isArray(paths)) throw new Error("Built-in protocol index is invalid");
    const known = new Map(data().profiles.map((profile) => [profile.id, profile]));
    for (const path of paths) {
      const profileResponse = await fetch(path);
      if (!profileResponse.ok) throw new Error(`Built-in protocol could not be loaded: ${path}`);
      const profile = Core.parseProfileFile(await profileResponse.text());
      const existing = known.get(profile.id);
      if (!existing || JSON.stringify(existing) !== JSON.stringify(profile)) store.putProfile(profile);
    }
  }

  async function importProfile(file) {
    if (!file) return;
    if (file.size > 256 * 1024) throw new Error("Profile file is larger than 256 KB");
    const profile = Core.parseProfileFile(await file.text());
    if (data().profiles.some((item) => item.id === profile.id) && !confirm(`Replace the saved profile “${profile.name}”?`)) return;
    store.putProfile(profile);
    state.activeProfileId = profile.id;
    localStorage.setItem("entrainment.activeProfile", profile.id);
    renderProfiles();
    toast(`Imported ${profile.name}`);
  }

  async function requestWakeLock() {
    try {
      state.wakeLock = await navigator.wakeLock?.request("screen");
      if (!state.wakeLock) $("#audio-status").textContent = "Keep this screen awake; locking may pause the audio.";
    } catch {
      $("#audio-status").textContent = "Keep this screen awake; locking may pause the audio.";
    }
  }

  async function releaseWakeLock() {
    try { await state.wakeLock?.release(); } catch {}
    state.wakeLock = null;
  }

  function pendingRecord(afterScore) {
    const goal = activeGoal();
    return {
      id: state.pending.id,
      profileId: state.pending.profileId,
      startedAt: state.pending.startedAt,
      endedAt: state.pending.endedAt,
      status: state.pending.status,
      before: Number.isFinite(state.pending.before) ? { [goal.id]: state.pending.before } : {},
      after: Number.isFinite(afterScore) ? { [goal.id]: afterScore } : {},
      beforeNote: state.pending.beforeNote,
      afterNote: $("#after-note").value.trim(),
      outputsUsed: state.pending.outputsUsed,
    };
  }

  function persistPending(afterScore) { return store.recordSession(pendingRecord(afterScore)); }

  function sessionEnded(result) {
    if (!state.pending || state.ending) return;
    state.ending = true;
    state.pending.endedAt = new Date().toISOString();
    state.pending.status = result.status === "completed" ? "completed" : "stopped";
    state.pending.outputsUsed = result.outputs || state.pending.outputsUsed || ["audio"];
    releaseWakeLock();
    try { persistPending(undefined); } catch (error) { $("#save-error").textContent = `The session ended but has not been saved: ${error.message}`; }
    $("#resume-audio").hidden = true;
    $("#after-note").value = "";
    updateGoalCopy();
    navigate("return");
  }

  async function startSession() {
    const button = $("#start-session");
    const profile = activeProfile();
    if (!profile) { $("#start-error").textContent = "Import a profile before starting."; return; }
    if (profile.visual && state.useVisual && !goggles.connected) { $("#start-error").textContent = "Connect the goggles before starting this visual session."; return; }
    if (profile.visual && state.useVisual && !$("#visual-confirm").checked) { $("#start-error").textContent = "Confirm the flashing-light warning before starting."; return; }
    button.disabled = true;
    $("#start-error").textContent = "";
    state.ending = false;
    const level = Number($("#volume").value) / 100;
    const playable = profile.audio ? {
      ...profile,
      audio: { ...profile.audio, masterVolume: Math.min(profile.audio.masterVolume, 0.2) * level },
    } : profile;
    const checkin = state.pending;
    state.pending = {
      id: makeId("session"),
      profileId: profile.id,
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: "stopped",
      before: checkin?.before,
      beforeNote: checkin?.beforeNote || "",
      outputsUsed: profile.audio ? ["audio"] : ["visual"],
    };
    try {
      const start = runner.start(playable, {
        useVisual: Boolean(profile.visual && state.useVisual),
        onStart: ({ outputs }) => {
          state.pending.outputsUsed = outputs;
        },
        onProgress: ({ elapsedSec, durationSec }) => { $("#session-clock").textContent = formatTime(durationSec - elapsedSec); },
        onAudioState: (audioState) => {
          const interrupted = audioState !== "running";
          $("#resume-audio").hidden = !interrupted;
          $("#audio-status").textContent = interrupted ? "Audio was interrupted. Tap Resume audio." : "Keep this screen awake. You may place the phone down.";
        },
        onEnd: sessionEnded,
      });
      requestWakeLock();
      const started = await start;
      $("#session-clock").textContent = formatTime(Core.totalDuration(profile));
      $("#signal-method").textContent = `${started.outputs.join(" + ")} · ${profile.method}`;
      $("#visual-status").hidden = !started.outputs.includes("visual");
      $("#visual-status").textContent = goggles.info?.developmentOutput ? "GPIO2 development mirror active · do not wear" : "Goggles synchronized.";
      navigate("listening");
    } catch (error) {
      state.pending = checkin;
      $("#start-error").textContent = error.message || String(error);
      releaseWakeLock();
    } finally {
      button.disabled = false;
    }
  }

  function finishSave(afterScore) {
    try {
      persistPending(afterScore);
      const before = state.pending.before;
      $("#result-before").textContent = Number.isFinite(before) ? before : "—";
      $("#result-after").textContent = Number.isFinite(afterScore) ? afterScore : "—";
      const paired = Number.isFinite(before) && Number.isFinite(afterScore);
      $("#result-comparison").hidden = !paired;
      $("#result-summary").textContent = paired ? `You reported ${before} before and ${afterScore} afterward.` : "Your session is saved without a before-and-after comparison.";
      $("#save-error").textContent = "";
      state.pending = null;
      navigate("result");
    } catch (error) {
      $("#save-error").textContent = `Not saved yet: ${error.message}`;
    }
  }

  function exportBackup() {
    const url = URL.createObjectURL(new Blob([store.exportData()], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = `listening-room-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importBackup(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) throw new Error("Backup is larger than 5 MB");
    if (!confirm("Replace all Listening Room data on this device with this backup?")) return;
    store.importData(await file.text());
    const all = data();
    state.activeGoalId = all.goals[0]?.id || "";
    state.activeProfileId = all.profiles[0]?.id || "";
    localStorage.setItem("entrainment.activeGoal", state.activeGoalId);
    localStorage.setItem("entrainment.activeProfile", state.activeProfileId);
    renderAll();
    navigate(all.goals.length ? "home" : "welcome");
    toast("Backup restored");
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.nav) return navigate(button.dataset.nav);
    if (button.hasAttribute("data-back")) return goBack();
    if (button.dataset.range) {
      state.range = button.dataset.range;
      document.querySelectorAll("[data-range]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      return renderCharts();
    }
  });

  $("#goal-form").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const goal = store.putGoal({
        id: makeId("goal"), label: $("#goal-label").value, question: $("#goal-question").value,
        lowLabel: $("#low-label").value, highLabel: $("#high-label").value,
        min: 1, max: 10, direction: $("#goal-direction").value,
      });
      state.activeGoalId = goal.id;
      localStorage.setItem("entrainment.activeGoal", goal.id);
      event.target.reset();
      $("#low-label").value = "Not at all"; $("#high-label").value = "Completely";
      document.querySelectorAll("[data-goal-preset]").forEach((button) => button.setAttribute("aria-pressed", "false"));
      navigate("home");
    } catch (error) { toast(error.message); }
  });

  document.querySelectorAll("[data-goal-preset]").forEach((button) => button.addEventListener("click", () => {
    const preset = goalPresets[button.dataset.goalPreset];
    document.querySelectorAll("[data-goal-preset]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    $("#goal-label").value = preset.label;
    $("#goal-question").value = preset.question;
    $("#low-label").value = preset.low;
    $("#high-label").value = preset.high;
    $("#goal-direction").value = preset.direction;
    $("#goal-label").focus();
  }));
  $("#continue-goal").addEventListener("click", () => {
    if (!$("#goal-label").reportValidity()) return;
    navigate("measure");
  });

  for (const prefix of ["before", "after"]) {
    $(`#${prefix}-rating`).addEventListener("input", (event) => { $(`#${prefix}-output`).textContent = event.target.value; });
  }
  $("#volume").addEventListener("input", (event) => { $("#volume-output").textContent = `${event.target.value}%`; });
  $("#home-goal").addEventListener("change", (event) => { state.activeGoalId = event.target.value; localStorage.setItem("entrainment.activeGoal", state.activeGoalId); renderAll(); });
  $("#progress-goal").addEventListener("change", (event) => { state.activeGoalId = event.target.value; localStorage.setItem("entrainment.activeGoal", state.activeGoalId); renderAll(); });
  $("#profile-select").addEventListener("change", (event) => {
    state.activeProfileId = event.target.value;
    localStorage.setItem("entrainment.activeProfile", state.activeProfileId);
    state.useVisual = activeProfile()?.requiredOutputs.includes("visual") || false;
    $("#visual-confirm").checked = false;
    renderProfiles();
  });
  $("#save-before").addEventListener("click", () => { state.pending = { before: Number($("#before-rating").value), beforeNote: $("#before-note").value.trim() }; navigate("plan"); });
  $("#skip-before").addEventListener("click", () => { state.pending = { before: undefined, beforeNote: $("#before-note").value.trim() }; navigate("plan"); });
  $("#import-profile").addEventListener("click", () => $("#profile-file").click());
  $("#profile-file").addEventListener("change", async (event) => { try { await importProfile(event.target.files[0]); } catch (error) { toast(error.message); } event.target.value = ""; });
  $("#use-visual").addEventListener("change", (event) => {
    state.useVisual = event.target.checked;
    $("#visual-confirm").checked = false;
    renderPreparation();
  });
  $("#visual-confirm").addEventListener("change", renderPreparation);
  $("#connect-goggles").addEventListener("click", async () => {
    const button = $("#connect-goggles");
    button.disabled = true;
    $("#start-error").textContent = "";
    try { await goggles.connect(); }
    catch (error) { $("#start-error").textContent = error.message || String(error); }
    finally { button.disabled = false; renderPreparation(); }
  });
  $("#test-goggles").addEventListener("click", async () => {
    const button = $("#test-goggles");
    button.disabled = true;
    try {
      for (const count of [3, 2, 1]) {
        button.textContent = `Dim test in ${count}…`;
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      button.textContent = "Testing…";
      await goggles.testLight();
      toast("One-second dim test sent");
    } catch (error) { $("#start-error").textContent = error.message || String(error); }
    finally { button.textContent = "Test dim light"; button.disabled = false; }
  });
  $("#start-session").addEventListener("click", startSession);
  $("#end-session").addEventListener("click", () => runner.stop("stopped"));
  $("#return-checkin").addEventListener("click", () => navigate("after"));
  $("#resume-audio").addEventListener("click", async () => { try { await runner.resumeAudio(); $("#resume-audio").hidden = true; } catch (error) { $("#audio-status").textContent = error.message; } });
  $("#save-after").addEventListener("click", () => finishSave(Number($("#after-rating").value)));
  $("#skip-after").addEventListener("click", () => finishSave(undefined));
  $("#export-backup").addEventListener("click", exportBackup);
  $("#import-backup").addEventListener("click", () => $("#backup-file").click());
  $("#backup-file").addEventListener("change", async (event) => { try { await importBackup(event.target.files[0]); } catch (error) { toast(error.message); } event.target.value = ""; });

  goggles.addEventListener("statechange", () => { renderPreparation(); renderLab(); });
  goggles.addEventListener("fault", (event) => {
    renderPreparation();
    renderLab();
    if (!runner.active) $("#start-error").textContent = event.detail?.error?.message || "Goggles faulted";
  });

  let pillTaps = 0;
  let pillTimer;
  document.querySelector('[data-screen="sessions"] .local-pill').addEventListener("pointerdown", () => {
    clearTimeout(pillTimer);
    pillTaps += 1;
    pillTimer = setTimeout(() => { pillTaps = 0; }, 2500);
    if (pillTaps < 5) return;
    pillTaps = 0;
    const unlock = !labUnlocked();
    localStorage.setItem("entrainment.labUnlocked", unlock ? "1" : "0");
    renderLab();
    if (unlock) toast("Hardware lab unlocked");
  });
  $("#lab-connect").addEventListener("click", async () => {
    $("#lab-status").textContent = "";
    try { await goggles.connect(); }
    catch (error) { $("#lab-status").textContent = error.message || String(error); }
    finally { renderLab(); }
  });
  $("#lab-measure").addEventListener("click", async () => {
    const button = $("#lab-measure");
    button.disabled = true;
    state.labBusy = true;
    renderLab();
    try { await runFlashCalibration(); }
    catch {}
  });
  $("#lab-save").addEventListener("click", () => {
    try { applyFlashLatency(Number($("#lab-latency-input").value)); $("#lab-status").textContent = ""; }
    catch (error) { $("#lab-status").textContent = error.message; }
  });
  $("#lab-reset").addEventListener("click", () => {
    try { applyFlashLatency(0); $("#lab-status").textContent = ""; }
    catch (error) { $("#lab-status").textContent = error.message; }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      if (runner.active?.outputs.includes("visual")) runner.stop("backgrounded");
      return;
    }
    if (state.screen !== "listening") return;
    requestWakeLock();
    if (runner.tone.ctx?.state !== "running") $("#resume-audio").hidden = false;
  });

  window.addEventListener("pagehide", () => { if (runner.active) runner.stop("stopped"); else goggles.stop().catch(() => {}); });

  async function init() {
    try {
      await ensureBuiltInProfiles();
      navigator.storage?.persist?.().catch(() => {});
      fetch("./service-worker.js").then((response) => response.text()).then((text) => {
        const match = text.match(/listening-room-v(\d+)/);
        if (match) $("#build-tag").textContent = ` · build ${match[1]}`;
      }).catch(() => {});
      if ("serviceWorker" in navigator && location.protocol !== "file:") {
        const serviceWorker = navigator.serviceWorker;
        const hadController = Boolean(serviceWorker.controller);
        serviceWorker.addEventListener("controllerchange", () => {
          if (!hadController || runner.active) return;
          location.reload();
        });
        serviceWorker.register("./service-worker.js").catch(() => {});
      }
      renderAll();
      navigate(data().goals.length ? "home" : "welcome", false);
    } catch (error) {
      toast(error.message);
      renderAll();
      navigate(data().goals.length ? "home" : "welcome", false);
    }
  }

  window.__listeningRoom = { get state() { return { ...state }; }, goggles, navigate, store, runner };
  init();
})();
