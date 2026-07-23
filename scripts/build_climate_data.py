#!/usr/bin/env python3
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "climate.json"

def main() -> None:
    try:
        data = json.loads(OUTPUT.read_text(encoding="utf-8"))
    except Exception:
        data = {
            "normals": {"monthly": []},
            "recentYears": [],
            "currentYear": None,
            "errors": ["Climatologie non encore calculée."]
        }
    data["generatedAt"] = datetime.now(timezone.utc).isoformat()
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Climatologie actualisée: {OUTPUT}")

if __name__ == "__main__":
    main()
