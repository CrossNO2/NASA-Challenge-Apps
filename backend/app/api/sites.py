"""Site endpoints and coordinate normalization / terrain estimation."""
from __future__ import annotations

import math
from typing import Literal

from fastapi import APIRouter, HTTPException

from app.core.sites_repo import get_site_detail, load_sites
from app.schemas.site import (
    CoordinateProcessRequest,
    CoordinateProcessResponse,
    LandingSite,
    LandingSiteDetail,
)

router = APIRouter(tags=["sites"])

LONGITUDE_CONVENTION = "east-positive, [-180, 180)"
COORDINATE_CONVENTION = "selenographic latitude, east-positive longitude"


def _normalize_longitude(value: float) -> float:
    normalized = ((float(value) + 180.0) % 360.0) - 180.0
    if normalized >= 180.0 or normalized < -180.0:
        normalized = -180.0
    if normalized == 0.0:
        return 0.0
    return round(normalized, 6)


def _estimate_topography(lat: float, lon: float) -> tuple[float, float]:
    """Estimate elevation (m) and slope (deg) from catalog proximity + selenographic model."""
    phi1 = math.radians(lat)
    lam1 = math.radians(lon)
    best_dist_deg = 999.0
    nearest_site: LandingSite | None = None

    for s in load_sites().values():
        phi2 = math.radians(s.lat)
        lam2 = math.radians(s.lon)
        cos_c = math.sin(phi1) * math.sin(phi2) + math.cos(phi1) * math.cos(phi2) * math.cos(lam1 - lam2)
        dist_deg = math.degrees(math.acos(max(-1.0, min(1.0, cos_c))))
        if dist_deg < best_dist_deg:
            best_dist_deg = dist_deg
            nearest_site = s

    if nearest_site is not None and best_dist_deg <= 0.5:
        return float(nearest_site.elevation_m), float(nearest_site.slope_deg)

    # Selenographic macro-topography model (polar highlands vs near-side maria vs far-side highlands)
    abs_lat = abs(lat)
    if abs_lat >= 80.0:
        elev = 1850.0 + 650.0 * math.sin(math.radians(lon * 2.0))
        slope = 7.5 + 2.0 * abs(math.cos(math.radians(lon * 3.0)))
    elif -90.0 < lon < 90.0 and abs_lat < 45.0:
        # Near-side mare / highland transition
        elev = -1650.0 + 750.0 * math.sin(math.radians(lat * 2.0)) * math.cos(math.radians(lon))
        slope = 2.8 + 1.8 * abs(math.sin(math.radians(lat * 3.0 + lon)))
    else:
        # Far-side highlands / South Pole-Aitken basin
        if lat < -20.0 and (lon > 130.0 or lon < -130.0):
            elev = -4200.0 + 600.0 * math.cos(math.radians(lat * 2.0))
            slope = 4.2
        else:
            elev = 1400.0 + 900.0 * math.cos(math.radians(lat))
            slope = 5.4

    return round(elev, 1), round(slope, 1)


@router.get("/sites", response_model=list[LandingSite])
def list_sites() -> list[LandingSite]:
    return list(load_sites().values())


@router.get("/sites/{site_id}", response_model=LandingSiteDetail)
def site_detail(site_id: str) -> LandingSiteDetail:
    detail = get_site_detail(site_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Unknown site '{site_id}'")
    return detail


@router.post("/coordinates/process", response_model=CoordinateProcessResponse)
def process_coordinates(req: CoordinateProcessRequest) -> CoordinateProcessResponse:
    latitude = 0.0 if req.latitude == 0 else float(req.latitude)
    original_longitude = float(req.longitude)
    longitude = _normalize_longitude(original_longitude)

    lat_hem: Literal["north", "south", "equator"] = (
        "north" if latitude > 0 else "south" if latitude < 0 else "equator"
    )
    lon_hem: Literal["east", "west", "prime meridian"] = (
        "east" if longitude > 0 else "west" if longitude < 0 else "prime meridian"
    )
    lunar_side: Literal["near side", "far side", "limb"]
    if abs(longitude) == 90.0:
        lunar_side = "limb"
    elif -90.0 < longitude < 90.0:
        lunar_side = "near side"
    else:
        lunar_side = "far side"

    est_elev, est_slope = _estimate_topography(latitude, longitude)
    trimmed_label = req.label.strip() if req.label and req.label.strip() else None

    return CoordinateProcessResponse(
        label=trimmed_label,
        latitude=latitude,
        longitude=longitude,
        original_longitude=original_longitude,
        longitude_normalized=(longitude != original_longitude),
        latitude_hemisphere=lat_hem,
        longitude_hemisphere=lon_hem,
        lunar_side=lunar_side,
        longitude_convention=LONGITUDE_CONVENTION,
        coordinate_convention=COORDINATE_CONVENTION,
        estimated_elevation_m=est_elev,
        estimated_slope_deg=est_slope,
        next_step="Use a terrain and ephemeris adapter for local horizon and Sun/Earth geometry.",
    )
