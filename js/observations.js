'use strict';

window.ObservationCenter = (() => {
  const DATA_URL = './observations/data.json';
  const CENTRAL_DATA_URL = './data/site-data.json';

  let payload = null;
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

  async function loadCache() {
    let central = null;

    if (window.SiteDataStore) {
      try {
        central = await window.SiteDataStore.load();
      } catch {
        central = null;
      }
    }

    if (central) {
      payload = {
        generatedAt: central.generatedAt,
        location: central.location,
        air: central.air,
        rivers: central.rivers || [],
        metar: central.metar || [],
        errors: central.errors || []
      };
    } else {
      const response = await fetch(`${DATA_URL}?v=${Date.now()}`, {
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Cache observations HTTP ${response.status}`);
      }

      payload = await response.json();
    }

    renderAll();

    const badge = $('metar-updated-at');
    if (badge) {
      badge.textContent = payload.generatedAt
        ? `Mis à jour ${formatDate(payload.generatedAt)}`
        : 'Workflow non exécuté';
    }
  }

  function renderAll() {
    renderAir(payload?.air);
    renderRivers(payload?.rivers || []);
    renderMetar(payload?.metar || []);
    renderWebcams();
    renderProviderWarnings(payload?.errors || []);
  }

  function renderProviderWarnings(errors) {
    document.querySelector('.observation-provider-warning')?.remove();

    if (!errors.length) return;

    const warning = document.createElement('div');
    warning.className = 'observation-provider-warning';
    warning.innerHTML = `
      <strong>Certaines sources sont temporairement indisponibles.</strong>
      <span>${errors.map(error => error.split(':')[0]).join(', ')}</span>
    `;

    $('observation-center')?.prepend(warning);
  }

  function renderAir(air) {
    const container = $('air-observation-grid');

    if (!air?.current) {
      if (container) {
        container.innerHTML = `
          <div class="observation-empty">
            Données air non disponibles. Lance le workflow
            <strong>Update observations</strong>.
          </div>
        `;
      }
      destroyAirCharts();
      return;
    }

    const current = air.current;
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

    if (container) {
      container.innerHTML = metrics.map(metric => `
        <article class="observation-metric">
          <span class="observation-icon">${metric.icon}</span>
          <span class="observation-name">${metric.name}</span>
          <strong>${metric.value}</strong>
          <small>${metric.detail}</small>
        </article>
      `).join('');
    }

    renderAirCharts(air.hourly || {});
  }

  function destroyAirCharts() {
    window.MeteoChartManager?.destroy('observations-air');
    window.MeteoChartManager?.destroy('observations-pollen');
    airChart?.destroy();
    pollenChart?.destroy();
    airChart = null;
    pollenChart = null;
  }

  function renderAirCharts(hourly) {
    if (
      typeof Chart === 'undefined' ||
      !hourly.time?.length ||
      !$('air-observation-chart') ||
      !$('pollen-observation-chart')
    ) {
      return;
    }

    const length = Math.min(24, hourly.time.length);
    const labels = hourly.time.slice(0, length).map(time =>
      new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(time))
    );

    airChart = window.MeteoChartManager.create('observations-air', $('air-observation-chart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'AQI européen',
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56,189,248,.14)',
            data: hourly.european_aqi?.slice(0, length) || [],
            borderWidth: 2,
            pointRadius: 0,
            tension: .25,
            yAxisID: 'aqi'
          },
          {
            label: 'PM2.5',
            borderColor: '#f472b6',
            backgroundColor: 'rgba(244,114,182,.14)',
            data: hourly.pm2_5?.slice(0, length) || [],
            borderWidth: 2,
            pointRadius: 0,
            tension: .25,
            yAxisID: 'particles'
          },
          {
            label: 'PM10',
            borderColor: '#a78bfa',
            backgroundColor: 'rgba(167,139,250,.14)',
            data: hourly.pm10?.slice(0, length) || [],
            borderWidth: 2,
            pointRadius: 0,
            tension: .25,
            yAxisID: 'particles'
          }
        ]
      },
      options: chartOptions('AQI', 'µg/m³')
    });

    const pollenDatasets = [
      ['Graminées', hourly.grass_pollen, '#84cc16'],
      ['Bouleau', hourly.birch_pollen, '#fbbf24'],
      ['Aulne', hourly.alder_pollen, '#fb923c'],
      ['Armoise', hourly.mugwort_pollen, '#a78bfa'],
      ['Ambroisie', hourly.ragweed_pollen, '#f472b6']
    ].map(([label, values, color]) => ({
      label,
      data: values?.slice(0, length) || [],
      borderColor: color,
      backgroundColor: 'transparent',
      pointBackgroundColor: color,
      borderWidth: 2,
      pointRadius: 0,
      tension: .25
    }));

    pollenChart = window.MeteoChartManager.create('observations-pollen', $('pollen-observation-chart'), {
      type: 'line',
      data: {
        labels,
        datasets: pollenDatasets
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
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 8 }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'grains/m³' }
          }
        }
      }
    });
  }

  function chartOptions(leftTitle, rightTitle) {
    return {
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
        x: {
          grid: { display: false },
          ticks: { maxTicksLimit: 8 }
        },
        aqi: {
          position: 'left',
          beginAtZero: true,
          title: { display: true, text: leftTitle }
        },
        particles: {
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          title: { display: true, text: rightTitle }
        }
      }
    };
  }

  function renderRivers(rivers) {
    const container = $('river-observation-list');
    if (!container) return;

    if (!rivers.length) {
      container.innerHTML = `
        <div class="observation-empty">
          Aucune station hydrométrique disponible dans le cache.
        </div>
      `;
      return;
    }

    const radius = Number($('river-radius')?.value || .7);
    const approximateRadiusKm = radius * 90;
    const filtered = rivers.filter(
      river => Number(river.distanceKm) <= approximateRadiusKm
    );

    if (!filtered.length) {
      container.innerHTML = `
        <div class="observation-empty">
          Aucune station dans le rayon sélectionné.
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(river => {
      const reading = river.reading;
      let readingText = 'Aucune mesure';
      let detail = '';

      if (reading) {
        const value = Number(reading.value);

        if (reading.quantity === 'H') {
          readingText = Number.isFinite(value)
            ? `${(value / 1000).toFixed(2)} m`
            : '--';
          detail = 'Hauteur';
        } else {
          readingText = Number.isFinite(value)
            ? `${(value / 1000).toFixed(2)} m³/s`
            : '--';
          detail = 'Débit';
        }

        if (reading.date) {
          detail += ` · ${formatDate(reading.date)}`;
        }
      }

      return `
        <article class="river-observation-item">
          <div>
            <h4>${river.name}</h4>
            <p>${Number(river.distanceKm).toFixed(1)} km · ${river.code}</p>
          </div>
          <div class="river-reading">
            <strong>${readingText}</strong>
            <span>${detail}</span>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderMetar(stations) {
    const container = $('metar-observation-grid');
    if (!container) return;

    if (!stations.length) {
      container.innerHTML = `
        <div class="observation-empty">
          Aucune observation METAR récente dans le cache.
        </div>
      `;
      return;
    }

    container.innerHTML = stations.map(station => `
      <article class="metar-card">
        <h4>${station.name || station.icaoId}</h4>
        <p>${station.icaoId} · ${formatDate(station.reportTime)}</p>
        <div class="metar-values">
          <span>🌡️ ${formatNumber(station.temp)} °C</span>
          <span>💧 ${formatNumber(station.dewp)} °C rosée</span>
          <span>💨 ${formatNumber(station.wspd)} kt</span>
          <span>🧭 ${formatNumber(station.wdir)}°</span>
          <span>👁️ ${formatNumber(station.visib)} km</span>
          <span>🔵 ${formatNumber(station.altim)} hPa</span>
        </div>
        <div class="metar-raw">
          ${station.rawOb || 'METAR brut indisponible'}
        </div>
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

    try {
      await loadCache();
    } catch (error) {
      console.error(error);

      const airContainer = $('air-observation-grid');
      if (airContainer) {
        airContainer.innerHTML = `
          <div class="observation-error">
            Le fichier observations/data.json est inaccessible.
            Vérifie que la V11.1 a été entièrement envoyée sur GitHub.
          </div>
        `;
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = '↻ Actualiser';
      }
    }
  }

  function bind() {
    bindTabs();
    $('observations-refresh')?.addEventListener('click', refreshAll);
    $('river-radius')?.addEventListener('change', () => {
      renderRivers(payload?.rivers || []);
    });
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.ObservationCenter.init();
  });
} else {
  window.ObservationCenter.init();
}
