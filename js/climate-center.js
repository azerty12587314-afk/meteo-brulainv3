'use strict';

window.ClimateCenter = (() => {
  const STATIC_DATA_URL = './data/climate.json';
  const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
  const CACHE_PREFIX = 'meteo-climate-dynamic-v5.1:';
  const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;
  const NORMAL_START = '1991-01-01';
  const NORMAL_END = '2020-12-31';
  const RECENT_YEAR_COUNT = 10;

  const DAILY_FIELDS = [
    'temperature_2m_mean',
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_sum',
    'sunshine_duration',
    'wind_gusts_10m_max',
    'et0_fao_evapotranspiration'
  ];

  const byId = id => document.getElementById(id);

  let data = null;
  let activeLocation = null;
  let temperatureChart = null;
  let precipitationChart = null;
  let yearsChart = null;
  let temperatureAnomalyChart = null;
  let rainAnomalyChart = null;
  let trendChart = null;
  let requestController = null;
  let requestSequence = 0;

  function finite(value) {
    return value !== null &&
      value !== undefined &&
      value !== '' &&
      Number.isFinite(Number(value));
  }

  function numeric(value) {
    return finite(value) ? Number(value) : null;
  }

  function rounded(value, digits = 1) {
    const number = numeric(value);
    return number === null ? null : Number(number.toFixed(digits));
  }

  function displayNumber(value, digits = 0) {
    const number = numeric(value);
    return number === null ? '--' : number.toFixed(digits);
  }

  function formatDate(value) {
    if (!value) return '--';
    const parsed = new Date(`${value}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return '--';
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(parsed);
  }

  function validLocation(location) {
    const latitude = numeric(location?.latitude);
    const longitude = numeric(location?.longitude);
    return latitude !== null &&
      longitude !== null &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180;
  }

  function normalizeLocation(location) {
    if (!validLocation(location)) return null;
    return {
      name: String(location.name || 'Localisation'),
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      timezone: String(location.timezone || 'auto')
    };
  }

  function locationsMatch(first, second) {
    if (!validLocation(first) || !validLocation(second)) return false;
    return Math.abs(Number(first.latitude) - Number(second.latitude)) < 0.0001 &&
      Math.abs(Number(first.longitude) - Number(second.longitude)) < 0.0001;
  }

  function savedLocation() {
    try {
      return normalizeLocation(
        JSON.parse(localStorage.getItem('meteo-location') || 'null')
      );
    } catch {
      return null;
    }
  }

  function cacheKey(location) {
    const latitude = Number(location.latitude).toFixed(3);
    const longitude = Number(location.longitude).toFixed(3);
    return `${CACHE_PREFIX}${latitude},${longitude}`;
  }

  function readCache(location) {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey(location)) || 'null');
      if (!cached?.savedAt || !isComplete(cached.data)) return null;
      if (Date.now() - cached.savedAt > CACHE_DURATION_MS) return null;
      return cached.data;
    } catch {
      return null;
    }
  }

  function writeCache(location, value) {
    try {
      localStorage.setItem(
        cacheKey(location),
        JSON.stringify({ savedAt: Date.now(), data: value })
      );
    } catch {
      // Le navigateur peut refuser le stockage si le quota est dépassé.
    }
  }

  function setStatus(message) {
    const target = byId('climate-updated-at');
    if (target) target.textContent = message;
  }

  function setLoading(loading, message = '') {
    const section = byId('climate-center-section');
    if (section) section.classList.toggle('is-loading', loading);

    const button = byId('climate-refresh');
    if (button) {
      button.disabled = loading;
      button.textContent = loading ? 'Chargement…' : '↻ Actualiser';
    }

    if (message) setStatus(message);
  }

  function isoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function archiveEndDate() {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - 7);
    return isoDate(date);
  }

  function buildUrl(location, startDate, endDate) {
    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      start_date: startDate,
      end_date: endDate,
      daily: DAILY_FIELDS.join(','),
      timezone: location.timezone || 'auto',
      temperature_unit: 'celsius',
      wind_speed_unit: 'kmh',
      precipitation_unit: 'mm',
      cell_selection: 'land'
    });
    return `${ARCHIVE_URL}?${params.toString()}`;
  }

  async function fetchArchiveChunk(location, startDate, endDate, signal) {
    const response = await fetch(
      buildUrl(location, startDate, endDate),
      { cache: 'no-store', signal }
    );

    if (!response.ok) {
      let reason = `HTTP ${response.status}`;
      try {
        const error = await response.json();
        reason = error?.reason || reason;
      } catch {
        // Réponse non JSON.
      }
      throw new Error(reason);
    }

    const payload = await response.json();
    if (payload?.error) throw new Error(payload.reason || 'Erreur Open-Meteo');

    const daily = payload?.daily;
    if (!Array.isArray(daily?.time) || daily.time.length === 0) {
      throw new Error(`Aucune donnée climatique reçue (${startDate} à ${endDate})`);
    }

    return daily.time.map((day, index) => {
      const row = { date: day };
      for (const field of DAILY_FIELDS) {
        row[field] = Array.isArray(daily[field]) ? daily[field][index] : null;
      }
      return row;
    });
  }

  function yearChunks(startDate, endDate, yearsPerChunk = 8) {
    const chunks = [];
    let startYear = Number(startDate.slice(0, 4));
    const endYear = Number(endDate.slice(0, 4));

    while (startYear <= endYear) {
      const chunkEndYear = Math.min(startYear + yearsPerChunk - 1, endYear);
      const chunkStart = startYear === Number(startDate.slice(0, 4))
        ? startDate
        : `${startYear}-01-01`;
      const chunkEnd = chunkEndYear === endYear
        ? endDate
        : `${chunkEndYear}-12-31`;

      chunks.push([chunkStart, chunkEnd]);
      startYear = chunkEndYear + 1;
    }

    return chunks;
  }

  async function fetchArchive(location, startDate, endDate, signal) {
    const rows = [];
    const chunks = yearChunks(startDate, endDate);

    for (let index = 0; index < chunks.length; index += 1) {
      const [chunkStart, chunkEnd] = chunks[index];
      setStatus(
        `Calcul climatologique pour ${location.name}… ` +
        `${index + 1}/${chunks.length}`
      );
      const chunkRows = await fetchArchiveChunk(
        location,
        chunkStart,
        chunkEnd,
        signal
      );
      rows.push(...chunkRows);
    }

    return rows;
  }

  function values(rows, key) {
    return rows
      .map(row => numeric(row[key]))
      .filter(value => value !== null);
  }

  function mean(rows, key) {
    const list = values(rows, key);
    return list.length
      ? list.reduce((sum, value) => sum + value, 0) / list.length
      : null;
  }

  function total(rows, key) {
    const list = values(rows, key);
    return list.length
      ? list.reduce((sum, value) => sum + value, 0)
      : null;
  }

  function groupBy(rows, selector) {
    return rows.reduce((groups, row) => {
      const key = selector(row);
      (groups[key] ||= []).push(row);
      return groups;
    }, {});
  }

  function annualSummary(year, rows) {
    const byMonth = groupBy(
      rows,
      row => Number(row.date.slice(5, 7))
    );

    const sunshineSeconds = total(rows, 'sunshine_duration');
    const precipitation = total(rows, 'precipitation_sum');
    const evapotranspiration = total(rows, 'et0_fao_evapotranspiration');

    const monthly = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const monthRows = byMonth[month] || [];
      return {
        month,
        temperatureMean: rounded(mean(monthRows, 'temperature_2m_mean')),
        temperatureMax: rounded(mean(monthRows, 'temperature_2m_max')),
        temperatureMin: rounded(mean(monthRows, 'temperature_2m_min')),
        precipitation: rounded(total(monthRows, 'precipitation_sum'))
      };
    });

    return {
      year,
      daysAvailable: rows.length,
      temperatureMean: rounded(mean(rows, 'temperature_2m_mean')),
      precipitation: rounded(precipitation),
      sunshineHours: rounded(
        sunshineSeconds === null ? null : sunshineSeconds / 3600
      ),
      evapotranspiration: rounded(evapotranspiration),
      frostDays: rows.filter(
        row => finite(row.temperature_2m_min) &&
          Number(row.temperature_2m_min) < 0
      ).length,
      hotDays: rows.filter(
        row => finite(row.temperature_2m_max) &&
          Number(row.temperature_2m_max) >= 30
      ).length,
      tropicalNights: rows.filter(
        row => finite(row.temperature_2m_min) &&
          Number(row.temperature_2m_min) >= 20
      ).length,
      heatingDegreeDays: Math.round(
        rows.reduce((sum, row) => {
          const temperature = numeric(row.temperature_2m_mean);
          return sum + (temperature === null ? 0 : Math.max(0, 18 - temperature));
        }, 0)
      ),
      monthly
    };
  }

  function buildNormals(normalRows) {
    const byMonth = groupBy(
      normalRows,
      row => Number(row.date.slice(5, 7))
    );

    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const monthRows = byMonth[month] || [];
      const byYear = groupBy(
        monthRows,
        row => Number(row.date.slice(0, 4))
      );

      const yearlyRain = Object.values(byYear)
        .map(rows => total(rows, 'precipitation_sum'))
        .filter(value => value !== null);

      return {
        month,
        temperatureMean: rounded(mean(monthRows, 'temperature_2m_mean')),
        temperatureMax: rounded(mean(monthRows, 'temperature_2m_max')),
        temperatureMin: rounded(mean(monthRows, 'temperature_2m_min')),
        precipitation: rounded(
          yearlyRain.length
            ? yearlyRain.reduce((sum, value) => sum + value, 0) / yearlyRain.length
            : null
        )
      };
    });
  }

  function findRecord(rows, key, highest = true) {
    const candidates = rows
      .filter(row => finite(row[key]))
      .map(row => ({ value: Number(row[key]), date: row.date }));

    if (!candidates.length) return null;

    return candidates.reduce((selected, candidate) => {
      if (!selected) return candidate;
      return highest
        ? (candidate.value > selected.value ? candidate : selected)
        : (candidate.value < selected.value ? candidate : selected);
    }, null);
  }

  function assembleData(location, rows, endDate) {
    const normalRows = rows.filter(
      row => row.date >= NORMAL_START && row.date <= NORMAL_END
    );

    const byYear = groupBy(
      rows,
      row => Number(row.date.slice(0, 4))
    );

    const currentYear = Number(endDate.slice(0, 4));
    const recentYears = [];

    for (
      let year = Math.max(1991, currentYear - RECENT_YEAR_COUNT);
      year < currentYear;
      year += 1
    ) {
      if (byYear[year]?.length) {
        recentYears.push(annualSummary(year, byYear[year]));
      }
    }

    const result = {
      generatedAt: new Date().toISOString(),
      source: {
        name: 'Open-Meteo Historical Weather API',
        model: 'best_match',
        archiveEnd: endDate,
        dynamic: true
      },
      location,
      normalPeriod: '1991-2020',
      normals: { monthly: buildNormals(normalRows) },
      currentYear: annualSummary(currentYear, byYear[currentYear] || []),
      recentYears,
      records: {
        highestTemperature: findRecord(rows, 'temperature_2m_max', true),
        lowestTemperature: findRecord(rows, 'temperature_2m_min', false),
        wettestDay: findRecord(rows, 'precipitation_sum', true),
        strongestGust: findRecord(rows, 'wind_gusts_10m_max', true)
      },
      errors: []
    };

    for (const record of Object.values(result.records)) {
      if (record) record.estimated = true;
    }

    return result;
  }

  function hasMonthlySeries(value, key) {
    const months = value?.normals?.monthly;
    return Array.isArray(months) &&
      months.length === 12 &&
      months.some(month => finite(month?.[key]));
  }

  function isComplete(value) {
    return Boolean(
      value &&
      Array.isArray(value?.normals?.monthly) &&
      value.normals.monthly.length === 12 &&
      hasMonthlySeries(value, 'temperatureMean') &&
      hasMonthlySeries(value, 'precipitation') &&
      Array.isArray(value?.recentYears) &&
      value.recentYears.length > 0 &&
      value?.currentYear &&
      Array.isArray(value.currentYear.monthly) &&
      finite(value.currentYear.precipitation)
    );
  }

  async function loadDynamic(location, force = false) {
    const normalized = normalizeLocation(location);
    if (!normalized) throw new Error('Localisation climatique invalide');

    activeLocation = normalized;
    const sequence = ++requestSequence;

    if (!force) {
      const cached = readCache(normalized);
      if (cached) {
        data = cached;
        render();
        return;
      }
    }

    requestController?.abort();
    requestController = new AbortController();

    setLoading(
      true,
      `Calcul climatologique pour ${normalized.name}…`
    );

    const endDate = archiveEndDate();
    const rows = await fetchArchive(
      normalized,
      NORMAL_START,
      endDate,
      requestController.signal
    );

    if (sequence !== requestSequence) return;

    const generated = assembleData(normalized, rows, endDate);
    if (!isComplete(generated)) {
      throw new Error('Séries climatiques incomplètes (pluie ou température absente)');
    }

    data = generated;
    writeCache(normalized, generated);
    render();
  }

  async function loadStaticFallback() {
    const response = await fetch(
      `${STATIC_DATA_URL}?v=${Date.now()}`,
      { cache: 'no-store' }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const fallback = await response.json();
    if (!isComplete(fallback)) {
      throw new Error('Cache climatique statique incomplet');
    }

    data = fallback;
    activeLocation = normalizeLocation(fallback.location);
    render();
  }

  function normalPrecipitation() {
    return data.normals.monthly.reduce(
      (sum, month) => sum + (numeric(month.precipitation) || 0),
      0
    );
  }

  function normalTemperature() {
    const list = data.normals.monthly
      .map(month => numeric(month.temperatureMean))
      .filter(value => value !== null);

    return list.length
      ? list.reduce((sum, value) => sum + value, 0) / list.length
      : null;
  }

  function render() {
    if (!isComplete(data)) return;

    const current = data.currentYear;
    const meanNormal = normalTemperature();
    const rainNormal = normalPrecipitation();

    const currentTemperature = numeric(current.temperatureMean);
    const currentRain = numeric(current.precipitation);

    const temperatureAnomaly =
      meanNormal === null || currentTemperature === null
        ? null
        : currentTemperature - meanNormal;

    const rainDifference =
      !rainNormal || currentRain === null
        ? null
        : currentRain - rainNormal;

    const generatedDate = new Date(data.generatedAt);
    const generatedText = Number.isNaN(generatedDate.getTime())
      ? ''
      : new Intl.DateTimeFormat('fr-FR', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        }).format(generatedDate);

    const mode = data?.source?.dynamic ? 'dynamique' : 'cache GitHub';
    setStatus(`${data.location.name} · ${generatedText} · ${mode}`);

    const cards = [
      [
        '🌡️',
        `Température ${current.year || ''}`,
        `${displayNumber(current.temperatureMean, 1)} °C`,
        temperatureAnomaly === null
          ? 'Anomalie indisponible'
          : `${temperatureAnomaly >= 0 ? '+' : ''}${temperatureAnomaly.toFixed(1)} °C`
      ],
      [
        '🌧️',
        'Pluie cumulée',
        `${displayNumber(current.precipitation)} mm`,
        rainDifference === null
          ? 'Écart indisponible'
          : `${rainDifference >= 0 ? '+' : ''}${rainDifference.toFixed(0)} mm`
      ],
      ['❄️', 'Jours de gel', displayNumber(current.frostDays), 'Minimum < 0 °C'],
      ['🔥', 'Jours ≥ 30 °C', displayNumber(current.hotDays), 'Jours très chauds'],
      ['☀️', 'Ensoleillement', `${displayNumber(current.sunshineHours)} h`, 'Durée cumulée'],
      ['🏠', 'Degrés-jours', displayNumber(current.heatingDegreeDays), 'Base 18 °C'],
      ['🌙', 'Nuits tropicales', displayNumber(current.tropicalNights), 'Minimum ≥ 20 °C'],
      [
        '🌾',
        'Bilan hydrique',
        `${displayNumber(
          (numeric(current.precipitation) || 0) -
          (numeric(current.evapotranspiration) || 0)
        )} mm`,
        'Pluie - ETP'
      ]
    ];

    const grid = byId('climate-kpi-grid');
    if (grid) {
      grid.innerHTML = cards.map(card => `
        <article class="climate-kpi">
          <span>${card[0]}</span>
          <small>${card[1]}</small>
          <strong>${card[2]}</strong>
          <em>${card[3]}</em>
        </article>
      `).join('');
    }

    renderCharts();
    renderRecords();
    renderAdvancedCharts();
    window.dispatchEvent(new CustomEvent("climate-data-ready", { detail: data }));
    setLoading(false);
  }

  function climateColors() {
    return {
      text: '#dbeafe',
      muted: '#94a3b8',
      grid: 'rgba(148, 163, 184, 0.18)',
      blue: '#38bdf8',
      blueFill: 'rgba(56, 189, 248, 0.62)',
      blueBorder: '#0ea5e9',
      pink: '#fb7185',
      pinkFill: 'rgba(251, 113, 133, 0.58)',
      green: '#34d399',
      greenFill: 'rgba(52, 211, 153, 0.62)',
      orange: '#fb923c',
      orangeFill: 'rgba(251, 146, 60, 0.62)',
      red: '#f87171',
      redFill: 'rgba(248, 113, 113, 0.66)'
    };
  }

  function stableChartOptions(options = {}) {
    const colors = climateColors();
    const scales = options.scales || {};
    Object.values(scales).forEach(scale => {
      scale.ticks = { color: colors.muted, ...(scale.ticks || {}) };
      scale.grid = { color: colors.grid, ...(scale.grid || {}) };
      if (scale.title) scale.title = { color: colors.muted, ...scale.title };
    });
    options.scales = scales;
    options.plugins = options.plugins || {};
    options.plugins.legend = options.plugins.legend || {};
    options.plugins.legend.labels = {
      color: colors.text,
      usePointStyle: true,
      ...(options.plugins.legend.labels || {})
    };
    return options;
  }

  function chartOptions(unit) {
    return stableChartOptions({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: { title: { display: true, text: unit } }
      }
    });
  }

  function renderCharts() {
    if (typeof Chart === 'undefined') {
      throw new Error('Chart.js n’est pas chargé');
    }

    const labels = [
      'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
      'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'
    ];
    const normals = data.normals.monthly;
    const currentMonths = data.currentYear.monthly || [];

    temperatureChart = window.MeteoChartManager.create('climate-temperature', byId('climate-temperature-chart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Normale 1991–2020',
            data: normals.map(month => month.temperatureMean),
            borderWidth: 2,
            pointRadius: 2,
            tension: 0.25,
            borderColor: climateColors().blue,
            backgroundColor: climateColors().blueFill
          },
          {
            label: String(data.currentYear.year || 'Année en cours'),
            data: currentMonths.map(month => month.temperatureMean),
            borderWidth: 2,
            pointRadius: 2,
            tension: 0.25,
            borderColor: climateColors().pink,
            backgroundColor: climateColors().pinkFill
          }
        ]
      },
      options: chartOptions('°C')
    });

    precipitationChart = window.MeteoChartManager.create('climate-precipitation', byId('climate-precipitation-chart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Normale 1991–2020',
            data: normals.map(month => month.precipitation),
            backgroundColor: climateColors().blueFill,
            borderColor: climateColors().blueBorder,
            borderWidth: 1
          },
          {
            label: String(data.currentYear.year || 'Année en cours'),
            data: currentMonths.map(month => month.precipitation),
            backgroundColor: climateColors().pinkFill,
            borderColor: climateColors().pink,
            borderWidth: 1
          }
        ]
      },
      options: chartOptions('mm')
    });

    const recentYears = data.recentYears;
    yearsChart = window.MeteoChartManager.create('climate-years', byId('climate-years-chart'), {
      type: 'bar',
      data: {
        labels: recentYears.map(item => item.year),
        datasets: [
          {
            label: 'Pluie annuelle (mm)',
            data: recentYears.map(item => item.precipitation),
            yAxisID: 'rain',
            backgroundColor: climateColors().blueFill,
            borderColor: climateColors().blueBorder,
            borderWidth: 1
          },
          {
            label: 'Température moyenne (°C)',
            data: recentYears.map(item => item.temperatureMean),
            type: 'line',
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.2,
            yAxisID: 'temperature',
            borderColor: climateColors().pink,
            backgroundColor: climateColors().pinkFill
          }
        ]
      },
      options: stableChartOptions({
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { grid: { display: false } },
          rain: {
            position: 'left',
            title: { display: true, text: 'mm' }
          },
          temperature: {
            position: 'right',
            grid: { drawOnChartArea: false },
            title: { display: true, text: '°C' }
          }
        }
      })
    });
  }

  function renderRecords() {
    const records = data.records || {};
    const cards = [
      ['🌡️', 'Température maximale', records.highestTemperature, '°C'],
      ['❄️', 'Température minimale', records.lowestTemperature, '°C'],
      ['🌧️', 'Journée la plus arrosée', records.wettestDay, 'mm'],
      ['💨', 'Rafale maximale', records.strongestGust, 'km/h']
    ];

    const grid = byId('climate-record-grid');
    if (!grid) return;

    grid.innerHTML = cards.map(card => `
      <article class="climate-record">
        <span>${card[0]}</span>
        <div>
          <small>${card[1]}</small>
          <strong>${displayNumber(card[2]?.value, 1)} ${card[3]}</strong>
          <em>${formatDate(card[2]?.date)}${card[2]?.estimated ? ' · réanalyse' : ''}</em>
        </div>
      </article>
    `).join('');
  }


  function linearTrend(values) {
    const points = values.map((value, index) => ({ x: index, y: numeric(value) })).filter(point => point.y !== null);
    if (points.length < 2) return values.map(() => null);
    const n = points.length;
    const sx = points.reduce((sum, p) => sum + p.x, 0);
    const sy = points.reduce((sum, p) => sum + p.y, 0);
    const sxy = points.reduce((sum, p) => sum + p.x * p.y, 0);
    const sxx = points.reduce((sum, p) => sum + p.x * p.x, 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const intercept = (sy - slope * sx) / n;
    return values.map((_, index) => Number((intercept + slope * index).toFixed(2)));
  }

  function anomalyOptions(unit, positiveLabel, negativeLabel) {
    return stableChartOptions({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel(context) {
              const value = Number(context.raw);
              if (!Number.isFinite(value) || value === 0) return 'Conforme à la normale';
              return value > 0 ? positiveLabel : negativeLabel;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          title: { display: true, text: unit },
          suggestedMin: unit === '°C' ? -1 : -30,
          suggestedMax: unit === '°C' ? 1 : 30
        }
      }
    });
  }

  function renderAdvancedCharts() {
    if (typeof Chart === 'undefined') return;
    const years = data.recentYears || [];
    const baselineTemp = normalTemperature();
    const annualRainNormal = normalPrecipitation();
    const labels = years.map(item => item.year);
    const tempValues = years.map(item => numeric(item.temperatureMean));
    const temperatureAnomalies = tempValues.map(value =>
      value === null || baselineTemp === null
        ? null
        : Number((value - baselineTemp).toFixed(2))
    );
    const rainAnomalies = years.map(item => {
      const value = numeric(item.precipitation);
      return value === null || !annualRainNormal
        ? null
        : Number((100 * (value - annualRainNormal) / annualRainNormal).toFixed(1));
    });

    const temperatureCanvas = byId('climate-temperature-anomaly-chart');
    if (temperatureCanvas) {
      temperatureAnomalyChart = window.MeteoChartManager.create('climate-temperature-anomaly', temperatureCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Écart à la normale (°C)',
            data: temperatureAnomalies,
            borderWidth: 1,
            borderColor: context => Number(context.raw) >= 0 ? climateColors().red : climateColors().blueBorder,
            backgroundColor: context => Number(context.raw) >= 0 ? climateColors().redFill : climateColors().blueFill
          }]
        },
        options: anomalyOptions('°C', 'Plus chaude que la normale', 'Plus froide que la normale')
      });
    }

    const rainCanvas = byId('climate-rain-anomaly-chart');
    if (rainCanvas) {
      rainAnomalyChart = window.MeteoChartManager.create('climate-rain-anomaly', rainCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Écart à la normale (%)',
            data: rainAnomalies,
            borderWidth: 1,
            borderColor: context => Number(context.raw) >= 0 ? climateColors().blueBorder : climateColors().orange,
            backgroundColor: context => Number(context.raw) >= 0 ? climateColors().blueFill : climateColors().orangeFill
          }]
        },
        options: anomalyOptions('%', 'Plus humide que la normale', 'Plus sèche que la normale')
      });
    }

    const trendCanvas = byId('climate-trend-chart');
    if (trendCanvas) {
      trendChart = window.MeteoChartManager.create('climate-trend', trendCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Température moyenne', data: tempValues, borderWidth: 2, pointRadius: 3, tension: .2, borderColor: climateColors().blue, backgroundColor: climateColors().blueFill },
            { label: 'Tendance linéaire', data: linearTrend(tempValues), borderDash: [8, 5], borderWidth: 2, pointRadius: 0, borderColor: climateColors().pink, backgroundColor: climateColors().pinkFill }
          ]
        },
        options: chartOptions('°C')
      });
    }
  }

  async function refresh() {
    const location = activeLocation || savedLocation();
    if (!location) {
      setStatus('Choisis une localisation avant l’actualisation');
      return;
    }

    try {
      await loadDynamic(location, true);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error(error);
      setLoading(false);
      setStatus(`Erreur climatologique : ${error.message}`);
    }
  }

  async function handleLocationChange(event) {
    const location = normalizeLocation(event?.detail);
    if (!location) return;
    if (locationsMatch(location, activeLocation)) return;

    try {
      await loadDynamic(location);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error(error);
      setLoading(false);
      setStatus(`Climatologie indisponible pour ${location.name}`);
    }
  }

  async function init() {
    if (!byId('climate-center-section')) return;

    byId('climate-refresh')?.addEventListener('click', refresh);
    window.addEventListener('meteo-location-changed', handleLocationChange);

    const location = savedLocation() || normalizeLocation(
      window.MeteoConfig?.defaultLocation
    );

    if (location) {
      try {
        await loadDynamic(location);
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
        console.warn('Calcul dynamique indisponible, utilisation du cache', error);
      }
    }

    try {
      await loadStaticFallback();
    } catch (error) {
      console.error(error);
      setLoading(false);
      setStatus('Lance Build climate data ou choisis une localisation');
    }
  }

  return {
    init,
    refresh,
    loadLocation: location => loadDynamic(location, true)
  };
})();

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    () => window.ClimateCenter.init()
  );
} else {
  window.ClimateCenter.init();
}
