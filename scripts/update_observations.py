#!/usr/bin/env python3
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
LOCATION_FILE = ROOT / "data" / "location.json"
OUTPUT = ROOT / "observations" / "data.json"

def main() -> None:
    location = json.loads(LOCATION_FILE.read_text(encoding="utf-8"))
    lat = location["latitude"]
    lon = location["longitude"]
    errors = []

    air = None
    try:
        response = requests.get(
            "https://air-quality-api.open-meteo.com/v1/air-quality",
            params={
                "latitude": lat, "longitude": lon,
                "current": "european_aqi,pm10,pm2_5,alder_pollen,birch_pollen,grass_pollen",
                "timezone": "Europe/Paris",
            },
            timeout=30,
        )
        response.raise_for_status()
        air = response.json()
    except Exception as exc:
        errors.append(f"Air: {exc}")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "location": location,
        "air": air,
        "rivers": [],
        "metar": [],
        "errors": errors,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Écrit: {OUTPUT}")

if __name__ == "__main__":
    main()
