"""Ephemeris data contract."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

BodyName = Literal["sun", "earth"]


class BodyPosition(BaseModel):
    time: datetime
    az_deg: float = Field(..., description="Azimuth, 0=N, clockwise")
    el_deg: float = Field(..., description="Elevation above the local astronomical horizon")
    distance_km: float
    terrain_deg: float = Field(..., description="Horizon (terrain) elevation at this azimuth")
    clearance_deg: float = Field(..., description="el_deg - terrain_deg")
    visible: bool
    sun_fraction: Optional[float] = Field(None, description="Visible fraction of the solar disc (sun only)")


class SiteRef(BaseModel):
    site_id: Optional[str] = None
    lat: float
    lon: float
    elev_m: float


class EphemerisSeries(BaseModel):
    site: SiteRef
    source: str = Field(..., description="Ephemeris provenance, e.g. 'skyfield_de421'")
    terrain_source: Literal["lola", "synthetic", "none"]
    step_hours: float
    bodies: dict[str, list[BodyPosition]]


class InstantState(BaseModel):
    site: SiteRef
    source: str
    terrain_source: Literal["lola", "synthetic", "none"]
    time: datetime
    bodies: dict[str, BodyPosition]


class ValidationBodyComparison(BaseModel):
    skyfield_az_deg: float
    skyfield_el_deg: float
    horizons_az_deg: float
    horizons_el_deg: float
    delta_az_deg: float
    delta_el_deg: float
    within_0_1_deg: bool


class ValidationResponse(BaseModel):
    site: SiteRef
    time: datetime
    skyfield_source: str
    horizons_source: str
    comparisons: dict[str, ValidationBodyComparison]
    all_within_tolerance: bool
