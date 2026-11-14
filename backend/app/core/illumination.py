"""Illumination metrics and solar-window helpers (vectorised NumPy)."""
from __future__ import annotations

from typing import Optional

import numpy as np
from numpy.typing import ArrayLike, NDArray

BoolArr = NDArray[np.bool_]
FloatArr = NDArray[np.float64]


def is_sunlit_mask(
    sun_el_deg: ArrayLike,
    sun_fraction: ArrayLike,
    min_sun_el_deg: float = 0.0,
    min_fraction: float = 0.5,
) -> BoolArr:
    """Return boolean mask where the solar disc meets fraction and elevation thresholds."""
    el = np.asarray(sun_el_deg, dtype=np.float64)
    frac = np.asarray(sun_fraction, dtype=np.float64)
    return (frac >= min_fraction) & (el >= min_sun_el_deg)


def continuous_sunlit_hours_from_index(
    sunlit: NDArray[np.bool_],
    start_idx: int,
    step_hours: float = 1.0,
) -> float:
    """Count consecutive sunlit hours starting at ``start_idx`` (0.0 if dark at ``start_idx``)."""
    mask = np.asarray(sunlit, dtype=bool)
    if start_idx < 0 or start_idx >= mask.size or not mask[start_idx]:
        return 0.0
    tail = mask[start_idx:]
    dark_rel = np.flatnonzero(~tail)
    count = int(dark_rel[0]) if dark_rel.size > 0 else int(tail.size)
    return float(count * step_hours)


def continuous_sunlit_hours_all(
    sunlit: NDArray[np.bool_],
    step_hours: float = 1.0,
) -> FloatArr:
    """Return array where ``out[i]`` is continuous sunlit hours starting at index ``i``."""
    mask = np.asarray(sunlit, dtype=bool)
    n = mask.size
    out = np.zeros(n, dtype=np.float64)
    run = 0
    for i in range(n - 1, -1, -1):
        if mask[i]:
            run += 1
            out[i] = run * step_hours
        else:
            run = 0
    return out


def hours_until_next_sunrise(
    sunlit: NDArray[np.bool_],
    start_idx: int,
    step_hours: float = 1.0,
) -> Optional[float]:
    """Hours from ``start_idx`` until next sunlit sample; 0.0 if sunlit now, None if never."""
    mask = np.asarray(sunlit, dtype=bool)
    if start_idx < 0 or start_idx >= mask.size:
        return None
    if mask[start_idx]:
        return 0.0
    future = np.flatnonzero(mask[start_idx + 1 :])
    if future.size == 0:
        return None
    return float((int(future[0]) + 1) * step_hours)


def illumination_percentage(sunlit: NDArray[np.bool_]) -> float:
    """Percentage of samples that are sunlit in ``[0, 100]``."""
    mask = np.asarray(sunlit, dtype=bool)
    if mask.size == 0:
        return 0.0
    return float(np.mean(mask) * 100.0)
