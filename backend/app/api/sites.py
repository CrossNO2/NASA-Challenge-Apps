"""Site endpoints."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.sites_repo import get_site_detail, load_sites
from app.schemas.site import LandingSite, LandingSiteDetail

router = APIRouter(tags=["sites"])


@router.get("/sites", response_model=list[LandingSite])
def list_sites() -> list[LandingSite]:
    return list(load_sites().values())


@router.get("/sites/{site_id}", response_model=LandingSiteDetail)
def site_detail(site_id: str) -> LandingSiteDetail:
    detail = get_site_detail(site_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Unknown site '{site_id}'")
    return detail
