from __future__ import annotations

import math
from dataclasses import asdict
from typing import Any, Dict, Iterable, List

import numpy as np

from clinicalq_backend.types import MetricResult, SessionResult


def _safe_div(num: float, den: float) -> float:
    if den == 0.0:
        return float("nan")
    return num / den


def _pct_change(new_value: float, base_value: float) -> float:
    if base_value == 0.0:
        return float("nan")
    return (new_value - base_value) / base_value * 100.0


def _pct_drop(before: float, after: float) -> float:
    if before == 0.0:
        return float("nan")
    return (before - after) / before * 100.0


def _mean_features(items: Iterable[Dict[str, float]]) -> Dict[str, float]:
    rows = [x for x in items if x]
    if not rows:
        return {}
    keys = rows[0].keys()
    return {k: float(np.mean([row.get(k, float("nan")) for row in rows])) for k in keys}


def _status_for_lt(value: float, limit: float) -> str:
    if math.isnan(value):
        return "MISSING"
    return "IN_RANGE" if value < limit else "OUT_OF_RANGE"


def _status_for_gt(value: float, limit: float) -> str:
    if math.isnan(value):
        return "MISSING"
    return "IN_RANGE" if value > limit else "OUT_OF_RANGE"


def _status_for_between(value: float, low: float, high: float) -> str:
    if math.isnan(value):
        return "MISSING"
    return "IN_RANGE" if low <= value <= high else "OUT_OF_RANGE"


def _as_metric(
    location: str,
    metric: str,
    value: float,
    normal_range: str,
    status: str,
    probe: str,
    formula: str,
    *,
    left_value: float | None = None,
    right_value: float | None = None,
) -> MetricResult:
    return MetricResult(
        location=location,
        metric=metric,
        value=float(value) if not math.isnan(value) else float("nan"),
        left_value=None if left_value is None or math.isnan(float(left_value)) else float(left_value),
        right_value=None if right_value is None or math.isnan(float(right_value)) else float(right_value),
        normal_range=normal_range,
        status=status,
        probe=probe,
        formula=formula,
    )


def _find_epoch(
    epochs: List[Dict[str, Any]],
    location: str,
    *,
    sequence: str | None = None,
    label: str | None = None,
    index: int | None = None,
) -> Dict[str, Any] | None:
    for epoch in epochs:
        if location not in epoch.get("features", {}):
            continue
        if sequence and epoch.get("sequence") != sequence:
            continue
        if label and epoch.get("label") != label:
            continue
        if index is not None and int(epoch.get("index", -1)) != index:
            continue
        return epoch
    return None


def _find_epochs(
    epochs: List[Dict[str, Any]],
    location: str,
    *,
    sequence: str | None = None,
    labels: set[str] | None = None,
    indices: set[int] | None = None,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for epoch in epochs:
        if location not in epoch.get("features", {}):
            continue
        if sequence and epoch.get("sequence") != sequence:
            continue
        if labels is not None and epoch.get("label") not in labels:
            continue
        if indices is not None and int(epoch.get("index", -1)) not in indices:
            continue
        out.append(epoch)
    return out


def _epoch_features(epoch: Dict[str, Any] | None, location: str) -> Dict[str, float]:
    if not epoch:
        return {}
    return dict(epoch["features"].get(location, {}))


def _location_sequences(epochs: List[Dict[str, Any]], location: str) -> set[str]:
    return {str(ep.get("sequence")) for ep in epochs if location in ep.get("features", {})}


def _resolve_cz_conditions(epochs: List[Dict[str, Any]]) -> Dict[str, Dict[str, float]]:
    sequences = _location_sequences(epochs, "Cz")
    seq = "Cz" if "Cz" in sequences else "MASTER"

    eo_before = _mean_features(
        [
            _epoch_features(_find_epoch(epochs, "Cz", sequence=seq, index=1), "Cz"),
            _epoch_features(_find_epoch(epochs, "Cz", sequence=seq, index=2), "Cz"),
        ]
    )
    eo_after = _epoch_features(_find_epoch(epochs, "Cz", sequence=seq, index=4), "Cz")
    ec = _epoch_features(_find_epoch(epochs, "Cz", sequence=seq, index=3), "Cz")

    ut_epochs = _find_epochs(epochs, "Cz", sequence=seq, labels={"READ", "COUNT"})
    ut = _mean_features([ep["features"]["Cz"] for ep in ut_epochs])
    omni = _epoch_features(_find_epoch(epochs, "Cz", sequence=seq, label="OMNI"), "Cz")

    return {"EO": eo_before, "EO_AFTER": eo_after, "EC": ec, "UT": ut, "OMNI": omni}


def _resolve_o1_conditions(epochs: List[Dict[str, Any]]) -> Dict[str, Dict[str, float]]:
    sequences = _location_sequences(epochs, "O1")
    if "O1" in sequences:
        seq = "O1"
        eo_before = _mean_features(
            [
                _epoch_features(_find_epoch(epochs, "O1", sequence=seq, index=1), "O1"),
                _epoch_features(_find_epoch(epochs, "O1", sequence=seq, index=2), "O1"),
            ]
        )
        eo_after = _epoch_features(_find_epoch(epochs, "O1", sequence=seq, index=4), "O1")
        ec = _epoch_features(_find_epoch(epochs, "O1", sequence=seq, index=3), "O1")
    else:
        seq = "MASTER"
        eo_before = _mean_features(
            [
                _epoch_features(_find_epoch(epochs, "O1", sequence=seq, index=1), "O1"),
                _epoch_features(_find_epoch(epochs, "O1", sequence=seq, index=2), "O1"),
            ]
        )
        eo_after = _epoch_features(_find_epoch(epochs, "O1", sequence=seq, index=4), "O1")
        ec = _epoch_features(_find_epoch(epochs, "O1", sequence=seq, index=3), "O1")

    return {"EO": eo_before, "EO_AFTER": eo_after, "EC": ec}


def _resolve_front_ec(epochs: List[Dict[str, Any]], location: str) -> Dict[str, float]:
    seqs = _location_sequences(epochs, location)
    if location in seqs:
        return _epoch_features(_find_epoch(epochs, location, sequence=location, index=1), location)

    frontal = _epoch_features(_find_epoch(epochs, location, sequence="MASTER", label="FRONTAL_EC"), location)
    if frontal:
        return frontal

    return _epoch_features(_find_epoch(epochs, location, sequence="MASTER", label="EC"), location)


def _resolve_probe_features(epochs: List[Dict[str, Any]], location: str, label: str) -> Dict[str, float]:
    seqs = _location_sequences(epochs, location)
    if location in seqs:
        found = _epoch_features(_find_epoch(epochs, location, sequence=location, label=label), location)
        if found:
            return found
    return _epoch_features(_find_epoch(epochs, location, sequence="MASTER", label=label), location)


def _value_status(value: float) -> str:
    return "MISSING" if math.isnan(value) else "IN_RANGE"


def _probe_join(*items: str) -> str:
    cleaned = [x.strip() for x in items if x and x.strip()]
    return " | ".join(cleaned)


def _analyze_cz(conditions: Dict[str, Dict[str, float]]) -> List[MetricResult]:
    eo = conditions.get("EO", {})
    ec = conditions.get("EC", {})
    eo_after = conditions.get("EO_AFTER", {})
    ut = conditions.get("UT", {})
    omni = conditions.get("OMNI", {})

    alpha_response = _pct_change(ec.get("alpha", 0.0), eo.get("alpha", 0.0))
    alpha_recovery = _pct_drop(eo.get("alpha", 0.0), eo_after.get("alpha", 0.0))
    theta_smr = _safe_div(ec.get("theta", 0.0), ec.get("smr", 0.0))
    tb_eo = _safe_div(eo.get("theta", 0.0), eo.get("beta", 0.0))
    tb_ut = _safe_div(ut.get("theta", 0.0), ut.get("beta", 0.0))
    beta_activation = _pct_change(ut.get("beta", 0.0), eo.get("beta", 0.0))
    beta_fatigue = _pct_drop(eo.get("beta", 0.0), ut.get("beta", 0.0))
    tb_challenge_shift = _pct_drop(tb_eo, tb_ut)
    total_amp_ec = ec.get("total_amp_basic", float("nan"))
    peak_alpha_ec = ec.get("peak_alpha", float("nan"))
    peak_alpha_eo = eo.get("peak_alpha", float("nan"))

    out: List[MetricResult] = []

    status = _status_for_gt(alpha_response, 30.0)
    out.append(
        _as_metric(
            "Cz",
            "Alpha response %",
            alpha_response,
            "> 30%",
            status,
            "Ask about visual processing and short-term retention issues; screen for recent severe emotional stressors."
            if status == "OUT_OF_RANGE"
            else "",
            "(Alpha_EC - Alpha_EO) / Alpha_EO * 100",
        )
    )

    status = _status_for_lt(alpha_recovery, 25.0)
    out.append(
        _as_metric(
            "Cz",
            "Alpha recovery %",
            alpha_recovery,
            "< 25%",
            status,
            "Ask about foggy thinking, cognitive decline, sleep disturbance, medication effects, sleep deprivation, or marijuana use."
            if status == "OUT_OF_RANGE"
            else "",
            "(Alpha_EO_before - Alpha_EO_after) / Alpha_EO_before * 100",
        )
    )

    status = _status_for_lt(theta_smr, 3.0)
    out.append(
        _as_metric(
            "Cz",
            "Theta/SMR (EC)",
            theta_smr,
            "< 3.0",
            status,
            "Ask about inability to sit still, sleep onset issues, headaches/chronic pain, tremor, dystonia, and motor-linked seizure features."
            if status == "OUT_OF_RANGE"
            else "",
            "Theta_EC / SMR_EC",
        )
    )

    status = _status_for_lt(tb_eo, 2.2)
    probe = ""
    if status == "OUT_OF_RANGE":
        probe = "Ask about focus and attention inefficiency (CADD profile)."
        if tb_eo > 3.0:
            probe = _probe_join(probe, "If >3.0, ask about ADHD-like presentation.")
    out.append(_as_metric("Cz", "Theta/Beta (EO)", tb_eo, "< 2.2", status, probe, "Theta_EO / Beta_EO"))

    status = _status_for_lt(tb_ut, 2.2)
    probe = ""
    if status == "OUT_OF_RANGE":
        probe = "Ask about CADD traits and fatigue under cognitive load."
        if tb_ut > 3.0:
            probe = _probe_join(probe, "If >3.0, ask about ADHD-like presentation.")
        if not math.isnan(tb_eo) and tb_eo < 2.2:
            probe = _probe_join(
                probe,
                "If EO is normal but task ratio is high, ask about reading comprehension/retention and task fatigue.",
            )
    out.append(_as_metric("Cz", "Theta/Beta (UT)", tb_ut, "< 2.2", status, probe, "Theta_UT / Beta_UT"))

    status = _status_for_lt(beta_fatigue, 15.0)
    out.append(
        _as_metric(
            "Cz",
            "Beta fatigue %",
            beta_fatigue,
            "< 15%",
            status,
            "Ask whether reading/problem solving quickly causes fatigue." if status == "OUT_OF_RANGE" else "",
            "(Beta_EO - Beta_UT) / Beta_EO * 100",
        )
    )

    status = _status_for_lt(beta_activation, 20.0)
    out.append(
        _as_metric(
            "Cz",
            "Beta activation %",
            beta_activation,
            "< 20%",
            status,
            "If >20%, ask about over-arousal/anxiety under cognitive load." if status == "OUT_OF_RANGE" else "",
            "(Beta_UT - Beta_EO) / Beta_EO * 100",
        )
    )

    status = _status_for_lt(tb_challenge_shift, 15.0)
    out.append(
        _as_metric(
            "Cz",
            "T/B challenge shift %",
            tb_challenge_shift,
            "< 15%",
            status,
            "Ask about CADD if task-related shift is elevated." if status == "OUT_OF_RANGE" else "",
            "(T/B_EO - T/B_UT) / (T/B_EO) * 100",
        )
    )

    if omni:
        theta_omni_change = _pct_change(omni.get("theta", 0.0), eo.get("theta", 0.0))
        status = _status_for_lt(theta_omni_change, -5.0)
        probe = ""
        if status == "OUT_OF_RANGE":
            if theta_omni_change > 0.0:
                probe = "Theta increased with SUB/ALPHA/OMNI; avoid prescribing that sound for home use."
            else:
                probe = "Theta did not reduce enough with SUB/ALPHA/OMNI; review sound protocol suitability."
        out.append(
            _as_metric(
                "Cz",
                "SUB/ALPHA (OMNI) Theta response %",
                theta_omni_change,
                "< -5%",
                status,
                probe,
                "(Theta_OMNI - Theta_EO) / Theta_EO * 100",
            )
        )

    status = _status_for_lt(total_amp_ec, 60.0)
    out.append(
        _as_metric(
            "Cz",
            "Total amplitude (EC)",
            total_amp_ec,
            "< 60 uV",
            status,
            "Ask about developmental delay, autism-spectrum behaviors, and marked cognitive deficits."
            if status == "OUT_OF_RANGE"
            else "",
            "Theta_EC + Alpha_EC + Beta_EC",
        )
    )

    status = _status_for_gt(peak_alpha_ec, 9.5)
    out.append(
        _as_metric(
            "Cz",
            "Peak alpha frequency (EC)",
            peak_alpha_ec,
            "> 9.5 Hz",
            status,
            "Ask about mental sluggishness." if status == "OUT_OF_RANGE" else "",
            "Peak frequency of Alpha_EC",
        )
    )

    status = _status_for_gt(peak_alpha_eo, 9.5)
    out.append(
        _as_metric(
            "Cz",
            "Peak alpha frequency (EO)",
            peak_alpha_eo,
            "> 9.5 Hz",
            status,
            "Ask about mental sluggishness." if status == "OUT_OF_RANGE" else "",
            "Peak frequency of Alpha_EO",
        )
    )

    return out


def _analyze_o1(conditions: Dict[str, Dict[str, float]]) -> List[MetricResult]:
    eo = conditions.get("EO", {})
    ec = conditions.get("EC", {})
    eo_after = conditions.get("EO_AFTER", {})

    alpha_response = _pct_change(ec.get("alpha", 0.0), eo.get("alpha", 0.0))
    alpha_recovery = _pct_drop(eo.get("alpha", 0.0), eo_after.get("alpha", 0.0))
    tb_eo = _safe_div(eo.get("theta", 0.0), eo.get("beta", 0.0))
    tb_ec = _safe_div(ec.get("theta", 0.0), ec.get("beta", 0.0))
    tb_shift = _pct_drop(tb_eo, tb_ec)
    total_amp_ec = ec.get("total_amp_basic", float("nan"))
    peak_alpha_ec = ec.get("peak_alpha", float("nan"))
    peak_alpha_eo = eo.get("peak_alpha", float("nan"))

    out: List[MetricResult] = []

    status = _status_for_gt(alpha_response, 50.0)
    probe = ""
    if status == "OUT_OF_RANGE":
        probe = "Ask about traumatic stress and poor retention of information."
    elif alpha_response >= 150.0:
        probe = "Very high alpha response can correlate with strong artistic/visual-spatial interests."
    out.append(
        _as_metric(
            "O1",
            "Alpha response %",
            alpha_response,
            "> 50%",
            status,
            probe,
            "(Alpha_EC - Alpha_EO) / Alpha_EO * 100",
        )
    )

    status = _status_for_lt(alpha_recovery, 25.0)
    out.append(
        _as_metric(
            "O1",
            "Alpha recovery %",
            alpha_recovery,
            "< 25%",
            status,
            "Ask about foggy thinking, cognitive decline, sleep issues, and medication effects."
            if status == "OUT_OF_RANGE"
            else "",
            "(Alpha_EO_before - Alpha_EO_after) / Alpha_EO_before * 100",
        )
    )

    status = _status_for_between(tb_eo, 1.8, 2.2)
    probe = ""
    if status == "OUT_OF_RANGE":
        if tb_eo < 1.8:
            probe = "Ask about poor stress tolerance, racing thoughts, anxiety, self-quieting difficulty, sleep problems, and depressive symptoms."
            if tb_eo < 1.2:
                probe = _probe_join(probe, "Markedly low ratio: ask about self-medication tendencies and GAD-like profile.")
        elif tb_eo > 3.0:
            probe = "Ask about cognitive deficiencies or Asperger-like patterning; cross-check F3/F4 Beta findings."
        else:
            probe = "Outside normative theta/beta range; correlate with stress regulation and cognition complaints."
    out.append(_as_metric("O1", "Theta/Beta (EO)", tb_eo, "1.8-2.2", status, probe, "Theta_EO / Beta_EO"))

    status = _status_for_between(tb_ec, 1.8, 2.2)
    probe = ""
    if status == "OUT_OF_RANGE":
        if tb_ec <= 1.5:
            probe = "Low EC theta/beta can track sleep disturbance; compare with EO findings."
        elif tb_ec > 3.0:
            probe = "High EC theta/beta can suggest cognitive inefficiency; consider Asperger-like pattern probes."
        else:
            probe = "Outside normative EC theta/beta range; correlate clinically with stress/sleep/cognition profile."
    out.append(_as_metric("O1", "Theta/Beta (EC)", tb_ec, "1.8-2.2", status, probe, "Theta_EC / Beta_EC"))

    status = _status_for_gt(tb_shift, -25.0)
    probe = ""
    if status == "OUT_OF_RANGE":
        probe = "If < -25%, ask about sleep-onset difficulties."
    elif tb_shift > 0:
        probe = "Positive value indicates theta/beta decreased from EO to EC."
    out.append(
        _as_metric(
            "O1",
            "T/B EO->EC shift %",
            tb_shift,
            "> -25%",
            status,
            probe,
            "(T/B_EO - T/B_EC) / (T/B_EO) * 100",
        )
    )

    status = _status_for_lt(total_amp_ec, 60.0)
    out.append(
        _as_metric(
            "O1",
            "Total amplitude (EC)",
            total_amp_ec,
            "< 60 uV",
            status,
            "Ask about developmental delay, autism-spectrum features, and marked cognitive deficits."
            if status == "OUT_OF_RANGE"
            else "",
            "Theta_EC + Alpha_EC + Beta_EC",
        )
    )

    status = _status_for_gt(peak_alpha_ec, 9.5)
    out.append(
        _as_metric(
            "O1",
            "Peak alpha frequency (EC)",
            peak_alpha_ec,
            "> 9.5 Hz",
            status,
            "Ask about mental sluggishness." if status == "OUT_OF_RANGE" else "",
            "Peak frequency of Alpha_EC",
        )
    )

    status = _status_for_gt(peak_alpha_eo, 9.5)
    out.append(
        _as_metric(
            "O1",
            "Peak alpha frequency (EO)",
            peak_alpha_eo,
            "> 9.5 Hz",
            status,
            "Ask about mental sluggishness." if status == "OUT_OF_RANGE" else "",
            "Peak frequency of Alpha_EO",
        )
    )

    return out


def _analyze_frontal_pair(f3: Dict[str, float], f4: Dict[str, float]) -> List[MetricResult]:
    out: List[MetricResult] = []

    for location, data in (("F3", f3), ("F4", f4)):
        tb = _safe_div(data.get("theta", 0.0), data.get("beta", 0.0))
        ta = _safe_div(data.get("theta", 0.0), data.get("alpha", 0.0))
        total = data.get("total_amp_basic", float("nan"))

        status = _status_for_lt(tb, 2.2)
        out.append(
            _as_metric(
                location,
                "Theta/Beta (EC)",
                tb,
                "< 2.2",
                status,
                "Ask about retrieval deficits, impulse control difficulty, emotional volatility, depression (adults), or impulse control (children)."
                if status == "OUT_OF_RANGE"
                else "",
                "Theta_EC / Beta_EC",
            )
        )

        status = _status_for_between(ta, 1.2, 1.6)
        probe = ""
        if status == "OUT_OF_RANGE":
            if ta < 1.0:
                probe = "Ask about frontal Alpha ADD profile: organization, sequencing, sustained focus, planning, completion, and talkativeness."
                if ta < 0.8:
                    probe = _probe_join(probe, "Markedly low ratio: probe fibromyalgia, chronic fatigue, and sleep disturbance.")
            else:
                probe = "Outside frontal theta/alpha target range; correlate with executive function complaints."
        out.append(_as_metric(location, "Theta/Alpha (EC)", ta, "1.2-1.6", status, probe, "Theta_EC / Alpha_EC"))

        status = _status_for_lt(total, 60.0)
        out.append(
            _as_metric(
                location,
                "Total amplitude (EC)",
                total,
                "< 60 uV",
                status,
                "Ask about developmental delays, autism-spectrum behavior, and memory/cognitive deficits."
                if status == "OUT_OF_RANGE"
                else "",
                "Theta_EC + Alpha_EC + Beta_EC",
            )
        )

    for band in ("theta", "alpha", "beta"):
        f3v = f3.get(band, float("nan"))
        f4v = f4.get(band, float("nan"))
        available = [v for v in (f3v, f4v) if not math.isnan(v)]
        mean_v = float(np.mean(available)) if available else float("nan")
        signed = float("nan") if mean_v == 0 or math.isnan(mean_v) else (f4v - f3v) / mean_v * 100.0
        abs_diff = float("nan") if math.isnan(signed) else abs(signed)
        status = "MISSING" if math.isnan(abs_diff) else ("IN_RANGE" if abs_diff <= 15.0 else "OUT_OF_RANGE")
        out.append(
            _as_metric(
                "F3/F4",
                f"{band.title()} asymmetry %",
                signed,
                "abs(diff) <= 15% (parity check)",
                status,
                "Frontal asymmetry exceeds expected parity; correlate with executive/emotional regulation history."
                if status == "OUT_OF_RANGE"
                else "",
                f"(F4_{band} - F3_{band}) / mean(F3_{band}, F4_{band}) * 100 (status uses abs)",
                left_value=f3v,
                right_value=f4v,
            )
        )

    return out


def _analyze_fz(fz: Dict[str, float]) -> List[MetricResult]:
    out: List[MetricResult] = []

    delta = fz.get("delta", float("nan"))
    hibeta_beta = _safe_div(fz.get("hibeta", 0.0), fz.get("beta", 0.0))
    hibeta_plus_beta = fz.get("hibeta_plus_beta", float("nan"))
    lo_hi_alpha = _safe_div(fz.get("lo_alpha", 0.0), fz.get("hi_alpha", 0.0))
    peak_alpha = fz.get("peak_alpha", float("nan"))

    status = _status_for_lt(delta, 9.0)
    out.append(
        _as_metric(
            "Fz",
            "Delta (EC)",
            delta,
            "< 9.0 uV",
            status,
            "Ask about concentration, forgetfulness, comprehension deficits; consider developmental delay or pain context with F3/F4 findings."
            if status == "OUT_OF_RANGE"
            else "",
            "Delta_EC",
        )
    )

    status = _status_for_between(hibeta_beta, 0.45, 0.55)
    probe = ""
    if status == "OUT_OF_RANGE":
        if hibeta_beta < 0.35:
            probe = "Very low ratio: problematic passivity profile."
        elif hibeta_beta < 0.45:
            probe = "Ask about passiveness; if <0.40, ask about anxiety despite low ratio profile."
        elif hibeta_beta > 0.80:
            probe = "High ratio: ask about obsessive/compulsive behavior."
        elif hibeta_beta > 0.60:
            probe = "Ask about anxiety and perseverative behavior."
        else:
            probe = "Ask about stubbornness, OC tendencies/OCD, perseveration, and potential hot midline pattern."
    out.append(_as_metric("Fz", "HiBeta/Beta (EC)", hibeta_beta, "0.45-0.55", status, probe, "HiBeta_EC / Beta_EC"))

    status = _status_for_lt(hibeta_plus_beta, 15.0)
    probe = ""
    if status == "OUT_OF_RANGE":
        if 0.45 <= hibeta_beta <= 0.55:
            probe = "If sum >15 with normal ratio, ask about fretting and treat as hot midline."
        else:
            probe = "Sum >15 suggests hot midline; ask about autism-spectrum behavior and related perseveration."
    out.append(_as_metric("Fz", "HiBeta + Beta (EC)", hibeta_plus_beta, "< 15 uV", status, probe, "HiBeta_EC + Beta_EC"))

    status = _status_for_lt(lo_hi_alpha, 1.5)
    probe = ""
    if status == "OUT_OF_RANGE":
        probe = "Ask about cognitive inefficiency, age-related memory/cognitive slowing, sleep issues, concentration, and forgetfulness."
        if lo_hi_alpha > 2.2:
            probe = _probe_join(probe, "Markedly high ratio: probe developmental delay and significant cognitive deficits.")
    out.append(_as_metric("Fz", "LoAlpha/HiAlpha (EC)", lo_hi_alpha, "< 1.5", status, probe, "LoAlpha_EC / HiAlpha_EC"))

    status = _status_for_gt(peak_alpha, 9.5)
    out.append(
        _as_metric(
            "Fz",
            "Peak alpha frequency (EC)",
            peak_alpha,
            "> 9.5 Hz",
            status,
            "Ask about mental sluggishness." if status == "OUT_OF_RANGE" else "",
            "Peak frequency of Alpha_EC",
        )
    )

    return out


def _o1_probe_metrics(
    label: str,
    display_name: str,
    baseline: Dict[str, float],
    probe_features: Dict[str, float],
    *,
    expected_tb_increase: bool,
) -> List[MetricResult]:
    if not probe_features:
        return []

    base_tb = _safe_div(baseline.get("theta", 0.0), baseline.get("beta", 0.0))
    probe_tb = _safe_div(probe_features.get("theta", 0.0), probe_features.get("beta", 0.0))
    tb_change = _pct_change(probe_tb, base_tb)
    theta_change = _pct_change(probe_features.get("theta", 0.0), baseline.get("theta", 0.0))
    alpha_change = _pct_change(probe_features.get("alpha", 0.0), baseline.get("alpha", 0.0))
    peak_alpha_shift = probe_features.get("peak_alpha", float("nan")) - baseline.get("peak_alpha", float("nan"))

    tb_status = _status_for_gt(tb_change, 5.0) if expected_tb_increase else _value_status(tb_change)
    theta_status = _status_for_gt(theta_change, 5.0) if expected_tb_increase else _value_status(theta_change)
    tb_probe = ""
    if tb_status == "OUT_OF_RANGE":
        tb_probe = f"{display_name} did not increase O1 Theta/Beta by at least 5%; confirm against symptoms and repeat if needed."

    return [
        _as_metric(
            "O1",
            f"{display_name} T/B response %",
            tb_change,
            "> 5% increase" if expected_tb_increase else "tracked response",
            tb_status,
            tb_probe,
            f"(T/B_{label} - T/B_EO) / T/B_EO * 100",
        ),
        _as_metric(
            "O1",
            f"{display_name} Theta response %",
            theta_change,
            "> 5% increase" if expected_tb_increase else "tracked response",
            theta_status,
            "",
            f"(Theta_{label} - Theta_EO) / Theta_EO * 100",
        ),
        _as_metric(
            "O1",
            f"{display_name} Alpha response %",
            alpha_change,
            "tracked response",
            _value_status(alpha_change),
            "",
            f"(Alpha_{label} - Alpha_EO) / Alpha_EO * 100",
        ),
        _as_metric(
            "O1",
            f"{display_name} peak alpha shift",
            peak_alpha_shift,
            "tracked response",
            _value_status(peak_alpha_shift),
            "",
            f"PeakAlpha_{label} - PeakAlpha_EO",
        ),
    ]


def _analyze_o1_sound_probes(epochs: List[Dict[str, Any]], o1_conditions: Dict[str, Dict[str, float]]) -> List[MetricResult]:
    baseline = o1_conditions.get("EO", {})
    out: List[MetricResult] = []
    out.extend(
        _o1_probe_metrics(
            "SUB_BETA",
            "SUB/BETA",
            baseline,
            _resolve_probe_features(epochs, "O1", "SUB_BETA"),
            expected_tb_increase=True,
        )
    )
    out.extend(
        _o1_probe_metrics(
            "SLEEP_SUPPORT",
            "Sleep support",
            baseline,
            _resolve_probe_features(epochs, "O1", "SLEEP_SUPPORT"),
            expected_tb_increase=False,
        )
    )
    return out


def _asymmetry_value(left: Dict[str, float], right: Dict[str, float], band: str) -> float:
    f3v = left.get(band, float("nan"))
    f4v = right.get(band, float("nan"))
    values = [v for v in (f3v, f4v) if not math.isnan(v)]
    if not values:
        return float("nan")
    mean_v = float(np.mean(values))
    if mean_v == 0 or math.isnan(mean_v):
        return float("nan")
    return (f4v - f3v) / mean_v * 100.0


def _analyze_sweep_response(
    epochs: List[Dict[str, Any]], baseline_f3: Dict[str, float], baseline_f4: Dict[str, float]
) -> List[MetricResult]:
    sweep_f3 = _resolve_probe_features(epochs, "F3", "SWEEP_POST") or _resolve_probe_features(epochs, "F3", "SWEEP")
    sweep_f4 = _resolve_probe_features(epochs, "F4", "SWEEP_POST") or _resolve_probe_features(epochs, "F4", "SWEEP")
    if not sweep_f3 or not sweep_f4:
        return []

    out: List[MetricResult] = []
    for band in ("theta", "alpha", "beta"):
        pre_signed = _asymmetry_value(baseline_f3, baseline_f4, band)
        post_signed = _asymmetry_value(sweep_f3, sweep_f4, band)
        pre_abs = abs(pre_signed) if not math.isnan(pre_signed) else float("nan")
        post_abs = abs(post_signed) if not math.isnan(post_signed) else float("nan")
        reduction_points = pre_abs - post_abs if not math.isnan(pre_abs) and not math.isnan(post_abs) else float("nan")
        status = _status_for_gt(reduction_points, 0.0)
        probe = ""
        if status == "OUT_OF_RANGE":
            probe = f"SWEEP did not reduce F3/F4 {band} asymmetry after the probe."
        out.append(
            _as_metric(
                "F3/F4",
                f"SWEEP post {band.title()} asymmetry reduction pp",
                reduction_points,
                "> 0 percentage-point reduction",
                status,
                probe,
                f"abs(pre_{band}_asymmetry) - abs(post_sweep_{band}_asymmetry)",
                left_value=pre_signed,
                right_value=post_signed,
            )
        )
    return out


def analyze_session(session_data: Dict[str, Any]) -> SessionResult:
    epochs = list(session_data.get("epochs", []))

    cz = _resolve_cz_conditions(epochs)
    o1 = _resolve_o1_conditions(epochs)
    f3 = _resolve_front_ec(epochs, "F3")
    f4 = _resolve_front_ec(epochs, "F4")
    fz = _resolve_front_ec(epochs, "Fz")

    metrics: List[MetricResult] = []
    metrics.extend(_analyze_cz(cz))
    metrics.extend(_analyze_o1(o1))
    metrics.extend(_analyze_frontal_pair(f3, f4))
    metrics.extend(_analyze_fz(fz))
    metrics.extend(_analyze_o1_sound_probes(epochs, o1))
    metrics.extend(_analyze_sweep_response(epochs, f3, f4))

    in_range = sum(1 for m in metrics if m.status == "IN_RANGE")
    out_of_range = sum(1 for m in metrics if m.status == "OUT_OF_RANGE")
    missing = sum(1 for m in metrics if m.status == "MISSING")

    probe_questions: List[str] = []
    seen = set()
    for metric in metrics:
        if metric.status != "OUT_OF_RANGE":
            continue
        if not metric.probe:
            continue
        if metric.probe not in seen:
            seen.add(metric.probe)
            probe_questions.append(metric.probe)

    summary = {
        "in_range": in_range,
        "out_of_range": out_of_range,
        "missing": missing,
        "potential_symptom_questions": probe_questions,
    }

    derived = {
        "conditions": {
            "Cz": cz,
            "O1": o1,
            "F3": {"EC": f3},
            "F4": {"EC": f4},
            "Fz": {"EC": fz},
        }
    }

    metadata = {
        "mode": session_data.get("mode"),
        "sampling_rate": session_data.get("sampling_rate"),
        "epoch_seconds": session_data.get("epoch_seconds"),
        "channels": session_data.get("channels"),
        "selected_locations": session_data.get("selected_locations"),
        "sound_probes": session_data.get("sound_probes"),
        "filters": session_data.get("filters"),
    }

    return SessionResult(metadata=metadata, metrics=metrics, summary=summary, derived=derived)


def session_result_to_dict(result: SessionResult) -> Dict[str, Any]:
    return {
        "metadata": result.metadata,
        "metrics": [asdict(m) for m in result.metrics],
        "summary": result.summary,
        "derived": result.derived,
    }
