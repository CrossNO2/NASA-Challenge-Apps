"""Application settings (overridable via environment variables)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
APP_DIR = Path(__file__).resolve().parent

APP_VERSION = "0.1.0"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    kernel_dir: Path = BACKEND_DIR / "kernels"
    data_dir: Path = APP_DIR / "data"
    #: Comma-separated list of allowed origins, or "*".
    cors_origins: str = "*"
    max_ephemeris_points: int = 2000

    # Decision-engine weights (used from M2 on).
    weight_power: float = 0.35
    weight_comms: float = 0.25
    weight_terrain: float = 0.20
    weight_resilience: float = 0.20

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
