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

  let map = null;
  let baseStreet = null;
  let baseTopo = null;
  let satelliteLayer = null;
  let radarLayer = null;
  let pointMarker = null;
  let frames = [];
  let currentFrame = 0;
  let timer = null;
  let playing = false;
  let radarEnabled = true;
  let satelliteEnabled = false;

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
    return (
      `${frame.host}${frame.path}/256/{z}/{x}/{y}/` +
      '2/1_1.png'
    );
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

    if (radarEnabled) {
      newLayer.addTo(map);
    }

    const previousLayer = radarLayer;
    radarLayer = newLayer;

    if (previousLayer && map.hasLayer(previousLayer)) {
      window.setTimeout(() => {
        if (map.hasLayer(previousLayer)) {
          map.removeLayer(previousLayer);
        }
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

    timer = window.setInterval(() => {
      showRadarFrame(currentFrame + 1);
    }, 700);
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

      if (!response.ok) {
        throw new Error(`Open-Meteo HTTP ${response.status}`);
      }

      const data = await response.json();
      const current = data.current || {};
      const description =
        WEATHER_CODES[current.weather_code] || 'Conditions variables';

      const popup = `
        <div class="map-weather-popup">
          <strong>${description}</strong>
          <span>
            ${latitude.toFixed(3)}°, ${longitude.toFixed(3)}°
          </span>
          <div class="map-weather-popup-grid">
            <span>🌡️ ${Math.round(current.temperature_2m)} °C</span>
            <span>Ressenti ${Math.round(current.apparent_temperature)} °C</span>
            <span>💧 ${Math.round(current.relative_humidity_2m)} %</span>
            <span>🌧️ ${Number(current.precipitation || 0).toFixed(1)} mm</span>
            <span>💨 ${Math.round(current.wind_speed_10m)} km/h</span>
            <span>Rafales ${Math.round(current.wind_gusts_10m)} km/h</span>
            <span>🧭 ${Math.round(current.wind_direction_10m)}°</span>
            <span>🔵 ${Math.round(current.surface_pressure)} hPa</span>
          </div>
        </div>
      `;

      if (pointMarker) {
        pointMarker.setLatLng([latitude, longitude]);
      } else {
        pointMarker = L.circleMarker(
          [latitude, longitude],
          {
            radius: 7,
            color: '#fbbf24',
            weight: 3,
            fillColor: '#fde68a',
            fillOpacity: 0.9
          }
        ).addTo(map);
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
