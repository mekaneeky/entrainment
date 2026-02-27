from __future__ import annotations

import json
import math
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

import numpy as np

from clinicalq_backend.bands import band_amplitude
from clinicalq_backend.types import MetricResult, SessionResult

BANDS: Dict[str, Tuple[float, float]] = {
    "theta": (4.0, 7.0),
    "alpha": (8.0, 12.0),
    "beta": (13.0, 30.0),
}

DEFAULT_PAIRS: List[Tuple[str, str]] = [
    ("F3", "F4"),
    ("Fz", "Cz"),
    ("Cz", "O1"),
    ("F3", "Cz"),
    ("F4", "Cz"),
]

NORMS_FILE_BY_DATASET: Dict[str, str] = {
    "ds003775": "coherence_norms_ds003775.json",
    "dvs": "coherence_norms_dvs_608.json",
    "dvs_608": "coherence_norms_dvs_608.json",
    "dvs_608_cleaned": "coherence_norms_dvs_608_cleanedauto.json",
    "ds003775_cleaned": "coherence_norms_ds003775_cleanedauto.json",
}
MAX_LOCATIONS = 20


def _safe_signal(signal: Iterable[float]) -> np.ndarray:
    x = np.asarray(list(signal), dtype=float)
    if x.size < 8:
        return np.zeros(8, dtype=float)
    if np.any(np.isnan(x)):
        x = np.nan_to_num(x, nan=0.0)
    return x


def _band_coherence(signal_a: Iterable[float], signal_b: Iterable[float], sampling_rate: int, low_hz: float, high_hz: float) -> float:
    x = _safe_signal(signal_a)
    y = _safe_signal(signal_b)
    n = min(x.size, y.size)
    if n < 16:
        return float("nan")

    x = x[:n] - np.mean(x[:n])
    y = y[:n] - np.mean(y[:n])

    nperseg = min(n, max(128, int(sampling_rate * 2)))
    step = max(1, nperseg // 2)
    if n < nperseg:
        return float("nan")

    window = np.hanning(nperseg)
    win_power = float(np.sum(window * window))
    if win_power <= 0:
        return float("nan")

    pxx = None
    pyy = None
    pxy = None
    segments = 0

    for start in range(0, n - nperseg + 1, step):
        xa = x[start : start + nperseg] * window
        ya = y[start : start + nperseg] * window
        fx = np.fft.rfft(xa)
        fy = np.fft.rfft(ya)

        sxx = (fx * np.conj(fx)).real / win_power
        syy = (fy * np.conj(fy)).real / win_power
        sxy = (fx * np.conj(fy)) / win_power

        if pxx is None:
            pxx = sxx
            pyy = syy
            pxy = sxy
        else:
            pxx += sxx
            pyy += syy
            pxy += sxy
        segments += 1

    if segments == 0 or pxx is None or pyy is None or pxy is None:
        return float("nan")

    pxx /= segments
    pyy /= segments
    pxy /= segments

    freqs = np.fft.rfftfreq(nperseg, d=1.0 / float(sampling_rate))
    mask = (freqs >= low_hz) & (freqs <= high_hz)
    if not np.any(mask):
        return float("nan")

    denom = pxx * pyy
    denom = np.where(denom <= 1e-20, np.nan, denom)
    coh = (np.abs(pxy) ** 2) / denom
    band_vals = coh[mask]
    if np.all(np.isnan(band_vals)):
        return float("nan")
    val = np.nanmean(band_vals)
    if np.isnan(val):
        return float("nan")
    return float(np.clip(val, 0.0, 1.0))


def _load_norms(path: str | None = None, dataset: str | None = None) -> Dict[str, Any]:
    if path:
        p = Path(path)
    else:
        requested = str(dataset or "ds003775").strip().lower()
        filename = NORMS_FILE_BY_DATASET.get(requested)
        if not filename:
            supported = ", ".join(sorted(NORMS_FILE_BY_DATASET.keys()))
            raise RuntimeError(f"Unsupported coherence norms dataset: {requested}. Supported: {supported}.")
        p = Path(__file__).resolve().parent / "data" / filename

    if not p.exists():
        raise RuntimeError(
            f"Coherence norms file not found: {p}. "
            "Build it with backend/scripts/build_coherence_norms_ds003775.py "
            "or backend/scripts/build_coherence_norms_dvs.py, or provide config.norms_path."
        )
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)


def _coh_norm_keys(pair: Tuple[str, str], band: str) -> List[str]:
    a, b = pair
    return [f"COH:{a}-{b}:{band}", f"{a}-{b}:{band}"]


def _bp_norm_keys(location: str, band: str) -> List[str]:
    return [f"BP:{location}:{band}"]


def _pair_name(pair: Tuple[str, str]) -> str:
    return f"{pair[0]}/{pair[1]}"


def _as_metric(location: str, metric: str, value: float, normal_range: str, status: str, probe: str, formula: str) -> MetricResult:
    return MetricResult(
        location=location,
        metric=metric,
        value=float(value) if not math.isnan(value) else float("nan"),
        normal_range=normal_range,
        status=status,
        probe=probe,
        formula=formula,
    )


def _to_age(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if math.isfinite(out) else None


def _resolve_age_bin_label(age_bins: Any, subject_age: float | None) -> str | None:
    if subject_age is None or not isinstance(age_bins, list):
        return None
    for item in age_bins:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label", "")).strip()
        min_age = _to_age(item.get("min_age"))
        max_age = _to_age(item.get("max_age"))
        if not label:
            continue
        if min_age is not None and subject_age < min_age:
            continue
        if max_age is not None and subject_age > max_age:
            continue
        return label
    return None


def _resolve_norm(
    norms: Dict[str, Any],
    keys: List[str],
    *,
    zscore_mode: str,
    age_bin_label: str | None,
) -> tuple[Dict[str, Any] | None, str]:
    if zscore_mode == "age" and age_bin_label:
        by_age = norms.get("metrics_by_age", {})
        age_metrics = by_age.get(age_bin_label, {}) if isinstance(by_age, dict) else {}
        if isinstance(age_metrics, dict):
            for key in keys:
                value = age_metrics.get(key)
                if isinstance(value, dict):
                    return value, f"age:{age_bin_label}"

    global_metrics = norms.get("metrics", {})
    if isinstance(global_metrics, dict):
        for key in keys:
            value = global_metrics.get(key)
            if isinstance(value, dict):
                return value, "global"
    return None, "missing"


def _norm_status_and_z(value: float, norm: Dict[str, Any] | None) -> tuple[str, float, str]:
    if norm is None or math.isnan(value):
        return "MISSING", float("nan"), "N/A"

    mean = float(norm.get("mean", float("nan")))
    std = float(norm.get("std", float("nan")))
    low_cut = float(norm.get("cutoff_low", float("nan")))
    high_cut = float(norm.get("cutoff_high", float("nan")))
    zscore = float("nan") if std <= 0.0 else (value - mean) / std

    if math.isnan(low_cut) or math.isnan(high_cut):
        return "MISSING", zscore, "N/A"

    status = "IN_RANGE" if low_cut <= value <= high_cut else "OUT_OF_RANGE"
    return status, zscore, f"{low_cut:.3f}-{high_cut:.3f} (|z|<=2)"


def analyze_coherence_session(
    session_data: Dict[str, Any],
    norms_path: str | None = None,
    norms_dataset: str | None = None,
) -> SessionResult:
    norms = _load_norms(norms_path, dataset=norms_dataset)
    sampling_rate = int(session_data.get("sampling_rate", 250))
    pairs = [tuple(x) for x in session_data.get("pairs", DEFAULT_PAIRS)]
    epochs = list(session_data.get("epochs", []))
    zscore_mode = str(session_data.get("zscore_mode", "global")).strip().lower()
    zscore_mode = "age" if zscore_mode in {"age", "age_based", "age-based"} else "global"
    subject_age = _to_age(session_data.get("subject_age"))
    age_bin_label = _resolve_age_bin_label(norms.get("age_bins"), subject_age) if zscore_mode == "age" else None

    locations = sorted({loc for pair in pairs for loc in pair})
    if len(locations) > MAX_LOCATIONS:
        raise RuntimeError(f"Too many coherence locations ({len(locations)}). Max supported is {MAX_LOCATIONS}.")

    coh_values: Dict[Tuple[Tuple[str, str], str], List[float]] = {(pair, band): [] for pair in pairs for band in BANDS}
    bp_values: Dict[Tuple[str, str], List[float]] = {(loc, band): [] for loc in locations for band in BANDS}

    for epoch in epochs:
        signals = epoch.get("signals", {})

        for pair in pairs:
            left, right = pair
            if left not in signals or right not in signals:
                continue
            for band, (low_hz, high_hz) in BANDS.items():
                value = _band_coherence(signals[left], signals[right], sampling_rate, low_hz, high_hz)
                if not math.isnan(value):
                    coh_values[(pair, band)].append(value)

        for loc in locations:
            if loc not in signals:
                continue
            sig = _safe_signal(signals[loc])
            for band, (low_hz, high_hz) in BANDS.items():
                value = float(band_amplitude(sig, sampling_rate, low_hz, high_hz))
                if not math.isnan(value):
                    bp_values[(loc, band)].append(value)

    metrics: List[MetricResult] = []
    derived_rows: List[Dict[str, Any]] = []

    for pair in pairs:
        for band in BANDS:
            values = coh_values[(pair, band)]
            value = float(np.mean(values)) if values else float("nan")
            norm, source = _resolve_norm(norms, _coh_norm_keys(pair, band), zscore_mode=zscore_mode, age_bin_label=age_bin_label)
            status, zscore, normal_range = _norm_status_and_z(value, norm)
            if source.startswith("age:") and normal_range != "N/A":
                normal_range = f"{normal_range}; {source.split(':', 1)[1]}"

            probe = ""
            if status == "OUT_OF_RANGE" and norm is not None:
                high_cut = float(norm.get("cutoff_high", float("nan")))
                if not math.isnan(high_cut) and value > high_cut:
                    probe = "High coherence: screen for over-coupled or rigid network dynamics."
                else:
                    probe = "Low coherence: screen for under-integration, distractibility, and reduced network efficiency."

            metrics.append(
                _as_metric(
                    _pair_name(pair),
                    f"{band.title()} coherence (EC)",
                    value,
                    normal_range,
                    status,
                    probe,
                    "Band-averaged magnitude-squared coherence",
                )
            )
            derived_rows.append(
                {
                    "metric_type": "coherence",
                    "pair": [pair[0], pair[1]],
                    "band": band,
                    "value": value,
                    "zscore": zscore,
                    "n_epochs": len(values),
                    "norm_source": source,
                }
            )

    for loc in locations:
        for band in BANDS:
            values = bp_values[(loc, band)]
            value = float(np.mean(values)) if values else float("nan")
            norm, source = _resolve_norm(norms, _bp_norm_keys(loc, band), zscore_mode=zscore_mode, age_bin_label=age_bin_label)
            status, zscore, normal_range = _norm_status_and_z(value, norm)
            if source.startswith("age:") and normal_range != "N/A":
                normal_range = f"{normal_range}; {source.split(':', 1)[1]}"

            probe = ""
            if status == "OUT_OF_RANGE" and norm is not None:
                high_cut = float(norm.get("cutoff_high", float("nan")))
                if not math.isnan(high_cut) and value > high_cut:
                    probe = "High bandpower: screen for excess activation or hyper-arousal at this site."
                else:
                    probe = "Low bandpower: screen for hypoactivation or slowing at this site."

            metrics.append(
                _as_metric(
                    loc,
                    f"{band.title()} bandpower (EC)",
                    value,
                    normal_range,
                    status,
                    probe,
                    "Band RMS amplitude from FFT spectrum",
                )
            )
            derived_rows.append(
                {
                    "metric_type": "bandpower",
                    "location": loc,
                    "band": band,
                    "value": value,
                    "zscore": zscore,
                    "n_epochs": len(values),
                    "norm_source": source,
                }
            )

    in_range = sum(1 for m in metrics if m.status == "IN_RANGE")
    out_of_range = sum(1 for m in metrics if m.status == "OUT_OF_RANGE")
    missing = sum(1 for m in metrics if m.status == "MISSING")

    probes: List[str] = []
    seen = set()
    for metric in metrics:
        if metric.status != "OUT_OF_RANGE" or not metric.probe:
            continue
        if metric.probe in seen:
            continue
        seen.add(metric.probe)
        probes.append(metric.probe)

    summary = {
        "in_range": in_range,
        "out_of_range": out_of_range,
        "missing": missing,
        "potential_symptom_questions": probes,
    }

    metadata = {
        "mode": session_data.get("mode"),
        "sampling_rate": sampling_rate,
        "epoch_seconds": session_data.get("epoch_seconds"),
        "channels": session_data.get("channels"),
        "analysis": "coherence",
        "norms_dataset": norms.get("dataset", str(norms_dataset or "ds003775")),
        "zscore_mode": zscore_mode,
        "subject_age": subject_age,
        "age_bin": age_bin_label,
    }

    derived = {
        "coherence": {
            "bands_hz": {k: [v[0], v[1]] for k, v in BANDS.items()},
            "pairs": [[a, b] for a, b in pairs],
            "locations": locations,
            "rows": derived_rows,
        }
    }

    return SessionResult(metadata=metadata, metrics=metrics, summary=summary, derived=derived)


def session_result_to_dict(result: SessionResult) -> Dict[str, Any]:
    return {
        "metadata": result.metadata,
        "metrics": [asdict(m) for m in result.metrics],
        "summary": result.summary,
        "derived": result.derived,
    }
