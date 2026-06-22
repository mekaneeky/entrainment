from __future__ import annotations

import json
import math
import re
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

import numpy as np

from clinicalq_backend.types import MetricResult, SessionResult

BANDS: Dict[str, Tuple[float, float]] = {
    "delta": (1.0, 3.0),
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
    "dvs_608_eo_cleaned": "coherence_norms_dvs_608_eo_pre_cleanedauto.json",
    "dvs_608_eo_cleaned_allpairs": "coherence_norms_dvs_608_eo_pre_cleanedauto_allpairs.json",
    "ds003775_cleaned": "coherence_norms_ds003775_cleanedauto.json",
}
MAX_LOCATIONS = 20
LEGACY_LOCATION_MAP: Dict[str, str] = {
    "T3": "T7",
    "T4": "T8",
    "T5": "P7",
    "T6": "P8",
}


def _safe_signal(signal: Iterable[float]) -> np.ndarray:
    x = np.asarray(list(signal), dtype=float)
    if x.size < 8:
        return np.zeros(8, dtype=float)
    if np.any(np.isnan(x)):
        x = np.nan_to_num(x, nan=0.0)
    return x


def _canonical_location(loc: str) -> str:
    key = str(loc).strip().upper()
    return LEGACY_LOCATION_MAP.get(key, key)


def _display_location(loc: str) -> str:
    canonical = _canonical_location(loc)
    if canonical == "GLOBAL":
        return canonical

    match = re.match(r"^([A-Z]+)(\d*)$", canonical)
    if not match:
        return canonical

    prefix, suffix = match.groups()
    if len(prefix) <= 1:
        return f"{prefix}{suffix}"
    return f"{prefix[0]}{prefix[1:].lower()}{suffix}"


def _display_metric_location(location: str) -> str:
    text = str(location).strip()
    if "/" not in text:
        return _display_location(text)

    parts = [part for part in text.split("/") if part.strip()]
    return "/".join(_display_location(part) for part in parts)


def _amplitude_spectrum(signal: Iterable[float], sampling_rate: int) -> tuple[np.ndarray, np.ndarray]:
    x = _safe_signal(signal)
    x = x - np.mean(x)
    n = x.size
    window = np.hanning(n)
    windowed = x * window
    spectrum = np.fft.rfft(windowed)
    scale = 2.0 / np.sum(window)
    amps = np.abs(spectrum) * scale
    freqs = np.fft.rfftfreq(n, d=1.0 / float(sampling_rate))
    return freqs, amps


def _band_amplitude(signal: Iterable[float], sampling_rate: int, low_hz: float, high_hz: float) -> float:
    freqs, amps = _amplitude_spectrum(signal, sampling_rate)
    mask = (freqs >= low_hz) & (freqs <= high_hz)
    if not np.any(mask):
        return float("nan")
    return float(np.sqrt(np.sum(np.square(amps[mask]))))


def _band_absolute_power(signal: Iterable[float], sampling_rate: int, low_hz: float, high_hz: float) -> float:
    freqs, amps = _amplitude_spectrum(signal, sampling_rate)
    mask = (freqs >= low_hz) & (freqs <= high_hz)
    if not np.any(mask):
        return float("nan")
    return float(np.sum(np.square(amps[mask])))


def _peak_alpha_frequency(signal: Iterable[float], sampling_rate: int) -> float:
    freqs, amps = _amplitude_spectrum(signal, sampling_rate)
    mask = (freqs >= 8.0) & (freqs <= 12.0)
    if not np.any(mask):
        return float("nan")
    band_freqs = freqs[mask]
    band_amps = amps[mask]
    idx = int(np.argmax(band_amps))
    if band_amps[idx] <= 0.0 or idx == 0 or idx == len(band_amps) - 1:
        return float("nan")

    left = float(band_amps[idx - 1])
    center = float(band_amps[idx])
    right = float(band_amps[idx + 1])
    denom = left - 2.0 * center + right
    bin_width = float(band_freqs[1] - band_freqs[0]) if len(band_freqs) > 1 else 0.0
    offset = 0.0 if denom == 0.0 else 0.5 * (left - right) / denom
    offset = float(np.clip(offset, -0.5, 0.5))
    return float(band_freqs[idx] + offset * bin_width)


def _band_coherence_phase(
    signal_a: Iterable[float], signal_b: Iterable[float], sampling_rate: int, low_hz: float, high_hz: float
) -> tuple[float, float]:
    x = _safe_signal(signal_a)
    y = _safe_signal(signal_b)
    n = min(x.size, y.size)
    if n < 16:
        return float("nan"), float("nan")

    x = x[:n] - np.mean(x[:n])
    y = y[:n] - np.mean(y[:n])

    nperseg = min(n, max(128, int(sampling_rate * 2)))
    step = max(1, nperseg // 2)
    if n < nperseg:
        return float("nan"), float("nan")

    window = np.hanning(nperseg)
    win_power = float(np.sum(window * window))
    if win_power <= 0:
        return float("nan"), float("nan")

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

        pxx = sxx if pxx is None else pxx + sxx
        pyy = syy if pyy is None else pyy + syy
        pxy = sxy if pxy is None else pxy + sxy
        segments += 1

    if segments == 0 or pxx is None or pyy is None or pxy is None:
        return float("nan"), float("nan")

    pxx /= segments
    pyy /= segments
    pxy /= segments

    freqs = np.fft.rfftfreq(nperseg, d=1.0 / float(sampling_rate))
    mask = (freqs >= low_hz) & (freqs <= high_hz)
    if not np.any(mask):
        return float("nan"), float("nan")

    denom = np.where((pxx * pyy) <= 1e-20, np.nan, pxx * pyy)
    coh = (np.abs(pxy) ** 2) / denom
    band_coh = coh[mask]
    if np.all(np.isnan(band_coh)):
        coh_val = float("nan")
    else:
        coh_val = float(np.clip(np.nanmean(band_coh), 0.0, 1.0))

    band_cross = pxy[mask]
    if band_cross.size == 0 or np.all(np.isnan(band_cross)):
        phase_deg = float("nan")
    else:
        avg_cross = np.nanmean(band_cross)
        if np.isnan(avg_cross):
            phase_deg = float("nan")
        else:
            phase_deg = float(np.angle(avg_cross, deg=True))

    return coh_val, phase_deg


def _asymmetry_percent(left_value: float, right_value: float) -> float:
    if math.isnan(left_value) or math.isnan(right_value):
        return float("nan")
    mean = (left_value + right_value) * 0.5
    if mean == 0.0:
        return float("nan")
    return float((left_value - right_value) / mean * 100.0)


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


def _metric_norm_keys(metric_type: str, *, pair: Tuple[str, str] | None = None, location: str | None = None, band: str | None = None) -> List[str]:
    def _dedupe(seq: List[str]) -> List[str]:
        seen = set()
        out: List[str] = []
        for item in seq:
            key = str(item)
            if key in seen:
                continue
            seen.add(key)
            out.append(key)
        return out

    def _loc_variants(loc: str) -> List[str]:
        canonical = _canonical_location(str(loc))
        variants = [canonical]
        match = re.match(r"^([A-Z]+)(\d*)$", canonical)
        if match:
            prefix = match.group(1)
            suffix = match.group(2)
            if len(prefix) > 1:
                alt = f"{prefix[0]}{prefix[1:].lower()}{suffix}"
                if alt != canonical:
                    variants.append(alt)
        return _dedupe(variants)

    if metric_type == "coherence" and pair and band:
        a, b = pair
        keys: List[str] = []
        for av in _loc_variants(a):
            for bv in _loc_variants(b):
                keys.append(f"COH:{av}-{bv}:{band}")
                keys.append(f"{av}-{bv}:{band}")
        return _dedupe(keys)
    if metric_type == "phase" and pair and band:
        a, b = pair
        keys = [f"PHASE:{av}-{bv}:{band}" for av in _loc_variants(a) for bv in _loc_variants(b)]
        return _dedupe(keys)
    if metric_type == "asymmetry" and pair and band:
        a, b = pair
        keys = [f"ASYM:{av}-{bv}:{band}" for av in _loc_variants(a) for bv in _loc_variants(b)]
        return _dedupe(keys)
    if metric_type == "band_amplitude" and location and band:
        return _dedupe([f"BP:{lv}:{band}" for lv in _loc_variants(location)])
    if metric_type == "absolute_power" and location and band:
        return _dedupe([f"AP:{lv}:{band}" for lv in _loc_variants(location)])
    if metric_type == "relative_power" and location and band:
        return _dedupe([f"RP:{lv}:{band}" for lv in _loc_variants(location)])
    if metric_type == "total_coherence" and location and band:
        loc = str(location).upper()
        if loc == "GLOBAL":
            return [f"TOTCOH_GLOBAL:{band}", f"TOTCOH:GLOBAL:{band}"]
        return _dedupe([f"TOTCOH:{lv}:{band}" for lv in _loc_variants(location)])
    if metric_type == "theta_beta_ratio" and location:
        keys: List[str] = []
        for lv in _loc_variants(location):
            keys.append(f"RATIO_THETA_BETA:{lv}")
            keys.append(f"RATIO:{lv}:theta_beta")
        return _dedupe(keys)
    if metric_type == "peak_alpha_frequency" and location:
        return _dedupe([f"PAF:{lv}" for lv in _loc_variants(location)])
    if metric_type == "total_amplitude" and location:
        return _dedupe([f"TOTAMP:{lv}" for lv in _loc_variants(location)])
    return []


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
    def _lookup(candidates: List[str]) -> tuple[Dict[str, Any] | None, str]:
        if zscore_mode == "age" and age_bin_label:
            by_age = norms.get("metrics_by_age", {})
            age_metrics = by_age.get(age_bin_label, {}) if isinstance(by_age, dict) else {}
            if isinstance(age_metrics, dict):
                for key in candidates:
                    value = age_metrics.get(key)
                    if isinstance(value, dict):
                        return value, f"age:{age_bin_label}"

        global_metrics = norms.get("metrics", {})
        if isinstance(global_metrics, dict):
            for key in candidates:
                value = global_metrics.get(key)
                if isinstance(value, dict):
                    return value, "global"
        return None, "missing"

    norm, source = _lookup(keys)
    if norm is not None:
        return norm, source

    # Backward-compatible delta support for norms sets that only define theta.
    delta_fallback_keys = [str(key).replace(":delta", ":theta") for key in keys if ":delta" in str(key)]
    if delta_fallback_keys:
        norm, source = _lookup(delta_fallback_keys)
        if norm is not None:
            return norm, f"{source};delta->theta_fallback"

    return None, "missing"


def _norm_status_and_z(value: float, norm: Dict[str, Any] | None, z_cutoff: float = 0.5) -> tuple[str, float, str]:
    if norm is None or math.isnan(value):
        return "MISSING", float("nan"), "N/A"

    mean = float(norm.get("mean", float("nan")))
    std = float(norm.get("std", float("nan")))
    zscore = float("nan") if std <= 0.0 else (value - mean) / std
    try:
        raw_cutoff = float(z_cutoff)
    except (TypeError, ValueError):
        raw_cutoff = 2.0
    cutoff = abs(raw_cutoff) if math.isfinite(raw_cutoff) and raw_cutoff > 0 else 2.0
    if math.isfinite(mean) and math.isfinite(std) and std > 0.0:
        low_cut = mean - cutoff * std
        high_cut = mean + cutoff * std
    else:
        low_cut = float(norm.get("cutoff_low", float("nan")))
        high_cut = float(norm.get("cutoff_high", float("nan")))

    if math.isnan(low_cut) or math.isnan(high_cut):
        return "MISSING", zscore, "N/A"

    status = "IN_RANGE" if low_cut <= value <= high_cut else "OUT_OF_RANGE"
    cutoff_label = f"{cutoff:g}"
    return status, zscore, f"{low_cut:.3f}-{high_cut:.3f} (|z|<={cutoff_label})"


def _probe_for_metric(metric_type: str, status: str, value: float, norm: Dict[str, Any] | None, zscore: float = float("nan")) -> str:
    if status != "OUT_OF_RANGE" or norm is None:
        return ""

    high_cut = float(norm.get("cutoff_high", float("nan")))
    is_high = (math.isfinite(zscore) and zscore > 0) or (not math.isfinite(zscore) and not math.isnan(high_cut) and value > high_cut)
    if metric_type in {"coherence", "total_coherence"}:
        if is_high:
            return "High coherence: screen for over-coupled or rigid network dynamics."
        return "Low coherence: screen for under-integration, distractibility, and reduced network efficiency."
    if metric_type == "phase":
        return "Atypical phase relationship: correlate with timing/synchronization inefficiency."
    if metric_type == "asymmetry":
        return "Atypical hemispheric asymmetry: correlate with lateralized cognitive/affective features."
    if metric_type in {"band_amplitude", "absolute_power", "relative_power", "total_amplitude"}:
        if is_high:
            return "Elevated power/amplitude: screen for excess activation or arousal."
        return "Reduced power/amplitude: screen for hypoactivation or slowing."
    if metric_type == "theta_beta_ratio":
        if is_high:
            return "Elevated theta/beta ratio: correlate with attentional inefficiency."
        return "Low theta/beta ratio: correlate with hypervigilance/anxious activation."
    if metric_type == "peak_alpha_frequency":
        if is_high:
            return "High peak alpha frequency: correlate with elevated activation profile."
        return "Low peak alpha frequency: correlate with slowed processing."
    return ""


def _mean_or_nan(values: List[float]) -> float:
    if not values:
        return float("nan")
    vec = np.asarray(values, dtype=float)
    if np.all(np.isnan(vec)):
        return float("nan")
    return float(np.nanmean(vec))


def _append_metric_row(
    *,
    metrics: List[MetricResult],
    derived_rows: List[Dict[str, Any]],
    norms: Dict[str, Any],
    zscore_mode: str,
    age_bin_label: str | None,
    metric_type: str,
    location: str,
    metric_label: str,
    formula: str,
    value: float,
    values_count: int,
    pair: Tuple[str, str] | None = None,
    band: str | None = None,
    extra: Dict[str, Any] | None = None,
) -> None:
    keys = _metric_norm_keys(metric_type, pair=pair, location=location if pair is None else None, band=band)
    norm, source = _resolve_norm(norms, keys, zscore_mode=zscore_mode, age_bin_label=age_bin_label)
    status, zscore, normal_range = _norm_status_and_z(value, norm)
    if source.startswith("age:") and normal_range != "N/A":
        normal_range = f"{normal_range}; {source.split(':', 1)[1]}"
    probe = _probe_for_metric(metric_type, status, value, norm, zscore)

    metrics.append(_as_metric(_display_metric_location(location), metric_label, value, normal_range, status, probe, formula))

    row: Dict[str, Any] = {
        "metric_type": metric_type,
        "value": value,
        "zscore": zscore,
        "n_epochs": values_count,
        "norm_source": source,
        "norm_keys": keys,
    }
    if pair is not None:
        row["pair"] = [pair[0], pair[1]]
    if band is not None:
        row["band"] = band
    if extra:
        row.update(extra)
    derived_rows.append(row)


def analyze_coherence_session(
    session_data: Dict[str, Any],
    norms_path: str | None = None,
    norms_dataset: str | None = None,
) -> SessionResult:
    norms = _load_norms(norms_path, dataset=norms_dataset)
    sampling_rate = int(session_data.get("sampling_rate", 250))
    raw_pairs = [tuple(x) for x in session_data.get("pairs", DEFAULT_PAIRS)]
    pairs: List[Tuple[str, str]] = []
    seen_pairs = set()
    for pair in raw_pairs:
        if len(pair) != 2:
            continue
        left = _canonical_location(str(pair[0]))
        right = _canonical_location(str(pair[1]))
        if left == right:
            raise RuntimeError(f"Invalid coherence pair after canonicalization: {pair}")
        key = (left, right)
        if key in seen_pairs:
            continue
        seen_pairs.add(key)
        pairs.append(key)
    if not pairs:
        raise RuntimeError("No valid coherence pairs configured.")
    epochs = list(session_data.get("epochs", []))
    zscore_mode = str(session_data.get("zscore_mode", "global")).strip().lower()
    zscore_mode = "age" if zscore_mode in {"age", "age_based", "age-based"} else "global"
    subject_age = _to_age(session_data.get("subject_age"))
    age_bin_label = _resolve_age_bin_label(norms.get("age_bins"), subject_age) if zscore_mode == "age" else None

    explicit_locations = [str(loc).strip() for loc in session_data.get("locations", []) if str(loc).strip()]
    locations = sorted(set(explicit_locations) | {loc for pair in pairs for loc in pair})
    if len(locations) > MAX_LOCATIONS:
        raise RuntimeError(f"Too many coherence locations ({len(locations)}). Max supported is {MAX_LOCATIONS}.")

    coh_values: Dict[Tuple[Tuple[str, str], str], List[float]] = {(pair, band): [] for pair in pairs for band in BANDS}
    phase_values: Dict[Tuple[Tuple[str, str], str], List[float]] = {(pair, band): [] for pair in pairs for band in BANDS}
    asym_values: Dict[Tuple[Tuple[str, str], str], List[float]] = {(pair, band): [] for pair in pairs for band in BANDS}
    amp_values: Dict[Tuple[str, str], List[float]] = {(loc, band): [] for loc in locations for band in BANDS}
    abs_values: Dict[Tuple[str, str], List[float]] = {(loc, band): [] for loc in locations for band in BANDS}
    rel_values: Dict[Tuple[str, str], List[float]] = {(loc, band): [] for loc in locations for band in BANDS}
    ratio_values: Dict[str, List[float]] = {loc: [] for loc in locations}
    paf_values: Dict[str, List[float]] = {loc: [] for loc in locations}
    total_amp_values: Dict[str, List[float]] = {loc: [] for loc in locations}

    for epoch in epochs:
        signals_raw = epoch.get("signals", {})
        signals: Dict[str, Any] = {}
        if isinstance(signals_raw, dict):
            for key, value in signals_raw.items():
                loc = _canonical_location(str(key))
                if loc not in signals:
                    signals[loc] = value
        per_loc: Dict[str, Dict[str, Any]] = {}

        for loc in locations:
            if loc not in signals:
                continue
            sig = _safe_signal(signals[loc])
            amp_by_band: Dict[str, float] = {}
            abs_by_band: Dict[str, float] = {}
            for band, (low_hz, high_hz) in BANDS.items():
                amp = _band_amplitude(sig, sampling_rate, low_hz, high_hz)
                abp = _band_absolute_power(sig, sampling_rate, low_hz, high_hz)
                amp_by_band[band] = amp
                abs_by_band[band] = abp
                if not math.isnan(amp):
                    amp_values[(loc, band)].append(amp)
                if not math.isnan(abp):
                    abs_values[(loc, band)].append(abp)

            total_abs = float(np.nansum(list(abs_by_band.values())))
            for band in BANDS:
                val = float("nan")
                if total_abs > 0 and not math.isnan(abs_by_band[band]):
                    val = abs_by_band[band] / total_abs
                if not math.isnan(val):
                    rel_values[(loc, band)].append(val)

            theta = abs_by_band.get("theta", float("nan"))
            beta = abs_by_band.get("beta", float("nan"))
            ratio = float("nan") if math.isnan(theta) or math.isnan(beta) or beta == 0.0 else theta / beta
            if not math.isnan(ratio):
                ratio_values[loc].append(ratio)

            paf = _peak_alpha_frequency(sig, sampling_rate)
            if not math.isnan(paf):
                paf_values[loc].append(paf)

            total_amp = float(np.nansum(list(amp_by_band.values())))
            if not math.isnan(total_amp):
                total_amp_values[loc].append(total_amp)

            per_loc[loc] = {"abs_by_band": abs_by_band}

        for pair in pairs:
            left, right = pair
            if left not in signals or right not in signals:
                continue

            for band, (low_hz, high_hz) in BANDS.items():
                coh, phase_deg = _band_coherence_phase(signals[left], signals[right], sampling_rate, low_hz, high_hz)
                if not math.isnan(coh):
                    coh_values[(pair, band)].append(coh)
                if not math.isnan(phase_deg):
                    phase_values[(pair, band)].append(phase_deg)

                left_abs = per_loc.get(left, {}).get("abs_by_band", {}).get(band, float("nan"))
                right_abs = per_loc.get(right, {}).get("abs_by_band", {}).get(band, float("nan"))
                asym = _asymmetry_percent(left_abs, right_abs)
                if not math.isnan(asym):
                    asym_values[(pair, band)].append(asym)

    metrics: List[MetricResult] = []
    derived_rows: List[Dict[str, Any]] = []

    for pair in pairs:
        pair_label = f"{pair[0]}/{pair[1]}"
        for band in BANDS:
            coh_list = coh_values[(pair, band)]
            phase_list = phase_values[(pair, band)]
            asym_list = asym_values[(pair, band)]

            _append_metric_row(
                metrics=metrics,
                derived_rows=derived_rows,
                norms=norms,
                zscore_mode=zscore_mode,
                age_bin_label=age_bin_label,
                metric_type="coherence",
                location=pair_label,
                metric_label=f"{band.title()} coherence (EC)",
                formula="Band-averaged magnitude-squared coherence",
                value=_mean_or_nan(coh_list),
                values_count=len(coh_list),
                pair=pair,
                band=band,
            )
            _append_metric_row(
                metrics=metrics,
                derived_rows=derived_rows,
                norms=norms,
                zscore_mode=zscore_mode,
                age_bin_label=age_bin_label,
                metric_type="phase",
                location=pair_label,
                metric_label=f"{band.title()} phase lag (deg, EC)",
                formula="Phase angle of averaged cross-spectrum in band",
                value=_mean_or_nan(phase_list),
                values_count=len(phase_list),
                pair=pair,
                band=band,
            )
            _append_metric_row(
                metrics=metrics,
                derived_rows=derived_rows,
                norms=norms,
                zscore_mode=zscore_mode,
                age_bin_label=age_bin_label,
                metric_type="asymmetry",
                location=pair_label,
                metric_label=f"{band.title()} asymmetry % (L-R, EC)",
                formula="(Left - Right) / mean(Left, Right) * 100 using absolute power",
                value=_mean_or_nan(asym_list),
                values_count=len(asym_list),
                pair=pair,
                band=band,
            )

    for loc in locations:
        for band in BANDS:
            node_lists = [coh_values[(pair, band)] for pair in pairs if loc in pair]
            node_flat = [item for sublist in node_lists for item in sublist]
            _append_metric_row(
                metrics=metrics,
                derived_rows=derived_rows,
                norms=norms,
                zscore_mode=zscore_mode,
                age_bin_label=age_bin_label,
                metric_type="total_coherence",
                location=loc,
                metric_label=f"{band.title()} total coherence (site, EC)",
                formula="Mean coherence across all pairs connected to site",
                value=_mean_or_nan(node_flat),
                values_count=len(node_flat),
                band=band,
            )

    for band in BANDS:
        global_lists = [coh_values[(pair, band)] for pair in pairs]
        global_flat = [item for sublist in global_lists for item in sublist]
        _append_metric_row(
            metrics=metrics,
            derived_rows=derived_rows,
            norms=norms,
            zscore_mode=zscore_mode,
            age_bin_label=age_bin_label,
            metric_type="total_coherence",
            location="GLOBAL",
            metric_label=f"{band.title()} total coherence (global, EC)",
            formula="Mean coherence across all configured coherence pairs",
            value=_mean_or_nan(global_flat),
            values_count=len(global_flat),
            band=band,
        )

    for loc in locations:
        for band in BANDS:
            amp_list = amp_values[(loc, band)]
            abs_list = abs_values[(loc, band)]
            rel_list = rel_values[(loc, band)]
            _append_metric_row(
                metrics=metrics,
                derived_rows=derived_rows,
                norms=norms,
                zscore_mode=zscore_mode,
                age_bin_label=age_bin_label,
                metric_type="band_amplitude",
                location=loc,
                metric_label=f"{band.title()} band amplitude (EC)",
                formula="RMS amplitude in band from FFT spectrum",
                value=_mean_or_nan(amp_list),
                values_count=len(amp_list),
                band=band,
            )
            _append_metric_row(
                metrics=metrics,
                derived_rows=derived_rows,
                norms=norms,
                zscore_mode=zscore_mode,
                age_bin_label=age_bin_label,
                metric_type="absolute_power",
                location=loc,
                metric_label=f"{band.title()} absolute power (EC)",
                formula="Sum of squared amplitudes in band",
                value=_mean_or_nan(abs_list),
                values_count=len(abs_list),
                band=band,
            )
            _append_metric_row(
                metrics=metrics,
                derived_rows=derived_rows,
                norms=norms,
                zscore_mode=zscore_mode,
                age_bin_label=age_bin_label,
                metric_type="relative_power",
                location=loc,
                metric_label=f"{band.title()} relative power (EC)",
                formula="Band absolute power / sum(theta, alpha, beta absolute power)",
                value=_mean_or_nan(rel_list),
                values_count=len(rel_list),
                band=band,
            )

        ratio_list = ratio_values[loc]
        paf_list = paf_values[loc]
        totamp_list = total_amp_values[loc]
        _append_metric_row(
            metrics=metrics,
            derived_rows=derived_rows,
            norms=norms,
            zscore_mode=zscore_mode,
            age_bin_label=age_bin_label,
            metric_type="theta_beta_ratio",
            location=loc,
            metric_label="Theta/Beta ratio (EC)",
            formula="Theta absolute power / Beta absolute power",
            value=_mean_or_nan(ratio_list),
            values_count=len(ratio_list),
        )
        _append_metric_row(
            metrics=metrics,
            derived_rows=derived_rows,
            norms=norms,
            zscore_mode=zscore_mode,
            age_bin_label=age_bin_label,
            metric_type="peak_alpha_frequency",
            location=loc,
            metric_label="Peak alpha frequency (EC)",
            formula="Frequency of max alpha amplitude (8-12 Hz)",
            value=_mean_or_nan(paf_list),
            values_count=len(paf_list),
        )
        _append_metric_row(
            metrics=metrics,
            derived_rows=derived_rows,
            norms=norms,
            zscore_mode=zscore_mode,
            age_bin_label=age_bin_label,
            metric_type="total_amplitude",
            location=loc,
            metric_label="Total amplitude (EC)",
            formula="Theta amplitude + Alpha amplitude + Beta amplitude",
            value=_mean_or_nan(totamp_list),
            values_count=len(totamp_list),
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
        "recording_source": session_data.get("recording_source"),
        "warnings": list(session_data.get("warnings", [])),
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
