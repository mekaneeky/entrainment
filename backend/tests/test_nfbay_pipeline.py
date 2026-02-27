from __future__ import annotations

import math
import time

import numpy as np

from clinicalq_backend.nfbay.pipeline import AlphaThetaConfig, AlphaThetaNeurofeedbackPipeline


def _alpha_theta_signal(
    *,
    seconds: float,
    sampling_rate: int,
    theta_amp: float,
    alpha_amp: float,
) -> np.ndarray:
    t = np.arange(0.0, seconds, 1.0 / float(sampling_rate))
    theta = theta_amp * np.sin(2.0 * math.pi * 6.0 * t)
    alpha = alpha_amp * np.sin(2.0 * math.pi * 10.0 * t)
    return (theta + alpha).astype(float)


def test_alpha_theta_pipeline_opens_reward_gate_when_theta_dominates() -> None:
    cfg = AlphaThetaConfig(
        sampling_rate=250,
        smoothing_interval=24,
        ratio_reward_lower=1.2,
        ratio_reward_upper=20.0,
        alpha_inhibit_upper=100.0,
        session_seconds=120,
    )
    pipeline = AlphaThetaNeurofeedbackPipeline(cfg)

    signal = _alpha_theta_signal(
        seconds=8.0,
        sampling_rate=cfg.sampling_rate,
        theta_amp=18.0,
        alpha_amp=6.0,
    )
    results = pipeline.run_samples(signal)

    warmup = cfg.sampling_rate
    enabled = np.array([1.0 if row.feedback_enabled else 0.0 for row in results[warmup:]], dtype=float)
    assert enabled.mean() > 0.6


def test_alpha_theta_pipeline_blocks_feedback_with_alpha_inhibit() -> None:
    cfg = AlphaThetaConfig(
        sampling_rate=250,
        smoothing_interval=24,
        ratio_reward_lower=0.3,
        ratio_reward_upper=8.0,
        alpha_inhibit_upper=0.12,
        session_seconds=120,
    )
    pipeline = AlphaThetaNeurofeedbackPipeline(cfg)

    signal = _alpha_theta_signal(
        seconds=8.0,
        sampling_rate=cfg.sampling_rate,
        theta_amp=10.0,
        alpha_amp=25.0,
    )
    results = pipeline.run_samples(signal)

    warmup = cfg.sampling_rate
    enabled = np.array([1.0 if row.feedback_enabled else 0.0 for row in results[warmup:]], dtype=float)
    assert enabled.mean() < 0.2


def test_feedback_gate_response_latency_is_within_reasonable_window() -> None:
    cfg = AlphaThetaConfig(
        sampling_rate=250,
        smoothing_interval=16,
        ratio_reward_lower=1.2,
        ratio_reward_upper=20.0,
        alpha_inhibit_upper=100.0,
        session_seconds=120,
    )
    pipeline = AlphaThetaNeurofeedbackPipeline(cfg)

    low = _alpha_theta_signal(
        seconds=2.0,
        sampling_rate=cfg.sampling_rate,
        theta_amp=4.0,
        alpha_amp=12.0,
    )
    high = _alpha_theta_signal(
        seconds=2.0,
        sampling_rate=cfg.sampling_rate,
        theta_amp=18.0,
        alpha_amp=6.0,
    )
    signal = np.concatenate([low, high])
    transition_idx = len(low)

    results = pipeline.run_samples(signal)

    first_enabled = None
    for idx, row in enumerate(results):
        if idx >= transition_idx and row.feedback_enabled:
            first_enabled = idx
            break

    assert first_enabled is not None
    assert (first_enabled - transition_idx) <= 120


def test_alpha_theta_pipeline_throughput_and_latency_budget() -> None:
    cfg = AlphaThetaConfig(
        sampling_rate=250,
        smoothing_interval=24,
        ratio_reward_lower=1.0,
        ratio_reward_upper=8.0,
        alpha_inhibit_upper=100.0,
        session_seconds=120,
    )
    pipeline = AlphaThetaNeurofeedbackPipeline(cfg)

    rng = np.random.default_rng(0)
    samples = rng.normal(0.0, 12.0, size=cfg.sampling_rate * 120).astype(float)

    t0 = time.perf_counter()
    for sample in samples:
        pipeline.process_sample(float(sample))
    elapsed = time.perf_counter() - t0

    throughput = len(samples) / max(elapsed, 1e-9)
    per_sample_ms = elapsed / len(samples) * 1000.0

    # "No horrible latencies" target: comfortably faster than real-time at 250 Hz.
    assert throughput > 750.0
    assert per_sample_ms < 1.2
