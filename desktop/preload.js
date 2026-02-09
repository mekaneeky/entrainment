const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clinicalQ", {
  checkPython: () => ipcRenderer.invoke("check-python"),
  startSession: (config) => ipcRenderer.invoke("start-session", config),
  stopSession: () => ipcRenderer.invoke("stop-session"),
  onSessionEvent: (callback) => {
    const wrapped = (_event, payload) => callback(payload);
    ipcRenderer.on("session-event", wrapped);
    return () => ipcRenderer.removeListener("session-event", wrapped);
  },
});

