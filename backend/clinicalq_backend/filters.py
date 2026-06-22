from __future__ import annotations

import math
from typing import Any, Dict, Iterable

import numpy as np


DEFAULT_EEG_FILTERS: Dict[str, float | bool] = {
    "enabled": True,
    "l_freq": 0.3,
    "h_freq": 45.0,
    "notch_hz": 60.0,
    "notch_width_hz": 2.0,
}


def _as_float(value: Any, default: float) -> float:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return default
    return out if math.isfinite(out) else default


def _as_bool(value: Any, default: bool = True) -> bool:
    if isinstance(value, str):
        return value.strip().lower() not in {"0", "false", "no", "off", "disabled"}
    if value is None:
        return default
    return bool(value)


def eeg_filter_config(config: Dict[str, Any] | None = None) -> Dict[str, float | bool]:
    raw = dict(config or {})
    if isinstance(raw.get("filters"), dict):
        raw = dict(raw["filters"])
    elif "filters" in raw:
        raw = {"enabled": raw.get("filters")}
    elif isinstance(raw.get("preprocess"), dict):
        raw = dict(raw["preprocess"])
    elif "preprocess" in raw:
        raw = {"enabled": raw.get("preprocess")}

    out = dict(DEFAULT_EEG_FILTERS)
    out["enabled"] = _as_bool(raw.get("enabled"), bool(out["enabled"]))
    for key in ("l_freq", "h_freq", "notch_hz", "notch_width_hz"):
        if key in raw:
            out[key] = _as_float(raw.get(key), float(out[key]))
    if "line_noise_hz" in raw and "notch_hz" not in raw:
        out["notch_hz"] = _as_float(raw.get("line_noise_hz"), float(out["notch_hz"]))
    return out


def clean_eeg_signal(signal: Iterable[float], sampling_rate: int, config: Dict[str, Any] | None = None) -> np.ndarray:
    x = np.nan_to_num(np.asarray(list(signal), dtype=float), nan=0.0)
    if x.size == 0:
        return x
    x = x - float(np.mean(x))

    filters = eeg_filter_config(config)
    if not filters["enabled"] or x.size < 8:
        return x

    nyquist = float(sampling_rate) / 2.0
    freqs = np.fft.rfftfreq(x.size, d=1.0 / float(sampling_rate))
    mask = np.ones(freqs.shape, dtype=bool)

    l_freq = max(0.0, min(_as_float(filters["l_freq"], 0.3), nyquist))
    h_freq = max(0.0, min(_as_float(filters["h_freq"], 45.0), nyquist))
    if l_freq > 0:
        mask &= freqs >= l_freq
    if h_freq > 0:
        mask &= freqs <= h_freq

    notch_hz = _as_float(filters["notch_hz"], 0.0)
    if notch_hz > 0 and notch_hz < nyquist:
        half_width = max(0.1, _as_float(filters["notch_width_hz"], 2.0) / 2.0)
        mask &= ~((freqs >= notch_hz - half_width) & (freqs <= notch_hz + half_width))

    spec = np.fft.rfft(x)
    spec[~mask] = 0.0
    return np.fft.irfft(spec, n=x.size).astype(float)


def clean_eeg_data(
    data: Dict[int, Iterable[float]],
    sampling_rate: int,
    config: Dict[str, Any] | None = None,
) -> Dict[int, np.ndarray]:
    filters = eeg_filter_config(config)
    return {int(channel): clean_eeg_signal(signal, sampling_rate, filters) for channel, signal in data.items()}
