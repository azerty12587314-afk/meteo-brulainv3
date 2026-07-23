#!/usr/bin/env python3
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def load_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback

def main() -> None:
    observations = load_json(ROOT / "observations" / "data.json", {})
    surveillance = load_json(ROOT / "surveillance" / "data.json", {})
    water = load_json(ROOT / "data" / "water-restrictions.json", {})

    providers = {
        "weather": {"status": "ok" if surveillance.get("weather") else "error",
                    "updatedAt": surveillance.get("generatedAt"),
                    "message": None if surveillance.get("weather") else "Données météo indisponibles"},
        "radar": {"status": "ok" if surveillance.get("radar") else "error",
                  "updatedAt": surveillance.get("generatedAt"),
                  "message": None if surveillance.get("radar") else "Radar indisponible"},
        "air": {"status": "ok" if observations.get("air") else "error",
                "updatedAt": observations.get("generatedAt"),
                "message": None if observations.get("air") else "Air indisponible"},
        "rivers": {"status": "ok" if observations.get("rivers") else "error",
                   "updatedAt": observations.get("generatedAt"),
                   "message": None if observations.get("rivers") else "Rivières indisponibles"},
        "metar": {"status": "ok" if observations.get("metar") else "error",
                  "updatedAt": observations.get("generatedAt"),
                  "message": None if observations.get("metar") else "METAR indisponible"},
        "water": {"status": "ok" if water.get("generatedAt") else "error",
                  "updatedAt": water.get("generatedAt"),
                  "message": None if water.get("generatedAt") else "VigiEau indisponible"},
    }

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "providers": providers,
        "observations": observations,
        "surveillance": surveillance,
        "waterRestrictions": water,
    }
    output = ROOT / "data" / "site-data.json"
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Écrit: {output}")

if __name__ == "__main__":
    main()
