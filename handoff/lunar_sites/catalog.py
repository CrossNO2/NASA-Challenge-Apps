"""Canonical lunar landing-site records, normalization, validation, and export serializers."""

from __future__ import annotations

import csv
import io
import json
import math
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

FIELD_NAMES = (
    "id",
    "name",
    "latitude",
    "longitude",
    "region",
    "site_type",
    "status",
    "country",
    "operator",
    "mission",
    "landing_date",
    "source_name",
    "source_url",
    "notes",
)
SITE_TYPES = {"crewed", "robotic", "reference"}
STATUSES = {"landed", "reference"}
MOON_RADIUS_KM = 1737.4
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SITES_PATH = DATA_DIR / "sites.json"
DATASET_PATH = DATA_DIR / "dataset.json"
CROSS_CHECK_PATH = DATA_DIR / "cross_check_sources.json"


def _is_finite_number(value: Any) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def _validate_http_url(url: Any) -> bool:
    if not isinstance(url, str) or not url.strip():
        return False
    parsed = urlparse(url.strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def normalize_longitude(value: float) -> float:
    """Normalize a finite longitude in degrees to [-180, 180)."""
    if not _is_finite_number(value):
        raise ValueError("longitude must be a finite number")
    normalized = ((float(value) + 180.0) % 360.0) - 180.0
    if normalized >= 180.0 or normalized < -180.0:
        normalized = -180.0
    if normalized == 0.0:
        return 0.0
    return normalized


def normalize_record(record: dict[str, Any]) -> dict[str, Any]:
    """Normalize a raw landing-site record at ingestion into canonical field order."""
    if not isinstance(record, dict):
        raise ValueError("record must be an object")
    if set(record) != set(FIELD_NAMES):
        raise ValueError(f"record must contain exact canonical fields: {record.get('id')}")

    raw_id = record["id"]
    if not isinstance(raw_id, str):
        raise ValueError("record id must be a string")
    site_id = raw_id.strip().lower()

    def _clean_text(value: Any, *, nullable: bool = False) -> Any:
        if value is None:
            return None if nullable else ""
        if not isinstance(value, str):
            return value
        trimmed = value.strip()
        if nullable and not trimmed:
            return None
        return trimmed

    latitude = record["latitude"]
    if not _is_finite_number(latitude):
        raise ValueError(f"invalid latitude for record: {site_id}")

    landing_date = _clean_text(record["landing_date"], nullable=True)
    if landing_date is not None:
        if not isinstance(landing_date, str) or not ISO_DATE_RE.fullmatch(landing_date):
            raise ValueError(f"invalid ISO landing_date for record: {site_id}")
        landing_date = date.fromisoformat(landing_date).isoformat()

    normalized = {
        "id": site_id,
        "name": _clean_text(record["name"]),
        "latitude": float(latitude),
        "longitude": normalize_longitude(record["longitude"]),
        "region": _clean_text(record["region"]),
        "site_type": _clean_text(record["site_type"]),
        "status": _clean_text(record["status"]),
        "country": _clean_text(record["country"], nullable=True),
        "operator": _clean_text(record["operator"], nullable=True),
        "mission": _clean_text(record["mission"], nullable=True),
        "landing_date": landing_date,
        "source_name": _clean_text(record["source_name"]),
        "source_url": _clean_text(record["source_url"]),
        "notes": _clean_text(record["notes"], nullable=True),
    }
    return {field: normalized[field] for field in FIELD_NAMES}


def load_dataset(path: Path = DATASET_PATH) -> dict[str, Any]:
    """Load dataset version metadata from JSON."""
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("dataset metadata must be a JSON object")
    required = {"version", "updated", "coordinate_convention"}
    if not required.issubset(data):
        raise ValueError("dataset metadata missing required keys")
    date.fromisoformat(data["updated"])
    return data


def load_sites(path: Path = SITES_PATH) -> list[dict[str, Any]]:
    """Load canonical landing-site records from JSON."""
    records = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        raise ValueError("sites catalog must be a JSON array")
    return records


def load_cross_checks(path: Path = CROSS_CHECK_PATH) -> dict[str, dict[str, Any]]:
    """Load secondary coordinate cross-check sources keyed by site ID."""
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("cross-check data must be a JSON object")
    return data


def validate_catalog(records: list[dict[str, Any]] | None = None) -> None:
    """Validate canonical schema, bounds, provenance, and uniqueness rules."""
    if records is None:
        records = SITES
    if not isinstance(records, list) or len(records) < 20:
        raise ValueError("catalog must contain at least 20 records")

    seen_ids: set[str] = set()
    for record in records:
        if not isinstance(record, dict) or set(record) != set(FIELD_NAMES):
            raise ValueError(f"invalid fields: {record.get('id') if isinstance(record, dict) else record}")

        site_id = record["id"]
        if not isinstance(site_id, str) or not SLUG_RE.fullmatch(site_id):
            raise ValueError(f"invalid ID slug: {site_id!r}")
        if site_id in seen_ids:
            raise ValueError(f"duplicate ID: {site_id}")
        seen_ids.add(site_id)

        for required_text in ("name", "region", "source_name"):
            value = record[required_text]
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"missing {required_text}: {site_id}")

        latitude = record["latitude"]
        longitude = record["longitude"]
        if not _is_finite_number(latitude) or not -90 <= latitude <= 90:
            raise ValueError(f"latitude out of range: {site_id}")
        if not _is_finite_number(longitude) or not -180 <= longitude < 180:
            raise ValueError(f"longitude out of range: {site_id}")

        site_type = record["site_type"]
        status = record["status"]
        if site_type not in SITE_TYPES or status not in STATUSES:
            raise ValueError(f"invalid enum: {site_id}")

        if not _validate_http_url(record["source_url"]):
            raise ValueError(f"invalid source URL: {site_id}")

        if record["notes"] is not None and (not isinstance(record["notes"], str) or not record["notes"].strip()):
            raise ValueError(f"invalid notes: {site_id}")

        if status == "reference" or site_type == "reference":
            if status != "reference" or site_type != "reference":
                raise ValueError(f"reference status/site_type mismatch: {site_id}")
            for nullable_field in ("country", "operator", "mission", "landing_date"):
                if record[nullable_field] is not None:
                    raise ValueError(f"reference record must have null {nullable_field}: {site_id}")
        else:
            for mission_field in ("country", "operator", "mission"):
                value = record[mission_field]
                if not isinstance(value, str) or not value.strip():
                    raise ValueError(f"landed record missing {mission_field}: {site_id}")
            landing_date = record["landing_date"]
            if not isinstance(landing_date, str) or not ISO_DATE_RE.fullmatch(landing_date):
                raise ValueError(f"invalid landing_date: {site_id}")
            date.fromisoformat(landing_date)


def lunar_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute spherical great-circle surface distance on the Moon in kilometers."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return MOON_RADIUS_KM * c


def cross_check_catalog(
    records: list[dict[str, Any]] | None = None,
    cross_checks: dict[str, dict[str, Any]] | None = None,
    tolerance_km: float = 1.0,
) -> list[dict[str, Any]]:
    """Verify catalog coordinates against secondary sources within tolerance_km."""
    if records is None:
        records = SITES
    if cross_checks is None:
        cross_checks = load_cross_checks()

    report: list[dict[str, Any]] = []
    for record in records:
        site_id = record["id"]
        secondary = cross_checks.get(site_id)
        if not isinstance(secondary, dict):
            raise ValueError(f"missing secondary cross-check source for: {site_id}")

        sec_lat = secondary.get("latitude")
        sec_lon = secondary.get("longitude")
        if not _is_finite_number(sec_lat) or not -90 <= sec_lat <= 90:
            raise ValueError(f"invalid cross-check latitude for: {site_id}")
        sec_lon_norm = normalize_longitude(sec_lon)

        sec_name = secondary.get("source_name")
        sec_url = secondary.get("source_url")
        if not isinstance(sec_name, str) or not sec_name.strip() or not _validate_http_url(sec_url):
            raise ValueError(f"invalid cross-check provenance for: {site_id}")

        distance_km = lunar_distance_km(record["latitude"], record["longitude"], sec_lat, sec_lon_norm)
        within_tolerance = distance_km <= tolerance_km
        has_note = isinstance(record.get("notes"), str) and bool(record["notes"].strip())
        if not within_tolerance and not has_note:
            raise ValueError(
                f"cross-check difference {distance_km:.3f} km exceeds {tolerance_km:.3f} km for {site_id} without an explanatory note"
            )

        report.append(
            {
                "id": site_id,
                "distance_km": round(distance_km, 4),
                "within_tolerance": within_tolerance,
                "secondary_source": sec_name.strip(),
                "secondary_url": sec_url.strip(),
                "resolved_with_note": not within_tolerance,
            }
        )
    return report


def freeze_catalog(
    records: list[dict[str, Any]],
    dataset: dict[str, Any],
    sites_path: Path = SITES_PATH,
    dataset_path: Path = DATASET_PATH,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Normalize, validate, and write frozen catalog and dataset files."""
    normalized = [normalize_record(record) for record in records]
    validate_catalog(normalized)
    if not isinstance(dataset, dict) or not {"version", "updated", "coordinate_convention"}.issubset(dataset):
        raise ValueError("dataset metadata missing required keys")
    date.fromisoformat(dataset["updated"])

    sites_path.parent.mkdir(parents=True, exist_ok=True)
    sites_path.write_text(export_json(normalized), encoding="utf-8")
    dataset_path.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return normalized, dataset


def export_json(records: list[dict[str, Any]] | None = None) -> str:
    """Serialize canonical records to a formatted JSON array."""
    if records is None:
        records = SITES
    ordered = [{field: record[field] for field in FIELD_NAMES} for record in records]
    return json.dumps(ordered, ensure_ascii=False, indent=2) + "\n"


def export_csv(records: list[dict[str, Any]] | None = None) -> str:
    """Serialize canonical records to RFC 4180 CSV with fixed column order."""
    if records is None:
        records = SITES
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=FIELD_NAMES, lineterminator="\r\n")
    writer.writeheader()
    writer.writerows(
        {field: record[field] if record[field] is not None else "" for field in FIELD_NAMES}
        for record in records
    )
    return output.getvalue()


def generated_at() -> str:
    """Return current UTC timestamp formatted in ISO 8601 Z notation."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


DATASET: dict[str, Any] = load_dataset()
SITES: list[dict[str, Any]] = load_sites()
validate_catalog(SITES)
