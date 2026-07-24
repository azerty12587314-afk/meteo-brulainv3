'use strict';

window.MeteoChartManager = (() => {
  const charts = new Map();
  const palette = [
    { border: '#38bdf8', fill: 'rgba(56,189,248,.18)' },
    { border: '#f472b6', fill: 'rgba(244,114,182,.16)' },
    { border: '#a78bfa', fill: 'rgba(167,139,250,.16)' },
    { border: '#34d399', fill: 'rgba(52,211,153,.16)' },
    { border: '#fbbf24', fill: 'rgba(251,191,36,.16)' },
    { border: '#fb7185', fill: 'rgba(251,113,133,.16)' }
  ];

  function configureDefaults() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = '#cbd5e1';
    Chart.defaults.borderColor = 'rgba(148,163,184,.20)';
    Chart.defaults.font.family = 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    Chart.defaults.animation.duration = 350;
    if (Chart.defaults.plugins?.legend?.labels) {
      Chart.defaults.plugins.legend.labels.color = '#cbd5e1';
      Chart.defaults.plugins.legend.labels.usePointStyle = true;
    }
  }

  function ensureDatasetColors(config) {
    const datasets = config?.data?.datasets || [];
    datasets.forEach((dataset, index) => {
      const tone = palette[index % palette.length];
      if (dataset.borderColor == null) dataset.borderColor = tone.border;
      if (dataset.backgroundColor == null) {
        dataset.backgroundColor = config.type === 'bar' ? tone.fill : 'transparent';
      }
      if (dataset.pointBackgroundColor == null) dataset.pointBackgroundColor = tone.border;
      if (dataset.pointBorderColor == null) dataset.pointBorderColor = tone.border;
      if (dataset.hoverBorderColor == null) dataset.hoverBorderColor = tone.border;
      if (dataset.hoverBackgroundColor == null) dataset.hoverBackgroundColor = tone.fill;
    });
    return config;
  }

  function resolveCanvas(canvasOrId) {
    return typeof canvasOrId === 'string'
      ? document.getElementById(canvasOrId)
      : canvasOrId;
  }

  function destroy(keyOrCanvas) {
    if (typeof keyOrCanvas === 'string' && charts.has(keyOrCanvas)) {
      charts.get(keyOrCanvas)?.destroy();
      charts.delete(keyOrCanvas);
      return;
    }
    const canvas = resolveCanvas(keyOrCanvas);
    if (!canvas || typeof Chart === 'undefined') return;
    const current = Chart.getChart?.(canvas);
    current?.destroy();
    for (const [key, chart] of charts.entries()) {
      if (chart?.canvas === canvas) charts.delete(key);
    }
  }

  function create(key, canvasOrId, config) {
    if (typeof Chart === 'undefined') return null;
    const canvas = resolveCanvas(canvasOrId);
    if (!canvas) return null;

    configureDefaults();
    destroy(key);
    destroy(canvas);

    const prepared = ensureDatasetColors(config);
    prepared.options = prepared.options || {};
    prepared.options.responsive = prepared.options.responsive !== false;
    prepared.options.maintainAspectRatio = prepared.options.maintainAspectRatio === true;
    prepared.options.plugins = prepared.options.plugins || {};
    prepared.options.plugins.colors = { enabled: false, forceOverride: false };

    const chart = new Chart(canvas, prepared);
    charts.set(key, chart);
    requestAnimationFrame(() => chart.resize());
    return chart;
  }

  function resizeAll() {
    charts.forEach(chart => {
      if (chart?.canvas?.isConnected) chart.resize();
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestAnimationFrame(resizeAll);
  });
  window.addEventListener('resize', resizeAll, { passive: true });
  window.addEventListener('meteo-location-changed', () => {
    requestAnimationFrame(resizeAll);
  });

  return { create, destroy, resizeAll, configureDefaults, palette };
})();
