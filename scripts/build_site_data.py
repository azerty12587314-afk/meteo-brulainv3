#!/usr/bin/env python3
"""Build one static JSON cache for the weather portal.

Every provider is isolated. A failing provider is recorded but does not prevent
the remaining data from being committed.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import requests


ROOT = Path(__file__).resolve().parents[1]
LOCATION = json.loads((ROOT / "data" / "location.json").read_text(encoding="utf-8"))

FORECAST_API = "https://api.open-meteo.com/v1/forecast"
AIR_API = "https://air-quality-api.open-meteo.com/v1/air-quality"
RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json"
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
        "Meteo-Lab-V12 static data builder "
        "(personal non-commercial weather dashboard)"
    )
})


def get_json(url: str, params: dict[str, Any] | None = None, timeout: int = 90) -> Any:
    response = SESSION.get(url, params=params, timeout=timeout)
    if response.status_code == 204:
        return []
    response.raise_for_status()
    return response.json()


def fetch_weather() -> dict[str, Any]:
    return get_json(
        FORECAST_API,
        {
            "latitude": LOCATION["latitude"],
            "longitude": LOCATION["longitude"],
            "timezone": LOCATION["timezone"],
            "forecast_days": 10,
            "current": ",".join([
                "temperature_2m",
                "relative_humidity_2m",
                "apparent_temperature",
                "precipitation",
                "weather_code",
                "cloud_cover",
                "surface_pressure",
                "wind_speed_10m",
                "wind_direction_10m",
                "wind_gusts_10m",
            ]),
            "hourly": ",".join([
                "temperature_2m",
                "relative_humidity_2m",
                "precipitation_probability",
                "precipitation",
                "weather_code",
                "cloud_cover",
                "surface_pressure",
                "wind_speed_10m",
                "wind_direction_10m",
                "wind_gusts_10m",
                "cape",
            ]),
            "daily": ",".join([
                "weather_code",
                "temperature_2m_max",
                "temperature_2m_min",
                "precipitation_probability_max",
                "precipitation_sum",
                "wind_gusts_10m_max",
                "sunrise",
                "sunset",
                "uv_index_max",
            ]),
        },
    )


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
            "timezone": LOCATION["timezone"],
            "forecast_hours": 48,
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


def fetch_radar() -> dict[str, Any]:
    payload = get_json(RAINVIEWER_API)
    return {
        "host": payload.get("host"),
        "generated": payload.get("generated"),
        "radar": payload.get("radar", {}),
        "satellite": payload.get("satellite", {}),
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
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    value = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
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
                "fields": "code_station,date_obs,resultat_obs,grandeur_hydro",
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
        {"bbox": bbox, "size": 100, "format": "json"},
    )

    stations: list[dict[str, Any]] = []
    for station in payload.get("data", []):
        latitude, longitude = station_coordinates(station)
        code = (
            station.get("code_station")
            or station.get("code_entite")
            or station.get("code_station_hydro")
        )
        if latitude is None or longitude is None or not code:
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
        except Exception as exc:
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


def run_provider(
    output: dict[str, Any],
    name: str,
    function: Callable[[], Any],
) -> None:
    started = datetime.now(timezone.utc)
    try:
        output[name] = function()
        output["providers"][name] = {
            "status": "ok",
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "durationSeconds": round(
                (datetime.now(timezone.utc) - started).total_seconds(), 2
            ),
        }
    except Exception as exc:
        output["providers"][name] = {
            "status": "error",
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "message": f"{type(exc).__name__}: {exc}",
        }
        output["errors"].append(f"{name}: {type(exc).__name__}: {exc}")


def main() -> int:
    output: dict[str, Any] = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "location": LOCATION,
        "providers": {},
        "weather": None,
        "air": None,
        "rivers": [],
        "metar": [],
        "radar": None,
        "errors": [],
    }

    for name, function in [
        ("weather", fetch_weather),
        ("air", fetch_air),
        ("radar", fetch_radar),
        ("rivers", fetch_rivers),
        ("metar", fetch_metar),
    ]:
        run_provider(output, name, function)

    path = Path("data/site-data.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # Keep the previous observation endpoint synchronized for compatibility.
    observation_path = Path("observations/data.json")
    observation_path.parent.mkdir(parents=True, exist_ok=True)
    observation_path.write_text(
        json.dumps({
            "generatedAt": output["generatedAt"],
            "location": output["location"],
            "air": output["air"],
            "rivers": output["rivers"],
            "metar": output["metar"],
            "errors": output["errors"],
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0 if any(
        provider.get("status") == "ok"
        for provider in output["providers"].values()
    ) else 1


if __name__ == "__main__":
    raise SystemExit(main())
