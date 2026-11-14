"""Minimal HTTP API for the lunar site catalog and coordinate validation."""

from __future__ import annotations

import json
import math
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

from .catalog import (
    DATASET,
    SITES,
    export_csv,
    export_json,
    generated_at,
    normalize_longitude,
)

LONGITUDE_CONVENTION = "east-positive, [-180, 180)"


def _reject_non_finite_constant(value: str) -> Any:
    raise ValueError(f"non-finite JSON constant is not allowed: {value}")


def parse_json_payload(raw_body: bytes) -> Any:
    """Decode strict JSON rejecting NaN/Infinity constants."""
    try:
        text = raw_body.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("request body must be valid UTF-8") from exc
    return json.loads(text, parse_constant=_reject_non_finite_constant)


def process_coordinates(payload: Any) -> dict[str, Any]:
    """Validate and normalize user-supplied lunar coordinates and derived classifications."""
    if not isinstance(payload, dict):
        raise ValueError("request body must be a JSON object")

    allowed = {"latitude", "longitude", "label"}
    extra = set(payload) - allowed
    missing = {"latitude", "longitude"} - set(payload)
    errors: dict[str, str] = {}
    if extra:
        errors["unknown_fields"] = f"unknown fields: {', '.join(sorted(extra))}"
    if missing:
        errors["missing_fields"] = f"missing fields: {', '.join(sorted(missing))}"

    for field in ("latitude", "longitude"):
        if field in missing:
            continue
        value = payload.get(field)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            errors[field] = "must be a finite JSON number"

    if "latitude" not in missing and "latitude" not in errors and not -90 <= payload["latitude"] <= 90:
        errors["latitude"] = "must be between -90 and 90"

    label = payload.get("label")
    trimmed_label: str | None = None
    if label is not None:
        if not isinstance(label, str):
            errors["label"] = "must be a string of at most 120 characters"
        else:
            trimmed_label = label.strip()
            if len(trimmed_label) > 120:
                errors["label"] = "must be a string of at most 120 characters"

    if errors:
        raise ValueError(errors)

    latitude = 0.0 if payload["latitude"] == 0 else payload["latitude"]
    original_longitude = payload["longitude"]
    longitude = normalize_longitude(original_longitude)

    if abs(longitude) == 90.0:
        lunar_side = "limb"
    elif -90.0 < longitude < 90.0:
        lunar_side = "near side"
    else:
        lunar_side = "far side"

    return {
        "label": trimmed_label,
        "latitude": latitude,
        "longitude": longitude,
        "original_longitude": original_longitude,
        "longitude_normalized": longitude != original_longitude,
        "latitude_hemisphere": "north" if latitude > 0 else "south" if latitude < 0 else "equator",
        "longitude_hemisphere": "east" if longitude > 0 else "west" if longitude < 0 else "prime meridian",
        "lunar_side": lunar_side,
        "longitude_convention": LONGITUDE_CONVENTION,
        "coordinate_convention": DATASET["coordinate_convention"],
        "next_step": "Use a terrain and ephemeris adapter for local horizon and Sun/Earth geometry.",
    }


def headers() -> dict[str, str]:
    """Return standard dataset provenance and cache-invalidation response headers."""
    return {
        "X-Dataset-Version": DATASET["version"],
        "X-Dataset-Updated": DATASET["updated"],
        "X-Record-Count": str(len(SITES)),
        "X-Generated-At": generated_at(),
    }


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: bytes, content_type: str, extra: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        for key, value in {**headers(), **(extra or {})}.items():
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/sites/export.json":
            self._send(
                200,
                export_json().encode("utf-8"),
                "application/json",
                {"Content-Disposition": 'attachment; filename="lunar-sites.json"'},
            )
        elif path == "/sites/export.csv":
            self._send(
                200,
                export_csv().encode("utf-8"),
                "text/csv; charset=utf-8",
                {"Content-Disposition": 'attachment; filename="lunar-sites.csv"'},
            )
        elif path == "/sites":
            self._send(200, export_json().encode("utf-8"), "application/json")
        elif path == "/dataset":
            self._send(
                200,
                json.dumps({**DATASET, "record_count": len(SITES)}).encode("utf-8"),
                "application/json",
            )
        else:
            self._send(404, b'{"error":"not found"}', "application/json")

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/coordinates/process":
            self._send(404, b'{"error":"not found"}', "application/json")
            return
        try:
            raw_length = self.headers.get("Content-Length")
            if raw_length is None:
                raise ValueError("missing Content-Length header")
            content_length = int(raw_length)
            if content_length < 0:
                raise ValueError("invalid Content-Length header")
            raw_body = self.rfile.read(content_length)
            payload = parse_json_payload(raw_body)
            result = process_coordinates(payload)
        except (json.JSONDecodeError, ValueError) as error:
            detail = error.args[0] if isinstance(error, ValueError) else "invalid JSON"
            self._send(422, json.dumps({"error": detail}).encode("utf-8"), "application/json")
            return
        self._send(200, json.dumps(result).encode("utf-8"), "application/json")


def serve(host: str = "127.0.0.1", port: int = 8000) -> None:
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    serve()
