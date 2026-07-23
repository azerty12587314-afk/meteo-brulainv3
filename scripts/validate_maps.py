#!/usr/bin/env python3
from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "maps" / "manifest.json"

def main() -> int:
    if not MANIFEST.exists():
        print(f"Erreur : manifeste absent : {MANIFEST}", file=sys.stderr)
        return 1
    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"Erreur : manifeste JSON invalide : {exc}", file=sys.stderr)
        return 1
    models = data.get("models")
    if not isinstance(models, dict) or not models:
        print("Erreur : aucun modèle dans le manifeste.", file=sys.stderr)
        return 1
    total_frames = 0
    missing_files = []
    for model_name, model in models.items():
        variables = model.get("variables", {}) if isinstance(model, dict) else {}
        if not isinstance(variables, dict):
            continue
        for variable_name, variable in variables.items():
            frames = variable.get("frames", []) if isinstance(variable, dict) else []
            if not isinstance(frames, list):
                continue
            for frame in frames:
                image = frame.get("image") if isinstance(frame, dict) else None
                if not image:
                    continue
                total_frames += 1
                relative = image.removeprefix("./")
                if not (ROOT / relative).is_file():
                    missing_files.append(f"{model_name}/{variable_name}: {relative}")
    if total_frames == 0:
        print("Erreur : le manifeste ne contient aucune image.", file=sys.stderr)
        return 1
    if missing_files:
        print("Erreur : des images référencées sont absentes :", file=sys.stderr)
        for item in missing_files[:20]:
            print(f" - {item}", file=sys.stderr)
        return 1
    print(f"Validation réussie : {total_frames} image(s) référencée(s).")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
