#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import shutil
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from matplotlib.colors import LinearSegmentedColormap, BoundaryNorm, ListedColormap

PRO_PALETTES = {
    "temp2m": [
        "#2b0a5a", "#36228c", "#2547d9", "#1789ff", "#18d7e8",
        "#21f2b2", "#4dff63", "#b8ff24", "#fff000", "#ffb000",
        "#ff6800", "#ff2500", "#b80000", "#6d0000"
    ],
    "precip": [
        "#dff7ff", "#8fe7ff", "#29b6f6", "#0066ff", "#1840c9",
        "#6026b8", "#a316c6", "#e500a4", "#ff1744", "#ff7a00",
        "#fff200"
    ],
    "wind10": [
        "#26104f", "#3b1b8f", "#2447d8", "#0877ff", "#00b8ff",
        "#00e5d4", "#2cff81", "#b4ff23", "#fff000", "#ff9800",
        "#ff3300", "#a80000"
    ],
    "gusts": [
        "#18003b", "#3d168f", "#174ac7", "#007bff", "#00cbe8",
        "#20f5a0", "#b3ff2c", "#fff000", "#ff9a00", "#ff3300",
        "#9e0000"
    ],
    "cape": [
        "#f4f4f4", "#bfe8ff", "#39d353", "#d6ff19", "#fff000",
        "#ff9c00", "#ff3b00", "#d10000", "#7a00a8", "#2e004f"
    ],
    "jet300": [
        "#12002b", "#3a0b78", "#2b32c4", "#0068ff", "#00bfff",
        "#00f0c8", "#62ff4d", "#d7ff1f", "#fff000", "#ff9700",
        "#ff3300", "#9f0000"
    ],
    "z500_mslp": [
        "#2d003f", "#51207c", "#353bc0", "#1264ee", "#00a9ff",
        "#00e5df", "#20f2a0", "#72ff46", "#c9ff21", "#fff000",
        "#ffbd00", "#ff7a00", "#ff3500", "#b80000", "#700000"
    ],
    "mslp": [
        "#2d0b59", "#3432a8", "#0c6de8", "#00b8ff", "#00e3b8",
        "#59ee50", "#d7f51b", "#fff000", "#ff9700", "#ff3d00",
        "#b00000"
    ],
    "cloud": [
        "#0f2740", "#36526f", "#71879a", "#aebdca", "#e8eef2", "#ffffff"
    ]
}

def pro_cmap(name: str):
    colors = PRO_PALETTES.get(name, PRO_PALETTES["z500_mslp"])
    return LinearSegmentedColormap.from_list(f"pro_{name}", colors, N=256)

import numpy as np
import requests
import cartopy.crs as ccrs
import cartopy.feature as cfeature


API = "https://api.open-meteo.com/v1/forecast"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Meteo-Lab-V14/1.0"})

MODELS = {
    "ecmwf": {
        "label": "ECMWF IFS",
        "api": "ecmwf_ifs025",
        "extent": (-25, 45, 30, 72),
        "spacing": 4.0,
        "max": 240,
        "step": 12,
    },
    "arpege": {
        "label": "ARPEGE",
        "api": "meteofrance_arpege_europe",
        "extent": (-25, 45, 30, 72),
        "spacing": 4.0,
        "max": 114,
        "step": 6,
    },
    "arome": {
        "label": "AROME",
        "api": "meteofrance_arome_france_hd",
        "extent": (-6, 10, 41, 52),
        "spacing": 1.0,
        "max": 48,
        "step": 3,
    },
    "gfs": {
        "label": "GFS",
        "api": "gfs_seamless",
        "extent": (-25, 45, 30, 72),
        "spacing": 2.0,
        "max": 240,
        "step": 12,
    },
    "icon_eu": {
        "label": "ICON-EU",
        "api": "icon_eu",
        "extent": (-25, 45, 30, 72),
        "spacing": 2.0,
        "max": 120,
        "step": 6,
    },
}

VARIABLES = {
    "temp2m": {
        "label": "Température à 2 m",
        "req": ["temperature_2m"],
        "unit": "°C",
        "ticks": [-20, -10, 0, 10, 20, 30, 40],
        "levels": list(range(-20, 43, 3)),
        "cmap": "temp2m",
    },
    "precip": {
        "label": "Précipitations",
        "req": ["precipitation"],
        "unit": "mm",
        "ticks": [0.1, 1, 5, 10, 20, 50],
        "levels": [0.1, 0.5, 1, 2, 5, 10, 20, 30, 50],
        "cmap": "precip",
    },
    "wind10": {
        "label": "Vent à 10 m",
        "req": ["wind_speed_10m", "wind_direction_10m"],
        "unit": "km/h",
        "ticks": [0, 20, 40, 60, 80, 100],
        "levels": list(range(0, 105, 5)),
        "cmap": "wind10",
    },
    "gusts": {
        "label": "Rafales",
        "req": ["wind_gusts_10m"],
        "unit": "km/h",
        "ticks": [0, 30, 60, 90, 120, 150],
        "levels": list(range(0, 165, 10)),
        "cmap": "gusts",
    },
    "cloud": {
        "label": "Nébulosité",
        "req": ["cloud_cover"],
        "unit": "%",
        "ticks": [0, 20, 40, 60, 80, 100],
        "levels": list(range(0, 110, 10)),
        "cmap": "cloud",
    },
    "mslp": {
        "label": "Pression au niveau de la mer",
        "req": ["pressure_msl"],
        "unit": "hPa",
        "ticks": [970, 980, 1000, 1020, 1040],
        "levels": list(range(960, 1046, 2)),
        "cmap": "mslp",
    },
    "cape": {
        "label": "CAPE",
        "req": ["cape"],
        "unit": "J/kg",
        "ticks": [0, 250, 500, 1000, 2000, 3000, 4000],
        "levels": [0, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000],
        "cmap": "cape",
    },
    "jet300": {
        "label": "Jet stream 300 hPa",
        "req": ["wind_speed_300hPa", "wind_direction_300hPa"],
        "unit": "km/h",
        "ticks": [0, 50, 100, 150, 200, 250, 300],
        "levels": list(range(0, 321, 20)),
        "cmap": "jet300",
    },
    "z500_mslp": {
        "label": "Z500 + pression",
        "req": ["geopotential_height_500hPa", "pressure_msl"],
        "unit": "dam",
        "ticks": [480, 500, 520, 540, 560, 580, 600],
        "levels": list(range(480, 608, 4)),
        "cmap": "z500_mslp",
    },
}

MODEL_VARIABLES = {
    "arome": ["temp2m", "precip", "wind10", "gusts", "cloud", "mslp", "cape"],
    "arpege": ["temp2m", "precip", "wind10", "gusts", "cloud", "mslp", "cape", "jet300", "z500_mslp"],
    "ecmwf": ["temp2m", "precip", "wind10", "gusts", "cloud", "mslp", "cape", "jet300", "z500_mslp"],
    "gfs": ["temp2m", "precip", "wind10", "gusts", "cloud", "mslp", "cape", "jet300", "z500_mslp"],
    "icon_eu": ["temp2m", "precip", "wind10", "gusts", "cloud", "mslp", "cape", "jet300", "z500_mslp"],
}

LEGENDS = {
    key: {
        "title": value["label"],
        "unit": value["unit"],
        "ticks": value["ticks"],
    }
    for key, value in VARIABLES.items()
}


def batches(items, size):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def points(extent, spacing):
    west, east, south, north = extent
    lons = np.arange(west, east + spacing / 2, spacing)
    lats = np.arange(south, north + spacing / 2, spacing)
    return lats, lons, [
        (float(lat), float(lon))
        for lat in lats
        for lon in lons
    ]


def request(batch, model, variables, days):
    params = {
        "latitude": ",".join(str(point[0]) for point in batch),
        "longitude": ",".join(str(point[1]) for point in batch),
        "hourly": ",".join(variables),
        "models": model,
        "forecast_days": days,
        "timezone": "UTC",
        "wind_speed_unit": "kmh",
    }

    last_error = None

    for attempt in range(6):
        try:
            response = SESSION.get(API, params=params, timeout=180)

            if response.status_code == 429:
                retry_after = response.headers.get("Retry-After")
                wait = int(retry_after) if retry_after and retry_after.isdigit() else min(
                    300,
                    30 * (2 ** attempt),
                )
                print(
                    f"HTTP 429 pour {model}; attente {wait} s",
                    file=sys.stderr,
                )
                time.sleep(wait)
                continue

            response.raise_for_status()
            payload = response.json()
            return payload if isinstance(payload, list) else [payload]

        except Exception as error:
            last_error = error
            if attempt == 5:
                break
            time.sleep(min(120, 10 * (attempt + 1)))

    raise RuntimeError(
        f"Échec Open-Meteo pour {model}: {last_error or 'HTTP 429 persistant'}"
    )


def fetch(config, variables):
    lats, lons, grid_points = points(config["extent"], config["spacing"])
    output = []

    for batch in batches(grid_points, 10):
        output.extend(
            request(
                batch,
                config["api"],
                variables,
                math.ceil(config["max"] / 24) + 1,
            )
        )
        time.sleep(2.0)

    if len(output) != len(grid_points):
        raise RuntimeError(
            f"expected {len(grid_points)}, got {len(output)}"
        )

    return lats, lons, output


def index_for_hour(location, hour):
    times = location.get("hourly", {}).get("time", [])
    if not times:
        return None
    return min(range(len(times)), key=lambda index: abs(index - hour))


def field(results, variable, hour, shape):
    values = []

    for location in results:
        index = index_for_hour(location, hour)
        series = location.get("hourly", {}).get(variable, [])
        if (
            index is None
            or index >= len(series)
            or series[index] is None
        ):
            values.append(np.nan)
        else:
            values.append(float(series[index]))

    return np.asarray(values).reshape(shape)


def has_usable_data(values):
    finite = np.isfinite(values)
    return finite.any() and np.nanmax(values) != np.nanmin(values)


def axes(extent, title, subtitle):
    figure = plt.figure(figsize=(14, 9), dpi=110)
    axis = plt.axes(projection=ccrs.PlateCarree())
    axis.set_extent(extent)
    axis.add_feature(cfeature.LAND, facecolor="#101827")
    axis.add_feature(cfeature.OCEAN, facecolor="#07111f")
    axis.add_feature(
        cfeature.COASTLINE,
        edgecolor="#dbeafe",
        linewidth=0.8,
    )
    axis.add_feature(
        cfeature.BORDERS,
        edgecolor="#94a3b8",
        linewidth=0.55,
    )
    figure.patch.set_facecolor("#020617")
    axis.set_facecolor("#020617")
    axis.set_title(
        title,
        loc="left",
        color="white",
        fontsize=18,
        weight="bold",
    )
    axis.set_title(
        subtitle,
        loc="right",
        color="#cbd5e1",
        fontsize=10,
    )
    return figure, axis


def colorbar(figure, axis, plot, ticks, unit):
    bar = figure.colorbar(
        plot,
        ax=axis,
        orientation="horizontal",
        pad=0.035,
        shrink=0.8,
    )
    bar.set_ticks(ticks)
    bar.set_ticklabels([f"{value:g}" for value in ticks])
    bar.set_label(unit, color="white", weight="bold")
    bar.ax.tick_params(colors="white")


def save(figure, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    figure.savefig(
        path,
        bbox_inches="tight",
        facecolor=figure.get_facecolor(),
        pil_kwargs={"quality": 86, "method": 6},
    )
    plt.close(figure)


def update_manifest(root, model_key, data):
    path = root / "maps/manifest.json"
    manifest = (
        json.loads(path.read_text(encoding="utf-8"))
        if path.exists()
        else {"models": {}}
    )
    manifest["generatedAt"] = datetime.now(timezone.utc).isoformat()

    model = manifest.setdefault("models", {}).setdefault(model_key, {})
    model["label"] = data["label"]
    model["run"] = data["run"]
    model["variables"] = data["variables"]

    path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def generate(root, model_key):
    config = MODELS[model_key]
    allowed = MODEL_VARIABLES[model_key]
    requested = sorted({
        variable
        for key in allowed
        for variable in VARIABLES[key]["req"]
    })

    model_dir = root / "maps" / model_key
    temp_model_dir = root / "maps" / f".{model_key}-building"

    if temp_model_dir.exists():
        shutil.rmtree(temp_model_dir)

    lats, lons, results = fetch(config, requested)
    shape = (len(lats), len(lons))
    x_grid, y_grid = np.meshgrid(lons, lats)
    run = datetime.now(timezone.utc).replace(
        minute=0,
        second=0,
        microsecond=0,
    )

    manifest_variables = {}

    for variable_key in allowed:
        definition = VARIABLES[variable_key]
        frames = []

        for hour in range(0, config["max"] + 1, config["step"]):
            valid = run + timedelta(hours=hour)
            figure, axis = axes(
                config["extent"],
                f"{config['label']} · {definition['label']}",
                f"Validité {valid:%Y-%m-%d %H UTC} · +{hour} h",
            )

            try:
                if variable_key == "temp2m":
                    values = field(results, "temperature_2m", hour, shape)
                    if not has_usable_data(values):
                        plt.close(figure)
                        continue
                    plot = axis.contourf(
                        x_grid, y_grid, values,
                        levels=definition["levels"],
                        cmap=pro_cmap(definition["cmap"]),
                        extend="both",
                        transform=ccrs.PlateCarree(),
                    )

                elif variable_key == "precip":
                    values = field(results, "precipitation", hour, shape)
                    if not np.isfinite(values).any():
                        plt.close(figure)
                        continue
                    plot = axis.contourf(
                        x_grid, y_grid, values,
                        levels=definition["levels"],
                        cmap=pro_cmap(definition["cmap"]),
                        extend="max",
                        transform=ccrs.PlateCarree(),
                    )

                elif variable_key == "wind10":
                    speed = field(results, "wind_speed_10m", hour, shape)
                    direction = field(
                        results,
                        "wind_direction_10m",
                        hour,
                        shape,
                    )
                    if not has_usable_data(speed):
                        plt.close(figure)
                        continue
                    radians = np.deg2rad(270 - direction)
                    u = speed * np.cos(radians) / 3.6
                    v = speed * np.sin(radians) / 3.6
                    plot = axis.contourf(
                        x_grid, y_grid, speed,
                        levels=definition["levels"],
                        cmap=pro_cmap(definition["cmap"]),
                        extend="max",
                        transform=ccrs.PlateCarree(),
                    )
                    skip = max(1, len(lons) // 24)
                    axis.barbs(
                        x_grid[::skip, ::skip],
                        y_grid[::skip, ::skip],
                        u[::skip, ::skip],
                        v[::skip, ::skip],
                        length=4,
                        linewidth=0.55,
                        color="white",
                    )

                elif variable_key == "gusts":
                    values = field(results, "wind_gusts_10m", hour, shape)
                    if not has_usable_data(values):
                        plt.close(figure)
                        continue
                    plot = axis.contourf(
                        x_grid, y_grid, values,
                        levels=definition["levels"],
                        cmap=pro_cmap(definition["cmap"]),
                        extend="max",
                        transform=ccrs.PlateCarree(),
                    )

                elif variable_key == "cloud":
                    values = field(results, "cloud_cover", hour, shape)
                    if not has_usable_data(values):
                        plt.close(figure)
                        continue
                    plot = axis.contourf(
                        x_grid, y_grid, values,
                        levels=definition["levels"],
                        cmap=pro_cmap(definition["cmap"]),
                        extend="neither",
                        transform=ccrs.PlateCarree(),
                    )

                elif variable_key == "mslp":
                    values = field(results, "pressure_msl", hour, shape)
                    if not has_usable_data(values):
                        plt.close(figure)
                        continue
                    plot = axis.contourf(
                        x_grid, y_grid, values,
                        levels=definition["levels"],
                        cmap=pro_cmap(definition["cmap"]),
                        extend="both",
                        transform=ccrs.PlateCarree(),
                    )
                    lines = axis.contour(
                        x_grid, y_grid, values,
                        levels=np.arange(960, 1045, 4),
                        colors="white",
                        linewidths=1.15,
                    )
                    axis.clabel(lines, fontsize=7, fmt="%d")

                elif variable_key == "cape":
                    values = field(results, "cape", hour, shape)
                    if not np.isfinite(values).any():
                        plt.close(figure)
                        continue
                    plot = axis.contourf(
                        x_grid, y_grid, values,
                        levels=definition["levels"],
                        cmap=pro_cmap(definition["cmap"]),
                        extend="max",
                        transform=ccrs.PlateCarree(),
                    )

                elif variable_key == "jet300":
                    speed = field(
                        results,
                        "wind_speed_300hPa",
                        hour,
                        shape,
                    )
                    direction = field(
                        results,
                        "wind_direction_300hPa",
                        hour,
                        shape,
                    )
                    if not has_usable_data(speed):
                        plt.close(figure)
                        continue
                    radians = np.deg2rad(270 - direction)
                    u = speed * np.cos(radians) / 3.6
                    v = speed * np.sin(radians) / 3.6
                    plot = axis.contourf(
                        x_grid, y_grid, speed,
                        levels=definition["levels"],
                        cmap=pro_cmap(definition["cmap"]),
                        extend="max",
                        transform=ccrs.PlateCarree(),
                    )
                    skip = max(1, len(lons) // 24)
                    axis.barbs(
                        x_grid[::skip, ::skip],
                        y_grid[::skip, ::skip],
                        u[::skip, ::skip],
                        v[::skip, ::skip],
                        length=4,
                        linewidth=0.55,
                        color="white",
                    )

                elif variable_key == "z500_mslp":
                    z500 = field(
                        results,
                        "geopotential_height_500hPa",
                        hour,
                        shape,
                    ) / 10
                    pressure = field(
                        results,
                        "pressure_msl",
                        hour,
                        shape,
                    )
                    if not has_usable_data(z500):
                        plt.close(figure)
                        continue
                    plot = axis.contourf(
                        x_grid, y_grid, z500,
                        levels=definition["levels"],
                        cmap=pro_cmap(definition["cmap"]),
                        extend="both",
                    )
                    pressure_lines = axis.contour(
                        x_grid, y_grid, pressure,
                        levels=np.arange(960, 1045, 4),
                        colors="white",
                        linewidths=1.15,
                    )
                    axis.clabel(
                        pressure_lines,
                        fontsize=7,
                        fmt="%d",
                    )

                colorbar(
                    figure,
                    axis,
                    plot,
                    definition["ticks"],
                    definition["unit"],
                )

                relative = (
                    Path("maps")
                    / model_key
                    / variable_key
                    / f"f{hour:03d}.webp"
                )
                temporary_relative = (
                    Path("maps")
                    / f".{model_key}-building"
                    / variable_key
                    / f"f{hour:03d}.webp"
                )
                save(figure, root / temporary_relative)
                frames.append({
                    "forecastHour": hour,
                    "validTime": valid.isoformat(),
                    "image": "./" + relative.as_posix(),
                })

            except Exception as error:
                plt.close(figure)
                print(
                    f"{model_key} {variable_key} +{hour}: {error}",
                    file=sys.stderr,
                )

        if frames:
            manifest_variables[variable_key] = {
                "label": definition["label"],
                "legend": LEGENDS[variable_key],
                "frames": frames,
            }

    if not manifest_variables:
        shutil.rmtree(temp_model_dir, ignore_errors=True)
        raise RuntimeError(
            f"Aucune carte exploitable générée pour {model_key}"
        )

    if model_dir.exists():
        shutil.rmtree(model_dir)
    temp_model_dir.rename(model_dir)

    update_manifest(
        root,
        model_key,
        {
            "label": config["label"],
            "run": run.isoformat(),
            "variables": manifest_variables,
        },
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=".")
    parser.add_argument(
        "--models",
        nargs="+",
        default=["ecmwf", "arpege", "arome"],
    )
    args = parser.parse_args()
    root = Path(args.output).resolve()
    success = 0

    for model in args.models:
        try:
            generate(root, model)
            success += 1
        except Exception as error:
            print(f"{model} failed: {error}", file=sys.stderr)

    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
