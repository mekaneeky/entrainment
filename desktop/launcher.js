const refs = {
  runtimeStatus: document.getElementById("runtimeStatus"),
  profileSelect: document.getElementById("profileSelect"),
  newProfileBtn: document.getElementById("newProfileBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  sessionList: document.getElementById("sessionList"),
  profileDialog: document.getElementById("profileDialog"),
  profileName: document.getElementById("profileName"),
  profileNotes: document.getElementById("profileNotes"),
  createProfileBtn: document.getElementById("createProfileBtn"),
};

const state = {
  profiles: [],
  activeProfileId: "default",
  sessions: [],
};

function displayDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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

function renderSessions() {
  refs.sessionList.innerHTML = "";
  if (!state.sessions.length) {
    const empty = document.createElement("div");
    empty.className = "session-meta";
    empty.textContent = "No sessions for this profile yet.";
    refs.sessionList.appendChild(empty);
    return;
  }

  for (const session of state.sessions.slice(0, 30)) {
    const row = document.createElement("div");
    row.className = "session-row";

    const kind = document.createElement("div");
    kind.className = "session-kind";
    kind.textContent = session.applet || session.run_kind || "session";

    const info = document.createElement("div");
    const title = document.createElement("div");
    title.textContent = [session.tags?.join(", "), session.notes].filter(Boolean).join(" | ") || session.id;
    const meta = document.createElement("div");
    meta.className = "session-meta";
    meta.textContent = `Output: ${session.output_path || "-"}${session.raw_recording_path ? " | raw EEG saved" : ""}`;
    info.append(title, meta);

    const when = document.createElement("div");
    when.className = "session-meta";
    when.textContent = displayDate(session.created_at);

    row.append(kind, info, when);
    refs.sessionList.appendChild(row);
  }
}

async function loadProfiles() {
  const payload = await window.appShell.listProfiles();
  state.profiles = payload.profiles || [];
  state.activeProfileId = payload.activeProfileId || "default";
  state.sessions = payload.sessions || [];
  renderProfiles();
  renderSessions();
}

async function refreshSessions() {
  const payload = await window.appShell.listSessions(state.activeProfileId);
  state.sessions = payload.sessions || [];
  renderSessions();
}

refs.profileSelect.addEventListener("change", async () => {
  const payload = await window.appShell.setActiveProfile(refs.profileSelect.value);
  state.profiles = payload.profiles || [];
  state.activeProfileId = payload.activeProfileId || refs.profileSelect.value;
  state.sessions = payload.sessions || [];
  renderProfiles();
  renderSessions();
});

refs.newProfileBtn.addEventListener("click", () => {
  refs.profileName.value = "";
  refs.profileNotes.value = "";
  refs.profileDialog.showModal();
  refs.profileName.focus();
});

refs.createProfileBtn.addEventListener("click", async () => {
  const payload = await window.appShell.createProfile({
    name: refs.profileName.value,
    notes: refs.profileNotes.value,
  });
  state.profiles = payload.profiles || [];
  state.activeProfileId = payload.activeProfileId || payload.profile?.id || "default";
  state.sessions = payload.sessions || [];
  refs.profileDialog.close();
  renderProfiles();
  renderSessions();
});

refs.refreshBtn.addEventListener("click", refreshSessions);

for (const button of document.querySelectorAll("[data-applet]")) {
  button.addEventListener("click", () => window.appShell.openApplet(button.dataset.applet));
}

window.appShell
  .checkPython()
  .then((result) => {
    refs.runtimeStatus.textContent = result.ok ? `Python ready: ${result.python}` : `Python issue: ${result.message}`;
  })
  .catch((err) => {
    refs.runtimeStatus.textContent = `Python check failed: ${err.message || err}`;
  });

loadProfiles().catch((err) => {
  refs.runtimeStatus.textContent = `Profile store failed: ${err.message || err}`;
});
