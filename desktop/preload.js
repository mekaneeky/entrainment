const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clinicalQ", {
  checkPython: () => ipcRenderer.invoke("check-python"),
  startSession: (config) => ipcRenderer.invoke("start-session", config),
  startCoherenceSession: (config) => ipcRenderer.invoke("start-coherence-session", config),
  stopSession: () => ipcRenderer.invoke("stop-session"),
  stopCoherenceSession: () => ipcRenderer.invoke("stop-coherence-session"),
  openResultFile: () => ipcRenderer.invoke("open-result-file"),
  openEegRecordingFiles: () => ipcRenderer.invoke("open-eeg-recording-files"),
  openPlannerWindow: () => ipcRenderer.invoke("open-planner-window"),
  sendCommand: (command) => ipcRenderer.invoke("send-command", command),
  onSessionEvent: (callback) => {
    const wrapped = (_event, payload) => callback(payload);
    ipcRenderer.on("session-event", wrapped);
    return () => ipcRenderer.removeListener("session-event", wrapped);
  },
});
