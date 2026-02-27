from __future__ import annotations

from dataclasses import fields, is_dataclass
import math
import time
from typing import Any

import numpy as np

from clinicalq_backend.nfbay.constants import INVALID_VALUE
from clinicalq_backend.nfbay.pipeline import AlphaThetaConfig, AlphaThetaNeurofeedbackPipeline, AlphaThetaStepResult
from clinicalq_backend.nfbay.resilience import (
    MODE_DOMINANT_PLUS_RETURN,
    MultiSiteResilienceStepResult,
    ResilienceSiteConfig,
    ResilienceTrainingVariant,
)
from clinicalq_backend.openbci import create_board
from clinicalq_backend.types import EventCallback


DEFAULT_NFBAY_CONFIG: dict[str, Any] = {
    "variant": "alpha_theta",
    "duration_seconds": 180,
    "sampling_rate": 250,
    "event_hz": 20,
    "fast_mode": False,
    "board": {
        "board_id": "cyton",
        "serial_port": "COM3",
        "use_synthetic": True,
        "available_channels": [1, 2, 3, 4, 5, 6, 7, 8],
        "seed": 42,
    },
    # Fallback channel map for variants that do not specify per-site channels.
    "channels": {"Cz": 1, "Pz": 2, "O1": 3, "Fz": 4, "F3": 5, "F4": 6},
    "alpha_theta": {
        "channel": 1,
        "session_seconds": 180,
        "alpha_center_hz": 10.0,
        "alpha_width_hz": 2.0,
        "theta_center_hz": 6.0,
        "theta_width_hz": 2.0,
        "magnitude_order": 4,
        "smoothing_interval": 24,
        "ratio_reward_lower": 1.2,
        "ratio_reward_upper": 10.0,
        "alpha_inhibit_upper": 30.0,
        "enable_adaptive_ratio": False,
        "ratio_adapt_percentile": 50.0,
        "ratio_adapt_interval": 500,
        "feedback_frequency_hz": 220.0,
        "feedback_gain": 180.0,
        "feedback_noise": 0,
    },
    "resilience": {
        "combine_mode": "mean",
        "sites": {
            "Cz": {
                "channel": 1,
                "offset_hz": 2.0,
                "target_mode": MODE_DOMINANT_PLUS_RETURN,
                "target_tolerance_hz": 0.05,
                "baseline_seconds": 5.0,
                "analysis_window_seconds": 2.0,
                "analysis_hop_seconds": 0.25,
                "dominant_band_low_hz": 4.0,
                "dominant_band_high_hz": 16.0,
                "tone_a_hz": 440.0,
                "tone_b_hz": 660.0,
                "tone_gain": 180.0,
                "tone_noise": 0,
                "stickiness_window_seconds": 60.0,
                "met_hold_samples": 1,
                "switch_cooldown_seconds": 0.15,
            }
        },
    },
}


def _emit(event_cb: EventCallback | None, event: str, **payload: Any) -> None:
    if not event_cb:
        return
    event_cb({"event": event, **payload})


def _dataclass_kwargs(cls: type[Any], source: dict[str, Any]) -> dict[str, Any]:
    if not is_dataclass(cls):
        return {}
    valid = {f.name for f in fields(cls) if f.init}
    return {k: v for k, v in source.items() if k in valid}


def _as_int(value: Any, fallback: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return int(fallback)
    return int(parsed)


def _as_float(value: Any, fallback: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return float(fallback)
    if not math.isfinite(parsed):
        return float(fallback)
    return float(parsed)


def _alpha_step_payload(step: AlphaThetaStepResult) -> dict[str, Any]:
    def _clean(value: float) -> float | None:
        numeric = float(value)
        if not math.isfinite(numeric) or numeric == INVALID_VALUE:
            return None
        return numeric

    return {
        "sample_index": int(step.sample_index),
        "alpha": _clean(step.alpha),
        "theta": _clean(step.theta),
        "ratio": _clean(step.ratio),
        "reward_gate": bool(step.reward_gate),
        "inhibit_gate": bool(step.inhibit_gate),
        "feedback_enabled": bool(step.feedback_enabled),
        "feedback_level": _clean(step.feedback_level),
        "feedback_signal": float(step.feedback_signal),
        "reward_lower": float(step.reward_lower),
        "reward_upper": float(step.reward_upper),
        "inhibit_upper": float(step.inhibit_upper),
        "remaining_seconds": float(step.remaining_seconds),
        "done": bool(step.done),
    }


def _resilience_step_payload(step: MultiSiteResilienceStepResult) -> dict[str, Any]:
    by_site: dict[str, dict[str, Any]] = {}
    for site, row in step.by_site.items():
        by_site[str(site)] = {
            "sample_index": int(row.sample_index),
            "ready": bool(row.ready),
            "dominant_hz": float(row.dominant_hz),
            "reference_dominant_hz": float(row.reference_dominant_hz),
            "current_target_hz": float(row.current_target_hz),
            "target_met_or_exceeded": bool(row.target_met_or_exceeded),
            "active_phase": int(row.active_phase),
            "switched_phase": bool(row.switched_phase),
            "active_tone_hz": float(row.active_tone_hz),
            "feedback_signal": float(row.feedback_signal),
            "stickiness_ratio_60s": float(row.stickiness_ratio_60s),
            "stickiness_met_seconds_60s": float(row.stickiness_met_seconds_60s),
            "stickiness_met_count_60s": int(row.stickiness_met_count_60s),
        }

    return {
        "sample_index": int(step.sample_index),
        "combined_feedback_signal": float(step.combined_feedback_signal),
        "by_site": by_site,
    }


def _extract_alpha_theta_channel(config: dict[str, Any], channels: dict[str, int]) -> int:
    alpha_cfg = dict(config.get("alpha_theta", {}))
    if "channel" in alpha_cfg:
        return max(1, _as_int(alpha_cfg.get("channel"), 1))
    if "channel" in config:
        return max(1, _as_int(config.get("channel"), 1))
    return max(1, _as_int(channels.get("Cz"), 1))


def _build_alpha_theta_runtime(config: dict[str, Any], sampling_rate: int) -> tuple[AlphaThetaNeurofeedbackPipeline, int]:
    channels = {str(k): _as_int(v, 1) for k, v in dict(config.get("channels", {})).items()}
    alpha_cfg = dict(config.get("alpha_theta", {}))
    alpha_cfg["sampling_rate"] = int(sampling_rate)
    alpha_cfg["session_seconds"] = max(1, _as_int(config.get("duration_seconds"), 180))
    pipeline_cfg = AlphaThetaConfig(**_dataclass_kwargs(AlphaThetaConfig, alpha_cfg))
    pipeline = AlphaThetaNeurofeedbackPipeline(pipeline_cfg)
    channel = _extract_alpha_theta_channel(config, channels)
    return pipeline, int(channel)


def _build_resilience_runtime(
    config: dict[str, Any], sampling_rate: int
) -> tuple[ResilienceTrainingVariant, dict[str, int]]:
    channels = {str(k): _as_int(v, 1) for k, v in dict(config.get("channels", {})).items()}
    resilience_cfg = dict(config.get("resilience", {}))
    raw_sites = resilience_cfg.get("sites")
    if not isinstance(raw_sites, dict) or not raw_sites:
        raw_sites = {"Cz": {"channel": channels.get("Cz", 1)}}

    site_cfgs: dict[str, ResilienceSiteConfig] = {}
    site_channels: dict[str, int] = {}

    for site, site_data in raw_sites.items():
        site_name = str(site)
        payload = dict(site_data or {})
        channel = max(1, _as_int(payload.pop("channel", channels.get(site_name, 1)), 1))
        payload["sampling_rate"] = int(sampling_rate)
        site_cfgs[site_name] = ResilienceSiteConfig(**_dataclass_kwargs(ResilienceSiteConfig, payload))
        site_channels[site_name] = channel

    combine_mode = str(resilience_cfg.get("combine_mode", "mean")).strip().lower()
    variant = ResilienceTrainingVariant(site_cfgs, combine_mode=combine_mode)
    return variant, site_channels


def run_nfbay_session(config: dict[str, Any], event_cb: EventCallback | None = None) -> dict[str, Any]:
    variant = str(config.get("variant", "alpha_theta")).strip().lower()
    if variant not in {"alpha_theta", "resilience"}:
        raise RuntimeError("Unsupported nfbay variant. Use 'alpha_theta' or 'resilience'.")

    requested_sr = max(1, _as_int(config.get("sampling_rate"), 250))
    duration_seconds = max(1.0, _as_float(config.get("duration_seconds"), 180.0))
    event_hz = max(1.0, _as_float(config.get("event_hz"), 20.0))
    fast_mode = bool(config.get("fast_mode", False))
    actual_sampling_rate = requested_sr

    board_config = dict(config)
    board_config["sampling_rate"] = requested_sr
    board = create_board(board_config)

    _emit(event_cb, "nfbay_start", variant=variant, duration_seconds=duration_seconds, requested_sampling_rate=requested_sr)

    last_tick_time = time.perf_counter()
    samples_processed = 0
    final_payload: dict[str, Any] = {}

    alpha_feedback_enabled = 0
    alpha_ratio_sum = 0.0
    alpha_ratio_count = 0
    alpha_ratio_min = float("inf")
    alpha_ratio_max = float("-inf")

    res_phase_switches: dict[str, int] = {}
    res_target_hits: dict[str, int] = {}
    res_last_stickiness: dict[str, float] = {}
    res_combined_signal_sum = 0.0

    pipeline: AlphaThetaNeurofeedbackPipeline | None = None
    alpha_channel = 1
    resilience_variant: ResilienceTrainingVariant | None = None
    resilience_channels: dict[str, int] = {}

    try:
        board.start()
        sampling_rate = int(board.sampling_rate)
        actual_sampling_rate = sampling_rate
        total_samples = max(1, int(duration_seconds * sampling_rate))
        update_samples = max(1, int(sampling_rate / event_hz))
        chunk_samples = max(1, min(update_samples, int(sampling_rate / 10)))

        _emit(
            event_cb,
            "nfbay_board_ready",
            variant=variant,
            sampling_rate=sampling_rate,
            eeg_channels=list(board.eeg_channels),
            total_samples=total_samples,
            update_samples=update_samples,
        )

        if variant == "alpha_theta":
            pipeline, alpha_channel = _build_alpha_theta_runtime(config, sampling_rate)
            if alpha_channel not in board.eeg_channels:
                raise RuntimeError(
                    f"Alpha/theta channel {alpha_channel} is not available on the selected board."
                )
        else:
            resilience_variant, resilience_channels = _build_resilience_runtime(config, sampling_rate)
            missing = [f"{site}:{ch}" for site, ch in resilience_channels.items() if ch not in board.eeg_channels]
            if missing:
                raise RuntimeError(
                    "Resilience channels are not available on the selected board: " + ", ".join(missing)
                )
            for site in resilience_channels:
                res_phase_switches[site] = 0
                res_target_hits[site] = 0
                res_last_stickiness[site] = 0.0

        while samples_processed < total_samples:
            remaining = total_samples - samples_processed
            n_request = min(chunk_samples, remaining)
            chunk = board.read_chunk(int(n_request), label=variant) or {}
            if not chunk:
                if not fast_mode:
                    time.sleep(0.002)
                continue

            if variant == "alpha_theta":
                assert pipeline is not None
                signal = np.asarray(chunk.get(alpha_channel, []), dtype=float)
                if signal.size == 0:
                    if not fast_mode:
                        time.sleep(0.001)
                    continue

                usable = min(int(signal.size), remaining)
                for i in range(usable):
                    step = pipeline.process_sample(float(signal[i]))
                    payload = _alpha_step_payload(step)
                    final_payload = payload
                    samples_processed += 1

                    ratio = payload.get("ratio")
                    if isinstance(ratio, (int, float)) and math.isfinite(float(ratio)):
                        numeric_ratio = float(ratio)
                        alpha_ratio_sum += numeric_ratio
                        alpha_ratio_count += 1
                        alpha_ratio_min = min(alpha_ratio_min, numeric_ratio)
                        alpha_ratio_max = max(alpha_ratio_max, numeric_ratio)
                    if bool(step.feedback_enabled):
                        alpha_feedback_enabled += 1

                    if samples_processed % update_samples == 0 or samples_processed >= total_samples:
                        now = time.perf_counter()
                        elapsed = now - last_tick_time
                        last_tick_time = now
                        _emit(
                            event_cb,
                            "nfbay_tick",
                            variant=variant,
                            sample_index=samples_processed - 1,
                            samples_processed=samples_processed,
                            total_samples=total_samples,
                            elapsed_since_last_tick=elapsed,
                            data=payload,
                        )
            else:
                assert resilience_variant is not None
                site_arrays: dict[str, np.ndarray] = {}
                for site, ch in resilience_channels.items():
                    values = np.asarray(chunk.get(ch, []), dtype=float)
                    if values.size == 0:
                        site_arrays = {}
                        break
                    site_arrays[site] = values

                if not site_arrays:
                    if not fast_mode:
                        time.sleep(0.001)
                    continue

                usable = min(int(min(arr.size for arr in site_arrays.values())), remaining)
                for i in range(usable):
                    sample_by_site = {site: float(arr[i]) for site, arr in site_arrays.items()}
                    step = resilience_variant.process_site_samples(sample_by_site)
                    payload = _resilience_step_payload(step)
                    final_payload = payload
                    samples_processed += 1

                    res_combined_signal_sum += float(step.combined_feedback_signal)
                    for site, row in step.by_site.items():
                        if bool(row.switched_phase):
                            res_phase_switches[site] = res_phase_switches.get(site, 0) + 1
                        if bool(row.target_met_or_exceeded):
                            res_target_hits[site] = res_target_hits.get(site, 0) + 1
                        res_last_stickiness[site] = float(row.stickiness_ratio_60s)

                    if samples_processed % update_samples == 0 or samples_processed >= total_samples:
                        now = time.perf_counter()
                        elapsed = now - last_tick_time
                        last_tick_time = now
                        _emit(
                            event_cb,
                            "nfbay_tick",
                            variant=variant,
                            sample_index=samples_processed - 1,
                            samples_processed=samples_processed,
                            total_samples=total_samples,
                            elapsed_since_last_tick=elapsed,
                            data=payload,
                        )
    finally:
        board.stop()
        _emit(event_cb, "nfbay_board_stopped", variant=variant)

    if variant == "alpha_theta":
        summary = {
            "feedback_enabled_samples": int(alpha_feedback_enabled),
            "feedback_enabled_ratio": float(alpha_feedback_enabled / max(1, samples_processed)),
            "ratio_mean": float(alpha_ratio_sum / max(1, alpha_ratio_count)),
            "ratio_min": float(alpha_ratio_min) if math.isfinite(alpha_ratio_min) else None,
            "ratio_max": float(alpha_ratio_max) if math.isfinite(alpha_ratio_max) else None,
        }
    else:
        summary = {
            "combined_feedback_mean": float(res_combined_signal_sum / max(1, samples_processed)),
            "phase_switches_by_site": {k: int(v) for k, v in res_phase_switches.items()},
            "target_hits_by_site": {k: int(v) for k, v in res_target_hits.items()},
            "stickiness_ratio_60s_by_site": {k: float(v) for k, v in res_last_stickiness.items()},
        }

    result = {
        "variant": variant,
        "duration_seconds": duration_seconds,
        "samples_processed": int(samples_processed),
        "sampling_rate": int(actual_sampling_rate),
        "summary": summary,
        "final_step": final_payload,
    }
    _emit(event_cb, "nfbay_complete", variant=variant, samples_processed=samples_processed, summary=summary)
    return result


__all__ = [
    "DEFAULT_NFBAY_CONFIG",
    "run_nfbay_session",
]
