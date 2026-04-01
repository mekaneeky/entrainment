const refs = {
  plannerChannelCount: document.getElementById("plannerChannelCount"),
  plannerReadings: document.getElementById("plannerReadings"),
  plannerClearBtn: document.getElementById("plannerClearBtn"),
  plannerStats: document.getElementById("plannerStats"),
  plannerTargets: document.getElementById("plannerTargets"),
  plannerGroups: document.getElementById("plannerGroups"),
  plannerNotes: document.getElementById("plannerNotes"),
};

const TARGET_MONTAGE_19 = [
  "Fp1",
  "Fp2",
  "F7",
  "F3",
  "Fz",
  "F4",
  "F8",
  "T7",
  "C3",
  "Cz",
  "C4",
  "T8",
  "P7",
  "P3",
  "Pz",
  "P4",
  "P8",
  "O1",
  "O2",
];

const POSITION_LOOKUP = (() => {
  const entries = new Map();
  for (const pos of TARGET_MONTAGE_19) {
    entries.set(String(pos).replace(/[^a-z0-9]/gi, "").toUpperCase(), pos);
  }
  entries.set("T3", "T7");
  entries.set("T4", "T8");
  entries.set("T5", "P7");
  entries.set("T6", "P8");
  return entries;
})();

const TARGET_SITE_COUNT = TARGET_MONTAGE_19.length;
const FULL_19_PAIR_COUNT = (TARGET_SITE_COUNT * (TARGET_SITE_COUNT - 1)) / 2;
const SITE_INDEX = new Map(TARGET_MONTAGE_19.map((site, index) => [site, index]));
const ALL_PAIR_KEYS = (() => {
  const pairs = [];
  for (let i = 0; i < TARGET_MONTAGE_19.length; i += 1) {
    for (let j = i + 1; j < TARGET_MONTAGE_19.length; j += 1) {
      pairs.push(`${TARGET_MONTAGE_19[i]}|${TARGET_MONTAGE_19[j]}`);
    }
  }
  return pairs;
})();

function plannerPositionKey(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
}

function normalizePlannerPosition(value) {
  const key = plannerPositionKey(value);
  if (!key) return null;
  return POSITION_LOOKUP.get(key) || null;
}

function pairKey(left, right) {
  return SITE_INDEX.get(left) <= SITE_INDEX.get(right) ? `${left}|${right}` : `${right}|${left}`;
}

function pairCapacity(size) {
  const n = Number(size);
  if (!Number.isFinite(n) || n < 2) return 0;
  return (n * (n - 1)) / 2;
}

function parsePlannerReadings(text) {
  const readings = [];
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/);

  lines.forEach((rawLine, idx) => {
    const original = String(rawLine || "").trim();
    if (!original) return;

    const cleaned = original.replace(/^\s*(reading|recording|group|pass)\s*\d*\s*[:=-]\s*/i, "");
    const tokens = cleaned
      .split(/[,\s;/|]+/)
      .map((token) => token.trim())
      .filter(Boolean);

    const positions = [];
    const seen = new Set();
    const duplicates = [];

    for (const token of tokens) {
      const normalized = normalizePlannerPosition(token);
      if (!normalized) {
        warnings.push(`Line ${idx + 1}: "${token}" is not a recognized 10-20 site.`);
        continue;
      }
      if (seen.has(normalized)) {
        duplicates.push(normalized);
        continue;
      }
      seen.add(normalized);
      positions.push(normalized);
    }

    if (duplicates.length) {
      warnings.push(`Line ${idx + 1}: duplicate sites ignored inside the same reading (${duplicates.join(", ")}).`);
    }
    if (!positions.length) return;

    readings.push({
      index: readings.length + 1,
      entered: [...positions],
      positions: [...positions],
      autoFilled: [],
      generated: false,
      overflow: false,
      newPairsCovered: 0,
    });
  });

  return { readings, warnings };
}

function combinationSearch(items, chooseCount, visit) {
  if (chooseCount < 0 || chooseCount > items.length) return;
  if (chooseCount === 0) {
    visit([]);
    return;
  }

  const current = [];
  function step(startIndex, remaining) {
    if (remaining === 0) {
      visit([...current]);
      return;
    }
    for (let i = startIndex; i <= items.length - remaining; i += 1) {
      current.push(items[i]);
      step(i + 1, remaining - 1);
      current.pop();
    }
  }

  step(0, chooseCount);
}

function combinationCount(n, k) {
  if (k < 0 || k > n) return 0;
  const r = Math.min(k, n - k);
  let total = 1;
  for (let i = 1; i <= r; i += 1) {
    total = (total * (n - r + i)) / i;
  }
  return Math.round(total);
}

function uncoveredPairsInBlock(positions, uncoveredSet) {
  let score = 0;
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      if (uncoveredSet.has(pairKey(positions[i], positions[j]))) score += 1;
    }
  }
  return score;
}

function applyCoverage(positions, uncoveredSet) {
  let covered = 0;
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      if (uncoveredSet.delete(pairKey(positions[i], positions[j]))) covered += 1;
    }
  }
  return covered;
}

function orderedUniquePositions(items) {
  const wanted = new Set(items || []);
  return TARGET_MONTAGE_19.filter((site) => wanted.has(site));
}

function exactBestBlock(basePositions, blockSize, uncoveredSet) {
  const base = orderedUniquePositions(basePositions);
  const baseSet = new Set(base);
  const remaining = TARGET_MONTAGE_19.filter((site) => !baseSet.has(site));
  const addCount = Math.max(0, blockSize - base.length);
  if (addCount === 0) {
    return { positions: base, score: uncoveredPairsInBlock(base, uncoveredSet) };
  }

  const omitCount = remaining.length - addCount;
  let bestPositions = null;
  let bestScore = -1;
  let bestSignature = null;

  function consider(block) {
    const positions = orderedUniquePositions(block);
    const score = uncoveredPairsInBlock(positions, uncoveredSet);
    const signature = positions.join("|");
    if (score > bestScore || (score === bestScore && (bestSignature === null || signature < bestSignature))) {
      bestPositions = positions;
      bestScore = score;
      bestSignature = signature;
    }
  }

  if (addCount <= omitCount) {
    combinationSearch(remaining, addCount, (additions) => {
      consider([...base, ...additions]);
    });
  } else {
    combinationSearch(remaining, omitCount, (omissions) => {
      const omitSet = new Set(omissions);
      const additions = remaining.filter((site) => !omitSet.has(site));
      consider([...base, ...additions]);
    });
  }

  return {
    positions: bestPositions || [...base, ...remaining.slice(0, addCount)],
    score: Math.max(0, bestScore),
  };
}

function heuristicBestBlock(basePositions, blockSize, uncoveredSet) {
  const fixed = orderedUniquePositions(basePositions);
  const fixedSet = new Set(fixed);
  const selected = [...fixed];
  const selectedSet = new Set(selected);

  function siteReach(site) {
    let reach = 0;
    for (const other of TARGET_MONTAGE_19) {
      if (other === site) continue;
      if (uncoveredSet.has(pairKey(site, other))) reach += 1;
    }
    return reach;
  }

  while (selected.length < blockSize) {
    let bestSite = null;
    let bestGain = -1;
    let bestReach = -1;

    for (const site of TARGET_MONTAGE_19) {
      if (selectedSet.has(site)) continue;

      let gain = 0;
      for (const other of selected) {
        if (uncoveredSet.has(pairKey(site, other))) gain += 1;
      }
      const reach = siteReach(site);
      if (gain > bestGain || (gain === bestGain && reach > bestReach) || (gain === bestGain && reach === bestReach && (bestSite === null || site < bestSite))) {
        bestSite = site;
        bestGain = gain;
        bestReach = reach;
      }
    }

    if (!bestSite) break;
    selected.push(bestSite);
    selectedSet.add(bestSite);
  }

  let improved = true;
  while (improved) {
    improved = false;
    let currentScore = uncoveredPairsInBlock(selected, uncoveredSet);
    let bestScore = currentScore;
    let bestSwap = null;

    for (const siteOut of [...selected]) {
      if (fixedSet.has(siteOut)) continue;
      for (const siteIn of TARGET_MONTAGE_19) {
        if (selectedSet.has(siteIn)) continue;
        const trial = orderedUniquePositions(selected.map((site) => (site === siteOut ? siteIn : site)));
        const score = uncoveredPairsInBlock(trial, uncoveredSet);
        if (score > bestScore) {
          bestScore = score;
          bestSwap = { siteOut, siteIn, positions: trial };
        }
      }
    }

    if (bestSwap) {
      selected.length = 0;
      selected.push(...bestSwap.positions);
      selectedSet.clear();
      for (const site of selected) selectedSet.add(site);
      improved = true;
    }
  }

  return {
    positions: orderedUniquePositions(selected),
    score: uncoveredPairsInBlock(selected, uncoveredSet),
  };
}

function chooseBestBlock(basePositions, blockSize, uncoveredSet) {
  const base = orderedUniquePositions(basePositions);
  const remainingCount = TARGET_SITE_COUNT - base.length;
  const addCount = Math.max(0, blockSize - base.length);
  const omitCount = remainingCount - addCount;
  const searchSize = Math.min(addCount, omitCount);

  if (searchSize <= 0) {
    return {
      positions: base,
      score: uncoveredPairsInBlock(base, uncoveredSet),
    };
  }

  if (combinationCount(remainingCount, searchSize) <= 5000) {
    return exactBestBlock(basePositions, blockSize, uncoveredSet);
  }
  return heuristicBestBlock(basePositions, blockSize, uncoveredSet);
}

function buildPlannerModel(channelCountValue, readingsText) {
  const parsed = parsePlannerReadings(readingsText);
  const notes = [...parsed.warnings];
  const rawChannelCount = Number(channelCountValue);
  const requestedChannelCount = Number.isFinite(rawChannelCount) ? Math.max(1, Math.floor(rawChannelCount)) : Number.NaN;

  if (!Number.isFinite(requestedChannelCount) || requestedChannelCount < 1) {
    return {
      requestedChannelCount: Number.NaN,
      blockSize: 0,
      lowerBoundReadings: 0,
      oneShotParallelGroups: 0,
      enteredCount: 0,
      pairCoverageCount: 0,
      additionalReadingsNeeded: 0,
      planReadings: [],
      enteredPositions: new Set(),
      finalPositions: new Set(),
      notes: ["Enter a valid channel count greater than zero."],
    };
  }

  const blockSize = Math.min(requestedChannelCount, TARGET_SITE_COUNT);
  const enteredPositions = new Set(parsed.readings.flatMap((reading) => reading.entered));
  if (requestedChannelCount > TARGET_SITE_COUNT) {
    notes.push(
      `The target montage has ${TARGET_SITE_COUNT} sites, so the planner caps each reading at ${TARGET_SITE_COUNT} usable channels.`
    );
  }

  if (blockSize < 2) {
    notes.push("At least 2 simultaneous channels are required to capture any coherence pair.");
    return {
      requestedChannelCount,
      blockSize,
      lowerBoundReadings: 0,
      oneShotParallelGroups: TARGET_SITE_COUNT,
      enteredCount: enteredPositions.size,
      pairCoverageCount: 0,
      additionalReadingsNeeded: 0,
      planReadings: [],
      enteredPositions,
      finalPositions: new Set(enteredPositions),
      notes,
    };
  }

  const uncoveredPairs = new Set(ALL_PAIR_KEYS);
  const currentReadings = parsed.readings.map((reading) => ({
    ...reading,
    positions: orderedUniquePositions(reading.positions),
    autoFilled: [],
  }));
  const planReadings = [];

  for (const reading of currentReadings) {
    if (reading.positions.length > blockSize) {
      reading.overflow = true;
      reading.newPairsCovered = 0;
      notes.push(
        `Reading ${reading.index} lists ${reading.positions.length} sites but the channel count is ${blockSize}; trim that line before expecting a valid plan.`
      );
      planReadings.push(reading);
      continue;
    }

    const best = chooseBestBlock(reading.positions, blockSize, uncoveredPairs);
    const enteredSet = new Set(reading.entered);
    reading.positions = best.positions;
    reading.autoFilled = reading.positions.filter((site) => !enteredSet.has(site));
    reading.newPairsCovered = applyCoverage(reading.positions, uncoveredPairs);
    planReadings.push(reading);
  }

  while (uncoveredPairs.size > 0) {
    const best = chooseBestBlock([], blockSize, uncoveredPairs);
    if (!best.positions.length || best.score <= 0) {
      notes.push("The planner could not cover the remaining coherence pairs. Try increasing the channel count.");
      break;
    }
    const generated = {
      index: planReadings.length + 1,
      entered: [],
      positions: best.positions,
      autoFilled: [...best.positions],
      generated: true,
      overflow: false,
      newPairsCovered: applyCoverage(best.positions, uncoveredPairs),
    };
    planReadings.push(generated);
  }

  const finalPositions = new Set(planReadings.flatMap((reading) => reading.positions));
  const pairCoverageCount = FULL_19_PAIR_COUNT - uncoveredPairs.size;
  const lowerBoundReadings = Math.ceil(FULL_19_PAIR_COUNT / pairCapacity(blockSize));
  const oneShotParallelGroups = Math.ceil(TARGET_SITE_COUNT / blockSize);
  const additionalReadingsNeeded = Math.max(0, planReadings.length - currentReadings.length);

  notes.push(
    `This planner now solves pairwise co-recording coverage: every site pair must appear together in at least one reading.`
  );
  notes.push(
    `Lower bound by raw pair capacity is ${lowerBoundReadings} reading${lowerBoundReadings === 1 ? "" : "s"}, but overlap between readings can push the real plan higher.`
  );
  if (pairCoverageCount === FULL_19_PAIR_COUNT) {
    notes.push(
      `Suggested plan covers all ${FULL_19_PAIR_COUNT} coherence pairs with ${planReadings.length} reading${planReadings.length === 1 ? "" : "s"}.`
    );
  }
  notes.push(
    `If you want one simultaneous 19-site snapshot instead of pair coverage spread across runs, you still need ${oneShotParallelGroups} synchronized recording group${
      oneShotParallelGroups === 1 ? "" : "s"
    }.`
  );

  return {
    requestedChannelCount,
    blockSize,
    lowerBoundReadings,
    oneShotParallelGroups,
    enteredCount: enteredPositions.size,
    pairCoverageCount,
    additionalReadingsNeeded,
    planReadings,
    enteredPositions,
    finalPositions,
    notes,
  };
}

function plannerStatCard(label, value, note) {
  const card = document.createElement("div");
  card.className = "planner-stat";

  const labelEl = document.createElement("div");
  labelEl.className = "planner-stat-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("div");
  valueEl.className = "planner-stat-value";
  valueEl.textContent = value;

  const noteEl = document.createElement("div");
  noteEl.className = "planner-stat-note";
  noteEl.textContent = note;

  card.appendChild(labelEl);
  card.appendChild(valueEl);
  card.appendChild(noteEl);
  return card;
}

function renderPlanner(model) {
  refs.plannerStats.innerHTML = "";
  refs.plannerTargets.innerHTML = "";
  refs.plannerGroups.innerHTML = "";
  refs.plannerNotes.innerHTML = "";

  const stats = [
    {
      label: "Target Pairs",
      value: `${FULL_19_PAIR_COUNT}`,
      note: "All unique coherence pairs in the 19-site montage",
    },
    {
      label: "Covered By Plan",
      value: `${model.pairCoverageCount}/${FULL_19_PAIR_COUNT}`,
      note: model.pairCoverageCount === FULL_19_PAIR_COUNT ? "Full pair coverage reached" : "Pair coverage still incomplete",
    },
    {
      label: "Suggested Readings",
      value: `${model.planReadings.length}`,
      note: `Lower bound ${model.lowerBoundReadings || 0}`,
    },
    {
      label: "Channels Per Reading",
      value: `${model.blockSize}/${model.requestedChannelCount || 0}`,
      note: "Planner fills readings to the useful channel limit",
    },
    {
      label: "One-Shot Parallel Groups",
      value: `${model.oneShotParallelGroups}`,
      note: "If you want all 19 sites at once",
    },
  ];

  for (const stat of stats) {
    refs.plannerStats.appendChild(plannerStatCard(stat.label, stat.value, stat.note));
  }

  for (const site of TARGET_MONTAGE_19) {
    const chip = document.createElement("div");
    chip.className = "planner-chip";
    if (model.enteredPositions.has(site)) {
      chip.classList.add("entered");
      chip.title = "Already entered by you";
    } else if (model.finalPositions.has(site)) {
      chip.classList.add("generated");
      chip.title = "Added by the planner";
    } else {
      chip.classList.add("missing");
      chip.title = "Still missing from the current plan";
    }
    chip.textContent = site;
    refs.plannerTargets.appendChild(chip);
  }

  if (!model.planReadings.length) {
    const empty = document.createElement("div");
    empty.className = "planner-empty";
    empty.textContent = "Enter at least 2 channels per reading to build a coherence-pair plan.";
    refs.plannerGroups.appendChild(empty);
  } else {
    for (const reading of model.planReadings) {
      const wrap = document.createElement("div");
      wrap.className = "planner-group";

      const title = document.createElement("div");
      title.className = "planner-group-title";
      title.textContent = `Reading ${reading.index}`;

      const meta = document.createElement("div");
      meta.className = "planner-group-meta";
      if (reading.overflow) {
        meta.textContent = `Invalid input | ${reading.positions.length}/${model.blockSize} sites listed | adds ${reading.newPairsCovered} pairs`;
      } else if (reading.generated) {
        meta.textContent = `Generated by planner | ${reading.positions.length}/${model.blockSize} channels used | adds ${reading.newPairsCovered} new pairs`;
      } else if (reading.autoFilled.length) {
        meta.textContent =
          `Entered ${reading.entered.length}, added ${reading.autoFilled.length} | ${reading.positions.length}/${model.blockSize} channels used | adds ${reading.newPairsCovered} new pairs`;
      } else {
        meta.textContent = `Entered by you | ${reading.positions.length}/${model.blockSize} channels used | adds ${reading.newPairsCovered} new pairs`;
      }

      const sites = document.createElement("div");
      sites.className = "planner-group-sites";
      sites.textContent = reading.positions.join("  |  ");

      wrap.appendChild(title);
      wrap.appendChild(meta);
      wrap.appendChild(sites);

      if (reading.autoFilled.length && !reading.generated) {
        const fill = document.createElement("div");
        fill.className = "planner-group-meta";
        fill.textContent = `Planner added: ${reading.autoFilled.join(", ")}`;
        wrap.appendChild(fill);
      }

      refs.plannerGroups.appendChild(wrap);
    }
  }

  const seenNotes = new Set();
  for (const note of model.notes) {
    const text = String(note || "").trim();
    if (!text || seenNotes.has(text)) continue;
    seenNotes.add(text);
    const li = document.createElement("li");
    li.textContent = text;
    refs.plannerNotes.appendChild(li);
  }
}

function updatePlanner() {
  const model = buildPlannerModel(refs.plannerChannelCount.value, refs.plannerReadings.value);
  renderPlanner(model);
}

refs.plannerChannelCount.addEventListener("input", updatePlanner);
refs.plannerReadings.addEventListener("input", updatePlanner);
refs.plannerClearBtn.addEventListener("click", () => {
  refs.plannerChannelCount.value = "8";
  refs.plannerReadings.value = "";
  updatePlanner();
});

updatePlanner();
