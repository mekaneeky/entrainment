# clinicalq-backend

Python engine for guided ClinicalQ acquisition and analysis.

## NF-Bay blocks

`clinicalq_backend.nfbay` contains BrainBay-style block primitives and an alpha/theta neurofeedback pipeline:

- `FilterBlock`
- `MagnitudeBlock`
- `AverageBlock`
- `ThresholdBlock`
- `AndBlock`, `OrBlock`, `NotBlock`
- `TranslateBlock`
- `SignalBlock`
- `SessionTimeBlock`
- `AlphaThetaNeurofeedbackPipeline`
- `ResilienceTrainingVariant` (dominant +/- offset cycle + 60s stickiness)

Minimal example:

```python
from clinicalq_backend.nfbay import AlphaThetaConfig, AlphaThetaNeurofeedbackPipeline

cfg = AlphaThetaConfig(sampling_rate=250)
pipeline = AlphaThetaNeurofeedbackPipeline(cfg)

sample_value = 12.3
step = pipeline.process_sample(sample_value)
print(step.feedback_enabled, step.feedback_signal, step.ratio)
```

Resilience variant example:

```python
from clinicalq_backend.nfbay import ResilienceSiteConfig, ResilienceTrainingVariant

variant = ResilienceTrainingVariant(
    {
        "Fz": ResilienceSiteConfig(offset_hz=2.0, target_mode="dominant_plus_return"),
        "Pz": ResilienceSiteConfig(offset_hz=1.5, target_mode="dominant_plus_minus"),
    }
)

step = variant.process_site_samples({"Fz": 12.3, "Pz": 9.8})
print(step.combined_feedback_signal, step.by_site["Fz"].stickiness_ratio_60s)
```

CLI run (for desktop Spark UI and standalone runs):

```bash
python -m clinicalq_backend.cli run-nfbay --config ./nfbay-config.json --output ./nfbay-result.json
```

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
  --dataset data/ds005385/derivatives/cleaned_auto \
  --glob 'sub-*/ses-1/eeg/*_task-EyesClosed_acq-pre_eeg_desc-cleanedauto_eeg.fif' \
  --output backend/clinicalq_backend/data/coherence_norms_dvs_608_cleanedauto.json
```

Download DVS resting files (optional helper):

```bash
python3 backend/scripts/download_ds005385_dvs.py --output data/ds005385 --task EyesClosed --acquisition pre --session ses-1
```
