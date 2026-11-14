"""Multi-site comparison matrix across one full synodic cycle."""
from __future__ import annotations

import math
from datetime import datetime

from app.core.comms import dte_coverage_percentage
from app.core.ephemeris import EPHEMERIS_SOURCE
from app.core.illumination import (
    continuous_sunlit_hours_all,
    illumination_percentage,
    is_sunlit_mask,
)
from app.core.sites_repo import load_horizon_profile, load_sites
from app.engine.scoring import as_utc, build_evaluation_grid, evaluate_at_index
from app.schemas.feasibility import (
    CompareResponse,
    FeasibilityReport,
    MissionRequirements,
    SiteComparisonItem,
)

SYNODIC_CYCLE_HOURS = 709.0


def compare_sites(
    site_ids: list[str],
    landing_time: datetime,
    req: MissionRequirements,
) -> CompareResponse:
    """Evaluate and rank 2-6 landing sites at ``landing_time`` and over one synodic cycle."""
    sites_map = load_sites()
    missing = [sid for sid in site_ids if sid not in sites_map]
    if missing:
        raise KeyError(f"Unknown site(s): {', '.join(missing)}")

    t0 = as_utc(landing_time)
    horizon_hours = max(SYNODIC_CYCLE_HOURS, math.ceil(req.mission_duration_h + req.scrub_delay_h + 360.0))
    cycle_steps = int(SYNODIC_CYCLE_HOURS)

    items: list[SiteComparisonItem] = []
    for sid in site_ids:
        site = sites_map[sid]
        prof = load_horizon_profile(sid)
        grid = build_evaluation_grid(
            lat=site.lat,
            lon=site.lon,
            elev_m=site.elevation_m,
            start_time=t0,
            total_hours=horizon_hours,
            step_hours=1.0,
            horizon_profile=prof,
        )
        sunlit = is_sunlit_mask(grid.sun_el_deg, grid.sun_frac, req.min_sun_elevation_deg)
        cont_all = continuous_sunlit_hours_all(sunlit, grid.step_hours)
        gates, overall, verdict, reasons, cont_sun, to_sunrise = evaluate_at_index(
            grid=grid,
            sunlit_mask=sunlit,
            cont_sun_all=cont_all,
            idx=0,
            slope_deg=site.slope_deg,
            req=req,
        )
        cycle_illum = round(illumination_percentage(sunlit[:cycle_steps]), 1)
        cycle_dte = round(dte_coverage_percentage(grid.earth_visible[:cycle_steps]), 1)

        report = FeasibilityReport(
            site_id=site.id,
            lat=site.lat,
            lon=site.lon,
            landing_time=t0,
            requirements=req,
            gates=gates,
            score=overall,
            verdict=verdict,
            reasons=reasons,
            source=EPHEMERIS_SOURCE,
            terrain_source=grid.terrain_source,
        )
        items.append(
            SiteComparisonItem(
                site_id=site.id,
                name=site.name,
                program=site.program,
                lat=site.lat,
                lon=site.lon,
                slope_deg=site.slope_deg,
                sun_el_deg=round(float(grid.sun_el_deg[0]), 2),
                earth_el_deg=round(float(grid.earth_el_deg[0]), 2),
                continuous_sun_hours=round(cont_sun, 1),
                hours_to_sunrise=None if to_sunrise is None else round(to_sunrise, 1),
                cycle_illumination_pct=cycle_illum,
                cycle_dte_pct=cycle_dte,
                feasibility=report,
            )
        )

    best = max(items, key=lambda it: (it.feasibility.score, it.continuous_sun_hours))
    return CompareResponse(
        landing_time=t0,
        recommended_site_id=best.site_id,
        items=items,
    )
