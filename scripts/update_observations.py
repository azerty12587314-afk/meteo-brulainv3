#!/usr/bin/env python3
"""Fetch a small set of nearby METAR observations for the static site."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests


API = "https://aviationweather.gov/api/data/metar"
STATIONS = {
    "LFBN": "Niort–Marais Poitevin",
    "LFBH": "La Rochelle–Île de Ré",
    "LFBI": "Poitiers–Biard",
}


def main() -> int:
    response = requests.get(
        API,
        params={
            "ids": ",".join(STATIONS),
            "format": "json",
            "taf": "false",
            "hours": "3",
        },
        headers={
            "User-Agent": (
                "Meteo-Lab observation cache "
                "(GitHub Pages personal weather dashboard)"
            )
        },
        timeout=60,
    )

    if response.status_code == 204:
        records = []
    else:
        response.raise_for_status()
        records = response.json()

    stations = []
    for record in records:
        icao = record.get("icaoId") or record.get("stationId")
        stations.append({
            "icaoId": icao,
            "name": STATIONS.get(icao, icao),
            "reportTime": record.get("reportTime") or record.get("obsTime"),
            "temp": record.get("temp"),
            "dewp": record.get("dewp"),
            "wdir": record.get("wdir"),
            "wspd": record.get("wspd"),
            "visib": record.get("visib"),
            "altim": record.get("altim"),
            "rawOb": record.get("rawOb"),
        })

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "stations": stations,
    }

    output = Path("observations/metar.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
