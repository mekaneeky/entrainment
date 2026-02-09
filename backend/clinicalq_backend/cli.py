from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict

from clinicalq_backend.runner import run_session

DEFAULT_CONFIG: Dict[str, Any] = {
    "mode": "sequential",
    "epoch_seconds": 15,
    "reposition_seconds": 20,
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


def _load_config(path: str | None) -> Dict[str, Any]:
    if not path:
        return dict(DEFAULT_CONFIG)
    cfg_path = Path(path)
    with cfg_path.open("r", encoding="utf-8-sig") as f:
        loaded = json.load(f)

    merged = dict(DEFAULT_CONFIG)
    merged.update({k: v for k, v in loaded.items() if k not in {"board", "channels"}})
    merged["board"] = dict(DEFAULT_CONFIG["board"])
    merged["board"].update(loaded.get("board", {}))
    merged["channels"] = dict(DEFAULT_CONFIG["channels"])
    merged["channels"].update(loaded.get("channels", {}))
    return merged


def cmd_run(args: argparse.Namespace) -> int:
    config = _load_config(args.config)

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


def cmd_init_config(args: argparse.Namespace) -> int:
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(DEFAULT_CONFIG, f, indent=2)
    print(str(path.resolve()))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="clinicalq", description="ClinicalQ acquisition and analysis CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    run_parser = sub.add_parser("run", help="Run a guided ClinicalQ acquisition and analysis session")
    run_parser.add_argument("--config", type=str, default=None, help="Path to JSON config")
    run_parser.add_argument("--output", type=str, required=True, help="Where to write result JSON")
    run_parser.set_defaults(func=cmd_run)

    init_parser = sub.add_parser("init-config", help="Write a starter config file")
    init_parser.add_argument("--output", type=str, required=True, help="Path for starter config JSON")
    init_parser.set_defaults(func=cmd_init_config)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())

