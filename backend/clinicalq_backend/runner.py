from __future__ import annotations

import copy
import time
from dataclasses import asdict
from typing import Any, Dict, Iterable, List

from clinicalq_backend.analysis import analyze_session, session_result_to_dict
from clinicalq_backend.bands import extract_features
from clinicalq_backend.openbci import create_board
from clinicalq_backend.protocol import CZ_SEQUENCE, EC_SINGLE_SEQUENCE, O1_SEQUENCE, SEQUENTIAL_ORDER, SIMULTANEOUS_EXTRA
from clinicalq_backend.types import EpochCapture, EpochSpec, EventCallback

DEFAULT_CHANNELS = {"Cz": 1, "O1": 2, "Fz": 3, "F3": 4, "F4": 5}


def _emit(event_cb: EventCallback | None, event: str, **payload: Any) -> None:
    if not event_cb:
        return
    event_cb({"event": event, **payload})


def _resolve_channels(config: Dict[str, Any]) -> Dict[str, int]:
    merged = dict(DEFAULT_CHANNELS)
    merged.update({k: int(v) for k, v in config.get("channels", {}).items()})
    return merged


def _resolve_sequence(location: str) -> List[EpochSpec]:
    if location == "Cz":
        return copy.deepcopy(CZ_SEQUENCE)
    if location == "O1":
        return copy.deepcopy(O1_SEQUENCE)
    if location in {"Fz", "F3", "F4"}:
        return copy.deepcopy(EC_SINGLE_SEQUENCE)
    raise ValueError(f"Unsupported location: {location}")


def _apply_epoch_seconds(sequence: Iterable[EpochSpec], epoch_seconds: int) -> List[EpochSpec]:
    return [
        EpochSpec(index=spec.index, label=spec.label, instruction=spec.instruction, seconds=epoch_seconds)
        for spec in sequence
    ]


def _capture_epoch(
    board,
    channels: Dict[str, int],
    sequence_name: str,
    spec: EpochSpec,
    active_locations: List[str],
    event_cb: EventCallback | None,
) -> EpochCapture:
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

    def _on_tick(seconds_remaining: int) -> None:
        _emit(
            event_cb,
            "epoch_tick",
            sequence=sequence_name,
            index=spec.index,
            label=spec.label,
            seconds_remaining=seconds_remaining,
        )

    epoch_data = board.read_epoch(spec.seconds, spec.label, on_tick=_on_tick)

    features: Dict[str, Dict[str, float]] = {}
    for location in active_locations:
        ch = channels[location]
        if ch not in epoch_data:
            continue
        features[location] = extract_features(epoch_data[ch], board.sampling_rate)

    _emit(
        event_cb,
        "epoch_complete",
        sequence=sequence_name,
        index=spec.index,
        label=spec.label,
        captured_locations=sorted(features.keys()),
    )

    return EpochCapture(
        sequence=sequence_name,
        index=spec.index,
        label=spec.label,
        instruction=spec.instruction,
        seconds=spec.seconds,
        features=features,
    )


def _countdown(event_cb: EventCallback | None, event: str, seconds: int, **payload: Any) -> None:
    if seconds <= 0:
        return
    for remaining in range(seconds, 0, -1):
        _emit(event_cb, event, seconds_remaining=remaining, **payload)
        time.sleep(1.0)


def run_session(config: Dict[str, Any], event_cb: EventCallback | None = None) -> Dict[str, Any]:
    mode = str(config.get("mode", "sequential")).lower()
    epoch_seconds = int(config.get("epoch_seconds", 15))
    reposition_seconds = int(config.get("reposition_seconds", 20))
    fast_mode = bool(config.get("fast_mode", False))
    channels = _resolve_channels(config)

    board = create_board(config)
    _emit(event_cb, "session_start", mode=mode)

    captures: List[EpochCapture] = []

    try:
        board.start()
        _emit(event_cb, "board_ready", sampling_rate=board.sampling_rate, eeg_channels=board.eeg_channels)

        if mode == "simultaneous":
            sequence = _apply_epoch_seconds(CZ_SEQUENCE, epoch_seconds)
            if bool(config.get("include_frontal_baseline", True)):
                sequence.extend(_apply_epoch_seconds(SIMULTANEOUS_EXTRA, epoch_seconds))

            active_locations = [loc for loc in ["Cz", "O1", "Fz", "F3", "F4"] if loc in channels]
            _emit(event_cb, "sequence_start", sequence="MASTER", locations=active_locations, total_epochs=len(sequence))

            for spec in sequence:
                captures.append(_capture_epoch(board, channels, "MASTER", spec, active_locations, event_cb))

            _emit(event_cb, "sequence_complete", sequence="MASTER")

        elif mode == "sequential":
            order = config.get("sequential_order") or list(SEQUENTIAL_ORDER)
            order = [str(loc) for loc in order if str(loc) in channels]
            if not order:
                raise RuntimeError("No valid locations configured for sequential mode.")

            for idx, location in enumerate(order):
                sequence = _apply_epoch_seconds(_resolve_sequence(location), epoch_seconds)

                if idx > 0:
                    _emit(
                        event_cb,
                        "reposition_start",
                        next_location=location,
                        seconds=0 if fast_mode else reposition_seconds,
                        message=f"Move active electrode to {location}.",
                    )
                    _countdown(
                        event_cb,
                        event="reposition_tick",
                        seconds=0 if fast_mode else reposition_seconds,
                        next_location=location,
                    )
                    _emit(event_cb, "reposition_complete", next_location=location)

                _emit(event_cb, "sequence_start", sequence=location, locations=[location], total_epochs=len(sequence))
                for spec in sequence:
                    captures.append(_capture_epoch(board, channels, location, spec, [location], event_cb))
                _emit(event_cb, "sequence_complete", sequence=location)

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
        "epochs": [asdict(cap) for cap in captures],
    }

    session = analyze_session(session_data)
    result = session_result_to_dict(session)
    result["epoch_features"] = session_data["epochs"]

    _emit(
        event_cb,
        "analysis_complete",
        metrics=len(result.get("metrics", [])),
        out_of_range=result.get("summary", {}).get("out_of_range", 0),
    )

    return result

