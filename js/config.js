'use strict';

window.MeteoConfig = Object.freeze({
  appName: 'Météo Lab V2',
  defaultLocation: {
    name: 'Brûlain',
    latitude: 46.2025,
    longitude: -0.3297,
    timezone: 'Europe/Paris'
  },
  forecastDays: 10,
  hourlyHours: 24,
  refreshIntervalMs: 15 * 60 * 1000,
  requestTimeoutMs: 12000,
  cacheDurationMs: 10 * 60 * 1000,
  endpoints: {
    forecast: 'https://api.open-meteo.com/v1/forecast',
    airQuality: 'https://air-quality-api.open-meteo.com/v1/air-quality',
    geocoding: 'https://geocoding-api.open-meteo.com/v1/search'
  },
  modelDefinitions: [
    {
      key: 'arpege',
      label: 'ARPEGE',
      model: 'meteofrance_arpege_europe',
      runHoursUtc: [0, 6, 12, 18],
      estimatedDelayHours: 3
    },
    {
      key: 'icon',
      label: 'ICON',
      model: 'icon_seamless',
      runHoursUtc: [0, 3, 6, 9, 12, 15, 18, 21],
      estimatedDelayHours: 2
    },
    {
      key: 'gfs',
      label: 'GFS',
      model: 'gfs_seamless',
      runHoursUtc: [0, 6, 12, 18],
      estimatedDelayHours: 4
    },
    {
      key: 'ecmwf',
      label: 'ECMWF IFS',
      model: 'ecmwf_ifs',
      runHoursUtc: [0, 6, 12, 18],
      estimatedDelayHours: 6
    }
  ],
  aromeRunDefinition: {
    key: 'arome',
    label: 'AROME',
    runHoursUtc: [0, 6, 12, 18],
    estimatedDelayHours: 3
  }
});
