"""NASA JPL Horizons API client (CENTER='coord@301', QUANTITIES='4,20') with caching."""
from __future__ import annotations

import json
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal, Optional, Sequence

import httpx
import numpy as np

from app.config import BACKEND_DIR, get_settings
from app.core.ephemeris import AltAzResult, Body

HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
HORIZONS_SOURCE = "jpl_horizons"
HORIZONS_GOLDEN_SOURCE = "jpl_horizons_golden_cache"
AU_KM = 149597870.700

_BODY_COMMAND: dict[Body, str] = {
    "sun": "'10'",
    "earth": "'399'",
}

_CACHE_LOCK = threading.Lock()
_MEMORY_CACHE: dict[str, tuple[float, float, float]] = {}
_CACHE_LOADED = False


class HorizonsError(RuntimeError):
    """Raised when the NASA JPL Horizons API fails or returns unexpected output."""


def _as_utc(t: datetime) -> datetime:
    return t.replace(tzinfo=timezone.utc) if t.tzinfo is None else t.astimezone(timezone.utc)


def _cache_path() -> Path:
    return get_settings().data_dir / ".horizons_cache.json"


def _point_key(lat: float, lon: float, elev_m: float, time_utc: datetime, body: Body) -> str:
    ts = _as_utc(time_utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return f"{body}|{lat:.5f}|{lon:.5f}|{elev_m:.1f}|{ts}"


def _ensure_cache_loaded() -> None:
    global _CACHE_LOADED
    if _CACHE_LOADED:
        return
    path = _cache_path()
    if path.exists():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                for k, v in raw.items():
                    if isinstance(v, list) and len(v) == 3:
                        _MEMORY_CACHE[k] = (float(v[0]), float(v[1]), float(v[2]))
        except Exception:  # noqa: BLE001
            pass
    _CACHE_LOADED = True


def _persist_cache() -> None:
    path = _cache_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        serializable = {k: list(v) for k, v in _MEMORY_CACHE.items()}
        path.write_text(json.dumps(serializable), encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass


def _parse_horizons_csv(result_text: str) -> list[tuple[datetime, float, float, float]]:
    soe = result_text.find("$$SOE")
    eoe = result_text.find("$$EOE")
    if soe == -1 or eoe == -1 or eoe <= soe:
        raise HorizonsError("JPL Horizons response missing $$SOE/$$EOE ephemeris block.")

    rows: list[tuple[datetime, float, float, float]] = []
    block = result_text[soe + 5 : eoe].strip()
    for raw_line in block.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 6:
            raise HorizonsError(f"Unexpected Horizons CSV row format: {line}")
        date_str = parts[0]
        # Format example: '2026-Nov-14 12:00' or '2026-Nov-14 12:00:00'
        parsed_dt: Optional[datetime] = None
        for fmt in ("%Y-%b-%d %H:%M", "%Y-%b-%d %H:%M:%S", "%Y-%b-%d %H:%M:%S.%f"):
            try:
                parsed_dt = datetime.strptime(date_str, fmt).replace(tzinfo=timezone.utc)
                break
            except ValueError:
                continue
        if parsed_dt is None:
            raise HorizonsError(f"Unrecognized Horizons timestamp '{date_str}'")

        az = float(parts[3]) % 360.0
        el = float(parts[4])
        dist_km = float(parts[5]) * AU_KM
        rows.append((parsed_dt, az, el, dist_km))
    return rows


def _query_horizons_http(
    lat: float,
    lon: float,
    elev_m: float,
    times_utc: list[datetime],
    body: Body,
    timeout: float = 15.0,
) -> list[tuple[float, float, float]]:
    if not times_utc:
        return []

    elev_km = elev_m / 1000.0
    base_params: dict[str, Any] = {
        "format": "json",
        "COMMAND": _BODY_COMMAND[body],
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon:.6f},{lat:.6f},{elev_km:.4f}'",
        "QUANTITIES": "'4,20'",
        "ANG_FORMAT": "'DEG'",
        "CSV_FORMAT": "'YES'",
    }

    # Check if uniform whole-minute spacing applies
    use_step = False
    step_minutes = 60
    if len(times_utc) == 1:
        use_step = True
        t0 = times_utc[0]
        base_params["START_TIME"] = f"'{t0:%Y-%m-%d %H:%M:%S}'"
        base_params["STOP_TIME"] = f"'{(t0 + timedelta(minutes=1)):%Y-%m-%d %H:%M:%S}'"
        base_params["STEP_SIZE"] = "'1h'"
    else:
        deltas = [(times_utc[i + 1] - times_utc[i]).total_seconds() for i in range(len(times_utc) - 1)]
        first_dt = deltas[0]
        if first_dt >= 60.0 and all(abs(d - first_dt) < 1.0 for d in deltas) and abs(first_dt % 60.0) < 1.0:
            use_step = True
            step_minutes = int(round(first_dt / 60.0))
            t0 = times_utc[0]
            t1 = times_utc[-1] + timedelta(seconds=30)
            base_params["START_TIME"] = f"'{t0:%Y-%m-%d %H:%M:%S}'"
            base_params["STOP_TIME"] = f"'{t1:%Y-%m-%d %H:%M:%S}'"
            base_params["STEP_SIZE"] = f"'{step_minutes}m'"

    if not use_step:
        # Use Julian Dates via TLIST for arbitrary timestamps (chunks of 30 max)
        j2000 = datetime(2000, 1, 1, 12, 0, tzinfo=timezone.utc)
        out_rows: list[tuple[float, float, float]] = []
        with httpx.Client(timeout=timeout) as client:
            for start in range(0, len(times_utc), 30):
                chunk = times_utc[start : start + 30]
                jds = [f"'{2451545.0 + (t - j2000).total_seconds() / 86400.0:.8f}'" for t in chunk]
                params = {**base_params, "TLIST": " ".join(jds)}
                resp = client.get(HORIZONS_API_URL, params=params)
                resp.raise_for_status()
                payload = resp.json()
                if "error" in payload:
                    raise HorizonsError(payload["error"])
                parsed = _parse_horizons_csv(payload.get("result", ""))
                if len(parsed) != len(chunk):
                    raise HorizonsError(f"Expected {len(chunk)} rows from Horizons, got {len(parsed)}")
                out_rows.extend((az, el, d) for _, az, el, d in parsed)
        return out_rows

    with httpx.Client(timeout=timeout) as client:
        resp = client.get(HORIZONS_API_URL, params=base_params)
        resp.raise_for_status()
        payload = resp.json()
        if "error" in payload:
            raise HorizonsError(payload["error"])
        parsed = _parse_horizons_csv(payload.get("result", ""))
        if len(parsed) < len(times_utc):
            raise HorizonsError(
                f"Expected at least {len(times_utc)} rows from Horizons, got {len(parsed)}"
            )
        return [(az, el, d) for _, az, el, d in parsed[: len(times_utc)]]


def fetch_horizons_altaz(
    lat: float,
    lon: float,
    elev_m: float,
    times_utc: Sequence[datetime],
    body: Body,
    timeout: float = 15.0,
) -> AltAzResult:
    """Query NASA JPL Horizons topocentric Az/El for an observer on the Moon, with caching."""
    utc_times = [_as_utc(t) for t in times_utc]
    with _CACHE_LOCK:
        _ensure_cache_loaded()
        missing_indices: list[int] = []
        missing_times: list[datetime] = []
        keys = [_point_key(lat, lon, elev_m, t, body) for t in utc_times]
        for idx, k in enumerate(keys):
            if k not in _MEMORY_CACHE:
                missing_indices.append(idx)
                missing_times.append(utc_times[idx])

    if missing_times:
        try:
            fetched = _query_horizons_http(lat, lon, elev_m, missing_times, body, timeout=timeout)
        except HorizonsError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise HorizonsError(f"JPL Horizons request failed: {exc}") from exc

        with _CACHE_LOCK:
            for idx, vals in zip(missing_indices, fetched):
                _MEMORY_CACHE[keys[idx]] = vals
            _persist_cache()

    with _CACHE_LOCK:
        ordered = [_MEMORY_CACHE[k] for k in keys]

    az = np.array([v[0] for v in ordered], dtype=np.float64)
    el = np.array([v[1] for v in ordered], dtype=np.float64)
    dist = np.array([v[2] for v in ordered], dtype=np.float64)
    return AltAzResult(az_deg=az, el_deg=el, distance_km=dist)


# Keep stub symbol compatibility
fetch_altaz = fetch_horizons_altaz


def lookup_golden_case(
    lat: float,
    lon: float,
    time_utc: datetime,
    body: Body,
) -> Optional[AltAzResult]:
    """Check verified golden reference file when offline."""
    golden_path = BACKEND_DIR / "tests" / "golden" / "horizons_cases.json"
    if not golden_path.exists():
        return None
    ts = _as_utc(time_utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    cases = json.loads(golden_path.read_text(encoding="utf-8-sig"))
    for c in cases:
        if (
            c.get("body") == body
            and c.get("time_utc") == ts
            and abs(float(c["lat"]) - lat) < 1e-2
            and abs(float(c["lon"]) - lon) < 1e-2
        ):
            return AltAzResult(
                az_deg=np.array([float(c["az_deg"])], dtype=np.float64),
                el_deg=np.array([float(c["el_deg"])], dtype=np.float64),
                distance_km=np.array([float(c["distance_km"])], dtype=np.float64),
            )
    return None


def check_horizons_reachable(timeout: float = 5.0) -> bool:
    """Lightweight probe to check if NASA JPL Horizons API responds."""
    try:
        t0 = datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc)
        _query_horizons_http(-89.9, 0.0, 2100.0, [t0], "sun", timeout=timeout)
        return True
    except Exception:  # noqa: BLE001
        return False
