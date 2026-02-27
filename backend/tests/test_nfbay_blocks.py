from __future__ import annotations

import math

import numpy as np
import pytest

from clinicalq_backend.nfbay import (
    INVALID_VALUE,
    THRESHOLD_ADAPTMODE_RANGE,
    AndBlock,
    AverageBlock,
    FilterBlock,
    MagnitudeBlock,
    NotBlock,
    OrBlock,
    SignalBlock,
    ThresholdBlock,
    TranslateBlock,
)


def test_average_block_sliding_window_and_invalid_input() -> None:
    block = AverageBlock(interval=3)

    out1 = block.process(1.0)
    out2 = block.process(2.0)
    out3 = block.process(3.0)
    out4 = block.process(4.0)

    assert out1 == pytest.approx(1.0)
    assert out2 == pytest.approx(1.5)
    assert out3 == pytest.approx(2.0)
    assert out4 == pytest.approx(3.0)

    # Invalid samples are ignored; moving average stays stable.
    out_invalid = block.process(INVALID_VALUE)
    assert out_invalid == pytest.approx(3.0)


def test_filter_block_bandpass_prefers_target_band() -> None:
    sampling_rate = 250
    t = np.arange(0, 4.0, 1.0 / sampling_rate)

    target = np.sin(2.0 * math.pi * 10.0 * t)
    offband = np.sin(2.0 * math.pi * 2.0 * t)

    block = FilterBlock(
        filter_type="bandpass_bessel",
        order=8,
        par1=8.0,
        par2=12.0,
        sampling_rate=sampling_rate,
    )

    target_out = np.array([block.process(float(v)) for v in target], dtype=float)
    block.reset()
    offband_out = np.array([block.process(float(v)) for v in offband], dtype=float)

    target_rms = float(np.sqrt(np.mean(np.square(target_out[-sampling_rate:]))))
    offband_rms = float(np.sqrt(np.mean(np.square(offband_out[-sampling_rate:]))))

    assert target_rms > offband_rms * 2.0


def test_magnitude_block_tracks_configured_band() -> None:
    sampling_rate = 250
    t = np.arange(0, 4.0, 1.0 / sampling_rate)

    in_band = 20.0 * np.sin(2.0 * math.pi * 10.0 * t)
    out_band = 20.0 * np.sin(2.0 * math.pi * 20.0 * t)

    block = MagnitudeBlock(center_hz=10.0, width_hz=2.0, order=4, gain=100.0, sampling_rate=sampling_rate)

    in_band_mag = np.array([block.process(float(v)) for v in in_band], dtype=float)
    block.reset()
    out_band_mag = np.array([block.process(float(v)) for v in out_band], dtype=float)

    in_band_mean = float(np.mean(in_band_mag[-sampling_rate:]))
    out_band_mean = float(np.mean(out_band_mag[-sampling_rate:]))

    assert in_band_mean > out_band_mean * 2.0


def test_threshold_block_range_gate_and_adaptation() -> None:
    block = ThresholdBlock(
        interval_len=1,
        signal_gain=100.0,
        lower_limit=1.0,
        upper_limit=3.0,
        op_and=True,
        true_mode=0,
        false_mode=0,
        input_min=0.0,
        input_max=10.0,
    )

    low = block.process(0.5)
    ok = block.process(2.0)
    high = block.process(4.0)

    assert low.main == INVALID_VALUE
    assert ok.main == pytest.approx(2.0)
    assert high.main == INVALID_VALUE

    adaptive = ThresholdBlock(
        interval_len=1,
        signal_gain=100.0,
        lower_limit=0.0,
        upper_limit=10.0,
        op_and=True,
        adapt_lower_mode=THRESHOLD_ADAPTMODE_RANGE,
        adapt_upper_mode=THRESHOLD_ADAPTMODE_RANGE,
        adapt_lower_limit=50.0,
        adapt_upper_limit=75.0,
        adapt_interval=5,
        input_min=0.0,
        input_max=10.0,
    )

    for value in [1.0, 2.0, 3.0, 4.0, 5.0]:
        adaptive.process(value)

    assert adaptive.lower_limit == pytest.approx(3.0, abs=0.2)
    assert adaptive.upper_limit == pytest.approx(4.0, abs=0.3)


def test_boolean_logic_blocks() -> None:
    and_block = AndBlock(binary=False, true_mode=3, numeric_true_value=1.0, false_mode=0)
    or_block = OrBlock(binary=False, true_mode=3, numeric_true_value=1.0, false_mode=0)
    not_block = NotBlock(binary=False, true_mode=1, numeric_true_value=1.0, false_mode=0)

    assert and_block.process(1.0, 2.0) == pytest.approx(1.0)
    assert and_block.process(1.0, INVALID_VALUE) == INVALID_VALUE

    assert or_block.process(INVALID_VALUE, 2.0) == pytest.approx(1.0)
    assert or_block.process(INVALID_VALUE, INVALID_VALUE) == INVALID_VALUE

    assert not_block.process(INVALID_VALUE) == pytest.approx(1.0)
    assert not_block.process(3.0) == INVALID_VALUE


def test_translate_block_piecewise_mapping() -> None:
    block = TranslateBlock(
        input_min=0.0,
        input_max=10.0,
        output_min=0.0,
        output_max=100.0,
        points=[(0, 0.0), (512, 1.0), (1023, 0.0)],
    )

    low = block.process(0.0)
    mid = block.process(5.0)
    high = block.process(10.0)

    assert low == pytest.approx(0.0, abs=0.5)
    assert mid > 80.0
    assert high == pytest.approx(0.0, abs=2.0)


def test_signal_block_generates_wave_and_supports_live_frequency_input() -> None:
    block = SignalBlock(
        frequency=1.0,
        gain=200.0,
        center=0.0,
        phase=0.0,
        noise=0,
        sampling_rate=20,
        enable_in=True,
    )

    values = [block.process(1.0, 0.0) for _ in range(20)]
    assert max(values) - min(values) > 50.0

    # Drive frequency from input and confirm oscillation rate changes.
    block.reset()
    slow = [block.process(0.5, 0.0) for _ in range(20)]
    block.reset()
    fast = [block.process(4.0, 0.0) for _ in range(20)]

    slow_zero_crossings = np.sum(np.sign(slow[:-1]) != np.sign(slow[1:]))
    fast_zero_crossings = np.sum(np.sign(fast[:-1]) != np.sign(fast[1:]))
    assert fast_zero_crossings > slow_zero_crossings
