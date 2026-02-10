from __future__ import annotations

import copy
import json
import sys
import time
from dataclasses import asdict
from typing import Any, Dict, Iterable, List

import numpy as np

from clinicalq_backend.analysis import analyze_session, session_result_to_dict
from clinicalq_backend.bands import extract_features
from clinicalq_backend.openbci import create_board
from clinicalq_backend.protocol import CZ_SEQUENCE, EC_SINGLE_SEQUENCE, O1_SEQUENCE, SEQUENTIAL_ORDER, SIMULTANEOUS_EXTRA
from clinicalq_backend.types import EpochCapture, EpochSpec, EventCallback

DEFAULT_CHANNELS = {"Cz": 1, "O1": 2, "Fz": 3, "F3": 4, "F4": 5}
REQUIRED_LOCATIONS = ["O1", "Cz", "Fz", "F3", "F4"]


def _emit(event_cb: EventCallback | None, event: str, **payload: Any) -> None:
    if not event_cb:
        return
    event_cb({"event": event, **payload})


def _resolve_channels(config: Dict[str, Any]) -> Dict[str, int]:
    merged = dict(DEFAULT_CHANNELS)
    merged.update({k: int(v) for k, v in config.get("channels", {}).items()})
    return merged


def _validate_required_channels(channels: Dict[str, int]) -> None:
    missing = [loc for loc in REQUIRED_LOCATIONS if loc not in channels]
    if missing:
        raise RuntimeError(f"Missing required channel mappings: {', '.join(missing)}")

    invalid = [loc for loc in REQUIRED_LOCATIONS if int(channels.get(loc, 0)) <= 0]
    if invalid:
        raise RuntimeError(f"Invalid channel index (must be >= 1) for: {', '.join(invalid)}")

    seen: Dict[int, str] = {}
    duplicates: List[str] = []
    for loc in REQUIRED_LOCATIONS:
        ch = int(channels[loc])
        if ch in seen:
            duplicates.append(f"{seen[ch]} and {loc} both map to channel {ch}")
        else:
            seen[ch] = loc
    if duplicates:
        raise RuntimeError("Duplicate channel mappings are not allowed: " + "; ".join(duplicates))


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
    *,
    fast_mode: bool,
    live_bandpower: bool,
    live_window_seconds: float,
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

    def _emit_tick(seconds_remaining: int) -> None:
        _emit(
            event_cb,
            "epoch_tick",
            sequence=sequence_name,
            index=spec.index,
            label=spec.label,
            seconds_remaining=seconds_remaining,
        )

    epoch_data: Dict[int, np.ndarray]
    needed_channels = {int(channels[loc]) for loc in active_locations}
    buffers: Dict[int, List[np.ndarray]] = {ch: [] for ch in needed_channels}
    target_samples = int(spec.seconds * board.sampling_rate)

    can_stream = live_bandpower and hasattr(board, "flush") and hasattr(board, "read_chunk")
    if can_stream:
        board.flush()
        window_samples = max(1, int(live_window_seconds * board.sampling_rate))

        for sec in range(spec.seconds):
            if not fast_mode:
                time.sleep(1.0)
            seconds_remaining = spec.seconds - sec - 1

            chunk = board.read_chunk(int(board.sampling_rate), spec.label) or {}
            for ch in needed_channels:
                sig = chunk.get(ch)
                if sig is None or np.asarray(sig).size == 0:
                    continue
                buffers[ch].append(np.asarray(sig, dtype=float))

            _emit_tick(seconds_remaining)

            live_features: Dict[str, Dict[str, float]] = {}
            for loc in active_locations:
                ch = int(channels[loc])
                if not buffers.get(ch):
                    continue
                sig = np.concatenate(buffers[ch], axis=0)
                win = sig[-window_samples:] if sig.size > window_samples else sig
                live_features[loc] = extract_features(win, board.sampling_rate)

            if live_features:
                _emit(
                    event_cb,
                    "bandpower",
                    sequence=sequence_name,
                    index=spec.index,
                    label=spec.label,
                    seconds_elapsed=sec + 1,
                    seconds_remaining=seconds_remaining,
                    window_seconds=live_window_seconds,
                    features=live_features,
                )

        epoch_data = {}
        for ch in needed_channels:
            if buffers.get(ch):
                sig = np.concatenate(buffers[ch], axis=0)
            else:
                sig = np.zeros(0, dtype=float)

            if sig.size >= target_samples:
                epoch_data[ch] = sig[:target_samples]
            elif sig.size > 0:
                epoch_data[ch] = np.pad(sig, (0, target_samples - sig.size), mode="edge")
            else:
                epoch_data[ch] = np.zeros(target_samples, dtype=float)

    else:
        # Fallback: block-capture the whole epoch (no live bandpower).
        epoch_data = board.read_epoch(spec.seconds, spec.label, on_tick=_emit_tick)

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


def _wait_for_ready(event_cb: EventCallback | None, next_location: str) -> None:
    _emit(
        event_cb,
        "reposition_waiting",
        next_location=next_location,
        message='Waiting for user readiness. Send {"command":"ready"} on stdin (one JSON line) to continue.',
    )
    while True:
        line = sys.stdin.readline()
        if line == "":  # EOF - avoid deadlock in non-interactive runs.
            _emit(event_cb, "reposition_input_eof", next_location=next_location)
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
            requested = cmd.get("next_location")
            if requested in (None, "", next_location):
                return


def run_session(config: Dict[str, Any], event_cb: EventCallback | None = None) -> Dict[str, Any]:
    mode = str(config.get("mode", "sequential")).lower()
    epoch_seconds = int(config.get("epoch_seconds", 15))
    reposition_seconds = int(config.get("reposition_seconds", 20))
    fast_mode = bool(config.get("fast_mode", False))
    reposition_mode = str(config.get("reposition_mode", "timer")).lower()
    live_bandpower = bool(config.get("live_bandpower", True))
    live_window_seconds = float(config.get("live_window_seconds", 2.0))
    channels = _resolve_channels(config)
    _validate_required_channels(channels)

    if reposition_mode not in {"timer", "manual"}:
        raise RuntimeError(f"Unsupported reposition_mode: {reposition_mode}. Use 'timer' or 'manual'.")

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

            active_locations = ["Cz", "O1", "Fz", "F3", "F4"]
            _emit(event_cb, "sequence_start", sequence="MASTER", locations=active_locations, total_epochs=len(sequence))

            for spec in sequence:
                captures.append(
                    _capture_epoch(
                        board,
                        channels,
                        "MASTER",
                        spec,
                        active_locations,
                        event_cb,
                        fast_mode=fast_mode,
                        live_bandpower=live_bandpower,
                        live_window_seconds=live_window_seconds,
                    )
                )

            _emit(event_cb, "sequence_complete", sequence="MASTER")

        elif mode == "sequential":
            order = config.get("sequential_order") or list(SEQUENTIAL_ORDER)
            order = [str(loc) for loc in order]
            if len(order) != len(REQUIRED_LOCATIONS) or set(order) != set(REQUIRED_LOCATIONS):
                raise RuntimeError(
                    "Sequential mode must record all required sites exactly once: " + ", ".join(REQUIRED_LOCATIONS)
                )

            for idx, location in enumerate(order):
                sequence = _apply_epoch_seconds(_resolve_sequence(location), epoch_seconds)

                if idx > 0:
                    if reposition_mode == "manual":
                        _emit(
                            event_cb,
                            "reposition_start",
                            next_location=location,
                            mode="manual",
                            seconds=None,
                            message=f"Move active electrode to {location}, then press Ready in the app.",
                        )
                        _wait_for_ready(event_cb, location)
                        _emit(event_cb, "reposition_complete", next_location=location, mode="manual")
                    else:
                        seconds = 0 if fast_mode else reposition_seconds
                        _emit(
                            event_cb,
                            "reposition_start",
                            next_location=location,
                            mode="timer",
                            seconds=seconds,
                            message=f"Move active electrode to {location}.",
                        )
                        _countdown(
                            event_cb,
                            event="reposition_tick",
                            seconds=seconds,
                            next_location=location,
                        )
                        _emit(event_cb, "reposition_complete", next_location=location, mode="timer")

                _emit(event_cb, "sequence_start", sequence=location, locations=[location], total_epochs=len(sequence))
                for spec in sequence:
                    captures.append(
                        _capture_epoch(
                            board,
                            channels,
                            location,
                            spec,
                            [location],
                            event_cb,
                            fast_mode=fast_mode,
                            live_bandpower=live_bandpower,
                            live_window_seconds=live_window_seconds,
                        )
                    )
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
