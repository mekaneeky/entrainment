from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Dict, Iterable, Tuple

import mne
import numpy as np

PAIRS = [("F3", "F4"), ("Fz", "Cz"), ("Cz", "O1"), ("F3", "Cz"), ("F4", "Cz")]
BANDS: Dict[str, Tuple[float, float]] = {
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


def _safe_signal(signal: Iterable[float]) -> np.ndarray:
    x = np.asarray(list(signal), dtype=float)
    if x.size < 4:
        return np.zeros(4, dtype=float)
    if np.any(np.isnan(x)):
        x = np.nan_to_num(x, nan=0.0)
    return x


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


def band_amplitude(signal: Iterable[float], sampling_rate: int, low_hz: float, high_hz: float) -> float:
    freqs, amps = _amplitude_spectrum(signal, sampling_rate)
    mask = (freqs >= low_hz) & (freqs <= high_hz)
    if not np.any(mask):
        return 0.0
    return float(np.sqrt(np.sum(np.square(amps[mask]))))


def band_coherence(signal_a: Iterable[float], signal_b: Iterable[float], sampling_rate: int, low_hz: float, high_hz: float) -> float:
    x = np.asarray(list(signal_a), dtype=float)
    y = np.asarray(list(signal_b), dtype=float)
    n = min(x.size, y.size)
    if n < 64:
        return float("nan")

    x = x[:n] - np.mean(x[:n])
    y = y[:n] - np.mean(y[:n])

    nperseg = min(n, max(256, int(sampling_rate * 2)))
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

        pxx = sxx if pxx is None else pxx + sxx
        pyy = syy if pyy is None else pyy + syy
        pxy = sxy if pxy is None else pxy + sxy
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

    denom = np.where((pxx * pyy) <= 1e-20, np.nan, pxx * pyy)
    coh = np.abs(pxy) ** 2 / denom
    band_vals = coh[mask]
    if np.all(np.isnan(band_vals)):
        return float("nan")
    value = np.nanmean(band_vals)
    if np.isnan(value):
        return float("nan")
    return float(np.clip(value, 0.0, 1.0))


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
    low = float(max(0.0, mean - 2.0 * std))
    if key.startswith("COH:"):
        high = float(min(1.0, mean + 2.0 * std))
    else:
        high = float(max(0.0, mean + 2.0 * std))
    return {"n": int(vec.size), "mean": mean, "std": std, "cutoff_low": low, "cutoff_high": high}


def main() -> int:
    parser = argparse.ArgumentParser(description="Build coherence + bandpower Z-score norms and cutoffs from ds003775.")
    parser.add_argument("--dataset", type=Path, default=Path("data/ds003775"), help="Local ds003775 directory")
    parser.add_argument(
        "--glob",
        type=str,
        default="sub-*/ses-*/eeg/*_task-resteyesc_eeg.edf",
        help="Input file glob under dataset root (.edf or .fif)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("backend/clinicalq_backend/data/coherence_norms_ds003775.json"),
        help="Output norms JSON path",
    )
    parser.add_argument("--min-age-bin-n", type=int, default=3, help="Minimum samples required to emit per-age-bin stats")
    args = parser.parse_args()

    dataset_dir = args.dataset
    edf_paths = sorted(dataset_dir.glob(args.glob))
    if not edf_paths:
        raise RuntimeError(f"No EDF files found under {dataset_dir}. Run download script first.")

    subject_age = _load_subject_age(dataset_dir)

    keys = [f"COH:{a}-{b}:{band}" for a, b in PAIRS for band in BANDS]
    keys.extend([f"BP:{loc}:{band}" for loc in sorted({x for pair in PAIRS for x in pair}) for band in BANDS])
    values: Dict[str, list[float]] = {key: [] for key in keys}
    values_by_age: Dict[str, Dict[str, list[float]]] = {
        item["label"]: {key: [] for key in keys} for item in AGE_BINS
    }

    used_files = 0
    used_subjects = set()

    for idx, edf_path in enumerate(edf_paths, start=1):
        if edf_path.suffix.lower() == ".fif":
            raw = mne.io.read_raw_fif(edf_path, preload=False, verbose="ERROR")
        else:
            raw = mne.io.read_raw_edf(edf_path, preload=False, verbose="ERROR")
        ch_map = {name.upper(): name for name in raw.ch_names}

        needed = {loc for pair in PAIRS for loc in pair}
        if any(loc.upper() not in ch_map for loc in needed):
            continue

        pick_names = [ch_map[loc.upper()] for loc in sorted(needed)]
        picked = raw.copy().pick(picks=pick_names).load_data()
        eeg = picked.get_data()
        sr = int(round(float(raw.info["sfreq"])))
        by_loc = {loc: eeg[pick_names.index(ch_map[loc.upper()]), :] for loc in needed}

        subject = _subject_id_from_path(edf_path)
        age = subject_age.get(subject or "", None)
        age_label = _age_bin_label(age)

        for pair in PAIRS:
            for band, (low, high) in BANDS.items():
                key = f"COH:{pair[0]}-{pair[1]}:{band}"
                val = band_coherence(by_loc[pair[0]], by_loc[pair[1]], sr, low, high)
                if np.isnan(val):
                    continue
                values[key].append(float(val))
                if age_label:
                    values_by_age[age_label][key].append(float(val))

        for loc in needed:
            sig = by_loc[loc]
            for band, (low, high) in BANDS.items():
                key = f"BP:{loc}:{band}"
                val = float(band_amplitude(sig, sr, low, high))
                if np.isnan(val):
                    continue
                values[key].append(val)
                if age_label:
                    values_by_age[age_label][key].append(val)

        used_files += 1
        if subject:
            used_subjects.add(subject)
        if idx % 20 == 0:
            print(f"Processed {idx}/{len(edf_paths)} EDF files...", flush=True)

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
        "dataset": "ds003775",
        "task": "resteyesc",
        "notes": "Normative EC coherence + bandpower stats from OpenNeuro ds003775. Cutoffs are mean +/- 2 SD.",
        "bands_hz": {k: [v[0], v[1]] for k, v in BANDS.items()},
        "pairs": [[a, b] for a, b in PAIRS],
        "age_bins": AGE_BINS,
        "n_files": used_files,
        "n_subjects": len(used_subjects),
        "metrics": metrics,
        "metrics_by_age": metrics_by_age,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, sort_keys=True)
    print(f"Wrote {args.output.resolve()} (n_files={used_files}, n_subjects={len(used_subjects)})", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
