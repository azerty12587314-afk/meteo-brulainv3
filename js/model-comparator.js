'use strict';

window.ModelComparator = (() => {
  const MANIFEST_URL = './maps/manifest.json';
  let manifest = null;
  let frames = [];
  let index = 0;
  let timer = null;
  let playing = false;

  const $ = id => document.getElementById(id);

  function availableModels() {
    return Object.entries(manifest?.models || {})
      .filter(([, model]) =>
        Object.values(model.variables || {})
          .some(variable => (variable.frames || []).length)
      );
  }

  function fillModels() {
    const models = availableModels();
    const left = $('compare-model-left');
    const right = $('compare-model-right');

    [left, right].forEach(select => {
      select.innerHTML = models.map(([key, model]) =>
        `<option value="${key}">${model.label || key}</option>`
      ).join('');
    });

    if (models.length > 1) right.selectedIndex = 1;
    fillVariables();
  }

  function commonVariables() {
    const leftModel = manifest?.models?.[$('compare-model-left')?.value];
    const rightModel = manifest?.models?.[$('compare-model-right')?.value];

    if (!leftModel || !rightModel) return [];

    return Object.entries(leftModel.variables || {})
      .filter(([key, variable]) =>
        (variable.frames || []).length &&
        (rightModel.variables?.[key]?.frames || []).length
      );
  }

  function fillVariables() {
    stop();
    const select = $('compare-variable');
    const previous = select.value;
    const variables = commonVariables();

    select.innerHTML = variables.map(([key, variable]) =>
      `<option value="${key}">${variable.label || key}</option>`
    ).join('');

    if ([...select.options].some(option => option.value === previous)) {
      select.value = previous;
    }

    buildFrames();
  }

  function nearestFrame(framesList, hour) {
    if (!framesList?.length) return null;
    return framesList.reduce((best, frame) =>
      Math.abs(frame.forecastHour - hour) <
      Math.abs(best.forecastHour - hour) ? frame : best
    );
  }

  function buildFrames() {
    const leftModel = manifest?.models?.[$('compare-model-left')?.value];
    const rightModel = manifest?.models?.[$('compare-model-right')?.value];
    const variable = $('compare-variable')?.value;

    const leftFrames = leftModel?.variables?.[variable]?.frames || [];
    const rightFrames = rightModel?.variables?.[variable]?.frames || [];

    const hours = [...new Set([
      ...leftFrames.map(frame => frame.forecastHour),
      ...rightFrames.map(frame => frame.forecastHour)
    ])].sort((a, b) => a - b);

    frames = hours.map(hour => ({
      hour,
      left: nearestFrame(leftFrames, hour),
      right: nearestFrame(rightFrames, hour)
    })).filter(item => item.left && item.right);

    index = Math.min(index, Math.max(0, frames.length - 1));

    const timeline = $('compare-timeline');
    timeline.max = String(Math.max(0, frames.length - 1));
    timeline.value = String(index);
    timeline.disabled = !frames.length;

    renderLegend();
    show(index);
  }

  function show(nextIndex) {
    if (!frames.length) {
      renderPane('left', null);
      renderPane('right', null);
      $('compare-validity').textContent = '--';
      $('model-comparator-status').textContent = 'Aucune variable commune';
      return;
    }

    index = ((Number(nextIndex) % frames.length) + frames.length) % frames.length;
    $('compare-timeline').value = String(index);

    const item = frames[index];
    renderPane('left', item.left);
    renderPane('right', item.right);

    const valid = item.left?.validTime || item.right?.validTime;
    $('compare-validity').textContent = valid
      ? new Intl.DateTimeFormat('fr-FR', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        }).format(new Date(valid))
      : `+${item.hour} h`;

    $('model-comparator-status').textContent =
      `${index + 1} / ${frames.length} · +${item.hour} h`;
  }

  function renderPane(side, frame) {
    const modelKey = $(`compare-model-${side}`).value;
    const model = manifest?.models?.[modelKey];
    const image = $(`compare-${side}-image`);
    const empty = $(`compare-${side}-empty`);
    const title = $(`compare-${side}-title`);
    const run = $(`compare-${side}-run`);

    title.textContent = model?.label || modelKey;
    run.textContent = model?.run
      ? `Run ${new Intl.DateTimeFormat('fr-FR', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'UTC',
          timeZoneName: 'short'
        }).format(new Date(model.run))}`
      : '';

    if (!frame) {
      image.hidden = true;
      empty.hidden = false;
      return;
    }

    image.src = frame.image;
    image.hidden = false;
    empty.hidden = true;
  }

  function renderLegend() {
    const variableKey = $('compare-variable')?.value;
    const leftModel = manifest?.models?.[$('compare-model-left')?.value];
    const legend = leftModel?.variables?.[variableKey]?.legend;
    const container = $('compare-legend');

    if (!legend) {
      container.hidden = true;
      return;
    }

    container.hidden = false;
    $('compare-legend-title').textContent = legend.title || variableKey;
    $('compare-legend-unit').textContent = legend.unit || '';
    $('compare-legend-bar').style.background =
      legend.gradient || 'linear-gradient(90deg,#312e81,#38bdf8,#fde047,#ef4444)';
    $('compare-legend-ticks').innerHTML =
      (legend.ticks || []).map(value => `<span>${value}</span>`).join('');
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    playing = false;
    $('compare-play').textContent = '▶ Lecture';
  }

  function play() {
    stop();
    if (!frames.length) return;
    playing = true;
    $('compare-play').textContent = '⏸ Pause';
    timer = setInterval(
      () => show(index + 1),
      Number($('compare-speed').value || 850)
    );
  }

  function toggle() {
    playing ? stop() : play();
  }

  function swap() {
    const left = $('compare-model-left');
    const right = $('compare-model-right');
    const value = left.value;
    left.value = right.value;
    right.value = value;
    fillVariables();
  }

  function bind() {
    $('compare-model-left')?.addEventListener('change', fillVariables);
    $('compare-model-right')?.addEventListener('change', fillVariables);
    $('compare-variable')?.addEventListener('change', buildFrames);
    $('compare-prev')?.addEventListener('click', () => {
      stop();
      show(index - 1);
    });
    $('compare-next')?.addEventListener('click', () => {
      stop();
      show(index + 1);
    });
    $('compare-play')?.addEventListener('click', toggle);
    $('compare-swap')?.addEventListener('click', swap);
    $('compare-speed')?.addEventListener('change', () => {
      if (playing) play();
    });
    $('compare-timeline')?.addEventListener('input', event => {
      stop();
      show(Number(event.target.value));
    });
  }

  async function init() {
    if (!$('model-comparator-section')) return;
    bind();

    try {
      const response = await fetch(`${MANIFEST_URL}?v=${Date.now()}`, {
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
      manifest = await response.json();
      fillModels();
    } catch (error) {
      console.error(error);
      $('model-comparator-status').textContent = 'Manifest inaccessible';
    }
  }

  return { init, stop };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.ModelComparator.init();
  });
} else {
  window.ModelComparator.init();
}
