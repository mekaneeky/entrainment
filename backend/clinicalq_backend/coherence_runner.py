from __future__ import annotations

import json
import sys
import time
from typing import Any, Dict, List, Tuple

import numpy as np

from clinicalq_backend.coherence import DEFAULT_PAIRS, analyze_coherence_session, session_result_to_dict
from clinicalq_backend.openbci import create_board
from clinicalq_backend.types import EpochSpec, EventCallback

DEFAULT_CHANNELS = {"Cz": 1, "O1": 2, "Fz": 3, "F3": 4, "F4": 5}
MAX_LOCATIONS = 20
COHERENCE_SEQUENCE = [
    EpochSpec(1, "EC", "Eyes CLOSED. Stay still, jaw relaxed, minimize swallowing/blinking.", 30),
]

DEFAULT_COHERENCE_CONFIG: Dict[str, Any] = {
    "mode": "simultaneous",
    "epoch_seconds": 30,
    "reposition_seconds": 20,
    "reposition_mode": "manual",
    "norms_dataset": "ds003775",
    "zscore_mode": "global",
    "subject_age": None,
    "sampling_rate": 250,
    "fast_mode": False,
    "board": {
        "board_id": "cyton",
        "serial_port": "COM3",
        "use_synthetic": True,
        "available_channels": [1, 2, 3, 4, 5, 6, 7, 8],
        "seed": 42,
    },
    "channels": {"Cz": 1, "O1": 2, "Fz": 3, "F3": 4, "F4": 5},
    "pairs": [["F3", "F4"], ["Fz", "Cz"], ["Cz", "O1"], ["F3", "Cz"], ["F4", "Cz"]],
}


def _emit(event_cb: EventCallback | None, event: str, **payload: Any) -> None:
    if not event_cb:
        return
    event_cb({"event": event, **payload})


def _resolve_channels(config: Dict[str, Any]) -> Dict[str, int]:
    merged = dict(DEFAULT_CHANNELS)
    merged.update({k: int(v) for k, v in config.get("channels", {}).items()})
    return merged


def _validate_channels_for_pairs(channels: Dict[str, int], pairs: List[Tuple[str, str]]) -> None:
    locations = sorted({loc for pair in pairs for loc in pair})
    missing = [loc for loc in locations if loc not in channels]
    if missing:
        raise RuntimeError(f"Missing channel mappings for coherence locations: {', '.join(missing)}")

    invalid = [loc for loc in locations if int(channels.get(loc, 0)) <= 0]
    if invalid:
        raise RuntimeError(f"Invalid channel index (must be >= 1) for: {', '.join(invalid)}")

    if len(locations) > MAX_LOCATIONS:
        raise RuntimeError(f"Too many coherence locations ({len(locations)}). Max supported is {MAX_LOCATIONS}.")


def _resolve_pairs(config: Dict[str, Any]) -> List[Tuple[str, str]]:
    raw = config.get("pairs") or [[a, b] for a, b in DEFAULT_PAIRS]
    out: List[Tuple[str, str]] = []
    for pair in raw:
        if not isinstance(pair, (list, tuple)) or len(pair) != 2:
            raise RuntimeError("Each coherence pair must be a 2-item list, e.g. ['F3','F4']")
        left = str(pair[0]).strip()
        right = str(pair[1]).strip()
        if left == right:
            raise RuntimeError(f"Invalid pair {pair}: locations must differ")
        out.append((left, right))
    if not out:
        raise RuntimeError("No coherence pairs configured.")
    return out


def _capture_epoch(
    board,
    channels: Dict[str, int],
    sequence_name: str,
    spec: EpochSpec,
    active_locations: List[str],
    event_cb: EventCallback | None,
) -> Dict[str, Any]:
    _emit(
        event_cb,
        "epoch_start",
        sequence=sequence_name,
        index=spec.index,
        label=spec.label,
        instruction=spec.instruction,
        seconds=spec.seconds,
        locations=active_locations,
    )

    def _emit_tick(seconds_remaining: int) -> None:
        _emit(
            event_cb,
            "epoch_tick",
            sequence=sequence_name,
            index=spec.index,
            label=spec.label,
            seconds_remaining=seconds_remaining,
        )

    epoch_data: Dict[int, np.ndarray] = board.read_epoch(spec.seconds, spec.label, on_tick=_emit_tick)

    signals: Dict[str, List[float]] = {}
    for location in active_locations:
        ch = channels[location]
        arr = epoch_data.get(ch)
        if arr is None:
            continue
        signals[location] = np.asarray(arr, dtype=float).tolist()

    _emit(
        event_cb,
        "epoch_complete",
        sequence=sequence_name,
        index=spec.index,
        label=spec.label,
        captured_locations=sorted(signals.keys()),
    )

    return {
        "sequence": sequence_name,
        "index": int(spec.index),
        "label": str(spec.label),
        "instruction": str(spec.instruction),
        "seconds": int(spec.seconds),
        "features": {},
        "signals": signals,
    }


def _countdown(event_cb: EventCallback | None, event: str, seconds: int, **payload: Any) -> None:
    if seconds <= 0:
        return
    for remaining in range(seconds, 0, -1):
        _emit(event_cb, event, seconds_remaining=remaining, **payload)
        time.sleep(1.0)


def _wait_for_ready(event_cb: EventCallback | None, next_pair: str) -> None:
    _emit(
        event_cb,
        "reposition_waiting",
        next_location=next_pair,
        message='Waiting for user readiness. Send {"command":"ready"} on stdin (one JSON line) to continue.',
    )
    while True:
        line = sys.stdin.readline()
        if line == "":
            _emit(event_cb, "reposition_input_eof", next_location=next_pair)
            return
        text = line.strip()
        if not text:
            continue

        lowered = text.lower()
        if lowered in {"ready", "r", "ok", "next"}:
            return

        try:
            cmd = json.loads(text)
        except json.JSONDecodeError:
            continue

        if isinstance(cmd, dict) and cmd.get("command") == "ready":
            return


def run_coherence_session(config: Dict[str, Any], event_cb: EventCallback | None = None) -> Dict[str, Any]:
    mode = str(config.get("mode", "simultaneous")).lower()
    epoch_seconds = int(config.get("epoch_seconds", 30))
    reposition_seconds = int(config.get("reposition_seconds", 20))
    reposition_mode = str(config.get("reposition_mode", "manual")).lower()

    pairs = _resolve_pairs(config)
    channels = _resolve_channels(config)
    _validate_channels_for_pairs(channels, pairs)

    if reposition_mode not in {"timer", "manual"}:
        raise RuntimeError(f"Unsupported reposition_mode: {reposition_mode}. Use 'timer' or 'manual'.")

    board = create_board(config)
    _emit(event_cb, "session_start", mode=mode, analysis="coherence")

    captures: List[Dict[str, Any]] = []

    try:
        board.start()
        _emit(event_cb, "board_ready", sampling_rate=board.sampling_rate, eeg_channels=board.eeg_channels)

        if mode == "simultaneous":
            sequence = [
                EpochSpec(index=spec.index, label=spec.label, instruction=spec.instruction, seconds=epoch_seconds)
                for spec in COHERENCE_SEQUENCE
            ]
            active = sorted({loc for pair in pairs for loc in pair})
            _emit(event_cb, "sequence_start", sequence="MASTER", locations=active, total_epochs=len(sequence))

            for spec in sequence:
                captures.append(_capture_epoch(board, channels, "MASTER", spec, active, event_cb))

            _emit(event_cb, "sequence_complete", sequence="MASTER")

        elif mode == "sequential":
            for idx, pair in enumerate(pairs):
                left, right = pair
                pair_name = f"{left}/{right}"

                if idx > 0:
                    if reposition_mode == "manual":
                        _emit(
                            event_cb,
                            "reposition_start",
                            next_location=pair_name,
                            mode="manual",
                            seconds=None,
                            message=f"Move electrodes to {pair_name}, then press Ready in the app.",
                        )
                        _wait_for_ready(event_cb, pair_name)
                        _emit(event_cb, "reposition_complete", next_location=pair_name, mode="manual")
                    else:
                        seconds = reposition_seconds
                        _emit(
                            event_cb,
                            "reposition_start",
                            next_location=pair_name,
                            mode="timer",
                            seconds=seconds,
                            message=f"Move electrodes to {pair_name}.",
                        )
                        _countdown(event_cb, event="reposition_tick", seconds=seconds, next_location=pair_name)
                        _emit(event_cb, "reposition_complete", next_location=pair_name, mode="timer")

                sequence = [
                    EpochSpec(index=spec.index, label=spec.label, instruction=spec.instruction, seconds=epoch_seconds)
                    for spec in COHERENCE_SEQUENCE
                ]
                active = [left, right]
                _emit(event_cb, "sequence_start", sequence=pair_name, locations=active, total_epochs=len(sequence))
                for spec in sequence:
                    captures.append(_capture_epoch(board, channels, pair_name, spec, active, event_cb))
                _emit(event_cb, "sequence_complete", sequence=pair_name)

        else:
            raise RuntimeError(f"Unsupported mode: {mode}")

    finally:
        board.stop()
        _emit(event_cb, "board_stopped")

    session_data = {
        "mode": mode,
        "sampling_rate": board.sampling_rate,
        "epoch_seconds": epoch_seconds,
        "channels": channels,
        "pairs": [[a, b] for a, b in pairs],
        "zscore_mode": str(config.get("zscore_mode", "global")),
        "subject_age": config.get("subject_age"),
        "epochs": captures,
    }

    session = analyze_coherence_session(
        session_data,
        norms_path=config.get("norms_path"),
        norms_dataset=config.get("norms_dataset"),
    )
    result = session_result_to_dict(session)
    result["epoch_features"] = session_data["epochs"]

    _emit(
        event_cb,
        "analysis_complete",
        metrics=len(result.get("metrics", [])),
        out_of_range=result.get("summary", {}).get("out_of_range", 0),
    )

    return result
