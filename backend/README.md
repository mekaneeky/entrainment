# clinicalq-backend

Python engine for guided ClinicalQ acquisition and analysis.

Coherence run (Z-scores and cutoffs referenced to `ds003775` norms):

```bash
python -m clinicalq_backend.cli run-coherence --config ./coherence-config.json --output ./coherence-result.json
```

`run-coherence` now emits both:
- coherence Z-score metrics
- bandpower Z-score metrics

It supports:
- `norms_dataset`: `ds003775` or `dvs_608`
- `zscore_mode`: `global` or `age`
- `subject_age`: numeric age (used when `zscore_mode=age`)
- up to 20 configured coherence locations (via `pairs` + `channels`)
- live board capture or offline `source.kind=existing_recordings`
- multiple EEG files, with `source.sync_mode=parallel` for synchronized multi-recorder sessions
- shared artifact cut windows via `source.exclude_ranges`

Offline recording import notes:
- `channels` may use BrainFlow-style numeric indices for live capture, or file channel labels / 1-based column positions for imported recordings.
- imported `.edf` / `.fif` files require `pip install 'clinicalq-backend[offline]'`
- parallel multi-file import only makes cross-file coherence sense when those recordings were truly time-aligned

Minimal offline example:

```json
{
  "epoch_seconds": 30,
  "sampling_rate": 250,
  "norms_dataset": "dvs_608",
  "channels": {
    "F3": "F3",
    "F4": "F4",
    "Cz": "Cz",
    "O1": "O1",
    "Fz": "Fz"
  },
  "pairs": [["F3", "F4"], ["F3", "Cz"], ["F4", "Cz"], ["Fz", "Cz"], ["Cz", "O1"]],
  "source": {
    "kind": "existing_recordings",
    "sync_mode": "parallel",
    "recordings": [
      {"path": "C:/data/session_a.edf"},
      {"path": "C:/data/session_b.edf"}
    ],
    "exclude_ranges": [[10, 14.5], [52, 57]]
  }
}
```

Build norms datasets:

```bash
# OpenNeuro ds003775 (rest-eyes-closed)
python3 backend/scripts/build_coherence_norms_ds003775.py --dataset data/ds003775

# Dortmund Vital Study (OpenNeuro ds005385), defaults to ses-1 EyesClosed pre
python3 backend/scripts/build_coherence_norms_dvs.py --dataset data/ds005385
```

Build cleaned derivatives (auto-clean) and cleaned norms:

```bash
# DVS EC pre ses-1 cleaned FIF derivatives
python3 backend/scripts/preprocess_rest_eeg_cleaned.py \
  --dataset-root data/ds005385 \
  --glob 'sub-*/ses-1/eeg/*_task-EyesClosed_acq-pre_eeg.edf' \
  --output-root data/ds005385/derivatives/cleaned_auto

# DVS cleaned norms from cleaned FIF files
python3 backend/scripts/build_coherence_norms_dvs.py \
  --dataset data/ds005385 \
  --glob 'derivatives/cleaned_auto/sub-*/ses-1/eeg/*_task-EyesClosed_acq-pre_eeg_desc-cleanedauto_eeg.fif' \
  --pairs all \
  --output backend/clinicalq_backend/data/coherence_norms_dvs_608_cleanedauto.json
```

This emits expanded metrics including:
- pair metrics: coherence, phase, asymmetry
- site metrics: total coherence (`TOTCOH`), band amplitude, absolute power, relative power, theta/beta ratio, peak alpha frequency, total amplitude
- global metric: total coherence (`TOTCOH_GLOBAL`) per band

Legacy 10-20 aliases are normalized automatically:
- `T3 -> T7`
- `T4 -> T8`
- `T5 -> P7`
- `T6 -> P8`

Download DVS resting files (optional helper):

```bash
python3 backend/scripts/download_ds005385_dvs.py --output data/ds005385 --task EyesClosed --acquisition pre --session ses-1
```

Manual metric value scoring + 10-20 z-score topomap:

```bash
# input JSON format: {"metrics": {"AP:F3:alpha": 1.23, "AP:F4:alpha": 1.11, ...}}
python3 backend/scripts/score_and_plot_zmetrics.py \
  --norms-dataset dvs_608_cleaned \
  --zscore-mode age \
  --subject-age 35 \
  --input-json ./metric_values.json \
  --output-json ./scored_metrics.json \
  --plot-output ./topomap_ap_alpha.png \
  --plot-metric-type absolute_power \
  --plot-band alpha
```

You can also score directly from a prior coherence result JSON:

```bash
python3 backend/scripts/score_and_plot_zmetrics.py \
  --norms-dataset dvs_608_cleaned \
  --result-json ./coherence-result.json \
  --output-json ./scored_metrics.json \
  --plot-output ./topomap_ap_alpha.png \
  --plot-metric-type absolute_power \
  --plot-band alpha
```

Pair-line connectivity map (example: coherence alpha, show all pairs):

```bash
python3 backend/scripts/score_and_plot_zmetrics.py \
  --norms-dataset dvs_608_cleaned \
  --result-json ./coherence-result.json \
  --output-json ./scored_metrics.json \
  --plot-output ./coherence_alpha_lines.png \
  --plot-metric-type coherence \
  --plot-band alpha \
  --pair-line-show-all
```

Hyper-coherent only lines (`z >= 2`):

```bash
python3 backend/scripts/score_and_plot_zmetrics.py \
  --norms-dataset dvs_608_cleaned \
  --result-json ./coherence-result.json \
  --output-json ./scored_metrics.json \
  --plot-output ./coherence_alpha_hyper_lines.png \
  --plot-metric-type coherence \
  --plot-band alpha \
  --pair-line-z-threshold 2.0 \
  --pair-positive-only
```
