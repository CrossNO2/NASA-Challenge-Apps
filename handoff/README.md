# Lunar landing-site service

This service provides a frozen, versioned lunar landing-site catalog, canonical
JSON/CSV exports, a coordinate validation/normalization endpoint, and explicit
adapter contracts for future terrain and ephemeris sources.

## Data files

- `data/sites.json`: Frozen canonical catalog of successful lunar soft landings
  (plus the explicitly labeled `south-pole-reference` point).
- `data/dataset.json`: Dataset version, updated date, and coordinate convention.
- `data/cross_check_sources.json`: Secondary source coordinates used to verify
  catalog accuracy within the 1 km target tolerance.

## Commands

Run tests:

```bash
pytest -v
python3 -m unittest discover -s tests -v
```

Run the CLI validator and cross-check:

```bash
python3 -m lunar_sites.cli validate
python3 -m lunar_sites.cli cross-check
```

Start the HTTP API:

```bash
python3 -m lunar_sites.app
```

The service intentionally does not approximate terrain or ephemeris data.
Those belong in the explicit adapters described in [PLAN.md](./PLAN.md) and
defined in `lunar_sites/adapters.py`.
