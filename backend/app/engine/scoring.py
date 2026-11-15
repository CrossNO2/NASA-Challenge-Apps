"""Weighted score, GO/CAUTION/NO-GO verdict, and shared sky/terrain evaluation grid."""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

import numpy as np
from numpy.typing import NDArray

from app.config import get_settings
from app.core.comms import dte_coverage_percentage, max_blackout_hours
from app.core.ephemeris import EPHEMERIS_SOURCE, compute_altaz
from app.core.illumination import (
    continuous_sunlit_hours_all,
    hours_until_next_sunrise,
    is_sunlit_mask,
)
from app.core.sites_repo import classify_terrain_source
from app.core.terrain import clearance, h_terrain, is_visible, sun_visible_fraction
from app.engine.gates import evaluate_gates
from app.schemas.feasibility import FeasibilityReport, Gate, MissionRequirements, Verdict
from app.schemas.site import HorizonProfile


@dataclass(frozen=True)
class EvaluationGrid:
    """Precomputed Sun/Earth sky+terrain arrays over a uniform UTC grid."""

    times: list[datetime]
    step_hours: float
    sun_el_deg: NDArray[np.float64]
    sun_frac: NDArray[np.float64]
    earth_el_deg: NDArray[np.float64]
    earth_visible: NDArray[np.bool_]
    terrain_source: Literal["lola", "synthetic", "none"]


def as_utc(t: datetime) -> datetime:
    return t.replace(tzinfo=timezone.utc) if t.tzinfo is None else t.astimezone(timezone.utc)


def build_evaluation_grid(
    lat: float,
    lon: float,
    elev_m: float,
    start_time: datetime,
    total_hours: float,
    step_hours: float = 1.0,
    horizon_profile: Optional[HorizonProfile] = None,
) -> EvaluationGrid:
    """Compute Sun and Earth alt/az and terrain visibility once across ``total_hours``."""
    t0 = as_utc(start_time)
    n_steps = max(2, int(math.ceil(total_hours / step_hours)) + 1)
    times = [t0 + timedelta(hours=step_hours * i) for i in range(n_steps)]

    sun = compute_altaz(lat, lon, elev_m, times, "sun")
    earth = compute_altaz(lat, lon, elev_m, times, "earth")

    prof_vals = horizon_profile.elevations_deg if horizon_profile else None
    prof_step = horizon_profile.step_deg if horizon_profile else 1.0

    sun_terr = h_terrain(prof_vals, sun.az_deg, prof_step)
    sun_clr = clearance(sun.el_deg, sun_terr)
    sun_frac = sun_visible_fraction(sun_clr)

    earth_terr = h_terrain(prof_vals, earth.az_deg, prof_step)
    earth_clr = clearance(earth.el_deg, earth_terr)
    earth_vis = is_visible(earth_clr)

    return EvaluationGrid(
        times=times,
        step_hours=step_hours,
        sun_el_deg=sun.el_deg,
        sun_frac=sun_frac,
        earth_el_deg=earth.el_deg,
        earth_visible=earth_vis,
        terrain_source=classify_terrain_source(horizon_profile),
    )


def score_and_verdict(gates: list[Gate]) -> tuple[float, Verdict, list[str]]:
    """Compute weighted overall score, verdict (GO/CAUTION/NO-GO), and explanations."""
    s = get_settings()
    weights = {
        "power": s.weight_power,
        "comms": s.weight_comms,
        "terrain": s.weight_terrain,
        "resilience": s.weight_resilience,
    }
    total_w = sum(weights[g.name] for g in gates)
    if total_w <= 0.0:
        overall = 0.0
    else:
        overall = round(sum(g.score * weights[g.name] for g in gates) / total_w, 1)

    statuses = [g.status for g in gates]
    if "FAIL" in statuses:
        verdict: Verdict = "NO-GO"
    elif "WARNING" in statuses or overall < 75.0:
        verdict = "CAUTION"
    else:
        verdict = "GO"

    # Put failing/warning reasons first so UI/slides highlight root causes immediately.
    priority = {"FAIL": 0, "WARNING": 1, "PASS": 2, "SKIPPED": 3}
    ordered = sorted(gates, key=lambda g: priority[g.status])
    reasons = [f"[{g.name.upper()} {g.status}] {g.reason}" for g in ordered]
    return overall, verdict, reasons


def evaluate_at_index(
    grid: EvaluationGrid,
    sunlit_mask: NDArray[np.bool_],
    cont_sun_all: NDArray[np.float64],
    idx: int,
    slope_deg: float,
    req: MissionRequirements,
) -> tuple[list[Gate], float, Verdict, list[str], float, Optional[float]]:
    """Evaluate all 4 gates and score at precomputed grid index ``idx``."""
    mission_steps = max(1, int(math.ceil(req.mission_duration_h / grid.step_hours)))
    delay_steps = int(round(req.scrub_delay_h / grid.step_hours))
    n = sunlit_mask.size

    cont_sun = float(cont_sun_all[idx])
    to_sunrise = hours_until_next_sunrise(sunlit_mask, idx, grid.step_hours)
    win = slice(idx, min(idx + mission_steps, n))
    dte_pct = dte_coverage_percentage(grid.earth_visible[win])
    max_blk = max_blackout_hours(grid.earth_visible[win], grid.step_hours)

    delayed_idx = min(idx + delay_steps, n - 1)
    d_cont_sun = float(cont_sun_all[delayed_idx])
    d_to_sunrise = hours_until_next_sunrise(sunlit_mask, delayed_idx, grid.step_hours)
    d_win = slice(delayed_idx, min(delayed_idx + mission_steps, n))
    d_dte_pct = dte_coverage_percentage(grid.earth_visible[d_win])
    d_max_blk = max_blackout_hours(grid.earth_visible[d_win], grid.step_hours)

    gates = evaluate_gates(
        continuous_sun_h=cont_sun,
        hours_to_sunrise=to_sunrise,
        dte_pct=dte_pct,
        max_blackout_h=max_blk,
        slope_deg=slope_deg,
        delayed_continuous_sun_h=d_cont_sun,
        delayed_hours_to_sunrise=d_to_sunrise,
        delayed_dte_pct=d_dte_pct,
        delayed_max_blackout_h=d_max_blk,
        req=req,
    )
    overall, verdict, reasons = score_and_verdict(gates)
    return gates, overall, verdict, reasons, cont_sun, to_sunrise


def evaluate_feasibility(
    lat: float,
    lon: float,
    elev_m: float,
    slope_deg: float,
    landing_time: datetime,
    req: MissionRequirements,
    site_id: Optional[str] = None,
    horizon_profile: Optional[HorizonProfile] = None,
) -> FeasibilityReport:
    """Run full 4-gate feasibility assessment for a single landing site and timestamp."""
    horizon_hours = max(720.0, math.ceil(req.mission_duration_h + req.scrub_delay_h + 360.0))
    grid = build_evaluation_grid(
        lat=lat,
        lon=lon,
        elev_m=elev_m,
        start_time=landing_time,
        total_hours=horizon_hours,
        step_hours=1.0,
        horizon_profile=horizon_profile,
    )
    sunlit = is_sunlit_mask(grid.sun_el_deg, grid.sun_frac, req.min_sun_elevation_deg)
    cont_all = continuous_sunlit_hours_all(sunlit, grid.step_hours)
    gates, overall, verdict, reasons, _, _ = evaluate_at_index(
        grid=grid,
        sunlit_mask=sunlit,
        cont_sun_all=cont_all,
        idx=0,
        slope_deg=slope_deg,
        req=req,
    )
    return FeasibilityReport(
        site_id=site_id,
        lat=lat,
        lon=lon,
        landing_time=as_utc(landing_time),
        requirements=req,
        gates=gates,
        score=overall,
        verdict=verdict,
        reasons=reasons,
        source=EPHEMERIS_SOURCE,
        terrain_source=grid.terrain_source,
    )
