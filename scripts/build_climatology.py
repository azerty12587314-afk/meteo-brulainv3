#!/usr/bin/env python3
"""Build a coarse 1991–2020 monthly temperature climatology.

Designed for GitHub Actions and the free Open-Meteo archive API:
- one geographic point per request;
- short five-year periods instead of one 30-year payload;
- exponential backoff for HTTP 429/5xx errors;
- progress checkpoint so a rerun can resume when the checkpoint is preserved.
"""

from __future__ import annotations

import argparse
import json
import random
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import requests

API_URL = "https://archive-api.open-meteo.com/v1/archive"
USER_AGENT = "Meteo-Lab-V8.1-Climatology/1.0"


@dataclass(frozen=True)
class Point:
    latitude: float
    longitude: float

    @property
    def key(self) -> str:
        return f"{self.latitude:.2f},{self.longitude:.2f}"


def float_range(start: float, stop: float, step: float) -> list[float]:
    values: list[float] = []
    current = start
    while current <= stop + step / 2:
        values.append(round(current, 6))
        current += step
    return values


def year_blocks(start_year: int, end_year: int, years_per_request: int):
    year = start_year
    while year <= end_year:
        block_end = min(end_year, year + years_per_request - 1)
        yield year, block_end
        year = block_end + 1


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary.replace(path)


def request_period(
    session: requests.Session,
    point: Point,
    start_year: int,
    end_year: int,
    max_retries: int,
) -> dict[str, Any]:
    params = {
        "latitude": point.latitude,
        "longitude": point.longitude,
        "start_date": f"{start_year}-01-01",
        "end_date": f"{end_year}-12-31",
        "daily": "temperature_2m_mean",
        "timezone": "UTC",
    }

    for attempt in range(max_retries):
        try:
            response = session.get(API_URL, params=params, timeout=180)

            if response.status_code == 429:
                retry_after = response.headers.get("Retry-After")
                if retry_after and retry_after.isdigit():
                    wait_seconds = max(15, int(retry_after))
                else:
                    wait_seconds = min(300, 30 * (2 ** attempt))
                wait_seconds += random.uniform(1, 5)
                print(
                    f"HTTP 429 pour {point.key} {start_year}-{end_year}; "
                    f"attente {wait_seconds:.0f} s",
                    flush=True,
                )
                time.sleep(wait_seconds)
                continue

            if response.status_code >= 500:
                wait_seconds = min(180, 10 * (2 ** attempt))
                print(
                    f"HTTP {response.status_code}; nouvelle tentative dans "
                    f"{wait_seconds} s",
                    flush=True,
                )
                time.sleep(wait_seconds)
                continue

            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict) or "daily" not in payload:
                raise RuntimeError("Réponse Open-Meteo inattendue")
            return payload

        except (requests.RequestException, ValueError, RuntimeError) as error:
            if attempt + 1 >= max_retries:
                raise RuntimeError(
                    f"Échec pour {point.key}, période {start_year}-{end_year}: "
                    f"{error}"
                ) from error
            wait_seconds = min(180, 10 * (2 ** attempt)) + random.uniform(0, 3)
            print(f"Erreur réseau: {error}; attente {wait_seconds:.0f} s", flush=True)
            time.sleep(wait_seconds)

    raise RuntimeError("Nombre maximal de tentatives dépassé")


def aggregate_payload(
    payload: dict[str, Any],
    sums: dict[str, float],
    counts: dict[str, int],
) -> None:
    daily = payload.get("daily", {})
    dates = daily.get("time", [])
    values = daily.get("temperature_2m_mean", [])

    for iso_date, value in zip(dates, values):
        if value is None:
            continue
        month = str(int(iso_date[5:7]))
        sums[month] = sums.get(month, 0.0) + float(value)
        counts[month] = counts.get(month, 0) + 1


def build_output(progress: dict[str, Any]) -> dict[str, Any]:
    months = {
        str(month): {"lats": [], "lons": [], "values": []}
        for month in range(1, 13)
    }

    for point_key, point_data in progress.get("points", {}).items():
        latitude = float(point_data["latitude"])
        longitude = float(point_data["longitude"])
        sums = point_data.get("sums", {})
        counts = point_data.get("counts", {})

        for month in range(1, 13):
            key = str(month)
            count = int(counts.get(key, 0))
            if count <= 0:
                continue
            months[key]["lats"].append(latitude)
            months[key]["lons"].append(longitude)
            months[key]["values"].append(float(sums[key]) / count)

    return {
        "period": "1991-2020",
        "variable": "temperature_2m_mean",
        "source": "Open-Meteo historical archive",
        "gridSpacingDegrees": progress.get("spacing"),
        "months": months,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        default="climatology/europe_t2m_monthly.json",
    )
    parser.add_argument(
        "--checkpoint",
        default="climatology/europe_t2m_progress.json",
    )
    parser.add_argument("--spacing", type=float, default=6.0)
    parser.add_argument("--years-per-request", type=int, default=5)
    parser.add_argument("--sleep", type=float, default=1.0)
    parser.add_argument("--max-retries", type=int, default=8)
    args = parser.parse_args()

    if args.spacing <= 0:
        raise SystemExit("--spacing doit être supérieur à zéro")
    if args.years_per_request <= 0:
        raise SystemExit("--years-per-request doit être supérieur à zéro")

    output_path = Path(args.output)
    checkpoint_path = Path(args.checkpoint)

    latitudes = float_range(30.0, 72.0, args.spacing)
    longitudes = float_range(-24.0, 48.0, args.spacing)
    points = [Point(lat, lon) for lat in latitudes for lon in longitudes]
    blocks = list(year_blocks(1991, 2020, args.years_per_request))

    progress = load_json(
        checkpoint_path,
        {
            "version": 1,
            "period": "1991-2020",
            "spacing": args.spacing,
            "yearsPerRequest": args.years_per_request,
            "points": {},
        },
    )

    # Reset an incompatible checkpoint instead of mixing two grids.
    if (
        progress.get("spacing") != args.spacing
        or progress.get("yearsPerRequest") != args.years_per_request
    ):
        progress = {
            "version": 1,
            "period": "1991-2020",
            "spacing": args.spacing,
            "yearsPerRequest": args.years_per_request,
            "points": {},
        }

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    total_tasks = len(points) * len(blocks)
    completed_before = sum(
        len(point_data.get("completedBlocks", []))
        for point_data in progress.get("points", {}).values()
    )
    completed = completed_before
    print(
        f"Grille: {len(points)} points, {len(blocks)} blocs par point, "
        f"{total_tasks} requêtes maximum. Reprise à {completed}/{total_tasks}.",
        flush=True,
    )

    for point_index, point in enumerate(points, start=1):
        point_data = progress.setdefault("points", {}).setdefault(
            point.key,
            {
                "latitude": point.latitude,
                "longitude": point.longitude,
                "completedBlocks": [],
                "sums": {},
                "counts": {},
            },
        )

        completed_blocks = set(point_data.get("completedBlocks", []))
        sums = point_data.setdefault("sums", {})
        counts = point_data.setdefault("counts", {})

        for start_year, end_year in blocks:
            block_key = f"{start_year}-{end_year}"
            if block_key in completed_blocks:
                continue

            payload = request_period(
                session,
                point,
                start_year,
                end_year,
                args.max_retries,
            )
            aggregate_payload(payload, sums, counts)
            point_data.setdefault("completedBlocks", []).append(block_key)
            completed_blocks.add(block_key)
            completed += 1

            # Save after every successful request so local reruns resume cleanly.
            atomic_write_json(checkpoint_path, progress)

            print(
                f"[{completed}/{total_tasks}] point {point_index}/{len(points)} "
                f"{point.key}, période {block_key}",
                flush=True,
            )
            time.sleep(args.sleep + random.uniform(0, 0.25))

    result = build_output(progress)
    atomic_write_json(output_path, result)

    # The checkpoint is no longer needed once the final file exists.
    try:
        checkpoint_path.unlink()
    except FileNotFoundError:
        pass

    print(f"Climatologie créée : {output_path}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
