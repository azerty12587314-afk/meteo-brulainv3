'use strict';

window.MeteoApp = (() => {
  let location = loadLocation() || { ...MeteoConfig.defaultLocation };
  let refreshTimer = null;

  function loadLocation() {
    try {
      return JSON.parse(localStorage.getItem('meteo-location'));
    } catch {
      return null;
    }
  }

  function saveLocation(value) {
    localStorage.setItem('meteo-location', JSON.stringify(value));
  }

  async function loadAll(force = false) {
    MeteoUI.setLoading(true);
    if (force) MeteoApi.clearCache();

    try {
      const [forecast, air, models, arome, ecmwfLong] = await Promise.all([
        MeteoApi.getForecast(location),
        MeteoApi.getAirQuality(location).catch(() => null),
        MeteoApi.getModelForecasts(location),
        MeteoApi.getArome48h(location),
        MeteoApi.getEcmwfLongRange(location)
      ]);

      MeteoUI.renderCurrent(forecast, location);
      MeteoUI.renderDashboard(forecast, air);
      MeteoUI.renderHourly(forecast);
      MeteoUI.renderDaily(forecast);
      MeteoUI.renderModelStatuses(models, arome);
      MeteoCharts.renderModels(models);
      MeteoCharts.renderArome(arome, 'temp');
      MeteoCharts.renderEcmwfLong(ecmwfLong);
      MeteoRadar.update(location);
      MeteoAnimations.updateTheme(forecast.current.weather_code, forecast.current.is_day);
    } catch (error) {
      console.error(error);
      MeteoUI.showMessage(
        navigator.onLine
          ? 'Impossible de récupérer les données météo. Réessaie dans quelques instants.'
          : 'Tu es hors connexion. Les données récentes ne peuvent pas être actualisées.'
      );
    } finally {
      MeteoUI.setLoading(false);
    }
  }

  async function handleSearch(event) {
    event.preventDefault();
    const input = document.getElementById('location-search');
    const query = input.value.trim();
    if (query.length < 2) {
      MeteoUI.showMessage('Saisis au moins deux caractères.');
      return;
    }
    try {
      const results = await MeteoApi.searchLocation(query);
      MeteoUI.renderSearchResults(results, selectLocation);
    } catch {
      MeteoUI.showMessage('La recherche de ville a échoué.');
    }
  }

  function selectLocation(place) {
    location = {
      name: [place.name, place.admin1].filter(Boolean).join(', '),
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: place.timezone || 'Europe/Paris'
    };
    saveLocation(location);
    document.getElementById('location-search').value = '';
    loadAll(true);
  }

  function geolocate() {
    if (!navigator.geolocation) {
      MeteoUI.showMessage('La géolocalisation n’est pas disponible dans ce navigateur.');
      return;
    }
    MeteoUI.setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async position => {
        location = {
          name: 'Ma position',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'auto'
        };
        saveLocation(location);
        await loadAll(true);
      },
      () => {
        MeteoUI.setLoading(false);
        MeteoUI.showMessage('Position non accessible. Vérifie les autorisations du navigateur.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  function bindEvents() {
    document.getElementById('location-form')?.addEventListener('submit', handleSearch);
    document.getElementById('geolocate-button')?.addEventListener('click', geolocate);
    document.getElementById('refresh-button')?.addEventListener('click', () => loadAll(true));
    document.querySelectorAll('[data-arome-type]').forEach(button => {
      button.addEventListener('click', () => MeteoCharts.setAromeType(button.dataset.aromeType));
    });
    window.addEventListener('online', () => loadAll(true));
  }

  async function registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
      try {
        await navigator.serviceWorker.register('./service-worker.js');
      } catch (error) {
        console.warn('Service worker non enregistré', error);
      }
    }
  }

  async function init() {
    MeteoUI.ensureToolbar();
    bindEvents();
    MeteoAnimations.reveal();
    await registerServiceWorker();
    await loadAll();

    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => loadAll(true), MeteoConfig.refreshIntervalMs);
  }

  return { init, loadAll };
})();

document.addEventListener('DOMContentLoaded', MeteoApp.init);
