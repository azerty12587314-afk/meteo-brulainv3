#!/usr/bin/env python3
"""Create one same-origin observation cache for GitHub Pages.

Each provider is isolated: a failure is recorded in `errors` without preventing
the other observations from being published.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


LOCATION = {
    "name": "Brûlain",
    "latitude": 46.2025,
    "longitude": -0.3297,
}

AIR_API = "https://air-quality-api.open-meteo.com/v1/air-quality"
HYDRO_STATIONS_API = (
    "https://hubeau.eaufrance.fr/api/v2/"
    "hydrometrie/referentiel/stations"
)
HYDRO_OBSERVATIONS_API = (
    "https://hubeau.eaufrance.fr/api/v2/"
    "hydrometrie/observations_tr"
)
METAR_API = "https://aviationweather.gov/api/data/metar"

METAR_STATIONS = {
    "LFBN": "Niort–Marais Poitevin",
    "LFBH": "La Rochelle–Île de Ré",
    "LFBI": "Poitiers–Biard",
}

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": (
        "Meteo-Lab-V11.1 observation cache "
        "(personal non-commercial weather dashboard)"
    )
})


def get_json(url: str, params: dict[str, Any], timeout: int = 60) -> Any:
    response = SESSION.get(url, params=params, timeout=timeout)
    if response.status_code == 204:
        return []
    response.raise_for_status()
    return response.json()


def fetch_air() -> dict[str, Any]:
    variables = [
        "european_aqi",
        "pm10",
        "pm2_5",
        "nitrogen_dioxide",
        "ozone",
        "uv_index",
        "grass_pollen",
        "birch_pollen",
        "alder_pollen",
        "mugwort_pollen",
        "ragweed_pollen",
    ]

    payload = get_json(
        AIR_API,
        {
            "latitude": LOCATION["latitude"],
            "longitude": LOCATION["longitude"],
            "timezone": "Europe/Paris",
            "forecast_hours": 36,
            "current": ",".join(variables),
            "hourly": ",".join(variables),
        },
    )

    return {
        "current": payload.get("current", {}),
        "currentUnits": payload.get("current_units", {}),
        "hourly": payload.get("hourly", {}),
        "hourlyUnits": payload.get("hourly_units", {}),
    }


def station_coordinates(station: dict[str, Any]) -> tuple[float | None, float | None]:
    latitude = (
        station.get("latitude_station")
        or station.get("latitude")
        or (station.get("coordonnees") or {}).get("latitude")
    )
    longitude = (
        station.get("longitude_station")
        or station.get("longitude")
        or (station.get("coordonnees") or {}).get("longitude")
    )

    try:
        return float(latitude), float(longitude)
    except (TypeError, ValueError):
        return None, None


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    value = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1)
        * math.cos(phi2)
        * math.sin(delta_lambda / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def latest_reading(code: str) -> dict[str, Any] | None:
    for quantity in ("H", "Q"):
        payload = get_json(
            HYDRO_OBSERVATIONS_API,
            {
                "code_entite": code,
                "grandeur_hydro": quantity,
                "size": 1,
                "fields": (
                    "code_station,date_obs,resultat_obs,"
                    "grandeur_hydro"
                ),
            },
        )
        record = (payload.get("data") or [None])[0]
        if record:
            return {
                "quantity": quantity,
                "date": record.get("date_obs"),
                "value": record.get("resultat_obs"),
            }
    return None


def fetch_rivers() -> list[dict[str, Any]]:
    radius = 0.8
    bbox = ",".join(map(str, [
        LOCATION["longitude"] - radius,
        LOCATION["latitude"] - radius,
        LOCATION["longitude"] + radius,
        LOCATION["latitude"] + radius,
    ]))

    payload = get_json(
        HYDRO_STATIONS_API,
        {
            "bbox": bbox,
            "size": 100,
            "format": "json",
        },
    )

    stations: list[dict[str, Any]] = []
    for station in payload.get("data", []):
        latitude, longitude = station_coordinates(station)
        if latitude is None or longitude is None:
            continue

        code = (
            station.get("code_station")
            or station.get("code_entite")
            or station.get("code_station_hydro")
        )
        if not code:
            continue

        stations.append({
            "code": code,
            "name": (
                station.get("libelle_station")
                or station.get("libelle_site")
                or station.get("nom_station")
                or code
            ),
            "latitude": latitude,
            "longitude": longitude,
            "distanceKm": distance_km(
                LOCATION["latitude"],
                LOCATION["longitude"],
                latitude,
                longitude,
            ),
        })

    stations.sort(key=lambda item: item["distanceKm"])
    result = []

    for station in stations[:8]:
        try:
            station["reading"] = latest_reading(station["code"])
        except Exception as exc:  # provider can be partially unavailable
            station["reading"] = None
            station["readingError"] = str(exc)
        result.append(station)

    return result


def fetch_metar() -> list[dict[str, Any]]:
    records = get_json(
        METAR_API,
        {
            "ids": ",".join(METAR_STATIONS),
            "format": "json",
            "taf": "false",
            "hours": 3,
        },
    )

    result = []
    for record in records:
        station_id = record.get("icaoId") or record.get("stationId")
        result.append({
            "icaoId": station_id,
            "name": METAR_STATIONS.get(station_id, station_id),
            "reportTime": record.get("reportTime") or record.get("obsTime"),
            "temp": record.get("temp"),
            "dewp": record.get("dewp"),
            "wdir": record.get("wdir"),
            "wspd": record.get("wspd"),
            "visib": record.get("visib"),
            "altim": record.get("altim"),
            "rawOb": record.get("rawOb"),
        })
    return result


def main() -> int:
    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "location": LOCATION,
        "air": None,
        "rivers": [],
        "metar": [],
        "errors": [],
    }

    providers = [
        ("air", fetch_air),
        ("rivers", fetch_rivers),
        ("metar", fetch_metar),
    ]

    for name, function in providers:
        try:
            output[name] = function()
        except Exception as exc:
            message = f"{name}: {type(exc).__name__}: {exc}"
            print(message)
            output["errors"].append(message)

    path = Path("observations/data.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(json.dumps(output, ensure_ascii=False, indent=2))
    # The workflow succeeds when at least one provider succeeded.
    return 0 if any([
        output["air"],
        output["rivers"],
        output["metar"],
    ]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
