#!/usr/bin/env python3
"""Generate European forecast maps for the static web player."""

from __future__ import annotations

import argparse
import bz2
import json
import math
import os
import shutil
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

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
import xarray as xr

try:
    from ecmwf.opendata import Client as EcmwfClient
except ImportError:
    EcmwfClient = None

try:
    import cartopy.crs as ccrs
    import cartopy.feature as cfeature
except ImportError as exc:
    raise SystemExit("Cartopy is required: pip install cartopy") from exc


EUROPE_EXTENT = (-25, 45, 30, 72)
USER_AGENT = "Meteo-Lab-GitHub-Actions/1.0"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT})

VARIABLE_LABELS = {
    "temp2m": "Température à 2 m",
    "mslp": "Pression au niveau de la mer",
    "precip": "Précipitations cumulées",
    "wind10": "Vent à 10 m",
    "z500_mslp": "Géopotentiel 500 hPa + pression",
}


VARIABLE_LEGENDS = {
    "temp2m": {
        "title": "Température à 2 m",
        "unit": "°C",
        "ticks": [-30, -20, -10, 0, 10, 20, 30, 40],
        "gradient": (
            "linear-gradient(90deg,#2b0a5a,#36228c,#2547d9,#1789ff,#18d7e8,#21f2b2,#4dff63,#b8ff24,#fff000,#ffb000,#ff6800,#ff2500,#b80000,#6d0000)"
        ),
    },
    "mslp": {
        "title": "Pression au niveau de la mer",
        "unit": "hPa",
        "ticks": [960, 980, 1000, 1020, 1040],
        "gradient": (
            "linear-gradient(90deg,#312e81,#2563eb,#22d3ee,"
            "#4ade80,#fde047,#fb923c,#ef4444)"
        ),
    },
    "precip": {
        "title": "Précipitations cumulées",
        "unit": "mm",
        "ticks": [0.1, 1, 5, 10, 20, 50, 100],
        "gradient": (
            "linear-gradient(90deg,#dff7ff,#8fe7ff,#29b6f6,#0066ff,#1840c9,#6026b8,#a316c6,#e500a4,#ff1744,#ff7a00,#fff200)"
        ),
    },
    "wind10": {
        "title": "Vitesse du vent à 10 m",
        "unit": "km/h",
        "ticks": [0, 20, 40, 60, 80, 100],
        "gradient": (
            "linear-gradient(90deg,#26104f,#3b1b8f,#2447d8,#0877ff,#00b8ff,#00e5d4,#2cff81,#b4ff23,#fff000,#ff9800,#ff3300,#a80000)"
        ),
    },
    "z500_mslp": {
        "title": "Géopotentiel 500 hPa",
        "unit": "dam · isobares en hPa",
        "ticks": [480, 500, 520, 540, 560, 580, 600],
        "gradient": (
            "linear-gradient(90deg,#2d003f,#51207c,#353bc0,#1264ee,#00a9ff,#00e5df,#20f2a0,#72ff46,#c9ff21,#fff000,#ffbd00,#ff7a00,#ff3500,#b80000,#700000)"
        ),
    },
}


@dataclass
class RunInfo:
    model: str
    date: datetime
    cycle: str


def latest_run(delay_hours: int, cycles: tuple[int, ...]) -> RunInfo:
    now = datetime.now(timezone.utc) - timedelta(hours=delay_hours)
    candidates: list[datetime] = []
    for day_offset in range(3):
        day = (now - timedelta(days=day_offset)).date()
        for cycle in cycles:
            candidate = datetime(
                day.year, day.month, day.day, cycle, tzinfo=timezone.utc
            )
            if candidate <= now:
                candidates.append(candidate)
    selected = max(candidates)
    return RunInfo("", selected, f"{selected.hour:02d}")


def download(url: str, destination: Path, retries: int = 3) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and destination.stat().st_size > 100:
        return destination

    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            with SESSION.get(url, timeout=120, stream=True) as response:
                response.raise_for_status()
                with destination.open("wb") as handle:
                    for chunk in response.iter_content(1024 * 1024):
                        if chunk:
                            handle.write(chunk)
            if destination.stat().st_size < 100:
                raise RuntimeError(f"Downloaded file is too small: {url}")
            return destination
        except Exception as exc:
            last_error = exc
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"Unable to download {url}: {last_error}")


def open_grib(path: Path, **filter_by_keys: Any) -> xr.Dataset:
    return xr.open_dataset(
        path,
        engine="cfgrib",
        backend_kwargs={
            "filter_by_keys": filter_by_keys,
            "indexpath": "",
        },
    )


def first_data_var(dataset: xr.Dataset) -> xr.DataArray:
    if not dataset.data_vars:
        raise ValueError("No data variable in GRIB dataset")
    return dataset[next(iter(dataset.data_vars))]


def coords(data: xr.DataArray) -> tuple[np.ndarray, np.ndarray]:
    lat = data.coords.get("latitude")
    lon = data.coords.get("longitude")
    if lat is None or lon is None:
        lat = data.coords.get("lat")
        lon = data.coords.get("lon")
    if lat is None or lon is None:
        raise ValueError("Latitude/longitude coordinates not found")
    return np.asarray(lon), np.asarray(lat)


def setup_axes(title: str, subtitle: str):
    fig = plt.figure(figsize=(14, 9), dpi=110)
    ax = plt.axes(projection=ccrs.PlateCarree())
    ax.set_extent(EUROPE_EXTENT, crs=ccrs.PlateCarree())
    ax.add_feature(cfeature.LAND, facecolor="#101827", zorder=0)
    ax.add_feature(cfeature.OCEAN, facecolor="#07111f", zorder=0)
    ax.add_feature(cfeature.COASTLINE, edgecolor="#dbeafe", linewidth=0.8)
    ax.add_feature(cfeature.BORDERS, edgecolor="#94a3b8", linewidth=0.55)
    ax.gridlines(
        draw_labels=False, linewidth=0.25, color="#64748b", alpha=0.35
    )
    fig.patch.set_facecolor("#020617")
    ax.set_facecolor("#020617")
    ax.set_title(title, loc="left", color="white", fontsize=18, weight="bold")
    ax.set_title(subtitle, loc="right", color="#cbd5e1", fontsize=10)
    return fig, ax


def save_figure(fig, destination: Path):
    destination.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(
        destination,
        bbox_inches="tight",
        facecolor=fig.get_facecolor(),
        pil_kwargs={"quality": 86, "method": 6},
    )
    plt.close(fig)


def style_colorbar(cbar, ticks: list[float], unit: str):
    cbar.set_ticks(ticks)
    cbar.set_ticklabels([f"{tick:g}" for tick in ticks])
    cbar.set_label(unit, color="white", fontsize=10, weight="bold")
    cbar.ax.tick_params(colors="white", labelsize=8, length=4)
    cbar.outline.set_edgecolor("#94a3b8")


def draw_temp(data: xr.DataArray, title: str, subtitle: str, output: Path):
    values = np.asarray(data).squeeze() - 273.15
    lon, lat = coords(data)
    fig, ax = setup_axes(title, subtitle)
    levels = np.arange(-30, 43, 3)
    plot = ax.contourf(
        lon, lat, values, levels=levels, cmap=pro_cmap("temp2m"), extend="both",
        transform=ccrs.PlateCarree()
    )
    cbar = fig.colorbar(plot, ax=ax, orientation="horizontal", pad=0.035, shrink=0.8)
    style_colorbar(
        cbar,
        VARIABLE_LEGENDS["temp2m"]["ticks"],
        VARIABLE_LEGENDS["temp2m"]["unit"],
    )
    save_figure(fig, output)


def draw_mslp(data: xr.DataArray, title: str, subtitle: str, output: Path):
    values = np.asarray(data).squeeze() / 100.0
    lon, lat = coords(data)
    fig, ax = setup_axes(title, subtitle)
    levels = np.arange(960, 1045, 2)
    lines = ax.contour(
        lon, lat, values, levels=levels, colors="#f8fafc",
        linewidths=0.75, transform=ccrs.PlateCarree()
    )
    ax.clabel(lines, inline=True, fontsize=7, fmt="%d")
    ax.text(
        0.012,
        0.018,
        "Isobares : pression au niveau de la mer (hPa)",
        transform=ax.transAxes,
        color="white",
        fontsize=9,
        weight="bold",
        bbox={
            "facecolor": "#020617",
            "edgecolor": "#64748b",
            "alpha": 0.78,
            "boxstyle": "round,pad=0.45",
        },
    )
    save_figure(fig, output)


def draw_precip(data: xr.DataArray, title: str, subtitle: str, output: Path):
    values = np.maximum(np.asarray(data).squeeze(), 0)
    lon, lat = coords(data)
    fig, ax = setup_axes(title, subtitle)
    levels = [0.1, 0.5, 1, 2, 5, 10, 20, 30, 50, 80, 120]
    plot = ax.contourf(
        lon, lat, values, levels=levels, cmap=pro_cmap("precip"),
        extend="max", transform=ccrs.PlateCarree()
    )
    cbar = fig.colorbar(plot, ax=ax, orientation="horizontal", pad=0.035, shrink=0.8)
    style_colorbar(
        cbar,
        VARIABLE_LEGENDS["precip"]["ticks"],
        VARIABLE_LEGENDS["precip"]["unit"],
    )
    save_figure(fig, output)


def draw_wind(
    u: xr.DataArray, v: xr.DataArray, title: str, subtitle: str, output: Path
):
    u_values = np.asarray(u).squeeze()
    v_values = np.asarray(v).squeeze()
    speed = np.sqrt(u_values ** 2 + v_values ** 2) * 3.6
    lon, lat = coords(u)
    fig, ax = setup_axes(title, subtitle)
    levels = np.arange(0, 101, 5)
    plot = ax.contourf(
        lon, lat, speed, levels=levels, cmap=pro_cmap("wind10"),
        extend="max", transform=ccrs.PlateCarree()
    )
    step = max(1, speed.shape[-1] // 35)
    ax.barbs(
        lon[::step] if lon.ndim == 1 else lon[::step, ::step],
        lat[::step] if lat.ndim == 1 else lat[::step, ::step],
        u_values[::step, ::step], v_values[::step, ::step],
        length=4, linewidth=0.35, color="#e2e8f0",
        transform=ccrs.PlateCarree()
    )
    cbar = fig.colorbar(plot, ax=ax, orientation="horizontal", pad=0.035, shrink=0.8)
    style_colorbar(
        cbar,
        VARIABLE_LEGENDS["wind10"]["ticks"],
        VARIABLE_LEGENDS["wind10"]["unit"],
    )
    save_figure(fig, output)


def draw_z500_mslp(
    z: xr.DataArray, mslp: xr.DataArray, title: str, subtitle: str, output: Path
):
    z_values = np.asarray(z).squeeze() / 10.0
    p_values = np.asarray(mslp).squeeze() / 100.0
    lon, lat = coords(z)
    p_lon, p_lat = coords(mslp)
    fig, ax = setup_axes(title, subtitle)
    fill_levels = np.arange(480, 605, 4)
    plot = ax.contourf(
        lon, lat, z_values, levels=fill_levels, cmap=pro_cmap("temp2m"),
        extend="both", transform=ccrs.PlateCarree()
    )
    z_lines = ax.contour(
        lon, lat, z_values, levels=np.arange(480, 605, 4),
        colors="#111827", linewidths=0.45, transform=ccrs.PlateCarree()
    )
    ax.clabel(z_lines, inline=True, fontsize=6, fmt="%d")
    p_lines = ax.contour(
        p_lon, p_lat, p_values, levels=np.arange(960, 1045, 4),
        colors="white", linewidths=1.15, transform=ccrs.PlateCarree()
    )
    ax.clabel(p_lines, inline=True, fontsize=7, fmt="%d")
    cbar = fig.colorbar(plot, ax=ax, orientation="horizontal", pad=0.035, shrink=0.8)
    style_colorbar(
        cbar,
        VARIABLE_LEGENDS["z500_mslp"]["ticks"],
        "dam",
    )
    save_figure(fig, output)


def gfs_url(run: RunInfo, forecast_hour: int) -> str:
    date = run.date.strftime("%Y%m%d")
    file_name = f"gfs.t{run.cycle}z.pgrb2.0p25.f{forecast_hour:03d}"
    params = {
        "file": file_name,
        "lev_2_m_above_ground": "on",
        "lev_10_m_above_ground": "on",
        "lev_500_mb": "on",
        "lev_mean_sea_level": "on",
        "lev_surface": "on",
        "var_TMP": "on",
        "var_UGRD": "on",
        "var_VGRD": "on",
        "var_HGT": "on",
        "var_PRMSL": "on",
        "var_APCP": "on",
        "subregion": "",
        "toplat": "72",
        "leftlon": "-25",
        "rightlon": "45",
        "bottomlat": "30",
        "dir": f"/gfs.{date}/{run.cycle}/atmos",
    }
    return "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl?" + urlencode(params)


def generate_gfs(output_root: Path, hours: list[int]) -> dict[str, Any]:
    run = latest_run(5, (0, 6, 12, 18))
    run.model = "gfs"
    temp_dir = Path(tempfile.mkdtemp(prefix="gfs_"))
    variables = {
        key: {
            "label": label,
            "legend": VARIABLE_LEGENDS.get(key),
            "frames": [],
        }
        for key, label in VARIABLE_LABELS.items()
    }

    try:
        for hour in hours:
            grib = download(gfs_url(run, hour), temp_dir / f"gfs_f{hour:03d}.grib2")
            valid = run.date + timedelta(hours=hour)
            subtitle = (
                f"Run {run.date:%Y-%m-%d %HZ} · "
                f"Validité {valid:%Y-%m-%d %H UTC} · +{hour} h"
            )

            fields: dict[str, xr.DataArray] = {}
            filters = {
                "temp2m": {"typeOfLevel": "heightAboveGround", "level": 2, "shortName": "2t"},
                "mslp": {"typeOfLevel": "meanSea", "shortName": "prmsl"},
                "precip": {"typeOfLevel": "surface", "shortName": "tp"},
                "u10": {"typeOfLevel": "heightAboveGround", "level": 10, "shortName": "10u"},
                "v10": {"typeOfLevel": "heightAboveGround", "level": 10, "shortName": "10v"},
                "z500": {"typeOfLevel": "isobaricInhPa", "level": 500, "shortName": "gh"},
            }
            for name, filter_keys in filters.items():
                try:
                    ds = open_grib(grib, **filter_keys)
                    fields[name] = first_data_var(ds)
                except Exception as exc:
                    print(f"GFS {hour:03d} {name}: {exc}", file=sys.stderr)

            render_specs = []
            if "temp2m" in fields:
                render_specs.append(("temp2m", draw_temp, (fields["temp2m"],)))
            if "mslp" in fields:
                render_specs.append(("mslp", draw_mslp, (fields["mslp"],)))
            if "precip" in fields:
                render_specs.append(("precip", draw_precip, (fields["precip"],)))
            if "u10" in fields and "v10" in fields:
                render_specs.append(("wind10", draw_wind, (fields["u10"], fields["v10"])))
            if "z500" in fields and "mslp" in fields:
                render_specs.append(
                    ("z500_mslp", draw_z500_mslp, (fields["z500"], fields["mslp"]))
                )

            for key, renderer, args in render_specs:
                rel = Path("maps") / "gfs" / key / f"f{hour:03d}.webp"
                destination = output_root / rel
                renderer(*args, f"GFS · {VARIABLE_LABELS[key]}", subtitle, destination)
                variables[key]["frames"].append({
                    "forecastHour": hour,
                    "validTime": valid.isoformat(),
                    "image": "./" + rel.as_posix(),
                })
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    variables = {key: value for key, value in variables.items() if value["frames"]}
    return {
        "label": "GFS",
        "run": run.date.isoformat(),
        "variables": variables,
    }


def icon_url(run: RunInfo, variable: str, forecast_hour: int, level: str = "single-level") -> str:
    date_hour = run.date.strftime("%Y%m%d%H")
    variable_upper = variable.upper()
    file_name = (
        f"icon-eu_europe_regular-lat-lon_{level}_{date_hour}_"
        f"{forecast_hour:03d}_{variable_upper}.grib2.bz2"
    )
    return (
        f"https://opendata.dwd.de/weather/nwp/icon-eu/grib/"
        f"{run.cycle}/{variable.lower()}/{file_name}"
    )


def decompress_bz2(source: Path, destination: Path) -> Path:
    with bz2.open(source, "rb") as src, destination.open("wb") as dst:
        shutil.copyfileobj(src, dst)
    return destination


def icon_field(run: RunInfo, variable: str, hour: int, temp_dir: Path) -> xr.DataArray:
    compressed = download(
        icon_url(run, variable, hour),
        temp_dir / f"{variable}_{hour:03d}.grib2.bz2",
    )
    grib = decompress_bz2(
        compressed, temp_dir / f"{variable}_{hour:03d}.grib2"
    )
    return first_data_var(xr.open_dataset(
        grib, engine="cfgrib",
        backend_kwargs={"indexpath": ""}
    ))


def generate_icon(output_root: Path, hours: list[int]) -> dict[str, Any]:
    run = latest_run(4, (0, 3, 6, 9, 12, 15, 18, 21))
    run.model = "icon_eu"
    temp_dir = Path(tempfile.mkdtemp(prefix="icon_"))
    variables = {
        key: {
            "label": VARIABLE_LABELS[key],
            "legend": VARIABLE_LEGENDS.get(key),
            "frames": [],
        }
        for key in ("temp2m", "mslp", "precip", "wind10")
    }

    try:
        for hour in hours:
            valid = run.date + timedelta(hours=hour)
            subtitle = (
                f"Run {run.date:%Y-%m-%d %HZ} · "
                f"Validité {valid:%Y-%m-%d %H UTC} · +{hour} h"
            )
            fields: dict[str, xr.DataArray] = {}

            mapping = {
                "temp2m": "t_2m",
                "mslp": "pmsl",
                "precip": "tot_prec",
                "u10": "u_10m",
                "v10": "v_10m",
            }
            for key, variable in mapping.items():
                try:
                    fields[key] = icon_field(run, variable, hour, temp_dir)
                except Exception as exc:
                    print(f"ICON {hour:03d} {variable}: {exc}", file=sys.stderr)

            specs = []
            if "temp2m" in fields:
                specs.append(("temp2m", draw_temp, (fields["temp2m"],)))
            if "mslp" in fields:
                specs.append(("mslp", draw_mslp, (fields["mslp"],)))
            if "precip" in fields:
                specs.append(("precip", draw_precip, (fields["precip"],)))
            if "u10" in fields and "v10" in fields:
                specs.append(("wind10", draw_wind, (fields["u10"], fields["v10"])))

            for key, renderer, args in specs:
                rel = Path("maps") / "icon_eu" / key / f"f{hour:03d}.webp"
                destination = output_root / rel
                renderer(*args, f"ICON-EU · {VARIABLE_LABELS[key]}", subtitle, destination)
                variables[key]["frames"].append({
                    "forecastHour": hour,
                    "validTime": valid.isoformat(),
                    "image": "./" + rel.as_posix(),
                })
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    variables = {key: value for key, value in variables.items() if value["frames"]}
    return {
        "label": "ICON-EU",
        "run": run.date.isoformat(),
        "variables": variables,
    }



def generate_ecmwf(output_root: Path, hours: list[int]) -> dict[str, Any]:
    """Generate ECMWF IFS open-data maps (0.25°, oper control forecast)."""
    if EcmwfClient is None:
        raise RuntimeError("ecmwf-opendata is required")

    run = latest_run(8, (0, 12))
    run.model = "ecmwf"
    client = EcmwfClient(source="ecmwf")
    temp_dir = Path(tempfile.mkdtemp(prefix="ecmwf_"))
    variables = {
        key: {"label": VARIABLE_LABELS[key], "legend": VARIABLE_LEGENDS.get(key), "frames": []}
        for key in ("temp2m", "mslp", "precip", "wind10", "z500_mslp")
    }

    try:
        for hour in hours:
            valid = run.date + timedelta(hours=hour)
            subtitle = (
                f"Run {run.date:%Y-%m-%d %HZ} · "
                f"Validité {valid:%Y-%m-%d %H UTC} · +{hour} h"
            )
            surface = temp_dir / f"ifs_surface_f{hour:03d}.grib2"
            upper = temp_dir / f"ifs_500_f{hour:03d}.grib2"

            try:
                client.retrieve(
                    date=run.date.strftime("%Y%m%d"), time=run.cycle,
                    step=hour, stream="oper", type="fc",
                    param=["2t", "msl", "10u", "10v", "tp"],
                    target=str(surface),
                )
            except Exception as exc:
                print(f"ECMWF {hour:03d} surface: {exc}", file=sys.stderr)
                continue

            try:
                client.retrieve(
                    date=run.date.strftime("%Y%m%d"), time=run.cycle,
                    step=hour, stream="oper", type="fc",
                    param="gh", levelist=500, target=str(upper),
                )
            except Exception as exc:
                print(f"ECMWF {hour:03d} 500 hPa: {exc}", file=sys.stderr)

            fields: dict[str, xr.DataArray] = {}
            filters = {
                "temp2m": (surface, {"typeOfLevel": "heightAboveGround", "level": 2, "shortName": "2t"}),
                "mslp": (surface, {"typeOfLevel": "meanSea", "shortName": "msl"}),
                "precip": (surface, {"typeOfLevel": "surface", "shortName": "tp"}),
                "u10": (surface, {"typeOfLevel": "heightAboveGround", "level": 10, "shortName": "10u"}),
                "v10": (surface, {"typeOfLevel": "heightAboveGround", "level": 10, "shortName": "10v"}),
            }
            if upper.exists():
                filters["z500"] = (upper, {"typeOfLevel": "isobaricInhPa", "level": 500, "shortName": "gh"})

            for name, (path, keys) in filters.items():
                try:
                    field = first_data_var(open_grib(path, **keys))
                    fields[name] = field * 1000.0 if name == "precip" else field
                except Exception as exc:
                    print(f"ECMWF {hour:03d} {name}: {exc}", file=sys.stderr)

            specs = []
            if "temp2m" in fields: specs.append(("temp2m", draw_temp, (fields["temp2m"],)))
            if "mslp" in fields: specs.append(("mslp", draw_mslp, (fields["mslp"],)))
            if "precip" in fields: specs.append(("precip", draw_precip, (fields["precip"],)))
            if "u10" in fields and "v10" in fields:
                specs.append(("wind10", draw_wind, (fields["u10"], fields["v10"])))
            if "z500" in fields and "mslp" in fields:
                specs.append(("z500_mslp", draw_z500_mslp, (fields["z500"], fields["mslp"])))

            for key, renderer, args in specs:
                rel = Path("maps") / "ecmwf" / key / f"f{hour:03d}.webp"
                renderer(*args, f"ECMWF IFS · {VARIABLE_LABELS[key]}", subtitle, output_root / rel)
                variables[key]["frames"].append({
                    "forecastHour": hour, "validTime": valid.isoformat(), "image": "./" + rel.as_posix()
                })
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    variables = {key: value for key, value in variables.items() if value["frames"]}
    return {"label": "ECMWF IFS", "run": run.date.isoformat(), "variables": variables}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=".")
    parser.add_argument("--models", nargs="+", default=["gfs", "icon_eu", "ecmwf"])
    parser.add_argument("--max-hour", type=int, default=120)
    parser.add_argument("--step", type=int, default=6)
    args = parser.parse_args()

    root = Path(args.output).resolve()
    maps_dir = root / "maps"
    if maps_dir.exists():
        for child in maps_dir.iterdir():
            if child.name != "manifest.json":
                if child.is_dir():
                    shutil.rmtree(child)
                else:
                    child.unlink()
    maps_dir.mkdir(parents=True, exist_ok=True)

    hours = list(range(0, args.max_hour + 1, args.step))
    manifest: dict[str, Any] = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "models": {},
    }

    if "gfs" in args.models:
        try:
            manifest["models"]["gfs"] = generate_gfs(root, hours)
        except Exception as exc:
            print(f"GFS generation failed: {exc}", file=sys.stderr)

    if "icon_eu" in args.models:
        try:
            manifest["models"]["icon_eu"] = generate_icon(root, hours)
        except Exception as exc:
            print(f"ICON generation failed: {exc}", file=sys.stderr)

    if "ecmwf" in args.models:
        try:
            manifest["models"]["ecmwf"] = generate_ecmwf(root, hours)
        except Exception as exc:
            print(f"ECMWF generation failed: {exc}", file=sys.stderr)

    (maps_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0 if manifest["models"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
