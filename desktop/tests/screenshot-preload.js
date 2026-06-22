const { contextBridge } = require("electron");

const profiles = [{ id: "default", name: "Default Profile" }];
const nfCallbacks = [];
const clinicalCallbacks = [];

function emit(callbacks, payload) {
  for (const callback of callbacks) callback(payload);
}

function sessionApi() {
  return {
    listProfiles: async () => ({ profiles, activeProfileId: "default" }),
    createProfile: async () => ({ profiles, activeProfileId: "default" }),
    setActiveProfile: async () => ({ profiles, activeProfileId: "default" }),
    listSessions: async () => ({ sessions: [] }),
    loadSession: async () => ({ session: null, result: null }),
    saveSessionSummary: async () => ({ ok: true }),
    openApplet: async () => ({ ok: true }),
    checkPython: async () => ({ ok: true, message: "Screenshot runtime", python: "synthetic" }),
    stopSession: async () => ({ stopped: false, reason: "screenshot" }),
    sendCommand: async () => ({ ok: true }),
    onSessionEvent: () => () => {},
  };
}

contextBridge.exposeInMainWorld("nfTools", {
  ...sessionApi(),
  startBaselineSession: async () => ({ result: { locations: [] }, outputPath: "" }),
  startClinicalQSession: async () => ({
    result: {
      summary: { out_of_range: 2, in_range: 3, missing: 0 },
      metrics: [
        { location: "O1", metric: "Theta/Beta ratio", status: "OUT_OF_RANGE", probe: "Sleep onset / rumination?" },
        { location: "Cz", metric: "Theta/SMR ratio", status: "OUT_OF_RANGE", probe: "Attention / stillness?" },
      ],
    },
    outputPath: "",
  }),
  startTrainingSession: async () => {
    emit(nfCallbacks, {
      event: "nf_training_start",
      protocol_id: "o1_theta_beta_ratio_downtrain",
      protocol_label: "O1 theta/beta downtrain",
      headers: ["theta", "beta", "theta_beta", "ratio_pass", "feedback"],
    });
    emit(nfCallbacks, {
      event: "nf_training_window",
      elapsed_seconds: 1,
      feedback: 100,
      values: { theta: 5.2, beta: 3.1, theta_beta: 1.68, ratio_pass: 1, feedback: 100 },
    });
    return { result: {}, outputPath: "" };
  },
  analyzeProgress: async () => ({
    result: {
      sessions: [
        { date: "2026-06-10T00:00:00Z" },
        { date: "2026-06-12T00:00:00Z" },
        { date: "2026-06-14T00:00:00Z" },
      ],
      metrics: [
        { key: "nf_training:o1:theta_beta:mean", label: "O1 theta/beta mean", source: "nf_training", count: 3 },
        { key: "nf_training:o1:feedback:mean", label: "O1 feedback mean", source: "nf_training", count: 3 },
      ],
      series: {
        "nf_training:o1:theta_beta:mean": [
          { date: "2026-06-10T00:00:00Z", value: 1.9, title: "session 1" },
          { date: "2026-06-12T00:00:00Z", value: 1.7, title: "session 2" },
          { date: "2026-06-14T00:00:00Z", value: 1.55, title: "session 3" },
        ],
        "nf_training:o1:feedback:mean": [
          { date: "2026-06-10T00:00:00Z", value: 45, title: "session 1" },
          { date: "2026-06-12T00:00:00Z", value: 62, title: "session 2" },
          { date: "2026-06-14T00:00:00Z", value: 78, title: "session 3" },
        ],
      },
    },
    outputPath: "",
  }),
  openProgressFiles: async () => ({ canceled: true }),
  openProgressDirectory: async () => ({ canceled: true }),
  stop: async () => ({ stopped: false, reason: "screenshot" }),
  onSessionEvent: (callback) => {
    nfCallbacks.push(callback);
    return () => {};
  },
});

contextBridge.exposeInMainWorld("clinicalQ", {
  ...sessionApi(),
  startSession: async () => ({ result: { metrics: [] }, outputPath: "" }),
  openResultFile: async () => ({ canceled: true }),
  onSessionEvent: (callback) => {
    clinicalCallbacks.push(callback);
    return () => {};
  },
});
