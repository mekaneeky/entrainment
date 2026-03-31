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
