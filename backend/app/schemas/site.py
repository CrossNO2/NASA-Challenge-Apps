"""Landing-site data contract."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class HorizonProfile(BaseModel):
    step_deg: float = Field(1.0, gt=0, description="Azimuth spacing of samples (deg)")
    elevations_deg: list[float] = Field(..., description="Horizon elevation per azimuth step, starting at az=0 (N)")
    source: str = Field(..., description="Data provenance, e.g. 'LOLA LDEM ...'")


class LandingSite(BaseModel):
    id: str
    name: str
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=360)
    elevation_m: float
    slope_deg: float = Field(..., ge=0)
    program: str
    horizon_profile_file: Optional[str] = None
    source: str
    region: Optional[str] = None
    site_type: Optional[str] = None
    status: Optional[str] = None
    country: Optional[str] = None
    operator: Optional[str] = None
    mission: Optional[str] = None
    landing_date: Optional[str] = None
    source_url: Optional[str] = None
    notes: Optional[str] = None


class LandingSiteDetail(LandingSite):
    terrain_source: Literal["lola", "synthetic", "none"] = "none"
    horizon_profile: Optional[HorizonProfile] = None


class CoordinateProcessRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-360, le=360)
    label: Optional[str] = None


class CoordinateProcessResponse(BaseModel):
    label: Optional[str] = None
    latitude: float
    longitude: float
    original_longitude: float
    longitude_normalized: bool
    latitude_hemisphere: Literal["north", "south", "equator"]
    longitude_hemisphere: Literal["east", "west", "prime meridian"]
    lunar_side: Literal["near side", "far side", "limb"]
    longitude_convention: str
    coordinate_convention: str
    estimated_elevation_m: float
    estimated_slope_deg: float
    next_step: str
