from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from app.core.ephemeris import compute_altaz, kernels_present
from app.core.terrain import clearance, h_terrain, is_visible, sun_visible_fraction

needs_kernels = pytest.mark.skipif(not kernels_present(), reason="SPICE kernels not downloaded")

# --- terrain ---------------------------------------------------------------


def test_h_terrain_flat_when_no_profile() -> None:
    assert np.allclose(h_terrain(None, [0, 90, 359.5]), 0.0)


def test_h_terrain_wraparound_359_to_0() -> None:
    prof = np.zeros(360)
    prof[359] = 2.0
    prof[0] = 4.0
    assert h_terrain(prof, 359.5)[()] == pytest.approx(3.0)
    assert h_terrain(prof, 360.0)[()] == pytest.approx(4.0)
    assert h_terrain(prof, -0.5)[()] == pytest.approx(3.0)
    assert h_terrain(prof, 0.25)[()] == pytest.approx(3.0)  # 4 -> 0 between 0 and 1 deg


def test_h_terrain_interior_linear() -> None:
    prof = np.arange(360, dtype=float)
    assert h_terrain(prof, 10.25)[()] == pytest.approx(10.25)


def test_clearance_visibility_and_sun_fraction() -> None:
    c = clearance([5.0, -1.0, 0.0], [1.0, 0.0, 0.0])
    assert list(c) == [4.0, -1.0, 0.0]
    assert list(is_visible(c)) == [True, False, False]
    f = sun_visible_fraction([1.0, -1.0, 0.0, 0.1])
    assert f[0] == pytest.approx(1.0)
    assert f[1] == pytest.approx(0.0)
    assert f[2] == pytest.approx(0.5)
    assert 0.5 < f[3] < 1.0


# --- ephemeris sanity -------------------------------------------------------


def _times(days: int = 30, step_h: int = 6) -> list[datetime]:
    t0 = datetime(2026, 11, 14, tzinfo=timezone.utc)
    return [t0 + timedelta(hours=step_h * i) for i in range(days * 24 // step_h)]


@needs_kernels
def test_apollo11_earth_high_in_sky() -> None:
    r = compute_altaz(0.67, 23.47, -1900, _times(), "earth")
    assert np.all((r.el_deg > 55) & (r.el_deg < 75))
    assert np.all((r.distance_km > 350_000) & (r.distance_km < 410_000))


@needs_kernels
@pytest.mark.parametrize("lat,lon,elev", [(-89.9, 0.0, 2100), (-86.0, 2.7, 4850), (-85.2, 53.5, 1650)])
def test_south_pole_earth_near_horizon(lat: float, lon: float, elev: float) -> None:
    r = compute_altaz(lat, lon, elev, _times(), "earth")
    assert np.all(np.abs(r.el_deg) < 8.0 + (90 + lat))  # allow site offset from pole


@needs_kernels
def test_sun_low_at_shackleton_and_azimuth_range() -> None:
    r = compute_altaz(-89.9, 0.0, 2100, _times(), "sun")
    assert np.all(np.abs(r.el_deg) < 2.0)
    assert np.all((r.az_deg >= 0) & (r.az_deg < 360))
    # Sun circles the horizon over a synodic month
    assert np.ptp(r.az_deg) > 300
