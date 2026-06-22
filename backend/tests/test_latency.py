from __future__ import annotations

import csv

import pytest

from clinicalq_backend.latency import analyze_latency_csv


def _write_latency_fixture(path, *, latency_s: float = 0.123, sampling_rate: int = 1000) -> None:
    duration_s = 3.0
    trigger_samples = [400, 900, 1400, 1900, 2400]
    latency_samples = int(round(latency_s * sampling_rate))
    pulse_width_samples = 12
    samples = int(duration_s * sampling_rate)

    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["time_s", "trigger", "feedback"])
        for sample in range(samples):
            time_s = sample / sampling_rate
            trigger = any(start <= sample < start + pulse_width_samples for start in trigger_samples)
            feedback = any(
                start + latency_samples <= sample < start + latency_samples + pulse_width_samples
                for start in trigger_samples
            )
            writer.writerow([f"{time_s:.3f}", int(trigger), int(feedback)])


def test_analyze_latency_csv_reports_percentiles_and_jitter(tmp_path):
    csv_path = tmp_path / "latency.csv"
    _write_latency_fixture(csv_path)

    result = analyze_latency_csv(
        csv_path,
        time_column="time_s",
        trigger_column="trigger",
        feedback_column="feedback",
        trigger_threshold=0.5,
        feedback_threshold=0.5,
    )

    assert result["trigger_events"] == 5
    assert result["feedback_events"] == 5
    assert result["missed_triggers"] == 0
    assert result["summary"]["count"] == 5
    assert result["summary"]["p50_ms"] == pytest.approx(123.0)
    assert result["summary"]["p95_ms"] == pytest.approx(123.0)
    assert result["summary"]["p99_ms"] == pytest.approx(123.0)
    assert result["summary"]["max_ms"] == pytest.approx(123.0)
    assert result["summary"]["jitter_std_ms"] == pytest.approx(0.0)


def test_analyze_latency_csv_can_use_sampling_rate_without_time_column(tmp_path):
    csv_path = tmp_path / "latency_no_time.csv"
    _write_latency_fixture(csv_path, latency_s=0.087)

    result = analyze_latency_csv(
        csv_path,
        sampling_rate=1000,
        trigger_column="trigger",
        feedback_column="feedback",
    )

    assert result["summary"]["p50_ms"] == pytest.approx(87.0)
