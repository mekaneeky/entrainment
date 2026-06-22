from __future__ import annotations

import json

import numpy as np
import pytest

from clinicalq_backend.cli import main as cli_main
from clinicalq_backend.baseline import _spectrum, run_baseline, run_live_windows
from clinicalq_backend.filters import clean_eeg_signal
from clinicalq_backend.nf_training import PROTOCOL_HEADERS, run_nf_training
from clinicalq_backend.progress import analyze_progress
from clinicalq_backend.runner import run_session


def _amp_at(signal, sampling_rate, hz):
    freqs, amps = _spectrum(signal, sampling_rate)
    return float(amps[int(np.argmin(np.abs(freqs - hz)))])


def test_eeg_filter_removes_line_noise_and_keeps_alpha():
    sampling_rate = 250
    t = np.arange(0, 10, 1 / sampling_rate)
    signal = (
        20.0 * np.sin(2 * np.pi * 0.1 * t)
        + 3.0 * np.sin(2 * np.pi * 10.0 * t)
        + 4.0 * np.sin(2 * np.pi * 60.0 * t)
    )

    clean = clean_eeg_signal(
        signal,
        sampling_rate,
        {"filters": {"enabled": True, "l_freq": 0.3, "h_freq": 70.0, "notch_hz": 60.0}},
    )
    unfiltered = clean_eeg_signal(signal, sampling_rate, {"filters": False})

    assert _amp_at(clean, sampling_rate, 60.0) < _amp_at(signal, sampling_rate, 60.0) * 0.1
    assert _amp_at(clean, sampling_rate, 10.0) > _amp_at(signal, sampling_rate, 10.0) * 0.8
    assert _amp_at(unfiltered, sampling_rate, 60.0) > _amp_at(clean, sampling_rate, 60.0) * 5.0


def test_run_baseline_synthetic_multi_site():
    result = run_baseline(
        {
            "epoch_seconds": 2,
            "sampling_rate": 250,
            "fast_mode": True,
            "norms_dataset": "dvs_608_cleaned",
            "board": {"use_synthetic": True, "available_channels": [1, 2], "seed": 7},
            "channels": {"O1": 1, "T3": 2},
        }
    )

    assert result["metadata"]["analysis"] == "nf_baseline"
    assert result["metadata"]["filters"]["h_freq"] == 45.0
    assert result["metadata"]["clinicalq_bands_hz"]["delta"] == [1.5, 2.5]
    assert result["metadata"]["clinicalq_bands_hz"]["smr"] == [12.0, 15.0]
    assert {row["location"] for row in result["locations"]} == {"O1", "T3"}
    assert [row["amplitude_sum"] for row in result["mapping_1_30"]] == sorted(
        row["amplitude_sum"] for row in result["mapping_1_30"]
    )
    for row in result["locations"]:
        assert row["amplitudes"]["theta"] > 0
        assert row["absolute_power"]["theta"] > 0
        assert row["relative_power"]["theta"] > 0
        assert row["norm_scores"]
        assert row["dominant_frequency_hz"] > 0
        assert row["dominant_frequency_amplitude"] > 0
        assert len(row["spectrum_1_30_hz"]) == 30
        assert set(row["clinicalq_band_stats"]) == {"delta", "theta", "alpha", "smr", "beta"}
        assert row["clinicalq_band_stats"]["alpha"]["window_count"] == 2
        assert row["clinicalq_band_stats"]["alpha"]["mean_amplitude"] > 0


def test_run_baseline_can_save_raw_npz(tmp_path):
    raw_path = tmp_path / "baseline-raw.npz"
    result = run_baseline(
        {
            "epoch_seconds": 1,
            "sampling_rate": 250,
            "fast_mode": True,
            "norms_dataset": "dvs_608_cleaned",
            "record_raw_eeg": True,
            "raw_recording_path": str(raw_path),
            "profile": {"id": "test-profile", "name": "Test Profile"},
            "tags": ["baseline"],
            "board": {"use_synthetic": True, "available_channels": [1], "seed": 7},
            "channels": {"O1": 1},
        }
    )

    assert raw_path.exists()
    assert result["metadata"]["raw_recording"]["path"] == str(raw_path.resolve())
    with np.load(raw_path, allow_pickle=False) as recording:
        assert "manifest" in recording.files
        assert any(key.startswith("epoch_001_") for key in recording.files)


def test_run_baseline_accepts_daisy_channel_numbers():
    result = run_baseline(
        {
            "epoch_seconds": 1,
            "sampling_rate": 250,
            "fast_mode": True,
            "norms_dataset": "none",
            "board": {"use_synthetic": True, "available_channels": [16], "seed": 7},
            "channels": {"O2": 16},
        }
    )

    assert result["locations"][0]["channel"] == 16
    assert result["locations"][0]["dominant_frequency_hz"] > 0


def test_run_baseline_can_average_dominant_frequency_by_window():
    result = run_baseline(
        {
            "epoch_seconds": 2,
            "sampling_rate": 250,
            "fast_mode": True,
            "dominant_window_seconds": 1.0,
            "norms_dataset": "none",
            "board": {"use_synthetic": True, "available_channels": [1], "seed": 7},
            "channels": {"Cz": 1},
        }
    )

    assert result["metadata"]["dominant_window_seconds"] == 1.0
    assert result["locations"][0]["dominant_frequency_hz"] > 0


def test_run_baseline_cli_replaces_default_channel_map(tmp_path):
    config_path = tmp_path / "config.json"
    output_path = tmp_path / "result.json"
    config_path.write_text(
        json.dumps(
            {
                "epoch_seconds": 1,
                "sampling_rate": 250,
                "fast_mode": True,
                "dominant_window_seconds": 1.0,
                "norms_dataset": "none",
                "board": {"board_id": "synthetic", "use_synthetic": True, "available_channels": [1], "seed": 42},
                "channels": {"Cz": 1},
            }
        ),
        encoding="utf-8",
    )

    assert cli_main(["run-baseline", "--config", str(config_path), "--output", str(output_path)]) == 0
    result = json.loads(output_path.read_text(encoding="utf-8"))
    assert [row["location"] for row in result["locations"]] == ["Cz"]


def test_run_live_windows_reports_gradients():
    events = []
    result = run_live_windows(
        {
            "total_seconds": 3,
            "window_seconds": 1,
            "sampling_rate": 250,
            "fast_mode": True,
            "dominant_window_seconds": 1.0,
            "norms_dataset": "none",
            "score_metric": "alpha",
            "selected_locations": ["Cz"],
            "board": {"use_synthetic": True, "available_channels": [1], "seed": 7},
            "channels": {"Cz": 1},
        },
        event_cb=events.append,
    )

    assert result["metadata"]["analysis"] == "disentrainment_live_windows"
    assert result["summary"]["window_count"] == 3
    assert len(result["windows"]) == 3
    assert any(event["event"] == "live_window" for event in events)
    assert "mean_drop_gradient_per_second" in result["summary"]


def test_run_nf_training_synthetic_o1_ratio():
    events = []
    result = run_nf_training(
        {
            "protocol_id": "o1_theta_beta_ratio_downtrain",
            "total_seconds": 3,
            "window_seconds": 1,
            "sampling_rate": 250,
            "fast_mode": True,
            "board": {"use_synthetic": True, "available_channels": [1], "seed": 7},
            "channels": {"O1": 1},
        },
        event_cb=events.append,
    )

    assert result["metadata"]["analysis"] == "nf_training"
    assert result["metadata"]["filters"]["l_freq"] == 0.3
    assert result["metadata"]["headers"] == ["theta", "beta", "theta_beta", "ratio_pass", "feedback"]
    assert result["summary"]["protocol_id"] == "o1_theta_beta_ratio_downtrain"
    assert result["summary"]["window_count"] == 3
    assert len(result["windows"]) == 3
    assert result["windows"][0]["values"]["theta_beta"] > 0
    assert any(event["event"] == "nf_training_window" for event in events)


@pytest.mark.parametrize("protocol_id", sorted(PROTOCOL_HEADERS))
def test_run_nf_training_supports_protocol_catalog(protocol_id):
    result = run_nf_training(
        {
            "protocol_id": protocol_id,
            "total_seconds": 1,
            "window_seconds": 1,
            "sampling_rate": 250,
            "fast_mode": True,
            "board": {"use_synthetic": True, "available_channels": list(range(1, 9)), "seed": 7},
        }
    )

    assert result["metadata"]["protocol_id"] == protocol_id
    assert result["metadata"]["headers"] == PROTOCOL_HEADERS[protocol_id]
    assert result["summary"]["window_count"] == 1
    assert set(PROTOCOL_HEADERS[protocol_id]).issubset(result["windows"][0]["values"])


def test_run_nf_training_defaults_channels_by_protocol():
    result = run_nf_training(
        {
            "protocol_id": "f3f4_band_asymmetry_reduce",
            "total_seconds": 1,
            "window_seconds": 1,
            "sampling_rate": 250,
            "fast_mode": True,
            "board": {"use_synthetic": True, "available_channels": [1, 2], "seed": 7},
        }
    )

    assert result["metadata"]["channels"] == {"F3": 1, "F4": 2}
    assert "theta_asym_pct" in result["windows"][0]["values"]


def test_run_nf_training_cli_fast_synthetic(tmp_path):
    config_path = tmp_path / "nf-training-config.json"
    output_path = tmp_path / "nf-training-result.json"
    config_path.write_text(
        json.dumps(
            {
                "protocol_id": "fz_hibeta_beta_ratio",
                "total_seconds": 1,
                "window_seconds": 1,
                "sampling_rate": 250,
                "fast_mode": True,
                "board": {"board_id": "synthetic", "use_synthetic": True, "available_channels": [1], "seed": 7},
            }
        ),
        encoding="utf-8",
    )

    assert cli_main(["run-nf-training", "--config", str(config_path), "--output", str(output_path)]) == 0
    result = json.loads(output_path.read_text(encoding="utf-8"))
    assert result["metadata"]["analysis"] == "nf_training"
    assert result["metadata"]["filters"]["h_freq"] == 45.0
    assert result["metadata"]["protocol_id"] == "fz_hibeta_beta_ratio"
    assert result["metadata"]["channels"] == {"Fz": 1}


def test_run_clinicalq_can_save_raw_npz(tmp_path):
    raw_path = tmp_path / "clinicalq-raw.npz"
    result = run_session(
        {
            "mode": "simultaneous",
            "epoch_seconds": 1,
            "sampling_rate": 250,
            "fast_mode": True,
            "include_frontal_baseline": False,
            "record_raw_eeg": True,
            "raw_recording_path": str(raw_path),
            "profile": {"id": "test-profile", "name": "Test Profile"},
            "tags": ["clinicalq"],
            "board": {"use_synthetic": True, "available_channels": [1, 2, 3, 4, 5], "seed": 7},
            "channels": {"Cz": 1, "O1": 2, "Fz": 3, "F3": 4, "F4": 5},
        }
    )

    assert raw_path.exists()
    assert result["metadata"]["raw_recording"]["epoch_count"] > 0
    assert result["metadata"]["filters"]["notch_hz"] == 60.0
    with np.load(raw_path, allow_pickle=False) as recording:
        assert "manifest" in recording.files
        assert any(key.endswith("_Cz") or key.endswith("_CZ") for key in recording.files)


def test_run_clinicalq_accepts_selected_locations_and_sound_probes():
    result = run_session(
        {
            "mode": "sequential",
            "epoch_seconds": 1,
            "sampling_rate": 250,
            "fast_mode": True,
            "selected_locations": ["O1", "Cz"],
            "sound_probes": ["sub_beta", "sleep_support", "sub_alpha"],
            "board": {"use_synthetic": True, "available_channels": [1, 2], "seed": 7},
            "channels": {"O1": 1, "Cz": 2},
            "sequential_order": ["O1", "Cz"],
        }
    )

    labels = {(epoch["sequence"], epoch["label"]) for epoch in result["epoch_features"]}
    assert ("O1", "SUB_BETA") in labels
    assert ("O1", "SLEEP_SUPPORT") in labels
    assert ("Cz", "OMNI") in labels
    assert all(label not in {"SUB_ALPHA", "TEST", "HARMONIC"} for _sequence, label in labels)
    assert result["metadata"]["selected_locations"] == ["O1", "Cz"]
    assert "sub_alpha" in result["metadata"]["sound_probes"]
    assert any(metric["metric"] == "SUB/ALPHA (OMNI) Theta response %" for metric in result["metrics"])
    assert any(metric["metric"] == "SUB/BETA T/B response %" for metric in result["metrics"])


def test_run_clinicalq_records_sweep_post_asymmetry_probe():
    result = run_session(
        {
            "mode": "sequential",
            "epoch_seconds": 1,
            "sampling_rate": 250,
            "fast_mode": True,
            "selected_locations": ["F3", "F4"],
            "sound_probes": ["sweep"],
            "board": {"use_synthetic": True, "available_channels": [1, 2], "seed": 11},
            "channels": {"F3": 1, "F4": 2},
            "sequential_order": ["F3", "F4"],
        }
    )

    labels = {(epoch["sequence"], epoch["label"]) for epoch in result["epoch_features"]}
    assert ("F3", "SWEEP") in labels
    assert ("F3", "SWEEP_POST") in labels
    assert ("F4", "SWEEP_POST") in labels
    assert any(metric["metric"] == "SWEEP post Theta asymmetry reduction pp" for metric in result["metrics"])


def test_run_clinicalq_simultaneous_uses_single_omni_probe():
    result = run_session(
        {
            "mode": "simultaneous",
            "epoch_seconds": 1,
            "sampling_rate": 250,
            "fast_mode": True,
            "include_frontal_baseline": True,
            "selected_locations": ["O1", "Cz", "Fz", "F3", "F4"],
            "sound_probes": ["sub_alpha", "sub_beta", "sleep_support", "sweep"],
            "board": {"use_synthetic": True, "available_channels": [1, 2, 3, 4, 5], "seed": 12},
            "channels": {"O1": 1, "Cz": 2, "Fz": 3, "F3": 4, "F4": 5},
        }
    )

    labels = [epoch["label"] for epoch in result["epoch_features"]]
    assert labels.count("OMNI") == 1
    assert "SUB_BETA" in labels
    assert "SLEEP_SUPPORT" in labels
    assert "SWEEP" in labels
    assert "SWEEP_POST" in labels
    assert "SUB_ALPHA" not in labels
    assert "TEST" not in labels
    assert "HARMONIC" not in labels


def test_analyze_progress_reads_brainbay_csv_and_baseline_json(tmp_path):
    csv_path = tmp_path / "o1_theta_beta_ratio_downtrain_manual_20260501.csv"
    csv_path.write_text(
        "theta,beta,theta_beta,ratio_pass,feedback\n"
        "6,3,2,1,100\n"
        "5,4,1.25,1,100\n",
        encoding="utf-8",
    )
    baseline_path = tmp_path / "baseline.json"
    baseline_path.write_text(
        json.dumps(
            {
                "metadata": {"analysis": "nf_baseline"},
                "locations": [
                    {
                        "location": "O1",
                        "amplitudes": {"theta": 4.0, "alpha": 8.0},
                        "relative_percent": {"theta": 33.3, "alpha": 66.7},
                        "absolute_power": {"theta": 1e-9, "alpha": 2e-9},
                        "relative_power": {"theta": 0.33, "alpha": 0.67},
                        "norm_scores": [
                            {
                                "location": "O1",
                                "metric_type": "absolute_power",
                                "band": "theta",
                                "value": 1e-9,
                                "status": "IN_RANGE",
                                "zscore": 0.2,
                                "normal_range": "0.0-2.0",
                            }
                        ],
                        "dominant_frequency_hz": 10.0,
                        "ratios": {"theta_beta": 1.5},
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    training_path = tmp_path / "nf-training.json"
    training_path.write_text(
        json.dumps(
            {
                "metadata": {
                    "analysis": "nf_training",
                    "protocol_id": "o1_theta_beta_ratio_downtrain",
                    "headers": ["theta", "beta", "theta_beta", "ratio_pass", "feedback"],
                },
                "summary": {"reward_percent": 50.0, "mean_feedback": 50.0},
                "windows": [
                    {"values": {"theta": 6, "beta": 3, "theta_beta": 2, "ratio_pass": 1, "feedback": 100}},
                    {"values": {"theta": 5, "beta": 4, "theta_beta": 1.25, "ratio_pass": 0, "feedback": 0}},
                ],
            }
        ),
        encoding="utf-8",
    )

    result = analyze_progress({"paths": [str(tmp_path)], "include_default_brainbay_dir": False})
    keys = {item["key"] for item in result["metrics"]}

    assert "brainbay:o1_theta_beta_ratio_downtrain:theta_beta:mean" in keys
    assert "nf_training:o1_theta_beta_ratio_downtrain:theta_beta:mean" in keys
    assert "baseline:O1:absolute:theta" in keys
    assert "baseline_norm:O1:absolute_power:theta" in keys
    assert result["series"]["brainbay:o1_theta_beta_ratio_downtrain:theta_beta:mean"][0]["value"] == 1.625
    assert result["series"]["nf_training:o1_theta_beta_ratio_downtrain:theta_beta:mean"][0]["value"] == 1.625
