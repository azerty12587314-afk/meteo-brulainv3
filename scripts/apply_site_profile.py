#!/usr/bin/env python3
"""Applique config/site.json aux fichiers statiques du portail météo.

Usage : python scripts/apply_site_profile.py
Le fichier config/site.json devient l'unique point à modifier pour déployer
le portail dans une autre ville.
"""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROFILE_FILE = ROOT / "config" / "site.json"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def replace_required(text: str, pattern: str, replacement: str, label: str, flags=0) -> str:
    updated, count = re.subn(pattern, replacement, text, flags=flags)
    if count == 0:
        raise RuntimeError(f"Impossible de mettre à jour {label}")
    return updated


def main() -> None:
    profile = json.loads(PROFILE_FILE.read_text(encoding="utf-8"))
    site = profile["site"]
    loc = profile["location"]
    maps = profile.get("maps", {})
    obs = profile.get("observations", {})

    name = str(loc["name"])
    lat = float(loc["latitude"])
    lon = float(loc["longitude"])
    tz = str(loc.get("timezone") or "Europe/Paris")
    insee = str(loc.get("insee") or "")

    # Source commune pour les workflows Python.
    location_payload = {
        "name": name,
        "latitude": lat,
        "longitude": lon,
        "timezone": tz,
        "insee": insee or None,
    }
    write("data/location.json", json.dumps(location_payload, ensure_ascii=False, indent=2) + "\n")

    # Configuration météo principale.
    text = read("js/config.js")
    text = replace_required(text, r"name: '[^']*',\n\s*latitude: [-0-9.]+,\n\s*longitude: [-0-9.]+,\n\s*timezone: '[^']*'", f"name: {name!r},\n    latitude: {lat},\n    longitude: {lon},\n    timezone: {tz!r}", "js/config.js")
    text = replace_required(text, r"appName: '[^']*'", f"appName: {site.get('name', name)!r}", "nom de l'application")
    write("js/config.js", text)

    # Observations.
    text = read("js/observations-config.js")
    text = replace_required(text, r"name: '[^']*',\n\s*latitude: [-0-9.]+,\n\s*longitude: [-0-9.]+,\n\s*timezone: '[^']*'", f"name: {name!r},\n    latitude: {lat},\n    longitude: {lon},\n    timezone: {tz!r}", "js/observations-config.js")
    stations = obs.get("metarStations") or []
    station_js = ",\n".join(f"    {{ id: {str(s['id'])!r}, name: {str(s['name'])!r} }}" for s in stations)
    text = replace_required(text, r"metarStations:\s*\[[\s\S]*?\n\s*\],", f"metarStations: [\n{station_js}\n  ],", "stations METAR")
    if obs.get("lightningPageUrl"):
        text = replace_required(text, r"lightningPageUrl: '[^']*'", f"lightningPageUrl: {str(obs['lightningPageUrl'])!r}", "URL foudre")
    write("js/observations-config.js", text)

    # Cadrages cartographiques locaux.
    text = read("js/interactive-map.js")
    text = replace_required(text, r"local: \{ center: \[[^\]]+\], zoom: \d+ \}", f"local: {{ center: [{lat}, {lon}], zoom: {int(maps.get('interactiveZoom', 11))} }}", "carte interactive")
    write("js/interactive-map.js", text)

    text = read("js/europe-maps.js")
    text = replace_required(text, r"const BRULAIN_VIEW = \{ center: \[[^\]]+\], zoom: \d+ \};", f"const BRULAIN_VIEW = {{ center: [{lat}, {lon}], zoom: {int(maps.get('radarZoom', 8))} }};", "radar local")
    write("js/europe-maps.js", text)

    text = read("js/surveillance-center.js")
    text = replace_required(text, r"local:\{c:\[[^\]]+\],z:\d+\}", f"local:{{c:[{lat},{lon}],z:{int(maps.get('surveillanceZoom', 10))}}}", "centre de surveillance")
    write("js/surveillance-center.js", text)

    # Libellés et métadonnées visibles.
    text = read("index.html")
    text = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{site.get("description", "Tableau de bord météo pour " + name)}">', text)
    text = re.sub(r'<p id="location">[^<]*</p>', f'<p id="location">{name}</p>', text)
    text = text.replace('📍 Brûlain', f'📍 {name}').replace('>Brûlain</button>', f'>{name}</button>')
    text = text.replace('pour Brûlain.', f'pour {name}.').replace('autour de Brûlain', f'autour de {name}')
    text = re.sub(r'<footer>\s*<p>.*?</p>\s*</footer>', f'<footer>\n<p>{site.get("footer", "Météo Lab © 2026")}</p>\n</footer>', text, flags=re.S)
    write("index.html", text)

    # Manifest PWA.
    manifest_path = ROOT / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["name"] = site.get("name", f"Météo {name}")
        manifest["short_name"] = site.get("shortName", name)
        manifest["description"] = site.get("description", f"Tableau de bord météo pour {name}.")
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Profil appliqué : {name} ({lat}, {lon})")
    print("Lance ensuite les workflows de données/climatologie pour régénérer les JSON locaux.")


if __name__ == "__main__":
    main()
