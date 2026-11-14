# Plan: standardized landing-site aggregation, export, and coordinate processing

## Objective

Give every downstream feature (map, comparison view, lighting/communication
evaluation) one trustworthy source of landing-site records and one shared
coordinate-validation boundary. Records must be normalized, traceable to a
source, and exportable without reimplementing the schema in the front end.

## Scope

In scope for this iteration:

- A curated catalog of successful lunar soft landings plus an explicitly
  labeled south-pole reference point.
- A canonical record schema with provenance on every record.
- Stable JSON and CSV exports with dataset version and generation metadata.
- A coordinate endpoint that validates user input and normalizes longitude.
- Tests that lock down the schema, normalization edge cases, and exports.

Out of scope for this iteration (reserved for adapters):

- Live LOLA/QuickMap elevation and terrain-horizon queries.
- JPL Horizons Sun/Earth ephemerides.
- Mission-feasibility scoring, which is a consumer of these outputs.

## Canonical record

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Lowercase slug, unique and stable across releases. |
| `name` | string | Human-readable site name. |
| `latitude` | number | Degrees, `[-90, 90]`, north-positive. |
| `longitude` | number | Degrees, east-positive, normalized to `[-180, 180)`. |
| `region` | string | Named lunar region or feature. |
| `site_type` | enum | `crewed`, `robotic`, or `reference`. |
| `status` | enum | `landed` or `reference`. |
| `country` | string or null | Country associated with the mission. |
| `operator` | string or null | Agency or company that operated the lander. |
| `mission` | string or null | Mission name. |
| `landing_date` | ISO date or null | UTC calendar date of touchdown. |
| `source_name` | string | Short citation for the record. |
| `source_url` | URL | HTTP(S) link to the source or cross-check. |
| `notes` | string or null | Short context, including partial successes. |

### Coordinate convention

- Latitude is selenographic latitude in degrees, north-positive. Published
  values are used as-is; no planetographic/planetocentric conversion is
  applied in this iteration. That conversion belongs in the terrain adapter
  where the reference frame can be stated explicitly.
- Longitude is east-positive. West longitudes are negative. Input may wrap
  beyond `[-180, 180)` and is normalized by the service.
- This service is a catalog and validation boundary, not an ephemeris source.
  Time-dependent geometry must continue to come from a separately versioned
  adapter.

### Inclusion policy

- Include successful soft landings by crewed and robotic missions.
- Include partial successes (for example, landers that arrived intact but
  tipped over), and state the limitation in `notes`.
- Exclude impactors, flybys, orbiters, and failed landing attempts.
- The south-pole reference is included only because it is explicitly labeled
  `reference`; it is not presented as a landed mission.

## Source hierarchy

1. NASA NSSDC Apollo landing-site tables and the NSSDC lunar artifact table
   for Apollo, Surveyor, and Luna records.
2. Mission-operator publications (NASA CLPS, ISRO, JAXA, CNSA) for recent
   missions.
3. LROC QuickMap and NASA Moon Trek for coordinate cross-checks and current
   precision.

No coordinate is accepted without a `source_name` and `source_url`. Where a
record is cross-checked, the plan is to keep the primary citation in the
record and document the cross-check in the release notes or a future
`cross_checked_with` field rather than duplicating dozens of URLs.

## Aggregation workflow

1. **Collect** candidate records in a staging file with source URLs.
2. **Validate** each record against the canonical schema, including bounds,
   unique IDs, URL shape, and valid dates.
3. **Normalize** longitude, dates, and IDs exactly once at ingestion.
4. **Cross-check** coordinates against a second source. Differences larger
   than the documented tolerance (target: 1 km) require resolution or an
   explicit note before release.
5. **Freeze** the accepted catalog in `data/sites.json` and update
   `data/dataset.json` (version and updated date).
6. **Test** catalog integrity, coordinate behavior, and export contracts.
7. **Publish** through the API. Exports carry the dataset version so cached
   downloads can be invalidated.

Version policy: bump the minor version when records are added or corrected;
bump the major version when the record schema or coordinate convention
changes.

## Coordinate processing contract

Endpoint: `POST /coordinates/process`

Input:

```json
{"latitude": -89.5, "longitude": 540, "label": "custom site"}
```

Rules:

- `latitude` and `longitude` must be JSON numbers, finite, and latitude must
  be within `[-90, 90]`.
- `longitude` accepts any finite value and is normalized to `[-180, 180)`,
  with `180` mapped to `-180`.
- `label` is optional, trimmed, and limited to 120 characters.
- Unknown fields are rejected so typos do not silently pass validation.
- Invalid input returns HTTP 422 with field-level details.

Response additions are deliberately derived and local (no network calls):
normalized coordinates, the original longitude, whether normalization was
needed, latitude/longitude hemisphere labels, and near-side/far-side/limb
classification. The response keeps the longitude convention and a next-step
hint so clients do not have to hardcode them.

## Export contract

Both formats are generated from the same ordered serializer, so column and
field contents cannot drift.

- `GET /sites/export.json` returns a JSON array of canonical records.
- `GET /sites/export.csv` returns RFC 4180 CSV with a fixed header:
  `id,name,latitude,longitude,region,site_type,status,country,operator,mission,landing_date,source_name,source_url,notes`.
- Null values are `null` in JSON and empty fields in CSV. Dates are ISO 8601.
- Responses set `Content-Disposition` and expose `X-Dataset-Version`,
  `X-Dataset-Updated`, `X-Record-Count`, and `X-Generated-At` headers.
- `GET /dataset` returns the same version metadata plus the record count.

## Quality gates

- `pytest` must pass.
- Catalog tests: at least 20 records, unique IDs, valid bounds, valid URLs.
- Coordinate tests: boundary values (`90`, `-90`, `180`, `-180`, `540`,
  `-540`), wrapping, missing fields, non-finite values, extra fields, and
  label limits.
- Export tests: JSON/CSV record counts match the catalog, CSV header is
  stable, and metadata headers are present.
- Future gate: a CLI validator that runs the same checks in CI before a data
  release.

## Delivery phases

1. **This change:** curated catalog, schema, versioned exports, coordinate
   endpoint, and contract tests.
2. **Ingestion adapters:** source-specific readers that emit canonical
   records; automated cross-check reports; catalog validation CLI.
3. **Terrain and ephemeris adapters:** LOLA elevation/horizon and Horizons
   Sun/Earth positions, each with explicit timeouts, cache policy, and
   provenance on the calculated result.
4. **Release hardening:** snapshot archives per dataset version, schema
   changelog, and monitoring for source URL drift.

## Risks and mitigations

- **Reference-frame ambiguity:** avoid claiming a conversion this service does
  not perform; state the published-value policy and defer conversion to the
  terrain adapter.
- **Source drift:** pin URLs, record versions/dates, and re-check records when
  missions or sources update.
- **Coordinate precision:** keep source precision rather than rounding;
  validate against a second source where available.
- **Silent source failure:** adapters must fail explicitly; no fallback to
  approximated ephemerides or terrain.
