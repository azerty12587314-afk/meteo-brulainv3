'use strict';

window.MeteoCharts = (() => {
  let modelChart = null;

  const palette = ['#22d3ee', '#c084fc', '#fb7185', '#818cf8'];

  function chartDefaults() {
    Chart.defaults.color = '#cbd5e1';
    Chart.defaults.borderColor = 'rgba(148,163,184,.18)';
    Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  }

  function renderModels(models) {
    const canvas = document.getElementById('modelsChart');
    if (!canvas || typeof Chart === 'undefined') return;
    chartDefaults();

    const first = models.find(item => item.data?.hourly?.time);
    if (!first) {
      canvas.parentElement.insertAdjacentHTML('beforeend', '<p class="error-message">Comparaison des modèles momentanément indisponible.</p>');
      return;
    }

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

    if (modelChart) modelChart.destroy();
    modelChart = new Chart(canvas, {
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
          x: {
            ticks: { maxTicksLimit: 12 },
            grid: { display: false }
          },
          y: {
            ticks: { callback: value => `${value}°` }
          }
        }
      }
    });
  }

  function destroy() {
    if (modelChart) {
      modelChart.destroy();
      modelChart = null;
    }
  }

  return { renderModels, destroy };
})();
