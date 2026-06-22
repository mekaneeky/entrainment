const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clinicalQ", {
  listProfiles: () => ipcRenderer.invoke("profiles-list"),
  createProfile: (input) => ipcRenderer.invoke("profiles-create", input),
  setActiveProfile: (profileId) => ipcRenderer.invoke("profiles-set-active", profileId),
  listSessions: (profileId) => ipcRenderer.invoke("sessions-list", profileId),
  loadSession: (sessionId) => ipcRenderer.invoke("sessions-read", sessionId),
  saveSessionSummary: (payload) => ipcRenderer.invoke("save-disentrainment-session-summary", payload),
  openApplet: (applet) => ipcRenderer.invoke("open-applet", applet),
  checkPython: () => ipcRenderer.invoke("check-python"),
  startSession: (config) => ipcRenderer.invoke("start-session", config),
  stopSession: () => ipcRenderer.invoke("stop-session"),
  openResultFile: () => ipcRenderer.invoke("open-result-file"),
  sendCommand: (command) => ipcRenderer.invoke("send-command", command),
  onSessionEvent: (callback) => {
    const wrapped = (_event, payload) => callback(payload);
    ipcRenderer.on("session-event", wrapped);
    return () => ipcRenderer.removeListener("session-event", wrapped);
  },
});

contextBridge.exposeInMainWorld("nfTools", {
  listProfiles: () => ipcRenderer.invoke("profiles-list"),
  createProfile: (input) => ipcRenderer.invoke("profiles-create", input),
  setActiveProfile: (profileId) => ipcRenderer.invoke("profiles-set-active", profileId),
  listSessions: (profileId) => ipcRenderer.invoke("sessions-list", profileId),
  loadSession: (sessionId) => ipcRenderer.invoke("sessions-read", sessionId),
  saveSessionSummary: (payload) => ipcRenderer.invoke("save-disentrainment-session-summary", payload),
  openApplet: (applet) => ipcRenderer.invoke("open-applet", applet),
  checkPython: () => ipcRenderer.invoke("check-python"),
  startClinicalQSession: (config) => ipcRenderer.invoke("start-session", config),
  startBaselineSession: (config) => ipcRenderer.invoke("start-baseline-session", config),
  startTrainingSession: (config) => ipcRenderer.invoke("start-nf-training-session", config),
  stop: () => ipcRenderer.invoke("stop-session"),
  analyzeProgress: (config) => ipcRenderer.invoke("analyze-progress", config),
  openProgressFiles: () => ipcRenderer.invoke("open-progress-files"),
  openProgressDirectory: () => ipcRenderer.invoke("open-progress-directory"),
  onSessionEvent: (callback) => {
    const wrapped = (_event, payload) => callback(payload);
    ipcRenderer.on("session-event", wrapped);
    return () => ipcRenderer.removeListener("session-event", wrapped);
  },
});

contextBridge.exposeInMainWorld("appShell", {
  listProfiles: () => ipcRenderer.invoke("profiles-list"),
  createProfile: (input) => ipcRenderer.invoke("profiles-create", input),
  setActiveProfile: (profileId) => ipcRenderer.invoke("profiles-set-active", profileId),
  listSessions: (profileId) => ipcRenderer.invoke("sessions-list", profileId),
  loadSession: (sessionId) => ipcRenderer.invoke("sessions-read", sessionId),
  saveSessionSummary: (payload) => ipcRenderer.invoke("save-disentrainment-session-summary", payload),
  openApplet: (applet) => ipcRenderer.invoke("open-applet", applet),
  checkPython: () => ipcRenderer.invoke("check-python"),
});

contextBridge.exposeInMainWorld("disentrainmentTools", {
  listProfiles: () => ipcRenderer.invoke("profiles-list"),
  createProfile: (input) => ipcRenderer.invoke("profiles-create", input),
  setActiveProfile: (profileId) => ipcRenderer.invoke("profiles-set-active", profileId),
  listSessions: (profileId) => ipcRenderer.invoke("sessions-list", profileId),
  loadSession: (sessionId) => ipcRenderer.invoke("sessions-read", sessionId),
  saveSessionSummary: (payload) => ipcRenderer.invoke("save-disentrainment-session-summary", payload),
  openApplet: (applet) => ipcRenderer.invoke("open-applet", applet),
  checkPython: () => ipcRenderer.invoke("check-python"),
  measure: (config) => ipcRenderer.invoke("measure-disentrainment", config),
  measureLive: (config) => ipcRenderer.invoke("measure-disentrainment-live", config),
  stop: () => ipcRenderer.invoke("stop-session"),
  onSessionEvent: (callback) => {
    const wrapped = (_event, payload) => callback(payload);
    ipcRenderer.on("session-event", wrapped);
    return () => ipcRenderer.removeListener("session-event", wrapped);
  },
});
