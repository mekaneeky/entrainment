from __future__ import annotations

import math
import time
from typing import Any, Dict, Iterable

import numpy as np

from clinicalq_backend.bands import BANDS as CLINICALQ_BANDS
from clinicalq_backend.coherence import (
    BANDS as QEEG_BANDS,
    _load_norms,
    _metric_norm_keys,
    _norm_status_and_z,
    _resolve_age_bin_label,
    _resolve_norm,
    _to_age,
)
from clinicalq_backend.filters import clean_eeg_signal, eeg_filter_config
from clinicalq_backend.openbci import create_board
from clinicalq_backend.raw_recording import RawSessionRecorder
from clinicalq_backend.types import EventCallback

BASELINE_BANDS: Dict[str, tuple[float, float]] = {
    "delta": (1.0, 4.0),
    "theta": (4.0, 8.0),
    "alpha": (8.0, 12.0),
    "smr": (12.0, 15.0),
    "beta": (13.0, 30.0),
    "hibeta": (30.0, 40.0),
}

CLINICALQ_VIEW_BANDS = ("delta", "theta", "alpha", "beta", "smr")
DEFAULT_BASELINE_NORM_Z_CUTOFF = 0.5

LEGACY_LOCATION_MAP = {
    "T7": "T3",
    "T8": "T4",
    "P7": "T5",
    "P8": "T6",
}

CANONICAL_LOCATION_MAP = {
    loc.upper(): loc
    for loc in [
        "Fp1",
        "FPo1",
        "FPo2",
        "Fp2",
        "F7",
        "F3",
        "Fz",
        "F4",
        "F8",
        "T3",
        "C3",
        "Cz",
        "C4",
        "T4",
        "T5",
        "P3",
        "Pz",
        "P4",
        "T6",
        "O1",
        "Oz",
        "O2",
    ]
}


def _emit(event_cb: EventCallback | None, event: str, **payload: Any) -> None:
    if event_cb:
        event_cb({"event": event, **payload})


def _safe_signal(signal: Iterable[float]) -> np.ndarray:
    x = np.asarray(list(signal), dtype=float)
    if x.size < 8:
        return np.zeros(8, dtype=float)
    return np.nan_to_num(x, nan=0.0)


def _spectrum(signal: Iterable[float], sampling_rate: int) -> tuple[np.ndarray, np.ndarray]:
    x = _safe_signal(signal)
    x = x - np.mean(x)
    window = np.hanning(x.size)
    spec = np.fft.rfft(x * window)
    scale = 2.0 / max(float(np.sum(window)), 1.0)
    amps = np.abs(spec) * scale
    freqs = np.fft.rfftfreq(x.size, d=1.0 / float(sampling_rate))
    return freqs, amps


def _band_amplitude(freqs: np.ndarray, amps: np.ndarray, low: float, high: float) -> float:
    mask = (freqs >= low) & (freqs <= high)
    if not np.any(mask):
        return 0.0
    return float(np.sqrt(np.sum(np.square(amps[mask]))))


def _band_absolute_power(freqs: np.ndarray, amps: np.ndarray, low: float, high: float) -> float:
    mask = (freqs >= low) & (freqs <= high)
    if not np.any(mask):
        return 0.0
    return float(np.sum(np.square(amps[mask])))


def _one_hz_spectrum_bins(freqs: np.ndarray, amps: np.ndarray, low_hz: int = 1, high_hz: int = 30) -> list[Dict[str, float]]:
    bins = []
    for hz in range(int(low_hz), int(high_hz) + 1):
        low = max(0.0, float(hz) - 0.5)
        high = float(hz) + 0.5
        bins.append({"hz": float(hz), "amplitude": _band_amplitude(freqs, amps, low, high)})
    return bins


def _dominant_frequency(freqs: np.ndarray, amps: np.ndarray, low: float, high: float) -> float:
    mask = (freqs >= low) & (freqs <= high)
    if not np.any(mask):
        return 0.0
    band_freqs = freqs[mask]
    band_amps = amps[mask]
    return float(band_freqs[int(np.argmax(band_amps))])


def _amplitude_at_frequency(freqs: np.ndarray, amps: np.ndarray, frequency: float) -> float:
    if not math.isfinite(float(frequency)) or frequency <= 0 or freqs.size == 0 or amps.size == 0:
        return 0.0
    index = int(np.argmin(np.abs(freqs - float(frequency))))
    return float(amps[index])


def _windowed_dominant_frequency(
    signal: Iterable[float],
    sampling_rate: int,
    low: float,
    high: float,
    window_seconds: float,
) -> float:
    x = _safe_signal(signal)
    if window_seconds <= 0:
        freqs, amps = _spectrum(x, sampling_rate)
        return _dominant_frequency(freqs, amps, low, high)

    n_samples = max(8, int(round(float(window_seconds) * float(sampling_rate))))
    if x.size < n_samples:
        freqs, amps = _spectrum(x, sampling_rate)
        return _dominant_frequency(freqs, amps, low, high)

    values = []
    for start in range(0, x.size - n_samples + 1, n_samples):
        freqs, amps = _spectrum(x[start : start + n_samples], sampling_rate)
        df = _dominant_frequency(freqs, amps, low, high)
        if df > 0:
            values.append(df)
    if not values:
        freqs, amps = _spectrum(x, sampling_rate)
        return _dominant_frequency(freqs, amps, low, high)
    return float(np.mean(values))


def _windowed_band_stats(
    signal: Iterable[float],
    sampling_rate: int,
    bands: Dict[str, tuple[float, float]],
    window_seconds: float = 1.0,
) -> Dict[str, Dict[str, float | int]]:
    x = _safe_signal(signal)
    n_samples = max(8, int(round(float(window_seconds) * float(sampling_rate))))
    starts = list(range(0, x.size - n_samples + 1, n_samples)) if x.size >= n_samples else [0]
    if not starts:
        starts = [0]

    stats: Dict[str, Dict[str, float | int]] = {}
    epoch_freqs, epoch_amps = _spectrum(x, sampling_rate)
    for band, (low, high) in bands.items():
        values = []
        for start in starts:
            chunk = x[start : start + n_samples] if x.size >= n_samples else x
            freqs, amps = _spectrum(chunk, sampling_rate)
            values.append(_band_amplitude(freqs, amps, low, high))
        arr = np.asarray(values, dtype=float)
        stats[band] = {
            "mean_amplitude": float(np.mean(arr)) if arr.size else 0.0,
            "sd_amplitude": float(np.std(arr, ddof=1)) if arr.size > 1 else 0.0,
            "window_count": int(arr.size),
            "epoch_amplitude": _band_amplitude(epoch_freqs, epoch_amps, low, high),
        }
    return stats


def _display_location(location: str) -> str:
    raw = str(location or "").strip().upper()
    mapped = LEGACY_LOCATION_MAP.get(raw, raw)
    return CANONICAL_LOCATION_MAP.get(mapped, mapped)


def _norm_signal_scale(config: Dict[str, Any]) -> float:
    unit = str(config.get("norm_signal_unit", "uV")).strip().lower()
    if unit in {"uv", "microvolt", "microvolts"}:
        return 1e-6
    return 1.0


def _float_or_default(value: Any, default: float) -> float:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return default
    return out if math.isfinite(out) else default


def _norm_context(config: Dict[str, Any]) -> Dict[str, Any] | None:
    dataset = str(config.get("norms_dataset", "dvs_608_cleaned")).strip().lower()
    if dataset in {"", "none", "off", "disabled"}:
        return None
    norms = _load_norms(dataset=dataset)
    zscore_mode = str(config.get("zscore_mode", "global")).strip().lower()
    zscore_mode = "age" if zscore_mode in {"age", "age_based", "age-based"} else "global"
    subject_age = _to_age(config.get("subject_age"))
    age_bin = _resolve_age_bin_label(norms.get("age_bins"), subject_age) if zscore_mode == "age" else None
    zscore_threshold = _float_or_default(config.get("norm_zscore_threshold", DEFAULT_BASELINE_NORM_Z_CUTOFF), DEFAULT_BASELINE_NORM_Z_CUTOFF)
    if not math.isfinite(zscore_threshold) or zscore_threshold <= 0:
        zscore_threshold = DEFAULT_BASELINE_NORM_Z_CUTOFF
    return {
        "dataset": dataset,
        "norms": norms,
        "zscore_mode": zscore_mode,
        "subject_age": subject_age,
        "age_bin": age_bin,
        "zscore_threshold": zscore_threshold,
    }


def _score_power_metric(
    *,
    context: Dict[str, Any] | None,
    location: str,
    metric_type: str,
    band: str,
    value: float,
) -> Dict[str, Any] | None:
    if context is None:
        return None
    keys = _metric_norm_keys(metric_type, location=location, band=band)
    norm, source = _resolve_norm(
        context["norms"],
        keys,
        zscore_mode=context["zscore_mode"],
        age_bin_label=context["age_bin"],
    )
    status, zscore, normal_range = _norm_status_and_z(value, norm, z_cutoff=float(context.get("zscore_threshold", DEFAULT_BASELINE_NORM_Z_CUTOFF)))
    return {
        "metric_type": metric_type,
        "band": band,
        "value": value,
        "status": status,
        "zscore": zscore,
        "normal_range": normal_range,
        "norm_source": source,
        "norm_keys": keys,
    }


def _resolve_channels(config: Dict[str, Any]) -> Dict[str, int]:
    raw = config.get("channels") or {}
    out: Dict[str, int] = {}
    for location, channel in raw.items():
        loc = _display_location(str(location))
        if not loc:
            continue
        ch = int(channel)
        if ch < 1 or ch > 16:
            raise RuntimeError(f"Channel for {loc} must be 1-16.")
        out[loc] = ch
    if not out:
        raise RuntimeError("Configure at least one baseline channel.")
    if len(out) > 16:
        raise RuntimeError("Baseline capture supports up to 16 electrodes.")
    duplicates = sorted({ch for ch in out.values() if list(out.values()).count(ch) > 1})
    if duplicates:
        raise RuntimeError(f"Duplicate baseline channel assignments: {duplicates}")
    return out


def _clinicalq_view_bands() -> Dict[str, tuple[float, float]]:
    return {
        band: CLINICALQ_BANDS[band]
        for band in CLINICALQ_VIEW_BANDS
    }


def _analyze_rows(
    *,
    data: Dict[int, np.ndarray],
    sampling_rate: int,
    channels: Dict[str, int],
    config: Dict[str, Any],
    dominant_low: float,
    dominant_high: float,
    dominant_window_seconds: float,
    norm_context: Dict[str, Any] | None = None,
) -> tuple[list[Dict[str, Any]], list[Dict[str, Any]]]:
    rows = []
    all_norm_scores = []
    clinicalq_bands = _clinicalq_view_bands()
    filters = eeg_filter_config(config)

    for location, channel in sorted(channels.items()):
        signal = data.get(channel)
        if signal is None:
            continue
        signal = clean_eeg_signal(signal, sampling_rate, filters)
        freqs, amps = _spectrum(signal, sampling_rate)
        spectrum_1_30 = _one_hz_spectrum_bins(freqs, amps, 1, 30)
        spectrum_values = np.asarray([row["amplitude"] for row in spectrum_1_30], dtype=float)
        spectrum_sum = float(np.sum(spectrum_values))
        spectrum_std = float(np.std(spectrum_values, ddof=1)) if spectrum_values.size > 1 else 0.0
        clinicalq_band_stats = _windowed_band_stats(signal, sampling_rate, clinicalq_bands, 1.0)
        clinicalq_amplitudes = {
            band: float(stats["epoch_amplitude"])
            for band, stats in clinicalq_band_stats.items()
        }
        amplitudes = {
            band: _band_amplitude(freqs, amps, low, high)
            for band, (low, high) in BASELINE_BANDS.items()
        }
        total = sum(v for v in amplitudes.values() if math.isfinite(v))
        relative = {
            band: (value / total * 100.0 if total > 0 else 0.0)
            for band, value in amplitudes.items()
        }
        norm_signal = np.asarray(signal, dtype=float) * _norm_signal_scale(config)
        norm_freqs, norm_amps = _spectrum(norm_signal, sampling_rate)
        absolute_power = {
            band: _band_absolute_power(norm_freqs, norm_amps, low, high)
            for band, (low, high) in QEEG_BANDS.items()
        }
        total_power = sum(v for v in absolute_power.values() if math.isfinite(v))
        relative_power = {
            band: (value / total_power if total_power > 0 else 0.0)
            for band, value in absolute_power.items()
        }
        norm_scores = []
        for band in QEEG_BANDS:
            ap_score = _score_power_metric(
                context=norm_context,
                location=location,
                metric_type="absolute_power",
                band=band,
                value=absolute_power[band],
            )
            rp_score = _score_power_metric(
                context=norm_context,
                location=location,
                metric_type="relative_power",
                band=band,
                value=relative_power[band],
            )
            for score in (ap_score, rp_score):
                if score is None:
                    continue
                score["location"] = location
                norm_scores.append(score)
                all_norm_scores.append(score)
        theta_beta = amplitudes["theta"] / amplitudes["beta"] if amplitudes["beta"] else float("nan")
        theta_alpha = amplitudes["theta"] / amplitudes["alpha"] if amplitudes["alpha"] else float("nan")
        hibeta_beta = amplitudes["hibeta"] / amplitudes["beta"] if amplitudes["beta"] else float("nan")
        dominant_frequency = _windowed_dominant_frequency(
            signal,
            sampling_rate,
            float(dominant_low),
            float(dominant_high),
            dominant_window_seconds,
        )
        dominant_frequency_amplitude = _amplitude_at_frequency(freqs, amps, dominant_frequency)
        rows.append(
            {
                "location": location,
                "channel": channel,
                "amplitudes": amplitudes,
                "relative_percent": relative,
                "absolute_power": absolute_power,
                "relative_power": relative_power,
                "norm_scores": norm_scores,
                "dominant_frequency_hz": dominant_frequency,
                "dominant_frequency_amplitude": dominant_frequency_amplitude,
                "spectrum_1_30_hz": spectrum_1_30,
                "spectrum_1_30_amplitude_sum": spectrum_sum,
                "spectrum_1_30_amplitude_std": spectrum_std,
                "clinicalq_amplitudes": clinicalq_amplitudes,
                "clinicalq_band_stats": clinicalq_band_stats,
                "ratios": {
                    "theta_beta": theta_beta,
                    "theta_alpha": theta_alpha,
                    "hibeta_beta": hibeta_beta,
                },
            }
        )
    return rows, all_norm_scores


def _row_metric(row: Dict[str, Any], metric: str) -> float:
    if metric == "total":
        return float(row.get("spectrum_1_30_amplitude_sum", float("nan")))
    stats = row.get("clinicalq_band_stats", {}).get(metric, {})
    return float(stats.get("epoch_amplitude", stats.get("mean_amplitude", float("nan"))))


def _mean(values: list[float]) -> float:
    clean = [float(value) for value in values if math.isfinite(float(value))]
    return float(sum(clean) / len(clean)) if clean else float("nan")


def _sd(values: list[float]) -> float:
    clean = [float(value) for value in values if math.isfinite(float(value))]
    if len(clean) < 2:
        return 0.0
    mean = sum(clean) / len(clean)
    return float(math.sqrt(sum((value - mean) ** 2 for value in clean) / (len(clean) - 1)))


def _selected_rows(rows: list[Dict[str, Any]], selected_locations: list[str]) -> list[Dict[str, Any]]:
    selected = {_display_location(loc) for loc in selected_locations if str(loc).strip()}
    if not selected:
        return rows
    return [row for row in rows if row.get("location") in selected]


def run_baseline(config: Dict[str, Any], event_cb: EventCallback | None = None) -> Dict[str, Any]:
    epoch_seconds = int(config.get("epoch_seconds", 60) or 60)
    condition = str(config.get("condition", "EC") or "EC").strip().upper()
    condition = "EO" if condition == "EO" else "EC"
    dominant_low, dominant_high = config.get("dominant_range_hz", [1.0, 40.0])
    dominant_window_seconds = float(config.get("dominant_window_seconds", 0.0) or 0.0)
    channels = _resolve_channels(config)
    norm_context = _norm_context(config)
    filters = eeg_filter_config(config)

    board_config = dict(config.get("board", {}))
    board_config["available_channels"] = sorted(channels.values())
    merged_config = {
        **config,
        "board": board_config,
        "sampling_rate": int(config.get("sampling_rate", 250) or 250),
    }

    board = create_board(merged_config)
    raw_recorder = RawSessionRecorder.from_config(config, analysis="nf_baseline")
    _emit(event_cb, "baseline_start", locations=sorted(channels.keys()), seconds=epoch_seconds)

    def _tick(seconds_remaining: int) -> None:
        _emit(event_cb, "baseline_tick", seconds_remaining=seconds_remaining)

    try:
        board.start()
        _emit(event_cb, "board_ready", sampling_rate=board.sampling_rate, eeg_channels=board.eeg_channels)
        data = board.read_epoch(epoch_seconds, condition, on_tick=_tick)
    finally:
        board.stop()
        _emit(event_cb, "board_stopped")

    if raw_recorder is not None:
        raw_signals = {
            location: np.asarray(data[channel], dtype=float)
            for location, channel in sorted(channels.items())
            if channel in data
        }
        raw_recorder.record_epoch(
            sequence="BASELINE",
            index=1,
            label=condition,
            instruction=f"{condition} baseline",
            seconds=epoch_seconds,
            sampling_rate=board.sampling_rate,
            signals=raw_signals,
        )

    rows, all_norm_scores = _analyze_rows(
        data=data,
        sampling_rate=board.sampling_rate,
        channels=channels,
        config=config,
        dominant_low=float(dominant_low),
        dominant_high=float(dominant_high),
        dominant_window_seconds=dominant_window_seconds,
        norm_context=norm_context,
    )

    mapping_1_30 = sorted(
        [
            {
                "location": row["location"],
                "channel": row["channel"],
                "dominant_frequency_hz": row["dominant_frequency_hz"],
                "dominant_frequency_amplitude": row["dominant_frequency_amplitude"],
                "amplitude_sum": row["spectrum_1_30_amplitude_sum"],
                "amplitude_std": row["spectrum_1_30_amplitude_std"],
            }
            for row in rows
        ],
        key=lambda item: item["amplitude_sum"],
    )

    result = {
        "metadata": {
            "analysis": "nf_baseline",
            "sampling_rate": board.sampling_rate,
            "epoch_seconds": epoch_seconds,
            "condition": condition,
            "channels": channels,
            "bands_hz": {key: [low, high] for key, (low, high) in BASELINE_BANDS.items()},
            "clinicalq_bands_hz": {
                key: [CLINICALQ_BANDS[key][0], CLINICALQ_BANDS[key][1]]
                for key in CLINICALQ_VIEW_BANDS
            },
            "qeeg_power_bands_hz": {key: [low, high] for key, (low, high) in QEEG_BANDS.items()},
            "dominant_range_hz": [float(dominant_low), float(dominant_high)],
            "dominant_window_seconds": dominant_window_seconds if dominant_window_seconds > 0 else None,
            "filters": filters,
            "norms": None
            if norm_context is None
            else {
                "dataset": norm_context["dataset"],
                "zscore_mode": norm_context["zscore_mode"],
                "zscore_threshold": norm_context["zscore_threshold"],
                "subject_age": norm_context["subject_age"],
                "age_bin": norm_context["age_bin"],
                "signal_unit": str(config.get("norm_signal_unit", "uV")),
            },
        },
        "summary": {
            "norm_in_range": sum(1 for score in all_norm_scores if score["status"] == "IN_RANGE"),
            "norm_out_of_range": sum(1 for score in all_norm_scores if score["status"] == "OUT_OF_RANGE"),
            "norm_missing": sum(1 for score in all_norm_scores if score["status"] == "MISSING"),
        },
        "locations": rows,
        "norm_scores": all_norm_scores,
        "mapping_1_30": mapping_1_30,
    }
    raw_recording = raw_recorder.close() if raw_recorder is not None else None
    if raw_recording:
        result["metadata"]["raw_recording"] = raw_recording
    if config.get("profile"):
        result["metadata"]["profile"] = config.get("profile")
    if config.get("tags"):
        result["metadata"]["tags"] = config.get("tags")
    if config.get("notes"):
        result["metadata"]["notes"] = config.get("notes")
    _emit(event_cb, "baseline_complete", locations=len(rows))
    return result


def run_live_windows(config: Dict[str, Any], event_cb: EventCallback | None = None) -> Dict[str, Any]:
    total_seconds = float(config.get("total_seconds", config.get("epoch_seconds", 10)) or 10)
    window_seconds = float(config.get("window_seconds", 2.0) or 2.0)
    window_seconds = max(0.25, min(window_seconds, total_seconds))
    condition = str(config.get("condition", "EC") or "EC").strip().upper()
    condition = "EO" if condition == "EO" else "EC"
    dominant_low, dominant_high = config.get("dominant_range_hz", [1.0, 40.0])
    dominant_window_seconds = float(config.get("dominant_window_seconds", window_seconds) or window_seconds)
    metric = str(config.get("score_metric", "total") or "total").strip().lower()
    if metric not in {"total", *CLINICALQ_VIEW_BANDS}:
        metric = "total"
    selected_locations = [
        str(loc)
        for loc in config.get("selected_locations", [])
        if str(loc).strip()
    ]
    channels = _resolve_channels(config)
    filters = eeg_filter_config(config)

    board_config = dict(config.get("board", {}))
    board_config["available_channels"] = sorted(channels.values())
    merged_config = {
        **config,
        "board": board_config,
        "sampling_rate": int(config.get("sampling_rate", 250) or 250),
    }

    board = create_board(merged_config)
    _emit(
        event_cb,
        "live_windows_start",
        seconds=total_seconds,
        window_seconds=window_seconds,
        metric=metric,
        selected_locations=selected_locations,
    )

    windows: list[Dict[str, Any]] = []
    gradients: list[float] = []
    pct_gradients: list[float] = []
    prev_metric: float | None = None
    prev_elapsed: float | None = None
    started_at = time.perf_counter()

    try:
        board.start()
        _emit(event_cb, "board_ready", sampling_rate=board.sampling_rate, eeg_channels=board.eeg_channels)
        n_samples = max(8, int(round(window_seconds * board.sampling_rate)))
        window_count = max(1, int(math.ceil(total_seconds / window_seconds)))
        for index in range(window_count):
            remaining = total_seconds - index * window_seconds
            current_window_seconds = max(0.25, min(window_seconds, remaining))
            n_samples = max(8, int(round(current_window_seconds * board.sampling_rate)))
            if not board.runtime.fast_mode:
                time.sleep(current_window_seconds)
            data = board.read_chunk(n_samples, condition)
            if not data:
                data = board.read_epoch(max(1, int(round(current_window_seconds))), condition)
            data = {
                channel: np.asarray(signal, dtype=float)[-n_samples:]
                for channel, signal in data.items()
            }
            rows, _norm_scores = _analyze_rows(
                data=data,
                sampling_rate=board.sampling_rate,
                channels=channels,
                config=config,
                dominant_low=float(dominant_low),
                dominant_high=float(dominant_high),
                dominant_window_seconds=dominant_window_seconds,
                norm_context=None,
            )
            selected = _selected_rows(rows, selected_locations)
            aggregate_metric = _mean([_row_metric(row, metric) for row in selected])
            aggregate_df = _mean([
                float(row.get("dominant_frequency_hz", float("nan")))
                for row in selected
            ])
            elapsed = min(total_seconds, time.perf_counter() - started_at) if not board.runtime.fast_mode else min(total_seconds, (index + 1) * window_seconds)
            step_gradient = 0.0
            drop_gradient = 0.0
            drop_pct_gradient = 0.0
            if prev_metric is not None and prev_elapsed is not None:
                dt = max(1e-9, elapsed - prev_elapsed)
                step_gradient = (aggregate_metric - prev_metric) / dt
                drop_gradient = -step_gradient
                drop_pct_gradient = (-step_gradient / prev_metric * 100.0) if prev_metric > 0 else 0.0
                gradients.append(drop_gradient)
                pct_gradients.append(drop_pct_gradient)
            prev_metric = aggregate_metric
            prev_elapsed = elapsed

            window = {
                "index": index + 1,
                "elapsed_seconds": elapsed,
                "metric": metric,
                "aggregate_metric": aggregate_metric,
                "dominant_frequency_hz": aggregate_df,
                "site_count": len(selected),
                "step_gradient_per_second": step_gradient,
                "drop_gradient_per_second": drop_gradient,
                "drop_percent_per_second": drop_pct_gradient,
                "rows": rows,
            }
            windows.append(window)
            _emit(event_cb, "live_window", **{key: value for key, value in window.items() if key != "rows"})
    finally:
        board.stop()
        _emit(event_cb, "board_stopped")

    summary = {
        "metric": metric,
        "window_count": len(windows),
        "mean_drop_gradient_per_second": _mean(gradients),
        "sd_drop_gradient_per_second": _sd(gradients),
        "mean_drop_percent_per_second": _mean(pct_gradients),
        "sd_drop_percent_per_second": _sd(pct_gradients),
        "start_metric": windows[0]["aggregate_metric"] if windows else float("nan"),
        "end_metric": windows[-1]["aggregate_metric"] if windows else float("nan"),
    }
    summary["total_drop_percent"] = (
        (summary["start_metric"] - summary["end_metric"]) / summary["start_metric"] * 100.0
        if summary["start_metric"] > 0
        else float("nan")
    )
    result = {
        "metadata": {
            "analysis": "disentrainment_live_windows",
            "sampling_rate": board.sampling_rate,
            "condition": condition,
            "channels": channels,
            "total_seconds": total_seconds,
            "window_seconds": window_seconds,
            "dominant_range_hz": [float(dominant_low), float(dominant_high)],
            "dominant_window_seconds": dominant_window_seconds,
            "score_metric": metric,
            "selected_locations": selected_locations,
            "filters": filters,
        },
        "summary": summary,
        "windows": windows,
    }
    _emit(event_cb, "live_windows_complete", **summary)
    return result
