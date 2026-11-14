"""Topocentric Sun/Earth positions for an observer standing ON THE MOON.

Uses Skyfield with NAIF kernels (DE421 + Moon PA/ME frames). Kernels are loaded
once and cached at module level.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Literal, Sequence

import numpy as np
from numpy.typing import NDArray
from skyfield.api import Loader
from skyfield.planetarylib import PlanetaryConstants

from app.config import get_settings

Body = Literal["sun", "earth"]
EPHEMERIS_SOURCE = "skyfield_de421"

KERNEL_FILES = (
    "de421.bsp",
    "moon_080317.tf",
    "pck00008.tpc",
    "moon_pa_de421_1900-2050.bpc",
)


@dataclass(frozen=True)
class _Kernels:
    ts: Any
    eph: Any
    pc: PlanetaryConstants
    frame: Any


@dataclass(frozen=True)
class AltAzResult:
    az_deg: NDArray[np.float64]
    el_deg: NDArray[np.float64]
    distance_km: NDArray[np.float64]


def kernels_present() -> bool:
    kdir = get_settings().kernel_dir
    return all((kdir / f).exists() for f in KERNEL_FILES)


@lru_cache(maxsize=1)
def _load() -> _Kernels:
    kdir = get_settings().kernel_dir
    missing = [f for f in KERNEL_FILES if not (kdir / f).exists()]
    if missing:
        raise RuntimeError(
            f"Missing SPICE kernels in {kdir}: {missing}. Run scripts/download_kernels.py"
        )
    load = Loader(str(kdir), verbose=False)
    ts = load.timescale(builtin=True)
    eph = load("de421.bsp")
    pc = PlanetaryConstants()
    pc.read_text(load("moon_080317.tf"))
    pc.read_text(load("pck00008.tpc"))
    pc.read_binary(load("moon_pa_de421_1900-2050.bpc"))
    frame = pc.build_frame_named("MOON_ME_DE421")
    return _Kernels(ts=ts, eph=eph, pc=pc, frame=frame)


def kernels_loaded() -> bool:
    try:
        _load()
        return True
    except Exception:  # noqa: BLE001
        return False


def _as_utc(t: datetime) -> datetime:
    return t.replace(tzinfo=timezone.utc) if t.tzinfo is None else t.astimezone(timezone.utc)


def compute_altaz(
    lat: float,
    lon: float,
    elev_m: float,
    times_utc: Sequence[datetime],
    body: Body,
) -> AltAzResult:
    """Azimuth (0=N, clockwise), elevation and distance of ``body`` seen from a lunar site.

    Vectorised over ``times_utc``. Positions are *apparent* (light-time +
    aberration); Skyfield skips Earth-specific refraction since there is none here.
    """
    k = _load()
    t = k.ts.from_datetimes([_as_utc(x) for x in times_utc])
    moon = k.eph["moon"]
    target = k.eph["sun"] if body == "sun" else k.eph["earth"]
    site = moon + k.pc.build_latlon_degrees(k.frame, lat, lon, elev_m)
    alt, az, dist = site.at(t).observe(target).apparent().altaz()
    return AltAzResult(
        az_deg=np.asarray(az.degrees, dtype=np.float64) % 360.0,
        el_deg=np.asarray(alt.degrees, dtype=np.float64),
        distance_km=np.asarray(dist.km, dtype=np.float64),
    )
