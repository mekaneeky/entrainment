from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

import matplotlib

matplotlib.use("QtAgg")

import mne


DEFAULT_PATH = Path(
    r"C:\Users\HP\Documents\OpenBCI_GUI\Recordings\OpenBCISession_2026-04-05_08-25-33\BrainFlow-RAW_2026-04-05_08-25-33_0.csv"
)


def _merge_spans(spans: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if not spans:
        return []
    spans = sorted(spans)
    merged = [spans[0]]
    for start, end in spans[1:]:
        prev_start, prev_end = merged[-1]
        if start <= prev_end:
            merged[-1] = (prev_start, max(prev_end, end))
        else:
            merged.append((start, end))
    return merged


def _good_spans(total_duration: float, bad_spans: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if total_duration <= 0:
        return []
    if not bad_spans:
        return [(0.0, total_duration)]
    spans: list[tuple[float, float]] = []
    cursor = 0.0
    for start, end in _merge_spans(bad_spans):
        start = max(0.0, min(total_duration, start))
        end = max(0.0, min(total_duration, end))
        if start > cursor:
            spans.append((cursor, start))
        cursor = max(cursor, end)
    if cursor < total_duration:
        spans.append((cursor, total_duration))
    return [(start, end) for start, end in spans if end > start]


def load_brainflow_csv(path: Path, sfreq: float = 125.0) -> tuple[mne.io.RawArray, np.ndarray]:
    matrix = np.loadtxt(path, delimiter="\t")
    if matrix.ndim != 2:
        raise RuntimeError(f"Expected a 2D BrainFlow CSV matrix, got shape {matrix.shape!r}")
    if matrix.shape[1] < 32:
        raise RuntimeError(
            f"Expected at least 32 columns for Cyton + Daisy BrainFlow CSV, found {matrix.shape[1]}"
        )

    # BrainFlow exports EEG channels in microvolts. MNE expects volts.
    eeg = (matrix[:, 1:17] * 1e-6).T
    ch_names = [f"Ch{i}" for i in range(1, 17)]
    info = mne.create_info(ch_names=ch_names, sfreq=sfreq, ch_types=["eeg"] * 16)
    raw = mne.io.RawArray(eeg, info, verbose="ERROR")
    raw.info["line_freq"] = 50.0
    raw.set_meas_date(None)

    markers = matrix[:, 31]
    nonzero_markers = np.where(markers != 0)[0]
    if nonzero_markers.size:
        onsets = nonzero_markers.astype(float) / sfreq
        durations = np.zeros_like(onsets, dtype=float)
        descriptions = [f"marker:{markers[idx]:g}" for idx in nonzero_markers]
        raw.set_annotations(mne.Annotations(onsets, durations, descriptions))

    return raw, matrix


def save_cleaned_outputs(
    raw: mne.io.BaseRaw,
    source_path: Path,
    output_dir: Path,
) -> dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)

    bad_spans = [
        (float(onset), float(onset + duration))
        for onset, duration, description in zip(
            raw.annotations.onset, raw.annotations.duration, raw.annotations.description
        )
        if str(description).lower().startswith("bad")
    ]
    bad_channels = list(raw.info.get("bads", []))

    cleaned = raw.copy()
    if bad_channels:
        cleaned.drop_channels(bad_channels)

    keep_spans = _good_spans(cleaned.times[-1] + (1.0 / cleaned.info["sfreq"]), bad_spans)
    cleaned_segments: list[mne.io.BaseRaw] = []
    sample_pad = 1.0 / cleaned.info["sfreq"]
    for start, end in keep_spans:
        tmax = max(start, end - sample_pad)
        if tmax < start:
            continue
        cleaned_segments.append(cleaned.copy().crop(tmin=start, tmax=tmax))

    if not cleaned_segments:
        raise RuntimeError("No clean data remained after removing bad annotated spans.")

    cleaned_final = cleaned_segments[0]
    if len(cleaned_segments) > 1:
        cleaned_final = mne.concatenate_raws(cleaned_segments, verbose="ERROR")

    stem = source_path.stem
    fif_path = output_dir / f"{stem}_cleaned.fif"
    edf_path = output_dir / f"{stem}_cleaned.edf"
    summary_path = output_dir / f"{stem}_cleaned_summary.json"

    cleaned_final.save(fif_path, overwrite=True, verbose="ERROR")
    mne.export.export_raw(edf_path, cleaned_final, fmt="edf", overwrite=True)

    summary = {
        "source_file": str(source_path),
        "cleaned_fif": str(fif_path),
        "cleaned_edf": str(edf_path),
        "bad_channels_removed": bad_channels,
        "bad_time_spans_seconds": [[round(start, 6), round(end, 6)] for start, end in bad_spans],
        "remaining_channels": cleaned_final.ch_names,
        "remaining_duration_seconds": float(cleaned_final.times[-1] + (1.0 / cleaned_final.info["sfreq"])),
        "sampling_rate": float(cleaned_final.info["sfreq"]),
    }
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    summary["summary_json"] = str(summary_path)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Open a BrainFlow CSV in an MNE browser for manual editing.")
    parser.add_argument("csv_path", nargs="?", default=str(DEFAULT_PATH), help="Path to BrainFlow CSV")
    parser.add_argument(
        "--sfreq",
        type=float,
        default=125.0,
        help="Sampling rate in Hz. Cyton + Daisy live BrainFlow recordings are usually 125 Hz.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path.home() / "Documents" / "OpenBCI_GUI" / "Edited",
        help="Directory for cleaned outputs",
    )
    parser.add_argument("--dry-run", action="store_true", help="Only validate loading, do not open the browser")
    args = parser.parse_args()

    source_path = Path(args.csv_path)
    if not source_path.exists():
        raise FileNotFoundError(f"BrainFlow CSV not found: {source_path}")

    raw, _ = load_brainflow_csv(source_path, sfreq=float(args.sfreq))

    if args.dry_run:
        print(f"Loaded {source_path}")
        print(f"Channels: {raw.ch_names}")
        print(f"Duration seconds: {raw.times[-1] + (1.0 / raw.info['sfreq']):.3f}")
        return 0

    try:
        mne.viz.set_browser_backend("qt")
    except Exception:
        pass

    print("MNE browser opened.")
    print("Click channel names to mark/unmark bad channels.")
    print("Press 'a' then drag to mark bad time spans.")
    print("Close the browser window when finished; cleaned FIF/EDF will be written automatically.")

    raw.plot(
        block=True,
        scalings="auto",
        title=f"OpenBCI Editor: {source_path.name}",
        remove_dc=True,
        show=True,
    )

    summary = save_cleaned_outputs(raw, source_path, args.output_dir)
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
