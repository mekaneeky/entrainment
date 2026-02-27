from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from clinicalq_backend.nfbay.blocks import (
    AndBlock,
    AverageBlock,
    FilterBlock,
    MagnitudeBlock,
    RatioBlock,
    SessionTimeBlock,
    SignalBlock,
    ThresholdBlock,
    TranslateBlock,
    is_valid,
)
from clinicalq_backend.nfbay.constants import (
    INVALID_VALUE,
    THRESHOLD_ADAPTMODE_NONE,
    THRESHOLD_ADAPTMODE_QUANTILE,
    TRUE_VALUE,
)


@dataclass(slots=True)
class AlphaThetaConfig:
    sampling_rate: int = 250
    session_seconds: int = 20 * 60

    alpha_center_hz: float = 10.0
    alpha_width_hz: float = 2.0
    theta_center_hz: float = 6.0
    theta_width_hz: float = 2.0
    magnitude_order: int = 4

    smoothing_interval: int = 32

    ratio_reward_lower: float = 1.2
    ratio_reward_upper: float = 10.0
    alpha_inhibit_upper: float = 30.0

    enable_adaptive_ratio: bool = False
    ratio_adapt_percentile: float = 50.0
    ratio_adapt_interval: int = 500

    feedback_frequency_hz: float = 220.0
    feedback_gain: float = 180.0
    feedback_noise: int = 0


@dataclass(slots=True)
class AlphaThetaStepResult:
    sample_index: int
    alpha: float
    theta: float
    ratio: float
    reward_gate: bool
    inhibit_gate: bool
    feedback_enabled: bool
    feedback_level: float
    feedback_signal: float
    reward_lower: float
    reward_upper: float
    inhibit_upper: float
    remaining_seconds: float
    done: bool


class AlphaThetaNeurofeedbackPipeline:
    """BrainBay-style alpha/theta neurofeedback block chain.

    Block flow:
    raw EEG -> bandpass (alpha/theta) -> magnitude -> average -> theta/alpha ratio
    -> reward threshold AND alpha inhibit threshold -> feedback gate -> signal output.
    """

    def __init__(self, config: AlphaThetaConfig | None = None):
        self.config = config or AlphaThetaConfig()
        self._sample_index = 0

        self.alpha_filter = FilterBlock(
            filter_type="bandpass_bessel",
            order=8,
            par1=max(0.5, self.config.alpha_center_hz - self.config.alpha_width_hz),
            par2=self.config.alpha_center_hz + self.config.alpha_width_hz,
            sampling_rate=self.config.sampling_rate,
        )
        self.theta_filter = FilterBlock(
            filter_type="bandpass_bessel",
            order=8,
            par1=max(0.5, self.config.theta_center_hz - self.config.theta_width_hz),
            par2=self.config.theta_center_hz + self.config.theta_width_hz,
            sampling_rate=self.config.sampling_rate,
        )

        self.alpha_magnitude = MagnitudeBlock(
            center_hz=self.config.alpha_center_hz,
            width_hz=self.config.alpha_width_hz,
            order=self.config.magnitude_order,
            gain=100.0,
            sampling_rate=self.config.sampling_rate,
        )
        self.theta_magnitude = MagnitudeBlock(
            center_hz=self.config.theta_center_hz,
            width_hz=self.config.theta_width_hz,
            order=self.config.magnitude_order,
            gain=100.0,
            sampling_rate=self.config.sampling_rate,
        )

        self.alpha_average = AverageBlock(interval=self.config.smoothing_interval)
        self.theta_average = AverageBlock(interval=self.config.smoothing_interval)
        self.ratio = RatioBlock()

        ratio_mode = THRESHOLD_ADAPTMODE_NONE
        ratio_percent = 0.0
        if self.config.enable_adaptive_ratio:
            ratio_mode = THRESHOLD_ADAPTMODE_QUANTILE
            ratio_percent = float(self.config.ratio_adapt_percentile)

        self.reward_threshold = ThresholdBlock(
            interval_len=1,
            signal_gain=100.0,
            lower_limit=self.config.ratio_reward_lower,
            upper_limit=self.config.ratio_reward_upper,
            op_and=True,
            adapt_lower_mode=ratio_mode,
            adapt_lower_limit=ratio_percent,
            adapt_upper_mode=THRESHOLD_ADAPTMODE_NONE,
            adapt_interval=self.config.ratio_adapt_interval,
            true_mode=0,
            false_mode=0,
            sampling_rate=self.config.sampling_rate,
            input_min=0.0,
            input_max=max(20.0, self.config.ratio_reward_upper * 2.0),
        )

        self.alpha_inhibit_threshold = ThresholdBlock(
            interval_len=1,
            signal_gain=100.0,
            lower_limit=0.0,
            upper_limit=self.config.alpha_inhibit_upper,
            op_and=True,
            adapt_lower_mode=THRESHOLD_ADAPTMODE_NONE,
            adapt_upper_mode=THRESHOLD_ADAPTMODE_NONE,
            true_mode=1,
            numeric_true_value=TRUE_VALUE,
            false_mode=0,
            sampling_rate=self.config.sampling_rate,
            input_min=0.0,
            input_max=max(200.0, self.config.alpha_inhibit_upper * 4.0),
        )

        self.reward_and_inhibit = AndBlock(
            binary=False,
            output_one=False,
            true_mode=3,
            numeric_true_value=TRUE_VALUE,
            false_mode=0,
        )

        self.feedback_signal = SignalBlock(
            frequency=self.config.feedback_frequency_hz,
            gain=self.config.feedback_gain,
            center=0.0,
            phase=0.0,
            noise=self.config.feedback_noise,
            sampling_rate=self.config.sampling_rate,
        )

        upper = self.config.ratio_reward_upper
        if upper <= self.config.ratio_reward_lower:
            upper = self.config.ratio_reward_lower + 1.0
        self.feedback_map = TranslateBlock(
            input_min=self.config.ratio_reward_lower,
            input_max=upper,
            output_min=0.0,
            output_max=1.0,
            points=[
                (0, 0.0),
                (640, 0.45),
                (850, 0.85),
                (1023, 1.0),
            ],
        )

        self.session_time = SessionTimeBlock(
            session_seconds=self.config.session_seconds,
            stop_when_finished=True,
            sampling_rate=self.config.sampling_rate,
        )

    def reset(self) -> None:
        self._sample_index = 0
        self.alpha_filter.reset()
        self.theta_filter.reset()
        self.alpha_magnitude.reset()
        self.theta_magnitude.reset()
        self.alpha_average.reset()
        self.theta_average.reset()
        self.reward_threshold.reset()
        self.alpha_inhibit_threshold.reset()
        self.feedback_signal.reset()
        self.session_time.reset()

    def process_sample(self, sample: float) -> AlphaThetaStepResult:
        alpha_filtered = self.alpha_filter.process(sample)
        theta_filtered = self.theta_filter.process(sample)

        alpha_mag = self.alpha_magnitude.process(alpha_filtered)
        theta_mag = self.theta_magnitude.process(theta_filtered)

        alpha_value = self.alpha_average.process(alpha_mag)
        theta_value = self.theta_average.process(theta_mag)

        ratio_value = self.ratio.process(theta_value, alpha_value)

        reward = self.reward_threshold.process(ratio_value)
        inhibit = self.alpha_inhibit_threshold.process(alpha_value)

        reward_main = reward.main if reward.main is not None else INVALID_VALUE
        inhibit_main = inhibit.main if inhibit.main is not None else INVALID_VALUE
        gate_output = self.reward_and_inhibit.process(reward_main, inhibit_main)
        feedback_enabled = is_valid(gate_output)

        base_feedback = self.feedback_signal.process()
        level = self.feedback_map.process(ratio_value)
        if not is_valid(level):
            level = 0.0

        feedback_signal = float(base_feedback * level) if feedback_enabled else 0.0
        session_state = self.session_time.process()

        step = AlphaThetaStepResult(
            sample_index=self._sample_index,
            alpha=alpha_value,
            theta=theta_value,
            ratio=ratio_value,
            reward_gate=reward.passed,
            inhibit_gate=inhibit.passed,
            feedback_enabled=feedback_enabled,
            feedback_level=float(level),
            feedback_signal=float(feedback_signal),
            reward_lower=float(reward.lower_limit),
            reward_upper=float(reward.upper_limit),
            inhibit_upper=float(inhibit.upper_limit),
            remaining_seconds=session_state.remaining_seconds,
            done=session_state.done,
        )

        self._sample_index += 1
        return step

    def run_samples(self, samples: Iterable[float]) -> list[AlphaThetaStepResult]:
        return [self.process_sample(float(sample)) for sample in samples]


__all__ = [
    "AlphaThetaConfig",
    "AlphaThetaNeurofeedbackPipeline",
    "AlphaThetaStepResult",
]
