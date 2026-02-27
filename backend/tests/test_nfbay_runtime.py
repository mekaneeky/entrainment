from __future__ import annotations

import copy
import json
from pathlib import Path

from clinicalq_backend.cli import main
from clinicalq_backend.nfbay.runtime import DEFAULT_NFBAY_CONFIG, run_nfbay_session


def test_run_nfbay_alpha_theta_session_emits_ticks_and_summary() -> None:
    config = copy.deepcopy(DEFAULT_NFBAY_CONFIG)
    config["variant"] = "alpha_theta"
    config["duration_seconds"] = 2
    config["sampling_rate"] = 100
    config["event_hz"] = 10
    config["fast_mode"] = True
    config["board"]["use_synthetic"] = True
    config["alpha_theta"]["channel"] = 1

    events: list[dict] = []
    result = run_nfbay_session(config, event_cb=events.append)

    assert result["variant"] == "alpha_theta"
    assert result["samples_processed"] == 200
    assert 0.0 <= float(result["summary"]["feedback_enabled_ratio"]) <= 1.0
    assert any(evt.get("event") == "nfbay_tick" for evt in events)
    assert any(evt.get("event") == "nfbay_complete" for evt in events)


def test_run_nfbay_resilience_session_tracks_site_stickiness() -> None:
    config = copy.deepcopy(DEFAULT_NFBAY_CONFIG)
    config["variant"] = "resilience"
    config["duration_seconds"] = 3
    config["sampling_rate"] = 100
    config["event_hz"] = 8
    config["fast_mode"] = True
    config["board"]["use_synthetic"] = True
    config["resilience"]["combine_mode"] = "mean"
    config["resilience"]["sites"] = {
        "Cz": {"channel": 1, "offset_hz": 2.0},
        "Pz": {"channel": 2, "offset_hz": 1.5},
    }

    events: list[dict] = []
    result = run_nfbay_session(config, event_cb=events.append)

    assert result["variant"] == "resilience"
    assert result["samples_processed"] == 300
    stickiness = result["summary"]["stickiness_ratio_60s_by_site"]
    assert set(stickiness.keys()) == {"Cz", "Pz"}
    assert all(0.0 <= float(value) <= 1.0 for value in stickiness.values())
    assert any(evt.get("event") == "nfbay_tick" for evt in events)
    assert any(evt.get("event") == "nfbay_complete" for evt in events)


def test_cli_run_nfbay_writes_output_json(tmp_path: Path) -> None:
    config = copy.deepcopy(DEFAULT_NFBAY_CONFIG)
    config["variant"] = "alpha_theta"
    config["duration_seconds"] = 1
    config["sampling_rate"] = 50
    config["event_hz"] = 10
    config["fast_mode"] = True
    config["board"]["use_synthetic"] = True
    config["alpha_theta"]["channel"] = 1

    config_path = tmp_path / "nfbay-config.json"
    output_path = tmp_path / "nfbay-output.json"
    config_path.write_text(json.dumps(config), encoding="utf-8")

    code = main(["run-nfbay", "--config", str(config_path), "--output", str(output_path)])
    assert code == 0
    assert output_path.exists()

    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert payload["variant"] == "alpha_theta"
    assert int(payload["samples_processed"]) == 50


def test_cli_init_nfbay_config_writes_template(tmp_path: Path) -> None:
    output_path = tmp_path / "starter-nfbay.json"
    code = main(["init-nfbay-config", "--output", str(output_path)])
    assert code == 0
    assert output_path.exists()
    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert payload["variant"] in {"alpha_theta", "resilience"}
