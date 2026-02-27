const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clinicalQ", {
  checkPython: () => ipcRenderer.invoke("check-python"),
  startSession: (config) => ipcRenderer.invoke("start-session", config),
  startNFBaySession: (config) => ipcRenderer.invoke("start-nfbay-session", config),
  startCoherenceSession: (config) => ipcRenderer.invoke("start-coherence-session", config),
  stopSession: () => ipcRenderer.invoke("stop-session"),
  stopNFBaySession: () => ipcRenderer.invoke("stop-nfbay-session"),
  stopCoherenceSession: () => ipcRenderer.invoke("stop-coherence-session"),
  openResultFile: () => ipcRenderer.invoke("open-result-file"),
  openProtocolFile: () => ipcRenderer.invoke("open-protocol-file"),
  saveProtocolFile: (protocol, suggestedName) =>
    ipcRenderer.invoke("save-protocol-file", { protocol, suggestedName }),
  sendCommand: (command) => ipcRenderer.invoke("send-command", command),
  onSessionEvent: (callback) => {
    const wrapped = (_event, payload) => callback(payload);
    ipcRenderer.on("session-event", wrapped);
    return () => ipcRenderer.removeListener("session-event", wrapped);
  },
});
