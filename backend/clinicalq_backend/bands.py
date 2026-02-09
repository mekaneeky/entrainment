from __future__ import annotations

from typing import Dict, Tuple

import numpy as np

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
        return 0.0
    band_freqs = freqs[mask]
    band_amps = amps[mask]
    peak_idx = int(np.argmax(band_amps))
    return float(band_freqs[peak_idx])


def extract_features(signal: np.ndarray, sampling_rate: int) -> Dict[str, float]:
    features: Dict[str, float] = {}
    for band, (low, high) in BANDS.items():
        features[band] = band_amplitude(signal, sampling_rate, low, high)
    features["total_amp_basic"] = features["theta"] + features["alpha"] + features["beta"]
    features["hibeta_plus_beta"] = features["hibeta"] + features["beta"]
    features["peak_alpha"] = peak_alpha_frequency(signal, sampling_rate)
    return features

