from datetime import datetime, timezone

import numpy as np
import pytest

from app.core.comms import dte_coverage_percentage, max_blackout_hours
from app.core.ephemeris import kernels_present
from app.core.illumination import (
    continuous_sunlit_hours_all,
    continuous_sunlit_hours_from_index,
    hours_until_next_sunrise,
    illumination_percentage,
    is_sunlit_mask,
)
from app.engine.gates import (
    eval_comms_gate,
    eval_power_gate,
    eval_resilience_gate,
    eval_terrain_gate,
)
from app.engine.scoring import evaluate_feasibility, score_and_verdict
from app.schemas.feasibility import MissionRequirements

needs_kernels = pytest.mark.skipif(not kernels_present(), reason="SPICE kernels not downloaded")


# --- illumination & comms core ---------------------------------------------


def test_illumination_helpers() -> None:
    el = np.array([-1.0, 0.2, 2.0, 3.0, -0.5, 1.0])
    frac = np.array([0.0, 0.7, 1.0, 1.0, 0.2, 1.0])
    mask = is_sunlit_mask(el, frac, min_sun_el_deg=0.0, min_fraction=0.5)
    assert list(mask) == [False, True, True, True, False, True]
    assert continuous_sunlit_hours_from_index(mask, 0, step_hours=2.0) == 0.0
    assert continuous_sunlit_hours_from_index(mask, 1, step_hours=2.0) == 6.0
    assert list(continuous_sunlit_hours_all(mask, step_hours=1.0)) == [0.0, 3.0, 2.0, 1.0, 0.0, 1.0]
    assert hours_until_next_sunrise(mask, 0, step_hours=3.0) == 3.0
    assert hours_until_next_sunrise(mask, 1, step_hours=3.0) == 0.0
    assert hours_until_next_sunrise(mask, 4, step_hours=3.0) == 3.0
    assert illumination_percentage(mask) == pytest.approx(4 / 6 * 100.0)


def test_comms_helpers() -> None:
    vis = np.array([True, False, False, True, False, True])
    assert dte_coverage_percentage(vis) == pytest.approx(50.0)
    assert max_blackout_hours(vis, step_hours=1.5) == pytest.approx(3.0)
    assert max_blackout_hours(np.array([True, True]), step_hours=1.0) == 0.0


# --- individual feasibility gates ------------------------------------------


def test_power_gate_thresholds() -> None:
    req = MissionRequirements(mission_duration_h=100.0)
    g_pass = eval_power_gate(150.0, 0.0, req)
    assert g_pass.status == "PASS"
    assert g_pass.score >= 85.0

    g_warn = eval_power_gate(80.0, 0.0, req)  # 80 >= 70 (0.7*100)
    assert g_warn.status == "WARNING"
    assert 60.0 <= g_warn.score < 85.0

    g_fail = eval_power_gate(0.0, 24.0, req)
    assert g_fail.status == "FAIL"
    assert g_fail.score == 0.0
    assert "24.0h" in g_fail.reason


def test_comms_gate_thresholds_and_skip() -> None:
    req = MissionRequirements(require_dte=True, min_dte_coverage_pct=90.0)
    assert eval_comms_gate(95.0, 2.0, req).status == "PASS"
    assert eval_comms_gate(80.0, 10.0, req).status == "WARNING"
    assert eval_comms_gate(60.0, 30.0, req).status == "FAIL"

    relay_req = MissionRequirements(require_dte=False)
    skipped = eval_comms_gate(0.0, 120.0, relay_req)
    assert skipped.status == "SKIPPED"
    assert skipped.score == 100.0


def test_terrain_gate_thresholds() -> None:
    req = MissionRequirements(max_slope_deg=10.0)
    assert eval_terrain_gate(6.5, req).status == "PASS"
    # Malapert Massif benchmark slope 12.0° > 10.0° -> WARNING
    malapert = eval_terrain_gate(12.0, req)
    assert malapert.status == "WARNING"
    assert 50.0 <= malapert.score <= 80.0
    # Very steep slope > 15° -> FAIL
    assert eval_terrain_gate(18.0, req).status == "FAIL"


def test_resilience_gate_and_verdict() -> None:
    req = MissionRequirements(mission_duration_h=120.0, scrub_delay_h=48.0)
    p_ok = eval_power_gate(200.0, 0.0, req)
    c_ok = eval_comms_gate(100.0, 0.0, req)
    p_fail = eval_power_gate(20.0, 0.0, req)

    r_pass = eval_resilience_gate(p_ok, c_ok, req)
    assert r_pass.status == "PASS"

    r_fail = eval_resilience_gate(p_fail, c_ok, req)
    assert r_fail.status == "FAIL"

    terrain_ok = eval_terrain_gate(5.0, req)
    terrain_warn = eval_terrain_gate(12.0, req)

    _, v_go, _ = score_and_verdict([p_ok, c_ok, terrain_ok, r_pass])
    assert v_go == "GO"

    _, v_caution, _ = score_and_verdict([p_ok, c_ok, terrain_warn, r_pass])
    assert v_caution == "CAUTION"

    _, v_nogo, _ = score_and_verdict([p_ok, c_ok, terrain_ok, r_fail])
    assert v_nogo == "NO-GO"


# --- end-to-end lunar physics boundary cases -------------------------------


@needs_kernels
def test_apollo11_sunrise_vs_equatorial_night() -> None:
    # Sun rises at Apollo 11 around 2026-11-15T02Z -> landing at 06Z gives ~330+h of daylight
    req = MissionRequirements(mission_duration_h=120.0, require_dte=True, max_slope_deg=10.0)
    rep_day = evaluate_feasibility(
        lat=0.67,
        lon=23.47,
        elev_m=-1900.0,
        slope_deg=1.8,
        landing_time=datetime(2026, 11, 15, 6, 0, tzinfo=timezone.utc),
        req=req,
        site_id="apollo-11",
    )
    assert rep_day.verdict == "GO"
    assert rep_day.score >= 90.0

    # At 2026-11-14T12Z Apollo 11 is in night -> Power FAIL -> NO-GO
    rep_night = evaluate_feasibility(
        lat=0.67,
        lon=23.47,
        elev_m=-1900.0,
        slope_deg=1.8,
        landing_time=datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc),
        req=req,
        site_id="apollo-11",
    )
    assert rep_night.verdict == "NO-GO"
    power_gate = next(g for g in rep_night.gates if g.name == "power")
    assert power_gate.status == "FAIL"


@needs_kernels
def test_malapert_slope_triggers_terrain_warning() -> None:
    req = MissionRequirements(mission_duration_h=120.0, require_dte=False, max_slope_deg=10.0)
    rep = evaluate_feasibility(
        lat=-86.0,
        lon=2.7,
        elev_m=4850.0,
        slope_deg=12.0,
        landing_time=datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc),
        req=req,
        site_id="malapert-massif",
    )
    terrain_gate = next(g for g in rep.gates if g.name == "terrain")
    assert terrain_gate.status == "WARNING"
    assert rep.verdict in ("CAUTION", "NO-GO")
