from __future__ import annotations

import argparse
import json
from pathlib import Path

import mne
import numpy as np


def _detect_bad_channels(raw: mne.io.BaseRaw) -> list[str]:
    picks = mne.pick_types(raw.info, eeg=True, exclude=[])
    if len(picks) < 4:
        return []

    data = raw.get_data(picks=picks)
    if data.size == 0:
        return []

    stds = np.nanstd(data, axis=1)
    finite = stds[np.isfinite(stds)]
    if finite.size == 0:
        return []

    median = float(np.median(finite))
    if median <= 0:
        return []

    low = median * 0.10
    high = median * 5.00
    bad_idx = np.where((stds < low) | (stds > high) | ~np.isfinite(stds))[0]
    ch_names = np.asarray(raw.ch_names)[picks]
    return [str(ch_names[i]) for i in bad_idx.tolist()]


def _read_raw(path: Path) -> mne.io.BaseRaw:
    suffix = path.suffix.lower()
    if suffix == ".edf":
        return mne.io.read_raw_edf(path, preload=True, verbose="ERROR")
    if suffix == ".fif":
        return mne.io.read_raw_fif(path, preload=True, verbose="ERROR")
    return mne.io.read_raw(path, preload=True, verbose="ERROR")


def _output_path(dataset_root: Path, input_path: Path, output_root: Path, suffix: str) -> Path:
    rel = input_path.relative_to(dataset_root)
    stem = input_path.stem
    out_name = f"{stem}{suffix}.fif"
    return output_root / rel.parent / out_name


def main() -> int:
    parser = argparse.ArgumentParser(description="Create cleaned resting EEG derivatives from raw EDF/FIF files.")
    parser.add_argument("--dataset-root", type=Path, required=True, help="Dataset root path")
    parser.add_argument("--glob", type=str, required=True, help="Input file glob relative to dataset root")
    parser.add_argument("--output-root", type=Path, required=True, help="Output root for cleaned derivatives")
    parser.add_argument("--suffix", type=str, default="_desc-cleanedauto_eeg", help="Output filename suffix before .fif")
    parser.add_argument("--l-freq", type=float, default=1.0, help="High-pass frequency")
    parser.add_argument("--h-freq", type=float, default=40.0, help="Low-pass frequency")
    parser.add_argument("--notch-hz", type=float, default=50.0, help="Notch frequency; set <=0 to disable")
    parser.add_argument("--resample-hz", type=float, default=250.0, help="Resample frequency; set <=0 to keep native")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing cleaned outputs")
    args = parser.parse_args()

    dataset_root = args.dataset_root.resolve()
    output_root = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    input_paths = sorted(dataset_root.glob(args.glob))
    if not input_paths:
        raise RuntimeError(f"No files matched {args.glob} under {dataset_root}")

    summary = {
        "dataset_root": str(dataset_root),
        "output_root": str(output_root),
        "glob": args.glob,
        "count_total": len(input_paths),
        "count_processed": 0,
        "count_skipped": 0,
        "count_failed": 0,
        "files": [],
    }

    for i, in_path in enumerate(input_paths, start=1):
        out_path = _output_path(dataset_root, in_path, output_root, args.suffix)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        if out_path.exists() and not args.overwrite:
            summary["count_skipped"] += 1
            if i % 25 == 0:
                print(f"[{i}/{len(input_paths)}] skip {in_path}", flush=True)
            continue

        try:
            raw = _read_raw(in_path)
            raw.pick_types(eeg=True)
            raw.load_data()
            raw.set_montage("standard_1020", on_missing="ignore", verbose="ERROR")

            if args.notch_hz and args.notch_hz > 0:
                raw.notch_filter(freqs=[float(args.notch_hz)], verbose="ERROR")
            raw.filter(l_freq=float(args.l_freq), h_freq=float(args.h_freq), verbose="ERROR")

            bads = _detect_bad_channels(raw)
            raw.info["bads"] = bads
            if bads and len(bads) < max(1, len(raw.ch_names) - 2):
                try:
                    raw.interpolate_bads(reset_bads=True, origin=(0.0, 0.0, 0.04), verbose="ERROR")
                except Exception:
                    # Continue with filtered/rereferenced data if interpolation is not feasible for this file.
                    raw.info["bads"] = []

            if args.resample_hz and args.resample_hz > 0:
                raw.resample(float(args.resample_hz), verbose="ERROR")

            raw.set_eeg_reference("average", projection=False, verbose="ERROR")
            raw.save(out_path, overwrite=True, verbose="ERROR")

            summary["count_processed"] += 1
            summary["files"].append({"input": str(in_path), "output": str(out_path), "bads_detected": bads})
            if i % 25 == 0:
                print(f"[{i}/{len(input_paths)}] done {in_path}", flush=True)
        except Exception as exc:
            summary["count_failed"] += 1
            summary["files"].append({"input": str(in_path), "error": str(exc)})
            print(f"[{i}/{len(input_paths)}] fail {in_path}: {exc}", flush=True)

    summary_path = output_root / "cleaning_summary.json"
    with summary_path.open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(
        f"Finished. processed={summary['count_processed']} skipped={summary['count_skipped']} "
        f"failed={summary['count_failed']} summary={summary_path}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
