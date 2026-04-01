from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path
from typing import Any, Dict, Iterable

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

NORM_FILES: Dict[str, str] = {
    "ds003775": "coherence_norms_ds003775.json",
    "dvs_608": "coherence_norms_dvs_608.json",
    "dvs_608_cleaned": "coherence_norms_dvs_608_cleanedauto.json",
    "dvs_608_eo_cleaned": "coherence_norms_dvs_608_eo_pre_cleanedauto.json",
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
    "OZ": (0.00, -0.90),
    "O2": (0.34, -0.86),
}
LEGACY_LOCATION_MAP = {
    "T3": "T7",
    "T4": "T8",
    "T5": "P7",
    "T6": "P8",
}
DISPLAY_LEGACY_MAP = {
    "T7": "T3",
    "T8": "T4",
    "P7": "T5",
    "P8": "T6",
}

BAND_METRIC_PREFIX = {
    "coherence": "COH",
    "phase": "PHASE",
    "asymmetry": "ASYM",
    "total_coherence": "TOTCOH",
    "band_amplitude": "BP",
    "absolute_power": "AP",
    "relative_power": "RP",
}
SINGLE_METRIC_PREFIX = {
    "theta_beta_ratio": "RATIO_THETA_BETA",
    "peak_alpha_frequency": "PAF",
    "total_amplitude": "TOTAMP",
}
BANDS = ["delta", "theta", "alpha", "beta"]
BAND_METRIC_TYPES = list(BAND_METRIC_PREFIX.keys())
SINGLE_METRIC_TYPES = list(SINGLE_METRIC_PREFIX.keys())
PAIR_METRIC_TYPES = {"coherence", "phase", "asymmetry"}


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if math.isfinite(out) else None


def _canonical_location(loc: str) -> str:
    key = str(loc).strip().upper()
    return LEGACY_LOCATION_MAP.get(key, key)


def _display_location(loc: str) -> str:
    key = _canonical_location(loc)
    return DISPLAY_LEGACY_MAP.get(key, key)


def _load_norms(norms_dataset: str, norms_path: str | None) -> Dict[str, Any]:
    if norms_path:
        p = Path(norms_path)
    else:
        key = str(norms_dataset).strip().lower()
        if key not in NORM_FILES:
            supported = ", ".join(sorted(NORM_FILES.keys()))
            raise RuntimeError(f"Unsupported norms dataset '{key}'. Supported: {supported}")
        p = Path(__file__).resolve().parents[1] / "clinicalq_backend" / "data" / NORM_FILES[key]
    if not p.exists():
        raise RuntimeError(f"Norms file does not exist: {p}")
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)


def _resolve_age_bin_label(age_bins: Any, subject_age: float | None) -> str | None:
    if subject_age is None or not isinstance(age_bins, list):
        return None
    for item in age_bins:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label", "")).strip()
        if not label:
            continue
        min_age = _to_float(item.get("min_age"))
        max_age = _to_float(item.get("max_age"))
        if min_age is not None and subject_age < min_age:
            continue
        if max_age is not None and subject_age > max_age:
            continue
        return label
    return None


def _resolve_norm(norms: Dict[str, Any], metric_key: str, zscore_mode: str, age_bin: str | None) -> tuple[Dict[str, Any] | None, str]:
    if zscore_mode == "age" and age_bin:
        by_age = norms.get("metrics_by_age", {})
        if isinstance(by_age, dict):
            age_metrics = by_age.get(age_bin)
            if isinstance(age_metrics, dict):
                norm = age_metrics.get(metric_key)
                if isinstance(norm, dict):
                    return norm, f"age:{age_bin}"

    metrics = norms.get("metrics", {})
    if isinstance(metrics, dict):
        norm = metrics.get(metric_key)
        if isinstance(norm, dict):
            return norm, "global"
    return None, "missing"


def _score_value(value: float, norm: Dict[str, Any] | None) -> tuple[str, float, str]:
    if norm is None:
        return "MISSING", float("nan"), "N/A"
    mean = _to_float(norm.get("mean"))
    std = _to_float(norm.get("std"))
    low = _to_float(norm.get("cutoff_low"))
    high = _to_float(norm.get("cutoff_high"))
    if mean is None or std is None or low is None or high is None:
        return "MISSING", float("nan"), "N/A"
    z = float("nan") if std <= 0.0 else (value - mean) / std
    status = "IN_RANGE" if low <= value <= high else "OUT_OF_RANGE"
    return status, float(z), f"{low:.4f}-{high:.4f}"


def _load_metrics_from_csv(path: Path) -> Dict[str, float]:
    with path.open("r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise RuntimeError(f"CSV has no header: {path}")
        field_map = {x.strip().lower(): x for x in reader.fieldnames}
        if "metric_key" not in field_map or "value" not in field_map:
            raise RuntimeError("CSV must include header columns metric_key,value")
        metric_col = field_map["metric_key"]
        value_col = field_map["value"]
        out: Dict[str, float] = {}
        for row in reader:
            key = str(row.get(metric_col, "")).strip()
            val = _to_float(row.get(value_col))
            if not key or val is None:
                continue
            out[key] = float(val)
        return out


def _load_metrics_from_json(path: Path) -> Dict[str, float]:
    with path.open("r", encoding="utf-8-sig") as f:
        payload = json.load(f)

    if isinstance(payload, dict) and isinstance(payload.get("metrics"), dict):
        payload = payload.get("metrics")
    if not isinstance(payload, dict):
        raise RuntimeError("JSON input must be an object or {\"metrics\": {...}}")

    out: Dict[str, float] = {}
    for key, value in payload.items():
        val = _to_float(value)
        if val is None:
            continue
        out[str(key)] = float(val)
    return out


def _load_metrics_from_result_json(path: Path) -> Dict[str, float]:
    with path.open("r", encoding="utf-8-sig") as f:
        payload = json.load(f)
    rows = payload.get("derived", {}).get("coherence", {}).get("rows", [])
    if not isinstance(rows, list):
        raise RuntimeError("Result JSON does not contain derived.coherence.rows")

    out: Dict[str, float] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        keys = row.get("norm_keys")
        value = _to_float(row.get("value"))
        if not isinstance(keys, list) or not keys:
            continue
        key = str(keys[0]).strip()
        if not key or value is None:
            continue
        out[key] = float(value)
    return out


def _parse_metric_key(metric_key: str) -> tuple[str, str | None, str | None]:
    parts = metric_key.split(":")
    if len(parts) == 3:
        return parts[0], parts[1], parts[2]
    if len(parts) == 2:
        return parts[0], parts[1], None
    return metric_key, None, None


def _should_use_for_plot(metric_key: str, metric_type: str, band: str | None) -> bool:
    prefix, _, key_band = _parse_metric_key(metric_key)
    prefix = prefix.upper()
    metric_type = metric_type.lower()
    if metric_type in BAND_METRIC_PREFIX:
        wanted_prefix = BAND_METRIC_PREFIX[metric_type]
        if prefix != wanted_prefix:
            return False
        if band is None:
            return False
        return str(key_band or "").lower() == str(band).lower()
    if metric_type in SINGLE_METRIC_PREFIX:
        return prefix == SINGLE_METRIC_PREFIX[metric_type]
    return False


def _plot_topomap(rows: Iterable[Dict[str, Any]], metric_type: str, band: str | None, out_path: Path) -> None:
    labels, zs = _collect_site_zscores(rows, metric_type, band)
    if len(labels) < 3:
        raise RuntimeError(
            f"Need at least 3 site-level z-scores for heatmap; found {len(labels)} for metric_type={metric_type}, band={band}"
        )
    point_xy = {loc: HEAD_COORDS_1020[loc] for loc in labels}
    xs = np.array([point_xy[loc][0] for loc in labels], dtype=float)
    ys = np.array([point_xy[loc][1] for loc in labels], dtype=float)

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

    vmax = max(2.5, float(np.nanmax(np.abs(zs))) + 0.25)
    vmin = -vmax

    fig, ax = plt.subplots(figsize=(6.2, 6.2), dpi=140)
    cmap = plt.get_cmap("RdBu_r")
    im = ax.contourf(X, Y, Z, levels=40, cmap=cmap, vmin=vmin, vmax=vmax)

    head = plt.Circle((0.0, 0.0), 1.0, fill=False, color="black", lw=2.0)
    ax.add_patch(head)
    ax.plot([-0.12, 0.0, 0.12], [1.00, 1.15, 1.00], color="black", lw=2.0)  # nose
    ax.plot([-1.0, -1.08, -1.0], [0.10, 0.00, -0.10], color="black", lw=2.0)  # left ear
    ax.plot([1.0, 1.08, 1.0], [0.10, 0.00, -0.10], color="black", lw=2.0)  # right ear

    ax.scatter(xs, ys, s=40, c="black", edgecolors="white", linewidths=0.8, zorder=5)
    for loc in labels:
        x, y = point_xy[loc]
        ax.text(x, y + 0.045, _display_location(loc), ha="center", va="bottom", fontsize=8, color="black")

    title = f"Z-score Topomap: {metric_type}"
    if band:
        title += f" ({band})"
    ax.set_title(title, fontsize=11)
    ax.set_xlim(-1.15, 1.15)
    ax.set_ylim(-1.15, 1.20)
    ax.set_aspect("equal", "box")
    ax.axis("off")
    cb = fig.colorbar(im, ax=ax, fraction=0.045, pad=0.04)
    cb.set_label("Z-score")
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)


def _collect_site_zscores(rows: Iterable[Dict[str, Any]], metric_type: str, band: str | None) -> tuple[list[str], np.ndarray]:
    point_vals: Dict[str, float] = {}
    metric_type = str(metric_type).lower()

    if metric_type == "total_coherence":
        # Prefer explicit TOTCOH:*:band rows when present.
        for row in rows:
            key = str(row.get("metric_key", ""))
            if not _should_use_for_plot(key, metric_type, band):
                continue
            _, loc, _ = _parse_metric_key(key)
            if loc is None:
                continue
            loc_u = _canonical_location(loc)
            if loc_u not in HEAD_COORDS_1020:
                continue
            z = _to_float(row.get("zscore"))
            if z is None:
                continue
            point_vals[loc_u] = z

        # Backward-compatible fallback: derive node totals from pairwise coherence z-scores.
        if not point_vals:
            by_node: Dict[str, list[float]] = {}
            for row in rows:
                key = str(row.get("metric_key", ""))
                if not _should_use_for_plot(key, "coherence", band):
                    continue
                _, loc, _ = _parse_metric_key(key)
                if not loc or "-" not in loc:
                    continue
                z = _to_float(row.get("zscore"))
                if z is None:
                    continue
                left, right = [x.strip().upper() for x in loc.split("-", 1)]
                if left in HEAD_COORDS_1020:
                    by_node.setdefault(left, []).append(float(z))
                if right in HEAD_COORDS_1020:
                    by_node.setdefault(right, []).append(float(z))
            for node, vals in by_node.items():
                if vals:
                    point_vals[node] = float(np.mean(vals))

        labels = sorted(point_vals.keys())
        zs = np.asarray([point_vals[label] for label in labels], dtype=float)
        return labels, zs

    for row in rows:
        key = str(row.get("metric_key", ""))
        if not _should_use_for_plot(key, metric_type, band):
            continue
        _, loc, _ = _parse_metric_key(key)
        if loc is None:
            continue
        loc_u = _canonical_location(loc)
        if loc_u not in HEAD_COORDS_1020:
            continue
        z = _to_float(row.get("zscore"))
        if z is None:
            continue
        point_vals[loc_u] = z
    labels = sorted(point_vals.keys())
    zs = np.asarray([point_vals[label] for label in labels], dtype=float)
    return labels, zs


def _plot_site_cubes(rows: Iterable[Dict[str, Any]], metric_type: str, band: str | None, out_path: Path) -> None:
    labels, zs = _collect_site_zscores(rows, metric_type, band)
    if len(labels) < 3:
        raise RuntimeError(
            f"Need at least 3 site-level z-scores for cube plot; found {len(labels)} for metric_type={metric_type}, band={band}"
        )

    xs = np.asarray([HEAD_COORDS_1020[label][0] for label in labels], dtype=float)
    ys = np.asarray([HEAD_COORDS_1020[label][1] for label in labels], dtype=float)
    vmax = max(2.5, float(np.nanmax(np.abs(zs))) + 0.25)
    vmin = -vmax
    cmap = plt.get_cmap("RdBu_r")
    norm = matplotlib.colors.Normalize(vmin=vmin, vmax=vmax)

    fig, ax = plt.subplots(figsize=(6.2, 6.2), dpi=140)
    head = plt.Circle((0.0, 0.0), 1.0, fill=False, color="black", lw=2.0)
    ax.add_patch(head)
    ax.plot([-0.12, 0.0, 0.12], [1.00, 1.15, 1.00], color="black", lw=2.0)
    ax.plot([-1.0, -1.08, -1.0], [0.10, 0.00, -0.10], color="black", lw=2.0)
    ax.plot([1.0, 1.08, 1.0], [0.10, 0.00, -0.10], color="black", lw=2.0)

    sc = ax.scatter(
        xs,
        ys,
        c=zs,
        cmap=cmap,
        norm=norm,
        s=420,
        marker="s",
        edgecolors="black",
        linewidths=1.2,
        zorder=4,
    )

    for label, x, y, z in zip(labels, xs, ys, zs):
        ax.text(x, y + 0.060, _display_location(label), ha="center", va="bottom", fontsize=8, color="black", zorder=6)
        ax.text(x, y - 0.002, f"{z:+.1f}", ha="center", va="center", fontsize=7, color="black", zorder=6)

    title = f"Z-score Cubes: {metric_type}"
    if band:
        title += f" ({band})"
    ax.set_title(title, fontsize=11)
    ax.set_xlim(-1.15, 1.15)
    ax.set_ylim(-1.15, 1.20)
    ax.set_aspect("equal", "box")
    ax.axis("off")
    cb = fig.colorbar(sc, ax=ax, fraction=0.045, pad=0.04)
    cb.set_label("Z-score")
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)


def _plot_pair_connectivity(
    rows: Iterable[Dict[str, Any]],
    metric_type: str,
    band: str | None,
    out_path: Path,
    *,
    z_threshold: float,
    show_all: bool,
    positive_only: bool,
) -> None:
    edges: list[tuple[str, str, float]] = []
    nodes: set[str] = set()
    for row in rows:
        key = str(row.get("metric_key", ""))
        if not _should_use_for_plot(key, metric_type, band):
            continue
        _, loc, _ = _parse_metric_key(key)
        if not loc or "-" not in loc:
            continue
        z = _to_float(row.get("zscore"))
        if z is None:
            continue
        left, right = [_canonical_location(x) for x in loc.split("-", 1)]
        if left not in HEAD_COORDS_1020 or right not in HEAD_COORDS_1020:
            continue
        if not show_all:
            if positive_only:
                if z < z_threshold:
                    continue
            elif abs(z) < z_threshold:
                continue
        edges.append((left, right, float(z)))
        nodes.add(left)
        nodes.add(right)

    if len(edges) == 0:
        raise RuntimeError(
            f"No pair edges available for connectivity plot (metric_type={metric_type}, band={band}, "
            f"z_threshold={z_threshold}, show_all={show_all}, positive_only={positive_only})"
        )

    if not nodes:
        raise RuntimeError("No valid nodes found for connectivity plot.")

    zs = np.asarray([edge[2] for edge in edges], dtype=float)
    vmax = max(2.5, float(np.nanmax(np.abs(zs))) + 0.25)
    vmin = -vmax
    cmap = plt.get_cmap("RdBu_r")
    norm = matplotlib.colors.Normalize(vmin=vmin, vmax=vmax)

    fig, ax = plt.subplots(figsize=(6.2, 6.2), dpi=140)
    head = plt.Circle((0.0, 0.0), 1.0, fill=False, color="black", lw=2.0)
    ax.add_patch(head)
    ax.plot([-0.12, 0.0, 0.12], [1.00, 1.15, 1.00], color="black", lw=2.0)
    ax.plot([-1.0, -1.08, -1.0], [0.10, 0.00, -0.10], color="black", lw=2.0)
    ax.plot([1.0, 1.08, 1.0], [0.10, 0.00, -0.10], color="black", lw=2.0)

    for left, right, z in edges:
        x1, y1 = HEAD_COORDS_1020[left]
        x2, y2 = HEAD_COORDS_1020[right]
        color = cmap(norm(z))
        width = 1.0 + min(4.0, abs(z) * 0.6)
        alpha = 0.35 + min(0.60, abs(z) / max(vmax, 1e-6))
        ax.plot([x1, x2], [y1, y2], color=color, lw=width, alpha=alpha, solid_capstyle="round", zorder=2)

    for node in sorted(nodes):
        x, y = HEAD_COORDS_1020[node]
        ax.scatter([x], [y], s=52, c="black", edgecolors="white", linewidths=0.8, zorder=5)
        ax.text(x, y + 0.045, _display_location(node), ha="center", va="bottom", fontsize=8, color="black")

    title = f"Z-score Connectivity: {metric_type}"
    if band:
        title += f" ({band})"
    if not show_all:
        if positive_only:
            title += f", z>={z_threshold:.1f}"
        else:
            title += f", |z|>={z_threshold:.1f}"
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


def _plot_metric_map(
    rows: Iterable[Dict[str, Any]],
    metric_type: str,
    band: str | None,
    out_path: Path,
    *,
    site_style: str,
    pair_line_z_threshold: float,
    pair_line_show_all: bool,
    pair_positive_only: bool,
) -> None:
    if metric_type in PAIR_METRIC_TYPES:
        _plot_pair_connectivity(
            rows,
            metric_type,
            band,
            out_path,
            z_threshold=pair_line_z_threshold,
            show_all=pair_line_show_all,
            positive_only=pair_positive_only,
        )
        return
    if site_style == "topomap":
        _plot_topomap(rows, metric_type, band, out_path)
    else:
        _plot_site_cubes(rows, metric_type, band, out_path)


def _all_plot_specs() -> list[tuple[str, str | None]]:
    specs: list[tuple[str, str | None]] = []
    for metric_type in BAND_METRIC_TYPES:
        for band in BANDS:
            specs.append((metric_type, band))
    for metric_type in SINGLE_METRIC_TYPES:
        specs.append((metric_type, None))
    return specs


def _build_montage(image_paths: list[Path], labels: list[str], out_path: Path) -> None:
    if not image_paths:
        return
    cols = 4
    rows = int(math.ceil(len(image_paths) / float(cols)))
    fig, axes = plt.subplots(rows, cols, figsize=(cols * 4.0, rows * 4.0), dpi=140)
    if rows == 1 and cols == 1:
        axes_list = [axes]
    else:
        axes_list = np.asarray(axes).reshape(-1).tolist()

    for idx, ax in enumerate(axes_list):
        if idx >= len(image_paths):
            ax.axis("off")
            continue
        img = plt.imread(str(image_paths[idx]))
        ax.imshow(img)
        ax.set_title(labels[idx], fontsize=9)
        ax.axis("off")

    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)


def main() -> int:
    parser = argparse.ArgumentParser(description="Score metric values vs norms and optionally plot a 10-20 z-score topomap.")
    parser.add_argument("--norms-dataset", type=str, default="dvs_608_cleaned", help="Norm dataset key")
    parser.add_argument("--norms-path", type=str, default=None, help="Direct path to norms JSON")
    parser.add_argument("--zscore-mode", type=str, default="global", choices=["global", "age"], help="Use global or age-bin norms")
    parser.add_argument("--subject-age", type=float, default=None, help="Age used when --zscore-mode age")
    parser.add_argument("--input-csv", type=Path, default=None, help="CSV with metric_key,value")
    parser.add_argument("--input-json", type=Path, default=None, help="JSON object of metric values")
    parser.add_argument("--result-json", type=Path, default=None, help="Existing session result JSON; reads derived values")
    parser.add_argument("--output-json", type=Path, required=True, help="Where to write scored rows")
    parser.add_argument("--plot-output", type=Path, default=None, help="Where to write topomap PNG")
    parser.add_argument(
        "--plot-metric-type",
        type=str,
        default="absolute_power",
        choices=[
            "coherence",
            "phase",
            "asymmetry",
            "total_coherence",
            "band_amplitude",
            "absolute_power",
            "relative_power",
            "theta_beta_ratio",
            "peak_alpha_frequency",
            "total_amplitude",
        ],
        help="Metric type for topomap",
    )
    parser.add_argument(
        "--plot-band",
        type=str,
        default="alpha",
        choices=["delta", "theta", "alpha", "beta"],
        help="Band for banded metric types",
    )
    parser.add_argument(
        "--site-style",
        type=str,
        default="topomap",
        choices=["cubes", "topomap"],
        help="Rendering style for non-pair metrics (default: topomap)",
    )
    parser.add_argument(
        "--pair-line-z-threshold",
        type=float,
        default=2.0,
        help="For pair metrics (coherence/phase/asymmetry), draw lines at/above this |z| threshold unless --pair-line-show-all",
    )
    parser.add_argument(
        "--pair-line-show-all",
        action="store_true",
        help="For pair metrics, draw all pair lines regardless of z threshold",
    )
    parser.add_argument(
        "--pair-positive-only",
        action="store_true",
        help="For pair metrics with thresholding, only draw positive z lines (e.g., hyper-coherence)",
    )
    parser.add_argument("--plot-all-dir", type=Path, default=None, help="If set, writes all metric-family topomaps to this directory")
    parser.add_argument("--plot-all-montage", type=Path, default=None, help="Optional path for a combined montage PNG")
    args = parser.parse_args()

    sources = [args.input_csv is not None, args.input_json is not None, args.result_json is not None]
    if sum(1 for x in sources if x) != 1:
        raise RuntimeError("Provide exactly one input source: --input-csv OR --input-json OR --result-json")

    norms = _load_norms(args.norms_dataset, args.norms_path)
    zscore_mode = str(args.zscore_mode).strip().lower()
    age = _to_float(args.subject_age)
    age_bin = _resolve_age_bin_label(norms.get("age_bins"), age) if zscore_mode == "age" else None

    if args.input_csv is not None:
        values = _load_metrics_from_csv(args.input_csv)
    elif args.input_json is not None:
        values = _load_metrics_from_json(args.input_json)
    else:
        values = _load_metrics_from_result_json(args.result_json)

    scored_rows: list[Dict[str, Any]] = []
    for metric_key in sorted(values.keys()):
        value = float(values[metric_key])
        norm, source = _resolve_norm(norms, metric_key, zscore_mode=zscore_mode, age_bin=age_bin)
        status, zscore, normal_range = _score_value(value, norm)
        scored_rows.append(
            {
                "metric_key": metric_key,
                "value": value,
                "zscore": zscore,
                "status": status,
                "normal_range": normal_range,
                "norm_source": source,
            }
        )

    out_payload = {
        "norms_dataset": norms.get("dataset", args.norms_dataset),
        "zscore_mode": zscore_mode,
        "subject_age": age,
        "age_bin": age_bin,
        "n_input_metrics": len(values),
        "n_scored": len(scored_rows),
        "rows": scored_rows,
    }
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    with args.output_json.open("w", encoding="utf-8") as f:
        json.dump(out_payload, f, indent=2)
    print(f"Wrote {args.output_json.resolve()} (n_scored={len(scored_rows)})", flush=True)

    if args.plot_output is not None:
        band = args.plot_band if args.plot_metric_type in BAND_METRIC_PREFIX else None
        _plot_metric_map(
            scored_rows,
            args.plot_metric_type,
            band,
            args.plot_output,
            site_style=str(args.site_style),
            pair_line_z_threshold=float(args.pair_line_z_threshold),
            pair_line_show_all=bool(args.pair_line_show_all),
            pair_positive_only=bool(args.pair_positive_only),
        )
        print(f"Wrote {args.plot_output.resolve()}", flush=True)

    if args.plot_all_dir is not None:
        args.plot_all_dir.mkdir(parents=True, exist_ok=True)
        generated: list[Dict[str, Any]] = []
        skipped: list[Dict[str, Any]] = []
        montage_paths: list[Path] = []
        montage_labels: list[str] = []
        for metric_type, band in _all_plot_specs():
            suffix = f"{metric_type}_{band}" if band else metric_type
            out_path = args.plot_all_dir / f"topomap_{suffix}.png"
            try:
                _plot_metric_map(
                    scored_rows,
                    metric_type,
                    band,
                    out_path,
                    site_style=str(args.site_style),
                    pair_line_z_threshold=float(args.pair_line_z_threshold),
                    pair_line_show_all=bool(args.pair_line_show_all),
                    pair_positive_only=bool(args.pair_positive_only),
                )
                generated.append({"metric_type": metric_type, "band": band, "path": str(out_path.resolve())})
                montage_paths.append(out_path)
                montage_labels.append(suffix)
            except Exception as exc:
                skipped.append({"metric_type": metric_type, "band": band, "reason": str(exc)})

        manifest_path = args.plot_all_dir / "topomap_manifest.json"
        with manifest_path.open("w", encoding="utf-8") as f:
            json.dump({"generated": generated, "skipped": skipped}, f, indent=2)
        print(f"Wrote {manifest_path.resolve()} (generated={len(generated)} skipped={len(skipped)})", flush=True)

        montage_path = args.plot_all_montage
        if montage_path is None and montage_paths:
            montage_path = args.plot_all_dir / "topomap_montage.png"
        if montage_path is not None and montage_paths:
            _build_montage(montage_paths, montage_labels, montage_path)
            print(f"Wrote {montage_path.resolve()}", flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
