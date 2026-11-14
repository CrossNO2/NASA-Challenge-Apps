"""FastAPI application entry point."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.api import ephemeris, feasibility, sites
from app.config import APP_VERSION, get_settings
from app.core.ephemeris import EPHEMERIS_SOURCE, kernels_loaded
from app.core.horizons_client import check_horizons_reachable

settings = get_settings()

app = FastAPI(
    title="Lunar Landing Site Navigator API",
    version=APP_VERSION,
    description="Sun/Earth visibility and landing feasibility for lunar sites (NASA Space Apps).",
)
origins = settings.cors_origin_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials="*" not in origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Health(BaseModel):
    status: str
    version: str
    kernels_loaded: bool
    ephemeris_source: str
    horizons_reachable: Optional[bool] = None


api = APIRouter(prefix="/api/v1")


@api.get("/health", response_model=Health, tags=["meta"])
def health(check_horizons: bool = False) -> Health:
    ok = kernels_loaded()
    hz_ok = check_horizons_reachable() if check_horizons else None
    return Health(
        status="ok" if ok else "degraded",
        version=APP_VERSION,
        kernels_loaded=ok,
        ephemeris_source=EPHEMERIS_SOURCE,
        horizons_reachable=hz_ok,
    )


api.include_router(sites.router)
api.include_router(ephemeris.router)
api.include_router(feasibility.router)
app.include_router(api)
