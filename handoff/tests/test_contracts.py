import csv
import io
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from copy import deepcopy
from http.server import ThreadingHTTPServer
from pathlib import Path

from lunar_sites.adapters import (
    AdapterError,
    CachePolicy,
    HorizonsEphemerisAdapter,
    TerrainAdapter,
)
from lunar_sites.app import Handler, process_coordinates
from lunar_sites.catalog import (
    DATASET,
    DATASET_PATH,
    FIELD_NAMES,
    SITES,
    SITES_PATH,
    cross_check_catalog,
    export_csv,
    export_json,
    load_cross_checks,
    load_dataset,
    load_sites,
    normalize_longitude,
    normalize_record,
    validate_catalog,
)
from lunar_sites.cli import main as cli_main


class _QuietHandler(Handler):
    def log_message(self, format: str, *args) -> None:
        return None


class CatalogTests(unittest.TestCase):
    def test_catalog_is_valid_and_matches_frozen_data(self):
        validate_catalog()
        self.assertGreaterEqual(len(SITES), 20)
        self.assertEqual(SITES, load_sites(SITES_PATH))
        self.assertEqual(DATASET, load_dataset(DATASET_PATH))

        ids = {site["id"] for site in SITES}
        self.assertNotIn("beresheet", ids)
        self.assertIn("south-pole-reference", ids)

        by_id = {site["id"]: site for site in SITES}
        self.assertLess(by_id["surveyor-1"]["latitude"], 0)
        self.assertLess(by_id["chang-e-3"]["longitude"], 0)

    def test_cross_check_within_tolerance(self):
        report = cross_check_catalog()
        self.assertEqual(len(report), len(SITES))
        self.assertTrue(all(item["within_tolerance"] for item in report))
        self.assertTrue(all(item["distance_km"] <= 1.0 for item in report))

    def test_cross_check_flags_out_of_tolerance_without_note(self):
        records = deepcopy(SITES)
        cross_checks = deepcopy(load_cross_checks())
        records[0]["notes"] = None
        cross_checks[records[0]["id"]]["latitude"] += 1.0
        with self.assertRaises(ValueError):
            cross_check_catalog(records, cross_checks=cross_checks, tolerance_km=1.0)

        records[0]["notes"] = "Offset resolved by secondary LROC tie-point."
        report = cross_check_catalog(records, cross_checks=cross_checks, tolerance_km=1.0)
        self.assertTrue(report[0]["resolved_with_note"])

    def test_invalid_catalog_records_rejected(self):
        base = deepcopy(SITES)

        bad_slug = deepcopy(base)
        bad_slug[0]["id"] = "Apollo_11"
        with self.assertRaises(ValueError):
            validate_catalog(bad_slug)

        bad_lat = deepcopy(base)
        bad_lat[0]["latitude"] = 90.5
        with self.assertRaises(ValueError):
            validate_catalog(bad_lat)

        bad_lon = deepcopy(base)
        bad_lon[0]["longitude"] = 180.0
        with self.assertRaises(ValueError):
            validate_catalog(bad_lon)

        bad_url = deepcopy(base)
        bad_url[0]["source_url"] = "ftp://example.com/apollo"
        with self.assertRaises(ValueError):
            validate_catalog(bad_url)

        bad_date = deepcopy(base)
        bad_date[0]["landing_date"] = "1969-13-45"
        with self.assertRaises(ValueError):
            validate_catalog(bad_date)

        dup_id = deepcopy(base)
        dup_id[1]["id"] = dup_id[0]["id"]
        with self.assertRaises(ValueError):
            validate_catalog(dup_id)

    def test_normalize_record_and_longitude(self):
        self.assertEqual(normalize_longitude(-0.0), 0.0)
        self.assertEqual(normalize_longitude(540), -180.0)
        raw = deepcopy(SITES[0])
        raw["id"] = "  APOLLO-11  "
        raw["longitude"] = 383.473
        raw["notes"] = "   "
        normalized = normalize_record(raw)
        self.assertEqual(normalized["id"], "apollo-11")
        self.assertAlmostEqual(normalized["longitude"], 23.473)
        self.assertIsNone(normalized["notes"])
        self.assertEqual(tuple(normalized), FIELD_NAMES)


class CoordinateTests(unittest.TestCase):
    def test_boundary_latitudes_and_longitude_wrapping(self):
        cases = (
            (0, 90, 90.0, False, "limb"),
            (0, -90, -90.0, False, "limb"),
            (0, 270, -90.0, True, "limb"),
            (0, -270, 90.0, True, "limb"),
            (90, 180, -180.0, True, "far side"),
            (-90, -180, -180.0, False, "far side"),
            (0, 540, -180.0, True, "far side"),
            (0, -540, -180.0, True, "far side"),
            (0, 181, -179.0, True, "far side"),
            (0, -181, 179.0, True, "far side"),
            (0, 0, 0.0, False, "near side"),
            (-0.0, -0.0, 0.0, False, "near side"),
            (45, 45, 45.0, False, "near side"),
            (0, 135, 135.0, False, "far side"),
        )
        for lat, lon, expected_lon, expected_norm, expected_side in cases:
            result = process_coordinates({"latitude": lat, "longitude": lon})
            self.assertEqual(result["longitude"], expected_lon)
            self.assertEqual(result["longitude_normalized"], expected_norm)
            self.assertEqual(result["lunar_side"], expected_side)
            self.assertEqual(result["longitude_convention"], "east-positive, [-180, 180)")
            self.assertEqual(result["coordinate_convention"], DATASET["coordinate_convention"])
            self.assertIn("adapter", result["next_step"])

    def test_label_limits_and_derived_values(self):
        result = process_coordinates({"latitude": -89.5, "longitude": 10, "label": "  pole  "})
        self.assertEqual(result["label"], "pole")
        self.assertEqual(result["latitude_hemisphere"], "south")
        self.assertEqual(result["longitude_hemisphere"], "east")

        max_label = "x" * 120
        ok = process_coordinates({"latitude": 0, "longitude": 0, "label": f" {max_label} "})
        self.assertEqual(ok["label"], max_label)
        self.assertEqual(ok["latitude_hemisphere"], "equator")
        self.assertEqual(ok["longitude_hemisphere"], "prime meridian")

    def test_invalid_payloads(self):
        invalid_payloads = (
            [],
            {"latitude": 91, "longitude": 0},
            {"latitude": -90.1, "longitude": 0},
            {"latitude": 0},
            {"longitude": 0},
            {"latitude": 0, "longitude": 0, "typo": 1},
            {"latitude": True, "longitude": 0},
            {"latitude": 0, "longitude": False},
            {"latitude": float("nan"), "longitude": 0},
            {"latitude": 0, "longitude": float("inf")},
            {"latitude": 0, "longitude": float("-inf")},
            {"latitude": 0, "longitude": 0, "label": 123},
            {"latitude": 0, "longitude": 0, "label": "x" * 121},
        )
        for payload in invalid_payloads:
            with self.assertRaises(ValueError):
                process_coordinates(payload)


class ExportAndApiTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), _QuietHandler)
        self.port = self.server.server_port
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def _request(self, method: str, path: str, body: bytes | None = None, content_type: str | None = None):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=body, method=method)
        if content_type:
            req.add_header("Content-Type", content_type)
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status, dict(resp.headers.items()), resp.read()
        except urllib.error.HTTPError as err:
            return err.code, dict(err.headers.items()), err.read()

    def test_exports_share_catalog_and_null_mapping(self):
        json_records = json.loads(export_json())
        self.assertEqual(len(json_records), len(SITES))

        csv_text = export_csv()
        self.assertIn("\r\n", csv_text)
        rows = list(csv.DictReader(io.StringIO(csv_text)))
        self.assertEqual(len(rows), len(SITES))
        self.assertEqual(tuple(rows[0]), FIELD_NAMES)

        ref_json = next(item for item in json_records if item["id"] == "south-pole-reference")
        ref_csv = next(item for item in rows if item["id"] == "south-pole-reference")
        self.assertIsNone(ref_json["country"])
        self.assertEqual(ref_csv["country"], "")
        self.assertEqual(ref_csv["landing_date"], "")

    def test_http_export_and_dataset_endpoints(self):
        status, hdrs, body = self._request("GET", "/sites/export.json")
        self.assertEqual(status, 200)
        self.assertEqual(len(json.loads(body)), len(SITES))
        self.assertEqual(hdrs["X-Dataset-Version"], DATASET["version"])
        self.assertEqual(hdrs["X-Dataset-Updated"], DATASET["updated"])
        self.assertEqual(hdrs["X-Record-Count"], str(len(SITES)))
        self.assertTrue(hdrs["X-Generated-At"].endswith("Z"))
        self.assertIn('filename="lunar-sites.json"', hdrs["Content-Disposition"])

        status, hdrs, body = self._request("GET", "/sites/export.csv")
        self.assertEqual(status, 200)
        rows = list(csv.DictReader(io.StringIO(body.decode("utf-8"))))
        self.assertEqual(len(rows), len(SITES))
        self.assertEqual(tuple(rows[0]), FIELD_NAMES)
        self.assertIn('filename="lunar-sites.csv"', hdrs["Content-Disposition"])
        self.assertEqual(hdrs["X-Dataset-Version"], DATASET["version"])

        status, hdrs, body = self._request("GET", "/dataset")
        self.assertEqual(status, 200)
        dataset_payload = json.loads(body)
        self.assertEqual(dataset_payload["version"], DATASET["version"])
        self.assertEqual(dataset_payload["record_count"], len(SITES))

        status, _, body = self._request("GET", "/sites")
        self.assertEqual(status, 200)
        self.assertEqual(len(json.loads(body)), len(SITES))

    def test_http_coordinate_processing_and_errors(self):
        payload = json.dumps({"latitude": -89.5, "longitude": 540, "label": "custom site"}).encode("utf-8")
        status, hdrs, body = self._request("POST", "/coordinates/process", payload, "application/json")
        self.assertEqual(status, 200)
        self.assertEqual(hdrs["X-Dataset-Version"], DATASET["version"])
        data = json.loads(body)
        self.assertEqual(data["longitude"], -180.0)
        self.assertTrue(data["longitude_normalized"])
        self.assertEqual(data["lunar_side"], "far side")

        for bad_body in (b"{not json", b'{"latitude": 0, "longitude": Infinity}', b'{"latitude": NaN, "longitude": 0}', b'{"latitude": 95, "longitude": 0}'):
            status, _, body = self._request("POST", "/coordinates/process", bad_body, "application/json")
            self.assertEqual(status, 422)
            self.assertIn("error", json.loads(body))

        status, _, _ = self._request("GET", "/nonexistent")
        self.assertEqual(status, 404)


class CliAndAdapterTests(unittest.TestCase):
    def test_cli_validate_cross_check_and_freeze(self):
        self.assertEqual(cli_main(["validate"]), 0)
        self.assertEqual(cli_main(["cross-check"]), 0)

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            staging = tmp / "staging.json"
            frozen_sites = tmp / "sites.json"
            frozen_dataset = tmp / "dataset.json"

            records = deepcopy(SITES)
            records[0]["longitude"] = 383.473
            staging.write_text(json.dumps(records), encoding="utf-8")
            frozen_dataset.write_text(json.dumps(DATASET), encoding="utf-8")

            rc = cli_main(
                [
                    "freeze",
                    "--input",
                    str(staging),
                    "--sites",
                    str(frozen_sites),
                    "--dataset",
                    str(frozen_dataset),
                    "--version",
                    "1.1.0",
                ]
            )
            self.assertEqual(rc, 0)
            self.assertAlmostEqual(load_sites(frozen_sites)[0]["longitude"], 23.473)
            self.assertEqual(load_dataset(frozen_dataset)["version"], "1.1.0")

            bad_staging = tmp / "bad.json"
            bad_staging.write_text("[]", encoding="utf-8")
            self.assertEqual(cli_main(["validate", "--sites", str(bad_staging)]), 1)

    def test_adapters_provenance_cache_and_explicit_failures(self):
        with self.assertRaises(AdapterError):
            TerrainAdapter().query_horizon(-89.5, 0.0)
        with self.assertRaises(AdapterError):
            HorizonsEphemerisAdapter().query_ephemeris(-89.5, 0.0, "2026-11-14T00:00:00Z")

        now = [100.0]
        calls = {"terrain": 0, "ephemeris": 0}

        def terrain_transport(request, timeout):
            calls["terrain"] += 1
            self.assertEqual(timeout, 5.0)
            return {"elevation_m": -120.5, "request": request}

        terrain = TerrainAdapter(
            transport=terrain_transport,
            timeout_seconds=5.0,
            cache_policy=CachePolicy(ttl_seconds=60, max_entries=8),
            clock=lambda: now[0],
        )
        first = terrain.query_horizon(-89.5, 540.0)
        self.assertFalse(first["cached"])
        self.assertEqual(first["request"]["longitude"], -180.0)
        self.assertEqual(first["provenance"]["source_name"], TerrainAdapter.SOURCE_NAME)

        second = terrain.query_horizon(-89.5, -180.0)
        self.assertTrue(second["cached"])
        self.assertEqual(calls["terrain"], 1)

        now[0] += 61.0
        third = terrain.query_horizon(-89.5, -180.0)
        self.assertFalse(third["cached"])
        self.assertEqual(calls["terrain"], 2)

        def failing_transport(request, timeout):
            raise TimeoutError("upstream timeout")

        ephemeris = HorizonsEphemerisAdapter(transport=failing_transport, timeout_seconds=3.0)
        with self.assertRaises(AdapterError):
            ephemeris.query_ephemeris(0.0, 0.0, "2026-11-14T00:00:00Z")


if __name__ == "__main__":
    unittest.main()
