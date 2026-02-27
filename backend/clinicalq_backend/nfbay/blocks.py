from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
import math
import random
from typing import Sequence

import numpy as np

from clinicalq_backend.nfbay.constants import (
    INVALID_VALUE,
    THRESHOLD_ADAPTMODE_AVERAGE,
    THRESHOLD_ADAPTMODE_NONE,
    THRESHOLD_ADAPTMODE_QUANTILE,
    THRESHOLD_ADAPTMODE_RANGE,
    TRUE_VALUE,
)

SIG_SINUS = 0
SIG_SAWTOOTH = 1
SIG_RECTANGLE = 2
SIG_RAMP = 3

TARGET_MODE_DOMINANT_PLUS_RETURN = "dominant_plus_return"
TARGET_MODE_DOMINANT_PLUS_MINUS = "dominant_plus_minus"


def is_valid(value: float | None) -> bool:
    if value is None:
        return False
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return False
    return math.isfinite(numeric) and numeric != INVALID_VALUE


def size_value(
    src_min: float,
    src_max: float,
    value: float,
    dst_min: float,
    dst_max: float,
    clip: bool,
) -> float:
    if src_max == src_min:
        return float(dst_min)

    mapped = ((value - src_min) / (src_max - src_min)) * (dst_max - dst_min) + dst_min
    if not clip:
        return float(mapped)

    lo = min(dst_min, dst_max)
    hi = max(dst_min, dst_max)
    if mapped < lo:
        return float(lo)
    if mapped > hi:
        return float(hi)
    return float(mapped)


class _OnePoleLowPass:
    def __init__(self, cutoff_hz: float, sampling_rate: int):
        self.sampling_rate = max(1, int(sampling_rate))
        self.alpha = 1.0
        self.y = 0.0
        self.set_cutoff(cutoff_hz)

    def set_cutoff(self, cutoff_hz: float) -> None:
        cutoff = max(1e-6, float(cutoff_hz))
        dt = 1.0 / float(self.sampling_rate)
        rc = 1.0 / (2.0 * math.pi * cutoff)
        self.alpha = dt / (rc + dt)

    def reset(self) -> None:
        self.y = 0.0

    def process(self, value: float) -> float:
        self.y = self.y + self.alpha * (value - self.y)
        return self.y


class _OnePoleHighPass:
    def __init__(self, cutoff_hz: float, sampling_rate: int):
        self.sampling_rate = max(1, int(sampling_rate))
        self.alpha = 1.0
        self.y_prev = 0.0
        self.x_prev = 0.0
        self.set_cutoff(cutoff_hz)

    def set_cutoff(self, cutoff_hz: float) -> None:
        cutoff = max(1e-6, float(cutoff_hz))
        dt = 1.0 / float(self.sampling_rate)
        rc = 1.0 / (2.0 * math.pi * cutoff)
        self.alpha = rc / (rc + dt)

    def reset(self) -> None:
        self.y_prev = 0.0
        self.x_prev = 0.0

    def process(self, value: float) -> float:
        y = self.alpha * (self.y_prev + value - self.x_prev)
        self.x_prev = value
        self.y_prev = y
        return y


class _CascadedLowPass:
    def __init__(self, cutoff_hz: float, sampling_rate: int, order: int):
        stage_count = max(1, int(order))
        self.stages = [_OnePoleLowPass(cutoff_hz, sampling_rate) for _ in range(stage_count)]

    def reset(self) -> None:
        for stage in self.stages:
            stage.reset()

    def process(self, value: float) -> float:
        out = value
        for stage in self.stages:
            out = stage.process(out)
        return out


class _CascadedHighPass:
    def __init__(self, cutoff_hz: float, sampling_rate: int, order: int):
        stage_count = max(1, int(order))
        self.stages = [_OnePoleHighPass(cutoff_hz, sampling_rate) for _ in range(stage_count)]

    def reset(self) -> None:
        for stage in self.stages:
            stage.reset()

    def process(self, value: float) -> float:
        out = value
        for stage in self.stages:
            out = stage.process(out)
        return out


_FILTER_ALIASES = {
    "bsre": "bandstop_resonator",
    "lpbe": "lowpass_bessel",
    "hpbe": "highpass_bessel",
    "bpbe": "bandpass_bessel",
    "bsbe": "bandstop_bessel",
    "lpbu": "lowpass_butterworth",
    "hpbu": "highpass_butterworth",
    "bpbu": "bandpass_butterworth",
    "bsbu": "bandstop_butterworth",
}


def _normalize_filter_type(name: str) -> str:
    normalized = str(name).strip().lower().replace("-", "_")
    normalized = normalized.replace(" ", "_")
    return _FILTER_ALIASES.get(normalized, normalized)


@dataclass(slots=True)
class FilterBlock:
    filter_type: str = "bandpass_bessel"
    order: int = 8
    par1: float = 8.0
    par2: float = 12.0
    sampling_rate: int = 250

    _lp: _CascadedLowPass = field(init=False)
    _hp: _CascadedHighPass = field(init=False)
    _bp_hp: _CascadedHighPass = field(init=False)
    _bp_lp: _CascadedLowPass = field(init=False)

    def __post_init__(self) -> None:
        self.filter_type = _normalize_filter_type(self.filter_type)
        self.order = max(1, min(int(self.order), 60))
        self.par1 = float(self.par1)
        self.par2 = float(self.par2)
        if self.par2 <= self.par1:
            self.par2 = self.par1 + 0.1
        self._lp = _CascadedLowPass(self.par1, self.sampling_rate, self.order)
        self._hp = _CascadedHighPass(self.par1, self.sampling_rate, self.order)
        self._bp_hp = _CascadedHighPass(self.par1, self.sampling_rate, self.order)
        self._bp_lp = _CascadedLowPass(self.par2, self.sampling_rate, self.order)

    def reset(self) -> None:
        self._lp.reset()
        self._hp.reset()
        self._bp_hp.reset()
        self._bp_lp.reset()

    def process(self, value: float | None) -> float:
        if not is_valid(value):
            return INVALID_VALUE

        x = float(value)
        mode = self.filter_type

        if mode in {"lowpass_bessel", "lowpass_butterworth"}:
            return self._lp.process(x)

        if mode in {"highpass_bessel", "highpass_butterworth"}:
            return self._hp.process(x)

        if mode in {"bandpass_bessel", "bandpass_butterworth"}:
            return self._bp_lp.process(self._bp_hp.process(x))

        if mode in {"bandstop_resonator", "bandstop_bessel", "bandstop_butterworth"}:
            bp = self._bp_lp.process(self._bp_hp.process(x))
            return x - bp

        return x


@dataclass(slots=True)
class MagnitudeBlock:
    center_hz: float = 10.0
    width_hz: float = 2.0
    order: int = 4
    gain: float = 100.0
    sampling_rate: int = 250

    _phase: float = field(default=0.0, init=False)
    _phase_inc: float = field(default=0.0, init=False)
    _lp_i: _CascadedLowPass = field(init=False)
    _lp_q: _CascadedLowPass = field(init=False)

    def __post_init__(self) -> None:
        self.order = max(1, min(int(self.order), 60))
        self.center_hz = float(self.center_hz)
        self.width_hz = max(0.1, float(self.width_hz))
        self._phase_inc = 2.0 * math.pi * self.center_hz / float(max(1, self.sampling_rate))
        self._lp_i = _CascadedLowPass(self.width_hz, self.sampling_rate, self.order)
        self._lp_q = _CascadedLowPass(self.width_hz, self.sampling_rate, self.order)

    def reset(self) -> None:
        self._phase = 0.0
        self._lp_i.reset()
        self._lp_q.reset()

    def process(self, value: float | None) -> float:
        if not is_valid(value):
            return INVALID_VALUE

        self._phase += self._phase_inc
        if self._phase > math.tau:
            self._phase -= math.tau

        x = float(value)
        i_sig = math.sin(self._phase) * x
        q_sig = math.cos(self._phase) * x

        i_f = self._lp_i.process(i_sig)
        q_f = self._lp_q.process(q_sig)

        return float(2.0 * math.sqrt(i_f * i_f + q_f * q_f) * self.gain / 100.0)


@dataclass(slots=True)
class AverageBlock:
    interval: int = 1
    max_samples: int = 20000

    _accumulator: float = field(default=0.0, init=False)
    _added: int = field(default=0, init=False)
    _writepos: int = field(default=0, init=False)
    _samples: list[float] = field(init=False)

    def __post_init__(self) -> None:
        self.max_samples = max(2, int(self.max_samples))
        self.interval = max(1, min(int(self.interval), self.max_samples - 1))
        self._samples = [0.0] * self.max_samples

    def reset(self) -> None:
        self._accumulator = 0.0
        self._added = 0
        self._writepos = 0
        for i in range(self.max_samples):
            self._samples[i] = 0.0

    def set_interval(self, interval: int) -> None:
        self.interval = max(1, min(int(interval), self.max_samples - 1))
        self.reset()

    def process(self, value: float | None) -> float:
        if is_valid(value):
            v = float(value)
            self._accumulator += v
            self._added += 1

            self._samples[self._writepos] = v
            if self._added > self.interval:
                oldest = self._writepos - self.interval
                if oldest < 0:
                    oldest += self.max_samples
                self._accumulator -= self._samples[oldest]
                self._added = self.interval

            self._writepos += 1
            if self._writepos >= self.max_samples:
                self._writepos = 0

        if self._added <= 0:
            return INVALID_VALUE
        return float(self._accumulator / float(self._added))


@dataclass(slots=True)
class RatioBlock:
    epsilon: float = 1e-9

    def process(self, numerator: float | None, denominator: float | None) -> float:
        if not is_valid(numerator) or not is_valid(denominator):
            return INVALID_VALUE

        den = float(denominator)
        if abs(den) <= self.epsilon:
            return INVALID_VALUE
        return float(float(numerator) / den)


@dataclass(slots=True)
class ThresholdResult:
    main: float | None
    lower_limit: float
    upper_limit: float
    current_value: float
    passed: bool


@dataclass(slots=True)
class ThresholdBlock:
    interval_len: int = 1
    signal_gain: float = 100.0
    lower_limit: float = 1.0
    upper_limit: float = 512.0
    op_and: bool = True
    rising: bool = False
    falling: bool = False
    baseline: bool = False
    adapt_lower_limit: float = 0.0
    adapt_upper_limit: float = 0.0
    adapt_lower_mode: int = THRESHOLD_ADAPTMODE_NONE
    adapt_upper_mode: int = THRESHOLD_ADAPTMODE_NONE
    adapt_interval: int = 200
    true_mode: int = 0
    false_mode: int = 0
    numeric_true_value: float = 1.0
    numeric_false_value: float = 0.0
    sampling_rate: int = 250
    input_min: float = -1000.0
    input_max: float = 1000.0
    max_interval: int = 1000

    _accu: list[float] = field(init=False)
    _accupos: int = field(default=0, init=False)
    _interval_sum: float = field(default=0.0, init=False)
    _threshold_avg_sum: float = field(default=0.0, init=False)
    _range_min: float = field(default=0.0, init=False)
    _range_max: float = field(default=0.0, init=False)
    _adapt_num: int = field(default=0, init=False)
    _first_adapt: bool = field(default=True, init=False)
    _buckets: list[int] = field(init=False)
    _last_rising_test: float = field(default=INVALID_VALUE, init=False)

    def __post_init__(self) -> None:
        self.interval_len = max(1, min(int(self.interval_len), int(self.max_interval)))
        self.adapt_interval = max(1, int(self.adapt_interval))
        self._accu = [0.0] * int(self.max_interval)
        self._buckets = [0] * 1025
        self.reset()

    def _empty_buckets(self, *, reset_counter: bool) -> None:
        for i in range(1025):
            self._buckets[i] = 0
        if reset_counter:
            self._adapt_num = 0

    def clear_averagers(self) -> None:
        for i in range(int(self.max_interval)):
            self._accu[i] = 0.0
        self._accupos = 0
        self._threshold_avg_sum = 0.0
        self._interval_sum = 0.0
        self._last_rising_test = INVALID_VALUE
        self._empty_buckets(reset_counter=True)

    def reset(self) -> None:
        self._first_adapt = True
        self.clear_averagers()

    def _get_quantile(self, number_of_values: int) -> float:
        if number_of_values <= 0:
            return float(self.lower_limit)

        running = 0
        for i in range(1024):
            running += self._buckets[i]
            if running >= number_of_values:
                return size_value(0.0, 1024.0, float(i), self.input_min, self.input_max, False)
        return float(self.input_max)

    def _false_output(self) -> float | None:
        if self.false_mode == 0:
            return INVALID_VALUE
        if self.false_mode == 1:
            return float(self.numeric_false_value)
        return None

    def process(self, value: float | None) -> ThresholdResult:
        if not is_valid(value):
            return ThresholdResult(
                main=self._false_output(),
                lower_limit=float(self.lower_limit),
                upper_limit=float(self.upper_limit),
                current_value=float("nan"),
                passed=False,
            )

        gain_value = float(value) * float(self.signal_gain) / 100.0

        self._accupos += 1
        if self._accupos >= self.interval_len:
            self._accupos = 0

        self._interval_sum -= self._accu[self._accupos]
        self._accu[self._accupos] = gain_value
        self._interval_sum += gain_value
        current_value = self._interval_sum / float(self.interval_len)

        compare_value = current_value
        self._threshold_avg_sum += compare_value
        bucket_index = int(size_value(self.input_min, self.input_max, compare_value, 0.0, 1024.0, True))
        self._buckets[bucket_index] += 1

        if self._adapt_num == 0:
            self._range_min = current_value
            self._range_max = current_value
        else:
            if current_value > self._range_max:
                self._range_max = current_value
            if current_value < self._range_min:
                self._range_min = current_value

        adapt_interval_samples = self.adapt_interval
        if self.baseline:
            adapt_interval_samples *= max(1, int(self.sampling_rate))

        self._adapt_num += 1
        if self._adapt_num >= adapt_interval_samples:
            uses_quantile = (
                self.adapt_lower_mode == THRESHOLD_ADAPTMODE_QUANTILE
                or self.adapt_upper_mode == THRESHOLD_ADAPTMODE_QUANTILE
            )

            if (not self.baseline) or self._first_adapt:
                if self.adapt_lower_mode == THRESHOLD_ADAPTMODE_RANGE:
                    self.lower_limit = size_value(
                        0.0,
                        100.0,
                        self.adapt_lower_limit,
                        self._range_min,
                        self._range_max,
                        False,
                    )
                elif self.adapt_lower_mode == THRESHOLD_ADAPTMODE_QUANTILE:
                    quantile_count = max(1, int(self._adapt_num * self.adapt_lower_limit / 100.0))
                    self.lower_limit = self._get_quantile(quantile_count)
                elif self.adapt_lower_mode == THRESHOLD_ADAPTMODE_AVERAGE:
                    self.lower_limit = (
                        self._threshold_avg_sum / float(adapt_interval_samples) * self.adapt_lower_limit / 100.0
                    )

                if self.adapt_upper_mode == THRESHOLD_ADAPTMODE_RANGE:
                    self.upper_limit = size_value(
                        0.0,
                        100.0,
                        self.adapt_upper_limit,
                        self._range_min,
                        self._range_max,
                        False,
                    )
                elif self.adapt_upper_mode == THRESHOLD_ADAPTMODE_QUANTILE:
                    quantile_count = max(1, int(self._adapt_num * self.adapt_upper_limit / 100.0))
                    self.upper_limit = self._get_quantile(quantile_count)
                elif self.adapt_upper_mode == THRESHOLD_ADAPTMODE_AVERAGE:
                    self.upper_limit = (
                        self._threshold_avg_sum / float(adapt_interval_samples) * self.adapt_upper_limit / 100.0
                    )

            self._adapt_num = 0
            self._first_adapt = False
            self._threshold_avg_sum = 0.0
            if uses_quantile:
                self._empty_buckets(reset_counter=False)

        output_value = current_value
        if self.rising and self._last_rising_test != INVALID_VALUE and self._last_rising_test >= current_value:
            output_value = INVALID_VALUE
        if self.falling and self._last_rising_test != INVALID_VALUE and self._last_rising_test <= current_value:
            output_value = INVALID_VALUE

        if self.op_and and ((current_value < self.lower_limit) or (current_value > self.upper_limit)):
            output_value = INVALID_VALUE

        # Keep this condition aligned with the original BrainBay logic.
        if (not self.op_and) and ((current_value < self.lower_limit) and (current_value > self.upper_limit)):
            output_value = INVALID_VALUE

        if self.baseline and self._first_adapt:
            output_value = INVALID_VALUE

        passed = output_value != INVALID_VALUE
        if passed:
            if self.true_mode == 0:
                main_output: float | None = output_value
            else:
                main_output = float(self.numeric_true_value)
        else:
            main_output = self._false_output()

        self._last_rising_test = current_value

        return ThresholdResult(
            main=main_output,
            lower_limit=float(self.lower_limit),
            upper_limit=float(self.upper_limit),
            current_value=float(current_value),
            passed=passed,
        )


@dataclass(slots=True)
class AndBlock:
    binary: bool = False
    output_one: bool = False
    numeric_true_value: float = 1.0
    numeric_false_value: float = 0.0
    true_mode: int = 0
    false_mode: int = 0

    def process(self, input1: float | None, input2: float | None) -> float | None:
        if self.binary:
            a = int(float(input1 if input1 is not None else INVALID_VALUE))
            b = int(float(input2 if input2 is not None else INVALID_VALUE))
            value = float(a & b)
            if self.output_one and value != 0.0:
                return 1.0
            return value

        true_value = TRUE_VALUE
        if self.true_mode == 1:
            true_value = float(input1 if input1 is not None else INVALID_VALUE)
        elif self.true_mode == 2:
            true_value = max(float(input1 or INVALID_VALUE), float(input2 or INVALID_VALUE))
        elif self.true_mode == 3:
            true_value = float(self.numeric_true_value)

        if is_valid(input1) and is_valid(input2):
            return float(true_value)

        if self.false_mode == 0:
            return INVALID_VALUE
        if self.false_mode == 1:
            return float(self.numeric_false_value)
        return None


@dataclass(slots=True)
class OrBlock:
    binary: bool = False
    numeric_true_value: float = 1.0
    numeric_false_value: float = 0.0
    true_mode: int = 0
    false_mode: int = 0

    def process(self, input1: float | None, input2: float | None) -> float | None:
        if self.binary:
            a = int(float(input1 if input1 is not None else INVALID_VALUE))
            b = int(float(input2 if input2 is not None else INVALID_VALUE))
            return float(a | b)

        true_value = TRUE_VALUE
        if self.true_mode == 1:
            true_value = float(input1 if input1 is not None else INVALID_VALUE)
        elif self.true_mode == 2:
            true_value = max(float(input1 or INVALID_VALUE), float(input2 or INVALID_VALUE))
        elif self.true_mode == 3:
            true_value = float(self.numeric_true_value)

        if is_valid(input1) or is_valid(input2):
            return float(true_value)

        if self.false_mode == 0:
            return INVALID_VALUE
        if self.false_mode == 1:
            return float(self.numeric_false_value)
        return None


@dataclass(slots=True)
class NotBlock:
    binary: bool = False
    bits: int = 127
    numeric_true_value: float = 1.0
    numeric_false_value: float = 0.0
    true_mode: int = 0
    false_mode: int = 0

    def process(self, input_value: float | None) -> float | None:
        if self.binary:
            source = int(float(input_value if input_value is not None else INVALID_VALUE))
            return float(source ^ int(self.bits))

        true_value = TRUE_VALUE if self.true_mode == 0 else float(self.numeric_true_value)

        if not is_valid(input_value):
            return float(true_value)

        if self.false_mode == 0:
            return INVALID_VALUE
        if self.false_mode == 1:
            return float(self.numeric_false_value)
        return None


@dataclass(slots=True)
class TranslateBlock:
    input_min: float = -1.0
    input_max: float = 1.0
    output_min: float = 0.0
    output_max: float = 1.0
    points: Sequence[tuple[int, float]] | None = None

    _map: list[float] = field(init=False)

    def __post_init__(self) -> None:
        self._map = [0.0] * 1024
        if self.points is None:
            self.points = [(0, 0.0), (1023, 1.0)]
        self.set_points(self.points)

    def set_points(self, points: Sequence[tuple[int, float]]) -> None:
        if len(points) < 2:
            raise ValueError("TranslateBlock requires at least two points")

        ordered = sorted((int(x), float(y)) for x, y in points)
        if ordered[0][0] != 0:
            ordered[0] = (0, ordered[0][1])
        if ordered[-1][0] != 1023:
            ordered[-1] = (1023, ordered[-1][1])

        normalized: list[tuple[int, float]] = []
        for x, y in ordered:
            x_clamped = max(0, min(1023, x))
            y_clamped = max(0.0, min(1.0, y))
            normalized.append((x_clamped, y_clamped))

        for idx in range(1024):
            self._map[idx] = normalized[0][1]

        for i in range(len(normalized) - 1):
            x0, y0 = normalized[i]
            x1, y1 = normalized[i + 1]
            dist = max(1, x1 - x0)
            slope = (y1 - y0) / float(dist)
            for x in range(x0, x1):
                self._map[x] = y0 + slope * float(x - x0)
        self._map[1023] = normalized[-1][1]

    def process(self, value: float | None) -> float:
        if not is_valid(value):
            return INVALID_VALUE

        if self.input_max == self.input_min:
            index = 0
        else:
            index = int(
                (float(value) - self.input_min) / (self.input_max - self.input_min) * 1023.0
            )
        index = max(0, min(1023, index))

        mapped = self._map[index]
        return float(mapped * (self.output_max - self.output_min) + self.output_min)


@dataclass(slots=True)
class SignalBlock:
    frequency: float = 2.0
    gain: float = 200.0
    center: float = 0.0
    phase: float = 0.0
    noise: int = 0
    sigtype: int = SIG_SINUS
    enable_in: bool = False
    sampling_rate: int = 250
    output_max: float = 500.0
    rng_seed: int = 42

    _angle: float = field(default=0.0, init=False)
    _rng: random.Random = field(init=False)

    def __post_init__(self) -> None:
        self._rng = random.Random(int(self.rng_seed))

    def reset(self) -> None:
        self._angle = 0.0

    def process(
        self,
        frequency_input: float | None = None,
        phase_input: float | None = None,
    ) -> float:
        if self.enable_in and is_valid(frequency_input):
            self.frequency = float(frequency_input)
        if self.enable_in and is_valid(phase_input):
            self.phase = float(phase_input)

        self._angle += self.frequency / float(max(1, self.sampling_rate)) * math.tau
        if self._angle > math.tau:
            self._angle -= math.tau

        s = math.sin(self._angle + (self.phase / 360.0) * math.tau)
        g = self.gain / 1000.0 * self.output_max

        if self.sigtype == SIG_SINUS:
            x = s * g
        elif self.sigtype == SIG_SAWTOOTH:
            x = math.asin(s) * g * 0.625
        elif self.sigtype == SIG_RECTANGLE:
            x = g if s > 0 else -g
        elif self.sigtype == SIG_RAMP:
            x = (self._angle - math.pi) / math.pi * g
        else:
            x = s * g

        if self.noise > 0:
            x += self._rng.uniform(-self.noise / 2.0, self.noise / 2.0)

        return float(x + self.center)


@dataclass(slots=True)
class SessionTimeResult:
    remaining_seconds: float
    done: bool


@dataclass(slots=True)
class SessionTimeBlock:
    session_seconds: int = 120
    stop_when_finished: bool = True
    sampling_rate: int = 250

    _samples_seen: int = field(default=0, init=False)

    def reset(self) -> None:
        self._samples_seen = 0

    def process(self) -> SessionTimeResult:
        self._samples_seen += 1
        elapsed = self._samples_seen / float(max(1, self.sampling_rate))
        remaining = max(0.0, float(self.session_seconds) - elapsed)
        done = bool(self.stop_when_finished and elapsed > float(self.session_seconds))
        return SessionTimeResult(remaining_seconds=remaining, done=done)


@dataclass(slots=True)
class DominantFrequencyBlock:
    sampling_rate: int = 250
    window_seconds: float = 2.0
    hop_seconds: float = 0.25
    low_hz: float = 4.0
    high_hz: float = 16.0

    _window_samples: int = field(init=False)
    _hop_samples: int = field(init=False)
    _buffer: deque[float] = field(init=False)
    _hop_counter: int = field(default=0, init=False)
    last_dominant_hz: float = field(default=float("nan"), init=False)

    def __post_init__(self) -> None:
        self._window_samples = max(8, int(float(self.window_seconds) * max(1, int(self.sampling_rate))))
        self._hop_samples = max(1, int(float(self.hop_seconds) * max(1, int(self.sampling_rate))))
        self._buffer = deque(maxlen=self._window_samples)

    def reset(self) -> None:
        self._buffer.clear()
        self._hop_counter = 0
        self.last_dominant_hz = float("nan")

    def process(self, value: float | None) -> float:
        if value is None or not math.isfinite(float(value)):
            return float(self.last_dominant_hz)

        self._buffer.append(float(value))
        self._hop_counter += 1

        if len(self._buffer) < self._window_samples:
            return float(self.last_dominant_hz)
        if self._hop_counter < self._hop_samples:
            return float(self.last_dominant_hz)

        self._hop_counter = 0
        self.last_dominant_hz = self._compute_dominant()
        return float(self.last_dominant_hz)

    def _compute_dominant(self) -> float:
        x = np.asarray(self._buffer, dtype=float)
        if x.size < 8:
            return float("nan")

        x = x - np.mean(x)
        window = np.hanning(x.size)
        spectrum = np.fft.rfft(x * window)
        amps = np.abs(spectrum)
        freqs = np.fft.rfftfreq(x.size, d=1.0 / float(max(1, self.sampling_rate)))

        mask = (freqs >= float(self.low_hz)) & (freqs <= float(self.high_hz))
        if not np.any(mask):
            return float("nan")

        band_amps = amps[mask]
        if band_amps.size == 0:
            return float("nan")

        idx = int(np.argmax(band_amps))
        if not np.isfinite(band_amps[idx]) or band_amps[idx] <= 0.0:
            return float("nan")

        return float(freqs[mask][idx])


@dataclass(slots=True)
class ReferenceLockBlock:
    baseline_samples: int = 1250
    fallback_hz: float = 0.0

    _count: int = field(default=0, init=False)
    _candidates: list[float] = field(default_factory=list, init=False)
    reference_hz: float | None = field(default=None, init=False)

    def reset(self) -> None:
        self._count = 0
        self._candidates.clear()
        self.reference_hz = None

    def process(self, value: float | None) -> float | None:
        if self.reference_hz is not None:
            return float(self.reference_hz)

        self._count += 1
        if value is not None and math.isfinite(float(value)):
            self._candidates.append(float(value))

        if self._count >= max(1, int(self.baseline_samples)):
            if self._candidates:
                self.reference_hz = float(np.median(np.asarray(self._candidates, dtype=float)))
            else:
                self.reference_hz = float(self.fallback_hz)

        return None if self.reference_hz is None else float(self.reference_hz)


@dataclass(slots=True)
class TargetCycleResult:
    active_phase: int
    next_phase: int
    target_hz: float
    target_met_or_exceeded: bool
    switched_phase: bool


@dataclass(slots=True)
class TargetCycleBlock:
    offset_hz: float = 2.0
    mode: str = TARGET_MODE_DOMINANT_PLUS_RETURN
    target_tolerance_hz: float = 0.05
    met_hold_samples: int = 1
    switch_cooldown_samples: int = 0

    _phase: int = field(default=0, init=False)
    _met_streak: int = field(default=0, init=False)
    _cooldown_remaining: int = field(default=0, init=False)

    def reset(self) -> None:
        self._phase = 0
        self._met_streak = 0
        self._cooldown_remaining = 0

    def _target_pair(self, reference_hz: float) -> tuple[float, float]:
        target_up = float(reference_hz + float(self.offset_hz))
        if self.mode == TARGET_MODE_DOMINANT_PLUS_MINUS:
            target_down = max(0.0, float(reference_hz - float(self.offset_hz)))
        else:
            target_down = float(reference_hz)
        return target_up, target_down

    def _is_met(self, dominant_hz: float, target_hz: float, reference_hz: float) -> bool:
        tol = max(0.0, float(self.target_tolerance_hz))
        if target_hz > reference_hz + tol:
            return dominant_hz >= (target_hz - tol)
        if target_hz < reference_hz - tol:
            return dominant_hz <= (target_hz + tol)
        return abs(dominant_hz - target_hz) <= tol

    def process(self, dominant_hz: float | None, reference_hz: float | None) -> TargetCycleResult:
        active_phase = int(self._phase)
        if reference_hz is None or not math.isfinite(float(reference_hz)):
            return TargetCycleResult(
                active_phase=active_phase,
                next_phase=active_phase,
                target_hz=float("nan"),
                target_met_or_exceeded=False,
                switched_phase=False,
            )

        reference = float(reference_hz)
        target_up, target_down = self._target_pair(reference)
        target_hz = target_up if active_phase == 0 else target_down

        met = False
        if dominant_hz is not None and math.isfinite(float(dominant_hz)):
            met = self._is_met(float(dominant_hz), target_hz, reference)

        if self._cooldown_remaining > 0:
            self._cooldown_remaining -= 1

        if met:
            self._met_streak += 1
        else:
            self._met_streak = 0

        switched = False
        if self._met_streak >= max(1, int(self.met_hold_samples)) and self._cooldown_remaining == 0:
            self._phase = 1 - self._phase
            self._met_streak = 0
            self._cooldown_remaining = max(0, int(self.switch_cooldown_samples))
            switched = True

        return TargetCycleResult(
            active_phase=active_phase,
            next_phase=int(self._phase),
            target_hz=float(target_hz),
            target_met_or_exceeded=bool(met),
            switched_phase=bool(switched),
        )


@dataclass(slots=True)
class StickinessResult:
    ratio: float
    met_seconds: float
    met_count: int
    window_size_samples: int


@dataclass(slots=True)
class StickinessBlock:
    sampling_rate: int = 250
    window_seconds: float = 60.0

    _window_samples: int = field(init=False)
    _hits: deque[int] = field(init=False)
    _sum: int = field(default=0, init=False)

    def __post_init__(self) -> None:
        self._window_samples = max(1, int(float(self.window_seconds) * max(1, int(self.sampling_rate))))
        self._hits = deque(maxlen=self._window_samples)

    def reset(self) -> None:
        self._hits.clear()
        self._sum = 0

    def process(self, met: bool) -> StickinessResult:
        value = 1 if met else 0
        if len(self._hits) == self._window_samples:
            self._sum -= self._hits[0]
        self._hits.append(value)
        self._sum += value

        ratio = float(self._sum / float(len(self._hits))) if self._hits else 0.0
        met_seconds = float(self._sum / float(max(1, int(self.sampling_rate))))
        return StickinessResult(
            ratio=ratio,
            met_seconds=met_seconds,
            met_count=int(self._sum),
            window_size_samples=int(len(self._hits)),
        )


__all__ = [
    "SIG_RAMP",
    "SIG_RECTANGLE",
    "SIG_SAWTOOTH",
    "SIG_SINUS",
    "TARGET_MODE_DOMINANT_PLUS_MINUS",
    "TARGET_MODE_DOMINANT_PLUS_RETURN",
    "AndBlock",
    "AverageBlock",
    "DominantFrequencyBlock",
    "FilterBlock",
    "MagnitudeBlock",
    "NotBlock",
    "OrBlock",
    "ReferenceLockBlock",
    "RatioBlock",
    "SessionTimeBlock",
    "SessionTimeResult",
    "SignalBlock",
    "StickinessBlock",
    "StickinessResult",
    "TargetCycleBlock",
    "TargetCycleResult",
    "ThresholdBlock",
    "ThresholdResult",
    "TranslateBlock",
    "is_valid",
    "size_value",
]
