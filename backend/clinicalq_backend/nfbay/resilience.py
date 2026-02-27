from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Mapping

from clinicalq_backend.nfbay.blocks import (
    DominantFrequencyBlock,
    ReferenceLockBlock,
    SignalBlock,
    StickinessBlock,
    TargetCycleBlock,
    TARGET_MODE_DOMINANT_PLUS_MINUS,
    TARGET_MODE_DOMINANT_PLUS_RETURN,
)

MODE_DOMINANT_PLUS_RETURN = TARGET_MODE_DOMINANT_PLUS_RETURN
MODE_DOMINANT_PLUS_MINUS = TARGET_MODE_DOMINANT_PLUS_MINUS


def _is_finite(value: float | None) -> bool:
    return value is not None and math.isfinite(float(value))


@dataclass(slots=True)
class ResilienceSiteConfig:
    sampling_rate: int = 250
    baseline_seconds: float = 5.0

    offset_hz: float = 2.0
    target_mode: str = MODE_DOMINANT_PLUS_RETURN
    target_tolerance_hz: float = 0.05

    analysis_window_seconds: float = 2.0
    analysis_hop_seconds: float = 0.25
    dominant_band_low_hz: float = 4.0
    dominant_band_high_hz: float = 16.0

    tone_a_hz: float = 440.0
    tone_b_hz: float = 660.0
    tone_gain: float = 180.0
    tone_noise: int = 0

    stickiness_window_seconds: float = 60.0

    met_hold_samples: int = 1
    switch_cooldown_seconds: float = 0.15


@dataclass(slots=True)
class SiteResilienceStepResult:
    site: str
    sample_index: int
    ready: bool
    dominant_hz: float
    reference_dominant_hz: float
    current_target_hz: float
    target_met_or_exceeded: bool
    active_phase: int
    switched_phase: bool
    active_tone_hz: float
    feedback_signal: float
    stickiness_ratio_60s: float
    stickiness_met_seconds_60s: float
    stickiness_met_count_60s: int


@dataclass(slots=True)
class MultiSiteResilienceStepResult:
    sample_index: int
    by_site: dict[str, SiteResilienceStepResult]
    combined_feedback_signal: float


class SiteResilienceTrainer:
    def __init__(self, *, site: str, config: ResilienceSiteConfig | None = None):
        self.site = str(site)
        self.config = config or ResilienceSiteConfig()

        if self.config.target_mode not in {MODE_DOMINANT_PLUS_RETURN, MODE_DOMINANT_PLUS_MINUS}:
            raise ValueError(
                f"Unsupported target_mode: {self.config.target_mode}. "
                f"Use '{MODE_DOMINANT_PLUS_RETURN}' or '{MODE_DOMINANT_PLUS_MINUS}'."
            )

        self._sample_index = 0

        self._dominant = DominantFrequencyBlock(
            sampling_rate=self.config.sampling_rate,
            window_seconds=self.config.analysis_window_seconds,
            hop_seconds=self.config.analysis_hop_seconds,
            low_hz=self.config.dominant_band_low_hz,
            high_hz=self.config.dominant_band_high_hz,
        )

        baseline_samples = max(1, int(self.config.baseline_seconds * self.config.sampling_rate))
        self._reference = ReferenceLockBlock(baseline_samples=baseline_samples, fallback_hz=0.0)

        cooldown_samples = max(0, int(self.config.switch_cooldown_seconds * self.config.sampling_rate))
        self._target_cycle = TargetCycleBlock(
            offset_hz=self.config.offset_hz,
            mode=self.config.target_mode,
            target_tolerance_hz=self.config.target_tolerance_hz,
            met_hold_samples=max(1, int(self.config.met_hold_samples)),
            switch_cooldown_samples=cooldown_samples,
        )

        self._stickiness = StickinessBlock(
            sampling_rate=self.config.sampling_rate,
            window_seconds=self.config.stickiness_window_seconds,
        )

        self._tone_a = SignalBlock(
            frequency=self.config.tone_a_hz,
            gain=self.config.tone_gain,
            center=0.0,
            phase=0.0,
            noise=self.config.tone_noise,
            sampling_rate=self.config.sampling_rate,
        )
        self._tone_b = SignalBlock(
            frequency=self.config.tone_b_hz,
            gain=self.config.tone_gain,
            center=0.0,
            phase=0.0,
            noise=self.config.tone_noise,
            sampling_rate=self.config.sampling_rate,
        )

    def reset(self) -> None:
        self._sample_index = 0
        self._dominant.reset()
        self._reference.reset()
        self._target_cycle.reset()
        self._stickiness.reset()
        self._tone_a.reset()
        self._tone_b.reset()

    def process_sample(self, sample: float) -> SiteResilienceStepResult:
        dominant_hz = self._dominant.process(float(sample))
        reference_hz = self._reference.process(dominant_hz)

        cycle = self._target_cycle.process(dominant_hz, reference_hz)
        ready = _is_finite(reference_hz)

        if cycle.active_phase == 0:
            active_tone_hz = float(self.config.tone_a_hz)
            feedback_signal = float(self._tone_a.process())
        else:
            active_tone_hz = float(self.config.tone_b_hz)
            feedback_signal = float(self._tone_b.process())

        stickiness = self._stickiness.process(bool(cycle.target_met_or_exceeded and ready))

        result = SiteResilienceStepResult(
            site=self.site,
            sample_index=self._sample_index,
            ready=bool(ready),
            dominant_hz=float(dominant_hz) if _is_finite(dominant_hz) else float("nan"),
            reference_dominant_hz=float(reference_hz) if _is_finite(reference_hz) else float("nan"),
            current_target_hz=float(cycle.target_hz) if _is_finite(cycle.target_hz) else float("nan"),
            target_met_or_exceeded=bool(cycle.target_met_or_exceeded and ready),
            active_phase=int(cycle.active_phase),
            switched_phase=bool(cycle.switched_phase),
            active_tone_hz=active_tone_hz,
            feedback_signal=feedback_signal,
            stickiness_ratio_60s=float(stickiness.ratio),
            stickiness_met_seconds_60s=float(stickiness.met_seconds),
            stickiness_met_count_60s=int(stickiness.met_count),
        )

        self._sample_index += 1
        return result


class ResilienceTrainingVariant:
    def __init__(
        self,
        site_configs: Mapping[str, ResilienceSiteConfig],
        *,
        combine_mode: str = "mean",
    ):
        if not site_configs:
            raise ValueError("site_configs must include at least one site")

        self._trainers = {
            str(site): SiteResilienceTrainer(site=str(site), config=config)
            for site, config in site_configs.items()
        }
        self._sample_index = 0

        self.combine_mode = str(combine_mode).lower().strip()
        if self.combine_mode not in {"mean", "sum"}:
            raise ValueError("combine_mode must be 'mean' or 'sum'")

    @property
    def sites(self) -> tuple[str, ...]:
        return tuple(self._trainers.keys())

    def reset(self) -> None:
        self._sample_index = 0
        for trainer in self._trainers.values():
            trainer.reset()

    def process_site_samples(self, samples_by_site: Mapping[str, float]) -> MultiSiteResilienceStepResult:
        by_site: dict[str, SiteResilienceStepResult] = {}
        feedback_values: list[float] = []

        for site, trainer in self._trainers.items():
            if site not in samples_by_site:
                continue
            step = trainer.process_sample(float(samples_by_site[site]))
            by_site[site] = step
            feedback_values.append(float(step.feedback_signal))

        combined = 0.0
        if feedback_values:
            if self.combine_mode == "sum":
                combined = float(sum(feedback_values))
            else:
                combined = float(sum(feedback_values) / len(feedback_values))

        result = MultiSiteResilienceStepResult(
            sample_index=self._sample_index,
            by_site=by_site,
            combined_feedback_signal=combined,
        )
        self._sample_index += 1
        return result


__all__ = [
    "MODE_DOMINANT_PLUS_MINUS",
    "MODE_DOMINANT_PLUS_RETURN",
    "MultiSiteResilienceStepResult",
    "ResilienceSiteConfig",
    "ResilienceTrainingVariant",
    "SiteResilienceStepResult",
    "SiteResilienceTrainer",
]
