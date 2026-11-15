"""Site catalogue loader (sites.json + optional horizons/{id}.json)."""
from __future__ import annotations

import json
from functools import lru_cache
from typing import Literal, Optional

from app.config import get_settings
from app.schemas.site import HorizonProfile, LandingSite, LandingSiteDetail


def classify_terrain_source(
    horizon_profile: Optional[HorizonProfile],
) -> Literal["lola", "synthetic", "none"]:
    if horizon_profile is None:
        return "none"
    src_lower = horizon_profile.source.lower()
    if "synthetic" in src_lower or "illustrative" in src_lower or "parametric" in src_lower:
        return "synthetic"
    return "lola"


@lru_cache(maxsize=1)
def load_sites() -> dict[str, LandingSite]:
    path = get_settings().data_dir / "sites.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {s["id"]: LandingSite.model_validate(s) for s in raw}


@lru_cache(maxsize=64)
def load_horizon_profile(site_id: str) -> HorizonProfile | None:
    site = load_sites().get(site_id)
    if site is None or not site.horizon_profile_file:
        return None
    path = get_settings().data_dir / site.horizon_profile_file
    if not path.exists():
        return None
    return HorizonProfile.model_validate_json(path.read_text(encoding="utf-8"))


def get_site_detail(site_id: str) -> LandingSiteDetail | None:
    site = load_sites().get(site_id)
    if site is None:
        return None
    prof = load_horizon_profile(site_id)
    return LandingSiteDetail(
        **site.model_dump(),
        terrain_source=classify_terrain_source(prof),
        horizon_profile=prof,
    )
