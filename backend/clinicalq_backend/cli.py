from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any, Dict

from clinicalq_backend.coherence_runner import DEFAULT_COHERENCE_CONFIG, run_coherence_session
from clinicalq_backend.nfbay.runtime import DEFAULT_NFBAY_CONFIG, run_nfbay_session
from clinicalq_backend.runner import run_session

DEFAULT_CONFIG: Dict[str, Any] = {
    "mode": "sequential",
    "epoch_seconds": 15,
    "reposition_seconds": 20,
    "reposition_mode": "timer",
    "live_bandpower": True,
    "live_window_seconds": 2.0,
    "sampling_rate": 250,
    "fast_mode": False,
    "include_frontal_baseline": True,
    "board": {
        "board_id": "cyton",
        "serial_port": "COM3",
        "use_synthetic": True,
        "available_channels": [1, 2, 3, 4, 5, 6, 7, 8],
        "seed": 42,
    },
    "channels": {"Cz": 1, "O1": 2, "Fz": 3, "F3": 4, "F4": 5},
    "sequential_order": ["O1", "Cz", "Fz", "F3", "F4"],
}


def _emit(event: Dict[str, Any]) -> None:
    print(json.dumps(event), flush=True)


def _merge_dict(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    merged: Dict[str, Any] = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _merge_dict(merged[key], value)
        else:
            merged[key] = value
    return merged


def _load_config(path: str | None, default: Dict[str, Any]) -> Dict[str, Any]:
    if not path:
        return copy.deepcopy(default)
    cfg_path = Path(path)
    with cfg_path.open("r", encoding="utf-8-sig") as f:
        loaded = json.load(f)
    if not isinstance(loaded, dict):
        raise RuntimeError("Configuration JSON must be an object at the top level.")
    return _merge_dict(default, loaded)


def cmd_run(args: argparse.Namespace) -> int:
    config = _load_config(args.config, DEFAULT_CONFIG)

    try:
        result = run_session(config=config, event_cb=_emit)
    except Exception as exc:
        _emit({"event": "error", "message": str(exc)})
        return 1

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    _emit({"event": "session_complete", "output_path": str(output_path.resolve())})
    return 0


def cmd_run_nfbay(args: argparse.Namespace) -> int:
    config = _load_config(args.config, DEFAULT_NFBAY_CONFIG)

    try:
        result = run_nfbay_session(config=config, event_cb=_emit)
    except Exception as exc:
        _emit({"event": "error", "message": str(exc)})
        return 1

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    _emit({"event": "nfbay_session_complete", "output_path": str(output_path.resolve())})
    return 0


def cmd_run_coherence(args: argparse.Namespace) -> int:
    config = _load_config(args.config, DEFAULT_COHERENCE_CONFIG)

    try:
        result = run_coherence_session(config=config, event_cb=_emit)
    except Exception as exc:
        _emit({"event": "error", "message": str(exc)})
        return 1

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    _emit({"event": "coherence_session_complete", "output_path": str(output_path.resolve())})
    return 0


def cmd_init_config(args: argparse.Namespace) -> int:
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(DEFAULT_CONFIG, f, indent=2)
    print(str(path.resolve()))
    return 0


def cmd_init_nfbay_config(args: argparse.Namespace) -> int:
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(DEFAULT_NFBAY_CONFIG, f, indent=2)
    print(str(path.resolve()))
    return 0


def cmd_init_coherence_config(args: argparse.Namespace) -> int:
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(DEFAULT_COHERENCE_CONFIG, f, indent=2)
    print(str(path.resolve()))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="clinicalq", description="ClinicalQ acquisition and analysis CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    run_parser = sub.add_parser("run", help="Run a guided ClinicalQ acquisition and analysis session")
    run_parser.add_argument("--config", type=str, default=None, help="Path to JSON config")
    run_parser.add_argument("--output", type=str, required=True, help="Where to write result JSON")
    run_parser.set_defaults(func=cmd_run)

    run_nfbay = sub.add_parser("run-nfbay", help="Run a Neurofeedback Bay block protocol session")
    run_nfbay.add_argument("--config", type=str, default=None, help="Path to NF-Bay protocol config JSON")
    run_nfbay.add_argument("--output", type=str, required=True, help="Where to write NF-Bay result JSON")
    run_nfbay.set_defaults(func=cmd_run_nfbay)

    run_coherence = sub.add_parser("run-coherence", help="Run a coherence measurement session")
    run_coherence.add_argument("--config", type=str, default=None, help="Path to coherence config JSON")
    run_coherence.add_argument("--output", type=str, required=True, help="Where to write coherence result JSON")
    run_coherence.set_defaults(func=cmd_run_coherence)

    init_parser = sub.add_parser("init-config", help="Write a starter config file")
    init_parser.add_argument("--output", type=str, required=True, help="Path for starter config JSON")
    init_parser.set_defaults(func=cmd_init_config)

    init_nfbay = sub.add_parser("init-nfbay-config", help="Write a starter NF-Bay protocol config")
    init_nfbay.add_argument("--output", type=str, required=True, help="Path for starter NF-Bay config JSON")
    init_nfbay.set_defaults(func=cmd_init_nfbay_config)

    init_coherence = sub.add_parser("init-coherence-config", help="Write a starter coherence protocol config")
    init_coherence.add_argument("--output", type=str, required=True, help="Path for starter coherence config JSON")
    init_coherence.set_defaults(func=cmd_init_coherence_config)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
