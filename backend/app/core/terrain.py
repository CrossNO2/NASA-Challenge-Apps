"""Horizon-profile interpolation and terrain-aware visibility."""
from __future__ import annotations

import numpy as np
from numpy.typing import ArrayLike, NDArray

SUN_RADIUS_DEG = 0.267

FloatArr = NDArray[np.float64]


def h_terrain(elevations_deg: ArrayLike | None, az_deg: ArrayLike, step_deg: float = 1.0) -> FloatArr:
    """Circular linear interpolation of horizon elevation at ``az_deg``.

    ``elevations_deg[i]`` is the horizon elevation at azimuth ``i * step_deg``.
    ``None`` / empty profile means flat horizon (0°).
    """
    az = np.asarray(az_deg, dtype=np.float64)
    if elevations_deg is None:
        return np.zeros_like(az)
    prof = np.asarray(elevations_deg, dtype=np.float64)
    if prof.size == 0:
        return np.zeros_like(az)
    n = prof.size
    x = (az % 360.0) / step_deg
    i0 = np.floor(x).astype(int) % n
    i1 = (i0 + 1) % n
    f = x - np.floor(x)
    return prof[i0] * (1.0 - f) + prof[i1] * f


def clearance(body_el_deg: ArrayLike, terrain_deg: ArrayLike) -> FloatArr:
    return np.asarray(body_el_deg, dtype=np.float64) - np.asarray(terrain_deg, dtype=np.float64)


def is_visible(clearance_deg: ArrayLike) -> NDArray[np.bool_]:
    return np.asarray(clearance_deg, dtype=np.float64) > 0.0


def sun_visible_fraction(clearance_deg: ArrayLike, radius_deg: float = SUN_RADIUS_DEG) -> FloatArr:
    """Fraction of the solar disc area above a locally straight horizon line.

    ``clearance_deg`` is the elevation of the disc centre above the terrain.
    """
    c = np.clip(np.asarray(clearance_deg, dtype=np.float64) / radius_deg, -1.0, 1.0)
    # Area of circular segment below chord at distance d=-c from centre, normalised.
    visible = (np.arccos(-c) + c * np.sqrt(1.0 - c * c)) / np.pi
    return np.clip(visible, 0.0, 1.0)
