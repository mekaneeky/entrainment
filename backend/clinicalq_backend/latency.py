from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence

import numpy as np


def _as_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float("nan")


def _read_csv_columns(path: Path) -> Dict[str, np.ndarray]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise RuntimeError(f"No CSV header found in {path}")
        columns: Dict[str, List[float]] = {name: [] for name in reader.fieldnames}
        for row in reader:
            for name in columns:
                columns[name].append(_as_float(row.get(name)))
    return {name: np.asarray(values, dtype=float) for name, values in columns.items()}


def _auto_threshold(values: np.ndarray) -> float:
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        raise RuntimeError("Cannot auto-threshold an empty/non-numeric signal.")
    return float((np.nanmin(finite) + np.nanmax(finite)) / 2.0)


def _detect_edges(values: np.ndarray, threshold: float, direction: str) -> np.ndarray:
    if values.size < 2:
        return np.asarray([], dtype=int)
    above = values >= threshold
    if direction == "rising":
        return np.flatnonzero((~above[:-1]) & above[1:]) + 1
    if direction == "falling":
        return np.flatnonzero(above[:-1] & (~above[1:])) + 1
    raise ValueError(f"Unsupported edge direction: {direction}")


def _filter_min_gap(indices: np.ndarray, times: np.ndarray, min_gap_s: float) -> np.ndarray:
    if indices.size == 0 or min_gap_s <= 0:
        return indices
    kept: List[int] = []
    last_time = -float("inf")
    for idx in indices:
        event_time = float(times[int(idx)])
        if event_time - last_time >= min_gap_s:
            kept.append(int(idx))
            last_time = event_time
    return np.asarray(kept, dtype=int)


def _pair_events(
    trigger_times: Sequence[float],
    feedback_times: Sequence[float],
    max_latency_s: float,
) -> tuple[np.ndarray, list[dict[str, float]], int, int]:
    latencies: List[float] = []
    pairs: list[dict[str, float]] = []
    feedback_idx = 0
    missed_triggers = 0

    for trigger_time in trigger_times:
        while feedback_idx < len(feedback_times) and feedback_times[feedback_idx] < trigger_time:
            feedback_idx += 1
        if feedback_idx >= len(feedback_times):
            missed_triggers += 1
            continue
        latency_s = float(feedback_times[feedback_idx] - trigger_time)
        if latency_s <= max_latency_s:
            latencies.append(latency_s)
            pairs.append(
                {
                    "trigger_time_s": float(trigger_time),
                    "feedback_time_s": float(feedback_times[feedback_idx]),
                    "latency_ms": latency_s * 1000.0,
                }
            )
            feedback_idx += 1
        else:
            missed_triggers += 1

    unpaired_feedback = max(0, len(feedback_times) - feedback_idx)
    return np.asarray(latencies, dtype=float), pairs, missed_triggers, unpaired_feedback


def summarize_latencies(latencies_s: np.ndarray) -> Dict[str, float | int]:
    if latencies_s.size == 0:
        raise RuntimeError("No paired trigger/feedback events were found.")
    latencies_ms = latencies_s * 1000.0
    return {
        "count": int(latencies_ms.size),
        "p50_ms": float(np.percentile(latencies_ms, 50)),
        "p95_ms": float(np.percentile(latencies_ms, 95)),
        "p99_ms": float(np.percentile(latencies_ms, 99)),
        "mean_ms": float(np.mean(latencies_ms)),
        "min_ms": float(np.min(latencies_ms)),
        "max_ms": float(np.max(latencies_ms)),
        "jitter_std_ms": float(np.std(latencies_ms, ddof=1)) if latencies_ms.size > 1 else 0.0,
        "jitter_iqr_ms": float(np.percentile(latencies_ms, 75) - np.percentile(latencies_ms, 25)),
    }


def analyze_latency_csv(
    path: str | Path,
    *,
    trigger_column: str,
    feedback_column: str,
    time_column: str | None = None,
    sampling_rate: float | None = None,
    trigger_threshold: float | None = None,
    feedback_threshold: float | None = None,
    trigger_edge: str = "rising",
    feedback_edge: str = "rising",
    min_gap_ms: float = 50.0,
    max_latency_ms: float = 2000.0,
) -> Dict[str, Any]:
    source = Path(path)
    columns = _read_csv_columns(source)
    if trigger_column not in columns:
        raise RuntimeError(f"Trigger column {trigger_column!r} not found. Available: {sorted(columns)}")
    if feedback_column not in columns:
        raise RuntimeError(f"Feedback column {feedback_column!r} not found. Available: {sorted(columns)}")

    trigger = columns[trigger_column]
    feedback = columns[feedback_column]
    if trigger.shape != feedback.shape:
        raise RuntimeError("Trigger and feedback columns must have the same number of samples.")

    if time_column:
        if time_column not in columns:
            raise RuntimeError(f"Time column {time_column!r} not found. Available: {sorted(columns)}")
        times = columns[time_column]
    elif sampling_rate and sampling_rate > 0:
        times = np.arange(trigger.size, dtype=float) / float(sampling_rate)
    else:
        raise RuntimeError("Provide either --time-column or --sampling-rate.")

    valid = np.isfinite(times) & np.isfinite(trigger) & np.isfinite(feedback)
    times = times[valid]
    trigger = trigger[valid]
    feedback = feedback[valid]
    if times.size < 2:
        raise RuntimeError("Not enough valid samples for latency analysis.")

    trig_threshold = _auto_threshold(trigger) if trigger_threshold is None else float(trigger_threshold)
    fb_threshold = _auto_threshold(feedback) if feedback_threshold is None else float(feedback_threshold)
    min_gap_s = float(min_gap_ms) / 1000.0
    max_latency_s = float(max_latency_ms) / 1000.0

    trigger_indices = _filter_min_gap(_detect_edges(trigger, trig_threshold, trigger_edge), times, min_gap_s)
    feedback_indices = _filter_min_gap(_detect_edges(feedback, fb_threshold, feedback_edge), times, min_gap_s)
    trigger_times = [float(times[idx]) for idx in trigger_indices]
    feedback_times = [float(times[idx]) for idx in feedback_indices]
    latencies_s, pairs, missed_triggers, unpaired_feedback = _pair_events(
        trigger_times,
        feedback_times,
        max_latency_s,
    )

    return {
        "source": str(source),
        "time_column": time_column,
        "sampling_rate": sampling_rate,
        "trigger_column": trigger_column,
        "feedback_column": feedback_column,
        "trigger_threshold": trig_threshold,
        "feedback_threshold": fb_threshold,
        "trigger_edge": trigger_edge,
        "feedback_edge": feedback_edge,
        "trigger_events": int(len(trigger_times)),
        "feedback_events": int(len(feedback_times)),
        "missed_triggers": int(missed_triggers),
        "unpaired_feedback_events": int(unpaired_feedback),
        "summary": summarize_latencies(latencies_s),
        "pairs": pairs,
    }


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Analyze physical neurofeedback end-to-end latency from a CSV recording.")
    parser.add_argument("input", help="CSV containing trigger and feedback/photodiode/loopback signals.")
    parser.add_argument("--trigger-column", required=True, help="Column containing the injected trigger/reference signal.")
    parser.add_argument("--feedback-column", required=True, help="Column containing the measured feedback signal.")
    parser.add_argument("--time-column", help="Optional seconds column. If omitted, --sampling-rate is required.")
    parser.add_argument("--sampling-rate", type=float, help="Sampling rate in Hz when the CSV has no time column.")
    parser.add_argument("--trigger-threshold", type=float, help="Trigger edge threshold. Defaults to midpoint of min/max.")
    parser.add_argument("--feedback-threshold", type=float, help="Feedback edge threshold. Defaults to midpoint of min/max.")
    parser.add_argument("--trigger-edge", choices=["rising", "falling"], default="rising")
    parser.add_argument("--feedback-edge", choices=["rising", "falling"], default="rising")
    parser.add_argument("--min-gap-ms", type=float, default=50.0, help="Ignore duplicate edges within this many ms.")
    parser.add_argument("--max-latency-ms", type=float, default=2000.0, help="Maximum trigger-to-feedback pairing latency.")
    parser.add_argument("--output-json", help="Optional path for the full JSON report.")
    return parser


def main(argv: Iterable[str] | None = None) -> int:
    args = _build_parser().parse_args(list(argv) if argv is not None else None)
    result = analyze_latency_csv(
        args.input,
        trigger_column=args.trigger_column,
        feedback_column=args.feedback_column,
        time_column=args.time_column,
        sampling_rate=args.sampling_rate,
        trigger_threshold=args.trigger_threshold,
        feedback_threshold=args.feedback_threshold,
        trigger_edge=args.trigger_edge,
        feedback_edge=args.feedback_edge,
        min_gap_ms=args.min_gap_ms,
        max_latency_ms=args.max_latency_ms,
    )
    text = json.dumps(result, indent=2)
    if args.output_json:
        Path(args.output_json).write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
