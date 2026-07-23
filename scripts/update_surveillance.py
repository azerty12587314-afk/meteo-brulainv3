#!/usr/bin/env python3
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
LOCATION_FILE = ROOT / "data" / "location.json"
OUTPUT = ROOT / "surveillance" / "data.json"

def main() -> None:
    location = json.loads(LOCATION_FILE.read_text(encoding="utf-8"))
    lat = location["latitude"]
    lon = location["longitude"]

    params = {
        "latitude": lat,
        "longitude": lon,
        "current": ",".join([
            "temperature_2m", "relative_humidity_2m", "precipitation",
            "wind_speed_10m", "wind_gusts_10m", "surface_pressure"
        ]),
        "timezone": "Europe/Paris",
    }

    errors = []
    weather = None
    try:
        response = requests.get("https://api.open-meteo.com/v1/forecast", params=params, timeout=30)
        response.raise_for_status()
        weather = response.json()
    except Exception as exc:
        errors.append(f"Météo: {exc}")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "location": location,
        "radar": {"provider": "RainViewer", "status": "client-side"},
        "weather": weather,
        "alerts": [],
        "providers": {
            "radar": {"status": "ok"},
            "weather": {"status": "ok" if weather else "error"},
        },
        "errors": errors,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Écrit: {OUTPUT}")

if __name__ == "__main__":
    main()
