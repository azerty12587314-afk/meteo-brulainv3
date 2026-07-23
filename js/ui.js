'use strict';

window.MeteoUI = (() => {
  const MODEL_UPDATE_STORAGE_KEY = 'meteo-model-observed-updates-v1';

  function ensureToolbar() {
    if (document.querySelector('.weather-toolbar')) return;

    const toolbar = document.createElement('section');
    toolbar.className = 'card weather-toolbar';
    toolbar.setAttribute('aria-label', 'Recherche et actions');
    toolbar.innerHTML = `
      <form id="location-form" class="location-form">
        <label class="sr-only" for="location-search">Rechercher une ville</label>
        <input
          id="location-search"
          type="search"
          autocomplete="off"
          placeholder="Rechercher une ville…"
          aria-label="Rechercher une ville"
        >
        <button type="submit">Rechercher</button>
      </form>

      <div class="toolbar-actions">
        <button id="geolocate-button" type="button">📍 Ma position</button>
        <button id="refresh-button" type="button">↻ Actualiser</button>
      </div>

      <div id="search-results" class="search-results" hidden></div>
    `;

    document.querySelector('main')?.prepend(toolbar);

    const extraCss = document.createElement('style');
    extraCss.textContent = `
      .sr-only{
        position:absolute;
        width:1px;
        height:1px;
        padding:0;
        margin:-1px;
        overflow:hidden;
        clip:rect(0,0,0,0);
        white-space:nowrap;
        border:0
      }
      .weather-toolbar{
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        gap:1rem;
        overflow:visible
      }
      .location-form{
        display:flex;
        gap:.65rem
      }
      .location-form input{
        width:100%;
        min-height:44px;
        padding:.75rem 1rem;
        color:var(--text);
        border:1px solid var(--border);
        border-radius:999px;
        background:rgba(15,23,42,.62)
      }
      .toolbar-actions{
        display:flex;
        gap:.65rem
      }
      .search-results{
        grid-column:1/-1;
        display:grid;
        gap:.4rem;
        padding:.5rem;
        border:1px solid var(--border);
        border-radius:16px;
        background:var(--surface-strong)
      }
      .search-result{
        justify-content:flex-start;
        width:100%;
        color:var(--text);
        border-radius:12px;
        background:rgba(255,255,255,.06);
        box-shadow:none
      }
      @media(max-width:720px){
        .weather-toolbar{grid-template-columns:1fr}
        .location-form{flex-direction:column}
        .toolbar-actions{display:grid;grid-template-columns:1fr 1fr}
        .search-results{grid-column:auto}
      }
    `;
    document.head.appendChild(extraCss);
  }

  function setLoading(isLoading) {
    document.body.classList.toggle('app-loading', isLoading);

    const refresh = document.getElementById('refresh-button');
    if (refresh) {
      refresh.disabled = isLoading;
      refresh.textContent = isLoading ? 'Chargement…' : '↻ Actualiser';
    }
  }

  function showMessage(text, type = 'error') {
    document.querySelector('.app-message')?.remove();

    const message = document.createElement('div');
    message.className =
      `app-message ${type === 'success' ? 'success-message' : 'error-message'}`;
    message.setAttribute('role', 'status');
    message.textContent = text;

    document.querySelector('main')?.prepend(message);
    window.setTimeout(() => message.remove(), 7000);
  }

  function renderCurrent(forecast, currentLocation) {
    const current = forecast.current || {};
    const info = WeatherUtils.info(current.weather_code, current.is_day);

    document.getElementById('location').textContent = currentLocation.name;
    document.getElementById('weather-icon').textContent = info.icon;
    document.getElementById('temperature').textContent =
      WeatherUtils.formatTemperature(current.temperature_2m);
    document.getElementById('description').textContent =
      `${info.text} · Ressenti ${WeatherUtils.formatTemperature(current.apparent_temperature)}`;

    document.title =
      `${WeatherUtils.formatTemperature(current.temperature_2m)} — ` +
      `${currentLocation.name} | Météo Lab`;

    document.body.className =
      `weather-${info.theme}${current.is_day === 0 ? ' is-night' : ''}`;
  }

  function renderDashboard(forecast, air) {
    const current = forecast.current || {};
    const daily = forecast.daily || {};
    const hourlyAir = air?.hourly;
    const aqi = hourlyAir?.european_aqi?.[0];
    const quality = WeatherUtils.airQualityLabel(aqi);

    const cards = {
      'sun-card': `
        <span class="metric-icon">🌅</span>
        <span class="metric-label">Soleil</span>
        <strong>
          ${WeatherUtils.formatTime(daily.sunrise?.[0], forecast.timezone)}
          –
          ${WeatherUtils.formatTime(daily.sunset?.[0], forecast.timezone)}
        </strong>
        <p class="metric-detail">
          UV max : ${WeatherUtils.formatNumber(daily.uv_index_max?.[0], '', 1)}
          (${WeatherUtils.uvLabel(daily.uv_index_max?.[0])})
        </p>
      `,
      'wind-card': `
        <span class="metric-icon">💨</span>
        <span class="metric-label">Vent</span>
        <strong>${WeatherUtils.formatNumber(current.wind_speed_10m, ' km/h')}</strong>
        <p class="metric-detail">
          ${WeatherUtils.windDirection(current.wind_direction_10m)}
          · Rafales ${WeatherUtils.formatNumber(current.wind_gusts_10m, ' km/h')}
        </p>
      `,
      'uv-card': `
        <span class="metric-icon">💧</span>
        <span class="metric-label">Atmosphère</span>
        <strong>${WeatherUtils.formatNumber(current.relative_humidity_2m, '%')}</strong>
        <p class="metric-detail">
          Pression ${WeatherUtils.formatNumber(current.surface_pressure, ' hPa')}
        </p>
      `,
      'air-card': `
        <span class="metric-icon">🍃</span>
        <span class="metric-label">Qualité de l’air</span>
        <strong>${quality.label}</strong>
        <p class="metric-detail">
          AQI ${WeatherUtils.formatNumber(aqi)}
          · Pollens ${WeatherUtils.pollenSummary(hourlyAir)}
        </p>
      `
    };

    Object.entries(cards).forEach(([id, html]) => {
      const element = document.getElementById(id);
      if (element) element.innerHTML = html;
    });
  }

  function renderHourly(forecast) {
    const hourly = forecast.hourly;
    const container = document.getElementById('hourly');
    if (!hourly || !container) return;

    const now = Date.now();
    let start = hourly.time.findIndex(
      time => new Date(time).getTime() >= now - 30 * 60 * 1000
    );
    if (start < 0) start = 0;

    const end = Math.min(
      start + MeteoConfig.hourlyHours,
      hourly.time.length
    );

    container.innerHTML = hourly.time
      .slice(start, end)
      .map((time, offset) => {
        const index = start + offset;
        const info = WeatherUtils.info(
          hourly.weather_code[index],
          hourly.is_day[index]
        );

        return `
          <article class="hourly-item">
            <span class="hour-time">
              ${WeatherUtils.formatTime(time, forecast.timezone)}
            </span>
            <span class="hour-icon" title="${info.text}">
              ${info.icon}
            </span>
            <strong class="hour-temp">
              ${WeatherUtils.formatTemperature(hourly.temperature_2m[index])}
            </strong>
            <span>
              ${WeatherUtils.formatNumber(
                hourly.precipitation_probability[index],
                '%'
              )} pluie
            </span>
            <small>
              ${WeatherUtils.formatNumber(hourly.wind_speed_10m[index], ' km/h')}
            </small>
          </article>
        `;
      })
      .join('');
  }

  let dailyBundle = null;
  let dailySelection = 'fusion';

  function sourceDefinition(key) {
    return MeteoConfig.dailyForecastModels[key] || {
      label: 'Automatique',
      icon: '🌐'
    };
  }

  function confidenceStars(confidence) {
    const count = confidence?.stars || 1;
    return `${'★'.repeat(count)}${'☆'.repeat(5 - count)}`;
  }

  function selectedDailyForecast(bundle, selection) {
    if (selection === 'fusion') {
      return bundle?.fusion || null;
    }

    const source = bundle?.sources?.[selection];
    if (!source) return null;

    const dates = source.data?.daily?.time || [];
    return {
      timezone: source.data?.timezone,
      daily: source.data?.daily,
      days: dates.map(date => ({
        date,
        sourceKey: selection,
        sourceLabel: source.label,
        sourceIcon: source.icon,
        confidence: bundle.fusion?.days?.find(day => day.date === date)
          ?.confidence
      }))
    };
  }

  function renderDaily(bundle, selection = 'fusion') {
    dailyBundle = bundle;
    dailySelection = selection;

    const forecast = selectedDailyForecast(bundle, selection);
    const daily = forecast?.daily;
    const container = document.getElementById('daily');
    const status = document.getElementById('daily-model-status');

    if (!daily?.time?.length || !container) {
      if (status) {
        const unavailable = sourceDefinition(selection);
        status.textContent =
          `${unavailable.icon} ${unavailable.label} est momentanément indisponible. ` +
          `Les cartes précédentes sont conservées.`;
      }
      return;
    }

    const definition = sourceDefinition(selection);

    if (status) {
      status.textContent = selection === 'fusion'
        ? 'Fusion : AROME J0–J2, ARPEGE J3–J4, ECMWF J5–J7, GFS ensuite.'
        : `${definition.icon} Prévisions brutes ${definition.label}.`;
    }

    container.innerHTML = daily.time
      .slice(0, 10)
      .map((time, index) => {
        const info = WeatherUtils.info(daily.weather_code[index], 1);
        const metadata = forecast.days?.[index] || {};
        const confidence = metadata.confidence;
        const hasTemperature =
          WeatherUtils.isAvailableValue(daily.temperature_2m_max[index]) &&
          WeatherUtils.isAvailableValue(daily.temperature_2m_min[index]);

        return `
          <button
            class="daily-item daily-item-button source-${metadata.sourceKey || selection}${hasTemperature ? '' : ' daily-item-missing'}"
            type="button"
            data-daily-index="${index}"
          >
            <span class="day-name">
              ${
                index === 0
                  ? 'Aujourd’hui'
                  : WeatherUtils.formatDay(time, forecast.timezone)
              }
            </span>

            <span class="day-source">
              ${metadata.sourceIcon || definition.icon}
              ${metadata.sourceLabel || definition.label}
            </span>

            <span class="day-icon" title="${info.text}">
              ${info.icon}
            </span>

            <div class="day-temp">
              <span class="day-max">
                ${WeatherUtils.formatTemperature(daily.temperature_2m_max[index])}
              </span>
              <span class="day-min">
                ${WeatherUtils.formatTemperature(daily.temperature_2m_min[index])}
              </span>
            </div>

            <small>
              ${WeatherUtils.formatNumber(
                daily.precipitation_probability_max[index],
                '%'
              )} pluie
            </small>

            <span
              class="day-confidence"
              title="${hasTemperature
                ? (confidence?.label || 'Confiance non calculée')
                : 'Données de température indisponibles'}"
            >
              ${hasTemperature
                ? confidenceStars(confidence)
                : 'Données indisponibles'}
            </span>
          </button>
        `;
      })
      .join('');

    container.querySelectorAll('[data-daily-index]').forEach(button => {
      button.addEventListener('click', () => {
        renderDailyComparison(Number(button.dataset.dailyIndex));
      });
    });
  }

  function renderDailyComparison(index) {
    const selected = selectedDailyForecast(dailyBundle, dailySelection);
    const date = selected?.daily?.time?.[index];
    const panel = document.getElementById('daily-comparison');
    const grid = document.getElementById('daily-comparison-grid');

    if (!date || !panel || !grid) return;

    const fusionDay = dailyBundle?.fusion?.days?.find(day => day.date === date);
    const confidence = fusionDay?.confidence;

    document.getElementById('daily-comparison-title').textContent =
      `Comparaison du ${WeatherUtils.formatDay(date, selected.timezone)}`;

    document.getElementById('daily-comparison-confidence').textContent =
      confidence
        ? `${confidenceStars(confidence)} ${confidence.label} · ` +
          `${confidence.modelCount} modèles · écart température ` +
          `${confidence.temperatureSpread.toFixed(1)} °C`
        : 'Confiance non calculée';

    const rows = Object.entries(dailyBundle?.sources || {})
      .map(([key, source]) => {
        const daily = source.data?.daily;
        const sourceIndex = daily?.time?.indexOf(date) ?? -1;

        if (sourceIndex < 0) return '';

        return `
          <article class="daily-comparison-model source-${key}">
            <strong>${source.icon} ${source.label}</strong>
            <span>
              🌡️ ${WeatherUtils.formatTemperature(
                daily.temperature_2m_max[sourceIndex]
              )} /
              ${WeatherUtils.formatTemperature(
                daily.temperature_2m_min[sourceIndex]
              )}
            </span>
            <span>
              🌧️ ${WeatherUtils.formatNumber(
                daily.precipitation_probability_max[sourceIndex],
                '%'
              )} ·
              ${WeatherUtils.formatNumber(
                daily.precipitation_sum[sourceIndex],
                ' mm',
                1
              )}
            </span>
            <span>
              💨 ${WeatherUtils.formatNumber(
                daily.wind_gusts_10m_max[sourceIndex],
                ' km/h'
              )}
            </span>
          </article>
        `;
      })
      .filter(Boolean)
      .join('');

    grid.innerHTML = rows ||
      '<p class="daily-comparison-empty">Aucune comparaison disponible.</p>';

    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeDailyComparison() {
    const panel = document.getElementById('daily-comparison');
    if (panel) panel.hidden = true;
  }


  function renderSearchResults(results, onSelect) {
    const container = document.getElementById('search-results');
    if (!container) return;

    if (!results.length) {
      container.hidden = false;
      container.innerHTML = '<p>Aucun lieu trouvé.</p>';
      return;
    }

    container.hidden = false;
    container.innerHTML = results
      .map((place, index) => `
        <button class="search-result" type="button" data-index="${index}">
          📍 ${place.name}
          ${place.admin1 ? `, ${place.admin1}` : ''}
          ${place.country ? ` — ${place.country}` : ''}
        </button>
      `)
      .join('');

    container.querySelectorAll('[data-index]').forEach(button => {
      button.addEventListener('click', () => {
        onSelect(results[Number(button.dataset.index)]);
        container.hidden = true;
      });
    });
  }

  function loadObservedModelUpdates() {
    try {
      return JSON.parse(
        localStorage.getItem(MODEL_UPDATE_STORAGE_KEY)
      ) || {};
    } catch {
      return {};
    }
  }

  function saveObservedModelUpdates(state) {
    try {
      localStorage.setItem(
        MODEL_UPDATE_STORAGE_KEY,
        JSON.stringify(state)
      );
    } catch {
      // Le site reste fonctionnel si le stockage local est bloqué.
    }
  }

  function modelSignature(data) {
    const hourly = data?.hourly;
    if (!hourly?.time?.length) return null;

    const indexes = [0, 1, 2, 6, 12, 24, 36, 47]
      .filter(index => index < hourly.time.length);

    return JSON.stringify(
      indexes.map(index => [
        hourly.time[index],
        hourly.temperature_2m?.[index] ?? null,
        hourly.precipitation?.[index] ?? null,
        hourly.wind_gusts_10m?.[index] ?? null
      ])
    );
  }

  function observeModelUpdate(key, data, state, nowIso) {
    const signature = modelSignature(data);

    if (!signature) {
      return {
        available: false,
        observedAt: state[key]?.observedAt || null
      };
    }

    if (!state[key] || state[key].signature !== signature) {
      state[key] = {
        signature,
        observedAt: nowIso
      };
    }

    return {
      available: true,
      observedAt: state[key].observedAt
    };
  }

  function formatObservedTime(iso) {
    if (!iso) return '--:--';

    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(iso));
  }

  function renderModelStatuses(models, aromeResult) {
    const container = document.getElementById('model-update-list');
    if (!container) return;

    const state = loadObservedModelUpdates();
    const nowIso = new Date().toISOString();
    const byKey = Object.fromEntries(
      models.map(model => [model.key, model])
    );

    const entries = [
      ['arome', 'AROME', aromeResult?.data],
      ['arpege', 'ARPEGE', byKey.arpege?.data],
      ['ecmwf', 'ECMWF', byKey.ecmwf?.data],
      ['icon', 'ICON', byKey.icon?.data],
      ['gfs', 'GFS', byKey.gfs?.data]
    ].map(([key, label, data]) => ({
      key,
      label,
      ...observeModelUpdate(key, data, state, nowIso)
    }));

    saveObservedModelUpdates(state);

    container.innerHTML = entries
      .map(entry => `
        <p class="model-update-row ${
          entry.available ? 'is-available' : 'is-unavailable'
        }">
          <span>
            <span class="model-update-dot" aria-hidden="true"></span>
            ${entry.label}
          </span>
          <strong>
            ${
              entry.available
                ? formatObservedTime(entry.observedAt)
                : 'Indisponible'
            }
          </strong>
        </p>
      `)
      .join('');
  }

  return {
    ensureToolbar,
    setLoading,
    showMessage,
    renderCurrent,
    renderDashboard,
    renderHourly,
    renderDaily,
    closeDailyComparison,
    renderSearchResults,
    renderModelStatuses
  };
})();
