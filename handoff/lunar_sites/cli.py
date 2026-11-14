"""CLI validator and catalog release helper for CI and local verification."""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
from pathlib import Path
from typing import Sequence

from .catalog import (
    CROSS_CHECK_PATH,
    DATASET_PATH,
    FIELD_NAMES,
    SITES_PATH,
    cross_check_catalog,
    export_csv,
    export_json,
    freeze_catalog,
    load_cross_checks,
    load_dataset,
    load_sites,
    validate_catalog,
)


def _verify_exports(records: list[dict]) -> None:
    json_records = json.loads(export_json(records))
    csv_rows = list(csv.DictReader(io.StringIO(export_csv(records))))
    if len(json_records) != len(records) or len(csv_rows) != len(records):
        raise ValueError("JSON/CSV export record counts do not match catalog")
    if csv_rows and tuple(csv_rows[0]) != FIELD_NAMES:
        raise ValueError("CSV export header does not match canonical FIELD_NAMES")


def _cmd_validate(args: argparse.Namespace) -> int:
    dataset = load_dataset(Path(args.dataset))
    records = load_sites(Path(args.sites))
    validate_catalog(records)
    _verify_exports(records)
    print(
        f"OK: validated {len(records)} records "
        f"(version={dataset['version']}, updated={dataset['updated']})"
    )
    return 0


def _cmd_cross_check(args: argparse.Namespace) -> int:
    records = load_sites(Path(args.sites))
    validate_catalog(records)
    cross_checks = load_cross_checks(Path(args.cross_checks))
    report = cross_check_catalog(records, cross_checks=cross_checks, tolerance_km=args.tolerance_km)
    max_distance = max((item["distance_km"] for item in report), default=0.0)
    print(
        f"OK: cross-checked {len(report)} records against {args.cross_checks} "
        f"(max_distance_km={max_distance:.4f}, tolerance_km={args.tolerance_km:.4f})"
    )
    return 0


def _cmd_freeze(args: argparse.Namespace) -> int:
    staging_records = load_sites(Path(args.input))
    dataset = load_dataset(Path(args.dataset))
    if args.version:
        dataset["version"] = args.version
    if args.updated:
        dataset["updated"] = args.updated
    normalized, updated_dataset = freeze_catalog(
        staging_records,
        dataset,
        sites_path=Path(args.sites),
        dataset_path=Path(args.dataset),
    )
    _verify_exports(normalized)
    print(
        f"OK: froze {len(normalized)} records to {args.sites} "
        f"(version={updated_dataset['version']}, updated={updated_dataset['updated']})"
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="lunar-sites",
        description="Validate, cross-check, and freeze canonical lunar landing-site catalogs.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate_parser = subparsers.add_parser("validate", help="Validate catalog schema and exports.")
    validate_parser.add_argument("--sites", default=str(SITES_PATH), help="Path to sites.json")
    validate_parser.add_argument("--dataset", default=str(DATASET_PATH), help="Path to dataset.json")
    validate_parser.set_defaults(func=_cmd_validate)

    check_parser = subparsers.add_parser("cross-check", help="Cross-check catalog coordinates against secondary sources.")
    check_parser.add_argument("--sites", default=str(SITES_PATH), help="Path to sites.json")
    check_parser.add_argument("--cross-checks", default=str(CROSS_CHECK_PATH), help="Path to cross_check_sources.json")
    check_parser.add_argument("--tolerance-km", type=float, default=1.0, help="Distance tolerance in km")
    check_parser.set_defaults(func=_cmd_cross_check)

    freeze_parser = subparsers.add_parser("freeze", help="Normalize and freeze a staging catalog.")
    freeze_parser.add_argument("--input", required=True, help="Path to staging records JSON array")
    freeze_parser.add_argument("--sites", default=str(SITES_PATH), help="Output path for frozen sites.json")
    freeze_parser.add_argument("--dataset", default=str(DATASET_PATH), help="Path to dataset.json")
    freeze_parser.add_argument("--version", help="Override dataset version")
    freeze_parser.add_argument("--updated", help="Override dataset updated date (YYYY-MM-DD)")
    freeze_parser.set_defaults(func=_cmd_freeze)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
