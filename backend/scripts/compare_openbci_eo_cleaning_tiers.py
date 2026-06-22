from __future__ import annotations

import csv
import json
import math
import os
from pathlib import Path
from typing import Any, Dict, Iterable, Sequence

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import mne
import numpy as np

from analyze_openbci_eo_qeeg import (
    EXPECTED_LOCATIONS,
    RECORDINGS,
    _canonical_location,
    _detect_auto_bad_channels,
    _detect_bad_ranges,
    _display_location,
    _display_pair,
    _load_brainflow_csv,
    _merge_ranges,
    _pair_map,
    _plot_pair_heatmap,
    _plot_pair_network,
    _plot_site_topomap,
    _preprocess_raw,
    _rows_for_metric,
    _run_analysis,
    _site_map,
    _write_csv,
    _write_json,
)
from clinicalq_backend.bands import extract_features

DEFAULT_OUTPUT_ROOT = Path.home() / "Documents" / "OpenBCI_GUI" / "QEEG_Analysis" / "eo_qeeg_compare_cleaning_2026-04-05"
OUTPUT_ROOT = Path(
    os.environ.get(
        "QEEG_COMPARE_OUTPUT_ROOT",
        os.environ.get("QEEG_OUTPUT_ROOT", str(DEFAULT_OUTPUT_ROOT)),
    )
)
AGE_YEARS = 30.0
WINDOW_SECONDS = 10.0
TIER_FRACTIONS: dict[str, float | None] = {
    "normal": None,
    "top10": 0.10,
    "top1": 0.01,
}
SITE_METRIC_TYPES = {"absolute_power", "relative_power", "theta_beta_ratio", "peak_alpha_frequency", "total_coherence"}
PAIR_METRIC_TYPES = {"coherence", "phase", "asymmetry"}
NORM_BANDS = ("delta", "theta", "alpha", "beta")
PAIR_BANDS = ("delta", "theta", "alpha", "beta")
PAIR_METRIC_ORDER = ("coherence", "phase", "asymmetry")


def _samples_for_ranges(raw: mne.io.BaseRaw, keep_ranges: Sequence[Sequence[float]]) -> dict[str, list[np.ndarray]]:
    sfreq = float(raw.info["sfreq"])
    data_uv = raw.get_data() * 1e6
    by_channel: dict[str, list[np.ndarray]] = {}
    for idx, ch_name in enumerate(raw.ch_names):
        canon = _canonical_location(ch_name)
        segments: list[np.ndarray] = []
        for start, end in keep_ranges:
            s = max(0, int(math.floor(float(start) * sfreq)))
            e = min(data_uv.shape[1], int(math.ceil(float(end) * sfreq)))
            if e - s >= 8:
                segments.append(np.asarray(data_uv[idx, s:e], dtype=float))
        if segments:
            by_channel[canon] = segments
    return by_channel


def _descriptive_band_maps(
    cleaned_recordings: Sequence[dict[str, Any]],
    *,
    band_name: str,
    denominator_bands: Sequence[str],
) -> tuple[dict[str, float | None], dict[str, float | None]]:
    weighted_amp: dict[str, float] = {}
    weighted_rel: dict[str, float] = {}
    weights: dict[str, float] = {}

    for summary in cleaned_recordings:
        raw = mne.io.read_raw_fif(summary["preprocessed_fif"], preload=True, verbose="ERROR")
        series_by_channel = _samples_for_ranges(raw, summary["keep_ranges_seconds"])
        sfreq = int(round(float(raw.info["sfreq"])))
        for canon, segments in series_by_channel.items():
            for seg in segments:
                seconds = float(seg.size / max(sfreq, 1))
                if seconds <= 0.0:
                    continue
                feats = extract_features(seg, sfreq)
                denom = float(sum(float(feats.get(name, 0.0)) for name in denominator_bands))
                amp = float(feats.get(band_name, 0.0))
                rel = float("nan") if denom <= 0.0 else float(amp / denom)
                weighted_amp[canon] = weighted_amp.get(canon, 0.0) + seconds * amp
                if not math.isnan(rel):
                    weighted_rel[canon] = weighted_rel.get(canon, 0.0) + seconds * rel
                weights[canon] = weights.get(canon, 0.0) + seconds

    amp_map: dict[str, float | None] = {}
    rel_map: dict[str, float | None] = {}
    for loc in [_canonical_location(loc) for loc in EXPECTED_LOCATIONS]:
        weight = weights.get(loc, 0.0)
        if weight <= 0.0:
            amp_map[loc] = None
            rel_map[loc] = None
            continue
        amp_map[loc] = weighted_amp.get(loc, 0.0) / weight
        rel_map[loc] = weighted_rel.get(loc, 0.0) / weight if loc in weighted_rel else None
    return amp_map, rel_map


def _sample_mask_from_ranges(total_samples: int, sfreq: float, ranges: Sequence[Sequence[float]]) -> np.ndarray:
    mask = np.zeros(int(total_samples), dtype=bool)
    for start, end in ranges:
        s = max(0, int(math.floor(float(start) * sfreq)))
        e = min(total_samples, int(math.ceil(float(end) * sfreq)))
        if e > s:
            mask[s:e] = True
    return mask


def _robust_positive_z(values: Sequence[float]) -> np.ndarray:
    arr = np.asarray(values, dtype=float)
    med = float(np.nanmedian(arr))
    mad = float(np.nanmedian(np.abs(arr - med)))
    scale = max(1e-9, 1.4826 * mad)
    z = (arr - med) / scale
    return np.maximum(0.0, z)


def _merge_adjacent_windows(ranges: Sequence[tuple[float, float]]) -> list[list[float]]:
    merged = _merge_ranges(ranges, gap_seconds=0.0)
    return [[round(start, 3), round(end, 3)] for start, end in merged]


def _window_scores(preprocessed: mne.io.BaseRaw, normal_bad_ranges: Sequence[Sequence[float]]) -> list[dict[str, float | int | bool]]:
    data_uv = preprocessed.get_data() * 1e6
    sfreq = float(preprocessed.info["sfreq"])
    n_samples = data_uv.shape[1]
    win = int(round(WINDOW_SECONDS * sfreq))
    if win <= 0:
        raise RuntimeError("Window length must be positive.")

    hard_bad_mask = _sample_mask_from_ranges(n_samples, sfreq, normal_bad_ranges)
    rows: list[dict[str, float | int | bool]] = []
    for start in range(0, max(0, n_samples - win + 1), win):
        end = start + win
        seg = data_uv[:, start:end]
        diff = np.diff(seg, axis=1, prepend=seg[:, :1])
        any_abs = np.any(np.abs(seg) > 100.0, axis=0)
        any_diff = np.any(np.abs(diff) > 75.0, axis=0)

        freqs = np.fft.rfftfreq(seg.shape[1], d=1.0 / sfreq)
        window = np.hanning(seg.shape[1])[None, :]
        spec = np.fft.rfft(seg * window, axis=1)
        power = (np.abs(spec) ** 2)
        total_mask = (freqs >= 1.0) & (freqs <= 40.0)
        hf_mask = (freqs >= 25.0) & (freqs <= 40.0)
        total_power = float(np.mean(np.sum(power[:, total_mask], axis=1)))
        hf_power = float(np.mean(np.sum(power[:, hf_mask], axis=1)))
        hf_ratio = 0.0 if total_power <= 0 else float(hf_power / total_power)

        rows.append(
            {
                "start_seconds": float(start / sfreq),
                "end_seconds": float(end / sfreq),
                "max_abs_uv": float(np.max(np.abs(seg))),
                "median_abs_uv": float(np.median(np.abs(seg))),
                "max_ptp_uv": float(np.max(np.ptp(seg, axis=1))),
                "median_ptp_uv": float(np.median(np.ptp(seg, axis=1))),
                "max_diff_std_uv": float(np.max(np.std(np.diff(seg, axis=1), axis=1))),
                "spike_sample_pct": float(np.mean(any_abs) * 100.0),
                "spike_diff_pct": float(np.mean(any_diff) * 100.0),
                "hf_ratio": hf_ratio,
                "hard_bad_fraction": float(np.mean(hard_bad_mask[start:end])),
            }
        )

    if not rows:
        raise RuntimeError("No windows available for cleaning-tier scoring.")

    metric_names = [
        "max_abs_uv",
        "median_abs_uv",
        "max_ptp_uv",
        "median_ptp_uv",
        "max_diff_std_uv",
        "spike_sample_pct",
        "spike_diff_pct",
        "hf_ratio",
    ]
    z_by_metric = {name: _robust_positive_z([float(row[name]) for row in rows]) for name in metric_names}

    for idx, row in enumerate(rows):
        hard_bad_fraction = float(row["hard_bad_fraction"])
        hard_penalty = 0.0 if hard_bad_fraction <= 0 else (20.0 + 200.0 * hard_bad_fraction)
        score = hard_penalty
        score += 2.0 * float(z_by_metric["median_abs_uv"][idx])
        score += 2.0 * float(z_by_metric["max_abs_uv"][idx])
        score += 1.5 * float(z_by_metric["median_ptp_uv"][idx])
        score += 1.5 * float(z_by_metric["max_ptp_uv"][idx])
        score += 2.5 * float(z_by_metric["max_diff_std_uv"][idx])
        score += 3.0 * float(z_by_metric["spike_sample_pct"][idx])
        score += 3.0 * float(z_by_metric["spike_diff_pct"][idx])
        score += 2.0 * float(z_by_metric["hf_ratio"][idx])
        row["artifact_score"] = float(score)
        row["has_hard_bad_overlap"] = bool(hard_bad_fraction > 0.0)

    rows.sort(key=lambda item: (float(item["artifact_score"]), float(item["start_seconds"])))
    for idx, row in enumerate(rows, start=1):
        row["rank"] = idx
    return rows


def _select_keep_ranges(scored_windows: Sequence[dict[str, float | int | bool]], fraction: float) -> list[list[float]]:
    count = max(1, int(math.ceil(len(scored_windows) * float(fraction))))
    selected = sorted(scored_windows[:count], key=lambda item: float(item["start_seconds"]))
    ranges = [(float(row["start_seconds"]), float(row["end_seconds"])) for row in selected]
    return _merge_adjacent_windows(ranges)


def _plot_window_scores(prepared: dict[str, Any], out_path: Path) -> None:
    rows = prepared["scored_windows"]
    starts = np.asarray([float(row["start_seconds"]) for row in rows], dtype=float)
    scores = np.asarray([float(row["artifact_score"]) for row in rows], dtype=float)
    ranks = np.asarray([int(row["rank"]) for row in rows], dtype=int)

    rows_by_time = sorted(rows, key=lambda item: float(item["start_seconds"]))
    starts_by_time = np.asarray([float(row["start_seconds"]) for row in rows_by_time], dtype=float)
    scores_by_time = np.asarray([float(row["artifact_score"]) for row in rows_by_time], dtype=float)

    tier_ranges = prepared["tier_keep_ranges"]
    tier_colors = {"normal": "#2e7d32", "top10": "#1565c0", "top1": "#6a1b9a"}

    fig, axes = plt.subplots(2, 1, figsize=(11.0, 6.2), dpi=150, constrained_layout=True)
    axes[0].plot(starts_by_time, scores_by_time, color="black", lw=1.5)
    for tier, ranges in tier_ranges.items():
        if tier == "normal":
            continue
        for start, end in ranges:
            axes[0].axvspan(float(start), float(end), color=tier_colors[tier], alpha=0.18)
    axes[0].set_title(f"{prepared['label']}: 10-second artifact scores")
    axes[0].set_ylabel("Artifact score")
    axes[0].set_xlabel("Time (s)")
    axes[0].grid(True, alpha=0.25)

    axes[1].scatter(ranks, scores, s=24, color="#444444")
    axes[1].axvline(max(1, int(math.ceil(len(rows) * 0.10))), color=tier_colors["top10"], lw=1.5, linestyle="--", label="top10 cutoff")
    axes[1].axvline(max(1, int(math.ceil(len(rows) * 0.01))), color=tier_colors["top1"], lw=1.5, linestyle="--", label="top1 cutoff")
    axes[1].set_title(f"{prepared['label']}: clean-window ranking")
    axes[1].set_xlabel("Rank (1 = cleanest)")
    axes[1].set_ylabel("Artifact score")
    axes[1].grid(True, alpha=0.25)
    axes[1].legend(loc="upper left")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)


def _prepare_recording(spec) -> dict[str, Any]:
    matrix, raw = _load_brainflow_csv(spec)
    auto_bad_channels, auto_bad_details = _detect_auto_bad_channels(matrix, spec.channel_names)
    all_dropped = sorted({*spec.forced_bad_channels, *auto_bad_channels})
    preprocessed = _preprocess_raw(raw, all_dropped)
    normal_bad_ranges, normal_keep_ranges, normal_window_metrics = _detect_bad_ranges(preprocessed)
    scored_windows = _window_scores(preprocessed, normal_bad_ranges)

    out_dir = OUTPUT_ROOT / "prepared_recordings" / spec.label
    out_dir.mkdir(parents=True, exist_ok=True)
    preprocessed_fif = out_dir / f"{spec.csv_path.stem}_preprocessed.fif"
    preprocessed.save(preprocessed_fif, overwrite=True, verbose="ERROR")

    tier_keep_ranges = {
        "normal": [[float(start), float(end)] for start, end in normal_keep_ranges],
        "top10": _select_keep_ranges(scored_windows, 0.10),
        "top1": _select_keep_ranges(scored_windows, 0.01),
    }

    summary = {
        "label": spec.label,
        "source_csv": str(spec.csv_path),
        "preprocessed_fif": str(preprocessed_fif),
        "forced_bad_channels": list(spec.forced_bad_channels),
        "auto_bad_channels": auto_bad_channels,
        "all_dropped_channels": all_dropped,
        "auto_bad_channel_details": auto_bad_details,
        "remaining_channels": list(preprocessed.ch_names),
        "normal_excluded_ranges_seconds": [[float(start), float(end)] for start, end in normal_bad_ranges],
        "normal_keep_ranges_seconds": [[float(start), float(end)] for start, end in normal_keep_ranges],
        "tier_keep_ranges": tier_keep_ranges,
        "scored_windows": scored_windows,
    }

    _write_json(out_dir / "summary.json", summary)
    _write_csv(
        out_dir / "normal_window_metrics.csv",
        normal_window_metrics,
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
    _write_csv(
        out_dir / "scored_windows_10s.csv",
        scored_windows,
        [
            "rank",
            "start_seconds",
            "end_seconds",
            "artifact_score",
            "hard_bad_fraction",
            "max_abs_uv",
            "median_abs_uv",
            "max_ptp_uv",
            "median_ptp_uv",
            "max_diff_std_uv",
            "spike_sample_pct",
            "spike_diff_pct",
            "hf_ratio",
            "has_hard_bad_overlap",
        ],
    )
    _plot_window_scores(summary, out_dir / "window_score_plot.png")
    return summary


def _tier_recording_summary(prepared: dict[str, Any], tier: str) -> dict[str, Any]:
    keep_ranges = prepared["tier_keep_ranges"][tier]
    retained_seconds = float(sum(float(end) - float(start) for start, end in keep_ranges))
    total = 0.0
    for row in prepared["scored_windows"]:
        total = max(total, float(row["end_seconds"]))
    return {
        "label": prepared["label"],
        "source_csv": prepared["source_csv"],
        "preprocessed_fif": prepared["preprocessed_fif"],
        "keep_ranges_seconds": keep_ranges,
        "retained_seconds": round(retained_seconds, 3),
        "retained_fraction": round(retained_seconds / total, 4) if total > 0 else 0.0,
        "all_dropped_channels": prepared["all_dropped_channels"],
        "remaining_channels": prepared["remaining_channels"],
    }


def _row_key(row: dict[str, Any]) -> str:
    metric_type = str(row.get("metric_type", "")).lower()
    band = str(row.get("band", "") or "-").lower()
    pair = row.get("pair")
    if isinstance(pair, list) and len(pair) == 2:
        left = _canonical_location(str(pair[0]))
        right = _canonical_location(str(pair[1]))
        return f"{metric_type}|{band}|{left}|{right}"
    location = row.get("location_label")
    if location:
        loc = _canonical_location(str(location))
        return f"{metric_type}|{band}|{loc}"
    keys = row.get("norm_keys") or []
    if keys:
        return f"{metric_type}|{band}|{keys[0]}"
    return f"{metric_type}|{band}|unknown"


def _row_target(row: dict[str, Any]) -> str:
    pair = row.get("pair")
    if isinstance(pair, list) and len(pair) == 2:
        return _display_pair(f"{pair[0]}/{pair[1]}")
    location = row.get("location_label")
    if location:
        return _display_location(str(location))
    return "?"


def _top_rows(rows: Iterable[dict[str, Any]], *, metric_types: set[str], limit: int = 10) -> list[dict[str, Any]]:
    ranked = []
    for row in rows:
        metric_type = str(row.get("metric_type", "")).lower()
        if metric_type not in metric_types:
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
        ranked.append((abs(z_val), _row_key(row), row))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    return [row for _, _, row in ranked[:limit]]


def _format_row(row: dict[str, Any]) -> str:
    metric_type = str(row.get("metric_type", "")).lower()
    band = str(row.get("band", "") or "").lower()
    z = float(row.get("zscore", float("nan")))
    value = float(row.get("value", float("nan")))
    label = metric_type if not band else f"{metric_type} {band}"
    return f"- `{_row_target(row)}`: `{label}` z=`{z:+.2f}` value=`{value:.4f}`"


def _compare_tier_rows(rows_by_tier: dict[str, list[dict[str, Any]]], *, metric_types: set[str]) -> dict[str, list[dict[str, Any]]]:
    keyed: dict[str, dict[str, dict[str, Any]]] = {}
    for tier, rows in rows_by_tier.items():
        for row in rows:
            if str(row.get("metric_type", "")).lower() not in metric_types:
                continue
            keyed.setdefault(_row_key(row), {})[tier] = row

    stable_outliers: list[dict[str, Any]] = []
    disappears_with_cleaning: list[dict[str, Any]] = []
    most_variable: list[dict[str, Any]] = []

    for key, per_tier in keyed.items():
        if not all(tier in per_tier for tier in TIER_FRACTIONS):
            continue
        z_values = []
        statuses = []
        for tier in TIER_FRACTIONS:
            row = per_tier[tier]
            z = float(row.get("zscore", float("nan")))
            z_values.append(z)
            statuses.append(str(row.get("status", "MISSING")).upper())
        if any(math.isnan(z) for z in z_values):
            continue
        if all(status == "OUT_OF_RANGE" for status in statuses):
            stable_outliers.append(
                {
                    "key": key,
                    "target": _row_target(per_tier["normal"]),
                    "metric_type": per_tier["normal"]["metric_type"],
                    "band": per_tier["normal"].get("band"),
                    "normal_z": z_values[0],
                    "top10_z": z_values[1],
                    "top1_z": z_values[2],
                    "z_range": max(z_values) - min(z_values),
                }
            )
        if statuses[0] == "OUT_OF_RANGE" and statuses[1] != "OUT_OF_RANGE" and statuses[2] != "OUT_OF_RANGE":
            disappears_with_cleaning.append(
                {
                    "key": key,
                    "target": _row_target(per_tier["normal"]),
                    "metric_type": per_tier["normal"]["metric_type"],
                    "band": per_tier["normal"].get("band"),
                    "normal_z": z_values[0],
                    "top10_z": z_values[1],
                    "top1_z": z_values[2],
                    "z_range": max(z_values) - min(z_values),
                }
            )
        most_variable.append(
            {
                "key": key,
                "target": _row_target(per_tier["normal"]),
                "metric_type": per_tier["normal"]["metric_type"],
                "band": per_tier["normal"].get("band"),
                "normal_z": z_values[0],
                "top10_z": z_values[1],
                "top1_z": z_values[2],
                "z_range": max(z_values) - min(z_values),
            }
        )

    stable_outliers.sort(key=lambda item: (-max(abs(item["normal_z"]), abs(item["top10_z"]), abs(item["top1_z"])), item["key"]))
    disappears_with_cleaning.sort(key=lambda item: (-abs(item["normal_z"]), item["key"]))
    most_variable.sort(key=lambda item: (-item["z_range"], item["key"]))
    return {
        "stable_outliers": stable_outliers[:12],
        "disappears_with_cleaning": disappears_with_cleaning[:12],
        "most_variable": most_variable[:12],
    }


def _format_comparison_row(row: dict[str, Any]) -> str:
    band = str(row.get("band") or "").lower()
    metric = str(row.get("metric_type", "")).lower()
    if band and band != "-":
        metric = f"{metric} {band}"
    return (
        f"- `{row['target']}`: `{metric}` "
        f"`normal={row['normal_z']:+.2f}` `top10={row['top10_z']:+.2f}` `top1={row['top1_z']:+.2f}`"
    )


def _channel_list_text(channels: Sequence[str]) -> str:
    return ", ".join(str(ch) for ch in channels) if channels else "none"


def _metric_label(metric_type: str, band: str | None) -> str:
    metric = str(metric_type or "").lower()
    band_text = str(band or "").lower().strip()
    return f"{metric} {band_text}".strip()


def _comparison_summary_text(rows: Sequence[dict[str, Any]], *, fallback: str) -> str:
    if not rows:
        return fallback
    top = rows[0]
    return (
        f"`{top['target']}` { _metric_label(str(top.get('metric_type', '')), str(top.get('band') or '')) } "
        f"stays abnormal across tiers (`normal={top['normal_z']:+.2f}`, `top10={top['top10_z']:+.2f}`, `top1={top['top1_z']:+.2f}`)."
    )


def _scope_label(scope: str) -> str:
    return {"08-25": "08-25 only", "09-25": "09-25 only", "combined": "combined recordings"}.get(scope, scope)


def _build_bundle(scope: str, tier: str, cleaned_recordings: Sequence[dict[str, Any]]) -> dict[str, Any]:
    result = _run_analysis(cleaned_recordings, zscore_mode="age", subject_age=AGE_YEARS)
    bundle_dir = OUTPUT_ROOT / "analyses" / scope / tier
    bundle_dir.mkdir(parents=True, exist_ok=True)
    _write_json(bundle_dir / "result_age30.json", result)
    rows = result["derived"]["coherence"]["rows"]
    _write_csv(
        bundle_dir / "rows.csv",
        rows,
        [
            "metric_type",
            "band",
            "value",
            "zscore",
            "status",
            "norm_source",
            "location_label",
            "pair",
            "normal_range",
        ],
    )

    plots_dir = bundle_dir / "plots"
    theta_beta = _site_map(rows, "theta_beta_ratio", None)
    for band in NORM_BANDS:
        rel_map = _site_map(rows, "relative_power", band)
        abs_map = _site_map(rows, "absolute_power", band)
        totcoh_map = _site_map(rows, "total_coherence", band)
        _plot_site_topomap(
            rel_map,
            title=f"{scope} {tier}: {band} relative power",
            out_path=plots_dir / f"{band}_relative_power_headmap.png",
        )
        _plot_site_topomap(
            abs_map,
            title=f"{scope} {tier}: {band} absolute power",
            out_path=plots_dir / f"{band}_absolute_power_headmap.png",
        )
        _plot_site_topomap(
            totcoh_map,
            title=f"{scope} {tier}: {band} total coherence",
            out_path=plots_dir / f"{band}_total_coherence_headmap.png",
        )
    _plot_site_topomap(theta_beta, title=f"{scope} {tier}: theta/beta ratio", out_path=plots_dir / "theta_beta_ratio_headmap.png")
    smr_amp, smr_rel = _descriptive_band_maps(cleaned_recordings, band_name="smr", denominator_bands=("theta", "alpha", "smr", "beta"))
    _plot_site_topomap(
        smr_amp,
        title=f"{scope} {tier}: SMR amplitude (descriptive)",
        out_path=plots_dir / "smr_amplitude_headmap.png",
        cmap_name="YlOrRd",
        colorbar_label="Amplitude (uV)",
        center_zero=False,
    )
    _plot_site_topomap(
        smr_rel,
        title=f"{scope} {tier}: SMR share (descriptive)",
        out_path=plots_dir / "smr_relative_share_headmap.png",
        cmap_name="YlGnBu",
        colorbar_label="Share of theta+alpha+SMR+beta",
        center_zero=False,
    )
    hibeta_amp, hibeta_rel = _descriptive_band_maps(cleaned_recordings, band_name="hibeta", denominator_bands=("theta", "alpha", "beta", "hibeta"))
    _plot_site_topomap(
        hibeta_amp,
        title=f"{scope} {tier}: HiBeta amplitude (descriptive)",
        out_path=plots_dir / "hibeta_amplitude_headmap.png",
        cmap_name="OrRd",
        colorbar_label="Amplitude (uV)",
        center_zero=False,
    )
    _plot_site_topomap(
        hibeta_rel,
        title=f"{scope} {tier}: HiBeta share (descriptive)",
        out_path=plots_dir / "hibeta_relative_share_headmap.png",
        cmap_name="PuRd",
        colorbar_label="Share of theta+alpha+beta+HiBeta",
        center_zero=False,
    )
    for metric_type in PAIR_METRIC_ORDER:
        for band in PAIR_BANDS:
            pair_values = _pair_map(rows, metric_type, band)
            _plot_pair_heatmap(
                pair_values,
                title=f"{scope} {tier}: {band} {metric_type} pairs",
                out_path=plots_dir / f"{band}_{metric_type}_pairs.png",
            )
            _plot_pair_network(
                pair_values,
                title=f"{scope} {tier}: {band} {metric_type} network",
                out_path=plots_dir / f"{band}_{metric_type}_network.png",
            )
    return {"result": result, "bundle_dir": str(bundle_dir)}


def _build_montage(image_paths: Sequence[Path], labels: Sequence[str], out_path: Path) -> None:
    if not image_paths:
        return
    cols = len(image_paths)
    fig, axes = plt.subplots(1, cols, figsize=(cols * 4.2, 4.3), dpi=150)
    if cols == 1:
        axes = [axes]
    for ax, path, label in zip(axes, image_paths, labels):
        img = plt.imread(str(path))
        ax.imshow(img)
        ax.set_title(label, fontsize=9)
        ax.axis("off")
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)


def _create_montages() -> None:
    montage_dir = OUTPUT_ROOT / "montages"
    montage_dir.mkdir(parents=True, exist_ok=True)
    for scope in ("08-25", "09-25", "combined"):
        site_stems = ["theta_beta_ratio_headmap.png", "smr_amplitude_headmap.png", "smr_relative_share_headmap.png", "hibeta_amplitude_headmap.png", "hibeta_relative_share_headmap.png"]
        for band in NORM_BANDS:
            site_stems.extend(
                [
                    f"{band}_relative_power_headmap.png",
                    f"{band}_absolute_power_headmap.png",
                    f"{band}_total_coherence_headmap.png",
                ]
            )
        for stem in site_stems:
            paths = [OUTPUT_ROOT / "analyses" / scope / tier / "plots" / stem for tier in TIER_FRACTIONS]
            if all(path.exists() for path in paths):
                _build_montage(paths, [tier for tier in TIER_FRACTIONS], montage_dir / f"{scope}_{stem}")
        pair_stems: list[str] = []
        for metric_type in PAIR_METRIC_ORDER:
            for band in PAIR_BANDS:
                pair_stems.extend([f"{band}_{metric_type}_pairs.png", f"{band}_{metric_type}_network.png"])
        for stem in pair_stems:
            paths = [OUTPUT_ROOT / "analyses" / scope / tier / "plots" / stem for tier in TIER_FRACTIONS]
            if all(path.exists() for path in paths):
                _build_montage(paths, [tier for tier in TIER_FRACTIONS], montage_dir / f"{scope}_{stem}")


def _write_report(prepared_recordings: Sequence[dict[str, Any]], analyses: dict[str, dict[str, dict[str, Any]]]) -> Path:
    report_path = OUTPUT_ROOT / "report.md"
    lines: list[str] = []
    lines.append("# EO QEEG Cleaning-Tier Comparison")
    lines.append("")
    lines.append("This comparison uses the local **EO age-30** norms (`dvs_608_eo_cleaned_allpairs`) and focuses on how the results change when artifact rejection gets much harsher.")
    lines.append("")
    lines.append("## How The Tiers Were Built")
    lines.append("")
    lines.append("- `normal`: the earlier threshold-based pass that removed obvious artifact spans and spike-heavy windows.")
    lines.append("- `top10`: only the cleanest 10% of non-overlapping 10-second windows were kept.")
    lines.append("- `top1`: only the cleanest 1% of non-overlapping 10-second windows were kept.")
    lines.append("- All tiers used the same bad-channel decisions first, then notch `50 Hz`, band-pass `1-40 Hz`, average reference, and a window score that penalized spikes, derivative bursts, high amplitude drift, and high-frequency contamination.")
    lines.append("")
    lines.append("## Retained Data")
    lines.append("")
    lines.append("| Recording | Dropped Channels | Normal | Top10 | Top1 |")
    lines.append("| --- | --- | ---: | ---: | ---: |")
    for prepared in prepared_recordings:
        durations = {}
        for tier in TIER_FRACTIONS:
            keep_ranges = prepared["tier_keep_ranges"][tier]
            durations[tier] = sum(float(end) - float(start) for start, end in keep_ranges)
        dropped = ", ".join(prepared["all_dropped_channels"]) or "none"
        lines.append(
            f"| `{prepared['label']}` | `{dropped}` | `{durations['normal']:.0f}s` | `{durations['top10']:.0f}s` | `{durations['top1']:.0f}s` |"
        )
    combined_normal = sum(sum(float(end) - float(start) for start, end in prepared["tier_keep_ranges"]["normal"]) for prepared in prepared_recordings)
    combined_top10 = sum(sum(float(end) - float(start) for start, end in prepared["tier_keep_ranges"]["top10"]) for prepared in prepared_recordings)
    combined_top1 = sum(sum(float(end) - float(start) for start, end in prepared["tier_keep_ranges"]["top1"]) for prepared in prepared_recordings)
    lines.append(f"| `combined` | `inherits per-recording drops` | `{combined_normal:.0f}s` | `{combined_top10:.0f}s` | `{combined_top1:.0f}s` |")
    lines.append("")
    for prepared in prepared_recordings:
        lines.append(
            f"- `{prepared['label']}`: forced bad `{_channel_list_text(prepared['forced_bad_channels'])}`; "
            f"auto bad `{_channel_list_text(prepared['auto_bad_channels'])}`; "
            f"final dropped `{_channel_list_text(prepared['all_dropped_channels'])}`."
        )
    lines.append("- The `top1` tier is intentionally extreme. It is useful as a stress test for artifact sensitivity, but it is also data-starved, so swings there should be read as robustness checks rather than as the new truth.")
    lines.append("- Combined pair metrics now include both square pair matrices and head-network line plots so coherence pairs are visually separate from site power maps.")
    lines.append("")
    lines.append("## Interpretation Summary")
    lines.append("")
    combined_site_rows = {tier: analyses["combined"][tier]["result"]["derived"]["coherence"]["rows"] for tier in TIER_FRACTIONS}
    combined_site_comparison = _compare_tier_rows(combined_site_rows, metric_types=SITE_METRIC_TYPES)
    lines.append("- The most reproducible site-level abnormality after the current bad-channel exclusions is:")
    lines.append(f"- {_comparison_summary_text(combined_site_comparison['stable_outliers'], fallback='No site metric stayed out of range across all three tiers.')}")
    pair_rows_by_tier = {
        tier: analyses["combined"][tier]["result"]["derived"]["coherence"]["rows"] for tier in TIER_FRACTIONS
    }
    pair_comparison = _compare_tier_rows(pair_rows_by_tier, metric_types=PAIR_METRIC_TYPES)
    lines.append("- The strongest persistent pair-level abnormality is:")
    lines.append(f"- {_comparison_summary_text(pair_comparison['stable_outliers'], fallback='No pair metric stayed out of range across all three tiers.')}")
    lines.append("- Findings that survive in both recordings and across harsher cleaning tiers deserve the most weight; findings that only appear in one run or collapse immediately with stricter cleaning deserve much less.")
    lines.append("- Findings that survive into `top10` are the ones I would take seriously first. Findings that only flare in `top1` are better treated as stress-test curiosities because that tier is built from only about 10 seconds per recording.")
    lines.append("")
    lines.append("## SMR Note")
    lines.append("")
    lines.append("- There were no normative `SMR` z-score plots in the earlier output because the current EO coherence norm stack only defines `delta`, `theta`, `alpha`, and `beta` bands.")
    lines.append("- In this codebase, the offline coherence scorer uses `beta = 13-30 Hz`, so there is no stored norm mean/SD for a separate `SMR` band to compare against.")
    lines.append("- I added descriptive `SMR` head maps in this comparison bundle anyway. They show `12-15 Hz` activity distribution and relative share, but they are descriptive only, not normative z-scores.")
    lines.append("- The same limitation applies to `HiBeta`. I can compute descriptive `28-40 Hz` maps from your cleaned data, but I cannot honestly label them as norm-referenced with the current stored EO coherence norms.")
    lines.append("- By contrast, `delta`, `theta`, `alpha`, `beta`, `theta/beta ratio`, `total coherence`, and pairwise `coherence/phase/asymmetry` do have normative rows in this EO dataset, so those can be plotted as true z-score maps.")
    lines.append("")
    lines.append("## Plot Coverage")
    lines.append("")
    lines.append("- The updated bundle now includes norm-referenced site plots for `absolute power`, `relative power`, and `total coherence` in `delta`, `theta`, `alpha`, and `beta`, plus the `theta/beta ratio` map.")
    lines.append("- The updated combined bundle also includes pairwise `coherence`, `phase`, and `asymmetry` plots for `delta`, `theta`, `alpha`, and `beta`, each in both matrix and head-network form.")
    lines.append("- `SMR` and `HiBeta` are included only as descriptive add-ons, clearly separate from the normative plots.")
    lines.append("")

    for scope in ("08-25", "09-25", "combined"):
        lines.append(f"## {_scope_label(scope).title()} Site Metrics")
        lines.append("")
        rows_by_tier = {
            tier: analyses[scope][tier]["result"]["derived"]["coherence"]["rows"] for tier in TIER_FRACTIONS
        }
        comparison = _compare_tier_rows(rows_by_tier, metric_types=SITE_METRIC_TYPES)
        top_normal = _top_rows(rows_by_tier["normal"], metric_types=SITE_METRIC_TYPES, limit=8)
        lines.append("- Top findings in the normal pass:")
        lines.extend(_format_row(row) for row in top_normal)
        lines.append("- Findings that stay out of range in all three tiers:")
        if comparison["stable_outliers"]:
            lines.extend(_format_comparison_row(row) for row in comparison["stable_outliers"])
        else:
            lines.append("- None.")
        lines.append("- Findings that drop back toward normal once cleaning gets harsher:")
        if comparison["disappears_with_cleaning"]:
            lines.extend(_format_comparison_row(row) for row in comparison["disappears_with_cleaning"])
        else:
            lines.append("- None.")
        lines.append("- Most cleaning-sensitive site metrics:")
        lines.extend(_format_comparison_row(row) for row in comparison["most_variable"][:8])
        lines.append("")

    lines.append("## Combined Pair Metrics")
    lines.append("")
    lines.append("- Top pair findings in the normal combined pass:")
    lines.extend(_format_row(row) for row in _top_rows(pair_rows_by_tier["normal"], metric_types=PAIR_METRIC_TYPES, limit=10))
    lines.append("- Pair findings that stay out of range across all three tiers:")
    if pair_comparison["stable_outliers"]:
        lines.extend(_format_comparison_row(row) for row in pair_comparison["stable_outliers"])
    else:
        lines.append("- None.")
    lines.append("- Pair findings that disappear once the cleaning gets stricter:")
    if pair_comparison["disappears_with_cleaning"]:
        lines.extend(_format_comparison_row(row) for row in pair_comparison["disappears_with_cleaning"])
    else:
        lines.append("- None.")
    lines.append("- Most cleaning-sensitive pair metrics:")
    lines.extend(_format_comparison_row(row) for row in pair_comparison["most_variable"][:10])
    lines.append("")

    lines.append("## Practical Read")
    lines.append("")
    lines.append("- The earlier plot set only showed a few summary maps; it did not mean theta, beta, or non-alpha coherence norms were missing. Those are part of the updated output now.")
    lines.append("- The safest way to read this rerun is to ignore the removed channel entirely and look only at findings that remain stable without it.")
    lines.append("- On the pair-network plots, red lines mean positive z-scores and blue lines mean negative z-scores; faint grey lines are available pairs that stayed inside the near-normal band.")
    lines.append("- If a finding is large in `normal` but collapses in `top10` and `top1`, it is likely artifact-sensitive.")
    lines.append("- If a finding survives down to `top10`, it is more robust. If it also survives `top1`, it is strong but should still be interpreted carefully because only about 10 seconds per recording remain there.")
    lines.append("")
    lines.append("## Clinical-Style Summary")
    lines.append("")
    site_summary = _comparison_summary_text(
        combined_site_comparison["stable_outliers"],
        fallback="no site metric stayed consistently abnormal across all three cleaning tiers",
    )
    pair_summary = _comparison_summary_text(
        pair_comparison["stable_outliers"],
        fallback="no pair metric stayed consistently abnormal across all three cleaning tiers",
    )
    lines.append(f"After forcing `C3` out as a bad connection, the combined eyes-open rerun is best summarized by {site_summary}")
    lines.append("")
    lines.append(f"On the pair side, the most stable residual finding is {pair_summary} This rerun should be interpreted as the cleaner answer because the previously suspicious `C3` channel is no longer participating in any site or pair score.")
    lines.append("")
    lines.append("Technical confidence is moderate rather than high. `09-25` required exclusion of `FZ` and `T4` because of clear hardware failure, the acquisition was assembled from two separate runs rather than a simultaneous full-cap recording, and the harshest `top1` tier is useful mainly as a robustness stress test because it leaves only about 10 seconds per recording. These findings are therefore better treated as a structured screening impression than as a stand-alone clinical diagnosis.")
    lines.append("")
    lines.append("If this pattern matters clinically, the cleanest next step would be a repeat study with a standardized full-cap montage, simultaneous channel coverage, both EO and EC conditions, dedicated EOG/EMG channels for artifact labeling, and manual review by an experienced QEEG reader. In the current data, the take-home point should come only from the stable findings that survive after removing known bad channels.")
    lines.append("")

    report_path.write_text("\n".join(lines), encoding="utf-8")
    return report_path


def main() -> int:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    prepared_recordings = [_prepare_recording(spec) for spec in RECORDINGS]
    _write_json(OUTPUT_ROOT / "prepared_recordings" / "manifest.json", prepared_recordings)

    analyses: dict[str, dict[str, dict[str, Any]]] = {"08-25": {}, "09-25": {}, "combined": {}}
    prepared_by_label = {prepared["label"]: prepared for prepared in prepared_recordings}
    for tier in TIER_FRACTIONS:
        analyses["08-25"][tier] = _build_bundle("08-25", tier, [_tier_recording_summary(prepared_by_label["08-25"], tier)])
        analyses["09-25"][tier] = _build_bundle("09-25", tier, [_tier_recording_summary(prepared_by_label["09-25"], tier)])
        analyses["combined"][tier] = _build_bundle(
            "combined",
            tier,
            [
                _tier_recording_summary(prepared_by_label["08-25"], tier),
                _tier_recording_summary(prepared_by_label["09-25"], tier),
            ],
        )

    _create_montages()
    report_path = _write_report(prepared_recordings, analyses)

    manifest = {
        "output_root": str(OUTPUT_ROOT),
        "report_path": str(report_path),
        "prepared_recordings": [prepared["label"] for prepared in prepared_recordings],
        "tiers": list(TIER_FRACTIONS.keys()),
        "scopes": list(analyses.keys()),
    }
    _write_json(OUTPUT_ROOT / "manifest.json", manifest)
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
