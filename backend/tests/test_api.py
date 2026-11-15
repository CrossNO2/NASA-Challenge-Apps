import json
import time
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.ephemeris import compute_altaz, kernels_present
from app.core.horizons_client import _parse_horizons_csv
from app.main import app

client = TestClient(app)
needs_kernels = pytest.mark.skipif(not kernels_present(), reason="SPICE kernels not downloaded")
GOLDEN_PATH = Path(__file__).parent / "golden" / "horizons_cases.json"


def test_health() -> None:
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["version"]
    assert body["kernels_loaded"] is kernels_present()


def test_sites() -> None:
    r = client.get("/api/v1/sites")
    assert r.status_code == 200
    sites = r.json()
    assert len(sites) >= 33
    ids = {s["id"] for s in sites}
    expected_subset = {
        "shackleton-rim",
        "malapert-massif",
        "nobile-rim-1",
        "nobile-rim-2",
        "mons-mouton",
        "haworth",
        "de-gerlache-rim-2",
        "slater-plain",
        "apollo-11",
        "chandrayaan-3",
        "im-1-odysseus",
        "slim",
        "south-pole-reference",
    }
    assert expected_subset.issubset(ids)


def test_site_detail_and_404() -> None:
    r = client.get("/api/v1/sites/apollo-11")
    assert r.status_code == 200
    assert r.json()["terrain_source"] == "synthetic"
    assert len(r.json()["horizon_profile"]["elevations_deg"]) == 360

    r_shack = client.get("/api/v1/sites/shackleton-rim")
    assert r_shack.status_code == 200
    assert r_shack.json()["terrain_source"] == "synthetic"
    assert len(r_shack.json()["horizon_profile"]["elevations_deg"]) == 360

    r_none = client.get("/api/v1/sites/slim")
    assert r_none.status_code == 200
    assert r_none.json()["terrain_source"] == "none"
    assert r_none.json()["horizon_profile"] is None

    assert client.get("/api/v1/sites/nope").status_code == 404


def test_coordinates_process() -> None:
    r = client.post(
        "/api/v1/coordinates/process",
        json={"latitude": -86.0, "longitude": 357.3, "label": " Custom Ridge "},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["label"] == "Custom Ridge"
    assert body["latitude"] == pytest.approx(-86.0)
    assert body["longitude"] == pytest.approx(-2.7)
    assert body["original_longitude"] == pytest.approx(357.3)
    assert body["longitude_normalized"] is True
    assert body["latitude_hemisphere"] == "south"
    assert body["longitude_hemisphere"] == "west"
    assert body["lunar_side"] == "near side"
    assert isinstance(body["estimated_elevation_m"], float)
    assert isinstance(body["estimated_slope_deg"], float)


@needs_kernels
def test_ephemeris_series() -> None:
    r = client.get(
        "/api/v1/ephemeris",
        params={"site_id": "apollo-11", "start": "2026-11-14T00:00:00Z",
                "stop": "2026-11-16T00:00:00Z", "step_hours": 6},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["source"] == "skyfield_de421"
    assert len(data["bodies"]["sun"]) == 9
    assert len(data["bodies"]["earth"]) == 9
    p = data["bodies"]["sun"][0]
    for k in ("az_deg", "el_deg", "terrain_deg", "clearance_deg", "visible", "sun_fraction"):
        assert k in p
    assert data["bodies"]["earth"][0]["sun_fraction"] is None
    assert all(e["visible"] for e in data["bodies"]["earth"])


@needs_kernels
def test_ephemeris_latlon_and_cap() -> None:
    ok = client.get("/api/v1/ephemeris", params={"lat": -89.9, "lon": 0, "start": "2026-11-14T00:00:00Z",
                                                  "stop": "2026-11-14T03:00:00Z", "bodies": "sun"})
    assert ok.status_code == 200
    assert list(ok.json()["bodies"]) == ["sun"]
    too_many = client.get("/api/v1/ephemeris", params={"site_id": "apollo-11", "start": "2026-01-01T00:00:00Z",
                                                        "stop": "2026-12-31T00:00:00Z", "step_hours": 1})
    assert too_many.status_code == 422


@needs_kernels
def test_ephemeris_instant() -> None:
    r = client.get("/api/v1/ephemeris/instant", params={"site_id": "shackleton-rim", "time": "2026-11-14T12:00:00Z"})
    assert r.status_code == 200
    assert set(r.json()["bodies"]) == {"sun", "earth"}


# --- M2/M3: Golden Horizons Verification & Decision Engine APIs -------------


@needs_kernels
def test_skyfield_matches_golden_horizons_within_0_1_deg() -> None:
    cases = json.loads(GOLDEN_PATH.read_text(encoding="utf-8-sig"))
    assert len(cases) >= 4
    for c in cases:
        t = datetime.fromisoformat(c["time_utc"].replace("Z", "+00:00"))
        res = compute_altaz(c["lat"], c["lon"], c["elev_m"], [t], c["body"])
        sf_az = float(res.az_deg[0])
        sf_el = float(res.el_deg[0])
        d_az = abs(((sf_az - c["az_deg"] + 180.0) % 360.0) - 180.0)
        d_el = abs(sf_el - c["el_deg"])
        assert d_az < 0.1, f"{c['site_id']} {c['body']} az diff={d_az}"
        assert d_el < 0.1, f"{c['site_id']} {c['body']} el diff={d_el}"


def test_horizons_csv_parser() -> None:
    sample = """
$$SOE
 2026-Nov-14 12:00,*, , 120.525991,     1.505817,  0.98796892134261,  0.3497326,
 2026-Nov-14 13:00,*, , 120.018251,     1.506571,  0.98797750000000,  0.3500000,
$$EOE
"""
    rows = _parse_horizons_csv(sample)
    assert len(rows) == 2
    assert rows[0][0] == datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc)
    assert rows[0][1] == pytest.approx(120.525991)
    assert rows[0][2] == pytest.approx(1.505817)


@needs_kernels
def test_feasibility_endpoint() -> None:
    r = client.post(
        "/api/v1/feasibility",
        json={
            "site_id": "apollo-11",
            "landing_time": "2026-11-15T06:00:00Z",
            "requirements": {
                "mission_duration_h": 120,
                "min_sun_elevation_deg": 0.0,
                "require_dte": True,
                "min_dte_coverage_pct": 90,
                "max_slope_deg": 10,
                "scrub_delay_h": 48,
            },
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["verdict"] == "GO"
    assert len(data["gates"]) == 4
    assert {g["name"] for g in data["gates"]} == {"power", "comms", "terrain", "resilience"}
    assert data["terrain_source"] == "synthetic"

    # Unknown site returns 404
    bad = client.post("/api/v1/feasibility", json={"site_id": "unknown", "landing_time": "2026-11-15T06:00:00Z"})
    assert bad.status_code == 404


@needs_kernels
def test_optimal_window_endpoint_and_performance() -> None:
    t0 = time.perf_counter()
    r = client.post(
        "/api/v1/optimal-window",
        json={
            "site_id": "apollo-11",
            "start_time": "2026-11-14T00:00:00Z",
            "search_days": 29.53,
            "step_hours": 1.0,
            "top_k": 3,
        },
    )
    elapsed = time.perf_counter() - t0
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["windows"]) >= 1
    assert data["windows"][0]["verdict"] == "GO"
    assert data["windows"][0]["score"] >= 90.0
    assert elapsed < 1.0, f"30-day optimal-window took {elapsed:.3f}s (target < 1.0s)"


@needs_kernels
def test_compare_endpoint() -> None:
    r = client.post(
        "/api/v1/compare",
        json={
            "site_ids": ["shackleton-rim", "malapert-massif", "nobile-rim-1", "apollo-11"],
            "landing_time": "2026-11-15T06:00:00Z",
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["items"]) == 4
    assert data["recommended_site_id"] in {it["site_id"] for it in data["items"]}
    # Verify Malapert slope warning reflected in comparison
    mal = next(it for it in data["items"] if it["site_id"] == "malapert-massif")
    mal_terrain = next(g for g in mal["feasibility"]["gates"] if g["name"] == "terrain")
    assert mal_terrain["status"] == "WARNING"


@needs_kernels
def test_validate_endpoint_with_golden_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.horizons_client import HorizonsError

    def _offline(*args, **kwargs):
        raise HorizonsError("Simulated offline test")

    monkeypatch.setattr("app.api.ephemeris.fetch_horizons_altaz", _offline)
    r = client.get(
        "/api/v1/validate",
        params={"site_id": "shackleton-rim", "time": "2026-11-14T12:00:00Z", "bodies": "sun,earth"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["horizons_source"] == "jpl_horizons_golden_cache"
    assert data["all_within_tolerance"] is True
    assert data["comparisons"]["sun"]["delta_el_deg"] < 0.1
    assert data["comparisons"]["earth"]["delta_el_deg"] < 0.1
