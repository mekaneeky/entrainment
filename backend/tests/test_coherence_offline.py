from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np

from clinicalq_backend.coherence_runner import run_coherence_session


def _write_csv(path: Path, header: list[str], columns: list[list[float]]) -> None:
    rows = zip(*columns)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        for row in rows:
            writer.writerow(row)


def _signal(freq_hz: float, *, seconds: int = 30, sampling_rate: int = 250, phase: float = 0.0) -> list[float]:
    t = np.arange(seconds * sampling_rate, dtype=float) / float(sampling_rate)
    return np.sin(2.0 * np.pi * freq_hz * t + phase).tolist()


def _norms_for(tmp_path: Path, *, pairs: list[tuple[str, str]], locations: list[str]) -> str:
    metrics = {}
    for left, right in pairs:
        for band in ("theta", "alpha", "beta"):
            metrics[f"COH:{left}-{right}:{band}"] = {
                "mean": 0.4,
                "std": 0.2,
                "cutoff_low": 0.0,
                "cutoff_high": 1.0,
            }
    for location in locations:
        for band in ("theta", "alpha", "beta"):
            metrics[f"BP:{location}:{band}"] = {
                "mean": 1.0,
                "std": 2.0,
                "cutoff_low": 0.0,
                "cutoff_high": 20.0,
            }

    norms = {"dataset": "test-offline", "metrics": metrics}
    path = tmp_path / "norms.json"
    path.write_text(json.dumps(norms), encoding="utf-8")
    return str(path)


def _metric(result: dict, location: str, metric_name: str) -> dict:
    for metric in result.get("metrics", []):
        if metric.get("location") == location and metric.get("metric") == metric_name:
            return metric
    raise AssertionError(f"Metric not found: {location} {metric_name}")


def test_offline_independent_files_do_not_fake_cross_file_coherence(tmp_path):
    file_a = tmp_path / "left.csv"
    file_b = tmp_path / "right.csv"
    _write_csv(file_a, ["F3", "F4"], [_signal(10.0), _signal(10.0, phase=0.1)])
    _write_csv(file_b, ["Cz"], [_signal(10.0)])

    norms_path = _norms_for(tmp_path, pairs=[("F3", "F4"), ("F3", "Cz")], locations=["F3", "F4", "Cz"])

    result = run_coherence_session(
        {
            "epoch_seconds": 30,
            "sampling_rate": 250,
            "norms_path": norms_path,
            "channels": {"F3": "F3", "F4": "F4", "Cz": "Cz"},
            "locations": ["F3", "F4", "Cz"],
            "pairs": [["F3", "F4"], ["F3", "Cz"]],
            "source": {
                "kind": "existing_recordings",
                "sync_mode": "independent",
                "recordings": [str(file_a), str(file_b)],
            },
        }
    )

    assert _metric(result, "F3/F4", "Alpha coherence (EC)")["status"] != "MISSING"
    assert _metric(result, "F3/Cz", "Alpha coherence (EC)")["status"] == "MISSING"
    assert _metric(result, "Cz", "Alpha bandpower (EC)")["status"] != "MISSING"


def test_offline_parallel_files_can_merge_time_aligned_recordings(tmp_path):
    file_a = tmp_path / "left.csv"
    file_b = tmp_path / "right.csv"
    _write_csv(file_a, ["F3"], [_signal(10.0)])
    _write_csv(file_b, ["Cz"], [_signal(10.0, phase=0.05)])

    norms_path = _norms_for(tmp_path, pairs=[("F3", "Cz")], locations=["F3", "Cz"])

    result = run_coherence_session(
        {
            "epoch_seconds": 30,
            "sampling_rate": 250,
            "norms_path": norms_path,
            "channels": {"F3": "F3", "Cz": "Cz"},
            "locations": ["F3", "Cz"],
            "pairs": [["F3", "Cz"]],
            "source": {
                "kind": "existing_recordings",
                "sync_mode": "parallel",
                "recordings": [str(file_a), str(file_b)],
            },
        }
    )

    metric = _metric(result, "F3/Cz", "Alpha coherence (EC)")
    assert metric["status"] != "MISSING"
    assert len(result.get("epoch_features", [])) == 1


def test_offline_exclude_ranges_remove_artifact_windows_across_imported_files(tmp_path):
    file_a = tmp_path / "session.csv"
    _write_csv(file_a, ["F3", "F4"], [_signal(10.0), _signal(10.0, phase=0.1)])

    norms_path = _norms_for(tmp_path, pairs=[("F3", "F4")], locations=["F3", "F4"])

    result = run_coherence_session(
        {
            "epoch_seconds": 10,
            "sampling_rate": 250,
            "norms_path": norms_path,
            "channels": {"F3": "F3", "F4": "F4"},
            "locations": ["F3", "F4"],
            "pairs": [["F3", "F4"]],
            "source": {
                "kind": "existing_recordings",
                "sync_mode": "parallel",
                "exclude_ranges": [[10, 20]],
                "recordings": [str(file_a)],
            },
        }
    )

    assert len(result.get("epoch_features", [])) == 2
    assert all(epoch.get("seconds") == 10.0 for epoch in result.get("epoch_features", []))
