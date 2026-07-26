'use strict';

window.EuropeWeatherMaps = (() => {
  const EUROPE_VIEW = { center: [50.2, 10.0], zoom: 4 };
  const BRULAIN_VIEW = { center: [46.2006, -0.3194], zoom: 8 };

  let map = null;
  let radarLayer = null;
  let frames = [];
  let currentFrameIndex = 0;
  let playTimer = null;
  let isPlaying = false;

  function elements() {
    return {
      status: document.getElementById('radar-status'),
      timeline: document.getElementById('radar-timeline'),
      timeLabel: document.getElementById('radar-time-label'),
      play: document.getElementById('radar-play'),
      prev: document.getElementById('radar-prev'),
      next: document.getElementById('radar-next'),
      speed: document.getElementById('radar-speed'),
      home: document.getElementById('radar-home'),
      local: document.getElementById('radar-local')
    };
  }

  function setStatus(text, isError = false) {
    const { status } = elements();
    if (!status) return;
    status.textContent = text;
    status.classList.toggle('is-error', isError);
  }

  function createMap() {
    const container = document.getElementById('europe-radar-map');
    if (!container || typeof L === 'undefined') return false;

    map = L.map(container, {
      center: EUROPE_VIEW.center,
      zoom: EUROPE_VIEW.zoom,
      minZoom: 3,
      maxZoom: 10,
      worldCopyJump: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
    return true;
  }

  async function fetchFrames() {
    setStatus('Chargement du radar…');
    const response = await fetch('https://api.rainviewer.com/public/weather-maps.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`RainViewer HTTP ${response.status}`);

    const metadata = await response.json();
    const past = metadata.radar?.past || [];
    const nowcast = metadata.radar?.nowcast || [];
    const host = metadata.host || 'https://tilecache.rainviewer.com';

    frames = [...past, ...nowcast].map(frame => ({ time: frame.time, path: frame.path, host }));
    if (!frames.length) throw new Error('Aucune image radar disponible.');

    currentFrameIndex = Math.max(0, past.length - 1);
    const { timeline } = elements();
    if (timeline) {
      timeline.min = '0';
      timeline.max = String(frames.length - 1);
      timeline.value = String(currentFrameIndex);
    }
    showFrame(currentFrameIndex);
    setStatus(`${frames.length} images disponibles`);
  }

  function tileUrl(frame) {
    return `${frame.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
  }

  function showFrame(index) {
    if (!map || !frames.length) return;
    currentFrameIndex = ((Number(index) % frames.length) + frames.length) % frames.length;
    const frame = frames[currentFrameIndex];
    const nextLayer = L.tileLayer(tileUrl(frame), {
      tileSize: 256,
      opacity: 0.72,
      zIndex: 20,
      attribution: 'Radar © RainViewer'
    }).addTo(map);

    if (radarLayer) {
      const previous = radarLayer;
      window.setTimeout(() => {
        if (map.hasLayer(previous)) map.removeLayer(previous);
      }, 120);
    }
    radarLayer = nextLayer;
    updateControls(frame);
  }

  function updateControls(frame) {
    const { timeline, timeLabel } = elements();
    if (timeline) timeline.value = String(currentFrameIndex);
    if (timeLabel) {
      timeLabel.textContent = new Intl.DateTimeFormat('fr-FR', {
        weekday: 'short', hour: '2-digit', minute: '2-digit'
      }).format(new Date(frame.time * 1000));
    }
  }

  function nextFrame() { showFrame(currentFrameIndex + 1); }
  function previousFrame() { showFrame(currentFrameIndex - 1); }

  function stopPlayback() {
    if (playTimer) window.clearInterval(playTimer);
    playTimer = null;
    isPlaying = false;
    const { play } = elements();
    if (play) play.textContent = '▶ Lecture';
  }

  function startPlayback() {
    stopPlayback();
    const { speed, play } = elements();
    const delay = Number(speed?.value || 700);
    isPlaying = true;
    if (play) play.textContent = '⏸ Pause';
    playTimer = window.setInterval(nextFrame, delay);
  }

  function togglePlayback() {
    if (isPlaying) stopPlayback(); else startPlayback();
  }

  function bindControls() {
    const { timeline, play, prev, next, speed, home, local } = elements();
    timeline?.addEventListener('input', event => {
      stopPlayback();
      showFrame(Number(event.target.value));
    });
    play?.addEventListener('click', togglePlayback);
    prev?.addEventListener('click', () => { stopPlayback(); previousFrame(); });
    next?.addEventListener('click', () => { stopPlayback(); nextFrame(); });
    speed?.addEventListener('change', () => { if (isPlaying) startPlayback(); });
    home?.addEventListener('click', () => map?.setView(EUROPE_VIEW.center, EUROPE_VIEW.zoom));
    local?.addEventListener('click', () => map?.setView(BRULAIN_VIEW.center, BRULAIN_VIEW.zoom));
  }

  async function init() {
    if (!createMap()) {
      setStatus('Carte indisponible', true);
      return;
    }
    bindControls();
    try {
      await fetchFrames();
    } catch (error) {
      console.error(error);
      setStatus('Radar temporairement indisponible', true);
    }
  }

  return { init, stopPlayback };
})();

document.addEventListener('DOMContentLoaded', EuropeWeatherMaps.init);
