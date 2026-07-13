'use strict';

window.InteractiveWeatherMap = (() => {
  const VIEWS = {
    europe: { center: [50.2, 10], zoom: 4 },
    france: { center: [46.6, 2.4], zoom: 6 },
    local: { center: [46.2025, -0.3297], zoom: 11 }
  };

  const WEATHER_CODES = {
    0: 'Ciel dégagé',
    1: 'Peu nuageux',
    2: 'Partiellement nuageux',
    3: 'Couvert',
    45: 'Brouillard',
    48: 'Brouillard givrant',
    51: 'Bruine légère',
    53: 'Bruine modérée',
    55: 'Bruine dense',
    61: 'Pluie faible',
    63: 'Pluie modérée',
    65: 'Pluie forte',
    71: 'Neige faible',
    73: 'Neige modérée',
    75: 'Neige forte',
    80: 'Averses faibles',
    81: 'Averses modérées',
    82: 'Averses fortes',
    95: 'Orage',
    96: 'Orage avec grêle',
    99: 'Fort orage avec grêle'
  };

  const LIVE_VARIABLES = {
    temperature: {
      field: 'temperature_2m',
      title: 'Température actuelle',
      unit: '°C',
      min: -20,
      max: 40,
      ticks: [-20, -10, 0, 10, 20, 30, 40],
      gradient:
        'linear-gradient(90deg,#312e81,#2563eb,#7dd3fc,#34d399,' +
        '#fde047,#f97316,#dc2626)'
    },
    cloud: {
      field: 'cloud_cover',
      title: 'Nébulosité',
      unit: '%',
      min: 0,
      max: 100,
      ticks: [0, 20, 40, 60, 80, 100],
      gradient:
        'linear-gradient(90deg,#0ea5e9,#7dd3fc,#cbd5e1,#64748b,#1e293b)'
    },
    cape: {
      field: 'cape',
      title: 'CAPE',
      unit: 'J/kg',
      min: 0,
      max: 3000,
      ticks: [0, 250, 500, 1000, 2000, 3000],
      gradient:
        'linear-gradient(90deg,#e2e8f0,#86efac,#fde047,#fb923c,' +
        '#ef4444,#7e22ce)'
    },
    pressure: {
      field: 'pressure_msl',
      title: 'Pression au niveau de la mer',
      unit: 'hPa',
      min: 970,
      max: 1040,
      ticks: [970, 980, 1000, 1020, 1040],
      gradient:
        'linear-gradient(90deg,#312e81,#2563eb,#22d3ee,#4ade80,' +
        '#fde047,#f97316)'
    }
  };

  let map = null;
  let baseStreet = null;
  let baseTopo = null;
  let satelliteLayer = null;
  let radarLayer = null;
  let pointMarker = null;
  let liveLayerGroup = null;
  let windLayer = null;
  let liveData = [];
  let frames = [];
  let currentFrame = 0;
  let timer = null;
  let playing = false;
  let radarEnabled = true;
  let satelliteEnabled = false;
  let windEnabled = false;

  const $ = id => document.getElementById(id);

  function status(text, isError = false) {
    const element = $('interactive-map-status');
    if (!element) return;
    element.textContent = text;
    element.classList.toggle('is-error', isError);
  }

  function yesterdayUtc() {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  function createMap() {
    const container = $('interactive-weather-map');
    if (!container || typeof L === 'undefined') return false;

    map = L.map(container, {
      center: VIEWS.europe.center,
      zoom: VIEWS.europe.zoom,
      minZoom: 3,
      maxZoom: 13,
      worldCopyJump: true
    });

    baseStreet = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">' +
          'OpenStreetMap</a>'
      }
    ).addTo(map);

    baseTopo = L.tileLayer(
      'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 17,
        attribution:
          'Map data &copy; OpenStreetMap contributors · ' +
          'Style &copy; OpenTopoMap'
      }
    );

    satelliteLayer = L.tileLayer(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/' +
      'MODIS_Terra_CorrectedReflectance_TrueColor/default/' +
      `${yesterdayUtc()}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
      {
        maxZoom: 9,
        opacity: 0.9,
        attribution: 'Satellite © NASA GIBS'
      }
    );

    liveLayerGroup = L.layerGroup().addTo(map);

    L.control.layers(
      {
        'Carte routière': baseStreet,
        'Carte topographique': baseTopo
      },
      {},
      {
        collapsed: false,
        position: 'topright'
      }
    ).addTo(map);

    L.control.scale({
      imperial: false,
      position: 'bottomleft'
    }).addTo(map);

    map.on('click', event => {
      loadPointWeather(event.latlng.lat, event.latlng.lng);
    });

    map.on('moveend zoomend resize', () => {
      windLayer?.reset();
    });

    return true;
  }

  async function loadRadarFrames() {
    status('Chargement du radar…');

    const response = await fetch(
      'https://api.rainviewer.com/public/weather-maps.json',
      { cache: 'no-store' }
    );

    if (!response.ok) {
      throw new Error(`RainViewer HTTP ${response.status}`);
    }

    const data = await response.json();
    frames = [
      ...(data.radar?.past || []),
      ...(data.radar?.nowcast || [])
    ].map(frame => ({
      time: frame.time,
      path: frame.path,
      host: data.host || 'https://tilecache.rainviewer.com'
    }));

    if (!frames.length) {
      throw new Error('Aucune image radar disponible.');
    }

    currentFrame = Math.max(0, (data.radar?.past || []).length - 1);

    const timeline = $('map-radar-timeline');
    if (timeline) {
      timeline.min = '0';
      timeline.max = String(frames.length - 1);
      timeline.value = String(currentFrame);
    }

    showRadarFrame(currentFrame);
    status('Carte prête');
  }

  function radarUrl(frame) {
    return `${frame.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
  }

  function showRadarFrame(index) {
    if (!map || !frames.length) return;

    currentFrame =
      ((Number(index) % frames.length) + frames.length) % frames.length;

    const frame = frames[currentFrame];
    const newLayer = L.tileLayer(radarUrl(frame), {
      tileSize: 256,
      opacity: 0.72,
      zIndex: 30,
      attribution: 'Radar © RainViewer'
    });

    if (radarEnabled) newLayer.addTo(map);

    const previousLayer = radarLayer;
    radarLayer = newLayer;

    if (previousLayer && map.hasLayer(previousLayer)) {
      window.setTimeout(() => {
        if (map.hasLayer(previousLayer)) map.removeLayer(previousLayer);
      }, 120);
    }

    const timeline = $('map-radar-timeline');
    if (timeline) timeline.value = String(currentFrame);

    const timeLabel = $('map-radar-time');
    if (timeLabel) {
      timeLabel.textContent = new Intl.DateTimeFormat('fr-FR', {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(frame.time * 1000));
    }
  }

  function stopAnimation() {
    if (timer) window.clearInterval(timer);
    timer = null;
    playing = false;
    const button = $('map-radar-play');
    if (button) button.textContent = '▶ Animation radar';
  }

  function startAnimation() {
    stopAnimation();
    if (!frames.length || !radarEnabled) return;
    playing = true;
    const button = $('map-radar-play');
    if (button) button.textContent = '⏸ Pause radar';
    timer = window.setInterval(() => showRadarFrame(currentFrame + 1), 700);
  }

  function toggleAnimation() {
    playing ? stopAnimation() : startAnimation();
  }

  function toggleRadar() {
    radarEnabled = !radarEnabled;
    const button = $('map-toggle-radar');

    if (button) {
      button.setAttribute('aria-pressed', String(radarEnabled));
      button.textContent = radarEnabled
        ? '🌧️ Radar actif'
        : '🌧️ Radar masqué';
    }

    if (!map || !radarLayer) return;

    if (radarEnabled) {
      radarLayer.addTo(map);
    } else {
      stopAnimation();
      map.removeLayer(radarLayer);
    }
  }

  function toggleSatellite() {
    satelliteEnabled = !satelliteEnabled;
    const button = $('map-toggle-satellite');

    if (button) {
      button.setAttribute('aria-pressed', String(satelliteEnabled));
      button.textContent = satelliteEnabled
        ? '🛰️ Satellite actif'
        : '🛰️ Satellite';
    }

    if (!map || !satelliteLayer) return;

    if (satelliteEnabled) {
      satelliteLayer.addTo(map);
      satelliteLayer.bringToBack();
    } else {
      map.removeLayer(satelliteLayer);
    }
  }

  function buildGrid(spacing) {
    const bounds = map.getBounds();
    const south = Math.max(30, bounds.getSouth());
    const north = Math.min(72, bounds.getNorth());
    const west = Math.max(-25, bounds.getWest());
    const east = Math.min(45, bounds.getEast());

    const points = [];
    for (let lat = Math.ceil(south / spacing) * spacing; lat <= north; lat += spacing) {
      for (let lon = Math.ceil(west / spacing) * spacing; lon <= east; lon += spacing) {
        points.push({ lat, lon });
      }
    }

    return points.slice(0, 220);
  }

  function chunk(items, size) {
    const result = [];
    for (let index = 0; index < items.length; index += size) {
      result.push(items.slice(index, index + size));
    }
    return result;
  }

  async function fetchLiveBatch(points) {
    const params = new URLSearchParams({
      latitude: points.map(point => point.lat).join(','),
      longitude: points.map(point => point.lon).join(','),
      current: [
        'temperature_2m',
        'cloud_cover',
        'cape',
        'pressure_msl',
        'wind_speed_10m',
        'wind_direction_10m'
      ].join(','),
      timezone: 'UTC',
      wind_speed_unit: 'kmh'
    });

    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params}`,
      { cache: 'no-store' }
    );

    if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload) ? payload : [payload];
  }

  async function loadLiveData() {
    const spacing = Number($('map-grid-resolution')?.value || 4);
    const points = buildGrid(spacing);

    if (!points.length) {
      status('Zoome sur l’Europe pour charger les données', true);
      return;
    }

    status(`Chargement de ${points.length} points…`);

    try {
      const responses = [];
      const batches = chunk(points, 45);

      for (let index = 0; index < batches.length; index += 1) {
        const batchResponses = await fetchLiveBatch(batches[index]);
        responses.push(...batchResponses);
        status(`Chargement ${index + 1}/${batches.length}…`);
      }

      liveData = responses.map((response, index) => ({
        lat: Number(response.latitude ?? points[index]?.lat),
        lon: Number(response.longitude ?? points[index]?.lon),
        temperature_2m: Number(response.current?.temperature_2m),
        cloud_cover: Number(response.current?.cloud_cover),
        cape: Number(response.current?.cape),
        pressure_msl: Number(response.current?.pressure_msl),
        wind_speed_10m: Number(response.current?.wind_speed_10m),
        wind_direction_10m: Number(response.current?.wind_direction_10m)
      })).filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lon));

      renderSelectedLiveLayer();
      if (windEnabled) createOrRefreshWindLayer();
      renderLiveSummary();
      status(`${liveData.length} points chargés`);
    } catch (error) {
      console.error(error);
      status('Données interactives indisponibles', true);
    }
  }

  function valueColor(value, definition) {
    const ratio = Math.max(
      0,
      Math.min(1, (value - definition.min) / (definition.max - definition.min))
    );

    const hue = definition === LIVE_VARIABLES.cloud
      ? 205 - ratio * 185
      : 240 - ratio * 240;

    const lightness = definition === LIVE_VARIABLES.cloud
      ? 75 - ratio * 48
      : 52;

    return `hsl(${hue} 82% ${lightness}%)`;
  }

  function renderSelectedLiveLayer() {
    liveLayerGroup?.clearLayers();

    const key = $('map-live-layer')?.value || 'none';
    const definition = LIVE_VARIABLES[key];

    renderDataLegend(key);

    if (!definition || !liveData.length) return;

    liveData.forEach(item => {
      const value = item[definition.field];
      if (!Number.isFinite(value)) return;

      const radius = map.getZoom() >= 7 ? 10 : map.getZoom() >= 5 ? 8 : 6;
      const marker = L.circleMarker([item.lat, item.lon], {
        radius,
        color: 'rgba(255,255,255,.55)',
        weight: 1,
        fillColor: valueColor(value, definition),
        fillOpacity: 0.82,
        className: 'live-data-point'
      });

      marker.bindTooltip(
        `${definition.title}: ${value.toFixed(key === 'pressure' ? 0 : 1)} ${definition.unit}`,
        { direction: 'top' }
      );

      marker.addTo(liveLayerGroup);
    });
  }

  function renderDataLegend(key) {
    const container = $('map-data-legend');
    const definition = LIVE_VARIABLES[key];

    if (!container || !definition) {
      if (container) container.hidden = true;
      return;
    }

    container.hidden = false;
    $('map-data-legend-title').textContent = definition.title;
    $('map-data-legend-unit').textContent = definition.unit;
    $('map-data-legend-gradient').style.background = definition.gradient;
    $('map-data-legend-ticks').innerHTML =
      definition.ticks.map(value => `<span>${value}</span>`).join('');
  }

  function renderLiveSummary() {
    const container = $('map-live-summary');
    if (!container || !liveData.length) {
      if (container) container.hidden = true;
      return;
    }

    const average = field => {
      const values = liveData
        .map(item => item[field])
        .filter(Number.isFinite);
      return values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;
    };

    const temp = average('temperature_2m');
    const cloud = average('cloud_cover');
    const cape = average('cape');
    const wind = average('wind_speed_10m');

    container.hidden = false;
    container.innerHTML = `
      <span>🌡️ Moyenne ${temp?.toFixed(1) ?? '--'} °C</span>
      <span>☁️ Nébulosité ${cloud?.toFixed(0) ?? '--'} %</span>
      <span>⚡ CAPE ${cape?.toFixed(0) ?? '--'} J/kg</span>
      <span>💨 Vent ${wind?.toFixed(0) ?? '--'} km/h</span>
    `;
  }

  function createOrRefreshWindLayer() {
    if (!windEnabled || !liveData.length) return;

    if (windLayer) {
      windLayer.setData(liveData);
      windLayer.reset();
      return;
    }

    windLayer = new WindParticleLayer(liveData);
    windLayer.addTo(map);
  }

  function toggleWind() {
    windEnabled = !windEnabled;
    const button = $('map-toggle-wind');

    if (button) {
      button.setAttribute('aria-pressed', String(windEnabled));
      button.textContent = windEnabled ? '💨 Vent actif' : '💨 Vent animé';
    }

    if (!windEnabled) {
      if (windLayer) map.removeLayer(windLayer);
      windLayer = null;
      return;
    }

    if (!liveData.length) {
      loadLiveData();
    } else {
      createOrRefreshWindLayer();
    }
  }

  class WindParticleLayer extends L.Layer {
    constructor(data) {
      super();
      this.data = data;
      this.canvas = null;
      this.context = null;
      this.frame = null;
      this.particles = [];
    }

    setData(data) {
      this.data = data;
    }

    onAdd(targetMap) {
      this.map = targetMap;
      this.canvas = L.DomUtil.create('canvas', 'wind-particle-canvas');
      targetMap.getPanes().overlayPane.appendChild(this.canvas);
      this.context = this.canvas.getContext('2d');
      this.reset();
      this.animate();
    }

    onRemove() {
      if (this.frame) cancelAnimationFrame(this.frame);
      this.canvas?.remove();
      this.canvas = null;
      this.context = null;
    }

    reset() {
      if (!this.map || !this.canvas) return;

      const size = this.map.getSize();
      const topLeft = this.map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this.canvas, topLeft);
      this.canvas.width = size.x;
      this.canvas.height = size.y;

      const count = Math.max(80, Math.min(420, Math.round(size.x * size.y / 4200)));
      this.particles = Array.from({ length: count }, () => this.newParticle());
    }

    newParticle() {
      return {
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        age: Math.floor(Math.random() * 80)
      };
    }

    nearestWind(lat, lon) {
      let best = null;
      let distance = Infinity;

      for (const item of this.data) {
        const dx = item.lon - lon;
        const dy = item.lat - lat;
        const current = dx * dx + dy * dy;
        if (current < distance) {
          distance = current;
          best = item;
        }
      }

      return best;
    }

    advance(particle) {
      const latLng = this.map.containerPointToLatLng([particle.x, particle.y]);
      const wind = this.nearestWind(latLng.lat, latLng.lng);

      if (!wind || !Number.isFinite(wind.wind_speed_10m)) {
        Object.assign(particle, this.newParticle());
        return;
      }

      const direction = Number(wind.wind_direction_10m || 0) * Math.PI / 180;
      const speed = Math.min(4.2, 0.25 + wind.wind_speed_10m / 28);

      particle.x += Math.sin(direction) * speed;
      particle.y -= Math.cos(direction) * speed;
      particle.age += 1;

      if (
        particle.x < 0 ||
        particle.y < 0 ||
        particle.x > this.canvas.width ||
        particle.y > this.canvas.height ||
        particle.age > 105
      ) {
        Object.assign(particle, this.newParticle());
      }
    }

    animate() {
      if (!this.context || !this.canvas) return;

      this.context.fillStyle = 'rgba(2, 6, 23, 0.075)';
      this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.context.strokeStyle = 'rgba(224, 242, 254, 0.72)';
      this.context.lineWidth = 0.85;

      this.context.beginPath();
      for (const particle of this.particles) {
        const oldX = particle.x;
        const oldY = particle.y;
        this.advance(particle);
        this.context.moveTo(oldX, oldY);
        this.context.lineTo(particle.x, particle.y);
      }
      this.context.stroke();

      this.frame = requestAnimationFrame(() => this.animate());
    }
  }

  async function loadPointWeather(latitude, longitude) {
    status('Lecture du point météo…');

    try {
      const params = new URLSearchParams({
        latitude: latitude.toFixed(4),
        longitude: longitude.toFixed(4),
        current: [
          'temperature_2m',
          'relative_humidity_2m',
          'apparent_temperature',
          'precipitation',
          'weather_code',
          'surface_pressure',
          'wind_speed_10m',
          'wind_direction_10m',
          'wind_gusts_10m'
        ].join(','),
        timezone: 'auto'
      });

      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?${params}`,
        { cache: 'no-store' }
      );

      if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);

      const data = await response.json();
      const current = data.current || {};
      const description =
        WEATHER_CODES[current.weather_code] || 'Conditions variables';

      const format = (value, digits = 0) =>
        Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '--';

      const popup = `
        <div class="map-weather-popup">
          <strong>${description}</strong>
          <span>${latitude.toFixed(3)}°, ${longitude.toFixed(3)}°</span>
          <div class="map-weather-popup-grid">
            <span>🌡️ ${format(current.temperature_2m)} °C</span>
            <span>Ressenti ${format(current.apparent_temperature)} °C</span>
            <span>💧 ${format(current.relative_humidity_2m)} %</span>
            <span>🌧️ ${format(current.precipitation, 1)} mm</span>
            <span>💨 ${format(current.wind_speed_10m)} km/h</span>
            <span>Rafales ${format(current.wind_gusts_10m)} km/h</span>
            <span>🧭 ${format(current.wind_direction_10m)}°</span>
            <span>🔵 ${format(current.surface_pressure)} hPa</span>
          </div>
        </div>
      `;

      if (pointMarker) {
        pointMarker.setLatLng([latitude, longitude]);
      } else {
        pointMarker = L.circleMarker([latitude, longitude], {
          radius: 7,
          color: '#fbbf24',
          weight: 3,
          fillColor: '#fde68a',
          fillOpacity: 0.9
        }).addTo(map);
      }

      pointMarker.bindPopup(popup).openPopup();
      status('Carte prête');
    } catch (error) {
      console.error(error);
      status('Météo du point indisponible', true);
    }
  }

  function geolocate() {
    if (!navigator.geolocation) {
      status('Géolocalisation indisponible', true);
      return;
    }

    status('Recherche de la position…');

    navigator.geolocation.getCurrentPosition(
      position => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        map.setView([latitude, longitude], 10);
        loadPointWeather(latitude, longitude);
      },
      () => status('Position non accessible', true),
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000
      }
    );
  }

  function bind() {
    $('map-view-europe')?.addEventListener('click', () => {
      map.setView(VIEWS.europe.center, VIEWS.europe.zoom);
    });

    $('map-view-france')?.addEventListener('click', () => {
      map.setView(VIEWS.france.center, VIEWS.france.zoom);
    });

    $('map-view-local')?.addEventListener('click', () => {
      map.setView(VIEWS.local.center, VIEWS.local.zoom);
    });

    $('map-geolocate')?.addEventListener('click', geolocate);
    $('map-toggle-radar')?.addEventListener('click', toggleRadar);
    $('map-toggle-satellite')?.addEventListener('click', toggleSatellite);
    $('map-radar-play')?.addEventListener('click', toggleAnimation);
    $('map-load-live-data')?.addEventListener('click', loadLiveData);
    $('map-toggle-wind')?.addEventListener('click', toggleWind);
    $('map-live-layer')?.addEventListener('change', renderSelectedLiveLayer);

    $('map-radar-prev')?.addEventListener('click', () => {
      stopAnimation();
      showRadarFrame(currentFrame - 1);
    });

    $('map-radar-next')?.addEventListener('click', () => {
      stopAnimation();
      showRadarFrame(currentFrame + 1);
    });

    $('map-radar-timeline')?.addEventListener('input', event => {
      stopAnimation();
      showRadarFrame(Number(event.target.value));
    });

    $('map-fullscreen')?.addEventListener('click', async () => {
      const container = $('interactive-weather-map');
      if (!container) return;

      try {
        if (!document.fullscreenElement) {
          await container.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
        window.setTimeout(() => map.invalidateSize(), 180);
      } catch (error) {
        console.warn('Plein écran indisponible', error);
      }
    });

    document.addEventListener('fullscreenchange', () => {
      window.setTimeout(() => map?.invalidateSize(), 180);
    });
  }

  async function init() {
    if (!createMap()) {
      status('Carte Leaflet indisponible', true);
      return;
    }

    bind();

    try {
      await loadRadarFrames();
    } catch (error) {
      console.error(error);
      status('Radar temporairement indisponible', true);
    }
  }

  return {
    init,
    stopAnimation
  };
})();

document.addEventListener('DOMContentLoaded', InteractiveWeatherMap.init);
