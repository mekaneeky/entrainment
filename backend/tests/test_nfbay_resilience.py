from __future__ import annotations

import math
import time

import numpy as np
import pytest

from clinicalq_backend.nfbay import (
    DominantFrequencyBlock,
    ReferenceLockBlock,
    StickinessBlock,
    TargetCycleBlock,
    TARGET_MODE_DOMINANT_PLUS_MINUS,
    TARGET_MODE_DOMINANT_PLUS_RETURN,
)
from clinicalq_backend.nfbay.resilience import (
    MODE_DOMINANT_PLUS_RETURN,
    ResilienceSiteConfig,
    ResilienceTrainingVariant,
    SiteResilienceTrainer,
)


def _tone(*, seconds: float, sampling_rate: int, hz: float, amplitude: float = 1.0) -> np.ndarray:
    t = np.arange(0.0, seconds, 1.0 / float(sampling_rate))
    return (amplitude * np.sin(2.0 * math.pi * hz * t)).astype(float)


def test_dominant_frequency_block_tracks_peak_frequency() -> None:
    sampling_rate = 250
    signal = _tone(seconds=8.0, sampling_rate=sampling_rate, hz=10.0, amplitude=2.0)
    signal += _tone(seconds=8.0, sampling_rate=sampling_rate, hz=6.0, amplitude=0.4)

    block = DominantFrequencyBlock(
        sampling_rate=sampling_rate,
        window_seconds=2.0,
        hop_seconds=0.1,
        low_hz=4.0,
        high_hz=16.0,
    )

    outputs: list[float] = []
    for sample in signal:
        value = block.process(float(sample))
        if math.isfinite(value):
            outputs.append(float(value))

    assert outputs
    assert float(np.median(np.asarray(outputs[-20:], dtype=float))) == pytest.approx(10.0, abs=0.5)


def test_reference_lock_block_locks_to_baseline_median() -> None:
    block = ReferenceLockBlock(baseline_samples=5, fallback_hz=0.0)

    outs = [block.process(value) for value in [8.0, 10.0, 12.0, 14.0, 16.0]]
    assert outs[:-1] == [None, None, None, None]
    assert outs[-1] == pytest.approx(12.0)

    # After lock, output remains fixed regardless of future values.
    assert block.process(30.0) == pytest.approx(12.0)


def test_target_cycle_block_plus_return_switches_up_then_back_to_reference() -> None:
    block = TargetCycleBlock(
        offset_hz=2.0,
        mode=TARGET_MODE_DOMINANT_PLUS_RETURN,
        target_tolerance_hz=0.01,
        met_hold_samples=1,
        switch_cooldown_samples=0,
    )

    up_hit = block.process(12.0, 10.0)
    assert up_hit.active_phase == 0
    assert up_hit.target_hz == pytest.approx(12.0)
    assert up_hit.target_met_or_exceeded
    assert up_hit.switched_phase
    assert up_hit.next_phase == 1

    back_hit = block.process(10.0, 10.0)
    assert back_hit.active_phase == 1
    assert back_hit.target_hz == pytest.approx(10.0)
    assert back_hit.target_met_or_exceeded
    assert back_hit.switched_phase
    assert back_hit.next_phase == 0


def test_target_cycle_block_plus_minus_uses_lower_target_on_second_phase() -> None:
    block = TargetCycleBlock(
        offset_hz=2.0,
        mode=TARGET_MODE_DOMINANT_PLUS_MINUS,
        target_tolerance_hz=0.01,
        met_hold_samples=1,
        switch_cooldown_samples=0,
    )

    block.process(12.0, 10.0)  # Switches to phase 1 after meeting dominant + offset.
    second_phase = block.process(8.0, 10.0)

    assert second_phase.active_phase == 1
    assert second_phase.target_hz == pytest.approx(8.0)
    assert second_phase.target_met_or_exceeded
    assert second_phase.switched_phase
    assert second_phase.next_phase == 0


def test_stickiness_block_rolling_window_ratio_and_seconds() -> None:
    block = StickinessBlock(sampling_rate=10, window_seconds=6.0)  # 60 samples

    out = None
    for _ in range(30):
        out = block.process(True)
    assert out is not None
    assert out.ratio == pytest.approx(1.0)
    assert out.met_seconds == pytest.approx(3.0)

    for _ in range(30):
        out = block.process(False)
    assert out is not None
    assert out.window_size_samples == 60
    assert out.met_count == 30
    assert out.ratio == pytest.approx(0.5)
    assert out.met_seconds == pytest.approx(3.0)

    for _ in range(60):
        out = block.process(False)
    assert out is not None
    assert out.met_count == 0
    assert out.ratio == pytest.approx(0.0)
    assert out.met_seconds == pytest.approx(0.0)


def test_site_resilience_trainer_switches_across_both_training_phases() -> None:
    sampling_rate = 100
    cfg = ResilienceSiteConfig(
        sampling_rate=sampling_rate,
        baseline_seconds=1.0,
        offset_hz=2.0,
        target_mode=MODE_DOMINANT_PLUS_RETURN,
        target_tolerance_hz=0.25,
        analysis_window_seconds=1.0,
        analysis_hop_seconds=0.1,
        dominant_band_low_hz=6.0,
        dominant_band_high_hz=14.0,
        stickiness_window_seconds=60.0,
        switch_cooldown_seconds=0.0,
    )
    trainer = SiteResilienceTrainer(site="Pz", config=cfg)

    signal = np.concatenate(
        [
            _tone(seconds=3.0, sampling_rate=sampling_rate, hz=10.0),
            _tone(seconds=3.0, sampling_rate=sampling_rate, hz=12.0),
            _tone(seconds=3.0, sampling_rate=sampling_rate, hz=10.0),
        ]
    )
    results = [trainer.process_sample(float(sample)) for sample in signal]

    ready = [row for row in results if row.ready]
    assert ready
    assert any(row.target_met_or_exceeded for row in ready)
    assert sum(1 for row in ready if row.switched_phase) >= 2
    assert {row.active_phase for row in ready} == {0, 1}
    assert 0.0 <= ready[-1].stickiness_ratio_60s <= 1.0


def test_resilience_variant_combines_site_feedback_by_mean() -> None:
    cfg = ResilienceSiteConfig(
        sampling_rate=100,
        baseline_seconds=0.5,
        analysis_window_seconds=1.0,
        analysis_hop_seconds=0.1,
        switch_cooldown_seconds=0.0,
    )
    variant = ResilienceTrainingVariant({"Fz": cfg, "Pz": cfg}, combine_mode="mean")

    for idx in range(300):
        sample = math.sin(2.0 * math.pi * 10.0 * (idx / 100.0))
        step = variant.process_site_samples({"Fz": sample, "Pz": -sample})

    assert set(step.by_site.keys()) == {"Fz", "Pz"}
    expected = (step.by_site["Fz"].feedback_signal + step.by_site["Pz"].feedback_signal) / 2.0
    assert step.combined_feedback_signal == pytest.approx(expected)


def test_resilience_switch_latency_is_reasonable_after_frequency_shift() -> None:
    sampling_rate = 100
    cfg = ResilienceSiteConfig(
        sampling_rate=sampling_rate,
        baseline_seconds=1.0,
        offset_hz=2.0,
        target_mode=MODE_DOMINANT_PLUS_RETURN,
        target_tolerance_hz=0.25,
        analysis_window_seconds=1.0,
        analysis_hop_seconds=0.1,
        dominant_band_low_hz=6.0,
        dominant_band_high_hz=14.0,
        switch_cooldown_seconds=0.0,
    )
    trainer = SiteResilienceTrainer(site="Cz", config=cfg)

    low = _tone(seconds=2.0, sampling_rate=sampling_rate, hz=10.0)
    high = _tone(seconds=3.0, sampling_rate=sampling_rate, hz=12.0)
    signal = np.concatenate([low, high])
    transition_idx = len(low)

    first_switch_idx = None
    for idx, sample in enumerate(signal):
        row = trainer.process_sample(float(sample))
        if idx >= transition_idx and row.switched_phase and row.active_phase == 0:
            first_switch_idx = idx
            break

    assert first_switch_idx is not None
    assert (first_switch_idx - transition_idx) <= 150


def test_resilience_site_trainer_throughput_budget() -> None:
    cfg = ResilienceSiteConfig(
        sampling_rate=250,
        baseline_seconds=1.0,
        analysis_window_seconds=1.0,
        analysis_hop_seconds=0.1,
        target_tolerance_hz=0.25,
        switch_cooldown_seconds=0.0,
    )
    trainer = SiteResilienceTrainer(site="Oz", config=cfg)

    rng = np.random.default_rng(7)
    samples = rng.normal(0.0, 10.0, size=cfg.sampling_rate * 120).astype(float)

    t0 = time.perf_counter()
    for sample in samples:
        trainer.process_sample(float(sample))
    elapsed = time.perf_counter() - t0

    throughput = len(samples) / max(elapsed, 1e-9)
    per_sample_ms = elapsed / len(samples) * 1000.0

    # "No horrible latencies" target: faster than real-time at 250 Hz with room.
    assert throughput > 500.0
    assert per_sample_ms < 2.0
