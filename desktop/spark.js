(function () {
  const refs = {
    panel: document.getElementById("sparkPanel"),
    status: document.getElementById("sparkStatus"),
    variant: document.getElementById("sparkVariant"),
    duration: document.getElementById("sparkDuration"),
    samplingRate: document.getElementById("sparkSamplingRate"),
    eventHz: document.getElementById("sparkEventHz"),
    serialPort: document.getElementById("sparkSerialPort"),
    protocolName: document.getElementById("sparkProtocolName"),
    useSynthetic: document.getElementById("sparkUseSynthetic"),
    fastMode: document.getElementById("sparkFastMode"),
    newBlockType: document.getElementById("sparkNewBlockType"),
    addBlockBtn: document.getElementById("sparkAddBlockBtn"),
    alphaPresetBtn: document.getElementById("sparkAlphaPresetBtn"),
    resPresetBtn: document.getElementById("sparkResPresetBtn"),
    blocks: document.getElementById("sparkBlocks"),
    saveProtocolBtn: document.getElementById("sparkSaveProtocolBtn"),
    loadProtocolBtn: document.getElementById("sparkLoadProtocolBtn"),
    exportConfigBtn: document.getElementById("sparkExportConfigBtn"),
    preview: document.getElementById("sparkProtocolPreview"),
    startBtn: document.getElementById("sparkStartBtn"),
    stopBtn: document.getElementById("sparkStopBtn"),
    liveHeadline: document.getElementById("sparkLiveHeadline"),
    kpiMode: document.getElementById("sparkKpiMode"),
    kpiSamples: document.getElementById("sparkKpiSamples"),
    kpiFeedback: document.getElementById("sparkKpiFeedback"),
    kpiPrimary: document.getElementById("sparkKpiPrimary"),
    trendCanvas: document.getElementById("sparkTrendCanvas"),
    siteBody: document.getElementById("sparkSiteBody"),
    eventLog: document.getElementById("sparkEventLog"),
  };

  if (!refs.panel) return;

  const PARAM_OPTIONS = {
    target_mode: [
      { value: "dominant_plus_return", label: "dominant + offset <-> dominant" },
      { value: "dominant_plus_minus", label: "dominant + offset <-> dominant - offset" },
    ],
    combine_mode: [
      { value: "mean", label: "Mean feedback" },
      { value: "sum", label: "Sum feedback" },
    ],
  };

  const VARIANT_BLOCK_MENU = {
    alpha_theta: ["InputBlock", "ThetaBandBlock", "AlphaBandBlock", "SmoothingBlock", "RewardGateBlock", "InhibitGateBlock", "FeedbackSignalBlock"],
    resilience: ["GlobalResilienceBlock", "ResilienceSiteBlock"],
  };

  const state = {
    running: false,
    protocol: defaultAlphaProtocol(),
    trendPrimary: [],
    trendSecondary: [],
    drawScheduled: false,
    latestBySite: {},
  };

  function stamp() {
    return new Date().toLocaleTimeString();
  }

  function sparkLog(text) {
    const row = document.createElement("div");
    row.className = "event-row";
    row.textContent = `[${stamp()}] ${text}`;
    refs.eventLog.prepend(row);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function uid(prefix = "block") {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function blockTemplate(type) {
    if (type === "InputBlock") {
      return { id: uid("input"), type, label: "Input Block", params: { channel: 1 } };
    }
    if (type === "ThetaBandBlock") {
      return { id: uid("theta"), type, label: "Theta Magnitude Block", params: { theta_center_hz: 6.0, theta_width_hz: 2.0, magnitude_order: 4 } };
    }
    if (type === "AlphaBandBlock") {
      return { id: uid("alpha"), type, label: "Alpha Magnitude Block", params: { alpha_center_hz: 10.0, alpha_width_hz: 2.0, magnitude_order: 4 } };
    }
    if (type === "SmoothingBlock") {
      return { id: uid("smooth"), type, label: "Average Block", params: { smoothing_interval: 24 } };
    }
    if (type === "RewardGateBlock") {
      return { id: uid("reward"), type, label: "Reward Threshold Block", params: { ratio_reward_lower: 1.2, ratio_reward_upper: 10.0 } };
    }
    if (type === "InhibitGateBlock") {
      return { id: uid("inhibit"), type, label: "Inhibit Threshold Block", params: { alpha_inhibit_upper: 30.0 } };
    }
    if (type === "FeedbackSignalBlock") {
      return { id: uid("signal"), type, label: "Feedback Signal Block", params: { feedback_frequency_hz: 220.0, feedback_gain: 180.0, feedback_noise: 0 } };
    }
    if (type === "GlobalResilienceBlock") {
      return {
        id: uid("global"),
        type,
        label: "Resilience Core Block",
        params: {
          combine_mode: "mean",
          baseline_seconds: 5.0,
          analysis_window_seconds: 2.0,
          analysis_hop_seconds: 0.25,
          dominant_band_low_hz: 4.0,
          dominant_band_high_hz: 16.0,
          stickiness_window_seconds: 60.0,
          met_hold_samples: 1,
          switch_cooldown_seconds: 0.15,
        },
      };
    }
    if (type === "ResilienceSiteBlock") {
      return {
        id: uid("site"),
        type,
        label: "Resilience Site Block",
        params: {
          site: "Cz",
          channel: 1,
          offset_hz: 2.0,
          target_mode: "dominant_plus_return",
          target_tolerance_hz: 0.05,
          tone_a_hz: 440.0,
          tone_b_hz: 660.0,
          tone_gain: 180.0,
          tone_noise: 0,
        },
      };
    }
    return { id: uid("custom"), type, label: type, params: {} };
  }

  function defaultAlphaProtocol() {
    return {
      name: "Spark Alpha Theta v1",
      variant: "alpha_theta",
      duration_seconds: 180,
      sampling_rate: 250,
      event_hz: 20,
      board: {
        serial_port: "COM3",
        use_synthetic: true,
        fast_mode: true,
      },
      blocks: [
        blockTemplate("InputBlock"),
        blockTemplate("ThetaBandBlock"),
        blockTemplate("AlphaBandBlock"),
        blockTemplate("SmoothingBlock"),
        blockTemplate("RewardGateBlock"),
        blockTemplate("InhibitGateBlock"),
        blockTemplate("FeedbackSignalBlock"),
      ],
    };
  }

  function defaultResilienceProtocol() {
    const cz = blockTemplate("ResilienceSiteBlock");
    cz.params.site = "Cz";
    cz.params.channel = 1;
    const pz = blockTemplate("ResilienceSiteBlock");
    pz.params.site = "Pz";
    pz.params.channel = 2;
    pz.params.offset_hz = 1.5;
    pz.params.target_mode = "dominant_plus_minus";

    return {
      name: "Spark Resilience v1",
      variant: "resilience",
      duration_seconds: 180,
      sampling_rate: 250,
      event_hz: 20,
      board: {
        serial_port: "COM3",
        use_synthetic: true,
        fast_mode: true,
      },
      blocks: [blockTemplate("GlobalResilienceBlock"), cz, pz],
    };
  }

  function setRunning(running) {
    state.running = Boolean(running);
    refs.startBtn.disabled = state.running;
    refs.stopBtn.disabled = !state.running;
  }

  function setStatus(text) {
    refs.status.textContent = text;
  }

  function coerceByExample(raw, example) {
    if (typeof example === "boolean") return Boolean(raw);
    if (typeof example === "number") {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : example;
    }
    return String(raw ?? "");
  }

  function normalizeProtocol(payload) {
    if (!payload || typeof payload !== "object") throw new Error("Protocol JSON must be an object.");
    const protocol = payload.protocol && typeof payload.protocol === "object" ? payload.protocol : payload;
    const variant = String(protocol.variant || "").trim().toLowerCase();
    if (!["alpha_theta", "resilience"].includes(variant)) {
      throw new Error("Protocol must define variant as 'alpha_theta' or 'resilience'.");
    }
    if (!Array.isArray(protocol.blocks)) throw new Error("Protocol is missing blocks[].");
    return {
      name: String(protocol.name || (variant === "alpha_theta" ? "Spark Alpha Theta" : "Spark Resilience")),
      variant,
      duration_seconds: Number(protocol.duration_seconds || 180),
      sampling_rate: Number(protocol.sampling_rate || 250),
      event_hz: Number(protocol.event_hz || 20),
      board: {
        serial_port: String(protocol.board?.serial_port || "COM3"),
        use_synthetic: Boolean(protocol.board?.use_synthetic ?? true),
        fast_mode: Boolean(protocol.board?.fast_mode ?? true),
      },
      blocks: protocol.blocks.map((item) => ({
        id: String(item.id || uid("block")),
        type: String(item.type || "CustomBlock"),
        label: String(item.label || item.type || "Custom Block"),
        params: item.params && typeof item.params === "object" ? clone(item.params) : {},
      })),
    };
  }

  function populateBlockTypeMenu() {
    const variant = String(state.protocol.variant || "alpha_theta");
    const types = VARIANT_BLOCK_MENU[variant] || [];
    refs.newBlockType.innerHTML = "";
    for (const type of types) {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      refs.newBlockType.appendChild(option);
    }
  }

  function renderPreview() {
    updateProtocolFromTopFields();
    refs.preview.textContent = JSON.stringify(state.protocol, null, 2);
  }

  function syncTopFields() {
    refs.variant.value = state.protocol.variant;
    refs.duration.value = String(state.protocol.duration_seconds);
    refs.samplingRate.value = String(state.protocol.sampling_rate);
    refs.eventHz.value = String(state.protocol.event_hz);
    refs.protocolName.value = state.protocol.name;
    refs.serialPort.value = state.protocol.board?.serial_port || "COM3";
    refs.useSynthetic.checked = Boolean(state.protocol.board?.use_synthetic ?? true);
    refs.fastMode.checked = Boolean(state.protocol.board?.fast_mode ?? true);
  }

  function updateProtocolFromTopFields() {
    state.protocol.variant = String(refs.variant.value || "alpha_theta");
    state.protocol.duration_seconds = Math.max(10, Number(refs.duration.value || 180));
    state.protocol.sampling_rate = Math.max(50, Number(refs.samplingRate.value || 250));
    state.protocol.event_hz = Math.max(1, Number(refs.eventHz.value || 20));
    state.protocol.name = String(refs.protocolName.value || "Spark Protocol");
    state.protocol.board = state.protocol.board || {};
    state.protocol.board.serial_port = String(refs.serialPort.value || "COM3");
    state.protocol.board.use_synthetic = Boolean(refs.useSynthetic.checked);
    state.protocol.board.fast_mode = Boolean(refs.fastMode.checked);
  }

  function renderBlocks() {
    refs.blocks.innerHTML = "";

    state.protocol.blocks.forEach((block, index) => {
      const card = document.createElement("div");
      card.className = "spark-block";

      const head = document.createElement("div");
      head.className = "spark-block-head";

      const title = document.createElement("div");
      title.className = "spark-block-title";
      title.textContent = block.label || block.type;
      head.appendChild(title);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        state.protocol.blocks.splice(index, 1);
        renderBuilder();
      });
      head.appendChild(remove);
      card.appendChild(head);

      const body = document.createElement("div");
      body.className = "spark-block-grid";

      const keys = Object.keys(block.params || {});
      if (!keys.length) {
        const empty = document.createElement("div");
        empty.className = "key-empty";
        empty.textContent = "No editable params in this block.";
        body.appendChild(empty);
      }

      for (const key of keys) {
        const value = block.params[key];
        const label = document.createElement("label");
        label.textContent = key;

        const options = PARAM_OPTIONS[key];
        if (options && Array.isArray(options)) {
          const select = document.createElement("select");
          for (const opt of options) {
            const option = document.createElement("option");
            option.value = opt.value;
            option.textContent = opt.label;
            select.appendChild(option);
          }
          select.value = String(value);
          select.addEventListener("change", () => {
            block.params[key] = String(select.value);
            renderPreview();
          });
          label.appendChild(select);
          body.appendChild(label);
          continue;
        }

        if (typeof value === "boolean") {
          const input = document.createElement("input");
          input.type = "checkbox";
          input.checked = Boolean(value);
          input.addEventListener("change", () => {
            block.params[key] = Boolean(input.checked);
            renderPreview();
          });
          label.className = "toggle";
          label.innerHTML = "";
          const span = document.createElement("span");
          span.textContent = key;
          label.appendChild(input);
          label.appendChild(span);
          body.appendChild(label);
          continue;
        }

        const input = document.createElement("input");
        input.type = typeof value === "number" ? "number" : "text";
        if (typeof value === "number") input.step = "any";
        input.value = String(value ?? "");
        input.addEventListener("change", () => {
          block.params[key] = coerceByExample(input.value, value);
          renderPreview();
        });
        label.appendChild(input);
        body.appendChild(label);
      }

      card.appendChild(body);
      refs.blocks.appendChild(card);
    });
  }

  function renderBuilder() {
    syncTopFields();
    populateBlockTypeMenu();
    renderBlocks();
    renderPreview();
  }

  function resetSparkTelemetry() {
    state.trendPrimary = [];
    state.trendSecondary = [];
    state.latestBySite = {};
    refs.kpiMode.textContent = String(state.protocol.variant || "-");
    refs.kpiSamples.textContent = "0 / 0";
    refs.kpiFeedback.textContent = "0.000";
    refs.kpiPrimary.textContent = "-";
    refs.siteBody.innerHTML = "";
    drawTrendNow();
  }

  function pushTrend(primary, secondary) {
    state.trendPrimary.push(Number.isFinite(primary) ? primary : 0.0);
    state.trendSecondary.push(Number.isFinite(secondary) ? secondary : 0.0);
    if (state.trendPrimary.length > 260) state.trendPrimary.shift();
    if (state.trendSecondary.length > 260) state.trendSecondary.shift();
    scheduleDrawTrend();
  }

  function scheduleDrawTrend() {
    if (state.drawScheduled) return;
    state.drawScheduled = true;
    window.requestAnimationFrame(() => {
      state.drawScheduled = false;
      drawTrendNow();
    });
  }

  function drawTrendNow() {
    const canvas = refs.trendCanvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    const padLeft = 42;
    const padTop = 10;
    const padBottom = 20;
    const plotW = width - padLeft - 12;
    const plotH = height - padTop - padBottom;
    if (plotW < 20 || plotH < 20) return;

    const seriesA = state.trendPrimary;
    const seriesB = state.trendSecondary;
    const n = Math.max(seriesA.length, seriesB.length);

    let yMax = 1;
    for (const v of seriesA) yMax = Math.max(yMax, v);
    for (const v of seriesB) yMax = Math.max(yMax, v);
    yMax *= 1.1;

    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    for (let i = 0; i <= 4; i += 1) {
      const y = padTop + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.font = `${Math.max(11, Math.floor(11 * dpr))}px Bahnschrift, sans-serif`;
    ctx.fillText(yMax.toFixed(2), 6, padTop + 10);
    ctx.fillText("0", 6, padTop + plotH);

    const drawLine = (series, color) => {
      if (!series || series.length < 2) return;
      const step = plotW / Math.max(1, series.length - 1);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < series.length; i += 1) {
        const x = padLeft + i * step;
        const y = padTop + plotH - (Math.max(0, series[i]) / yMax) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    drawLine(seriesA, "#0b8da3");
    drawLine(seriesB, "#a9302f");

    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillText("Primary", padLeft, height - 5);
    ctx.fillStyle = "#0b8da3";
    ctx.fillRect(padLeft + 62, height - 14, 14, 4);
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillText("Feedback", padLeft + 84, height - 5);
    ctx.fillStyle = "#a9302f";
    ctx.fillRect(padLeft + 158, height - 14, 14, 4);
  }

  function renderSiteTable(bySite) {
    refs.siteBody.innerHTML = "";
    const entries = Object.entries(bySite || {});
    if (!entries.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.textContent = "No per-site data for this variant.";
      row.appendChild(cell);
      refs.siteBody.appendChild(row);
      return;
    }

    for (const [site, payload] of entries) {
      const dominant = numericOrNaN(payload?.dominant_hz);
      const target = numericOrNaN(payload?.current_target_hz);
      const stickiness = numericOrNaN(payload?.stickiness_ratio_60s);
      const row = document.createElement("tr");
      const cells = [
        site,
        fmt(dominant, 2),
        fmt(target, 2),
        String(payload?.active_phase ?? "-"),
        payload?.target_met_or_exceeded ? "yes" : "no",
        fmt(stickiness, 3),
      ];
      for (const text of cells) {
        const cell = document.createElement("td");
        cell.textContent = text;
        row.appendChild(cell);
      }
      refs.siteBody.appendChild(row);
    }
  }

  function runtimeConfigFromProtocol() {
    updateProtocolFromTopFields();
    const protocol = state.protocol;
    const variant = String(protocol.variant || "alpha_theta");
    const config = {
      variant,
      duration_seconds: Number(protocol.duration_seconds || 180),
      sampling_rate: Number(protocol.sampling_rate || 250),
      event_hz: Number(protocol.event_hz || 20),
      fast_mode: Boolean(protocol.board?.fast_mode ?? true),
      board: {
        board_id: "cyton",
        serial_port: String(protocol.board?.serial_port || "COM3"),
        use_synthetic: Boolean(protocol.board?.use_synthetic ?? true),
        available_channels: [1, 2, 3, 4, 5, 6, 7, 8],
        seed: 42,
      },
      channels: {},
      protocol_blocks: clone(protocol.blocks || []),
    };

    if (variant === "alpha_theta") {
      const alpha = {};
      let inputChannel = 1;
      for (const block of protocol.blocks || []) {
        const params = block.params || {};
        for (const [k, v] of Object.entries(params)) {
          alpha[k] = v;
        }
        if (block.type === "InputBlock") {
          const ch = Number(params.channel);
          if (Number.isFinite(ch) && ch >= 1) inputChannel = Math.floor(ch);
        }
      }
      alpha.channel = inputChannel;
      config.alpha_theta = alpha;
      config.channels.Cz = inputChannel;
      return config;
    }

    const resilience = { combine_mode: "mean", sites: {} };
    let global = {};
    for (const block of protocol.blocks || []) {
      if (block.type === "GlobalResilienceBlock") {
        global = { ...(block.params || {}) };
        if (global.combine_mode) resilience.combine_mode = String(global.combine_mode);
      }
    }
    let siteCount = 0;
    for (const block of protocol.blocks || []) {
      if (block.type !== "ResilienceSiteBlock") continue;
      const params = { ...global, ...(block.params || {}) };
      const siteName = String(params.site || `Site${siteCount + 1}`).trim() || `Site${siteCount + 1}`;
      const channel = Math.max(1, Number(params.channel || siteCount + 1));
      params.channel = channel;
      resilience.sites[siteName] = params;
      config.channels[siteName] = channel;
      siteCount += 1;
    }
    if (!siteCount) {
      resilience.sites.Cz = { ...global, channel: 1, site: "Cz", offset_hz: 2.0, target_mode: "dominant_plus_return" };
      config.channels.Cz = 1;
    }
    config.resilience = resilience;
    return config;
  }

  function numericOrNaN(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
  }

  function fmt(value, digits = 3) {
    return Number.isFinite(value) ? value.toFixed(digits) : "-";
  }

  async function copyRuntimeConfig() {
    const config = runtimeConfigFromProtocol();
    const text = JSON.stringify(config, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      sparkLog("Runtime config copied to clipboard.");
      refs.liveHeadline.textContent = "Runtime config copied to clipboard.";
    } catch {
      refs.liveHeadline.textContent = "Clipboard unavailable. Open devtools and copy from preview.";
      sparkLog("Clipboard write failed.");
    }
  }

  function handleTick(event) {
    const variant = String(event.variant || state.protocol.variant || "");
    const payload = event.data || {};
    refs.kpiMode.textContent = variant || "-";
    refs.kpiSamples.textContent = `${Number(event.samples_processed || 0)} / ${Number(event.total_samples || 0)}`;

    if (variant === "alpha_theta") {
      const ratio = numericOrNaN(payload.ratio);
      const feedback = numericOrNaN(payload.feedback_signal);
      refs.kpiFeedback.textContent = fmt(feedback, 3);
      refs.kpiPrimary.textContent = fmt(ratio, 3);
      refs.liveHeadline.textContent = `Alpha/Theta live: ratio ${fmt(ratio, 3)} | feedback ${fmt(feedback, 3)}`;
      renderSiteTable({});
      pushTrend(Number.isFinite(ratio) ? ratio : 0.0, Number.isFinite(feedback) ? Math.abs(feedback) : 0.0);
      return;
    }

    const feedback = numericOrNaN(payload.combined_feedback_signal);
    refs.kpiFeedback.textContent = fmt(feedback, 3);
    const bySite = payload.by_site && typeof payload.by_site === "object" ? payload.by_site : {};
    state.latestBySite = bySite;
    renderSiteTable(bySite);

    const stickinessValues = Object.values(bySite)
      .map((row) => Number(row?.stickiness_ratio_60s))
      .filter((v) => Number.isFinite(v));
    const stickinessAvg =
      stickinessValues.length > 0 ? stickinessValues.reduce((acc, v) => acc + v, 0.0) / stickinessValues.length : 0.0;
    refs.kpiPrimary.textContent = stickinessAvg.toFixed(3);
    refs.liveHeadline.textContent = `Resilience live: stickiness ${stickinessAvg.toFixed(3)} | combined feedback ${fmt(feedback, 3)}`;
    pushTrend(stickinessAvg, Number.isFinite(feedback) ? Math.abs(feedback) : 0.0);
  }

  window.clinicalQ.onSessionEvent((event) => {
    if (!event || typeof event !== "object") return;
    const name = String(event.event || "");
    const runKind = String(event.runKind || "").toLowerCase();
    const scopedToSpark = runKind === "nfbay" || name.startsWith("nfbay_");
    if (!scopedToSpark) return;

    if (name === "nfbay_start") {
      setStatus("Spark running...");
      sparkLog(`Spark run started (${event.variant}).`);
      return;
    }
    if (name === "nfbay_board_ready") {
      sparkLog(`Board ready (${event.sampling_rate} Hz, update every ${event.update_samples} samples).`);
      return;
    }
    if (name === "nfbay_tick") {
      handleTick(event);
      return;
    }
    if (name === "nfbay_complete") {
      sparkLog("Spark run complete.");
      return;
    }
    if (name === "nfbay_session_stopped") {
      sparkLog("Spark stop signal sent.");
      refs.liveHeadline.textContent = "Spark run stopped.";
      return;
    }
    if (name === "error") {
      sparkLog(`Spark backend error: ${event.message || "unknown error"}`);
      refs.liveHeadline.textContent = `Spark backend error: ${event.message || "unknown error"}`;
    }
  });

  refs.addBlockBtn.addEventListener("click", () => {
    const type = String(refs.newBlockType.value || "");
    if (!type) return;
    const block = blockTemplate(type);
    if (type === "ResilienceSiteBlock") {
      const existingSites = (state.protocol.blocks || []).filter((b) => b.type === "ResilienceSiteBlock").length;
      block.params.site = `Site${existingSites + 1}`;
      block.params.channel = Math.min(8, existingSites + 1);
    }
    state.protocol.blocks.push(block);
    renderBuilder();
  });

  refs.alphaPresetBtn.addEventListener("click", () => {
    const keepBoard = clone(state.protocol.board || {});
    const next = defaultAlphaProtocol();
    next.board = { ...next.board, ...keepBoard };
    state.protocol = next;
    resetSparkTelemetry();
    renderBuilder();
    sparkLog("Loaded Alpha/Theta preset.");
  });

  refs.resPresetBtn.addEventListener("click", () => {
    const keepBoard = clone(state.protocol.board || {});
    const next = defaultResilienceProtocol();
    next.board = { ...next.board, ...keepBoard };
    state.protocol = next;
    resetSparkTelemetry();
    renderBuilder();
    sparkLog("Loaded Resilience preset.");
  });

  refs.variant.addEventListener("change", () => {
    const selected = String(refs.variant.value || "alpha_theta");
    const keep = {
      serial_port: refs.serialPort.value,
      use_synthetic: refs.useSynthetic.checked,
      fast_mode: refs.fastMode.checked,
    };
    state.protocol = selected === "resilience" ? defaultResilienceProtocol() : defaultAlphaProtocol();
    state.protocol.board = { ...state.protocol.board, ...keep };
    state.protocol.duration_seconds = Math.max(10, Number(refs.duration.value || state.protocol.duration_seconds));
    state.protocol.sampling_rate = Math.max(50, Number(refs.samplingRate.value || state.protocol.sampling_rate));
    state.protocol.event_hz = Math.max(1, Number(refs.eventHz.value || state.protocol.event_hz));
    renderBuilder();
    sparkLog(`Switched builder to ${selected}.`);
  });

  refs.duration.addEventListener("change", renderPreview);
  refs.samplingRate.addEventListener("change", renderPreview);
  refs.eventHz.addEventListener("change", renderPreview);
  refs.protocolName.addEventListener("change", renderPreview);
  refs.serialPort.addEventListener("change", renderPreview);
  refs.useSynthetic.addEventListener("change", renderPreview);
  refs.fastMode.addEventListener("change", renderPreview);

  refs.saveProtocolBtn.addEventListener("click", async () => {
    try {
      updateProtocolFromTopFields();
      const suggested = `${String(state.protocol.name || "spark-protocol").replace(/\s+/g, "-").toLowerCase()}.json`;
      const saved = await window.clinicalQ.saveProtocolFile(state.protocol, suggested);
      if (!saved || saved.canceled) return;
      sparkLog(`Protocol saved: ${saved.filePath}`);
      refs.liveHeadline.textContent = `Saved protocol: ${saved.filePath}`;
    } catch (err) {
      sparkLog(`Save failed: ${err.message || err}`);
      refs.liveHeadline.textContent = `Save failed: ${err.message || err}`;
    }
  });

  refs.loadProtocolBtn.addEventListener("click", async () => {
    try {
      const picked = await window.clinicalQ.openProtocolFile();
      if (!picked || picked.canceled) return;
      state.protocol = normalizeProtocol(picked.protocol);
      resetSparkTelemetry();
      renderBuilder();
      sparkLog(`Loaded protocol: ${picked.filePath}`);
      refs.liveHeadline.textContent = `Loaded protocol: ${picked.filePath}`;
    } catch (err) {
      sparkLog(`Load failed: ${err.message || err}`);
      refs.liveHeadline.textContent = `Load failed: ${err.message || err}`;
    }
  });

  refs.exportConfigBtn.addEventListener("click", async () => {
    await copyRuntimeConfig();
  });

  refs.startBtn.addEventListener("click", async () => {
    if (state.running) return;
    try {
      updateProtocolFromTopFields();
      const config = runtimeConfigFromProtocol();
      setRunning(true);
      setStatus("Spark running...");
      resetSparkTelemetry();
      refs.liveHeadline.textContent = "Starting Spark run...";
      sparkLog(`Starting Spark ${config.variant} run.`);

      const payload = await window.clinicalQ.startNFBaySession(config);
      const summary = payload?.result?.summary || {};
      refs.liveHeadline.textContent = `Spark complete. Summary: ${JSON.stringify(summary)}`;
      sparkLog("Spark run completed.");
    } catch (err) {
      refs.liveHeadline.textContent = `Spark run failed: ${err.message || err}`;
      sparkLog(`Spark run failed: ${err.message || err}`);
    } finally {
      setRunning(false);
      setStatus("Idle");
    }
  });

  refs.stopBtn.addEventListener("click", async () => {
    if (!state.running) return;
    const result = await window.clinicalQ.stopNFBaySession();
    sparkLog(result.stopped ? "Stop signal sent to Spark run." : `Stop ignored: ${result.reason}`);
    setRunning(false);
    setStatus("Idle");
  });

  window.addEventListener("resize", scheduleDrawTrend);

  renderBuilder();
  resetSparkTelemetry();
})();
