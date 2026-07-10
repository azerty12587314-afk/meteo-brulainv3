'use strict';

window.MeteoApi = (() => {
  const { endpoints, requestTimeoutMs, cacheDurationMs } = MeteoConfig;
  const cache = new Map();

  function buildUrl(base, params) {
    const url = new URL(base);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  }

  async function request(url, cacheKey = url) {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cacheDurationMs) return cached.data;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
      const data = await response.json();
      cache.set(cacheKey, { timestamp: Date.now(), data });
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  function getForecast(location, days = MeteoConfig.forecastDays, model = '') {
    const params = {
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone || 'auto',
      forecast_days: days,
      current: [
        'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
        'is_day', 'precipitation', 'weather_code', 'cloud_cover',
        'surface_pressure', 'wind_speed_10m', 'wind_direction_10m',
        'wind_gusts_10m'
      ].join(','),
      hourly: [
        'temperature_2m', 'relative_humidity_2m', 'dew_point_2m',
        'apparent_temperature', 'precipitation_probability', 'precipitation',
        'weather_code', 'surface_pressure', 'visibility', 'wind_speed_10m',
        'wind_direction_10m', 'wind_gusts_10m', 'uv_index', 'is_day'
      ].join(','),
      daily: [
        'weather_code', 'temperature_2m_max', 'temperature_2m_min',
        'apparent_temperature_max', 'apparent_temperature_min',
        'sunrise', 'sunset', 'uv_index_max', 'precipitation_sum',
        'precipitation_probability_max', 'wind_speed_10m_max',
        'wind_gusts_10m_max'
      ].join(','),
      models: model || undefined
    };
    return request(buildUrl(endpoints.forecast, params), `forecast:${JSON.stringify(params)}`);
  }

  function getAirQuality(location) {
    const params = {
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone || 'auto',
      forecast_days: 5,
      hourly: [
        'european_aqi', 'pm10', 'pm2_5', 'alder_pollen', 'birch_pollen',
        'grass_pollen', 'mugwort_pollen', 'ragweed_pollen'
      ].join(',')
    };
    return request(buildUrl(endpoints.airQuality, params), `air:${JSON.stringify(params)}`);
  }

  async function searchLocation(query) {
    const params = { name: query, count: 8, language: 'fr', format: 'json' };
    const data = await request(buildUrl(endpoints.geocoding, params), `geo:${query.toLowerCase()}`);
    return data.results || [];
  }


  function getHourlyModelForecast(location, model, days) {
    const params = {
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone || 'auto',
      forecast_days: days,
      hourly: [
        'temperature_2m', 'precipitation', 'wind_speed_10m',
        'wind_gusts_10m', 'weather_code'
      ].join(','),
      models: model
    };
    return request(
      buildUrl(endpoints.forecast, params),
      `hourly-model:${JSON.stringify(params)}`
    );
  }

  async function getArome48h(location) {
    const candidates = [
      { model: 'meteofrance_arome_france_hd', label: 'Modèle officiel AROME HD (Météo-France · maille fine)' },
      { model: 'meteofrance_arome_france', label: 'Modèle officiel AROME (Météo-France · maille fine)' }
    ];

    for (const candidate of candidates) {
      try {
        const data = await getHourlyModelForecast(location, candidate.model, 2);
        if (data?.hourly?.time?.length) return { ...candidate, data, fetchedAt: new Date().toISOString() };
      } catch (error) {
        console.warn(`AROME indisponible avec ${candidate.model}`, error);
      }
    }
    return null;
  }

  async function getEcmwfLongRange(location) {
    try {
      return await getHourlyModelForecast(location, 'ecmwf_ifs', 10);
    } catch (error) {
      console.warn('ECMWF IFS longue échéance indisponible', error);
      return null;
    }
  }

  async function getModelForecasts(location) {
    const tasks = MeteoConfig.modelDefinitions.map(async definition => {
      try {
        const data = await getForecast(location, 5, definition.model);
        return { ...definition, data, fetchedAt: new Date().toISOString() };
      } catch (error) {
        console.warn(`Modèle ${definition.label} indisponible`, error);
        return { ...definition, data: null, fetchedAt: new Date().toISOString() };
      }
    });
    return Promise.all(tasks);
  }

  function clearCache() {
    cache.clear();
  }

  return { getForecast, getAirQuality, searchLocation, getModelForecasts, getArome48h, getEcmwfLongRange, clearCache };
})();
