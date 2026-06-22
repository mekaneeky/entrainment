from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import mne


DEFAULT_CSV = Path(
    r"C:\Users\HP\Documents\OpenBCI_GUI\Recordings\OpenBCISession_2026-04-05_08-25-33\BrainFlow-RAW_2026-04-05_08-25-33_0.csv"
)


def _make_raw_from_csv(csv_path: Path, *, sfreq: float) -> tuple[mne.io.RawArray, np.ndarray]:
    matrix = np.loadtxt(csv_path, delimiter="\t")
    if matrix.ndim != 2 or matrix.shape[1] < 32:
        raise RuntimeError(
            f"Expected Cyton+Daisy BrainFlow CSV with at least 32 columns, got shape {matrix.shape!r}"
        )

    # BrainFlow exports EEG channels in microvolts. MNE / EDF export expect volts.
    eeg = (matrix[:, 1:17] * 1e-6).T
    ch_names = [f"Ch{i}" for i in range(1, 17)]
    info = mne.create_info(ch_names=ch_names, sfreq=sfreq, ch_types=["eeg"] * len(ch_names))
    raw = mne.io.RawArray(eeg, info, verbose="ERROR")
    raw.set_meas_date(None)

    marker_values = matrix[:, 31]
    marker_indices = np.where(marker_values != 0)[0]
    if marker_indices.size:
        onsets = marker_indices.astype(float) / sfreq
        durations = np.zeros_like(onsets)
        descriptions = [f"marker:{marker_values[idx]:g}" for idx in marker_indices]
        raw.set_annotations(mne.Annotations(onsets, durations, descriptions))

    return raw, matrix


def convert_csv_to_edf(csv_path: Path, *, sfreq: float, output_dir: Path) -> tuple[Path, Path, Path]:
    raw, _ = _make_raw_from_csv(csv_path, sfreq=sfreq)

    output_dir.mkdir(parents=True, exist_ok=True)
    raw_path = output_dir / f"{csv_path.stem}.edf"
    browse_path = output_dir / f"{csv_path.stem}_browse.edf"
    filtered_browse_path = output_dir / f"{csv_path.stem}_browse_hp1.edf"

    # Raw-ish export
    mne.export.export_raw(raw_path, raw, fmt="edf", overwrite=True)

    # Browse-friendly export for EDFbrowser: zero-center each channel so the traces
    # are actually visible without fighting a giant DC offset.
    browse_raw = raw.copy().load_data()
    browse_raw._data = browse_raw._data - browse_raw._data.mean(axis=1, keepdims=True)
    mne.export.export_raw(browse_path, browse_raw, fmt="edf", overwrite=True)

    # Even more browse-friendly export: remove the giant slow drift so EDFbrowser
    # shows EEG-like activity instead of walls / ramps. This is for viewing only.
    filtered_browse_raw = browse_raw.copy()
    filtered_browse_raw.filter(l_freq=1.0, h_freq=40.0, verbose="ERROR")
    mne.export.export_raw(filtered_browse_path, filtered_browse_raw, fmt="edf", overwrite=True)
    return raw_path, browse_path, filtered_browse_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert OpenBCI BrainFlow CSV to EDF for EDFbrowser.")
    parser.add_argument("csv_path", nargs="?", default=str(DEFAULT_CSV), help="Path to BrainFlow CSV")
    parser.add_argument(
        "--sfreq",
        type=float,
        default=125.0,
        help="Sampling rate in Hz. Cyton+Daisy live BrainFlow recordings are usually 125 Hz.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path.home() / "Documents" / "OpenBCI_GUI" / "Converted",
        help="Directory to write the EDF file",
    )
    args = parser.parse_args()

    csv_path = Path(args.csv_path)
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    raw_path, browse_path, filtered_browse_path = convert_csv_to_edf(
        csv_path, sfreq=float(args.sfreq), output_dir=args.output_dir
    )
    print(str(raw_path))
    print(str(browse_path))
    print(str(filtered_browse_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
