#!/usr/bin/env python3
"""Generate masked subliminal ClinicalQ audio probes.

This script creates WAV files for the signal recipes discussed in the project:

- sleep: one slowly frequency-modulated sine, 285-315 Hz, about 7 cycles/min.
- sub-alpha / omni: 300 + 310 Hz equal-amplitude tones, creating a 10 Hz beat.
- sub-beta / serene: 300 + 325 Hz equal-amplitude tones at fixed -15, -17, and -25 dB levels.
- sweep: an inferred five-tone complex around 300 Hz with left/right panning.

The generated files encode relative levels only. SPL values such as "58 dB pink
noise" require calibrating the playback system externally.
"""

from __future__ import annotations

import argparse
import json
import math
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np


DEFAULT_SAMPLE_RATE = 44_100
DEFAULT_DURATION_SECONDS = 60.0
DEFAULT_NOISE_DBFS = -18.0
DEFAULT_MASKER_CUTOFF_HZ = 1_000.0
DEFAULT_MASKER_ROLLOFF_DB = 50.0
DEFAULT_SWEEP_TONES_HZ = (300.0, 302.0, 305.0, 310.0, 325.0)
DEFAULT_SUB_BETA_LEVELS_DB = (15.0, 17.0, 25.0)


@dataclass(frozen=True)
class RenderedSound:
    name: str
    audio: np.ndarray
    metadata: dict[str, object]


def db_to_amplitude(db: float) -> float:
    return 10.0 ** (db / 20.0)


def rms(signal: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(signal), dtype=np.float64)))


def set_rms(signal: np.ndarray, target_rms: float) -> np.ndarray:
    current_rms = rms(signal)
    if current_rms <= 0.0:
        return signal
    return signal * (target_rms / current_rms)


def parse_float_list(value: str) -> tuple[float, ...]:
    parsed = tuple(float(part.strip()) for part in value.split(",") if part.strip())
    if not parsed:
        raise argparse.ArgumentTypeError("expected at least one comma-separated number")
    return parsed


def time_axis(duration_seconds: float, sample_rate: int) -> np.ndarray:
    sample_count = int(round(duration_seconds * sample_rate))
    return np.arange(sample_count, dtype=np.float64) / sample_rate


def filtered_pink_noise(
    sample_count: int,
    sample_rate: int,
    rng: np.random.Generator,
    cutoff_hz: float,
    rolloff_db: float,
) -> np.ndarray:
    """Create pink noise with a frequency-domain 1 kHz roll-off model.

    The source phrase "50-dB roll-off at 1,000 Hz" does not fully define a filter
    topology. This models it as unchanged pink noise below the cutoff and a
    smooth log-frequency shelf that reaches -rolloff_db by Nyquist.
    """

    freqs = np.fft.rfftfreq(sample_count, d=1.0 / sample_rate)
    magnitudes = np.zeros_like(freqs)
    nonzero = freqs > 0.0
    magnitudes[nonzero] = 1.0 / np.sqrt(freqs[nonzero])

    above_cutoff = freqs > cutoff_hz
    nyquist = sample_rate / 2.0
    if cutoff_hz > 0.0 and cutoff_hz < nyquist and np.any(above_cutoff):
        log_span = math.log(nyquist / cutoff_hz)
        if log_span > 0.0:
            progress = np.log(freqs[above_cutoff] / cutoff_hz) / log_span
            attenuation_db = -rolloff_db * np.clip(progress, 0.0, 1.0)
            magnitudes[above_cutoff] *= db_to_amplitude(attenuation_db)

    phases = rng.uniform(0.0, 2.0 * np.pi, size=freqs.shape)
    spectrum = magnitudes * np.exp(1j * phases)
    spectrum[0] = 0.0
    noise = np.fft.irfft(spectrum, n=sample_count)
    return set_rms(noise, 1.0)


def make_stereo_masker(
    sample_count: int,
    sample_rate: int,
    noise_rms: float,
    rng: np.random.Generator,
    cutoff_hz: float,
    rolloff_db: float,
) -> np.ndarray:
    left = filtered_pink_noise(sample_count, sample_rate, rng, cutoff_hz, rolloff_db)
    right = filtered_pink_noise(sample_count, sample_rate, rng, cutoff_hz, rolloff_db)
    return np.column_stack((set_rms(left, noise_rms), set_rms(right, noise_rms)))


def sine_tone(frequency_hz: float, t: np.ndarray) -> np.ndarray:
    return np.sin(2.0 * np.pi * frequency_hz * t)


def sleep_support_tone(
    t: np.ndarray,
    sample_rate: int,
    center_hz: float = 300.0,
    excursion_hz: float = 15.0,
    cycles_per_minute: float = 7.0,
) -> np.ndarray:
    modulation_hz = cycles_per_minute / 60.0
    instantaneous_frequency = center_hz + excursion_hz * np.sin(
        2.0 * np.pi * modulation_hz * t
    )
    phase = 2.0 * np.pi * np.cumsum(instantaneous_frequency) / sample_rate
    return np.sin(phase)


def equal_amplitude_tone_blend(frequencies_hz: tuple[float, ...], t: np.ndarray) -> np.ndarray:
    blend = np.zeros_like(t)
    for frequency_hz in frequencies_hz:
        blend += sine_tone(frequency_hz, t)
    return set_rms(blend, 1.0)


def sweep_pan_position(
    sample_count: int,
    sample_rate: int,
    excursion_seconds: float,
    pause_seconds: float,
) -> np.ndarray:
    """Return equal-power pan positions from left=0 to right=1."""

    positions: list[np.ndarray] = []
    current = 0.0
    pause_count = max(0, int(round(pause_seconds * sample_rate)))
    ramp_count = max(1, int(round(excursion_seconds * sample_rate)))

    while sum(len(chunk) for chunk in positions) < sample_count:
        if pause_count:
            positions.append(np.full(pause_count, current, dtype=np.float64))

        target = 1.0 - current
        x = np.linspace(0.0, 1.0, ramp_count, endpoint=False, dtype=np.float64)
        smooth = 0.5 - 0.5 * np.cos(np.pi * x)
        positions.append(current + (target - current) * smooth)
        current = target

    return np.concatenate(positions)[:sample_count]


def mix_masked_mono(
    masker: np.ndarray,
    active_mono: np.ndarray,
    noise_rms: float,
    active_below_noise_db: float,
) -> np.ndarray:
    active_rms = noise_rms * db_to_amplitude(-active_below_noise_db)
    active = set_rms(active_mono, active_rms)
    return masker + np.column_stack((active, active))


def mix_masked_stereo(masker: np.ndarray, active_stereo: np.ndarray) -> np.ndarray:
    return masker + active_stereo


def render_sleep(
    args: argparse.Namespace,
    masker: np.ndarray,
    t: np.ndarray,
    noise_rms: float,
) -> RenderedSound:
    active = sleep_support_tone(
        t,
        args.sample_rate,
        center_hz=args.sleep_center_hz,
        excursion_hz=args.sleep_excursion_hz,
        cycles_per_minute=args.sleep_cycles_per_minute,
    )
    audio = mix_masked_mono(masker, active, noise_rms, args.sleep_below_noise_db)
    return RenderedSound(
        name="sleep_support_sinusoidal",
        audio=audio,
        metadata={
            "recipe": "single sinusoidal tone frequency-modulated between 285 and 315 Hz by default",
            "center_hz": args.sleep_center_hz,
            "excursion_hz": args.sleep_excursion_hz,
            "cycles_per_minute": args.sleep_cycles_per_minute,
            "active_below_noise_db": args.sleep_below_noise_db,
        },
    )


def render_sub_alpha(
    args: argparse.Namespace,
    masker: np.ndarray,
    t: np.ndarray,
    noise_rms: float,
) -> RenderedSound:
    frequencies = (args.carrier_hz, args.carrier_hz + 10.0)
    active = equal_amplitude_tone_blend(frequencies, t)
    audio = mix_masked_mono(masker, active, noise_rms, args.harmonic_below_noise_db)
    return RenderedSound(
        name="sub_alpha_omni_10hz",
        audio=audio,
        metadata={
            "recipe": "equal-amplitude 300 and 310 Hz tones by default, creating a 10 Hz beat",
            "frequencies_hz": frequencies,
            "beat_hz": 10.0,
            "active_below_noise_db": args.harmonic_below_noise_db,
        },
    )


def level_suffix(level_db: float) -> str:
    text = f"{level_db:g}".replace(".", "p")
    return f"minus{text}db"


def render_sub_beta_fixed(
    args: argparse.Namespace,
    masker: np.ndarray,
    t: np.ndarray,
    noise_rms: float,
    active_below_noise_db: float,
) -> RenderedSound:
    frequencies = (args.carrier_hz, args.carrier_hz + 25.0)
    active = equal_amplitude_tone_blend(frequencies, t)
    audio = mix_masked_mono(masker, active, noise_rms, active_below_noise_db)
    return RenderedSound(
        name=f"sub_beta_serene_25hz_{level_suffix(active_below_noise_db)}",
        audio=audio,
        metadata={
            "recipe": "equal-amplitude 300 and 325 Hz tones by default, creating a fixed-level 25 Hz beat",
            "frequencies_hz": frequencies,
            "beat_hz": 25.0,
            "active_below_noise_db": active_below_noise_db,
            "level_note": "Fixed level. No -15/-25 dB cycling is applied.",
        },
    )


def render_sweep(
    args: argparse.Namespace,
    masker: np.ndarray,
    t: np.ndarray,
    noise_rms: float,
) -> RenderedSound:
    active = equal_amplitude_tone_blend(args.sweep_tones_hz, t)
    active = set_rms(active, noise_rms * db_to_amplitude(-args.harmonic_below_noise_db))
    pan = sweep_pan_position(
        len(t),
        args.sample_rate,
        excursion_seconds=args.sweep_excursion_seconds,
        pause_seconds=args.sweep_pause_seconds,
    )
    left_gain = np.cos(pan * np.pi / 2.0)
    right_gain = np.sin(pan * np.pi / 2.0)
    active_stereo = np.column_stack((active * left_gain, active * right_gain))
    audio = mix_masked_stereo(masker, active_stereo)
    return RenderedSound(
        name="sweep_complex_harmonic",
        audio=audio,
        metadata={
            "recipe": "inferred five-tone complex around 300 Hz with equal-power left-right panning",
            "frequencies_hz": args.sweep_tones_hz,
            "pairwise_beats_hz": pairwise_differences(args.sweep_tones_hz),
            "active_below_noise_db": args.harmonic_below_noise_db,
            "sweep_excursion_seconds": args.sweep_excursion_seconds,
            "sweep_pause_seconds": args.sweep_pause_seconds,
            "note": "SWEEP frequencies are inferred from the textual description, not uniquely specified.",
        },
    )


def pairwise_differences(frequencies_hz: tuple[float, ...]) -> list[float]:
    differences: set[float] = set()
    for index, first in enumerate(frequencies_hz):
        for second in frequencies_hz[index + 1 :]:
            differences.add(round(abs(second - first), 6))
    return sorted(differences)


def peak_limit_if_needed(audio: np.ndarray, peak_dbfs: float) -> tuple[np.ndarray, float]:
    peak = float(np.max(np.abs(audio)))
    target_peak = db_to_amplitude(peak_dbfs)
    if peak <= target_peak or peak <= 0.0:
        return audio, 0.0
    scale = target_peak / peak
    return audio * scale, 20.0 * math.log10(scale)


def write_wav(path: Path, audio: np.ndarray, sample_rate: int) -> None:
    clipped = np.clip(audio, -1.0, 1.0)
    pcm = np.round(clipped * 32767.0).astype("<i2")
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())


def render_kind(
    kind: str,
    args: argparse.Namespace,
    rng: np.random.Generator,
) -> list[RenderedSound]:
    sample_count = int(round(args.duration * args.sample_rate))
    t = time_axis(args.duration, args.sample_rate)
    noise_rms = db_to_amplitude(args.noise_dbfs)
    masker = make_stereo_masker(
        sample_count,
        args.sample_rate,
        noise_rms,
        rng,
        cutoff_hz=args.masker_cutoff_hz,
        rolloff_db=args.masker_rolloff_db,
    )

    if kind == "sleep":
        rendered_sounds = [render_sleep(args, masker, t, noise_rms)]
    elif kind == "sub-alpha":
        rendered_sounds = [render_sub_alpha(args, masker, t, noise_rms)]
    elif kind == "sub-beta":
        rendered_sounds = [
            render_sub_beta_fixed(args, masker, t, noise_rms, level_db)
            for level_db in args.sub_beta_levels_db
        ]
    elif kind == "sweep":
        rendered_sounds = [render_sweep(args, masker, t, noise_rms)]
    else:
        raise ValueError(f"unknown kind: {kind}")

    out = []
    for rendered in rendered_sounds:
        audio, peak_reduction_db = peak_limit_if_needed(rendered.audio, args.peak_dbfs)
        metadata = dict(rendered.metadata)
        metadata.update(
            {
                "sample_rate": args.sample_rate,
                "duration_seconds": args.duration,
                "noise_rms_dbfs": args.noise_dbfs,
                "masker": {
                    "type": "pink noise",
                    "cutoff_hz": args.masker_cutoff_hz,
                    "rolloff_db_at_nyquist": args.masker_rolloff_db,
                    "filter_model": "frequency-domain log shelf above cutoff",
                },
                "peak_limit_reduction_db": round(peak_reduction_db, 6),
                "spl_note": "WAV dBFS is not SPL. Calibrate playback externally for 58 dB SPL or other clinical levels.",
            }
        )
        out.append(RenderedSound(rendered.name, audio, metadata))
    return out


def sound_kinds(selected: str) -> tuple[str, ...]:
    if selected == "all":
        return ("sleep", "sub-alpha", "sub-beta", "sweep")
    return (selected,)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate masked subliminal ClinicalQ sound probes as stereo WAV files."
    )
    parser.add_argument(
        "--kind",
        choices=("all", "sleep", "sub-alpha", "sub-beta", "sweep"),
        default="all",
        help="sound recipe to render",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("output") / "subliminal_sounds",
        help="directory where WAV and metadata files are written",
    )
    parser.add_argument("--duration", type=float, default=DEFAULT_DURATION_SECONDS)
    parser.add_argument("--sample-rate", type=int, default=DEFAULT_SAMPLE_RATE)
    parser.add_argument(
        "--seed",
        type=int,
        default=20260525,
        help="random seed for reproducible pink-noise maskers",
    )
    parser.add_argument(
        "--noise-dbfs",
        type=float,
        default=DEFAULT_NOISE_DBFS,
        help="pink-noise RMS level in digital dBFS",
    )
    parser.add_argument(
        "--peak-dbfs",
        type=float,
        default=-1.0,
        help="peak safety ceiling; mixes above this are scaled down with relative levels preserved",
    )
    parser.add_argument("--masker-cutoff-hz", type=float, default=DEFAULT_MASKER_CUTOFF_HZ)
    parser.add_argument("--masker-rolloff-db", type=float, default=DEFAULT_MASKER_ROLLOFF_DB)
    parser.add_argument("--carrier-hz", type=float, default=300.0)

    parser.add_argument("--sleep-center-hz", type=float, default=300.0)
    parser.add_argument("--sleep-excursion-hz", type=float, default=15.0)
    parser.add_argument("--sleep-cycles-per-minute", type=float, default=7.0)
    parser.add_argument("--sleep-below-noise-db", type=float, default=15.0)

    parser.add_argument(
        "--harmonic-below-noise-db",
        type=float,
        default=15.0,
        help="constant active-blend level for sub-alpha and sweep, relative to masker RMS",
    )
    parser.add_argument(
        "--sub-beta-levels-db",
        type=parse_float_list,
        default=DEFAULT_SUB_BETA_LEVELS_DB,
        help="comma-separated fixed SUB/BETA levels below masker; default renders -15, -17, and -25 dB variants",
    )
    parser.add_argument(
        "--sweep-tones-hz",
        type=parse_float_list,
        default=DEFAULT_SWEEP_TONES_HZ,
        help="comma-separated tones for SWEEP; default is inferred",
    )
    parser.add_argument("--sweep-excursion-seconds", type=float, default=4.5)
    parser.add_argument("--sweep-pause-seconds", type=float, default=0.25)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.duration <= 0.0:
        parser.error("--duration must be greater than zero")
    if args.sample_rate <= 0:
        parser.error("--sample-rate must be greater than zero")
    if args.masker_cutoff_hz <= 0.0:
        parser.error("--masker-cutoff-hz must be greater than zero")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(args.seed)

    selected_kinds = sound_kinds(args.kind)
    if "sub-beta" in selected_kinds:
        for extension in (".wav", ".json"):
            (args.output_dir / f"sub_beta_serene_25hz{extension}").unlink(missing_ok=True)

    manifest: list[dict[str, object]] = []
    for kind in selected_kinds:
        for rendered in render_kind(kind, args, rng):
            wav_path = args.output_dir / f"{rendered.name}.wav"
            metadata_path = args.output_dir / f"{rendered.name}.json"
            write_wav(wav_path, rendered.audio, args.sample_rate)
            metadata_path.write_text(json.dumps(rendered.metadata, indent=2) + "\n", encoding="utf-8")
            manifest.append({"kind": kind, "wav": str(wav_path), "metadata": str(metadata_path)})
            print(f"wrote {wav_path}")
            print(f"wrote {metadata_path}")

    manifest_path = args.output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
