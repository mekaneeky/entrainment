(() => {
  "use strict";

  const Core = window.EntrainmentCore;
  const store = new Core.LocalStore();
  const runner = new Core.SessionRunner();
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
  };
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
    const method = "hemispheric stereo";
    $("#profile-name").textContent = profile?.name || "Import a session profile";
    $("#profile-description").textContent = profile?.description || "No profile is available yet.";
    $("#profile-duration").textContent = profile ? `${formatDuration(Core.totalDuration(profile))} · ${method}` : "";
    $("#listening-title").textContent = profile?.name || "Listening";
    $("#signal-method").textContent = `${method} · headphones`;
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
      const meta = document.createElement("small"); meta.textContent = `${new Date(session.endedAt).toLocaleString()} · ${goals.get(goalId)?.label || "No check-in"} · ${session.status}`;
      text.append(name, meta);
      const score = document.createElement("span"); score.className = "session-score"; score.textContent = Number.isFinite(before) && Number.isFinite(after) ? `${before} → ${after}` : "—";
      row.append(text, score); return row;
    }));
  }

  function renderAll() {
    const hour = new Date().getHours();
    $("#home-greeting").textContent = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    renderGoalSelects(); renderProfiles(); renderCharts(); renderSessions();
  }

  async function ensureBuiltInProfiles() {
    const response = await fetch("./protocols/index.json");
    if (!response.ok) throw new Error("Built-in protocols could not be loaded");
    const paths = await response.json();
    if (!Array.isArray(paths)) throw new Error("Built-in protocol index is invalid");
    const known = new Set(data().profiles.map((profile) => profile.id));
    for (const path of paths) {
      const profileResponse = await fetch(path);
      if (!profileResponse.ok) throw new Error(`Built-in protocol could not be loaded: ${path}`);
      const profile = Core.parseProfileFile(await profileResponse.text());
      if (!known.has(profile.id)) store.putProfile(profile);
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
    };
  }

  function persistPending(afterScore) { return store.recordSession(pendingRecord(afterScore)); }

  function sessionEnded(result) {
    if (!state.pending || state.ending) return;
    state.ending = true;
    state.pending.endedAt = new Date().toISOString();
    state.pending.status = result.status === "completed" ? "completed" : "stopped";
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
    button.disabled = true;
    $("#start-error").textContent = "";
    state.ending = false;
    const level = Number($("#volume").value) / 100;
    const playable = { ...profile, masterVolume: Math.min(profile.masterVolume, 0.2) * level };
    const checkin = state.pending;
    state.pending = {
      id: makeId("session"),
      profileId: profile.id,
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: "stopped",
      before: checkin?.before,
      beforeNote: checkin?.beforeNote || "",
    };
    try {
      const start = runner.start(playable, {
        onProgress: ({ elapsedSec, durationSec }) => { $("#session-clock").textContent = formatTime(durationSec - elapsedSec); },
        onAudioState: (audioState) => {
          const interrupted = audioState !== "running";
          $("#resume-audio").hidden = !interrupted;
          $("#audio-status").textContent = interrupted ? "Audio was interrupted. Tap Resume audio." : "Keep this screen awake. You may place the phone down.";
        },
        onEnd: sessionEnded,
      });
      requestWakeLock();
      await start;
      $("#session-clock").textContent = formatTime(Core.totalDuration(profile));
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
  $("#profile-select").addEventListener("change", (event) => { state.activeProfileId = event.target.value; localStorage.setItem("entrainment.activeProfile", state.activeProfileId); renderProfiles(); });
  $("#save-before").addEventListener("click", () => { state.pending = { before: Number($("#before-rating").value), beforeNote: $("#before-note").value.trim() }; navigate("plan"); });
  $("#skip-before").addEventListener("click", () => { state.pending = { before: undefined, beforeNote: $("#before-note").value.trim() }; navigate("plan"); });
  $("#import-profile").addEventListener("click", () => $("#profile-file").click());
  $("#profile-file").addEventListener("change", async (event) => { try { await importProfile(event.target.files[0]); } catch (error) { toast(error.message); } event.target.value = ""; });
  $("#start-session").addEventListener("click", startSession);
  $("#end-session").addEventListener("click", () => runner.stop("stopped"));
  $("#return-checkin").addEventListener("click", () => navigate("after"));
  $("#resume-audio").addEventListener("click", async () => { try { await runner.resumeAudio(); $("#resume-audio").hidden = true; } catch (error) { $("#audio-status").textContent = error.message; } });
  $("#save-after").addEventListener("click", () => finishSave(Number($("#after-rating").value)));
  $("#skip-after").addEventListener("click", () => finishSave(undefined));
  $("#export-backup").addEventListener("click", exportBackup);
  $("#import-backup").addEventListener("click", () => $("#backup-file").click());
  $("#backup-file").addEventListener("change", async (event) => { try { await importBackup(event.target.files[0]); } catch (error) { toast(error.message); } event.target.value = ""; });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || state.screen !== "listening") return;
    requestWakeLock();
    if (runner.tone.ctx?.state !== "running") $("#resume-audio").hidden = false;
  });

  window.addEventListener("pagehide", () => { if (runner.active) runner.stop("stopped"); });

  async function init() {
    try {
      await ensureBuiltInProfiles();
      navigator.storage?.persist?.().catch(() => {});
      if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./service-worker.js").catch(() => {});
      renderAll();
      navigate(data().goals.length ? "home" : "welcome", false);
    } catch (error) {
      toast(error.message);
      renderAll();
      navigate(data().goals.length ? "home" : "welcome", false);
    }
  }

  window.__listeningRoom = { get state() { return { ...state }; }, navigate, store, runner };
  init();
})();
