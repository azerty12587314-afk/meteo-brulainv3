'use strict';

window.ClimateCenter = (() => {
  const DATA_URL = './data/climate.json';
  const byId = id => document.getElementById(id);
  let data;
  let temperatureChart;
  let precipitationChart;
  let yearsChart;

  const numeric = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const displayNumber = (value, digits = 0) => {
    const parsed = numeric(value);
    return parsed === null ? '--' : parsed.toFixed(digits);
  };

  const formatDate = value => {
    if (!value) return '--';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '--';
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(parsed);
  };

  const isValid = value =>
    Boolean(
      value &&
      Array.isArray(value?.normals?.monthly) &&
      value.normals.monthly.length === 12 &&
      Array.isArray(value?.recentYears) &&
      value.recentYears.length > 0 &&
      value?.currentYear
    );

  async function load(force = false) {
    const version = force ? Date.now() : 'climate-2';
    const response = await fetch(`${DATA_URL}?v=${version}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const received = await response.json();
    if (!isValid(received)) {
      throw new Error('Données climatiques incomplètes');
    }

    data = received;
    render();
  }

  function normalPrecipitation() {
    return data.normals.monthly.reduce(
      (sum, month) => sum + (numeric(month.precipitation) || 0),
      0
    );
  }

  function normalTemperature() {
    const values = data.normals.monthly
      .map(month => numeric(month.temperatureMean))
      .filter(value => value !== null);
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  }

  function render() {
    const current = data.currentYear;
    const meanNormal = normalTemperature();
    const rainNormal = normalPrecipitation();
    const tempAnomaly =
      meanNormal === null || numeric(current.temperatureMean) === null
        ? null
        : Number(current.temperatureMean) - meanNormal;
    const rainDifference =
      !rainNormal || numeric(current.precipitation) === null
        ? null
        : Number(current.precipitation) - rainNormal;

    const updated = byId('climate-updated-at');
    if (updated) {
      const locationName = data?.location?.name || '';
      updated.textContent = `${locationName} · ${new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(data.generatedAt))}`;
    }

    const cards = [
      ['🌡️', `Température ${current.year || ''}`, `${displayNumber(current.temperatureMean, 1)} °C`,
        tempAnomaly === null ? 'Anomalie indisponible' : `${tempAnomaly >= 0 ? '+' : ''}${tempAnomaly.toFixed(1)} °C`],
      ['🌧️', 'Pluie cumulée', `${displayNumber(current.precipitation)} mm`,
        rainDifference === null ? 'Écart indisponible' : `${rainDifference >= 0 ? '+' : ''}${rainDifference.toFixed(0)} mm`],
      ['❄️', 'Jours de gel', displayNumber(current.frostDays), 'Minimum < 0 °C'],
      ['🔥', 'Jours ≥ 30 °C', displayNumber(current.hotDays), 'Jours très chauds'],
      ['☀️', 'Ensoleillement', `${displayNumber(current.sunshineHours)} h`, 'Durée cumulée'],
      ['🏠', 'Degrés-jours', displayNumber(current.heatingDegreeDays), 'Base 18 °C'],
      ['🌙', 'Nuits tropicales', displayNumber(current.tropicalNights), 'Minimum ≥ 20 °C'],
      ['🌾', 'Bilan hydrique',
        `${displayNumber((numeric(current.precipitation) || 0) - (numeric(current.evapotranspiration) || 0))} mm`,
        'Pluie - ETP']
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
  }

  function chartOptions(unit) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true } }
      },
      scales: {
        x: { grid: { display: false } },
        y: { title: { display: true, text: unit } }
      }
    };
  }

  function renderCharts() {
    if (typeof Chart === 'undefined') {
      throw new Error('Chart.js n’est pas chargé');
    }

    const labels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
      'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    const normals = data.normals.monthly;
    const currentMonths = data.currentYear.monthly || [];

    temperatureChart?.destroy();
    temperatureChart = new Chart(byId('climate-temperature-chart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Normale 1991–2020',
            data: normals.map(month => month.temperatureMean),
            borderWidth: 2,
            pointRadius: 2,
            tension: 0.25
          },
          {
            label: String(data.currentYear.year || 'Année en cours'),
            data: currentMonths.map(month => month.temperatureMean),
            borderWidth: 2,
            pointRadius: 2,
            tension: 0.25
          }
        ]
      },
      options: chartOptions('°C')
    });

    precipitationChart?.destroy();
    precipitationChart = new Chart(byId('climate-precipitation-chart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Normale 1991–2020',
            data: normals.map(month => month.precipitation)
          },
          {
            label: String(data.currentYear.year || 'Année en cours'),
            data: currentMonths.map(month => month.precipitation)
          }
        ]
      },
      options: chartOptions('mm')
    });

    const recentYears = data.recentYears;
    yearsChart?.destroy();
    yearsChart = new Chart(byId('climate-years-chart'), {
      type: 'bar',
      data: {
        labels: recentYears.map(item => item.year),
        datasets: [
          {
            label: 'Pluie annuelle (mm)',
            data: recentYears.map(item => item.precipitation),
            yAxisID: 'rain'
          },
          {
            label: 'Température moyenne (°C)',
            data: recentYears.map(item => item.temperatureMean),
            type: 'line',
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.2,
            yAxisID: 'temperature'
          }
        ]
      },
      options: {
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
      }
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

  async function refresh() {
    const button = byId('climate-refresh');
    if (button) {
      button.disabled = true;
      button.textContent = 'Chargement…';
    }

    try {
      await load(true);
    } catch (error) {
      console.error(error);
      const updated = byId('climate-updated-at');
      if (updated) updated.textContent = 'Données indisponibles — lance Build climate data';
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = '↻ Actualiser';
      }
    }
  }

  async function init() {
    if (!byId('climate-center-section')) return;
    byId('climate-refresh')?.addEventListener('click', refresh);

    try {
      await load();
    } catch (error) {
      console.error(error);
      const updated = byId('climate-updated-at');
      if (updated) updated.textContent = 'Lance Build climate data';
    }
  }

  return { init, refresh };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.ClimateCenter.init());
} else {
  window.ClimateCenter.init();
}
