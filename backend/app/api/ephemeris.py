"""Ephemeris endpoints (Skyfield DE421 primary + NASA JPL Horizons cross-validation)."""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query

from app.config import get_settings
from app.core.ephemeris import EPHEMERIS_SOURCE, AltAzResult, compute_altaz
from app.core.horizons_client import (
    HORIZONS_GOLDEN_SOURCE,
    HORIZONS_SOURCE,
    HorizonsError,
    fetch_horizons_altaz,
    lookup_golden_case,
)
from app.core.sites_repo import load_horizon_profile, load_sites
from app.core.terrain import clearance, h_terrain, is_visible, sun_visible_fraction
from app.schemas.ephemeris import (
    BodyPosition,
    EphemerisSeries,
    InstantState,
    SiteRef,
    ValidationBodyComparison,
    ValidationResponse,
)
from app.schemas.site import HorizonProfile

router = APIRouter(tags=["ephemeris"])

VALID_BODIES = ("sun", "earth")


def _resolve_site(
    site_id: Optional[str], lat: Optional[float], lon: Optional[float], elev_m: Optional[float]
) -> tuple[SiteRef, Optional[HorizonProfile]]:
    if site_id:
        site = load_sites().get(site_id)
        if site is None:
            raise HTTPException(404, f"Unknown site '{site_id}'")
        return (
            SiteRef(site_id=site.id, lat=site.lat, lon=site.lon, elev_m=site.elevation_m),
            load_horizon_profile(site.id),
        )
    if lat is None or lon is None:
        raise HTTPException(422, "Provide either site_id or lat & lon")
    return SiteRef(lat=lat, lon=lon, elev_m=elev_m or 0.0), None


def _parse_bodies(bodies: str) -> list[Literal["sun", "earth"]]:
    out: list[Literal["sun", "earth"]] = []
    for b in (x.strip().lower() for x in bodies.split(",")):
        if b == "sun" or b == "earth":
            out.append(b)
        elif b:
            raise HTTPException(422, f"Unknown body '{b}'. Valid: {VALID_BODIES}")
    if not out:
        raise HTTPException(422, "No bodies requested")
    return out


def _utc(t: datetime) -> datetime:
    return t.replace(tzinfo=timezone.utc) if t.tzinfo is None else t.astimezone(timezone.utc)


def _compute_for_source(
    site: SiteRef,
    times: list[datetime],
    body: Literal["sun", "earth"],
    source: Literal["skyfield", "horizons"],
) -> tuple[AltAzResult, str]:
    if source == "skyfield":
        return compute_altaz(site.lat, site.lon, site.elev_m, times, body), EPHEMERIS_SOURCE
    try:
        return fetch_horizons_altaz(site.lat, site.lon, site.elev_m, times, body), HORIZONS_SOURCE
    except HorizonsError as exc:
        raise HTTPException(502, f"JPL Horizons upstream error: {exc}") from exc


def _positions(
    site: SiteRef,
    prof: Optional[HorizonProfile],
    times: list[datetime],
    body: Literal["sun", "earth"],
    source: Literal["skyfield", "horizons"] = "skyfield",
) -> tuple[list[BodyPosition], str]:
    r, provenance = _compute_for_source(site, times, body, source)
    terr = h_terrain(prof.elevations_deg if prof else None, r.az_deg, prof.step_deg if prof else 1.0)
    clr = clearance(r.el_deg, terr)
    vis = is_visible(clr)
    frac = sun_visible_fraction(clr) if body == "sun" else None
    positions = [
        BodyPosition(
            time=times[i],
            az_deg=round(float(r.az_deg[i]), 4),
            el_deg=round(float(r.el_deg[i]), 4),
            distance_km=round(float(r.distance_km[i]), 1),
            terrain_deg=round(float(terr[i]), 4),
            clearance_deg=round(float(clr[i]), 4),
            visible=bool(vis[i]),
            sun_fraction=None if frac is None else round(float(frac[i]), 4),
        )
        for i in range(len(times))
    ]
    return positions, provenance


@router.get("/ephemeris", response_model=EphemerisSeries)
def ephemeris_series(
    start: datetime = Query(..., description="UTC ISO-8601"),
    stop: datetime = Query(..., description="UTC ISO-8601"),
    step_hours: float = Query(1.0, gt=0),
    site_id: Optional[str] = None,
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lon: Optional[float] = Query(None, ge=-180, le=360),
    elev_m: Optional[float] = None,
    bodies: str = "sun,earth",
    source: Literal["skyfield", "horizons"] = "skyfield",
) -> EphemerisSeries:
    site, prof = _resolve_site(site_id, lat, lon, elev_m)
    body_list = _parse_bodies(bodies)
    t0, t1 = _utc(start), _utc(stop)
    if t1 < t0:
        raise HTTPException(422, "stop must be >= start")
    n = int(math.floor((t1 - t0).total_seconds() / 3600.0 / step_hours + 1e-9)) + 1
    cap = get_settings().max_ephemeris_points
    if n > cap:
        raise HTTPException(422, f"Too many points ({n}); max is {cap}. Increase step_hours.")
    times = [t0 + timedelta(hours=step_hours * i) for i in range(n)]

    body_results: dict[str, list[BodyPosition]] = {}
    provenance = EPHEMERIS_SOURCE if source == "skyfield" else HORIZONS_SOURCE
    for b in body_list:
        pos, provenance = _positions(site, prof, times, b, source=source)
        body_results[b] = pos

    return EphemerisSeries(
        site=site,
        source=provenance,
        terrain_source="lola" if prof else "none",
        step_hours=step_hours,
        bodies=body_results,
    )


@router.get("/ephemeris/instant", response_model=InstantState)
def ephemeris_instant(
    time: datetime = Query(..., description="UTC ISO-8601"),
    site_id: Optional[str] = None,
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lon: Optional[float] = Query(None, ge=-180, le=360),
    elev_m: Optional[float] = None,
    bodies: str = "sun,earth",
    source: Literal["skyfield", "horizons"] = "skyfield",
) -> InstantState:
    site, prof = _resolve_site(site_id, lat, lon, elev_m)
    t = _utc(time)
    body_results: dict[str, BodyPosition] = {}
    provenance = EPHEMERIS_SOURCE if source == "skyfield" else HORIZONS_SOURCE
    for b in _parse_bodies(bodies):
        pos, provenance = _positions(site, prof, [t], b, source=source)
        body_results[b] = pos[0]

    return InstantState(
        site=site,
        source=provenance,
        terrain_source="lola" if prof else "none",
        time=t,
        bodies=body_results,
    )


@router.get("/validate", response_model=ValidationResponse)
def validate_ephemeris(
    time: datetime = Query(..., description="UTC ISO-8601"),
    site_id: Optional[str] = None,
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lon: Optional[float] = Query(None, ge=-180, le=360),
    elev_m: Optional[float] = None,
    bodies: str = "sun,earth",
) -> ValidationResponse:
    """Cross-check Skyfield DE421 against NASA JPL Horizons (DE441) for authentic-data proof."""
    site, _ = _resolve_site(site_id, lat, lon, elev_m)
    t = _utc(time)
    body_list = _parse_bodies(bodies)

    comparisons: dict[str, ValidationBodyComparison] = {}
    hz_source_used = HORIZONS_SOURCE

    for b in body_list:
        sf = compute_altaz(site.lat, site.lon, site.elev_m, [t], b)
        try:
            hz = fetch_horizons_altaz(site.lat, site.lon, site.elev_m, [t], b)
        except HorizonsError as exc:
            golden = lookup_golden_case(site.lat, site.lon, t, b)
            if golden is None:
                raise HTTPException(
                    502, f"JPL Horizons unreachable and no golden reference for this query: {exc}"
                ) from exc
            hz = golden
            hz_source_used = HORIZONS_GOLDEN_SOURCE

        sf_az = float(sf.az_deg[0])
        sf_el = float(sf.el_deg[0])
        hz_az = float(hz.az_deg[0])
        hz_el = float(hz.el_deg[0])
        d_az = abs(((sf_az - hz_az + 180.0) % 360.0) - 180.0)
        d_el = abs(sf_el - hz_el)

        comparisons[b] = ValidationBodyComparison(
            skyfield_az_deg=round(sf_az, 4),
            skyfield_el_deg=round(sf_el, 4),
            horizons_az_deg=round(hz_az, 4),
            horizons_el_deg=round(hz_el, 4),
            delta_az_deg=round(d_az, 6),
            delta_el_deg=round(d_el, 6),
            within_0_1_deg=(d_az < 0.1 and d_el < 0.1),
        )

    return ValidationResponse(
        site=site,
        time=t,
        skyfield_source=EPHEMERIS_SOURCE,
        horizons_source=hz_source_used,
        comparisons=comparisons,
        all_within_tolerance=all(c.within_0_1_deg for c in comparisons.values()),
    )
