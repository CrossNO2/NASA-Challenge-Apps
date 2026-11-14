"""Decision-engine data contract."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

GateStatus = Literal["PASS", "WARNING", "FAIL", "SKIPPED"]
Verdict = Literal["GO", "CAUTION", "NO-GO"]


class MissionRequirements(BaseModel):
    mission_duration_h: float = Field(120, gt=0)
    min_sun_elevation_deg: float = 0.0
    require_dte: bool = True
    min_dte_coverage_pct: float = Field(90, ge=0, le=100)
    max_slope_deg: float = Field(10, ge=0)
    scrub_delay_h: float = Field(48, ge=0)


class Gate(BaseModel):
    name: Literal["power", "comms", "terrain", "resilience"]
    status: GateStatus
    score: float = Field(..., ge=0, le=100)
    metric: Optional[float] = None
    unit: Optional[str] = None
    threshold_pass: Optional[float] = None
    threshold_warning: Optional[float] = None
    reason: str


class FeasibilityReport(BaseModel):
    site_id: Optional[str] = None
    lat: float
    lon: float
    landing_time: datetime
    requirements: MissionRequirements
    gates: list[Gate]
    score: float = Field(..., ge=0, le=100)
    verdict: Verdict
    reasons: list[str]
    source: str
    terrain_source: Literal["lola", "none"]


class OptimalWindow(BaseModel):
    start: datetime
    end: datetime
    best_time: datetime
    score: float = Field(..., ge=0, le=100)
    verdict: Verdict


class FeasibilityRequest(BaseModel):
    site_id: Optional[str] = None
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lon: Optional[float] = Field(None, ge=-180, le=360)
    elev_m: Optional[float] = None
    slope_deg: Optional[float] = Field(None, ge=0)
    landing_time: datetime
    requirements: MissionRequirements = Field(default_factory=MissionRequirements)


class OptimalWindowRequest(BaseModel):
    site_id: Optional[str] = None
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lon: Optional[float] = Field(None, ge=-180, le=360)
    elev_m: Optional[float] = None
    slope_deg: Optional[float] = Field(None, ge=0)
    start_time: datetime
    search_days: float = Field(29.53, gt=0, le=60)
    step_hours: float = Field(1.0, gt=0, le=6)
    top_k: int = Field(3, ge=1, le=10)
    requirements: MissionRequirements = Field(default_factory=MissionRequirements)


class OptimalWindowResponse(BaseModel):
    site_id: Optional[str] = None
    lat: float
    lon: float
    search_start: datetime
    search_stop: datetime
    windows: list[OptimalWindow]
    source: str
    terrain_source: Literal["lola", "none"]


class CompareRequest(BaseModel):
    site_ids: list[str] = Field(..., min_length=2, max_length=6)
    landing_time: datetime
    requirements: MissionRequirements = Field(default_factory=MissionRequirements)


class SiteComparisonItem(BaseModel):
    site_id: str
    name: str
    program: str
    lat: float
    lon: float
    slope_deg: float
    sun_el_deg: float
    earth_el_deg: float
    continuous_sun_hours: float
    hours_to_sunrise: Optional[float] = None
    cycle_illumination_pct: float
    cycle_dte_pct: float
    feasibility: FeasibilityReport


class CompareResponse(BaseModel):
    landing_time: datetime
    recommended_site_id: str
    items: list[SiteComparisonItem]
