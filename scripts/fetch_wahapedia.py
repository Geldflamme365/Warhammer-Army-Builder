#!/usr/bin/env python3
"""Download the Wahapedia Warhammer 40,000 10th-edition data export.

Wahapedia publishes a set of pipe-delimited CSV files linked by ids. We only
need the rules data that BSData does not ship (stratagems), plus a few lookup
tables for matching and attribution.

Data is free for non-commercial use; attribution to Wahapedia is required. See
the written `source.json` and the in-app credit.

Usage:
    python scripts/fetch_wahapedia.py
"""
from __future__ import annotations

import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT_DIR / ".cache" / "wahapedia"
BASE_URL = "https://wahapedia.ru/wh40k10ed"

# Files we pull. Stratagems are the payload; the rest are lookup/attribution.
FILES = [
    "Factions.csv",
    "Stratagems.csv",
    "Enhancements.csv",
    "Detachment_abilities.csv",
    "Source.csv",
]

USER_AGENT = "Mozilla/5.0 (compatible; warhammer-army-builder/0.1; data prep)"


def download(name: str) -> bytes:
    url = f"{BASE_URL}/{name}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310 (trusted host)
        if response.status != 200:
            raise RuntimeError(f"{url} returned HTTP {response.status}")
        return response.read()


def main() -> int:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading Wahapedia 10e export into {CACHE_DIR}")
    for name in FILES:
        try:
            data = download(name)
        except Exception as exc:  # pragma: no cover - network failure path
            print(f"  ! failed {name}: {exc}", file=sys.stderr)
            return 1
        (CACHE_DIR / name).write_bytes(data)
        print(f"  + {name} ({len(data):,} bytes)")

    source_meta = {
        "name": "Wahapedia Warhammer 40,000 10th Edition data export",
        "url": BASE_URL,
        "exportUrl": f"{BASE_URL}/the-rules/data-export/",
        "edition": "10",
        "attribution": "Data powered by Wahapedia (https://wahapedia.ru). "
        "Non-commercial use with attribution.",
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "files": FILES,
    }
    (CACHE_DIR / "source.json").write_text(
        json.dumps(source_meta, indent=2), encoding="utf-8"
    )
    print(f"  + source.json")
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
