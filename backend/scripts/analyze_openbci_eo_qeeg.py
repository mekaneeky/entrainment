from __future__ import annotations

import csv
import json
import math
import os
import sys
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence, Tuple

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import mne
import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from clinicalq_backend.coherence import analyze_coherence_session, session_result_to_dict
from clinicalq_backend.recordings import build_offline_coherence_session

DEFAULT_OUTPUT_ROOT = Path.home() / "Documents" / "OpenBCI_GUI" / "QEEG_Analysis" / "eo_qeeg_2026-04-05"


def _env_channel_list(name: str) -> list[str]:
    raw = str(os.environ.get(name, "") or "").strip()
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def _merge_channel_lists(*lists: Sequence[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for values in lists:
        for value in values:
            key = str(value).strip().upper()
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(str(value).strip())
    return out


OUTPUT_ROOT = Path(
    os.environ.get(
        "QEEG_ANALYZE_OUTPUT_ROOT",
        os.environ.get("QEEG_OUTPUT_ROOT", str(DEFAULT_OUTPUT_ROOT)),
    )
)
SAMPLING_RATE = 125.0
LINE_FREQ_HZ = 50.0
SATURATION_UV = 187500.0
KNOWN_BAD_BY_RECORDING = {
    "08-25": _merge_channel_lists(_env_channel_list("QEEG_FORCE_BAD_ALL"), _env_channel_list("QEEG_FORCE_BAD_08_25")),
    "09-25": _merge_channel_lists(_env_channel_list("QEEG_FORCE_BAD_ALL"), _env_channel_list("QEEG_FORCE_BAD_09_25")),
}
EXPECTED_LOCATIONS = [
    "FP1",
    "FP2",
    "F7",
    "F3",
    "FZ",
    "F4",
    "F8",
    "T7",
    "C3",
    "CZ",
    "C4",
    "T8",
    "P7",
    "P3",
    "PZ",
    "P4",
    "P8",
    "O1",
    "O2",
]
CHANNEL_LABEL_BY_CANONICAL = {
    "FP1": "Fp1",
    "FP2": "Fp2",
    "F7": "F7",
    "F3": "F3",
    "FZ": "FZ",
    "F4": "F4",
    "F8": "F8",
    "T7": "T3",
    "C3": "C3",
    "CZ": "Cz",
    "C4": "C4",
    "T8": "T4",
    "P7": "T5",
    "P3": "P3",
    "PZ": "Pz",
    "P4": "P4",
    "P8": "T6",
    "O1": "O1",
    "O2": "O2",
}
HEAD_COORDS_1020: Dict[str, tuple[float, float]] = {
    "FP1": (-0.45, 0.92),
    "FP2": (0.45, 0.92),
    "F7": (-0.82, 0.46),
    "F3": (-0.46, 0.52),
    "FZ": (0.00, 0.56),
    "F4": (0.46, 0.52),
    "F8": (0.82, 0.46),
    "T7": (-0.90, 0.00),
    "C3": (-0.50, 0.02),
    "CZ": (0.00, 0.00),
    "C4": (0.50, 0.02),
    "T8": (0.90, 0.00),
    "P7": (-0.80, -0.46),
    "P3": (-0.46, -0.46),
    "PZ": (0.00, -0.50),
    "P4": (0.46, -0.46),
    "P8": (0.80, -0.46),
    "O1": (-0.34, -0.86),
    "O2": (0.34, -0.86),
}
LEGACY_LOCATION_MAP = {"T3": "T7", "T4": "T8", "T5": "P7", "T6": "P8"}
DISPLAY_LEGACY_MAP = {v: k for k, v in LEGACY_LOCATION_MAP.items()}


@dataclass(frozen=True)
class RecordingSpec:
    label: str
    csv_path: Path
    channel_names: tuple[str, ...]
    forced_bad_channels: tuple[str, ...]


RECORDINGS: tuple[RecordingSpec, ...] = (
    RecordingSpec(
        label="08-25",
        csv_path=Path(
            r"C:\Users\HP\Documents\OpenBCI_GUI\Recordings\OpenBCISession_2026-04-05_08-25-33\BrainFlow-RAW_2026-04-05_08-25-33_0.csv"
        ),
        channel_names=("O1", "O2", "P3", "P4", "Pz", "T6", "T5", "Cz", "T3", "T4", "C3", "C4", "F7", "F8", "F3", "Fp1"),
        forced_bad_channels=tuple(KNOWN_BAD_BY_RECORDING["08-25"]),
    ),
    RecordingSpec(
        label="09-25",
        csv_path=Path(
            r"C:\Users\HP\Documents\OpenBCI_GUI\Recordings\OpenBCISession_2026-04-05_09-25-20\BrainFlow-RAW_2026-04-05_09-25-20_0.csv"
        ),
        channel_names=("O1", "O2", "P3", "P4", "Pz", "T6", "T5", "Cz", "F4", "T4", "C3", "C4", "FZ", "Fp2", "F3", "Fp1"),
        forced_bad_channels=tuple(KNOWN_BAD_BY_RECORDING["09-25"]),
    ),
)


def _canonical_location(loc: str) -> str:
    key = str(loc).strip().upper()
    return LEGACY_LOCATION_MAP.get(key, key)


def _display_location(loc: str) -> str:
    canon = _canonical_location(loc)
    if canon in DISPLAY_LEGACY_MAP:
        return DISPLAY_LEGACY_MAP[canon]
    return CHANNEL_LABEL_BY_CANONICAL.get(canon, canon)


def _display_pair(pair: str) -> str:
    left, right = [part.strip() for part in pair.split("/", 1)]
    return f"{_display_location(left)}/{_display_location(right)}"


def _merge_ranges(ranges: Sequence[tuple[float, float]], *, gap_seconds: float = 0.0) -> list[tuple[float, float]]:
    cleaned = sorted((float(start), float(end)) for start, end in ranges if end > start)
    if not cleaned:
        return []
    out: list[list[float]] = [[cleaned[0][0], cleaned[0][1]]]
    for start, end in cleaned[1:]:
        if start <= out[-1][1] + gap_seconds:
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([start, end])
    return [(float(start), float(end)) for start, end in out]


def _complement_ranges(total_seconds: float, bad_ranges: Sequence[tuple[float, float]]) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    cursor = 0.0
    for start, end in _merge_ranges(bad_ranges):
        if start > cursor:
            out.append((cursor, start))
        cursor = max(cursor, end)
    if cursor < total_seconds:
        out.append((cursor, total_seconds))
    return out


def _load_brainflow_csv(spec: RecordingSpec) -> tuple[np.ndarray, mne.io.RawArray]:
    matrix = np.loadtxt(spec.csv_path, delimiter="\t")
    eeg_v = (matrix[:, 1:17] * 1e-6).T
    info = mne.create_info(list(spec.channel_names), sfreq=SAMPLING_RATE, ch_types=["eeg"] * len(spec.channel_names))
    raw = mne.io.RawArray(eeg_v, info, verbose="ERROR")
    raw.info["line_freq"] = LINE_FREQ_HZ
    raw.set_meas_date(None)
    raw.set_montage("standard_1020", on_missing="ignore", verbose="ERROR")
    return matrix, raw


def _detect_auto_bad_channels(matrix_uv: np.ndarray, ch_names: Sequence[str]) -> tuple[list[str], dict[str, dict[str, float | str]]]:
    eeg = matrix_uv[:, 1:17].T
    details: dict[str, dict[str, float | str]] = {}
    auto_bad: list[str] = []
    for ch_name, signal in zip(ch_names, eeg):
        diff = np.diff(signal)
        zero_diff_pct = float(np.mean(diff == 0) * 100.0) if diff.size else 0.0
        pos_sat_pct = float(np.mean(np.isclose(signal, SATURATION_UV)) * 100.0)
        neg_sat_pct = float(np.mean(np.isclose(signal, -SATURATION_UV)) * 100.0)
        reason = ""
        if zero_diff_pct >= 90.0:
            reason = "flatline"
        elif pos_sat_pct >= 20.0 or neg_sat_pct >= 20.0:
            reason = "saturation"
        if reason:
            auto_bad.append(str(ch_name))
        details[str(ch_name)] = {
            "zero_diff_pct": round(zero_diff_pct, 4),
            "pos_saturation_pct": round(pos_sat_pct, 4),
            "neg_saturation_pct": round(neg_sat_pct, 4),
            "reason": reason,
        }
    return auto_bad, details


def _preprocess_raw(raw: mne.io.RawArray, drop_channels: Sequence[str]) -> mne.io.RawArray:
    out = raw.copy().load_data()
    drop_list = [ch for ch in drop_channels if ch in out.ch_names]
    if drop_list:
        out.drop_channels(drop_list)
    out.notch_filter(freqs=[LINE_FREQ_HZ], verbose="ERROR")
    out.filter(l_freq=1.0, h_freq=40.0, verbose="ERROR")
    out.set_eeg_reference("average", projection=False, verbose="ERROR")
    return out


def _detect_bad_ranges(preprocessed: mne.io.BaseRaw) -> tuple[list[tuple[float, float]], list[tuple[float, float]], list[dict[str, float]]]:
    data_uv = preprocessed.get_data() * 1e6
    sfreq = int(round(float(preprocessed.info["sfreq"])))
    win = sfreq
    bad_windows: list[tuple[float, float]] = []
    metrics: list[dict[str, float]] = []
    for start in range(0, data_uv.shape[1] - win + 1, win):
        seg = data_uv[:, start : start + win]
        max_abs = float(np.max(np.abs(seg)))
        median_abs = float(np.median(np.abs(seg)))
        max_ptp = float(np.max(np.ptp(seg, axis=1)))
        median_ptp = float(np.median(np.ptp(seg, axis=1)))
        max_diff = float(np.max(np.std(np.diff(seg, axis=1), axis=1)))
        row = {
            "start_seconds": float(start / sfreq),
            "end_seconds": float((start + win) / sfreq),
            "max_abs_uv": max_abs,
            "median_abs_uv": median_abs,
            "max_ptp_uv": max_ptp,
            "median_ptp_uv": median_ptp,
            "max_diff_std_uv": max_diff,
        }
        metrics.append(row)
        if (
            max_abs > 200.0
            or median_abs > 20.0
            or max_ptp > 300.0
            or median_ptp > 150.0
            or max_diff > 35.0
        ):
            bad_windows.append((float(start / sfreq), float((start + win) / sfreq)))
    bad_ranges = _merge_ranges(bad_windows, gap_seconds=2.0)
    total_seconds = float(data_uv.shape[1] / sfreq)
    keep_ranges = [
        (round(start, 3), round(end, 3))
        for start, end in _complement_ranges(total_seconds, bad_ranges)
        if (end - start) >= 10.0
    ]
    bad_ranges = [(round(start, 3), round(end, 3)) for start, end in bad_ranges]
    return bad_ranges, keep_ranges, metrics


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def _write_csv(path: Path, rows: Sequence[dict[str, Any]], fieldnames: Sequence[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(fieldnames))
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field) for field in fieldnames})


def _save_recording_outputs(spec: RecordingSpec) -> dict[str, Any]:
    matrix, raw = _load_brainflow_csv(spec)
    auto_bad, auto_bad_details = _detect_auto_bad_channels(matrix, spec.channel_names)
    all_bad = sorted({*spec.forced_bad_channels, *auto_bad})
    preprocessed = _preprocess_raw(raw, all_bad)
    bad_ranges, keep_ranges, window_metrics = _detect_bad_ranges(preprocessed)

    out_dir = OUTPUT_ROOT / "cleaned_recordings" / spec.label
    out_dir.mkdir(parents=True, exist_ok=True)
    fif_path = out_dir / f"{spec.csv_path.stem}_preprocessed.fif"
    edf_path = out_dir / f"{spec.csv_path.stem}_preprocessed.edf"
    preprocessed.save(fif_path, overwrite=True, verbose="ERROR")
    mne.export.export_raw(edf_path, preprocessed, fmt="edf", overwrite=True)

    summary = {
        "label": spec.label,
        "source_csv": str(spec.csv_path),
        "preprocessed_fif": str(fif_path),
        "preprocessed_edf": str(edf_path),
        "forced_bad_channels": list(spec.forced_bad_channels),
        "auto_bad_channels": auto_bad,
        "all_dropped_channels": all_bad,
        "auto_bad_channel_details": auto_bad_details,
        "remaining_channels": list(preprocessed.ch_names),
        "excluded_ranges_seconds": [[start, end] for start, end in bad_ranges],
        "keep_ranges_seconds": [[start, end] for start, end in keep_ranges],
        "retained_seconds": round(sum(end - start for start, end in keep_ranges), 3),
        "retained_fraction": round(
            (sum(end - start for start, end in keep_ranges) / float(matrix.shape[0] / SAMPLING_RATE)), 4
        ),
    }
    _write_json(out_dir / "cleaning_summary.json", summary)
    _write_csv(
        out_dir / "artifact_window_metrics.csv",
        window_metrics,
        [
            "start_seconds",
            "end_seconds",
            "max_abs_uv",
            "median_abs_uv",
            "max_ptp_uv",
            "median_ptp_uv",
            "max_diff_std_uv",
        ],
    )
    return summary


def _build_analysis_config(cleaned_recordings: Sequence[dict[str, Any]], *, zscore_mode: str, subject_age: float | None) -> dict[str, Any]:
    pairs = [[left, right] for left, right in combinations(EXPECTED_LOCATIONS, 2)]
    recordings = [
        {
            "path": summary["preprocessed_fif"],
            "label": summary["label"],
            "keep_ranges": summary["keep_ranges_seconds"],
        }
        for summary in cleaned_recordings
    ]
    return {
        "sampling_rate": int(SAMPLING_RATE),
        "epoch_seconds": 30,
        "minimum_segment_seconds": 10,
        "norms_dataset": "dvs_608_eo_cleaned_allpairs",
        "zscore_mode": zscore_mode,
        "subject_age": subject_age,
        "locations": list(EXPECTED_LOCATIONS),
        "channels": {location: CHANNEL_LABEL_BY_CANONICAL[_canonical_location(location)] for location in EXPECTED_LOCATIONS},
        "pairs": pairs,
        "source": {
            "kind": "existing_recordings",
            "sync_mode": "independent",
            "recordings": recordings,
        },
    }


def _run_analysis(cleaned_recordings: Sequence[dict[str, Any]], *, zscore_mode: str, subject_age: float | None) -> dict[str, Any]:
    config = _build_analysis_config(cleaned_recordings, zscore_mode=zscore_mode, subject_age=subject_age)
    session_data = build_offline_coherence_session(config, pairs=[tuple(pair) for pair in config["pairs"]])
    session_data["task_label"] = "EO"
    result = analyze_coherence_session(session_data, norms_dataset="dvs_608_eo_cleaned_allpairs")
    payload = session_result_to_dict(result)
    derived_rows = payload.get("derived", {}).get("coherence", {}).get("rows", [])
    metric_rows = payload.get("metrics", [])
    for derived_row, metric_row in zip(derived_rows, metric_rows):
        if not isinstance(derived_row, dict) or not isinstance(metric_row, dict):
            continue
        derived_row["status"] = metric_row.get("status")
        derived_row["metric_label"] = metric_row.get("metric")
        derived_row["location_label"] = metric_row.get("location")
        derived_row["normal_range"] = metric_row.get("normal_range")
        derived_row["probe"] = metric_row.get("probe")
    payload["metadata"]["task_label"] = "EO"
    payload["metadata"]["note"] = "Metrics were scored against eyes-open EO norms, even though some internal formulas still use legacy '(EC)' text."
    payload["analysis_config"] = config
    return payload


def _rows_for_metric(rows: Iterable[dict[str, Any]], metric_type: str, band: str | None = None) -> list[dict[str, Any]]:
    out = []
    for row in rows:
        if str(row.get("metric_type", "")).lower() != str(metric_type).lower():
            continue
        if band is not None and str(row.get("band", "")).lower() != str(band).lower():
            continue
        out.append(row)
    return out


def _site_map(rows: Iterable[dict[str, Any]], metric_type: str, band: str | None = None) -> dict[str, float | None]:
    values = {_canonical_location(loc): None for loc in EXPECTED_LOCATIONS}
    for row in _rows_for_metric(rows, metric_type, band):
        keys = row.get("norm_keys") or []
        if not keys:
            continue
        metric_key = str(keys[0])
        parts = metric_key.split(":")
        if len(parts) < 2:
            continue
        loc = _canonical_location(parts[1])
        z = row.get("zscore")
        if z is None:
            continue
        try:
            z_val = float(z)
        except (TypeError, ValueError):
            continue
        if math.isnan(z_val):
            continue
        values[loc] = z_val
    return values


def _pair_map(rows: Iterable[dict[str, Any]], metric_type: str, band: str | None = None) -> dict[tuple[str, str], float | None]:
    out: dict[tuple[str, str], float | None] = {}
    for left, right in combinations(EXPECTED_LOCATIONS, 2):
        out[(_canonical_location(left), _canonical_location(right))] = None
    for row in _rows_for_metric(rows, metric_type, band):
        pair = row.get("pair")
        if not isinstance(pair, list) or len(pair) != 2:
            continue
        left = _canonical_location(str(pair[0]))
        right = _canonical_location(str(pair[1]))
        z = row.get("zscore")
        if z is None:
            continue
        try:
            z_val = float(z)
        except (TypeError, ValueError):
            continue
        if math.isnan(z_val):
            continue
        out[(left, right)] = z_val
    return out


def _plot_site_cubes(values: dict[str, float | None], *, title: str, out_path: Path) -> None:
    labels = [_canonical_location(loc) for loc in EXPECTED_LOCATIONS]
    vals = [values.get(label) for label in labels]
    finite_vals = [float(v) for v in vals if v is not None and not math.isnan(float(v))]
    vmax = max(2.5, max((abs(v) for v in finite_vals), default=2.5) + 0.25)
    cmap = plt.get_cmap("RdBu_r")
    norm = matplotlib.colors.Normalize(vmin=-vmax, vmax=vmax)

    fig, ax = plt.subplots(figsize=(6.6, 6.6), dpi=150)
    head = plt.Circle((0.0, 0.0), 1.0, fill=False, color="black", lw=2.0)
    ax.add_patch(head)
    ax.plot([-0.12, 0.0, 0.12], [1.00, 1.15, 1.00], color="black", lw=2.0)
    ax.plot([-1.0, -1.08, -1.0], [0.10, 0.00, -0.10], color="black", lw=2.0)
    ax.plot([1.0, 1.08, 1.0], [0.10, 0.00, -0.10], color="black", lw=2.0)

    for label in labels:
        x, y = HEAD_COORDS_1020[label]
        val = values.get(label)
        if val is None:
            face = "#c9c9c9"
            text = "NA"
        else:
            face = cmap(norm(float(val)))
            text = f"{float(val):+.1f}"
        ax.scatter([x], [y], s=420, marker="s", c=[face], edgecolors="black", linewidths=1.2, zorder=4)
        ax.text(x, y + 0.060, _display_location(label), ha="center", va="bottom", fontsize=8, color="black", zorder=6)
        ax.text(x, y - 0.002, text, ha="center", va="center", fontsize=7, color="black", zorder=6)

    title = f"{title}\nGrey = unavailable / excluded"
    ax.set_title(title, fontsize=11)
    ax.set_xlim(-1.15, 1.15)
    ax.set_ylim(-1.15, 1.20)
    ax.set_aspect("equal", "box")
    ax.axis("off")
    sm = matplotlib.cm.ScalarMappable(norm=norm, cmap=cmap)
    sm.set_array([])
    cb = fig.colorbar(sm, ax=ax, fraction=0.045, pad=0.04)
    cb.set_label("Z-score")
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)


def _plot_site_topomap(
    values: dict[str, float | None],
    *,
    title: str,
    out_path: Path,
    cmap_name: str = "RdBu_r",
    colorbar_label: str = "Z-score",
    center_zero: bool = True,
) -> None:
    labels = [_canonical_location(loc) for loc in EXPECTED_LOCATIONS]
    available = [(label, float(values[label])) for label in labels if values.get(label) is not None]
    if len(available) < 3:
        raise RuntimeError("Need at least 3 available site values for a head topomap.")

    xs = np.array([HEAD_COORDS_1020[label][0] for label, _ in available], dtype=float)
    ys = np.array([HEAD_COORDS_1020[label][1] for label, _ in available], dtype=float)
    zs = np.array([val for _, val in available], dtype=float)

    grid_n = 320
    gx = np.linspace(-1.05, 1.05, grid_n)
    gy = np.linspace(-1.05, 1.05, grid_n)
    X, Y = np.meshgrid(gx, gy)
    R = np.sqrt(X * X + Y * Y)
    head_mask = R <= 1.0

    sigma = 0.28
    Z = np.zeros_like(X, dtype=float)
    W = np.zeros_like(X, dtype=float)
    for x0, y0, z0 in zip(xs, ys, zs):
        d2 = (X - x0) ** 2 + (Y - y0) ** 2
        w = np.exp(-d2 / (2.0 * sigma * sigma))
        Z += w * z0
        W += w
    W = np.where(W <= 1e-12, np.nan, W)
    Z = Z / W
    Z[~head_mask] = np.nan

    cmap = plt.get_cmap(cmap_name)
    if center_zero:
        vmax = max(2.5, float(np.nanmax(np.abs(zs))) + 0.25)
        vmin = -vmax
    else:
        vmin = float(np.nanmin(zs))
        vmax = float(np.nanmax(zs))
        if math.isclose(vmin, vmax):
            pad = max(1e-9, abs(vmax) * 0.05, 0.05)
            vmin -= pad
            vmax += pad

    fig, ax = plt.subplots(figsize=(6.6, 6.6), dpi=150)
    im = ax.contourf(X, Y, Z, levels=40, cmap=cmap, vmin=vmin, vmax=vmax)
    head = plt.Circle((0.0, 0.0), 1.0, fill=False, color="black", lw=2.0)
    ax.add_patch(head)
    ax.plot([-0.12, 0.0, 0.12], [1.00, 1.15, 1.00], color="black", lw=2.0)
    ax.plot([-1.0, -1.08, -1.0], [0.10, 0.00, -0.10], color="black", lw=2.0)
    ax.plot([1.0, 1.08, 1.0], [0.10, 0.00, -0.10], color="black", lw=2.0)

    for label in labels:
        x, y = HEAD_COORDS_1020[label]
        val = values.get(label)
        if val is None:
            ax.scatter([x], [y], s=80, c="#c9c9c9", marker="s", edgecolors="black", linewidths=0.8, zorder=6)
            ax.text(x, y + 0.045, _display_location(label), ha="center", va="bottom", fontsize=8, color="black")
            ax.text(x, y - 0.015, "NA", ha="center", va="center", fontsize=6, color="black")
        else:
            ax.scatter([x], [y], s=45, c="black", edgecolors="white", linewidths=0.8, zorder=6)
            ax.text(x, y + 0.045, _display_location(label), ha="center", va="bottom", fontsize=8, color="black")

    ax.set_title(f"{title}\nGrey = unavailable / excluded", fontsize=11)
    ax.set_xlim(-1.15, 1.15)
    ax.set_ylim(-1.15, 1.20)
    ax.set_aspect("equal", "box")
    ax.axis("off")
    cb = fig.colorbar(im, ax=ax, fraction=0.045, pad=0.04)
    cb.set_label(colorbar_label)
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)


def _plot_pair_heatmap(values: dict[tuple[str, str], float | None], *, title: str, out_path: Path) -> None:
    labels = [_canonical_location(loc) for loc in EXPECTED_LOCATIONS]
    n = len(labels)
    matrix = np.full((n, n), np.nan, dtype=float)
    for i, left in enumerate(labels):
        matrix[i, i] = 0.0
        for j, right in enumerate(labels):
            if i >= j:
                continue
            value = values.get((left, right))
            if value is not None:
                matrix[i, j] = float(value)
                matrix[j, i] = float(value)
    finite_vals = np.asarray([value for value in values.values() if value is not None], dtype=float)
    vmax = max(2.5, float(np.nanmax(np.abs(finite_vals))) + 0.25) if finite_vals.size else 2.5
    cmap = plt.get_cmap("RdBu_r").copy()
    cmap.set_bad("#c9c9c9")

    fig, ax = plt.subplots(figsize=(9.2, 8.1), dpi=150)
    masked = np.ma.masked_invalid(matrix)
    im = ax.imshow(masked, cmap=cmap, vmin=-vmax, vmax=vmax)
    ax.set_xticks(range(n))
    ax.set_yticks(range(n))
    ax.set_xticklabels([_display_location(label) for label in labels], rotation=90, fontsize=8)
    ax.set_yticklabels([_display_location(label) for label in labels], fontsize=8)
    ax.set_title(f"{title}\nGrey = pair unavailable / excluded", fontsize=11)
    cb = fig.colorbar(im, ax=ax, fraction=0.045, pad=0.03)
    cb.set_label("Z-score")
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)


def _plot_pair_network(
    values: dict[tuple[str, str], float | None],
    *,
    title: str,
    out_path: Path,
    significance_z: float = 2.0,
) -> None:
    labels = [_canonical_location(loc) for loc in EXPECTED_LOCATIONS]
    finite_vals = np.asarray([float(value) for value in values.values() if value is not None], dtype=float)
    vmax = max(2.5, float(np.nanmax(np.abs(finite_vals))) + 0.25) if finite_vals.size else 2.5
    cmap = plt.get_cmap("RdBu_r")
    norm = matplotlib.colors.Normalize(vmin=-vmax, vmax=vmax)

    fig, ax = plt.subplots(figsize=(7.6, 7.6), dpi=150)
    head = plt.Circle((0.0, 0.0), 1.0, fill=False, color="black", lw=2.0)
    ax.add_patch(head)
    ax.plot([-0.12, 0.0, 0.12], [1.00, 1.15, 1.00], color="black", lw=2.0)
    ax.plot([-1.0, -1.08, -1.0], [0.10, 0.00, -0.10], color="black", lw=2.0)
    ax.plot([1.0, 1.08, 1.0], [0.10, 0.00, -0.10], color="black", lw=2.0)

    available_pairs = sorted(
        ((pair, float(value)) for pair, value in values.items() if value is not None),
        key=lambda item: abs(item[1]),
    )
    significant_pairs = [(pair, value) for pair, value in available_pairs if abs(value) >= significance_z]
    background_pairs = [(pair, value) for pair, value in available_pairs if abs(value) < significance_z]

    for (left, right), _ in background_pairs:
        x1, y1 = HEAD_COORDS_1020[left]
        x2, y2 = HEAD_COORDS_1020[right]
        ax.plot([x1, x2], [y1, y2], color="#bdbdbd", lw=0.7, alpha=0.24, zorder=1)

    for (left, right), value in significant_pairs:
        x1, y1 = HEAD_COORDS_1020[left]
        x2, y2 = HEAD_COORDS_1020[right]
        width = 1.0 + 2.6 * min(1.0, abs(value) / max(vmax, 1e-9))
        ax.plot([x1, x2], [y1, y2], color=cmap(norm(value)), lw=width, alpha=0.92, zorder=3)

    connected = {
        label
        for (left, right), value in available_pairs
        for label in ((left, right) if value is not None else ())
    }
    for label in labels:
        x, y = HEAD_COORDS_1020[label]
        if label not in connected:
            face = "#c9c9c9"
            edge = "#808080"
        else:
            face = "white"
            edge = "black"
        ax.scatter([x], [y], s=95, c=face, edgecolors=edge, linewidths=1.1, zorder=5)
        ax.text(x, y + 0.047, _display_location(label), ha="center", va="bottom", fontsize=8, color="black", zorder=6)

    ax.text(
        0.0,
        -1.12,
        f"Grey thin lines = available pairs within +/-{significance_z:.1f} z\nGrey nodes = no available pairs in this dataset",
        ha="center",
        va="top",
        fontsize=8,
        color="#444444",
    )
    ax.set_title(
        f"{title}\nRed = hyper vs norm, Blue = hypo vs norm",
        fontsize=11,
    )
    ax.set_xlim(-1.15, 1.15)
    ax.set_ylim(-1.22, 1.20)
    ax.set_aspect("equal", "box")
    ax.axis("off")
    sm = matplotlib.cm.ScalarMappable(norm=norm, cmap=cmap)
    sm.set_array([])
    cb = fig.colorbar(sm, ax=ax, fraction=0.045, pad=0.04)
    cb.set_label("Z-score")
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)


def _plot_cleaning_timeline(cleaned_recordings: Sequence[dict[str, Any]], out_path: Path) -> None:
    fig, ax = plt.subplots(figsize=(10.5, 2.6 + 1.6 * len(cleaned_recordings)), dpi=150)
    for idx, summary in enumerate(cleaned_recordings):
        y = len(cleaned_recordings) - idx
        total = 0.0
        keep_ranges = [(float(start), float(end)) for start, end in summary["keep_ranges_seconds"]]
        excluded_ranges = [(float(start), float(end)) for start, end in summary["excluded_ranges_seconds"]]
        for ranges in (keep_ranges, excluded_ranges):
            for _, end in ranges:
                total = max(total, end)
        ax.broken_barh([(0, total)], (y - 0.32, 0.64), facecolors="#f0f0f0", edgecolors="#d0d0d0")
        if keep_ranges:
            ax.broken_barh([(start, end - start) for start, end in keep_ranges], (y - 0.32, 0.64), facecolors="#3c8d63")
        if excluded_ranges:
            ax.broken_barh(
                [(start, end - start) for start, end in excluded_ranges],
                (y - 0.32, 0.64),
                facecolors="#cf4d4d",
            )
        label = f"{summary['label']}  kept {summary['retained_seconds']:.0f}s"
        if summary["all_dropped_channels"]:
            label += f"  drop: {', '.join(summary['all_dropped_channels'])}"
        ax.text(total + 2.0, y, label, va="center", fontsize=9)
    ax.set_yticks([])
    ax.set_xlabel("Seconds")
    ax.set_title("EO Recording Cleaning Timeline\nGreen = kept, red = excluded artifact", fontsize=11)
    ax.grid(True, axis="x", alpha=0.25)
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)


def _top_rows(rows: Iterable[dict[str, Any]], *, metric_types: Sequence[str], limit: int) -> list[dict[str, Any]]:
    filtered = []
    wanted = {metric_type.lower() for metric_type in metric_types}
    for row in rows:
        metric_type = str(row.get("metric_type", "")).lower()
        if metric_type not in wanted:
            continue
        z = row.get("zscore")
        if z is None:
            continue
        try:
            z_val = float(z)
        except (TypeError, ValueError):
            continue
        if math.isnan(z_val):
            continue
        filtered.append((abs(z_val), z_val, row))
    filtered.sort(key=lambda item: (-item[0], item[2].get("metric_type", ""), item[2].get("band", ""), item[2].get("pair") or item[2].get("norm_keys")))
    return [row for _abs_z, _z, row in filtered[:limit]]


def _count_status(rows: Iterable[dict[str, Any]]) -> dict[str, int]:
    counts = {"IN_RANGE": 0, "OUT_OF_RANGE": 0, "MISSING": 0}
    for row in rows:
        status = str(row.get("status", "MISSING")).upper()
        counts[status] = counts.get(status, 0) + 1
    return counts


def _group_metric_counts(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[tuple[str, str], dict[str, int]] = {}
    for row in rows:
        metric_type = str(row.get("metric_type", "")).lower()
        band = str(row.get("band", "") or "-").lower()
        key = (metric_type, band)
        bucket = counts.setdefault(key, {"IN_RANGE": 0, "OUT_OF_RANGE": 0, "MISSING": 0})
        status = str(row.get("status", "MISSING")).upper()
        bucket[status] = bucket.get(status, 0) + 1
    out = []
    for (metric_type, band), bucket in sorted(counts.items()):
        out.append(
            {
                "metric_type": metric_type,
                "band": band,
                "in_range": bucket.get("IN_RANGE", 0),
                "out_of_range": bucket.get("OUT_OF_RANGE", 0),
                "missing": bucket.get("MISSING", 0),
            }
        )
    return out


def _format_metric_row(row: dict[str, Any]) -> str:
    metric_type = str(row.get("metric_type", ""))
    band = str(row.get("band", ""))
    z = float(row.get("zscore", float("nan")))
    value = float(row.get("value", float("nan")))
    if row.get("pair"):
        pair = row["pair"]
        where = _display_pair(f"{pair[0]}/{pair[1]}")
    else:
        keys = row.get("norm_keys") or []
        where = "?"
        if keys:
            parts = str(keys[0]).split(":")
            if len(parts) >= 2:
                where = _display_location(parts[1])
    label = metric_type
    if band:
        label += f" {band}"
    return f"- `{where}`: `{label}` z=`{z:+.2f}` value=`{value:.4f}`"


def _channel_list_text(channels: Sequence[str]) -> str:
    return ", ".join(str(ch) for ch in channels) if channels else "none"


def _write_report(cleaned_recordings: Sequence[dict[str, Any]], global_result: dict[str, Any], age_result: dict[str, Any]) -> Path:
    report_path = OUTPUT_ROOT / "report.md"
    global_rows = global_result["derived"]["coherence"]["rows"]
    age_rows = age_result["derived"]["coherence"]["rows"]
    global_status = _count_status(global_rows)
    age_status = _count_status(age_rows)
    global_top_sites = _top_rows(global_rows, metric_types=["absolute_power", "relative_power", "theta_beta_ratio", "peak_alpha_frequency", "total_coherence"], limit=12)
    global_top_pairs = _top_rows(global_rows, metric_types=["coherence", "phase", "asymmetry"], limit=12)
    age_top_sites = _top_rows(age_rows, metric_types=["absolute_power", "relative_power", "theta_beta_ratio", "peak_alpha_frequency", "total_coherence"], limit=12)
    age_top_pairs = _top_rows(age_rows, metric_types=["coherence", "phase", "asymmetry"], limit=12)

    lines: list[str] = []
    lines.append("# EO QEEG Report")
    lines.append("")
    lines.append("All scoring below treated these recordings as **eyes open (EO)** and used the local `dvs_608_eo_cleaned_allpairs` norms.")
    lines.append("")
    lines.append("## Recording Quality")
    lines.append("")
    for summary in cleaned_recordings:
        lines.append(
            f"- `{summary['label']}`: retained `{summary['retained_seconds']:.1f}` s after artifact cutting; "
            f"forced bad `{_channel_list_text(summary['forced_bad_channels'])}`; "
            f"auto bad `{_channel_list_text(summary['auto_bad_channels'])}`; "
            f"final dropped `{_channel_list_text(summary['all_dropped_channels'])}`."
        )
    lines.append("")
    if any(summary["forced_bad_channels"] for summary in cleaned_recordings):
        lines.append("- Forced-bad channels were excluded before preprocessing and were treated as unavailable in every downstream site and pair metric.")
    if any(summary["auto_bad_channels"] for summary in cleaned_recordings):
        lines.append("- Auto-bad channels were detected from flatline / saturation patterns in the raw CSV and were excluded on the same footing as forced-bad channels.")
    lines.append("- Pairwise coherence was only computed when both channels were present in the same retained recording segment. Missing locations and uncovered pairs stay unavailable instead of being filled in.")
    lines.append("- Pairwise metrics now have two figure styles on purpose: square matrices for full pair tables, and head-network line plots for hypo/hyper pair visualization.")
    lines.append("")
    lines.append("## What The Numbers Mean")
    lines.append("")
    lines.append("- `absolute_power`: raw spectral power inside a band at one site.")
    lines.append("- `relative_power`: a band's share of that site's total delta+theta+alpha+beta power.")
    lines.append("- `theta_beta_ratio`: theta power divided by beta power; a summary attention/arousal ratio.")
    lines.append("- `peak_alpha_frequency`: the strongest alpha-bin frequency between 8 and 12 Hz.")
    lines.append("- `coherence`: band-limited coupling between two sites.")
    lines.append("- `phase`: average phase lag between two sites in a band.")
    lines.append("- `asymmetry`: left-right power imbalance for a pair, expressed as percent.")
    lines.append("- `z-score`: distance from the norm mean in standard deviations. Around `0` is typical, around `|2|` is the usual edge-of-range cutoff in these stored norms.")
    lines.append("")
    lines.append("## Global Norm Summary")
    lines.append("")
    lines.append(
        f"- Scored rows: `{len(global_rows)}`. In range: `{global_status.get('IN_RANGE', 0)}`. "
        f"Out of range: `{global_status.get('OUT_OF_RANGE', 0)}`. Missing: `{global_status.get('MISSING', 0)}`."
    )
    lines.append("- Strongest site-level deviations:")
    lines.extend(_format_metric_row(row) for row in global_top_sites)
    lines.append("- Strongest pair-level deviations:")
    lines.extend(_format_metric_row(row) for row in global_top_pairs)
    lines.append("")
    lines.append("## Age-30 Norm Summary")
    lines.append("")
    lines.append(
        f"- Subject age was set to `30`, which maps to the local age bin `{age_result['metadata'].get('age_bin')}`."
    )
    lines.append(
        f"- Scored rows: `{len(age_rows)}`. In range: `{age_status.get('IN_RANGE', 0)}`. "
        f"Out of range: `{age_status.get('OUT_OF_RANGE', 0)}`. Missing: `{age_status.get('MISSING', 0)}`."
    )
    lines.append("- Strongest site-level deviations:")
    lines.extend(_format_metric_row(row) for row in age_top_sites)
    lines.append("- Strongest pair-level deviations:")
    lines.extend(_format_metric_row(row) for row in age_top_pairs)
    lines.append("")
    lines.append("## Interpretation Guardrails")
    lines.append("")
    lines.append("- This was a partial-montage EO acquisition assembled across two different runs, not a simultaneous full-cap recording.")
    lines.append("- Any grey site or grey pair in the figures is truly unavailable because the channel was dead, clipped, or never co-recorded with its partner.")
    lines.append("- On the pair-network plots, red lines mean positive z-scores and blue lines mean negative z-scores; thin grey lines are available pairs that stayed within roughly normal range.")
    lines.append("- These results are best treated as a structured screening summary, not as a substitute for a formally reviewed clinical QEEG workflow with synchronized full-cap acquisition and human artifact review.")
    lines.append("")

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines), encoding="utf-8")
    return report_path


def _save_result_bundle(result: dict[str, Any], *, bundle_name: str) -> dict[str, str]:
    bundle_dir = OUTPUT_ROOT / bundle_name
    bundle_dir.mkdir(parents=True, exist_ok=True)
    result_json = bundle_dir / "result.json"
    _write_json(result_json, result)

    rows = result["derived"]["coherence"]["rows"]
    _write_csv(
        bundle_dir / "derived_rows.csv",
        rows,
        [
            "metric_type",
            "band",
            "value",
            "zscore",
            "status",
            "norm_source",
            "n_epochs",
            "pair",
            "norm_keys",
        ],
    )
    _write_csv(bundle_dir / "metric_counts.csv", _group_metric_counts(rows), ["metric_type", "band", "in_range", "out_of_range", "missing"])

    plots_dir = bundle_dir / "plots"
    alpha_abs = _site_map(rows, "absolute_power", "alpha")
    theta_beta = _site_map(rows, "theta_beta_ratio", None)
    alpha_totcoh = _site_map(rows, "total_coherence", "alpha")
    _plot_site_cubes(
        alpha_abs,
        title=f"{bundle_name}: alpha absolute power",
        out_path=plots_dir / "alpha_absolute_power_sites.png",
    )
    _plot_site_topomap(
        alpha_abs,
        title=f"{bundle_name}: alpha absolute power",
        out_path=plots_dir / "alpha_absolute_power_headmap.png",
    )
    _plot_site_cubes(
        theta_beta,
        title=f"{bundle_name}: theta/beta ratio",
        out_path=plots_dir / "theta_beta_ratio_sites.png",
    )
    _plot_site_topomap(
        theta_beta,
        title=f"{bundle_name}: theta/beta ratio",
        out_path=plots_dir / "theta_beta_ratio_headmap.png",
    )
    _plot_site_cubes(
        alpha_totcoh,
        title=f"{bundle_name}: alpha total coherence",
        out_path=plots_dir / "alpha_total_coherence_sites.png",
    )
    _plot_site_topomap(
        alpha_totcoh,
        title=f"{bundle_name}: alpha total coherence",
        out_path=plots_dir / "alpha_total_coherence_headmap.png",
    )
    _plot_pair_heatmap(
        _pair_map(rows, "coherence", "alpha"),
        title=f"{bundle_name}: alpha coherence pairs",
        out_path=plots_dir / "alpha_coherence_pairs.png",
    )
    _plot_pair_network(
        _pair_map(rows, "coherence", "alpha"),
        title=f"{bundle_name}: alpha coherence network",
        out_path=plots_dir / "alpha_coherence_network.png",
    )
    _plot_pair_heatmap(
        _pair_map(rows, "phase", "alpha"),
        title=f"{bundle_name}: alpha phase pairs",
        out_path=plots_dir / "alpha_phase_pairs.png",
    )
    _plot_pair_network(
        _pair_map(rows, "phase", "alpha"),
        title=f"{bundle_name}: alpha phase network",
        out_path=plots_dir / "alpha_phase_network.png",
    )
    return {
        "result_json": str(result_json),
        "rows_csv": str(bundle_dir / "derived_rows.csv"),
        "counts_csv": str(bundle_dir / "metric_counts.csv"),
        "plots_dir": str(plots_dir),
    }


def main() -> int:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    cleaned_recordings = [_save_recording_outputs(spec) for spec in RECORDINGS]
    _plot_cleaning_timeline(cleaned_recordings, OUTPUT_ROOT / "cleaning_timeline.png")
    _write_json(OUTPUT_ROOT / "cleaned_recordings" / "manifest.json", cleaned_recordings)

    global_result = _run_analysis(cleaned_recordings, zscore_mode="global", subject_age=None)
    age_result = _run_analysis(cleaned_recordings, zscore_mode="age", subject_age=30.0)

    global_bundle = _save_result_bundle(global_result, bundle_name="global_norms")
    age_bundle = _save_result_bundle(age_result, bundle_name="age30_norms")
    report_path = _write_report(cleaned_recordings, global_result, age_result)

    manifest = {
        "output_root": str(OUTPUT_ROOT),
        "cleaned_recordings": cleaned_recordings,
        "global_bundle": global_bundle,
        "age30_bundle": age_bundle,
        "report_path": str(report_path),
        "cleaning_timeline": str(OUTPUT_ROOT / "cleaning_timeline.png"),
    }
    _write_json(OUTPUT_ROOT / "manifest.json", manifest)
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
