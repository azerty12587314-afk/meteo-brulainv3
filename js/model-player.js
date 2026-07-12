'use strict';

window.ModelMapPlayer = (() => {
  const MANIFEST_URL = './maps/manifest.json';
  let manifest = null;
  let frames = [];
  let currentIndex = 0;
  let timer = null;
  let playing = false;

  const $ = id => document.getElementById(id);

  function getModelData() {
    const model = $('model-player-model')?.value;
    return manifest?.models?.[model] || null;
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

    loadFrames();
  }

  function loadFrames() {
    const modelData = getModelData();
    const variableKey = $('model-player-variable')?.value;
    frames = modelData?.variables?.[variableKey]?.frames || [];
    currentIndex = Math.min(currentIndex, Math.max(0, frames.length - 1));

    const timeline = $('model-player-timeline');
    if (timeline) {
      timeline.min = '0';
      timeline.max = String(Math.max(0, frames.length - 1));
      timeline.value = String(currentIndex);
      timeline.disabled = !frames.length;
    }

    const run = $('model-player-run');
    if (run) {
      const runDate = modelData?.run ? new Date(modelData.run) : null;
      run.textContent = runDate && !Number.isNaN(runDate.getTime())
        ? `Run ${new Intl.DateTimeFormat('fr-FR', {
            day: '2-digit', month: 'short', hour: '2-digit',
            minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short'
          }).format(runDate)}`
        : 'Run indisponible';
    }

    showFrame(currentIndex);
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
      return;
    }

    currentIndex = ((Number(index) % frames.length) + frames.length) % frames.length;
    const frame = frames[currentIndex];

    if (timeline) timeline.value = String(currentIndex);
    if (placeholder) placeholder.hidden = true;
    if (error) error.hidden = true;

    image.onload = () => {
      image.hidden = false;
      if (error) error.hidden = true;
    };

    image.onerror = () => {
      image.hidden = true;
      if (error) {
        error.hidden = false;
        error.textContent =
          `Impossible de charger ${frame.image}. Relance le workflow GitHub Actions.`;
      }
    };

    image.src = frame.image;
    updateLabels(frame);
  }

  function updateLabels(frame) {
    const model = $('model-player-model')?.value?.toUpperCase() || '';
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
            weekday: 'short', day: '2-digit', month: 'short',
            hour: '2-digit', minute: '2-digit'
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

  function bind() {
    $('model-player-model')?.addEventListener('change', () => {
      stop();
      currentIndex = 0;
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
  }

  async function init() {
    bind();

    try {
      const response = await fetch(`${MANIFEST_URL}?v=${Date.now()}`, {
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);

      manifest = await response.json();
      populateVariables();
    } catch (error) {
      console.warn(error);
      manifest = { models: {} };
      populateVariables();
    }
  }

  return { init, stop };
})();

document.addEventListener('DOMContentLoaded', ModelMapPlayer.init);
