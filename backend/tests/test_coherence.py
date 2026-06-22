from __future__ import annotations

import json
import math

import numpy as np
import pytest

from clinicalq_backend.coherence import analyze_coherence_session


def _coherent_signals(samples: int = 2500, sampling_rate: int = 250) -> tuple[list[float], list[float]]:
    t = np.arange(samples) / float(sampling_rate)
    a = np.sin(2.0 * np.pi * 10.0 * t)
    b = np.sin(2.0 * np.pi * 10.0 * t + 0.1)
    return a.tolist(), b.tolist()


def test_coherence_analysis_scores_against_norms(tmp_path):
    sig_a, sig_b = _coherent_signals()

    norms = {
        "dataset": "test",
        "metrics": {
            "COH:F3-F4:theta": {"mean": 0.2, "std": 0.1, "cutoff_low": 0.0, "cutoff_high": 0.4},
            "COH:F3-F4:alpha": {"mean": 0.2, "std": 0.1, "cutoff_low": 0.0, "cutoff_high": 0.4},
            "COH:F3-F4:beta": {"mean": 0.2, "std": 0.1, "cutoff_low": 0.0, "cutoff_high": 0.4},
            "BP:F3:theta": {"mean": 0.1, "std": 0.05, "cutoff_low": 0.0, "cutoff_high": 0.2},
            "BP:F3:alpha": {"mean": 0.1, "std": 0.05, "cutoff_low": 0.0, "cutoff_high": 0.2},
            "BP:F3:beta": {"mean": 0.1, "std": 0.05, "cutoff_low": 0.0, "cutoff_high": 0.2},
            "BP:F4:theta": {"mean": 0.1, "std": 0.05, "cutoff_low": 0.0, "cutoff_high": 0.2},
            "BP:F4:alpha": {"mean": 0.1, "std": 0.05, "cutoff_low": 0.0, "cutoff_high": 0.2},
            "BP:F4:beta": {"mean": 0.1, "std": 0.05, "cutoff_low": 0.0, "cutoff_high": 0.2},
        },
    }
    norms_path = tmp_path / "norms.json"
    norms_path.write_text(json.dumps(norms), encoding="utf-8")

    result = analyze_coherence_session(
        {
            "mode": "sequential",
            "sampling_rate": 250,
            "epoch_seconds": 10,
            "pairs": [["F3", "F4"]],
            "epochs": [
                {
                    "sequence": "F3/F4",
                    "index": 1,
                    "label": "EC",
                    "signals": {"F3": sig_a, "F4": sig_b},
                }
            ],
        },
        norms_path=str(norms_path),
    )

    assert len(result.metrics) == 54
    assert result.summary["out_of_range"] >= 1
    zscores = [row["zscore"] for row in result.derived["coherence"]["rows"]]
    assert any((not math.isnan(z)) and z > 2.0 for z in zscores)


def test_coherence_age_mode_uses_age_bin_metrics(tmp_path):
    sig_a, sig_b = _coherent_signals()
    norms = {
        "dataset": "test-age",
        "age_bins": [{"label": "30-39", "min_age": 30, "max_age": 39}],
        "metrics": {
            "COH:F3-F4:alpha": {"mean": 0.1, "std": 0.05, "cutoff_low": 0.0, "cutoff_high": 0.2},
        },
        "metrics_by_age": {
            "30-39": {
                "COH:F3-F4:alpha": {"mean": 0.8, "std": 0.1, "cutoff_low": 0.5, "cutoff_high": 1.0},
            }
        },
    }
    norms_path = tmp_path / "age_norms.json"
    norms_path.write_text(json.dumps(norms), encoding="utf-8")

    result = analyze_coherence_session(
        {
            "mode": "sequential",
            "sampling_rate": 250,
            "epoch_seconds": 10,
            "pairs": [["F3", "F4"]],
            "zscore_mode": "age",
            "subject_age": 35,
            "epochs": [
                {
                    "sequence": "F3/F4",
                    "index": 1,
                    "label": "EC",
                    "signals": {"F3": sig_a, "F4": sig_b},
                }
            ],
        },
        norms_path=str(norms_path),
    )

    alpha_metric = next(m for m in result.metrics if m.location == "F3/F4" and m.metric == "Alpha coherence (EC)")
    assert alpha_metric.status == "OUT_OF_RANGE"
    assert "|z|<=0.5" in alpha_metric.normal_range
    alpha_row = next(
        row for row in result.derived["coherence"]["rows"] if row.get("metric_type") == "coherence" and row.get("band") == "alpha"
    )
    assert alpha_row.get("norm_source") == "age:30-39"


def test_coherence_unknown_norm_dataset_raises():
    with pytest.raises(RuntimeError):
        analyze_coherence_session(
            {
                "mode": "simultaneous",
                "sampling_rate": 250,
                "epoch_seconds": 10,
                "pairs": [["F3", "F4"]],
                "epochs": [],
            },
            norms_dataset="does_not_exist",
        )
