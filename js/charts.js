'use strict';

window.MeteoCharts = (() => {
  let modelChart = null;
  let aromeChart = null;
  let ecmwfLongChart = null;
  let currentArome = null;
  let currentAromeType = 'temp';

  const palette = ['#22d3ee', '#c084fc', '#fb7185', '#818cf8'];

  function chartDefaults() {
    Chart.defaults.color = '#cbd5e1';
    Chart.defaults.borderColor = 'rgba(148,163,184,.18)';
    Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  }

  function formatLabel(time, timezone, longDate = false) {
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: timezone || 'Europe/Paris',
      ...(longDate
        ? { day: '2-digit', month: 'short', hour: '2-digit' }
        : { day: '2-digit', hour: '2-digit' })
    }).format(new Date(time));
  }

  function baseOptions(unit, beginAtZero = false, maxTicks = 10) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 650 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(2,6,23,.94)',
          borderColor: 'rgba(148,163,184,.28)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: context => `${context.dataset.label}: ${Number(context.parsed.y).toFixed(1)}${unit}`
          }
        }
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: maxTicks },
          grid: { color: 'rgba(148,163,184,.14)' }
        },
        y: {
          beginAtZero,
          ticks: { callback: value => `${value}${unit}` },
          grid: { color: 'rgba(148,163,184,.18)' }
        }
      }
    };
  }

  function renderModels(models) {
    const canvas = document.getElementById('modelsChart');
    if (!canvas || typeof Chart === 'undefined') return;
    chartDefaults();

    const first = models.find(item => item.data?.hourly?.time);
    if (!first) return;

    const length = Math.min(120, first.data.hourly.time.length);
    const labels = first.data.hourly.time.slice(0, length).map(time =>
      new Intl.DateTimeFormat('fr-FR', {
        weekday: 'short', hour: '2-digit'
      }).format(new Date(time))
    );

    const datasets = models
      .filter(item => item.data?.hourly?.temperature_2m)
      .map((item, index) => ({
        label: item.label,
        data: item.data.hourly.temperature_2m.slice(0, length),
        borderColor: palette[index % palette.length],
        backgroundColor: 'transparent',
        borderWidth: item.key === 'ecmwf' ? 3 : 2,
        pointRadius: 0,
        tension: 0.2
      }));

    modelChart = window.MeteoChartManager.create('forecast-models', canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, padding: 18 }
          },
          tooltip: {
            callbacks: {
              label: context => `${context.dataset.label}: ${context.parsed.y.toFixed(1)}°C`
            }
          }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 12 }, grid: { display: false } },
          y: { ticks: { callback: value => `${value}°` } }
        }
      }
    });
  }

  function aromeDefinition(type) {
    if (type === 'rain') {
      return {
        key: 'precipitation', label: 'Précipitations AROME',
        unit: ' mm', color: '#38bdf8',
        fill: 'rgba(56,189,248,.35)', beginAtZero: true, chartType: 'bar'
      };
    }
    if (type === 'wind') {
      return {
        key: 'wind_gusts_10m', label: 'Rafales AROME',
        unit: ' km/h', color: '#67e8f9',
        fill: 'rgba(103,232,249,.11)', beginAtZero: true, chartType: 'line'
      };
    }
    return {
      key: 'temperature_2m', label: 'Température AROME',
      unit: '°C', color: '#fbbf24',
      fill: 'rgba(251,191,36,.14)', beginAtZero: false, chartType: 'line'
    };
  }

  function renderArome(result, type = currentAromeType) {
    const canvas = document.getElementById('aromeChart');
    if (!canvas || typeof Chart === 'undefined') return;
    chartDefaults();
    currentArome = result;
    currentAromeType = type;

    document.querySelectorAll('[data-arome-type]').forEach(button => {
      const active = button.dataset.aromeType === type;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    const label = document.getElementById('arome-model-label');
    if (!result?.data?.hourly) {
      if (label) label.textContent = 'AROME indisponible pour ce lieu ou cette échéance.';
      if (aromeChart) aromeChart.destroy();
      return;
    }

    if (label) label.textContent = `🎯 ${result.label}`;
    const hourly = result.data.hourly;
    const def = aromeDefinition(type);
    const values = hourly[def.key] || [];
    const length = Math.min(48, hourly.time.length, values.length);

    aromeChart = window.MeteoChartManager.create('forecast-arome', canvas, {
      type: def.chartType,
      data: {
        labels: hourly.time.slice(0, length).map(time =>
          formatLabel(time, result.data.timezone)
        ),
        datasets: [{
          label: def.label,
          data: values.slice(0, length),
          borderColor: def.color,
          backgroundColor: def.fill,
          borderWidth: 3,
          pointRadius: 0,
          hoverRadius: 4,
          fill: def.chartType === 'line',
          tension: 0.25,
          borderRadius: def.chartType === 'bar' ? 4 : 0,
          barPercentage: 0.82,
          categoryPercentage: 0.92
        }]
      },
      options: baseOptions(def.unit, def.beginAtZero, 8)
    });
  }

  function setAromeType(type) {
    if (['temp', 'rain', 'wind'].includes(type)) renderArome(currentArome, type);
  }

  function renderEcmwfLong(data) {
    const canvas = document.getElementById('ecmwfLongChart');
    if (!canvas || typeof Chart === 'undefined') return;
    chartDefaults();

    const hourly = data?.hourly;
    if (!hourly?.time || !hourly?.temperature_2m) return;

    const start = Math.min(120, hourly.time.length);
    const end = Math.min(240, hourly.time.length);
    const options = baseOptions('°C', false, 10);
    options.plugins.legend = {
      display: true,
      position: 'top',
      labels: { color: '#f8fafc', padding: 16 }
    };

    ecmwfLongChart = window.MeteoChartManager.create('forecast-ecmwf-long', canvas, {
      type: 'line',
      data: {
        labels: hourly.time.slice(start, end).map(time =>
          formatLabel(time, data.timezone, true)
        ),
        datasets: [{
          label: 'Tendance ECMWF IFS (J+5 à J+10)',
          data: hourly.temperature_2m.slice(start, end),
          borderColor: '#635bff',
          backgroundColor: 'rgba(99,91,255,.13)',
          borderWidth: 3,
          pointRadius: 0,
          hoverRadius: 4,
          fill: true,
          tension: 0.28
        }]
      },
      options
    });
  }

  function destroy() {
    ['forecast-models', 'forecast-arome', 'forecast-ecmwf-long'].forEach(key => window.MeteoChartManager?.destroy(key));
    [modelChart, aromeChart, ecmwfLongChart].forEach(chart => chart?.destroy());
    modelChart = aromeChart = ecmwfLongChart = null;
  }

  return { renderModels, renderArome, setAromeType, renderEcmwfLong, destroy };
})();
