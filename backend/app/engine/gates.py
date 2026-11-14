"""Four feasibility gates: power, comms, terrain, resilience."""
from __future__ import annotations

from typing import Optional

from app.schemas.feasibility import Gate, GateStatus, MissionRequirements


def _clamp_score(value: float) -> float:
    return round(max(0.0, min(100.0, value)), 1)


def eval_power_gate(
    continuous_sun_h: float,
    hours_to_sunrise: Optional[float],
    req: MissionRequirements,
) -> Gate:
    """Evaluate continuous solar illumination remaining from landing against mission duration."""
    pass_th = float(req.mission_duration_h)
    warn_th = round(0.7 * pass_th, 2)

    if continuous_sun_h >= pass_th:
        status: GateStatus = "PASS"
        score = 85.0 + 15.0 * min(1.0, (continuous_sun_h - pass_th) / max(pass_th, 1.0))
        reason = (
            f"{continuous_sun_h:.1f}h continuous sunlight available "
            f"(meets >= {pass_th:.1f}h mission duration)."
        )
    elif continuous_sun_h >= warn_th:
        status = "WARNING"
        score = 60.0 + 25.0 * (continuous_sun_h - warn_th) / max(pass_th - warn_th, 1e-6)
        reason = (
            f"{continuous_sun_h:.1f}h continuous sunlight covers >=70% ({warn_th:.1f}h) "
            f"but falls short of {pass_th:.1f}h mission duration."
        )
    else:
        status = "FAIL"
        score = 60.0 * (continuous_sun_h / max(warn_th, 1e-6))
        if continuous_sun_h <= 0.0:
            if hours_to_sunrise is not None:
                reason = (
                    f"Landing occurs in lunar darkness (0.0h sunlight; "
                    f"next sunrise in {hours_to_sunrise:.1f}h)."
                )
            else:
                reason = "Landing occurs in lunar darkness (no sunrise within search horizon)."
        else:
            reason = (
                f"Only {continuous_sun_h:.1f}h continuous sunlight before sunset "
                f"(below {warn_th:.1f}h safety margin)."
            )

    return Gate(
        name="power",
        status=status,
        score=_clamp_score(score),
        metric=round(continuous_sun_h, 1),
        unit="h",
        threshold_pass=round(pass_th, 1),
        threshold_warning=round(warn_th, 1),
        reason=reason,
    )


def eval_comms_gate(
    dte_pct: float,
    max_blackout_h: float,
    req: MissionRequirements,
) -> Gate:
    """Evaluate Direct-to-Earth (DTE) line-of-sight coverage during the mission window."""
    pass_th = float(req.min_dte_coverage_pct)
    warn_th = max(0.0, pass_th - 15.0)

    if not req.require_dte:
        return Gate(
            name="comms",
            status="SKIPPED",
            score=100.0,
            metric=round(dte_pct, 1),
            unit="%",
            threshold_pass=round(pass_th, 1),
            threshold_warning=round(warn_th, 1),
            reason="Direct-to-Earth (DTE) not required by mission (relay satellite assumed).",
        )

    if dte_pct >= pass_th:
        status: GateStatus = "PASS"
        if 100.0 - pass_th > 1e-6:
            score = 85.0 + 15.0 * min(1.0, (dte_pct - pass_th) / (100.0 - pass_th))
        else:
            score = 100.0
        reason = (
            f"DTE coverage {dte_pct:.1f}% meets >= {pass_th:.1f}% target "
            f"(max outage {max_blackout_h:.1f}h)."
        )
    elif dte_pct >= warn_th:
        status = "WARNING"
        score = 60.0 + 25.0 * (dte_pct - warn_th) / max(pass_th - warn_th, 1e-6)
        reason = (
            f"DTE coverage {dte_pct:.1f}% is below {pass_th:.1f}% target "
            f"(max outage {max_blackout_h:.1f}h)."
        )
    else:
        status = "FAIL"
        score = 60.0 * (dte_pct / max(warn_th, 1e-6)) if warn_th > 0.0 else 0.0
        reason = (
            f"DTE coverage {dte_pct:.1f}% is below {warn_th:.1f}% minimum "
            f"(max outage {max_blackout_h:.1f}h)."
        )

    return Gate(
        name="comms",
        status=status,
        score=_clamp_score(score),
        metric=round(dte_pct, 1),
        unit="%",
        threshold_pass=round(pass_th, 1),
        threshold_warning=round(warn_th, 1),
        reason=reason,
    )


def eval_terrain_gate(slope_deg: float, req: MissionRequirements) -> Gate:
    """Evaluate local terrain slope against lander tip-over threshold."""
    pass_th = float(req.max_slope_deg)
    warn_th = pass_th + 5.0

    if slope_deg <= pass_th:
        status: GateStatus = "PASS"
        score = 100.0 if pass_th <= 0.0 else 100.0 - 20.0 * (slope_deg / pass_th)
        reason = f"Local slope {slope_deg:.1f}° is within <= {pass_th:.1f}° lander tilt limit."
    elif slope_deg <= warn_th:
        status = "WARNING"
        score = 80.0 - 30.0 * ((slope_deg - pass_th) / 5.0)
        reason = (
            f"Local slope {slope_deg:.1f}° exceeds {pass_th:.1f}° nominal limit "
            f"(within <= {warn_th:.1f}° caution margin)."
        )
    else:
        status = "FAIL"
        score = max(0.0, 50.0 - 50.0 * ((slope_deg - warn_th) / 10.0))
        reason = f"Local slope {slope_deg:.1f}° exceeds {warn_th:.1f}° tip-over safety threshold."

    return Gate(
        name="terrain",
        status=status,
        score=_clamp_score(score),
        metric=round(slope_deg, 1),
        unit="deg",
        threshold_pass=round(pass_th, 1),
        threshold_warning=round(warn_th, 1),
        reason=reason,
    )


def eval_resilience_gate(
    delayed_power: Gate,
    delayed_comms: Gate,
    req: MissionRequirements,
) -> Gate:
    """Evaluate mission survivability if launch is scrubbed/delayed by ``req.scrub_delay_h``."""
    statuses = (delayed_power.status, delayed_comms.status)
    if "FAIL" in statuses:
        status: GateStatus = "FAIL"
    elif "WARNING" in statuses:
        status = "WARNING"
    else:
        status = "PASS"

    score = _clamp_score(0.6 * delayed_power.score + 0.4 * delayed_comms.score)
    d_sun = delayed_power.metric if delayed_power.metric is not None else 0.0
    d_dte = delayed_comms.metric if delayed_comms.metric is not None else 0.0
    reason = (
        f"With +{req.scrub_delay_h:.0f}h launch scrub: "
        f"power {delayed_power.status} ({d_sun:.1f}h sun), "
        f"comms {delayed_comms.status} ({d_dte:.1f}% DTE)."
    )

    return Gate(
        name="resilience",
        status=status,
        score=score,
        metric=round(d_sun, 1),
        unit="h",
        threshold_pass=round(float(req.mission_duration_h), 1),
        threshold_warning=round(0.7 * float(req.mission_duration_h), 1),
        reason=reason,
    )


def evaluate_gates(
    continuous_sun_h: float,
    hours_to_sunrise: Optional[float],
    dte_pct: float,
    max_blackout_h: float,
    slope_deg: float,
    delayed_continuous_sun_h: float,
    delayed_hours_to_sunrise: Optional[float],
    delayed_dte_pct: float,
    delayed_max_blackout_h: float,
    req: MissionRequirements,
) -> list[Gate]:
    """Build all four feasibility gates in canonical order."""
    power = eval_power_gate(continuous_sun_h, hours_to_sunrise, req)
    comms = eval_comms_gate(dte_pct, max_blackout_h, req)
    terrain = eval_terrain_gate(slope_deg, req)
    delayed_power = eval_power_gate(delayed_continuous_sun_h, delayed_hours_to_sunrise, req)
    delayed_comms = eval_comms_gate(delayed_dte_pct, delayed_max_blackout_h, req)
    resilience = eval_resilience_gate(delayed_power, delayed_comms, req)
    return [power, comms, terrain, resilience]
