#!/usr/bin/env python3
"""Construit data/climate.json à partir des archives Open-Meteo."""

from __future__ import annotations

import json
import math
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from statistics import fmean
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
LOCATION_FILE = ROOT / "data" / "location.json"
OUTPUT_FILE = ROOT / "data" / "climate.json"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
NORMAL_START = date(1991, 1, 1)
NORMAL_END = date(2020, 12, 31)
RECENT_YEAR_COUNT = 10
USER_AGENT = "Meteo-Lab-Climate-Center/2.0"

DAILY_FIELDS = [
    "temperature_2m_mean",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "sunshine_duration",
    "wind_gusts_10m_max",
    "et0_fao_evapotranspiration",
]

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT})


def finite(value: Any) -> bool:
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


def number(value: Any) -> float | None:
    return float(value) if finite(value) else None


def round_or_none(value: float | None, digits: int = 1) -> float | None:
    return round(value, digits) if value is not None and math.isfinite(value) else None


def load_location() -> dict[str, Any]:
    try:
        data = json.loads(LOCATION_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RuntimeError(f"Impossible de lire {LOCATION_FILE}: {exc}") from exc

    lat = number(data.get("latitude"))
    lon = number(data.get("longitude"))
    if lat is None or lon is None or not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        raise ValueError("Coordonnées invalides dans data/location.json")

    return {
        "name": str(data.get("name") or "Localisation"),
        "latitude": lat,
        "longitude": lon,
        "timezone": str(data.get("timezone") or "Europe/Paris"),
        "insee": data.get("insee"),
    }


def request_json(params: dict[str, Any], retries: int = 4) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            response = session.get(ARCHIVE_URL, params=params, timeout=180)
            response.raise_for_status()
            payload = response.json()
            if payload.get("error"):
                raise RuntimeError(payload.get("reason") or "Erreur Open-Meteo")
            return payload
        except Exception as exc:
            last_error = exc
            if attempt + 1 < retries:
                time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"Échec de l'appel Open-Meteo: {last_error}")


def fetch_period(location: dict[str, Any], start: date, end: date) -> list[dict[str, Any]]:
    params = {
        "latitude": location["latitude"],
        "longitude": location["longitude"],
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "daily": ",".join(DAILY_FIELDS),
        "timezone": location["timezone"],
        "temperature_unit": "celsius",
        "wind_speed_unit": "kmh",
        "precipitation_unit": "mm",
        "cell_selection": "land",
    }
    payload = request_json(params)
    daily = payload.get("daily") or {}
    times = daily.get("time") or []
    if not times:
        raise RuntimeError(f"Aucune donnée reçue du {start} au {end}")

    rows: list[dict[str, Any]] = []
    for index, day_text in enumerate(times):
        row: dict[str, Any] = {"date": day_text}
        for field in DAILY_FIELDS:
            values = daily.get(field) or []
            row[field] = values[index] if index < len(values) else None
        rows.append(row)
    return rows


def chunks(start: date, end: date, years: int = 10):
    cursor = start
    while cursor <= end:
        try:
            chunk_end = cursor.replace(year=cursor.year + years) - timedelta(days=1)
        except ValueError:
            chunk_end = cursor.replace(month=2, day=28, year=cursor.year + years) - timedelta(days=1)
        chunk_end = min(chunk_end, end)
        yield cursor, chunk_end
        cursor = chunk_end + timedelta(days=1)


def fetch_all(location: dict[str, Any], start: date, end: date) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for chunk_start, chunk_end in chunks(start, end):
        print(f"Téléchargement {chunk_start} → {chunk_end}")
        rows.extend(fetch_period(location, chunk_start, chunk_end))
    return rows


def values(rows: list[dict[str, Any]], key: str) -> list[float]:
    return [float(row[key]) for row in rows if finite(row.get(key))]


def total(rows: list[dict[str, Any]], key: str) -> float | None:
    data = values(rows, key)
    return sum(data) if data else None


def mean(rows: list[dict[str, Any]], key: str) -> float | None:
    data = values(rows, key)
    return fmean(data) if data else None


def annual_summary(year: int, rows: list[dict[str, Any]]) -> dict[str, Any]:
    temp_mean = mean(rows, "temperature_2m_mean")
    precipitation = total(rows, "precipitation_sum")
    sunshine_seconds = total(rows, "sunshine_duration")
    evapotranspiration = total(rows, "et0_fao_evapotranspiration")

    frost_days = sum(
        1 for row in rows
        if finite(row.get("temperature_2m_min")) and float(row["temperature_2m_min"]) < 0
    )
    hot_days = sum(
        1 for row in rows
        if finite(row.get("temperature_2m_max")) and float(row["temperature_2m_max"]) >= 30
    )
    tropical_nights = sum(
        1 for row in rows
        if finite(row.get("temperature_2m_min")) and float(row["temperature_2m_min"]) >= 20
    )
    heating_degree_days = sum(
        max(0.0, 18.0 - float(row["temperature_2m_mean"]))
        for row in rows
        if finite(row.get("temperature_2m_mean"))
    )

    monthly: list[dict[str, Any]] = []
    by_month: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_month[date.fromisoformat(row["date"]).month].append(row)

    for month in range(1, 13):
        month_rows = by_month.get(month, [])
        monthly.append({
            "month": month,
            "temperatureMean": round_or_none(mean(month_rows, "temperature_2m_mean")),
            "temperatureMax": round_or_none(mean(month_rows, "temperature_2m_max")),
            "temperatureMin": round_or_none(mean(month_rows, "temperature_2m_min")),
            "precipitation": round_or_none(total(month_rows, "precipitation_sum")),
        })

    return {
        "year": year,
        "daysAvailable": len(rows),
        "temperatureMean": round_or_none(temp_mean),
        "precipitation": round_or_none(precipitation),
        "sunshineHours": round_or_none(
            sunshine_seconds / 3600 if sunshine_seconds is not None else None
        ),
        "evapotranspiration": round_or_none(evapotranspiration),
        "frostDays": frost_days,
        "hotDays": hot_days,
        "tropicalNights": tropical_nights,
        "heatingDegreeDays": round_or_none(heating_degree_days, 0),
        "monthly": monthly,
    }


def build_normals(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_month: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_month[date.fromisoformat(row["date"]).month].append(row)

    monthly: list[dict[str, Any]] = []
    for month in range(1, 13):
        month_rows = by_month.get(month, [])
        if not month_rows:
            raise RuntimeError(f"Normale manquante pour le mois {month}")

        # Précipitations normales mensuelles : moyenne des cumuls annuels du mois.
        by_year: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for row in month_rows:
            by_year[date.fromisoformat(row["date"]).year].append(row)
        precip_years = [
            total(year_rows, "precipitation_sum")
            for year_rows in by_year.values()
        ]
        precip_years = [value for value in precip_years if value is not None]

        monthly.append({
            "month": month,
            "temperatureMean": round_or_none(mean(month_rows, "temperature_2m_mean")),
            "temperatureMax": round_or_none(mean(month_rows, "temperature_2m_max")),
            "temperatureMin": round_or_none(mean(month_rows, "temperature_2m_min")),
            "precipitation": round_or_none(fmean(precip_years) if precip_years else None),
        })
    return monthly


def record(rows: list[dict[str, Any]], key: str, highest: bool = True) -> dict[str, Any] | None:
    candidates = [
        (float(row[key]), row["date"])
        for row in rows
        if finite(row.get(key))
    ]
    if not candidates:
        return None
    value, day = (max(candidates) if highest else min(candidates))
    return {"value": round(value, 1), "date": day, "estimated": True}


def main() -> int:
    location = load_location()

    # Les archives récentes peuvent avoir quelques jours de retard.
    archive_end = datetime.now(timezone.utc).date() - timedelta(days=7)
    history_start = NORMAL_START
    if archive_end < NORMAL_END:
        raise RuntimeError("Date d'archive incohérente")

    rows = fetch_all(location, history_start, archive_end)
    normal_rows = [
        row for row in rows
        if NORMAL_START <= date.fromisoformat(row["date"]) <= NORMAL_END
    ]

    by_year: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_year[date.fromisoformat(row["date"]).year].append(row)

    current_year = archive_end.year
    recent_years = [
        annual_summary(year, by_year[year])
        for year in range(max(1991, current_year - RECENT_YEAR_COUNT), current_year)
        if by_year.get(year)
    ]

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "name": "Open-Meteo Historical Weather API",
            "model": "best_match",
            "archiveEnd": archive_end.isoformat(),
        },
        "location": location,
        "normalPeriod": "1991-2020",
        "normals": {"monthly": build_normals(normal_rows)},
        "currentYear": annual_summary(current_year, by_year.get(current_year, [])),
        "recentYears": recent_years,
        "records": {
            "highestTemperature": record(rows, "temperature_2m_max", True),
            "lowestTemperature": record(rows, "temperature_2m_min", False),
            "wettestDay": record(rows, "precipitation_sum", True),
            "strongestGust": record(rows, "wind_gusts_10m_max", True),
        },
        "errors": [],
    }

    if len(payload["normals"]["monthly"]) != 12:
        raise RuntimeError("Les 12 normales mensuelles n'ont pas été calculées")
    if not payload["recentYears"]:
        raise RuntimeError("Aucune année récente calculée")

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT_FILE.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(OUTPUT_FILE)
    print(f"Climatologie générée : {OUTPUT_FILE}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERREUR : {exc}", file=sys.stderr)
        raise
