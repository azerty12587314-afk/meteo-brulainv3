'use strict';

window.ModelMapPlayer = (() => {
  const MANIFEST_URL = './maps/manifest.json';

  const DEFAULT_LEGENDS = {
    temp2m: {
      title: 'Température à 2 m',
      unit: '°C',
      ticks: [-30, -20, -10, 0, 10, 20, 30, 40],
      gradient:
        'linear-gradient(90deg,#30123b,#4145ab,#4675ed,#39a2fc,' +
        '#1bcfd4,#24eca6,#61fc6c,#a4fc3c,#d9ef36,#f9c63a,' +
        '#fb8734,#ed4a27,#c91d15,#7a0403)'
    },
    mslp: {
      title: 'Pression au niveau de la mer',
      unit: 'hPa',
      ticks: [960, 980, 1000, 1020, 1040],
      gradient:
        'linear-gradient(90deg,#312e81,#2563eb,#22d3ee,#4ade80,' +
        '#fde047,#fb923c,#ef4444)'
    },
    precip: {
      title: 'Précipitations cumulées',
      unit: 'mm',
      ticks: [0.1, 1, 5, 10, 20, 50, 100],
      gradient:
        'linear-gradient(90deg,#e0f2fe,#7dd3fc,#22d3ee,#22c55e,' +
        '#eab308,#f97316,#dc2626,#7e22ce)'
    },
    wind10: {
      title: 'Vitesse du vent à 10 m',
      unit: 'km/h',
      ticks: [0, 20, 40, 60, 80, 100],
      gradient:
        'linear-gradient(90deg,#440154,#3b528b,#21918c,#5ec962,#fde725)'
    },
    cape: { title: 'CAPE', unit: 'J/kg', ticks: [0,250,500,1000,2000,3000,4000], gradient: 'linear-gradient(90deg,#f8fafc,#bfdbfe,#22c55e,#fde047,#fb923c,#ef4444,#7e22ce)' },
    jet300: { title: 'Jet stream 300 hPa', unit: 'km/h', ticks: [0,50,100,150,200,250,300], gradient: 'linear-gradient(90deg,#0f172a,#1d4ed8,#06b6d4,#22c55e,#fde047,#f97316,#dc2626,#7e22ce)' }
  };

  let manifest = null;
  let frames = [];
  let currentIndex = 0;
  let timer = null;
  let playing = false;
  let currentObjectUrl = null;

  const $ = id => document.getElementById(id);

  function getSelectedModelKey() {
    return $('model-player-model')?.value || '';
  }

  function getSelectedVariableKey() {
    return $('model-player-variable')?.value || '';
  }

  function getModelData() {
    return manifest?.models?.[getSelectedModelKey()] || null;
  }

  function getVariableData() {
    return getModelData()?.variables?.[getSelectedVariableKey()] || null;
  }

  function populateModels() {
    const select = $('model-player-model');
    if (!select) return;
    const previous = select.value;
    const models = manifest?.models || {};
    select.innerHTML = '';
    Object.entries(models)
      .filter(([, model]) => Object.values(model.variables || {}).some(v => (v.frames || []).length))
      .forEach(([key, model]) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = model.label || key.toUpperCase();
        select.appendChild(option);
      });
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
    else if (select.options.length) select.selectedIndex = 0;
  }

  function populateVariables() {
    const modelData = getModelData();
    const select = $('model-player-variable');
    if (!select) return;

    const previous = select.value;
    select.innerHTML = '';

    Object.entries(modelData?.variables || {}).forEach(([key, variable]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = variable.label || key;
      select.appendChild(option);
    });

    if ([...select.options].some(option => option.value === previous)) {
      select.value = previous;
    }

    currentIndex = 0;
    loadFrames();
  }

  function loadFrames() {
    const variableData = getVariableData();
    frames = variableData?.frames || [];
    currentIndex = Math.min(currentIndex, Math.max(0, frames.length - 1));

    const timeline = $('model-player-timeline');
    if (timeline) {
      timeline.min = '0';
      timeline.max = String(Math.max(0, frames.length - 1));
      timeline.value = String(currentIndex);
      timeline.disabled = !frames.length;
    }

    updateRun();
    renderLegend(variableData);
    showFrame(currentIndex);
  }

  function updateRun() {
    const modelData = getModelData();
    const run = $('model-player-run');
    if (!run) return;

    const runDate = modelData?.run ? new Date(modelData.run) : null;
    run.textContent = runDate && !Number.isNaN(runDate.getTime())
      ? `Run ${new Intl.DateTimeFormat('fr-FR', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'UTC',
          timeZoneName: 'short'
        }).format(runDate)}`
      : 'Run indisponible';
  }

  function renderLegend(variableData) {
    const key = getSelectedVariableKey();
    const fallback = DEFAULT_LEGENDS[key];
    const legend = variableData?.legend || fallback;
    const container = $('model-player-legend');

    if (!container || !legend) {
      if (container) container.hidden = true;
      return;
    }

    container.hidden = false;

    const title = $('model-player-legend-title');
    const unit = $('model-player-legend-unit');
    const bar = $('model-player-legend-bar');
    const ticks = $('model-player-legend-ticks');

    if (title) title.textContent = legend.title || variableData?.label || 'Échelle';
    if (unit) unit.textContent = legend.unit || '';
    if (bar) bar.style.background = legend.gradient || fallback?.gradient || '#334155';

    const tickValues = legend.ticks || fallback?.ticks || [];
    if (ticks) {
      ticks.innerHTML = tickValues
        .map(value => `<span>${value}</span>`)
        .join('');
    }
  }

  function setLoading(loading) {
    $('model-player-viewer')?.classList.toggle('is-loading', loading);
  }

  function showFrame(index) {
    const image = $('model-player-image');
    const placeholder = $('model-player-placeholder');
    const error = $('model-player-error');
    const timeline = $('model-player-timeline');

    if (!frames.length) {
      if (image) image.hidden = true;
      if (placeholder) placeholder.hidden = false;
      if (error) error.hidden = true;
      updateLabels(null);
      updateCounter();
      return;
    }

    currentIndex =
      ((Number(index) % frames.length) + frames.length) % frames.length;

    const frame = frames[currentIndex];

    if (timeline) timeline.value = String(currentIndex);
    if (placeholder) placeholder.hidden = true;
    if (error) error.hidden = true;

    setLoading(true);

    image.onload = () => {
      image.hidden = false;
      setLoading(false);
      preloadAdjacentFrames();
    };

    image.onerror = () => {
      image.hidden = true;
      setLoading(false);
      if (error) {
        error.hidden = false;
        error.textContent =
          `Impossible de charger ${frame.image}. Relance le workflow GitHub Actions.`;
      }
    };

    image.src = frame.image;
    updateLabels(frame);
    updateCounter();
  }

  function preloadAdjacentFrames() {
    if (frames.length < 2) return;

    [currentIndex + 1, currentIndex - 1].forEach(index => {
      const normalized = ((index % frames.length) + frames.length) % frames.length;
      const preload = new Image();
      preload.src = frames[normalized].image;
    });
  }

  function updateCounter() {
    const counter = $('model-player-counter');
    if (!counter) return;
    counter.textContent = frames.length
      ? `${currentIndex + 1} / ${frames.length}`
      : '0 / 0';
  }

  function updateLabels(frame) {
    const model = getSelectedModelKey().toUpperCase().replace('_', '-');
    const variable =
      $('model-player-variable')?.selectedOptions?.[0]?.textContent || '';

    const label = $('model-player-label');
    const hour = $('model-player-hour');
    const validity = $('model-player-validity');

    if (label) label.textContent = frame ? `${model} · ${variable}` : '';
    if (hour) hour.textContent = frame ? `+${frame.forecastHour} h` : '';

    if (validity) {
      const valid = frame?.validTime ? new Date(frame.validTime) : null;
      validity.textContent = valid && !Number.isNaN(valid.getTime())
        ? new Intl.DateTimeFormat('fr-FR', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
          }).format(valid)
        : '--';
    }
  }

  function stop() {
    if (timer) window.clearInterval(timer);
    timer = null;
    playing = false;

    const button = $('model-player-play');
    if (button) button.textContent = '▶ Lecture';
  }

  function play() {
    stop();
    if (!frames.length) return;

    playing = true;
    const button = $('model-player-play');
    if (button) button.textContent = '⏸ Pause';

    const delay = Number($('model-player-speed')?.value || 800);
    timer = window.setInterval(() => showFrame(currentIndex + 1), delay);
  }

  function toggle() {
    playing ? stop() : play();
  }

  async function downloadCurrentFrame() {
    const frame = frames[currentIndex];
    if (!frame) return;

    try {
      const response = await fetch(frame.image);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const blob = await response.blob();
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = URL.createObjectURL(blob);

      const model = getSelectedModelKey();
      const variable = getSelectedVariableKey();
      const link = document.createElement('a');
      link.href = currentObjectUrl;
      link.download =
        `${model}-${variable}-f${String(frame.forecastHour).padStart(3, '0')}.webp`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.warn('Téléchargement impossible', error);
    }
  }

  function handleKeyboard(event) {
    const tag = document.activeElement?.tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stop();
      showFrame(currentIndex - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      stop();
      showFrame(currentIndex + 1);
    } else if (event.code === 'Space') {
      event.preventDefault();
      toggle();
    }
  }

  function bind() {
    $('model-player-model')?.addEventListener('change', () => {
      stop();
      populateVariables();
    });

    $('model-player-variable')?.addEventListener('change', () => {
      stop();
      currentIndex = 0;
      loadFrames();
    });

    $('model-player-timeline')?.addEventListener('input', event => {
      stop();
      showFrame(Number(event.target.value));
    });

    $('model-player-prev')?.addEventListener('click', () => {
      stop();
      showFrame(currentIndex - 1);
    });

    $('model-player-next')?.addEventListener('click', () => {
      stop();
      showFrame(currentIndex + 1);
    });

    $('model-player-play')?.addEventListener('click', toggle);
    $('model-player-download')?.addEventListener('click', downloadCurrentFrame);

    $('model-player-speed')?.addEventListener('change', () => {
      if (playing) play();
    });

    $('model-player-fullscreen')?.addEventListener('click', async () => {
      const viewer = $('model-player-viewer');
      if (!viewer) return;

      try {
        if (!document.fullscreenElement) {
          await viewer.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch (error) {
        console.warn('Plein écran indisponible', error);
      }
    });

    window.addEventListener('keydown', handleKeyboard);
  }

  async function init() {
    bind();

    try {
      const response = await fetch(`${MANIFEST_URL}?v=${Date.now()}`, {
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Manifest HTTP ${response.status}`);
      }

      manifest = await response.json();
      populateModels();
      populateVariables();
    } catch (error) {
      console.warn(error);
      manifest = { models: {} };
      populateModels();
      populateVariables();
    }
  }

  return {
    init,
    stop
  };
})();

document.addEventListener('DOMContentLoaded', ModelMapPlayer.init);
