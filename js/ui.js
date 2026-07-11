'use strict';

window.MeteoUI = (() => {
  function ensureToolbar() {
    if (document.querySelector('.weather-toolbar')) return;

    const toolbar = document.createElement('section');
    toolbar.className = 'card weather-toolbar';
    toolbar.setAttribute('aria-label', 'Recherche et actions');
    toolbar.innerHTML = `
      <form id="location-form" class="location-form">
        <label class="sr-only" for="location-search">Rechercher une ville</label>
        <input id="location-search" type="search" autocomplete="off"
               placeholder="Rechercher une ville…" aria-label="Rechercher une ville">
        <button type="submit">Rechercher</button>
      </form>
      <div class="toolbar-actions">
        <button id="geolocate-button" type="button">📍 Ma position</button>
        <button id="refresh-button" type="button">↻ Actualiser</button>
      </div>
      <div id="search-results" class="search-results" hidden></div>
    `;
    document.querySelector('main').prepend(toolbar);

    const extraCss = document.createElement('style');
    extraCss.textContent = `
      .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      .weather-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:1rem;overflow:visible}
      .location-form{display:flex;gap:.65rem}
      .location-form input{width:100%;min-height:44px;padding:.75rem 1rem;color:var(--text);border:1px solid var(--border);border-radius:999px;background:rgba(15,23,42,.62)}
      .toolbar-actions{display:flex;gap:.65rem}
      .search-results{grid-column:1/-1;display:grid;gap:.4rem;padding:.5rem;border:1px solid var(--border);border-radius:16px;background:var(--surface-strong)}
      .search-result{justify-content:flex-start;width:100%;color:var(--text);border-radius:12px;background:rgba(255,255,255,.06);box-shadow:none}
      @media(max-width:720px){.weather-toolbar{grid-template-columns:1fr}.location-form{flex-direction:column}.toolbar-actions{display:grid;grid-template-columns:1fr 1fr}.search-results{grid-column:auto}}
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
    message.className = `app-message ${type === 'success' ? 'success-message' : 'error-message'}`;
    message.setAttribute('role', 'status');
    message.textContent = text;
    document.querySelector('main').prepend(message);
    setTimeout(() => message.remove(), 7000);
  }

  function renderCurrent(forecast, location) {
    const current = forecast.current || {};
    const info = WeatherUtils.info(current.weather_code, current.is_day);

    document.getElementById('location').textContent = location.name;
    document.getElementById('weather-icon').textContent = info.icon;
    document.getElementById('temperature').textContent = WeatherUtils.formatTemperature(current.temperature_2m);
    document.getElementById('description').textContent =
      `${info.text} · Ressenti ${WeatherUtils.formatTemperature(current.apparent_temperature)}`;

    document.title = `${WeatherUtils.formatTemperature(current.temperature_2m)} — ${location.name} | Météo Lab`;
    document.body.className = `weather-${info.theme}${current.is_day === 0 ? ' is-night' : ''}`;
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
        <strong>${WeatherUtils.formatTime(daily.sunrise?.[0], forecast.timezone)} – ${WeatherUtils.formatTime(daily.sunset?.[0], forecast.timezone)}</strong>
        <p class="metric-detail">UV max : ${WeatherUtils.formatNumber(daily.uv_index_max?.[0], '', 1)} (${WeatherUtils.uvLabel(daily.uv_index_max?.[0])})</p>`,
      'wind-card': `
        <span class="metric-icon">💨</span>
        <span class="metric-label">Vent</span>
        <strong>${WeatherUtils.formatNumber(current.wind_speed_10m, ' km/h')}</strong>
        <p class="metric-detail">${WeatherUtils.windDirection(current.wind_direction_10m)} · Rafales ${WeatherUtils.formatNumber(current.wind_gusts_10m, ' km/h')}</p>`,
      'uv-card': `
        <span class="metric-icon">💧</span>
        <span class="metric-label">Atmosphère</span>
        <strong>${WeatherUtils.formatNumber(current.relative_humidity_2m, '%')}</strong>
        <p class="metric-detail">Pression ${WeatherUtils.formatNumber(current.surface_pressure, ' hPa')}</p>`,
      'air-card': `
        <span class="metric-icon">🍃</span>
        <span class="metric-label">Qualité de l’air</span>
        <strong>${quality.label}</strong>
        <p class="metric-detail">AQI ${WeatherUtils.formatNumber(aqi)} · Pollens ${WeatherUtils.pollenSummary(hourlyAir)}</p>`
    };
    Object.entries(cards).forEach(([id, html]) => {
      const node = document.getElementById(id);
      if (node) node.innerHTML = html;
    });
  }

  function renderHourly(forecast) {
    const h = forecast.hourly;
    const container = document.getElementById('hourly');
    if (!h || !container) return;
    const now = Date.now();
    let start = h.time.findIndex(time => new Date(time).getTime() >= now - 30 * 60 * 1000);
    if (start < 0) start = 0;
    const end = Math.min(start + MeteoConfig.hourlyHours, h.time.length);
    container.innerHTML = h.time.slice(start, end).map((time, offset) => {
      const i = start + offset;
      const info = WeatherUtils.info(h.weather_code[i], h.is_day[i]);
      return `
        <article class="hourly-item">
          <span class="hour-time">${WeatherUtils.formatTime(time, forecast.timezone)}</span>
          <span class="hour-icon" title="${info.text}">${info.icon}</span>
          <strong class="hour-temp">${WeatherUtils.formatTemperature(h.temperature_2m[i])}</strong>
          <span>${WeatherUtils.formatNumber(h.precipitation_probability[i], '%')} pluie</span>
          <small>${WeatherUtils.formatNumber(h.wind_speed_10m[i], ' km/h')}</small>
        </article>`;
    }).join('');
  }

  function renderDaily(forecast) {
    const d = forecast.daily;
    const container = document.getElementById('daily');
    if (!d || !container) return;
    container.innerHTML = d.time.slice(0, 7).map((time, i) => {
      const info = WeatherUtils.info(d.weather_code[i], 1);
      return `
        <article class="daily-item">
          <span class="day-name">${i === 0 ? "Aujourd’hui" : WeatherUtils.formatDay(time, forecast.timezone)}</span>
          <span class="day-icon" title="${info.text}">${info.icon}</span>
          <div class="day-temp">
            <span class="day-max">${WeatherUtils.formatTemperature(d.temperature_2m_max[i])}</span>
            <span class="day-min">${WeatherUtils.formatTemperature(d.temperature_2m_min[i])}</span>
          </div>
          <small>${WeatherUtils.formatNumber(d.precipitation_probability_max[i], '%')} pluie</small>
        </article>`;
    }).join('');
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
    container.innerHTML = results.map((place, index) => `
      <button class="search-result" type="button" data-index="${index}">
        📍 ${place.name}${place.admin1 ? `, ${place.admin1}` : ''}${place.country ? ` — ${place.country}` : ''}
      </button>`).join('');
    container.querySelectorAll('[data-index]').forEach(button => {
      button.addEventListener('click', () => {
        onSelect(results[Number(button.dataset.index)]);
        container.hidden = true;
      });
    });
  }



  const MODEL_UPDATE_STORAGE_KEY = 'meteo-model-observed-updates-v1';

  function loadObservedModelUpdates() {
    try {
      return JSON.parse(localStorage.getItem(MODEL_UPDATE_STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveObservedModelUpdates(state) {
    try {
      localStorage.setItem(MODEL_UPDATE_STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  function modelSignature(data) {
    const h = data?.hourly;
    if (!h?.time?.length) return null;
    const indexes = [0, 1, 2, 6, 12, 24, 36, 47].filter(i => i < h.time.length);
    return JSON.stringify(indexes.map(i => [
      h.time[i],
      h.temperature_2m?.[i] ?? null,
      h.precipitation?.[i] ?? null,
      h.wind_gusts_10m?.[i] ?? null
    ]));
  }

  function observeModelUpdate(key, data, state, nowIso) {
    const signature = modelSignature(data);
    if (!signature) return { available: false, observedAt: state[key]?.observedAt || null };
    if (!state[key] || state[key].signature !== signature) {
      state[key] = { signature, observedAt: nowIso };
    }
    return { available: true, observedAt: state[key].observedAt };
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
    const byKey = Object.fromEntries(models.map(model => [model.key, model]));

    const entries = [
      ['arome', 'AROME', aromeResult?.data],
      ['arpege', 'ARPEGE', byKey.arpege?.data],
      ['ecmwf', 'ECMWF', byKey.ecmwf?.data],
      ['icon', 'ICON', byKey.icon?.data],
      ['gfs', 'GFS', byKey.gfs?.data]
    ].map(([key, label, data]) => ({
      key, label, ...observeModelUpdate(key, data, state, nowIso)
    }));

    saveObservedModelUpdates(state);

    container.innerHTML = entries.map(entry => `
      <p class="model-update-row ${entry.available ? 'is-available' : 'is-unavailable'}">
        <span><span class="model-update-dot" aria-hidden="true"></span>${entry.label}</span>
        <strong>${entry.available ? formatObservedTime(entry.observedAt) : 'Indisponible'}</strong>
      </p>
    `).join('');
  }

  return {
        definition,
        available: Boolean(result?.data),
        fetchedAt: result?.fetchedAt ? new Date(result.fetchedAt) : new Date()
      };
    });

    cards.unshift({
      definition: MeteoConfig.aromeRunDefinition,
      available: Boolean(aromeResult?.data),
      fetchedAt: aromeResult?.fetchedAt ? new Date(aromeResult.fetchedAt) : new Date()
    });

    grid.innerHTML = cards.map(({ definition, available, fetchedAt }) => {
      const run = estimateLatestRun(definition, fetchedAt);
      return `
        <article class="model-status-item ${available ? 'is-online' : 'is-offline'}">
          <div class="model-status-topline">
            <strong>${definition.label}</strong>
            <span class="status-dot" aria-hidden="true"></span>
          </div>
          <span class="model-run">${formatRun(run)}</span>
          <span class="model-fetch">
            ${available ? 'Données reçues' : 'Données indisponibles'} · ${formatAge(fetchedAt)}
          </span>
        </article>`;
    }).join('');

    if (globalBadge) {
      globalBadge.textContent = `Actualisé à ${new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(new Date())}`;
    }
  }

  return {
    ensureToolbar, setLoading, showMessage, renderCurrent,
    renderDashboard, renderHourly, renderDaily, renderSearchResults, renderModelStatuses
  };
})();
