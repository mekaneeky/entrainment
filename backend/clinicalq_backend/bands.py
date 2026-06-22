from __future__ import annotations

from typing import Dict, Tuple

import numpy as np

from clinicalq_backend.filters import clean_eeg_signal

BANDS: Dict[str, Tuple[float, float]] = {
    "delta": (1.5, 2.5),
    "theta": (3.0, 7.0),
    "alpha": (8.0, 12.0),
    "lo_alpha": (8.0, 9.0),
    "hi_alpha": (11.0, 12.0),
    "smr": (12.0, 15.0),
    "beta": (16.0, 25.0),
    "hibeta": (28.0, 40.0),
}


def _safe_signal(signal: np.ndarray) -> np.ndarray:
    x = np.asarray(signal, dtype=float)
    if x.size < 4:
        return np.zeros(4, dtype=float)
    if np.any(np.isnan(x)):
        x = np.nan_to_num(x, nan=0.0)
    return x


def _amplitude_spectrum(signal: np.ndarray, sampling_rate: int) -> tuple[np.ndarray, np.ndarray]:
    x = _safe_signal(signal)
    x = x - np.mean(x)
    n = x.size
    window = np.hanning(n)
    windowed = x * window
    spectrum = np.fft.rfft(windowed)
    scale = 2.0 / np.sum(window)
    amps = np.abs(spectrum) * scale
    freqs = np.fft.rfftfreq(n, d=1.0 / float(sampling_rate))
    return freqs, amps


def band_amplitude(signal: np.ndarray, sampling_rate: int, low_hz: float, high_hz: float) -> float:
    freqs, amps = _amplitude_spectrum(signal, sampling_rate)
    mask = (freqs >= low_hz) & (freqs <= high_hz)
    if not np.any(mask):
        return 0.0
    return float(np.sqrt(np.sum(np.square(amps[mask]))))


def peak_alpha_frequency(signal: np.ndarray, sampling_rate: int) -> float:
    freqs, amps = _amplitude_spectrum(signal, sampling_rate)
    mask = (freqs >= 8.0) & (freqs <= 12.0)
    if not np.any(mask):
        return float("nan")
    band_freqs = freqs[mask]
    band_amps = amps[mask]
    peak_idx = int(np.argmax(band_amps))
    if band_amps[peak_idx] <= 0.0 or peak_idx == 0 or peak_idx == len(band_amps) - 1:
        return float("nan")

    left = float(band_amps[peak_idx - 1])
    center = float(band_amps[peak_idx])
    right = float(band_amps[peak_idx + 1])
    denom = left - 2.0 * center + right
    bin_width = float(band_freqs[1] - band_freqs[0]) if len(band_freqs) > 1 else 0.0
    offset = 0.0 if denom == 0.0 else 0.5 * (left - right) / denom
    offset = float(np.clip(offset, -0.5, 0.5))
    return float(band_freqs[peak_idx] + offset * bin_width)


def extract_features(signal: np.ndarray, sampling_rate: int, filters: Dict[str, object] | None = None) -> Dict[str, float]:
    signal = clean_eeg_signal(signal, sampling_rate, filters)
    features: Dict[str, float] = {}
    for band, (low, high) in BANDS.items():
        features[band] = band_amplitude(signal, sampling_rate, low, high)
    features["total_amp_basic"] = features["theta"] + features["alpha"] + features["beta"]
    features["hibeta_plus_beta"] = features["hibeta"] + features["beta"]
    features["peak_alpha"] = peak_alpha_frequency(signal, sampling_rate)
    return features
