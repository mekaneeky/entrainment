from __future__ import annotations

from clinicalq_backend.analysis import analyze_session


def _feature(
    *,
    theta: float,
    alpha: float,
    beta: float,
    smr: float = 3.0,
    delta: float = 2.0,
    lo_alpha: float = 3.0,
    hi_alpha: float = 2.5,
    hibeta: float = 2.0,
    peak_alpha: float = 10.0,
):
    return {
        "theta": theta,
        "alpha": alpha,
        "beta": beta,
        "smr": smr,
        "delta": delta,
        "lo_alpha": lo_alpha,
        "hi_alpha": hi_alpha,
        "hibeta": hibeta,
        "total_amp_basic": theta + alpha + beta,
        "hibeta_plus_beta": hibeta + beta,
        "peak_alpha": peak_alpha,
    }


def _epoch(sequence: str, index: int, label: str, location: str, feature: dict):
    return {
        "sequence": sequence,
        "index": index,
        "label": label,
        "instruction": "",
        "seconds": 15,
        "features": {location: feature},
    }


def test_analysis_generates_metrics_and_probes():
    epochs = [
        _epoch("Cz", 1, "EO", "Cz", _feature(theta=8, alpha=10, beta=5, peak_alpha=10.2)),
        _epoch("Cz", 2, "EO", "Cz", _feature(theta=8, alpha=10, beta=5, peak_alpha=10.1)),
        _epoch("Cz", 3, "EC", "Cz", _feature(theta=9, alpha=15, beta=4, smr=2.2, peak_alpha=9.8)),
        _epoch("Cz", 4, "EO", "Cz", _feature(theta=8, alpha=7, beta=5, peak_alpha=10.0)),
        _epoch("Cz", 5, "READ", "Cz", _feature(theta=11, alpha=8, beta=3, peak_alpha=9.7)),
        _epoch("Cz", 6, "OMNI", "Cz", _feature(theta=9, alpha=9, beta=5, peak_alpha=9.6)),
        _epoch("Cz", 7, "COUNT", "Cz", _feature(theta=11, alpha=8, beta=3, peak_alpha=9.7)),
        _epoch("Cz", 8, "EO", "Cz", _feature(theta=8, alpha=9, beta=5, peak_alpha=10.0)),
        _epoch("Cz", 9, "TEST", "Cz", _feature(theta=8, alpha=9, beta=5, peak_alpha=10.0)),
        _epoch("Cz", 10, "HARMONIC", "Cz", _feature(theta=8, alpha=9, beta=5, peak_alpha=10.0)),
        _epoch("O1", 1, "EO", "O1", _feature(theta=6, alpha=8, beta=3, peak_alpha=10.1)),
        _epoch("O1", 2, "EO", "O1", _feature(theta=6, alpha=8, beta=3, peak_alpha=10.1)),
        _epoch("O1", 3, "EC", "O1", _feature(theta=5, alpha=18, beta=4, peak_alpha=10.0)),
        _epoch("O1", 4, "EO", "O1", _feature(theta=6, alpha=5, beta=3, peak_alpha=10.0)),
        _epoch("F3", 1, "EC", "F3", _feature(theta=6, alpha=5, beta=2, peak_alpha=9.8)),
        _epoch("F4", 1, "EC", "F4", _feature(theta=5, alpha=10, beta=3, peak_alpha=9.9)),
        _epoch(
            "Fz",
            1,
            "EC",
            "Fz",
            _feature(theta=6, alpha=9, beta=8, delta=10, lo_alpha=4, hi_alpha=2, hibeta=5, peak_alpha=9.0),
        ),
    ]

    result = analyze_session(
        {
            "mode": "sequential",
            "sampling_rate": 250,
            "epoch_seconds": 15,
            "channels": {"Cz": 1, "O1": 2, "Fz": 3, "F3": 4, "F4": 5},
            "epochs": epochs,
        }
    )

    assert len(result.metrics) >= 25
    assert result.summary["out_of_range"] > 0
    assert result.summary["in_range"] > 0
    assert any("sleep" in probe.lower() for probe in result.summary["potential_symptom_questions"])

