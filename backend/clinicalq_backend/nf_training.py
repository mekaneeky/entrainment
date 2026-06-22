from __future__ import annotations

import math
import time
from typing import Any, Callable, Dict

import numpy as np

from clinicalq_backend.baseline import _band_amplitude, _resolve_channels, _safe_signal, _spectrum
from clinicalq_backend.filters import clean_eeg_data, eeg_filter_config
from clinicalq_backend.openbci import create_board
from clinicalq_backend.types import EventCallback


BANDS: Dict[str, tuple[float, float]] = {
    "delta": (2.0, 5.0),
    "theta": (4.0, 7.0),
    "slow": (1.0, 6.0),
    "alpha": (8.0, 12.0),
    "narrow_alpha": (9.75, 10.25),
    "smr": (12.0, 15.0),
    "beta": (13.0, 30.0),
    "fast": (22.0, 36.0),
    "hibeta": (28.0, 40.0),
}


PROTOCOL_HEADERS: Dict[str, list[str]] = {
    "reward_smr_inhibit_theta": ["smr_amp", "theta_amp", "smr_pass", "theta_pass", "feedback"],
    "reward_2inhibit_1channel": ["reward_amp", "slow_amp", "fast_amp", "reward_pass", "slow_pass", "fast_pass", "feedback"],
    "fpo2_reward_2inhibit_1channel": ["reward_amp", "slow_amp", "fast_amp", "reward_pass", "slow_pass", "fast_pass", "feedback"],
    "alpha_theta_inhibit_delta_hibeta": [
        "alpha_amp",
        "theta_amp",
        "delta_amp",
        "hibeta_amp",
        "alpha_pass",
        "theta_pass",
        "delta_pass",
        "hibeta_pass",
        "feedback",
    ],
    "o1_theta_beta_ratio_downtrain": ["theta", "beta", "theta_beta", "ratio_pass", "feedback"],
    "f3f4_theta_alpha_balanced": [
        "f3_theta",
        "f3_alpha",
        "f4_theta",
        "f4_alpha",
        "f3_theta_alpha",
        "f4_theta_alpha",
        "total_asym_pct",
        "f3_ratio_pass",
        "f4_ratio_pass",
        "closeness_pass",
        "feedback",
    ],
    "f3f4_band_asymmetry_reduce": [
        "f3_theta",
        "f4_theta",
        "f3_alpha",
        "f4_alpha",
        "f3_beta",
        "f4_beta",
        "theta_asym_pct",
        "alpha_asym_pct",
        "beta_asym_pct",
        "theta_pass",
        "alpha_pass",
        "beta_pass",
        "feedback",
    ],
    "f3f4_alpha_downtrain_ch3_ch4": [
        "f3_alpha",
        "f4_alpha",
        "alpha_diff_pct",
        "f3_alpha_below",
        "f4_alpha_below",
        "alpha_diff_pass",
        "feedback",
        "alpha_high_tone",
    ],
    "fz_hibeta_beta_ratio": ["beta", "hibeta", "hibeta_beta", "ratio_pass", "feedback"],
    "fehmi_5site_summed_alpha_synchrony": ["summed_raw", "summed_alpha", "alpha_pass", "feedback"],
}


PROTOCOL_LABELS: Dict[str, str] = {
    "reward_smr_inhibit_theta": "Reward SMR, inhibit theta",
    "reward_2inhibit_1channel": "1-channel reward with slow/fast inhibits",
    "fpo2_reward_2inhibit_1channel": "FPo2 reward with slow/fast inhibits",
    "alpha_theta_inhibit_delta_hibeta": "Alpha/theta reward, delta/hibeta inhibits",
    "o1_theta_beta_ratio_downtrain": "O1 theta/beta downtrain",
    "f3f4_theta_alpha_balanced": "F3/F4 theta-alpha balance",
    "f3f4_band_asymmetry_reduce": "F3/F4 band asymmetry reduce",
    "f3f4_alpha_downtrain_ch3_ch4": "F3/F4 alpha downtrain",
    "fz_hibeta_beta_ratio": "Fz hibeta/beta ratio",
    "fehmi_5site_summed_alpha_synchrony": "Fehmi 5-site summed alpha synchrony",
}


DEFAULT_CHANNELS: Dict[str, Dict[str, int]] = {
    "reward_smr_inhibit_theta": {"Cz": 1},
    "reward_2inhibit_1channel": {"Cz": 1},
    "fpo2_reward_2inhibit_1channel": {"FPo2": 1},
    "alpha_theta_inhibit_delta_hibeta": {"O1": 1},
    "o1_theta_beta_ratio_downtrain": {"O1": 1},
    "f3f4_theta_alpha_balanced": {"F3": 1, "F4": 2},
    "f3f4_band_asymmetry_reduce": {"F3": 1, "F4": 2},
    "f3f4_alpha_downtrain_ch3_ch4": {"F3": 3, "F4": 4},
    "fz_hibeta_beta_ratio": {"Fz": 1},
    "fehmi_5site_summed_alpha_synchrony": {"Oz": 1, "Cz": 2, "T3": 3, "T4": 4, "FPz": 5},
}


DEFAULT_THRESHOLDS: Dict[str, float] = {
    "reward_min": 4.0,
    "smr_min": 4.0,
    "alpha_min": 4.0,
    "theta_min": 3.0,
    "slow_max": 6.0,
    "theta_max": 7.0,
    "delta_max": 4.0,
    "fast_max": 3.0,
    "hibeta_max": 2.5,
    "theta_beta_max": 2.2,
    "theta_alpha_min": 1.2,
    "theta_alpha_max": 1.6,
    "asym_max_pct": 15.0,
    "alpha_max": 10.0,
    "hibeta_beta_min": 0.45,
    "hibeta_beta_max": 0.55,
}


def _emit(event_cb: EventCallback | None, event: str, **payload: Any) -> None:
    if event_cb:
        event_cb({"event": event, **payload})


def _finite(value: Any, fallback: float = 0.0) -> float:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return fallback
    return out if math.isfinite(out) else fallback


def _ratio(a: float, b: float) -> float:
    return float(a / b) if b > 1e-9 else float("nan")


def _pass(value: float, low: float | None = None, high: float | None = None) -> float:
    if not math.isfinite(value):
        return 0.0
    if low is not None and value < low:
        return 0.0
    if high is not None and value > high:
        return 0.0
    return 1.0


def _asym_pct(a: float, b: float) -> float:
    denom = ((a + b) / 2.0) + 1e-6
    return float(100.0 * abs(a - b) / denom)


def _band(signal: np.ndarray, sampling_rate: int, band: str) -> float:
    low, high = BANDS[band]
    freqs, amps = _spectrum(signal, sampling_rate)
    return _band_amplitude(freqs, amps, low, high)


def _site_bands(data: Dict[int, np.ndarray], channels: Dict[str, int], sampling_rate: int) -> Dict[str, Dict[str, float]]:
    out: Dict[str, Dict[str, float]] = {}
    for site, channel in channels.items():
        signal = _safe_signal(data.get(channel, []))
        out[site.upper()] = {band: _band(signal, sampling_rate, band) for band in BANDS}
        out[site.upper()]["raw_rms"] = float(np.sqrt(np.mean(np.square(signal)))) if signal.size else 0.0
    return out


def _thresholds(config: Dict[str, Any]) -> Dict[str, float]:
    out = dict(DEFAULT_THRESHOLDS)
    for key, value in (config.get("thresholds") or {}).items():
        out[str(key)] = _finite(value, out.get(str(key), 0.0))
    return out


def _site(config: Dict[str, Any], default: str) -> str:
    return str(config.get("site") or default).strip().upper()


def _eval_reward_smr(site_values: Dict[str, Dict[str, float]], config: Dict[str, Any], t: Dict[str, float]) -> Dict[str, float]:
    values = site_values.get(_site(config, "Cz"), {})
    smr = values.get("smr", 0.0)
    theta = values.get("theta", 0.0)
    smr_pass = _pass(smr, low=t["smr_min"])
    theta_pass = _pass(theta, high=t["theta_max"])
    feedback = 100.0 * smr_pass * theta_pass
    return {"smr_amp": smr, "theta_amp": theta, "smr_pass": smr_pass, "theta_pass": theta_pass, "feedback": feedback}


def _eval_reward_2inhibit(site_values: Dict[str, Dict[str, float]], config: Dict[str, Any], t: Dict[str, float]) -> Dict[str, float]:
    default = "FPo2" if str(config.get("protocol_id", "")).startswith("fpo2") else "Cz"
    values = site_values.get(_site(config, default), {})
    reward_band = str(config.get("reward_band") or "alpha").strip().lower()
    if reward_band not in BANDS:
        reward_band = "alpha"
    reward = values.get(reward_band, 0.0)
    slow = values.get("slow", 0.0)
    fast = values.get("fast", 0.0)
    reward_pass = _pass(reward, low=t["reward_min"])
    slow_pass = _pass(slow, high=t["slow_max"])
    fast_pass = _pass(fast, high=t["fast_max"])
    return {
        "reward_amp": reward,
        "slow_amp": slow,
        "fast_amp": fast,
        "reward_pass": reward_pass,
        "slow_pass": slow_pass,
        "fast_pass": fast_pass,
        "feedback": 100.0 * reward_pass * slow_pass * fast_pass,
    }


def _eval_alpha_theta(site_values: Dict[str, Dict[str, float]], config: Dict[str, Any], t: Dict[str, float]) -> Dict[str, float]:
    values = site_values.get(_site(config, "O1"), {})
    alpha = values.get("alpha", 0.0)
    theta = values.get("theta", 0.0)
    delta = values.get("delta", 0.0)
    hibeta = values.get("hibeta", 0.0)
    alpha_pass = _pass(alpha, low=t["alpha_min"])
    theta_pass = _pass(theta, low=t["theta_min"])
    delta_pass = _pass(delta, high=t["delta_max"])
    hibeta_pass = _pass(hibeta, high=t["hibeta_max"])
    return {
        "alpha_amp": alpha,
        "theta_amp": theta,
        "delta_amp": delta,
        "hibeta_amp": hibeta,
        "alpha_pass": alpha_pass,
        "theta_pass": theta_pass,
        "delta_pass": delta_pass,
        "hibeta_pass": hibeta_pass,
        "feedback": 100.0 * alpha_pass * theta_pass * delta_pass * hibeta_pass,
    }


def _eval_o1_ratio(site_values: Dict[str, Dict[str, float]], _config: Dict[str, Any], t: Dict[str, float]) -> Dict[str, float]:
    values = site_values.get("O1", {})
    theta = values.get("theta", 0.0)
    beta = values.get("beta", 0.0)
    ratio = _ratio(theta, beta)
    ratio_pass = _pass(ratio, low=0.0, high=t["theta_beta_max"])
    return {"theta": theta, "beta": beta, "theta_beta": ratio, "ratio_pass": ratio_pass, "feedback": 100.0 * ratio_pass}


def _eval_f3f4_ta(site_values: Dict[str, Dict[str, float]], _config: Dict[str, Any], t: Dict[str, float]) -> Dict[str, float]:
    f3 = site_values.get("F3", {})
    f4 = site_values.get("F4", {})
    f3_theta, f3_alpha = f3.get("theta", 0.0), f3.get("alpha", 0.0)
    f4_theta, f4_alpha = f4.get("theta", 0.0), f4.get("alpha", 0.0)
    f3_ratio = _ratio(f3_theta, f3_alpha)
    f4_ratio = _ratio(f4_theta, f4_alpha)
    asym = _asym_pct(f3_theta + f3_alpha, f4_theta + f4_alpha)
    f3_pass = _pass(f3_ratio, low=t["theta_alpha_min"], high=t["theta_alpha_max"])
    f4_pass = _pass(f4_ratio, low=t["theta_alpha_min"], high=t["theta_alpha_max"])
    close_pass = _pass(asym, high=t["asym_max_pct"])
    return {
        "f3_theta": f3_theta,
        "f3_alpha": f3_alpha,
        "f4_theta": f4_theta,
        "f4_alpha": f4_alpha,
        "f3_theta_alpha": f3_ratio,
        "f4_theta_alpha": f4_ratio,
        "total_asym_pct": asym,
        "f3_ratio_pass": f3_pass,
        "f4_ratio_pass": f4_pass,
        "closeness_pass": close_pass,
        "feedback": 100.0 * f3_pass * f4_pass * close_pass,
    }


def _eval_f3f4_asym(site_values: Dict[str, Dict[str, float]], _config: Dict[str, Any], t: Dict[str, float]) -> Dict[str, float]:
    f3 = site_values.get("F3", {})
    f4 = site_values.get("F4", {})
    values = {
        "f3_theta": f3.get("theta", 0.0),
        "f4_theta": f4.get("theta", 0.0),
        "f3_alpha": f3.get("alpha", 0.0),
        "f4_alpha": f4.get("alpha", 0.0),
        "f3_beta": f3.get("beta", 0.0),
        "f4_beta": f4.get("beta", 0.0),
    }
    values["theta_asym_pct"] = _asym_pct(values["f3_theta"], values["f4_theta"])
    values["alpha_asym_pct"] = _asym_pct(values["f3_alpha"], values["f4_alpha"])
    values["beta_asym_pct"] = _asym_pct(values["f3_beta"], values["f4_beta"])
    values["theta_pass"] = _pass(values["theta_asym_pct"], high=t["asym_max_pct"])
    values["alpha_pass"] = _pass(values["alpha_asym_pct"], high=t["asym_max_pct"])
    values["beta_pass"] = _pass(values["beta_asym_pct"], high=t["asym_max_pct"])
    values["feedback"] = 100.0 * values["theta_pass"] * values["alpha_pass"] * values["beta_pass"]
    return values


def _eval_f3f4_alpha_down(site_values: Dict[str, Dict[str, float]], _config: Dict[str, Any], t: Dict[str, float]) -> Dict[str, float]:
    f3_alpha = site_values.get("F3", {}).get("alpha", 0.0)
    f4_alpha = site_values.get("F4", {}).get("alpha", 0.0)
    diff = _asym_pct(f3_alpha, f4_alpha)
    f3_pass = _pass(f3_alpha, high=t["alpha_max"])
    f4_pass = _pass(f4_alpha, high=t["alpha_max"])
    diff_pass = _pass(diff, high=t["asym_max_pct"])
    return {
        "f3_alpha": f3_alpha,
        "f4_alpha": f4_alpha,
        "alpha_diff_pct": diff,
        "f3_alpha_below": f3_pass,
        "f4_alpha_below": f4_pass,
        "alpha_diff_pass": diff_pass,
        "feedback": 100.0 * f3_pass * f4_pass * diff_pass,
        "alpha_high_tone": 100.0 * (1.0 - (f3_pass * f4_pass)),
    }


def _eval_fz_ratio(site_values: Dict[str, Dict[str, float]], _config: Dict[str, Any], t: Dict[str, float]) -> Dict[str, float]:
    values = site_values.get("FZ", site_values.get("Fz", {}))
    beta = values.get("beta", 0.0)
    hibeta = values.get("hibeta", 0.0)
    ratio = _ratio(hibeta, beta)
    ratio_pass = _pass(ratio, low=t["hibeta_beta_min"], high=t["hibeta_beta_max"])
    return {"beta": beta, "hibeta": hibeta, "hibeta_beta": ratio, "ratio_pass": ratio_pass, "feedback": 100.0 * ratio_pass}


def _eval_fehmi(data: Dict[int, np.ndarray], channels: Dict[str, int], sampling_rate: int, t: Dict[str, float]) -> Dict[str, float]:
    signals = [_safe_signal(data.get(channel, [])) for channel in channels.values()]
    if not signals:
        summed = np.zeros(8, dtype=float)
    else:
        min_len = min(sig.size for sig in signals)
        summed = np.sum([sig[-min_len:] for sig in signals if sig.size >= min_len], axis=0)
    summed_raw = float(np.sqrt(np.mean(np.square(summed)))) if summed.size else 0.0
    alpha = _band(summed, sampling_rate, "narrow_alpha")
    alpha_pass = _pass(alpha, low=t["alpha_min"])
    return {"summed_raw": summed_raw, "summed_alpha": alpha, "alpha_pass": alpha_pass, "feedback": 100.0 * alpha_pass}


EVALUATORS: Dict[str, Callable[[Dict[str, Dict[str, float]], Dict[str, Any], Dict[str, float]], Dict[str, float]]] = {
    "reward_smr_inhibit_theta": _eval_reward_smr,
    "reward_2inhibit_1channel": _eval_reward_2inhibit,
    "fpo2_reward_2inhibit_1channel": _eval_reward_2inhibit,
    "alpha_theta_inhibit_delta_hibeta": _eval_alpha_theta,
    "o1_theta_beta_ratio_downtrain": _eval_o1_ratio,
    "f3f4_theta_alpha_balanced": _eval_f3f4_ta,
    "f3f4_band_asymmetry_reduce": _eval_f3f4_asym,
    "f3f4_alpha_downtrain_ch3_ch4": _eval_f3f4_alpha_down,
    "fz_hibeta_beta_ratio": _eval_fz_ratio,
}


def normalize_protocol_id(value: Any) -> str:
    raw = str(value or "o1_theta_beta_ratio_downtrain").strip().lower()
    raw = raw.removesuffix("_auto").removesuffix("_manual").removesuffix("_recording")
    return raw if raw in PROTOCOL_HEADERS else "o1_theta_beta_ratio_downtrain"


def default_channels_for_protocol(protocol_id: str) -> Dict[str, int]:
    return dict(DEFAULT_CHANNELS[normalize_protocol_id(protocol_id)])


def protocol_catalog() -> list[Dict[str, Any]]:
    return [
        {
            "id": protocol_id,
            "label": PROTOCOL_LABELS[protocol_id],
            "headers": headers,
            "channels": default_channels_for_protocol(protocol_id),
        }
        for protocol_id, headers in PROTOCOL_HEADERS.items()
    ]


def run_nf_training(config: Dict[str, Any], event_cb: EventCallback | None = None) -> Dict[str, Any]:
    protocol_id = normalize_protocol_id(config.get("protocol_id"))
    headers = PROTOCOL_HEADERS[protocol_id]
    total_seconds = max(1.0, _finite(config.get("total_seconds", 120), 120.0))
    window_seconds = max(0.25, min(_finite(config.get("window_seconds", 1.0), 1.0), total_seconds))
    condition = str(config.get("condition", "NF") or "NF").strip().upper()
    thresholds = _thresholds(config)
    filters = eeg_filter_config(config)

    if not config.get("channels"):
        config = {**config, "channels": default_channels_for_protocol(protocol_id)}
    channels = _resolve_channels(config)
    board_config = dict(config.get("board", {}))
    board_config["available_channels"] = sorted(channels.values())
    merged_config = {**config, "board": board_config, "sampling_rate": int(config.get("sampling_rate", 250) or 250)}

    board = create_board(merged_config)
    windows: list[Dict[str, Any]] = []
    _emit(
        event_cb,
        "nf_training_start",
        protocol_id=protocol_id,
        protocol_label=PROTOCOL_LABELS[protocol_id],
        seconds=total_seconds,
        window_seconds=window_seconds,
        headers=headers,
    )

    started_at = time.perf_counter()
    try:
        board.start()
        _emit(event_cb, "board_ready", sampling_rate=board.sampling_rate, eeg_channels=board.eeg_channels)
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
            data = {channel: np.asarray(signal, dtype=float)[-n_samples:] for channel, signal in data.items()}
            filtered_data = clean_eeg_data(data, board.sampling_rate, filters)
            site_values = _site_bands(filtered_data, channels, board.sampling_rate)

            if protocol_id == "fehmi_5site_summed_alpha_synchrony":
                values = _eval_fehmi(filtered_data, channels, board.sampling_rate, thresholds)
            else:
                values = EVALUATORS[protocol_id](site_values, {**config, "protocol_id": protocol_id}, thresholds)

            elapsed = (
                min(total_seconds, time.perf_counter() - started_at)
                if not board.runtime.fast_mode
                else min(total_seconds, (index + 1) * window_seconds)
            )
            row = [values.get(label, 0.0) for label in headers]
            window = {
                "index": index + 1,
                "elapsed_seconds": elapsed,
                "values": values,
                "row": row,
                "feedback": float(values.get("feedback", 0.0)),
                "site_values": site_values,
            }
            windows.append(window)
            _emit(
                event_cb,
                "nf_training_window",
                index=window["index"],
                elapsed_seconds=elapsed,
                protocol_id=protocol_id,
                values=values,
                feedback=window["feedback"],
            )
    finally:
        board.stop()
        _emit(event_cb, "board_stopped")

    feedback_values = [float(window["feedback"]) for window in windows]
    reward_windows = sum(1 for value in feedback_values if value > 0)
    summary = {
        "protocol_id": protocol_id,
        "protocol_label": PROTOCOL_LABELS[protocol_id],
        "window_count": len(windows),
        "reward_windows": reward_windows,
        "reward_percent": (reward_windows / len(windows) * 100.0) if windows else 0.0,
        "mean_feedback": float(sum(feedback_values) / len(feedback_values)) if feedback_values else 0.0,
    }
    result = {
        "metadata": {
            "analysis": "nf_training",
            "sampling_rate": board.sampling_rate,
            "condition": condition,
            "channels": channels,
            "protocol_id": protocol_id,
            "protocol_label": PROTOCOL_LABELS[protocol_id],
            "headers": headers,
            "total_seconds": total_seconds,
            "window_seconds": window_seconds,
            "thresholds": thresholds,
            "filters": filters,
        },
        "summary": summary,
        "windows": windows,
    }
    for key in ("profile", "tags", "notes"):
        if config.get(key):
            result["metadata"][key] = config.get(key)
    _emit(event_cb, "nf_training_complete", **summary)
    return result
