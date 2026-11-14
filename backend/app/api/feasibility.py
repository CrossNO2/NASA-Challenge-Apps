"""Feasibility / optimal-window / multi-site comparison endpoints."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException

from app.core.sites_repo import load_horizon_profile, load_sites
from app.engine.compare import compare_sites
from app.engine.optimal_window import find_optimal_windows
from app.engine.scoring import evaluate_feasibility
from app.schemas.feasibility import (
    CompareRequest,
    CompareResponse,
    FeasibilityReport,
    FeasibilityRequest,
    OptimalWindowRequest,
    OptimalWindowResponse,
)
from app.schemas.site import HorizonProfile

router = APIRouter(tags=["feasibility"])


def _resolve_site_params(
    site_id: Optional[str],
    lat: Optional[float],
    lon: Optional[float],
    elev_m: Optional[float],
    slope_deg: Optional[float],
) -> tuple[Optional[str], float, float, float, float, Optional[HorizonProfile]]:
    if site_id:
        site = load_sites().get(site_id)
        if site is None:
            raise HTTPException(404, f"Unknown site '{site_id}'")
        return (
            site.id,
            site.lat,
            site.lon,
            site.elevation_m if elev_m is None else elev_m,
            site.slope_deg if slope_deg is None else slope_deg,
            load_horizon_profile(site.id),
        )
    if lat is None or lon is None:
        raise HTTPException(422, "Provide either site_id or lat & lon")
    return None, lat, lon, elev_m or 0.0, slope_deg or 0.0, None


@router.post("/feasibility", response_model=FeasibilityReport)
def check_feasibility(req: FeasibilityRequest) -> FeasibilityReport:
    site_id, lat, lon, elev_m, slope_deg, prof = _resolve_site_params(
        req.site_id, req.lat, req.lon, req.elev_m, req.slope_deg
    )
    return evaluate_feasibility(
        lat=lat,
        lon=lon,
        elev_m=elev_m,
        slope_deg=slope_deg,
        landing_time=req.landing_time,
        req=req.requirements,
        site_id=site_id,
        horizon_profile=prof,
    )


@router.post("/optimal-window", response_model=OptimalWindowResponse)
def optimal_window(req: OptimalWindowRequest) -> OptimalWindowResponse:
    site_id, lat, lon, elev_m, slope_deg, prof = _resolve_site_params(
        req.site_id, req.lat, req.lon, req.elev_m, req.slope_deg
    )
    return find_optimal_windows(
        lat=lat,
        lon=lon,
        elev_m=elev_m,
        slope_deg=slope_deg,
        start_time=req.start_time,
        req=req.requirements,
        search_days=req.search_days,
        step_hours=req.step_hours,
        top_k=req.top_k,
        site_id=site_id,
        horizon_profile=prof,
    )


@router.post("/compare", response_model=CompareResponse)
def compare(req: CompareRequest) -> CompareResponse:
    try:
        return compare_sites(req.site_ids, req.landing_time, req.requirements)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
