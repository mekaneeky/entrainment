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
from clinicalq_backend.filters import eeg_filter_config
from clinicalq_backend.openbci import create_board
from clinicalq_backend.protocol import (
    CZ_SEQUENCE,
    EC_SINGLE_SEQUENCE,
    O1_SEQUENCE,
    SEQUENTIAL_ORDER,
    SIMULTANEOUS_EXTRA,
    SOUND_PROBE_LABELS,
    SOUND_PROBE_SEQUENCE_RULES,
)
from clinicalq_backend.raw_recording import RawSessionRecorder
from clinicalq_backend.types import EpochCapture, EpochSpec, EventCallback

DEFAULT_CHANNELS = {"Cz": 1, "O1": 2, "Fz": 3, "F3": 4, "F4": 5}
REQUIRED_LOCATIONS = ["O1", "Cz", "Fz", "F3", "F4"]
SUPPORTED_SOUND_PROBES = {"sub_alpha", "sub_beta", "sleep_support", "sweep"}


def _emit(event_cb: EventCallback | None, event: str, **payload: Any) -> None:
    if not event_cb:
        return
    event_cb({"event": event, **payload})


def _normalize_location(value: Any) -> str:
    text = str(value or "").strip()
    lookup = {loc.upper(): loc for loc in REQUIRED_LOCATIONS}
    return lookup.get(text.upper(), text)


def _resolve_selected_locations(config: Dict[str, Any]) -> List[str]:
    raw = config.get("selected_locations") or REQUIRED_LOCATIONS
    selected: List[str] = []
    seen = set()
    for item in raw:
        location = _normalize_location(item)
        if location not in REQUIRED_LOCATIONS or location in seen:
            continue
        selected.append(location)
        seen.add(location)

    if not selected:
        raise RuntimeError("Select at least one ClinicalQ location.")
    return selected


def _resolve_sound_probes(config: Dict[str, Any]) -> set[str]:
    raw = config.get("sound_probes") or []
    if isinstance(raw, dict):
        raw = [key for key, enabled in raw.items() if enabled]
    probes = {str(item).strip().lower().replace("-", "_") for item in raw}
    resolved = {probe for probe in probes if probe in SUPPORTED_SOUND_PROBES}
    if "sweep" in resolved:
        resolved.add("sweep_post")
    return resolved


def _resolve_channels(config: Dict[str, Any]) -> Dict[str, int]:
    merged = dict(DEFAULT_CHANNELS)
    merged.update({k: int(v) for k, v in config.get("channels", {}).items()})
    return merged


def _validate_required_channels(channels: Dict[str, int], selected_locations: List[str]) -> None:
    missing = [loc for loc in selected_locations if loc not in channels]
    if missing:
        raise RuntimeError(f"Missing required channel mappings: {', '.join(missing)}")

    invalid = [loc for loc in selected_locations if int(channels.get(loc, 0)) <= 0]
    if invalid:
        raise RuntimeError(f"Invalid channel index (must be >= 1) for: {', '.join(invalid)}")

    seen: Dict[int, str] = {}
    duplicates: List[str] = []
    for loc in selected_locations:
        ch = int(channels[loc])
        if ch in seen:
            duplicates.append(f"{seen[ch]} and {loc} both map to channel {ch}")
        else:
            seen[ch] = loc
    if duplicates:
        raise RuntimeError("Duplicate channel mappings are not allowed: " + "; ".join(duplicates))


def _append_sound_probe_epochs(sequence: List[EpochSpec], location: str, sound_probes: set[str]) -> List[EpochSpec]:
    next_index = max((int(spec.index) for spec in sequence), default=0) + 1
    for probe, instruction in SOUND_PROBE_SEQUENCE_RULES.get(location, []):
        if probe not in sound_probes:
            continue
        sequence.append(EpochSpec(next_index, SOUND_PROBE_LABELS[probe], instruction, 15))
        next_index += 1
    return sequence


def _simultaneous_sound_probe_epochs(selected_locations: List[str], sound_probes: set[str]) -> List[EpochSpec]:
    rules = [
        ("sub_alpha", "OMNI", "Cz"),
        ("sub_beta", "SUB_BETA", "O1"),
        ("sleep_support", "SLEEP_SUPPORT", "O1"),
        ("sweep", "SWEEP", "F3"),
        ("sweep_post", "SWEEP_POST", "F3"),
    ]
    instructions = {
        probe: instruction
        for rule_list in SOUND_PROBE_SEQUENCE_RULES.values()
        for probe, instruction in rule_list
    }
    out: List[EpochSpec] = []
    next_index = 12
    selected = set(selected_locations)
    for probe, label, required_location in rules:
        if probe not in sound_probes or required_location not in selected:
            continue
        out.append(EpochSpec(next_index, label, instructions[probe], 15))
        next_index += 1
    return out


def _resolve_sequence(location: str, sound_probes: set[str]) -> List[EpochSpec]:
    if location == "Cz":
        return _append_sound_probe_epochs(copy.deepcopy(CZ_SEQUENCE), location, sound_probes)
    if location == "O1":
        return _append_sound_probe_epochs(copy.deepcopy(O1_SEQUENCE), location, sound_probes)
    if location in {"Fz", "F3", "F4"}:
        return _append_sound_probe_epochs(copy.deepcopy(EC_SINGLE_SEQUENCE), location, sound_probes)
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
    next_spec: EpochSpec | None,
    raw_recorder: RawSessionRecorder | None,
    filters: Dict[str, object],
) -> EpochCapture:
    next_epoch = None
    if next_spec is not None:
        next_epoch = {
            "sequence": sequence_name,
            "index": int(next_spec.index),
            "label": str(next_spec.label),
            "instruction": str(next_spec.instruction),
            "seconds": int(next_spec.seconds),
        }

    _emit(
        event_cb,
        "epoch_start",
        sequence=sequence_name,
        index=spec.index,
        label=spec.label,
        instruction=spec.instruction,
        seconds=spec.seconds,
        locations=active_locations,
        next_epoch=next_epoch,
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
                live_features[loc] = extract_features(win, board.sampling_rate, filters)

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
    raw_signals: Dict[str, np.ndarray] = {}
    for location in active_locations:
        ch = channels[location]
        if ch not in epoch_data:
            continue
        features[location] = extract_features(epoch_data[ch], board.sampling_rate, filters)
        raw_signals[location] = np.asarray(epoch_data[ch], dtype=float)

    if raw_recorder is not None and raw_signals:
        raw_recorder.record_epoch(
            sequence=sequence_name,
            index=spec.index,
            label=spec.label,
            instruction=spec.instruction,
            seconds=spec.seconds,
            sampling_rate=board.sampling_rate,
            signals=raw_signals,
        )

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
    selected_locations = _resolve_selected_locations(config)
    sound_probes = _resolve_sound_probes(config)
    channels = _resolve_channels(config)
    filters = eeg_filter_config(config)
    _validate_required_channels(channels, selected_locations)

    if reposition_mode not in {"timer", "manual"}:
        raise RuntimeError(f"Unsupported reposition_mode: {reposition_mode}. Use 'timer' or 'manual'.")

    board = create_board(config)
    raw_recorder = RawSessionRecorder.from_config(config, analysis="clinicalq")
    _emit(event_cb, "session_start", mode=mode)

    captures: List[EpochCapture] = []

    try:
        board.start()
        _emit(event_cb, "board_ready", sampling_rate=board.sampling_rate, eeg_channels=board.eeg_channels)

        if mode == "simultaneous":
            sequence = _apply_epoch_seconds(CZ_SEQUENCE, epoch_seconds)
            if bool(config.get("include_frontal_baseline", True)) and any(
                loc in selected_locations for loc in ("Fz", "F3", "F4")
            ):
                sequence.extend(_apply_epoch_seconds(SIMULTANEOUS_EXTRA, epoch_seconds))
            sequence.extend(_apply_epoch_seconds(_simultaneous_sound_probe_epochs(selected_locations, sound_probes), epoch_seconds))

            active_locations = list(selected_locations)
            _emit(event_cb, "sequence_start", sequence="MASTER", locations=active_locations, total_epochs=len(sequence))

            for i, spec in enumerate(sequence):
                next_spec = sequence[i + 1] if i + 1 < len(sequence) else None
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
                        next_spec=next_spec,
                        raw_recorder=raw_recorder,
                        filters=filters,
                    )
                )

            _emit(event_cb, "sequence_complete", sequence="MASTER")

        elif mode == "sequential":
            order = config.get("sequential_order") or list(SEQUENTIAL_ORDER)
            order = [_normalize_location(loc) for loc in order]
            order = [loc for loc in order if loc in selected_locations]
            if set(order) != set(selected_locations) or len(order) != len(selected_locations):
                raise RuntimeError(
                    "Sequential mode must record every selected site exactly once: " + ", ".join(selected_locations)
                )

            for idx, location in enumerate(order):
                sequence = _apply_epoch_seconds(_resolve_sequence(location, sound_probes), epoch_seconds)

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
                for j, spec in enumerate(sequence):
                    next_spec = sequence[j + 1] if j + 1 < len(sequence) else None
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
                            next_spec=next_spec,
                            raw_recorder=raw_recorder,
                            filters=filters,
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
        "selected_locations": selected_locations,
        "sound_probes": sorted(probe for probe in sound_probes if probe != "sweep_post"),
        "filters": filters,
        "epochs": [asdict(cap) for cap in captures],
    }

    session = analyze_session(session_data)
    result = session_result_to_dict(session)
    result["epoch_features"] = session_data["epochs"]
    raw_recording = raw_recorder.close() if raw_recorder is not None else None
    if raw_recording:
        result.setdefault("metadata", {})["raw_recording"] = raw_recording
    if config.get("profile"):
        result.setdefault("metadata", {})["profile"] = config.get("profile")
    if config.get("tags"):
        result.setdefault("metadata", {})["tags"] = config.get("tags")
    if config.get("notes"):
        result.setdefault("metadata", {})["notes"] = config.get("notes")

    _emit(
        event_cb,
        "analysis_complete",
        metrics=len(result.get("metrics", [])),
        out_of_range=result.get("summary", {}).get("out_of_range", 0),
    )

    return result
