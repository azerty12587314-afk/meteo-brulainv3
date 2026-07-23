#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILE = ROOT / "data" / "climate.json"

def main() -> int:
    try:
        data = json.loads(FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"climate.json absent ou invalide : {exc}", file=sys.stderr)
        return 1

    monthly = data.get("normals", {}).get("monthly", [])
    recent = data.get("recentYears", [])
    current = data.get("currentYear")
    records = data.get("records", {})

    errors = []
    if len(monthly) != 12:
        errors.append("les normales ne contiennent pas 12 mois")
    if not recent:
        errors.append("recentYears est vide")
    if not isinstance(current, dict) or not current.get("monthly"):
        errors.append("currentYear est absent")
    if not any(records.values()):
        errors.append("records est vide")

    if errors:
        for error in errors:
            print(f"Erreur : {error}", file=sys.stderr)
        return 1

    print(
        f"Validation réussie : 12 mois, {len(recent)} années récentes, "
        f"année courante {current.get('year')}."
    )
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
