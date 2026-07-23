#!/usr/bin/env python3
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "maps" / "manifest.json"

def main() -> None:
    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except Exception:
        data = {"models": {}}
    data["generatedAt"] = datetime.now(timezone.utc).isoformat()
    data.setdefault("note", "Manifest actualisé. Les cartes sont conservées si aucun moteur de rendu n'est configuré.")
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Manifest actualisé: {MANIFEST}")

if __name__ == "__main__":
    main()
