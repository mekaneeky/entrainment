from __future__ import annotations

import csv
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List

DEFAULT_BRAINBAY_DIR = Path(r"C:\Users\HP\Documents\NF\session_logs")

KNOWN_BRAINBAY_HEADERS: Dict[str, list[str]] = {
    "reward_smr_inhibit_theta": ["smr_amp", "theta_amp", "smr_pass", "theta_pass", "feedback"],
    "reward_2inhibit_1channel": ["reward_amp", "slow_amp", "fast_amp", "reward_pass", "slow_pass", "fast_pass", "feedback"],
    "fpo2_reward_2inhibit_1channel": ["reward_amp", "slow_amp", "fast_amp", "reward_pass", "slow_pass", "fast_pass", "feedback"],
    "alpha_theta_inhibit_delta_hibeta": [
        "alpha_amp",
        "theta_amp",
        "delta_amp",
        "hibeta_amp",
        "alpha_pass",
        "theta_pass",
        "delta_pass",
        "hibeta_pass",
        "feedback",
    ],
    "o1_theta_beta_ratio_downtrain": ["theta", "beta", "theta_beta", "ratio_pass", "feedback"],
    "f3f4_theta_alpha_balanced": [
        "f3_theta",
        "f3_alpha",
        "f4_theta",
        "f4_alpha",
        "f3_theta_alpha",
        "f4_theta_alpha",
        "total_asym_pct",
        "f3_ratio_pass",
        "f4_ratio_pass",
        "closeness_pass",
        "feedback",
    ],
    "f3f4_band_asymmetry_reduce": [
        "f3_theta",
        "f4_theta",
        "f3_alpha",
        "f4_alpha",
        "f3_beta",
        "f4_beta",
        "theta_asym_pct",
        "alpha_asym_pct",
        "beta_asym_pct",
        "theta_pass",
        "alpha_pass",
        "beta_pass",
        "feedback",
    ],
    "f3f4_alpha_downtrain_ch3_ch4": [
        "f3_alpha",
        "f4_alpha",
        "alpha_diff_pct",
        "f3_alpha_below",
        "f4_alpha_below",
        "alpha_diff_pass",
        "feedback",
        "alpha_high_tone",
    ],
    "fz_hibeta_beta_ratio": ["beta", "hibeta", "hibeta_beta", "ratio_pass", "feedback"],
    "fehmi_5site_summed_alpha_synchrony": ["summed_raw", "summed_alpha", "alpha_pass", "feedback"],
}


def _finite(value: Any) -> float | None:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if math.isfinite(out) else None


def _mean(values: Iterable[float]) -> float | None:
    items = [float(v) for v in values if math.isfinite(float(v))]
    if not items:
        return None
    return float(sum(items) / len(items))


def _iso_from_path(path: Path) -> str:
    stat = path.stat()
    return datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()


def _clean_stem(path: Path) -> str:
    stem = path.stem.lower()
    stem = re.sub(r"[_-]?\d{4}[_-]?\d{2}[_-]?\d{2}.*$", "", stem)
    stem = re.sub(r"[_-]?(auto|manual|recording)$", "", stem)
    stem = stem.removesuffix("_auto").removesuffix("_manual").removesuffix("_recording")
    return stem


def _known_header_for(path: Path, column_count: int) -> list[str] | None:
    stem = _clean_stem(path)
    for key, labels in KNOWN_BRAINBAY_HEADERS.items():
        if stem.startswith(key) and len(labels) == column_count:
            return labels
    return None


def _looks_numeric_row(row: list[str]) -> bool:
    values = [cell.strip() for cell in row if cell.strip()]
    return bool(values) and all(_finite(cell) is not None for cell in values)


def _read_csv_rows(path: Path) -> tuple[list[str], list[list[float]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        sample = f.read(4096)
        f.seek(0)
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t") if sample.strip() else csv.excel
        rows = [row for row in csv.reader(f, dialect) if any(cell.strip() for cell in row)]
    if not rows:
        return [], []

    first = rows[0]
    if _looks_numeric_row(first):
        header = _known_header_for(path, len(first)) or [f"col_{idx + 1}" for idx in range(len(first))]
        data_rows = rows
    else:
        header = [cell.strip() or f"col_{idx + 1}" for idx, cell in enumerate(first)]
        data_rows = rows[1:]

    parsed: list[list[float]] = []
    for row in data_rows:
        values = [_finite(cell) for cell in row[: len(header)]]
        if any(value is None for value in values):
            continue
        parsed.append([float(value) for value in values if value is not None])
    return header, parsed


def _metric_key(*parts: str) -> str:
    return ":".join(str(part).strip().replace(":", "_") for part in parts if str(part).strip())


def _summarize_brainbay_csv(path: Path) -> Dict[str, Any]:
    header, rows = _read_csv_rows(path)
    metrics: dict[str, dict[str, Any]] = {}
    if header and rows:
        columns = list(zip(*rows))
        for label, values in zip(header, columns):
            mean_value = _mean(values)
            if mean_value is None:
                continue
            last = values[-1] if values else mean_value
            key = _metric_key("brainbay", _clean_stem(path), label, "mean")
            metrics[key] = {
                "label": f"{path.stem} {label} mean",
                "value": mean_value,
                "source": "brainbay",
                "unit": "pct" if label.endswith("_pass") or label == "feedback" else "uV/ratio",
            }
            metrics[_metric_key("brainbay", _clean_stem(path), label, "last")] = {
                "label": f"{path.stem} {label} last",
                "value": float(last),
                "source": "brainbay",
                "unit": "pct" if label.endswith("_pass") or label == "feedback" else "uV/ratio",
            }

    return {
        "source": "brainbay",
        "path": str(path),
        "date": _iso_from_path(path),
        "title": path.stem,
        "metrics": metrics,
        "row_count": len(rows),
    }


def _flatten_baseline(path: Path, data: Dict[str, Any]) -> Dict[str, Any]:
    metrics: dict[str, dict[str, Any]] = {}
    for row in data.get("locations", []) or []:
        loc = str(row.get("location") or "")
        for band, value in (row.get("amplitudes") or {}).items():
            val = _finite(value)
            if val is not None:
                metrics[_metric_key("baseline", loc, "absolute", band)] = {
                    "label": f"{loc} {band} absolute amplitude",
                    "value": val,
                    "source": "baseline",
                    "unit": "uV",
                }
        for band, value in (row.get("relative_percent") or {}).items():
            val = _finite(value)
            if val is not None:
                metrics[_metric_key("baseline", loc, "relative", band)] = {
                    "label": f"{loc} {band} relative amplitude",
                    "value": val,
                    "source": "baseline",
                    "unit": "%",
                }
        for band, value in (row.get("absolute_power") or {}).items():
            val = _finite(value)
            if val is not None:
                metrics[_metric_key("baseline", loc, "absolute_power", band)] = {
                    "label": f"{loc} {band} absolute power",
                    "value": val,
                    "source": "baseline_qeeg",
                    "unit": "power",
                }
        for band, value in (row.get("relative_power") or {}).items():
            val = _finite(value)
            if val is not None:
                metrics[_metric_key("baseline", loc, "relative_power", band)] = {
                    "label": f"{loc} {band} relative power",
                    "value": val,
                    "source": "baseline_qeeg",
                    "unit": "fraction",
                }
        for score in row.get("norm_scores") or []:
            metric_type = str(score.get("metric_type") or "")
            band = str(score.get("band") or "")
            val = _finite(score.get("value"))
            if not metric_type or not band or val is None:
                continue
            metrics[_metric_key("baseline_norm", loc, metric_type, band)] = {
                "label": f"{loc} {band} {metric_type.replace('_', ' ')} norm",
                "value": val,
                "source": "baseline_norm",
                "unit": "",
                "status": score.get("status"),
                "normal_range": score.get("normal_range"),
                "zscore": _finite(score.get("zscore")),
            }
        dom = _finite(row.get("dominant_frequency_hz"))
        if dom is not None:
            metrics[_metric_key("baseline", loc, "dominant_frequency")] = {
                "label": f"{loc} dominant frequency",
                "value": dom,
                "source": "baseline",
                "unit": "Hz",
            }
        for ratio, value in (row.get("ratios") or {}).items():
            val = _finite(value)
            if val is not None:
                metrics[_metric_key("baseline", loc, ratio)] = {
                    "label": f"{loc} {ratio.replace('_', '/')} ratio",
                    "value": val,
                    "source": "baseline",
                    "unit": "ratio",
                }
    return {
        "source": "baseline",
        "path": str(path),
        "date": _iso_from_path(path),
        "title": path.stem,
        "metrics": metrics,
    }


def _flatten_nf_training(path: Path, data: Dict[str, Any]) -> Dict[str, Any]:
    metadata = data.get("metadata") or {}
    protocol = _clean_stem(Path(str(metadata.get("protocol_id") or "nf_training")))
    headers = list(metadata.get("headers") or KNOWN_BRAINBAY_HEADERS.get(protocol) or [])
    windows = [window for window in data.get("windows", []) or [] if isinstance(window, dict)]
    metrics: dict[str, dict[str, Any]] = {}
    if not headers or not windows:
        return {
            "source": "nf_training",
            "path": str(path),
            "date": _iso_from_path(path),
            "title": path.stem,
            "metrics": metrics,
            "row_count": len(windows),
        }

    columns: dict[str, list[float]] = {label: [] for label in headers}
    for window in windows:
        values = window.get("values") if isinstance(window.get("values"), dict) else {}
        row = window.get("row") if isinstance(window.get("row"), list) else []
        for idx, label in enumerate(headers):
            val = _finite(values.get(label) if label in values else (row[idx] if idx < len(row) else None))
            if val is not None:
                columns[label].append(val)

    for label, values in columns.items():
        mean_value = _mean(values)
        if mean_value is None:
            continue
        last = values[-1] if values else mean_value
        unit = "pct" if label.endswith("_pass") or label in {"feedback", "alpha_high_tone"} else "uV/ratio"
        metrics[_metric_key("nf_training", protocol, label, "mean")] = {
            "label": f"{protocol} {label} mean",
            "value": mean_value,
            "source": "nf_training",
            "unit": unit,
        }
        metrics[_metric_key("nf_training", protocol, label, "last")] = {
            "label": f"{protocol} {label} last",
            "value": float(last),
            "source": "nf_training",
            "unit": unit,
        }

    summary = data.get("summary") or {}
    for label in ("reward_percent", "mean_feedback"):
        val = _finite(summary.get(label))
        if val is None:
            continue
        metrics[_metric_key("nf_training", protocol, label)] = {
            "label": f"{protocol} {label.replace('_', ' ')}",
            "value": val,
            "source": "nf_training",
            "unit": "pct",
        }

    return {
        "source": "nf_training",
        "path": str(path),
        "date": _iso_from_path(path),
        "title": path.stem,
        "metrics": metrics,
        "row_count": len(windows),
    }


def _flatten_result_json(path: Path, data: Dict[str, Any]) -> Dict[str, Any]:
    analysis = str((data.get("metadata") or {}).get("analysis") or "clinicalq")
    if analysis == "nf_training":
        return _flatten_nf_training(path, data)
    if analysis == "nf_baseline" or "locations" in data:
        return _flatten_baseline(path, data)

    metrics: dict[str, dict[str, Any]] = {}
    for metric in data.get("metrics", []) or []:
        loc = str(metric.get("location") or "")
        name = str(metric.get("metric") or "")
        val = _finite(metric.get("value"))
        if not loc or not name or val is None:
            continue
        key = _metric_key(analysis, loc, name)
        metrics[key] = {
            "label": f"{loc} {name}",
            "value": val,
            "source": analysis,
            "unit": "",
            "status": metric.get("status"),
            "normal_range": metric.get("normal_range"),
        }

    conditions = ((data.get("derived") or {}).get("conditions") or {})
    for loc, by_condition in conditions.items():
        if not isinstance(by_condition, dict):
            continue
        for condition, features in by_condition.items():
            if not isinstance(features, dict):
                continue
            for band, value in features.items():
                val = _finite(value)
                if val is None:
                    continue
                metrics[_metric_key("clinicalq_amp", loc, condition, band)] = {
                    "label": f"{loc} {condition} {band}",
                    "value": val,
                    "source": "clinicalq_amp",
                    "unit": "uV/ratio",
                }

    rows = (((data.get("derived") or {}).get("coherence") or {}).get("rows") or [])
    for row in rows:
        metric_type = str(row.get("metric_type") or "")
        band = str(row.get("band") or "")
        pair = row.get("pair")
        location = "/".join(pair) if isinstance(pair, list) else str(row.get("location") or "")
        val = _finite(row.get("value"))
        if not metric_type or val is None:
            continue
        key = _metric_key("qeeg", metric_type, location, band)
        metrics[key] = {
            "label": " ".join(x for x in [location, band, metric_type] if x),
            "value": val,
            "source": "qeeg",
            "unit": "",
            "zscore": _finite(row.get("zscore")),
            "norm_source": row.get("norm_source"),
        }

    return {
        "source": analysis,
        "path": str(path),
        "date": _iso_from_path(path),
        "title": path.stem,
        "metrics": metrics,
    }


def _candidate_files(paths: Iterable[str]) -> list[Path]:
    out: list[Path] = []
    for raw in paths:
        path = Path(str(raw)).expanduser()
        if path.is_dir():
            for pattern in ("*.csv", "*.txt", "*.json"):
                out.extend(sorted(path.glob(pattern)))
        elif path.exists():
            out.append(path)
    return sorted(dict.fromkeys(out), key=lambda p: str(p).lower())


def analyze_progress(config: Dict[str, Any]) -> Dict[str, Any]:
    raw_paths = list(config.get("paths") or [])
    if config.get("include_default_brainbay_dir", False):
        raw_paths.append(str(DEFAULT_BRAINBAY_DIR))

    sessions = []
    for path in _candidate_files(raw_paths):
        suffix = path.suffix.lower()
        try:
            if suffix == ".json":
                with path.open("r", encoding="utf-8-sig") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    sessions.append(_flatten_result_json(path, data))
            elif suffix in {".csv", ".txt", ".tsv"}:
                sessions.append(_summarize_brainbay_csv(path))
        except Exception as exc:
            sessions.append(
                {
                    "source": "error",
                    "path": str(path),
                    "date": _iso_from_path(path),
                    "title": path.name,
                    "metrics": {},
                    "error": str(exc),
                }
            )

    sessions.sort(key=lambda item: (str(item.get("date") or ""), str(item.get("path") or "")))
    metric_catalog: dict[str, dict[str, Any]] = {}
    for session in sessions:
        for key, metric in (session.get("metrics") or {}).items():
            metric_catalog.setdefault(
                key,
                {
                    "key": key,
                    "label": metric.get("label") or key,
                    "source": metric.get("source"),
                    "unit": metric.get("unit", ""),
                    "count": 0,
                },
            )
            metric_catalog[key]["count"] += 1

    series: dict[str, list[dict[str, Any]]] = {}
    for key in metric_catalog:
        points = []
        for session in sessions:
            metric = (session.get("metrics") or {}).get(key)
            if not metric:
                continue
            points.append(
                {
                    "date": session.get("date"),
                    "title": session.get("title"),
                    "path": session.get("path"),
                    "value": metric.get("value"),
                    "status": metric.get("status"),
                    "normal_range": metric.get("normal_range"),
                    "zscore": metric.get("zscore"),
                }
            )
        series[key] = points

    return {
        "sessions": sessions,
        "metrics": sorted(metric_catalog.values(), key=lambda item: (str(item.get("source")), str(item.get("label")))),
        "series": series,
    }
