"""Download the NAIF SPICE kernels required by the backend into ``backend/kernels/``.

Usage: ``python scripts/download_kernels.py``
"""
from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

BASE = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
KERNELS: dict[str, str] = {
    "de421.bsp": f"{BASE}/spk/planets/a_old_versions/de421.bsp",
    "moon_080317.tf": f"{BASE}/fk/satellites/moon_080317.tf",
    "pck00008.tpc": f"{BASE}/pck/a_old_versions/pck00008.tpc",
    "moon_pa_de421_1900-2050.bpc": f"{BASE}/pck/moon_pa_de421_1900-2050.bpc",
}
FALLBACKS: dict[str, list[str]] = {
    "de421.bsp": [f"{BASE}/spk/planets/de421.bsp"],
    "moon_080317.tf": [f"{BASE}/fk/satellites/moon_080317.tf"],
    "pck00008.tpc": [f"{BASE}/pck/pck00008.tpc"],
    "moon_pa_de421_1900-2050.bpc": [f"{BASE}/pck/moon_pa_de421_1900-2050.bpc"],
}

KERNEL_DIR = Path(__file__).resolve().parents[1] / "kernels"


def download(name: str) -> None:
    target = KERNEL_DIR / name
    if target.exists() and target.stat().st_size > 0:
        print(f"[skip] {name}")
        return
    for url in [KERNELS[name], *FALLBACKS.get(name, [])]:
        try:
            print(f"[get ] {url}")
            tmp = target.with_suffix(target.suffix + ".part")
            urllib.request.urlretrieve(url, tmp)
            tmp.replace(target)
            print(f"[ ok ] {name} ({target.stat().st_size} bytes)")
            return
        except Exception as exc:  # noqa: BLE001
            print(f"[fail] {url}: {exc}")
    raise SystemExit(f"Could not download {name}")


def main() -> int:
    KERNEL_DIR.mkdir(parents=True, exist_ok=True)
    for name in KERNELS:
        download(name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
