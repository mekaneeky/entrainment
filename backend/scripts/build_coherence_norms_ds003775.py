from __future__ import annotations

import argparse
import csv
import json
from itertools import combinations
from pathlib import Path
from typing import Dict, Iterable, Tuple

import mne
import numpy as np

DEFAULT_PAIRS = [("F3", "F4"), ("Fz", "Cz"), ("Cz", "O1"), ("F3", "Cz"), ("F4", "Cz")]
DEFAULT_LOCATIONS = ["F3", "F4", "Fz", "Cz", "O1"]
BANDS: Dict[str, Tuple[float, float]] = {
    "delta": (1.0, 3.0),
    "theta": (4.0, 7.0),
    "alpha": (8.0, 12.0),
    "beta": (13.0, 30.0),
}
AGE_BINS = [
    {"label": "18-29", "min_age": 18, "max_age": 29},
    {"label": "30-39", "min_age": 30, "max_age": 39},
    {"label": "40-49", "min_age": 40, "max_age": 49},
    {"label": "50-59", "min_age": 50, "max_age": 59},
    {"label": "60-69", "min_age": 60, "max_age": 69},
    {"label": "70-79", "min_age": 70, "max_age": 79},
    {"label": "80+", "min_age": 80, "max_age": None},
]
LEGACY_LOCATION_MAP = {
    "T3": "T7",
    "T4": "T8",
    "T5": "P7",
    "T6": "P8",
}
MODERN_TO_LEGACY = {v: k for k, v in LEGACY_LOCATION_MAP.items()}


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


def _channel_alias_candidates(loc: str) -> list[str]:
    canon = _canonical_location(loc)
    candidates = [canon]
    legacy = MODERN_TO_LEGACY.get(canon)
    if legacy:
        candidates.append(legacy)
    return candidates


def _resolve_channel_name(loc: str, ch_map: Dict[str, str]) -> str | None:
    for candidate in _channel_alias_candidates(loc):
        name = ch_map.get(candidate.upper())
        if name:
            return name
    return None


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
    idx = int(np.argmax(amps[mask]))
    return float(freqs[mask][idx])


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
    if np.isnan(left_value) or np.isnan(right_value):
        return float("nan")
    mean = (left_value + right_value) * 0.5
    if mean == 0.0:
        return float("nan")
    return float((left_value - right_value) / mean * 100.0)


def _to_age(value: str | None) -> float | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    if not text or text in {"n/a", "na", "nan"}:
        return None
    try:
        out = float(text)
    except ValueError:
        return None
    return out if np.isfinite(out) else None


def _load_subject_age(dataset_dir: Path) -> Dict[str, float]:
    path = dataset_dir / "participants.tsv"
    if not path.exists():
        return {}

    out: Dict[str, float] = {}
    with path.open("r", encoding="utf-8") as f:
        rows = csv.DictReader(f, delimiter="\t")
        for row in rows:
            participant = str(row.get("participant_id", "")).strip()
            age = _to_age(row.get("age"))
            if participant and age is not None:
                out[participant] = age
    return out


def _subject_id_from_path(path: Path) -> str | None:
    for part in path.parts:
        if part.startswith("sub-"):
            return part
    return None


def _age_bin_label(age: float | None) -> str | None:
    if age is None:
        return None
    for item in AGE_BINS:
        min_age = item.get("min_age")
        max_age = item.get("max_age")
        if min_age is not None and age < float(min_age):
            continue
        if max_age is not None and age > float(max_age):
            continue
        return str(item["label"])
    return None


def _metric_stats(key: str, arr: list[float]) -> Dict[str, float] | None:
    vec = np.asarray(arr, dtype=float)
    if vec.size == 0:
        return None
    mean = float(np.mean(vec))
    std = float(np.std(vec, ddof=1)) if vec.size > 1 else 0.0
    low = float(mean - 2.0 * std)
    high = float(mean + 2.0 * std)

    if key.startswith("COH:") or key.startswith("RP:") or key.startswith("TOTCOH:") or key.startswith("TOTCOH_GLOBAL:"):
        low = float(max(0.0, low))
        high = float(min(1.0, high))
    elif key.startswith("PHASE:"):
        low = float(max(-180.0, low))
        high = float(min(180.0, high))
    elif key.startswith("PAF:"):
        low = float(max(8.0, low))
        high = float(min(12.0, high))
    elif key.startswith(("BP:", "AP:", "RATIO_THETA_BETA:", "TOTAMP:")):
        low = float(max(0.0, low))
        high = float(max(0.0, high))

    if high < low:
        high = low

    return {"n": int(vec.size), "mean": mean, "std": std, "cutoff_low": low, "cutoff_high": high}


def _parse_pairs(text: str, locations: list[str]) -> list[tuple[str, str]]:
    token_text = str(text).strip().lower()
    if token_text in {"all", "*"}:
        out: list[tuple[str, str]] = []
        for left, right in combinations(locations, 2):
            out.append((left, right))
        if not out:
            raise RuntimeError("No valid coherence pairs produced from locations.")
        return out

    pairs: list[tuple[str, str]] = []
    for item in str(text).split(","):
        token = item.strip()
        if not token:
            continue
        if "-" not in token:
            raise RuntimeError(f"Invalid pair token: {token}. Use format F3-F4,Fz-Cz")
        left, right = token.split("-", 1)
        left = _canonical_location(left)
        right = _canonical_location(right)
        if not left or not right or left == right:
            raise RuntimeError(f"Invalid pair token: {token}")
        pairs.append((left, right))
    if not pairs:
        raise RuntimeError("No valid coherence pairs provided.")
    return pairs


def _parse_locations(text: str) -> list[str]:
    locations = [item.strip() for item in str(text).split(",") if item.strip()]
    if not locations:
        raise RuntimeError("No valid locations provided.")

    unique = []
    seen = set()
    for loc in locations:
        up = _canonical_location(loc)
        if up in seen:
            continue
        seen.add(up)
        unique.append(up)
    return unique


def _metric_keys(pairs: list[tuple[str, str]], locations: list[str]) -> list[str]:
    keys: list[str] = []
    for left, right in pairs:
        for band in BANDS:
            keys.append(f"COH:{left}-{right}:{band}")
            keys.append(f"PHASE:{left}-{right}:{band}")
            keys.append(f"ASYM:{left}-{right}:{band}")

    for loc in locations:
        for band in BANDS:
            keys.append(f"BP:{loc}:{band}")
            keys.append(f"AP:{loc}:{band}")
            keys.append(f"RP:{loc}:{band}")
            keys.append(f"TOTCOH:{loc}:{band}")
        keys.append(f"RATIO_THETA_BETA:{loc}")
        keys.append(f"PAF:{loc}")
        keys.append(f"TOTAMP:{loc}")
    for band in BANDS:
        keys.append(f"TOTCOH_GLOBAL:{band}")
    return keys


def _append_value(values: Dict[str, list[float]], key: str, value: float) -> None:
    if np.isnan(value):
        return
    values[key].append(float(value))


def main() -> int:
    parser = argparse.ArgumentParser(description="Build expanded Z-score norms/cutoffs from OpenNeuro ds003775.")
    parser.add_argument("--dataset", type=Path, default=Path("data/ds003775"), help="Local ds003775 directory")
    parser.add_argument(
        "--glob",
        type=str,
        default="sub-*/ses-*/eeg/*_task-resteyesc_eeg.edf",
        help="Input EDF/FIF glob under dataset root",
    )
    parser.add_argument("--locations", type=str, default=",".join(DEFAULT_LOCATIONS), help="Comma-separated locations")
    parser.add_argument("--pairs", type=str, default="all", help="Comma-separated coherence pairs, or 'all' for all location combinations")
    parser.add_argument("--max-locations", type=int, default=20, help="Maximum allowed location count")
    parser.add_argument("--min-age-bin-n", type=int, default=3, help="Minimum samples required for per-age-bin stats")
    parser.add_argument("--task-label", type=str, default="resteyesc", help="Task label stored in metadata")
    parser.add_argument("--dataset-label", type=str, default="ds003775", help="Dataset label stored in metadata")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("backend/clinicalq_backend/data/coherence_norms_ds003775.json"),
        help="Output norms JSON path",
    )
    args = parser.parse_args()

    dataset_dir = args.dataset
    eeg_paths = sorted(dataset_dir.glob(args.glob))
    if not eeg_paths:
        raise RuntimeError(f"No EEG files matched {args.glob} under {dataset_dir}.")

    locations = _parse_locations(args.locations)
    if len(locations) > int(args.max_locations):
        raise RuntimeError(f"Requested {len(locations)} locations, exceeds max-locations={args.max_locations}.")
    pairs = _parse_pairs(args.pairs, locations)

    location_set = set(locations)
    needed = sorted({loc for pair in pairs for loc in pair} | location_set)
    keys = _metric_keys(pairs, locations)
    values: Dict[str, list[float]] = {key: [] for key in keys}
    values_by_age: Dict[str, Dict[str, list[float]]] = {
        item["label"]: {key: [] for key in keys} for item in AGE_BINS
    }

    subject_age = _load_subject_age(dataset_dir)
    used_files = 0
    used_subjects = set()

    for idx, eeg_path in enumerate(eeg_paths, start=1):
        if eeg_path.suffix.lower() == ".fif":
            raw = mne.io.read_raw_fif(eeg_path, preload=False, verbose="ERROR")
        else:
            raw = mne.io.read_raw_edf(eeg_path, preload=False, verbose="ERROR")

        ch_map = {name.upper(): name for name in raw.ch_names}
        resolved: Dict[str, str] = {}
        for loc in needed:
            name = _resolve_channel_name(loc, ch_map)
            if not name:
                resolved = {}
                break
            resolved[loc] = name
        if not resolved:
            continue

        pick_names = [resolved[loc] for loc in needed]
        picked = raw.copy().pick(picks=pick_names).load_data()
        eeg = picked.get_data()
        sr = int(round(float(picked.info["sfreq"])))
        by_loc = {loc: eeg[pick_names.index(resolved[loc]), :] for loc in needed}

        subject = _subject_id_from_path(eeg_path)
        age = subject_age.get(subject or "", None)
        age_label = _age_bin_label(age)
        age_values = values_by_age.get(age_label or "", {})

        abs_by_loc_band: Dict[str, Dict[str, float]] = {}
        amp_by_loc_band: Dict[str, Dict[str, float]] = {}

        for loc in needed:
            sig = by_loc[loc]
            band_abs: Dict[str, float] = {}
            band_amp: Dict[str, float] = {}

            for band, (low, high) in BANDS.items():
                amp = _band_amplitude(sig, sr, low, high)
                ap = _band_absolute_power(sig, sr, low, high)
                band_amp[band] = amp
                band_abs[band] = ap

                if loc in location_set:
                    key_amp = f"BP:{loc}:{band}"
                    key_ap = f"AP:{loc}:{band}"
                    _append_value(values, key_amp, amp)
                    _append_value(values, key_ap, ap)
                    if age_values:
                        _append_value(age_values, key_amp, amp)
                        _append_value(age_values, key_ap, ap)

            abs_by_loc_band[loc] = band_abs
            amp_by_loc_band[loc] = band_amp

            if loc not in location_set:
                continue

            total_abs = float(np.nansum(list(band_abs.values())))
            for band in BANDS:
                rel = float("nan")
                if total_abs > 0 and not np.isnan(band_abs[band]):
                    rel = band_abs[band] / total_abs
                key_rp = f"RP:{loc}:{band}"
                _append_value(values, key_rp, rel)
                if age_values:
                    _append_value(age_values, key_rp, rel)

            theta = band_abs.get("theta", float("nan"))
            beta = band_abs.get("beta", float("nan"))
            ratio = float("nan") if np.isnan(theta) or np.isnan(beta) or beta == 0.0 else theta / beta
            paf = _peak_alpha_frequency(sig, sr)
            total_amp = float(np.nansum(list(band_amp.values())))

            key_ratio = f"RATIO_THETA_BETA:{loc}"
            key_paf = f"PAF:{loc}"
            key_totamp = f"TOTAMP:{loc}"
            _append_value(values, key_ratio, ratio)
            _append_value(values, key_paf, paf)
            _append_value(values, key_totamp, total_amp)
            if age_values:
                _append_value(age_values, key_ratio, ratio)
                _append_value(age_values, key_paf, paf)
                _append_value(age_values, key_totamp, total_amp)

        coh_by_loc_band: Dict[Tuple[str, str], list[float]] = {(loc, band): [] for loc in locations for band in BANDS}
        coh_global_band: Dict[str, list[float]] = {band: [] for band in BANDS}

        for left, right in pairs:
            for band, (low, high) in BANDS.items():
                coh, phase = _band_coherence_phase(by_loc[left], by_loc[right], sr, low, high)
                asym = _asymmetry_percent(abs_by_loc_band[left].get(band, float("nan")), abs_by_loc_band[right].get(band, float("nan")))

                key_coh = f"COH:{left}-{right}:{band}"
                key_phase = f"PHASE:{left}-{right}:{band}"
                key_asym = f"ASYM:{left}-{right}:{band}"
                _append_value(values, key_coh, coh)
                _append_value(values, key_phase, phase)
                _append_value(values, key_asym, asym)
                if not np.isnan(coh):
                    if left in location_set:
                        coh_by_loc_band[(left, band)].append(float(coh))
                    if right in location_set:
                        coh_by_loc_band[(right, band)].append(float(coh))
                    coh_global_band[band].append(float(coh))
                if age_values:
                    _append_value(age_values, key_coh, coh)
                    _append_value(age_values, key_phase, phase)
                    _append_value(age_values, key_asym, asym)

        for loc in locations:
            for band in BANDS:
                vec = coh_by_loc_band[(loc, band)]
                mean_val = float(np.mean(vec)) if vec else float("nan")
                key_totcoh = f"TOTCOH:{loc}:{band}"
                _append_value(values, key_totcoh, mean_val)
                if age_values:
                    _append_value(age_values, key_totcoh, mean_val)

        for band in BANDS:
            vec = coh_global_band[band]
            mean_val = float(np.mean(vec)) if vec else float("nan")
            key_totcoh_global = f"TOTCOH_GLOBAL:{band}"
            _append_value(values, key_totcoh_global, mean_val)
            if age_values:
                _append_value(age_values, key_totcoh_global, mean_val)

        used_files += 1
        if subject:
            used_subjects.add(subject)
        if idx % 20 == 0:
            print(f"Processed {idx}/{len(eeg_paths)} files...", flush=True)

    metrics = {key: stat for key, arr in values.items() if (stat := _metric_stats(key, arr)) is not None}

    metrics_by_age: Dict[str, Dict[str, Dict[str, float]]] = {}
    for age_label, grouped in values_by_age.items():
        group_metrics = {}
        for key, arr in grouped.items():
            stat = _metric_stats(key, arr)
            if stat is None or int(stat["n"]) < int(args.min_age_bin_n):
                continue
            group_metrics[key] = stat
        if group_metrics:
            metrics_by_age[age_label] = group_metrics

    out = {
        "dataset": str(args.dataset_label),
        "task": str(args.task_label),
        "notes": "OpenNeuro ds003775 expanded norms. Cutoffs are mean +/- 2 SD.",
        "bands_hz": {k: [v[0], v[1]] for k, v in BANDS.items()},
        "pairs": [[a, b] for a, b in pairs],
        "locations": locations,
        "age_bins": AGE_BINS,
        "n_files": used_files,
        "n_subjects": len(used_subjects),
        "metrics": metrics,
        "metrics_by_age": metrics_by_age,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, sort_keys=True)
    print(
        f"Wrote {args.output.resolve()} (n_files={used_files}, n_subjects={len(used_subjects)}, metrics={len(metrics)})",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
