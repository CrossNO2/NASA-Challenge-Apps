"""Optimal landing-window search across a synodic cycle."""
from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Optional

from app.core.ephemeris import EPHEMERIS_SOURCE
from app.core.illumination import continuous_sunlit_hours_all, is_sunlit_mask
from app.engine.scoring import as_utc, build_evaluation_grid, evaluate_at_index
from app.schemas.feasibility import (
    MissionRequirements,
    OptimalWindow,
    OptimalWindowResponse,
    Verdict,
)
from app.schemas.site import HorizonProfile


def _group_contiguous_windows(
    indices: list[int],
    times: list[datetime],
    scores: list[float],
    verdicts: list[Verdict],
) -> list[OptimalWindow]:
    if not indices:
        return []
    runs: list[list[int]] = [[indices[0]]]
    for idx in indices[1:]:
        if idx == runs[-1][-1] + 1:
            runs[-1].append(idx)
        else:
            runs.append([idx])

    windows: list[OptimalWindow] = []
    for run in runs:
        best_idx = max(run, key=lambda i: scores[i])
        windows.append(
            OptimalWindow(
                start=times[run[0]],
                end=times[run[-1]],
                best_time=times[best_idx],
                score=scores[best_idx],
                verdict=verdicts[best_idx],
            )
        )
    return windows


def find_optimal_windows(
    lat: float,
    lon: float,
    elev_m: float,
    slope_deg: float,
    start_time: datetime,
    req: MissionRequirements,
    search_days: float = 29.53,
    step_hours: float = 1.0,
    top_k: int = 3,
    site_id: Optional[str] = None,
    horizon_profile: Optional[HorizonProfile] = None,
) -> OptimalWindowResponse:
    """Scan candidate landing times over ``search_days`` and return top-k landing windows."""
    t0 = as_utc(start_time)
    search_hours = search_days * 24.0
    n_candidates = max(1, int(math.floor(search_hours / step_hours)) + 1)
    # Lookahead buffer ensures Power + Scrub-delay + Mission-duration evaluate without truncation.
    lookahead_hours = search_hours + req.mission_duration_h + req.scrub_delay_h + 720.0

    grid = build_evaluation_grid(
        lat=lat,
        lon=lon,
        elev_m=elev_m,
        start_time=t0,
        total_hours=lookahead_hours,
        step_hours=step_hours,
        horizon_profile=horizon_profile,
    )
    sunlit = is_sunlit_mask(grid.sun_el_deg, grid.sun_frac, req.min_sun_elevation_deg)
    cont_all = continuous_sunlit_hours_all(sunlit, step_hours)

    scores: list[float] = []
    verdicts: list[Verdict] = []
    for i in range(n_candidates):
        _, score_i, verdict_i, _, _, _ = evaluate_at_index(
            grid=grid,
            sunlit_mask=sunlit,
            cont_sun_all=cont_all,
            idx=i,
            slope_deg=slope_deg,
            req=req,
        )
        scores.append(score_i)
        verdicts.append(verdict_i)

    go_indices = [i for i, v in enumerate(verdicts) if v == "GO"]
    caution_indices = [i for i, v in enumerate(verdicts) if v == "CAUTION"]

    if go_indices:
        windows = _group_contiguous_windows(go_indices, grid.times, scores, verdicts)
    elif caution_indices:
        windows = _group_contiguous_windows(caution_indices, grid.times, scores, verdicts)
    else:
        # All NO-GO (e.g. steep terrain or impossible requirement): pick local maxima windows.
        max_s = max(scores)
        near_best = [i for i, s in enumerate(scores) if s >= max_s - 5.0]
        windows = _group_contiguous_windows(near_best, grid.times, scores, verdicts)

    windows.sort(key=lambda w: (w.score, (w.end - w.start).total_seconds()), reverse=True)

    return OptimalWindowResponse(
        site_id=site_id,
        lat=lat,
        lon=lon,
        search_start=t0,
        search_stop=t0 + timedelta(hours=search_hours),
        windows=windows[:top_k],
        source=EPHEMERIS_SOURCE,
        terrain_source=grid.terrain_source,
    )
