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


class LandingSiteDetail(LandingSite):
    terrain_source: Literal["lola", "none"] = "none"
    horizon_profile: Optional[HorizonProfile] = None
