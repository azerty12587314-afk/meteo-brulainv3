'use strict';

window.ObservationCenter = (() => {
  const AIR_ENDPOINT =
    'https://air-quality-api.open-meteo.com/v1/air-quality';
  const HYDRO_STATIONS_ENDPOINT =
    'https://hubeau.eaufrance.fr/api/v2/hydrometrie/referentiel/stations';
  const HYDRO_OBSERVATIONS_ENDPOINT =
    'https://hubeau.eaufrance.fr/api/v2/hydrometrie/observations_tr';

  let airChart = null;
  let pollenChart = null;

  const $ = id => document.getElementById(id);
  const config = () => window.ObservationsConfig;

  function formatNumber(value, digits = 0, fallback = '--') {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits) : fallback;
  }

  function formatDate(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';

    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function aqiLabel(value) {
    const aqi = Number(value);
    if (!Number.isFinite(aqi)) return 'Indisponible';
    if (aqi <= 20) return 'Très bonne';
    if (aqi <= 40) return 'Bonne';
    if (aqi <= 60) return 'Moyenne';
    if (aqi <= 80) return 'Mauvaise';
    if (aqi <= 100) return 'Très mauvaise';
    return 'Extrêmement mauvaise';
  }

  function uvLabel(value) {
    const uv = Number(value);
    if (!Number.isFinite(uv)) return 'Indisponible';
    if (uv < 3) return 'Faible';
    if (uv < 6) return 'Modéré';
    if (uv < 8) return 'Élevé';
    if (uv < 11) return 'Très élevé';
    return 'Extrême';
  }

  function pollenLevel(value) {
    const pollen = Number(value);
    if (!Number.isFinite(pollen)) return 'Indisponible';
    if (pollen < 1) return 'Très faible';
    if (pollen < 10) return 'Faible';
    if (pollen < 50) return 'Modéré';
    if (pollen < 100) return 'Élevé';
    return 'Très élevé';
  }

  function switchTab(tabName) {
    document.querySelectorAll('[data-observation-tab]').forEach(button => {
      button.classList.toggle(
        'active',
        button.dataset.observationTab === tabName
      );
    });

    document.querySelectorAll('[data-observation-panel]').forEach(panel => {
      const active = panel.dataset.observationPanel === tabName;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
  }

  function bindTabs() {
    document.querySelectorAll('[data-observation-tab]').forEach(button => {
      button.addEventListener('click', () => {
        switchTab(button.dataset.observationTab);
      });
    });
  }

  async function loadAirQuality() {
    const location = config().location;
    const params = new URLSearchParams({
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone,
      forecast_hours: '36',
      current: [
        'european_aqi',
        'pm10',
        'pm2_5',
        'nitrogen_dioxide',
        'ozone',
        'uv_index',
        'grass_pollen',
        'birch_pollen',
        'alder_pollen',
        'mugwort_pollen',
        'ragweed_pollen'
      ].join(','),
      hourly: [
        'european_aqi',
        'pm10',
        'pm2_5',
        'uv_index',
        'grass_pollen',
        'birch_pollen',
        'alder_pollen',
        'mugwort_pollen',
        'ragweed_pollen'
      ].join(',')
    });

    const response = await fetch(`${AIR_ENDPOINT}?${params}`, {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Air Quality HTTP ${response.status}`);
    }

    const data = await response.json();
    renderAirMetrics(data.current || {});
    renderAirCharts(data.hourly || {});
  }

  function renderAirMetrics(current) {
    const pollenValues = [
      current.grass_pollen,
      current.birch_pollen,
      current.alder_pollen,
      current.mugwort_pollen,
      current.ragweed_pollen
    ].map(Number).filter(Number.isFinite);

    const pollenMax = pollenValues.length ? Math.max(...pollenValues) : NaN;

    const metrics = [
      {
        icon: '🍃',
        name: 'AQI européen',
        value: formatNumber(current.european_aqi),
        detail: aqiLabel(current.european_aqi)
      },
      {
        icon: '🌫️',
        name: 'PM2.5',
        value: `${formatNumber(current.pm2_5, 1)} µg/m³`,
        detail: 'Particules fines'
      },
      {
        icon: '🏭',
        name: 'PM10',
        value: `${formatNumber(current.pm10, 1)} µg/m³`,
        detail: 'Poussières'
      },
      {
        icon: '☀️',
        name: 'UV',
        value: formatNumber(current.uv_index, 1),
        detail: uvLabel(current.uv_index)
      },
      {
        icon: '🌾',
        name: 'Pollen maximal',
        value: `${formatNumber(pollenMax, 1)} grains/m³`,
        detail: pollenLevel(pollenMax)
      },
      {
        icon: '🟠',
        name: 'Ozone',
        value: `${formatNumber(current.ozone, 1)} µg/m³`,
        detail: 'Concentration actuelle'
      }
    ];

    const container = $('air-observation-grid');
    if (!container) return;

    container.innerHTML = metrics.map(metric => `
      <article class="observation-metric">
        <span class="observation-icon">${metric.icon}</span>
        <span class="observation-name">${metric.name}</span>
        <strong>${metric.value}</strong>
        <small>${metric.detail}</small>
      </article>
    `).join('');
  }

  function renderAirCharts(hourly) {
    if (typeof Chart === 'undefined' || !hourly.time?.length) return;

    const length = Math.min(24, hourly.time.length);
    const labels = hourly.time.slice(0, length).map(time =>
      new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(time))
    );

    if (airChart) airChart.destroy();
    airChart = new Chart($('air-observation-chart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'AQI européen',
            data: hourly.european_aqi?.slice(0, length) || [],
            borderWidth: 2,
            pointRadius: 0,
            tension: .25,
            yAxisID: 'aqi'
          },
          {
            label: 'PM2.5',
            data: hourly.pm2_5?.slice(0, length) || [],
            borderWidth: 2,
            pointRadius: 0,
            tension: .25,
            yAxisID: 'particles'
          },
          {
            label: 'PM10',
            data: hourly.pm10?.slice(0, length) || [],
            borderWidth: 2,
            pointRadius: 0,
            tension: .25,
            yAxisID: 'particles'
          }
        ]
      },
      options: {
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
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
          aqi: {
            position: 'left',
            beginAtZero: true,
            title: { display: true, text: 'AQI' }
          },
          particles: {
            position: 'right',
            beginAtZero: true,
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'µg/m³' }
          }
        }
      }
    });

    const pollenDatasets = [
      ['Graminées', hourly.grass_pollen],
      ['Bouleau', hourly.birch_pollen],
      ['Aulne', hourly.alder_pollen],
      ['Armoise', hourly.mugwort_pollen],
      ['Ambroisie', hourly.ragweed_pollen]
    ].map(([label, values]) => ({
      label,
      data: values?.slice(0, length) || [],
      borderWidth: 2,
      pointRadius: 0,
      tension: .25
    }));

    if (pollenChart) pollenChart.destroy();
    pollenChart = new Chart($('pollen-observation-chart'), {
      type: 'line',
      data: { labels, datasets: pollenDatasets },
      options: {
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
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'grains/m³' }
          }
        }
      }
    });
  }

  function stationCoordinates(station) {
    const latitude = Number(
      station.latitude_station ??
      station.latitude ??
      station.coordonnees?.latitude
    );
    const longitude = Number(
      station.longitude_station ??
      station.longitude ??
      station.coordonnees?.longitude
    );

    return { latitude, longitude };
  }

  function distanceKm(lat1, lon1, lat2, lon2) {
    const toRadians = degrees => degrees * Math.PI / 180;
    const earthRadius = 6371;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

    return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async function loadRivers() {
    const container = $('river-observation-list');
    if (!container) return;

    container.innerHTML =
      '<div class="observation-loading">Recherche des stations…</div>';

    const location = config().location;
    const radius = Number($('river-radius')?.value || .7);

    const bbox = [
      location.longitude - radius,
      location.latitude - radius,
      location.longitude + radius,
      location.latitude + radius
    ].join(',');

    const params = new URLSearchParams({
      bbox,
      size: '50',
      format: 'json'
    });

    try {
      const response = await fetch(`${HYDRO_STATIONS_ENDPOINT}?${params}`, {
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Hub’Eau stations HTTP ${response.status}`);
      }

      const payload = await response.json();
      const stations = (payload.data || [])
        .map(station => {
          const coordinates = stationCoordinates(station);
          return {
            ...station,
            ...coordinates,
            distance: Number.isFinite(coordinates.latitude) &&
              Number.isFinite(coordinates.longitude)
              ? distanceKm(
                  location.latitude,
                  location.longitude,
                  coordinates.latitude,
                  coordinates.longitude
                )
              : Infinity
          };
        })
        .filter(station => Number.isFinite(station.distance))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 6);

      if (!stations.length) {
        container.innerHTML =
          '<div class="observation-empty">Aucune station trouvée dans ce rayon.</div>';
        return;
      }

      const enriched = await Promise.all(
        stations.map(station => loadLatestRiverReading(station))
      );

      renderRivers(enriched);
    } catch (error) {
      console.error(error);
      container.innerHTML =
        '<div class="observation-error">Les données hydrométriques sont indisponibles.</div>';
    }
  }

  async function loadLatestRiverReading(station) {
    const code =
      station.code_station ??
      station.code_entite ??
      station.code_station_hydro;

    if (!code) return { station, reading: null };

    for (const grandeur of ['H', 'Q']) {
      try {
        const params = new URLSearchParams({
          code_entite: code,
          grandeur_hydro: grandeur,
          size: '1',
          fields: [
            'code_station',
            'date_obs',
            'resultat_obs',
            'grandeur_hydro'
          ].join(',')
        });

        const response = await fetch(
          `${HYDRO_OBSERVATIONS_ENDPOINT}?${params}`,
          { cache: 'no-store' }
        );

        if (!response.ok) continue;
        const payload = await response.json();
        const reading = payload.data?.[0];

        if (reading) {
          return { station, reading: { ...reading, grandeur } };
        }
      } catch {
        // Essayer l’autre grandeur.
      }
    }

    return { station, reading: null };
  }

  function renderRivers(items) {
    const container = $('river-observation-list');
    if (!container) return;

    container.innerHTML = items.map(({ station, reading }) => {
      const name =
        station.libelle_station ??
        station.libelle_site ??
        station.nom_station ??
        station.code_station ??
        'Station hydrométrique';

      let readingText = 'Aucune mesure';
      let unit = '';
      let detail = '';

      if (reading) {
        const value = Number(reading.resultat_obs);

        if (reading.grandeur === 'H') {
          readingText = Number.isFinite(value)
            ? `${(value / 1000).toFixed(2)} m`
            : '--';
          unit = 'Hauteur';
        } else {
          readingText = Number.isFinite(value)
            ? `${(value / 1000).toFixed(2)} m³/s`
            : '--';
          unit = 'Débit';
        }

        detail = formatDate(reading.date_obs);
      }

      return `
        <article class="river-observation-item">
          <div>
            <h4>${name}</h4>
            <p>
              ${station.distance.toFixed(1)} km ·
              ${station.code_station ?? station.code_entite ?? ''}
            </p>
          </div>
          <div class="river-reading">
            <strong>${readingText}</strong>
            <span>${unit}${detail ? ` · ${detail}` : ''}</span>
          </div>
        </article>
      `;
    }).join('');
  }

  async function loadMetar() {
    const container = $('metar-observation-grid');
    if (!container) return;

    container.innerHTML =
      '<div class="observation-loading">Chargement des observations…</div>';

    try {
      const response = await fetch(
        `./observations/metar.json?v=${Date.now()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error(`METAR cache HTTP ${response.status}`);
      }

      const payload = await response.json();
      renderMetar(payload);

      const badge = $('metar-updated-at');
      if (badge) {
        badge.textContent = payload.generatedAt
          ? `Mis à jour ${formatDate(payload.generatedAt)}`
          : 'Mise à jour inconnue';
      }
    } catch (error) {
      console.error(error);
      container.innerHTML =
        '<div class="observation-error">Le cache METAR n’est pas encore disponible. Lance le workflow Update observations.</div>';
    }
  }

  function renderMetar(payload) {
    const container = $('metar-observation-grid');
    if (!container) return;

    const stations = payload.stations || [];

    if (!stations.length) {
      container.innerHTML =
        '<div class="observation-empty">Aucune observation METAR récente.</div>';
      return;
    }

    container.innerHTML = stations.map(station => `
      <article class="metar-card">
        <h4>${station.name || station.icaoId}</h4>
        <p>${station.icaoId} · ${formatDate(station.reportTime)}</p>
        <div class="metar-values">
          <span>🌡️ ${formatNumber(station.temp, 0)} °C</span>
          <span>💧 ${formatNumber(station.dewp, 0)} °C rosée</span>
          <span>💨 ${formatNumber(station.wspd, 0)} kt</span>
          <span>🧭 ${formatNumber(station.wdir, 0)}°</span>
          <span>👁️ ${formatNumber(station.visib, 0)} km</span>
          <span>🔵 ${formatNumber(station.altim, 0)} hPa</span>
        </div>
        <div class="metar-raw">${station.rawOb || 'METAR brut indisponible'}</div>
      </article>
    `).join('');
  }

  function renderWebcams() {
    const container = $('webcam-observation-grid');
    if (!container) return;

    const webcams = config().webcams || [];

    if (!webcams.length) {
      container.innerHTML = `
        <div class="webcam-placeholder">
          <div>
            <strong>Aucune webcam configurée.</strong>
            <p>
              Ajoute une URL d’image dans
              <code>js/observations-config.js</code>.
            </p>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = webcams.map(webcam => `
      <article class="webcam-card">
        <a
          href="${webcam.pageUrl || webcam.imageUrl}"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="${webcam.imageUrl}"
            alt="${webcam.name}"
            loading="lazy"
            referrerpolicy="no-referrer"
          >
        </a>
        <div class="webcam-card-body">
          <h4>${webcam.name}</h4>
          <p>${webcam.description || ''}</p>
        </div>
      </article>
    `).join('');
  }

  async function refreshAll() {
    const button = $('observations-refresh');
    if (button) {
      button.disabled = true;
      button.textContent = 'Chargement…';
    }

    await Promise.allSettled([
      loadAirQuality(),
      loadRivers(),
      loadMetar()
    ]);

    renderWebcams();

    if (button) {
      button.disabled = false;
      button.textContent = '↻ Actualiser';
    }
  }

  function bind() {
    bindTabs();

    $('observations-refresh')?.addEventListener('click', refreshAll);
    $('river-radius')?.addEventListener('change', loadRivers);
  }

  async function init() {
    if (!$('observation-center')) return;
    bind();
    renderWebcams();
    await refreshAll();
  }

  return {
    init,
    refreshAll
  };
})();

document.addEventListener('DOMContentLoaded', ObservationCenter.init);
