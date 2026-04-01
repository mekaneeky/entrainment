from __future__ import annotations

import csv
import math
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence, Tuple

import numpy as np

from clinicalq_backend.types import EventCallback


def _emit(event_cb: EventCallback | None, event: str, **payload: Any) -> None:
    if not event_cb:
        return
    event_cb({"event": event, **payload})


def _as_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(out):
        return None
    return out


def _coerce_channel_ref(value: Any) -> int | str | None:
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            return None
        if float(value).is_integer():
            return int(value)
        return str(value)

    text = str(value).strip()
    if not text:
        return None
    try:
        numeric = float(text)
    except ValueError:
        return text
    if math.isfinite(numeric) and numeric.is_integer():
        return int(numeric)
    return text


def normalize_channel_map(raw_channels: Dict[str, Any] | None) -> Dict[str, int | str]:
    out: Dict[str, int | str] = {}
    for location, raw_value in (raw_channels or {}).items():
        ref = _coerce_channel_ref(raw_value)
        if ref is None:
            continue
        loc = str(location).strip()
        if loc:
            out[loc] = ref
    return out


def _normalize_range_item(item: Any) -> tuple[float, float] | None:
    if isinstance(item, dict):
        start = _as_float(item.get("start"))
        end = _as_float(item.get("end"))
    elif isinstance(item, (list, tuple)) and len(item) == 2:
        start = _as_float(item[0])
        end = _as_float(item[1])
    elif isinstance(item, str):
        token = item.strip()
        if not token:
            return None
        parts = token.replace(",", "-").split("-", 1)
        if len(parts) != 2:
            return None
        start = _as_float(parts[0])
        end = _as_float(parts[1])
    else:
        return None

    if start is None or end is None:
        return None
    low = min(start, end)
    high = max(start, end)
    if math.isclose(low, high):
        return None
    return low, high


def normalize_ranges(value: Any) -> list[tuple[float, float]]:
    if value in (None, "", []):
        return []
    items: list[Any]
    if isinstance(value, str):
        items = [line for line in value.replace(";", "\n").splitlines() if line.strip()]
    elif isinstance(value, (list, tuple)):
        items = list(value)
    else:
        items = [value]

    parsed = []
    for item in items:
        rng = _normalize_range_item(item)
        if rng is not None:
            parsed.append(rng)

    if not parsed:
        return []

    parsed.sort(key=lambda item: (item[0], item[1]))
    merged: list[tuple[float, float]] = []
    for start, end in parsed:
        if not merged:
            merged.append((start, end))
            continue
        prev_start, prev_end = merged[-1]
        if start <= prev_end:
            merged[-1] = (prev_start, max(prev_end, end))
        else:
            merged.append((start, end))
    return merged


def _clip_ranges(ranges: Sequence[tuple[float, float]], duration_seconds: float) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for start, end in ranges:
        clipped_start = max(0.0, float(start))
        clipped_end = min(float(duration_seconds), float(end))
        if clipped_end > clipped_start:
            out.append((clipped_start, clipped_end))
    return out


def _subtract_ranges(
    base_ranges: Sequence[tuple[float, float]],
    exclude_ranges: Sequence[tuple[float, float]],
) -> list[tuple[float, float]]:
    remaining = list(base_ranges)
    for ex_start, ex_end in exclude_ranges:
        updated: list[tuple[float, float]] = []
        for seg_start, seg_end in remaining:
            if ex_end <= seg_start or ex_start >= seg_end:
                updated.append((seg_start, seg_end))
                continue
            if ex_start > seg_start:
                updated.append((seg_start, min(ex_start, seg_end)))
            if ex_end < seg_end:
                updated.append((max(ex_end, seg_start), seg_end))
        remaining = updated
    return [(start, end) for start, end in remaining if end > start]


def _chunk_ranges(
    ranges: Sequence[tuple[float, float]],
    *,
    epoch_seconds: float,
    minimum_segment_seconds: float,
) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    chunk_size = float(epoch_seconds) if epoch_seconds and epoch_seconds > 0 else 0.0
    min_size = max(0.25, float(minimum_segment_seconds))

    for start, end in ranges:
        length = end - start
        if length < min_size:
            continue

        if chunk_size <= 0 or length <= chunk_size:
            out.append((start, end))
            continue

        cursor = start
        while cursor < end:
            nxt = min(end, cursor + chunk_size)
            if (nxt - cursor) >= min_size:
                out.append((cursor, nxt))
            cursor = nxt
    return out


def _first_non_empty_row(rows: list[list[str]]) -> list[str] | None:
    for row in rows:
        if any(str(cell).strip() for cell in row):
            return row
    return None


def _looks_like_header(row: Sequence[str]) -> bool:
    has_text = False
    for cell in row:
        text = str(cell).strip()
        if not text:
            continue
        try:
            float(text)
        except ValueError:
            has_text = True
            break
    return has_text


def _read_csv_recording(
    path: Path,
    *,
    delimiter: str | None,
    has_header: bool | None,
    skip_columns: int,
    sampling_rate: float | None,
) -> tuple[int, list[str], np.ndarray]:
    if sampling_rate is None or sampling_rate <= 0:
        raise RuntimeError(f"CSV/TSV recordings require a sampling rate. Missing for: {path}")

    actual_delimiter = delimiter
    if not actual_delimiter:
        actual_delimiter = "\t" if path.suffix.lower() in {".tsv", ".txt"} else ","

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=actual_delimiter)
        rows = [row for row in reader if row]

    first_row = _first_non_empty_row(rows)
    if first_row is None:
        raise RuntimeError(f"Recording file is empty: {path}")

    header_present = bool(has_header) if has_header is not None else _looks_like_header(first_row)
    data_rows = rows[1:] if header_present else rows
    labels = list(first_row) if header_present else [f"Ch{i + 1}" for i in range(len(first_row))]
    labels = [str(label).strip() or f"Ch{i + 1}" for i, label in enumerate(labels)]

    numeric_rows: list[list[float]] = []
    expected_cols = len(labels)
    for row in data_rows:
        if not any(str(cell).strip() for cell in row):
            continue
        if len(row) != expected_cols:
            raise RuntimeError(f"Inconsistent column count in {path}: expected {expected_cols}, got {len(row)}")
        try:
            numeric_rows.append([float(str(cell).strip()) for cell in row])
        except ValueError as exc:
            raise RuntimeError(f"Non-numeric CSV value in {path}: {exc}") from exc

    if not numeric_rows:
        raise RuntimeError(f"No samples found in recording file: {path}")

    if skip_columns > 0:
        labels = labels[skip_columns:]
        numeric_rows = [row[skip_columns:] for row in numeric_rows]
    if not labels:
        raise RuntimeError(f"No columns remain after skipping {skip_columns} columns in {path}")

    data = np.asarray(numeric_rows, dtype=float).T
    return int(round(float(sampling_rate))), labels, data


def _read_mne_recording(
    path: Path,
    *,
    target_sampling_rate: int | None,
    preprocess: Dict[str, Any],
) -> tuple[int, list[str], np.ndarray]:
    try:
        import mne
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "Reading EDF/FIF recordings requires MNE. Install with: pip install 'clinicalq-backend[offline]'"
        ) from exc

    lower_name = path.name.lower()
    if lower_name.endswith(".edf"):
        raw = mne.io.read_raw_edf(path, preload=True, verbose="ERROR")
    elif lower_name.endswith(".fif") or lower_name.endswith(".fif.gz"):
        raw = mne.io.read_raw_fif(path, preload=True, verbose="ERROR")
    else:
        raw = mne.io.read_raw(path, preload=True, verbose="ERROR")

    raw.pick_types(eeg=True, exclude=[])

    notch_hz = _as_float(preprocess.get("notch_hz"))
    l_freq = _as_float(preprocess.get("l_freq"))
    h_freq = _as_float(preprocess.get("h_freq"))
    apply_average_reference = bool(preprocess.get("apply_average_reference", False))

    if notch_hz and notch_hz > 0:
        raw.notch_filter(freqs=[notch_hz], verbose="ERROR")
    if l_freq is not None or h_freq is not None:
        raw.filter(l_freq=l_freq, h_freq=h_freq, verbose="ERROR")
    if target_sampling_rate and int(round(float(raw.info["sfreq"]))) != int(target_sampling_rate):
        raw.resample(float(target_sampling_rate), verbose="ERROR")
    if apply_average_reference:
        raw.set_eeg_reference("average", projection=False, verbose="ERROR")

    sampling_rate = int(round(float(raw.info["sfreq"])))
    labels = [str(name) for name in raw.ch_names]
    data = raw.get_data()
    return sampling_rate, labels, np.asarray(data, dtype=float)


def _load_recording_matrix(
    path: Path,
    *,
    recording_cfg: Dict[str, Any],
    source_cfg: Dict[str, Any],
    target_sampling_rate: int | None,
) -> tuple[int, list[str], np.ndarray]:
    lower_name = path.name.lower()
    if lower_name.endswith((".csv", ".tsv", ".txt")):
        return _read_csv_recording(
            path,
            delimiter=str(recording_cfg.get("delimiter") or source_cfg.get("delimiter") or ""),
            has_header=recording_cfg.get("has_header", source_cfg.get("has_header")),
            skip_columns=int(recording_cfg.get("skip_columns", source_cfg.get("skip_columns", 0)) or 0),
            sampling_rate=_as_float(recording_cfg.get("sampling_rate", source_cfg.get("sampling_rate", target_sampling_rate))),
        )

    preprocess = dict(source_cfg.get("preprocess", {}))
    if isinstance(recording_cfg.get("preprocess"), dict):
        preprocess.update(recording_cfg["preprocess"])
    return _read_mne_recording(path, target_sampling_rate=target_sampling_rate, preprocess=preprocess)


def _resolve_channel_index(labels: Sequence[str], ref: int | str) -> int | None:
    if isinstance(ref, int):
        idx = ref - 1
        return idx if 0 <= idx < len(labels) else None

    target = str(ref).strip().lower()
    for idx, label in enumerate(labels):
        if str(label).strip().lower() == target:
            return idx
    return None


def _resolve_available_locations(labels: Sequence[str], channels: Dict[str, int | str]) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for location, ref in channels.items():
        idx = _resolve_channel_index(labels, ref)
        if idx is not None:
            out[location] = idx
    return out


def _resolve_recordings(config: Dict[str, Any], source_cfg: Dict[str, Any]) -> list[Dict[str, Any]]:
    raw = source_cfg.get("recordings", config.get("recordings", []))
    items: list[Dict[str, Any]] = []
    if isinstance(raw, (str, Path)):
        raw = [raw]
    if not isinstance(raw, list):
        raise RuntimeError("source.recordings must be a list of file paths or objects.")

    for idx, item in enumerate(raw):
        if isinstance(item, (str, Path)):
            items.append({"path": str(item), "label": f"recording-{idx + 1}"})
            continue
        if isinstance(item, dict):
            path = str(item.get("path", "")).strip()
            if not path:
                raise RuntimeError("Each recording entry must include a non-empty path.")
            normalized = dict(item)
            normalized["path"] = path
            normalized.setdefault("label", Path(path).stem or f"recording-{idx + 1}")
            items.append(normalized)
            continue
        raise RuntimeError("Unsupported recording entry. Use a file path string or an object with a path field.")

    if not items:
        raise RuntimeError("No EEG recording files were provided.")
    return items


def _base_ranges_for_recording(
    duration_seconds: float,
    *,
    start_seconds: float | None,
    end_seconds: float | None,
    keep_ranges: Sequence[tuple[float, float]],
) -> list[tuple[float, float]]:
    if keep_ranges:
        return _clip_ranges(keep_ranges, duration_seconds)

    start = max(0.0, start_seconds or 0.0)
    end = duration_seconds if end_seconds is None else min(duration_seconds, end_seconds)
    if end <= start:
        return []
    return [(start, end)]


def build_offline_coherence_session(
    config: Dict[str, Any],
    *,
    pairs: List[Tuple[str, str]],
    event_cb: EventCallback | None = None,
) -> Dict[str, Any]:
    source_cfg = dict(config.get("source", {}))
    channels = normalize_channel_map(config.get("channels"))
    if not channels:
        raise RuntimeError("No channel mapping provided for offline coherence import.")

    explicit_locations = [str(loc).strip() for loc in config.get("locations", []) if str(loc).strip()]
    locations = sorted(set(explicit_locations) | set(channels.keys()) | {loc for pair in pairs for loc in pair})
    target_sampling_rate = int(config.get("sampling_rate", 250) or 250)
    epoch_seconds = float(config.get("epoch_seconds", 30) or 30)
    minimum_segment_seconds = float(config.get("minimum_segment_seconds", min(5.0, max(1.0, epoch_seconds))) or 1.0)
    sync_mode = str(source_cfg.get("sync_mode", "independent")).strip().lower()
    sync_mode = "parallel" if sync_mode in {"parallel", "synced", "synchronized"} else "independent"

    global_keep = normalize_ranges(source_cfg.get("keep_ranges", config.get("keep_ranges")))
    global_exclude = normalize_ranges(source_cfg.get("exclude_ranges", config.get("exclude_ranges")))
    recordings = _resolve_recordings(config, source_cfg)

    _emit(event_cb, "recording_import_started", files=len(recordings), sync_mode=sync_mode)

    imported_epochs: list[Dict[str, Any]] = []
    merged_epochs: Dict[tuple[int, int], Dict[str, Any]] = {}
    recording_summaries: list[Dict[str, Any]] = []

    for rec_index, recording_cfg in enumerate(recordings, start=1):
        path = Path(str(recording_cfg["path"])).expanduser().resolve()
        if not path.exists():
            raise RuntimeError(f"Recording file not found: {path}")

        local_keep = normalize_ranges(recording_cfg.get("keep_ranges"))
        local_exclude = normalize_ranges(recording_cfg.get("exclude_ranges"))
        start_seconds = _as_float(recording_cfg.get("start_seconds"))
        end_seconds = _as_float(recording_cfg.get("end_seconds"))
        time_offset_seconds = _as_float(recording_cfg.get("time_offset_seconds")) or 0.0

        sampling_rate, labels, matrix = _load_recording_matrix(
            path,
            recording_cfg=recording_cfg,
            source_cfg=source_cfg,
            target_sampling_rate=target_sampling_rate,
        )
        duration_seconds = float(matrix.shape[1]) / float(sampling_rate)

        base_ranges = _base_ranges_for_recording(
            duration_seconds,
            start_seconds=start_seconds,
            end_seconds=end_seconds,
            keep_ranges=global_keep or local_keep,
        )
        exclude_ranges = _clip_ranges([*global_exclude, *local_exclude], duration_seconds)
        clean_ranges = _subtract_ranges(base_ranges, exclude_ranges)
        chunk_ranges = _chunk_ranges(
            clean_ranges,
            epoch_seconds=epoch_seconds,
            minimum_segment_seconds=minimum_segment_seconds,
        )

        matched = _resolve_available_locations(labels, channels)
        _emit(
            event_cb,
            "recording_file_loaded",
            path=str(path),
            sampling_rate=sampling_rate,
            channels=len(labels),
            matched_locations=sorted(matched.keys()),
            chunks=len(chunk_ranges),
        )

        if not matched:
            recording_summaries.append(
                {
                    "path": str(path),
                    "sampling_rate": sampling_rate,
                    "matched_locations": [],
                    "epoch_count": 0,
                    "duration_seconds": duration_seconds,
                }
            )
            continue

        recording_summaries.append(
            {
                "path": str(path),
                "sampling_rate": sampling_rate,
                "matched_locations": sorted(matched.keys()),
                "epoch_count": len(chunk_ranges),
                "duration_seconds": duration_seconds,
            }
        )

        for chunk_index, (start, end) in enumerate(chunk_ranges, start=1):
            start_sample = int(round(start * sampling_rate))
            end_sample = int(round(end * sampling_rate))
            signals: Dict[str, List[float]] = {}
            for location, chan_idx in matched.items():
                segment = matrix[chan_idx, start_sample:end_sample]
                if segment.size == 0:
                    continue
                signals[location] = np.asarray(segment, dtype=float).tolist()

            if not signals:
                continue

            epoch = {
                "sequence": str(recording_cfg.get("label") or path.stem or f"recording-{rec_index}"),
                "index": int(chunk_index),
                "label": "EC",
                "instruction": f"Imported from {path.name}",
                "seconds": float(end - start),
                "features": {},
                "signals": signals,
                "recording_path": str(path),
                "start_seconds": float(start),
                "end_seconds": float(end),
                "aligned_start_seconds": float(start + time_offset_seconds),
                "aligned_end_seconds": float(end + time_offset_seconds),
            }

            if sync_mode == "parallel":
                aligned_key = (
                    int(round((start + time_offset_seconds) * sampling_rate)),
                    int(round((end + time_offset_seconds) * sampling_rate)),
                )
                merged = merged_epochs.setdefault(
                    aligned_key,
                    {
                        "sequence": "PARALLEL_IMPORT",
                        "index": len(merged_epochs) + 1,
                        "label": "EC",
                        "instruction": "Imported from synchronized recordings",
                        "seconds": float(end - start),
                        "features": {},
                        "signals": {},
                        "recording_paths": [],
                        "start_seconds": float(start + time_offset_seconds),
                        "end_seconds": float(end + time_offset_seconds),
                    },
                )
                for location, values in signals.items():
                    if location not in merged["signals"]:
                        merged["signals"][location] = values
                merged["recording_paths"].append(str(path))
            else:
                imported_epochs.append(epoch)

    if sync_mode == "parallel":
        imported_epochs.extend(
            epoch for _key, epoch in sorted(merged_epochs.items(), key=lambda item: (item[0][0], item[0][1]))
        )

    if not imported_epochs:
        raise RuntimeError("No usable EEG epochs were extracted from the selected recording files.")

    available_pairs: list[list[str]] = []
    missing_pairs: list[list[str]] = []
    for left, right in pairs:
        if any(left in epoch.get("signals", {}) and right in epoch.get("signals", {}) for epoch in imported_epochs):
            available_pairs.append([left, right])
        else:
            missing_pairs.append([left, right])

    warnings: list[str] = []
    if missing_pairs:
        warnings.append(
            "Some coherence pairs were unavailable because those channels never appeared in the same imported epoch: "
            + ", ".join(f"{left}/{right}" for left, right in missing_pairs)
        )
    if sync_mode == "parallel" and len(recordings) > 1:
        warnings.append(
            "Parallel import assumes the selected recordings are time-aligned after any optional per-file offsets. "
            "Cross-file coherence is only meaningful when those recordings were truly synchronized."
        )

    _emit(
        event_cb,
        "recording_import_complete",
        epochs=len(imported_epochs),
        available_pairs=available_pairs,
        missing_pairs=missing_pairs,
    )

    return {
        "mode": f"recording_{sync_mode}",
        "sampling_rate": target_sampling_rate,
        "epoch_seconds": epoch_seconds,
        "channels": channels,
        "locations": locations,
        "pairs": [[left, right] for left, right in pairs],
        "zscore_mode": str(config.get("zscore_mode", "global")),
        "subject_age": config.get("subject_age"),
        "epochs": imported_epochs,
        "recording_source": {
            "kind": "existing_recordings",
            "sync_mode": sync_mode,
            "files": recording_summaries,
            "available_pairs": available_pairs,
            "missing_pairs": missing_pairs,
        },
        "warnings": warnings,
    }
