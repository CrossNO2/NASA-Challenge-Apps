"""Explicit boundary contracts for external terrain and ephemeris adapters."""

from __future__ import annotations

import math
import time
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable

from .catalog import generated_at, normalize_longitude


class AdapterError(RuntimeError):
    """Raised when an external terrain or ephemeris adapter fails or times out."""


@dataclass(frozen=True)
class CachePolicy:
    """TTL and capacity policy for adapter query caching."""

    ttl_seconds: int = 3600
    max_entries: int = 256

    def __post_init__(self) -> None:
        if self.ttl_seconds < 0:
            raise ValueError("ttl_seconds must be non-negative")
        if self.max_entries < 1:
            raise ValueError("max_entries must be at least 1")


class _BaseAdapter:
    """Shared timeout, caching, and provenance wrapper for external data adapters."""

    def __init__(
        self,
        *,
        transport: Callable[..., dict[str, Any]] | None = None,
        timeout_seconds: float = 10.0,
        cache_policy: CachePolicy | None = None,
        clock: Callable[[], float] | None = None,
    ) -> None:
        if timeout_seconds <= 0 or not math.isfinite(timeout_seconds):
            raise ValueError("timeout_seconds must be a positive finite number")
        self.transport = transport
        self.timeout_seconds = float(timeout_seconds)
        self.cache_policy = cache_policy or CachePolicy()
        self._clock = clock or time.monotonic
        self._cache: OrderedDict[tuple[Any, ...], tuple[float, dict[str, Any]]] = OrderedDict()

    @staticmethod
    def _validate_coordinates(latitude: float, longitude: float) -> tuple[float, float]:
        if isinstance(latitude, bool) or not isinstance(latitude, (int, float)) or not math.isfinite(latitude):
            raise ValueError("latitude must be a finite number")
        if not -90.0 <= latitude <= 90.0:
            raise ValueError("latitude must be between -90 and 90")
        return float(latitude), normalize_longitude(longitude)

    def _execute(
        self,
        cache_key: tuple[Any, ...],
        request: dict[str, Any],
        *,
        source_name: str,
        source_url: str,
        reference_frame: str,
    ) -> dict[str, Any]:
        now = self._clock()
        if self.cache_policy.ttl_seconds > 0 and cache_key in self._cache:
            cached_at, cached_payload = self._cache[cache_key]
            if now - cached_at < self.cache_policy.ttl_seconds:
                self._cache.move_to_end(cache_key)
                return {**cached_payload, "cached": True}
            del self._cache[cache_key]

        if self.transport is None:
            raise AdapterError(
                f"{self.__class__.__name__} has no configured transport; silent fallback approximation is disabled"
            )

        try:
            raw_response = self.transport(request, timeout=self.timeout_seconds)
        except AdapterError:
            raise
        except Exception as exc:
            raise AdapterError(f"{self.__class__.__name__} upstream request failed: {exc}") from exc

        if not isinstance(raw_response, dict):
            raise AdapterError(f"{self.__class__.__name__} returned malformed non-object payload")

        result = {
            **raw_response,
            "provenance": {
                "source_name": source_name,
                "source_url": source_url,
                "reference_frame": reference_frame,
                "retrieved_at": generated_at(),
                "timeout_seconds": self.timeout_seconds,
                "cache_ttl_seconds": self.cache_policy.ttl_seconds,
            },
        }
        if self.cache_policy.ttl_seconds > 0:
            self._cache[cache_key] = (now, result)
            self._cache.move_to_end(cache_key)
            while len(self._cache) > self.cache_policy.max_entries:
                self._cache.popitem(last=False)
        return {**result, "cached": False}


class TerrainAdapter(_BaseAdapter):
    """Adapter contract for LOLA/QuickMap elevation and terrain-horizon queries."""

    SOURCE_NAME = "LOLA / LROC QuickMap"
    SOURCE_URL = "https://quickmap.lroc.asu.edu/"
    REFERENCE_FRAME = "Moon Mean Earth / Polar Axis (planetocentric)"

    def query_horizon(self, latitude: float, longitude: float) -> dict[str, Any]:
        """Fetch elevation and terrain-horizon profile for a validated lunar coordinate."""
        lat, lon = self._validate_coordinates(latitude, longitude)
        return self._execute(
            ("terrain", lat, lon),
            {"latitude": lat, "longitude": lon},
            source_name=self.SOURCE_NAME,
            source_url=self.SOURCE_URL,
            reference_frame=self.REFERENCE_FRAME,
        )


class HorizonsEphemerisAdapter(_BaseAdapter):
    """Adapter contract for JPL Horizons Sun/Earth topocentric ephemeris queries."""

    SOURCE_NAME = "NASA JPL Horizons"
    SOURCE_URL = "https://ssd.jpl.nasa.gov/horizons/"
    REFERENCE_FRAME = "Topocentric selenographic (JPL Horizons)"

    def query_ephemeris(self, latitude: float, longitude: float, timestamp_utc: str) -> dict[str, Any]:
        """Fetch Sun and Earth apparent angles for a validated site coordinate and UTC timestamp."""
        lat, lon = self._validate_coordinates(latitude, longitude)
        if not isinstance(timestamp_utc, str) or not timestamp_utc.strip():
            raise ValueError("timestamp_utc must be a non-empty ISO 8601 string")
        normalized_ts = timestamp_utc.strip()
        datetime.fromisoformat(normalized_ts.replace("Z", "+00:00"))
        return self._execute(
            ("ephemeris", lat, lon, normalized_ts),
            {"latitude": lat, "longitude": lon, "timestamp_utc": normalized_ts},
            source_name=self.SOURCE_NAME,
            source_url=self.SOURCE_URL,
            reference_frame=self.REFERENCE_FRAME,
        )
