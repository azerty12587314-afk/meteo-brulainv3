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


  function getDailyForecast(location, days, model) {
    const params = {
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone || 'auto',
      forecast_days: days,
      daily: [
        'weather_code',
        'temperature_2m_max',
        'temperature_2m_min',
        'apparent_temperature_max',
        'apparent_temperature_min',
        'precipitation_sum',
        'precipitation_probability_max',
        'wind_speed_10m_max',
        'wind_gusts_10m_max',
        'sunrise',
        'sunset',
        'uv_index_max'
      ].join(','),
      models: model
    };

    return request(
      buildUrl(endpoints.forecast, params),
      `daily-model:${JSON.stringify(params)}`
    );
  }

  async function getDailyForecastSource(location, sourceKey) {
    const definition = MeteoConfig.dailyForecastModels[sourceKey];

    if (!definition || sourceKey === 'fusion') {
      throw new Error(`Source journalière inconnue : ${sourceKey}`);
    }

    let lastError = null;

    for (const model of definition.candidates) {
      try {
        const data = await getDailyForecast(
          location,
          definition.days,
          model
        );

        if (data?.daily?.time?.length) {
          return {
            key: sourceKey,
            label: definition.label,
            icon: definition.icon,
            model,
            data
          };
        }
      } catch (error) {
        lastError = error;
        console.warn(
          `Prévision journalière ${definition.label} indisponible avec ${model}`,
          error
        );
      }
    }

    throw lastError || new Error(`${definition.label} indisponible`);
  }

  function dailyValue(data, field, date) {
    const daily = data?.daily;
    const index = daily?.time?.indexOf(date) ?? -1;

    if (index < 0) return null;

    const value = daily[field]?.[index];

    return value === null || value === undefined || value === ''
      ? null
      : value;
  }

  function validNumber(value) {
    return value !== null &&
      value !== undefined &&
      value !== '' &&
      Number.isFinite(Number(value));
  }

  function sourceHasTemperatures(source, date) {
    return validNumber(
      dailyValue(source?.data, 'temperature_2m_max', date)
    ) && validNumber(
      dailyValue(source?.data, 'temperature_2m_min', date)
    );
  }

  function confidenceForDate(sources, date) {
    const maxima = [];
    const rainProbabilities = [];

    Object.values(sources).forEach(source => {
      const maxValue =
        dailyValue(source.data, 'temperature_2m_max', date);
      const rainValue =
        dailyValue(source.data, 'precipitation_probability_max', date);

      if (validNumber(maxValue)) maxima.push(Number(maxValue));
      if (validNumber(rainValue)) {
        rainProbabilities.push(Number(rainValue));
      }
    });

    const spread = values =>
      values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;

    const tempSpread = spread(maxima);
    const rainSpread = spread(rainProbabilities);
    const modelCount = maxima.length;

    /*
     * V18.2 :
     * La confiance affichée sur les cartes journalières concerne surtout
     * la température. Elle dépend donc de l'écart réel entre les modèles,
     * sans imposer artificiellement quatre modèles disponibles.
     */
    let stars = 1;

    if (modelCount >= 4) {
      if (tempSpread <= 1) stars = 5;
      else if (tempSpread <= 2) stars = 4;
      else if (tempSpread <= 3.5) stars = 3;
      else if (tempSpread <= 5) stars = 2;
    } else if (modelCount === 3) {
      if (tempSpread <= 1) stars = 5;
      else if (tempSpread <= 2) stars = 4;
      else if (tempSpread <= 3.5) stars = 3;
      else if (tempSpread <= 5) stars = 2;
    } else if (modelCount === 2) {
      if (tempSpread <= 1) stars = 4;
      else if (tempSpread <= 2) stars = 3;
      else if (tempSpread <= 4) stars = 2;
    }

    return {
      stars,
      modelCount,
      temperatureSpread: tempSpread,
      rainSpread,
      label: [
        '',
        'Très faible',
        'Faible',
        'Moyenne',
        'Bonne',
        'Très bonne'
      ][stars]
    };
  }

  function buildFusion(sources, fallbackForecast) {
    const fallbackDates = fallbackForecast?.daily?.time || [];
    const sourceByHorizon = [
      'arome', 'arome', 'arome',
      'arpege', 'arpege',
      'ecmwf', 'ecmwf', 'ecmwf',
      'gfs', 'gfs'
    ];

    const fields = [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'apparent_temperature_max',
      'apparent_temperature_min',
      'precipitation_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'wind_gusts_10m_max',
      'sunrise',
      'sunset',
      'uv_index_max'
    ];

    const daily = { time: fallbackDates.slice(0, 10) };
    fields.forEach(field => {
      daily[field] = [];
    });

    const days = daily.time.map((date, index) => {
      const preferred = sourceByHorizon[index] || 'gfs';
      const fallbackOrder = [
        preferred,
        'ecmwf',
        'arpege',
        'icon',
        'gfs',
        'arome'
      ];

      const selectedKey = fallbackOrder.find(key =>
        sourceHasTemperatures(sources[key], date)
      );

      const selected = selectedKey ? sources[selectedKey] : null;

      fields.forEach(field => {
        /*
         * On privilégie le modèle de la journée, mais chaque champ peut
         * se rabattre sur un autre modèle ou sur la prévision automatique
         * lorsqu'il est absent. Ainsi null ne devient jamais artificiellement 0.
         */
        const candidates = [
          selectedKey,
          ...fallbackOrder.filter(key => key !== selectedKey)
        ];

        let value = null;

        for (const key of candidates) {
          const candidate = dailyValue(sources[key]?.data, field, date);

          if (candidate !== null) {
            value = candidate;
            break;
          }
        }

        if (value === null) {
          value = dailyValue(fallbackForecast, field, date);
        }

        daily[field].push(value);
      });

      return {
        date,
        sourceKey: selectedKey || 'auto',
        sourceLabel: selected?.label || 'Automatique',
        sourceIcon: selected?.icon || '🌐',
        confidence: confidenceForDate(sources, date)
      };
    });

    return {
      timezone: fallbackForecast?.timezone,
      daily,
      days
    };
  }

  async function getDailyForecastBundle(location, fallbackForecast) {
    const keys = ['arome', 'arpege', 'ecmwf', 'gfs', 'icon'];

    const settled = await Promise.allSettled(
      keys.map(key => getDailyForecastSource(location, key))
    );

    const sources = {};

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        sources[keys[index]] = result.value;
      }
    });

    return {
      sources,
      fusion: buildFusion(sources, fallbackForecast)
    };
  }

  function clearCache() {
    cache.clear();
  }

  return { getForecast, getAirQuality, searchLocation, getModelForecasts, getArome48h, getEcmwfLongRange, getDailyForecastBundle, clearCache };
})();
