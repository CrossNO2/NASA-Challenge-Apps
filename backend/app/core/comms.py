"""Direct-to-Earth (DTE) visibility and blackout metrics."""
from __future__ import annotations

import numpy as np
from numpy.typing import NDArray


def dte_coverage_percentage(earth_visible: NDArray[np.bool_]) -> float:
    """Percentage of samples with Direct-to-Earth line of sight in ``[0, 100]``."""
    mask = np.asarray(earth_visible, dtype=bool)
    if mask.size == 0:
        return 0.0
    return float(np.mean(mask) * 100.0)


def max_blackout_hours(earth_visible: NDArray[np.bool_], step_hours: float = 1.0) -> float:
    """Longest contiguous DTE outage duration in hours."""
    mask = np.asarray(earth_visible, dtype=bool)
    if mask.size == 0 or np.all(mask):
        return 0.0
    padded = np.concatenate(([True], mask, [True]))
    starts = np.flatnonzero(padded[:-1] & ~padded[1:])
    ends = np.flatnonzero(~padded[:-1] & padded[1:])
    if starts.size == 0:
        return 0.0
    return float(np.max(ends - starts) * step_hours)
