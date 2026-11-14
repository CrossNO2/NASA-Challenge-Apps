# Lunar Landing Site Navigator — Backend (FastAPI)

Computes where the **Sun** and **Earth** appear in the sky for an observer standing on the Moon,
checks terrain visibility against LOLA horizon profiles, cross-validates against **NASA JPL Horizons**,
and evaluates landing feasibility with a **4-Gate Decision Engine** and **30-day Optimal Window Finder**.

## Setup

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate     macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python scripts/download_kernels.py      # ~19 MB of NAIF SPICE kernels -> backend/kernels/
```

## Run & Test

```bash
uvicorn app.main:app --reload           # Swagger UI: http://localhost:8000/docs
pytest -v                               # Full unit, golden-truth, and API tests
```

Env vars:
- `CORS_ORIGINS` (comma-separated, default `*`)
- `KERNEL_DIR` (default `backend/kernels`)
- `MAX_EPHEMERIS_POINTS` (default `2000`)
- `WEIGHT_POWER`, `WEIGHT_COMMS`, `WEIGHT_TERRAIN`, `WEIGHT_RESILIENCE` (defaults `0.35`, `0.25`, `0.20`, `0.20`)

Docker (Hugging Face Spaces, port `7860`):

```bash
docker build -t lunar-nav-api . && docker run -p 7860:7860 lunar-nav-api
```

## API Endpoints (prefix `/api/v1`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Service status, version, SPICE kernels loaded (`?check_horizons=true` probes JPL Horizons) |
| `GET` | `/sites` | List of landing sites (`app/data/sites.json`) |
| `GET` | `/sites/{id}` | Site metadata + 360° horizon profile (`terrain_source`: `"lola"` or `"none"`) |
| `GET` | `/ephemeris` | Time series (`site_id` or `lat,lon,elev_m`, `start`, `stop`, `step_hours`, `bodies=sun,earth`, `source=skyfield\|horizons`) |
| `GET` | `/ephemeris/instant` | Single-instant Sun/Earth sky state (for temporal scrubber) |
| `GET` | `/validate` | Cross-check `skyfield_de421` vs live NASA JPL Horizons (`DE441`) — returns `delta_az_deg`, `delta_el_deg` |
| `POST` | `/feasibility` | 4-Gate evaluation (`power`, `comms`, `terrain`, `resilience` +48h scrub) -> `GO` / `CAUTION` / `NO-GO` |
| `POST` | `/optimal-window` | Scans up to 60 days (default 29.53 days) and returns top-k optimal landing windows |
| `POST` | `/compare` | Side-by-side technical comparison matrix & recommendation for 2–6 sites |

## For Teammates

- **Frontend (Phát)** — Generate TypeScript types directly from OpenAPI:
  ```bash
  npx openapi-typescript http://localhost:8000/openapi.json -o src/api/types.ts
  ```
- **Data & Map (Tùng)** — Replace placeholder values in `app/data/sites.json` with official NASA Artemis III (Oct 2024, 9 regions) + Apollo 11 coordinates and LOLA LDEM slopes:
  ```json
  {
    "id": "shackleton-rim",
    "name": "Shackleton Rim",
    "lat": -89.9,
    "lon": 0.0,
    "elevation_m": 2100,
    "slope_deg": 8.5,
    "program": "Artemis III",
    "horizon_profile_file": "horizons/shackleton-rim.json",
    "source": "NASA Artemis III candidate regions (2024) + LOLA LDEM"
  }
  ```
  and add `app/data/horizons/{id}.json`:
  ```json
  {
    "step_deg": 1,
    "elevations_deg": [/* 360 numbers from az=0 (North) clockwise */],
    "source": "LOLA LDEM Polar Stereographic"
  }
  ```
  Sites without a horizon file default to a flat `0°` horizon and explicitly return `terrain_source: "none"`.
- **QA / Verification (Lê Anh Đức)** — Verified NASA JPL Horizons ground-truth assertions live in `tests/golden/horizons_cases.json` (`< 0.1°` tolerance against `skyfield_de421`). Add edge-case scenarios to `tests/test_gates.py`.
- **Slides & Pitch (VGiang)** — Use `/api/v1/validate` output (sub-0.0001° agreement with JPL Horizons DE441) and `reasons[]` from `/api/v1/feasibility` as scientific proof in the 7-slide deck.

## Data Sources & Provenance

- **NAIF SPICE Generic Kernels (NASA/JPL)**: `de421.bsp`, `moon_pa_de421_1900-2050.bpc`, `moon_080317.tf`, `pck00008.tpc` — https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
- **NASA JPL Horizons API (SSD/CNEOS)**: Topocentric lunar observer (`CENTER='coord@301'`, `QUANTITIES='4,20'`) — https://ssd.jpl.nasa.gov/api/horizons.api
- **Observer Reference Frame**: `MOON_ME_DE421` (Moon Mean-Earth / Polar-Axis) via Skyfield `PlanetaryConstants`.
- **License**: Apache-2.0
