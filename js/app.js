'use strict';

window.MeteoApp = (() => {
  let currentLocation = loadLocation() || { ...MeteoConfig.defaultLocation };
  let refreshTimer = null;
  let dailyBundle = null;
  let dailySource =
    localStorage.getItem('daily-forecast-model') || 'fusion';

  function loadLocation() {
    try {
      return JSON.parse(localStorage.getItem('meteo-location'));
    } catch {
      return null;
    }
  }

  function saveLocation(value) {
    try {
      localStorage.setItem('meteo-location', JSON.stringify(value));
    } catch {
      // Le site reste fonctionnel sans stockage local.
    }

    window.dispatchEvent(
      new CustomEvent('meteo-location-changed', { detail: value })
    );
  }

  async function loadAll(force = false) {
    MeteoUI.setLoading(true);
    if (force) MeteoApi.clearCache();

    try {
      const [forecast, air, models, arome, ecmwfLong] = await Promise.all([
        MeteoApi.getForecast(currentLocation),
        MeteoApi.getAirQuality(currentLocation).catch(() => null),
        MeteoApi.getModelForecasts(currentLocation),
        MeteoApi.getArome48h(currentLocation),
        MeteoApi.getEcmwfLongRange(currentLocation)
      ]);

      MeteoUI.renderCurrent(forecast, currentLocation);
      MeteoUI.renderDashboard(forecast, air);
      MeteoUI.renderHourly(forecast);
      dailyBundle = await MeteoApi.getDailyForecastBundle(
        currentLocation,
        forecast
      );

      const dailySelect = document.getElementById('daily-model-select');
      if (dailySelect) dailySelect.value = dailySource;

      MeteoUI.renderDaily(dailyBundle, dailySource);
      MeteoUI.renderModelStatuses(models, arome);

      MeteoCharts.renderModels(models);
      MeteoCharts.renderArome(arome, 'temp');
      MeteoCharts.renderEcmwfLong(ecmwfLong);

      MeteoRadar.update(currentLocation);
      MeteoAnimations.updateTheme(
        forecast.current.weather_code,
        forecast.current.is_day
      );
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
    const query = input?.value.trim() || '';

    if (query.length < 2) {
      MeteoUI.showMessage('Saisis au moins deux caractères.');
      return;
    }

    try {
      const results = await MeteoApi.searchLocation(query);
      MeteoUI.renderSearchResults(results, selectLocation);
    } catch (error) {
      console.error(error);
      MeteoUI.showMessage('La recherche de ville a échoué.');
    }
  }

  function selectLocation(place) {
    currentLocation = {
      name: [place.name, place.admin1].filter(Boolean).join(', '),
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: place.timezone || 'Europe/Paris'
    };

    saveLocation(currentLocation);

    const input = document.getElementById('location-search');
    if (input) input.value = '';

    loadAll(true);
  }

  function geolocate() {
    if (!navigator.geolocation) {
      MeteoUI.showMessage(
        'La géolocalisation n’est pas disponible dans ce navigateur.'
      );
      return;
    }

    MeteoUI.setLoading(true);

    navigator.geolocation.getCurrentPosition(
      async position => {
        currentLocation = {
          name: 'Ma position',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone || 'auto'
        };

        saveLocation(currentLocation);
        await loadAll(true);
      },
      () => {
        MeteoUI.setLoading(false);
        MeteoUI.showMessage(
          'Position non accessible. Vérifie les autorisations du navigateur.'
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000
      }
    );
  }


  function handleDailyModelChange(event) {
    dailySource = event.target.value || 'fusion';

    try {
      localStorage.setItem('daily-forecast-model', dailySource);
    } catch {
      // Le choix reste valable pendant la session.
    }

    if (dailyBundle) {
      MeteoUI.renderDaily(dailyBundle, dailySource);
    }
  }

  function bindEvents() {
    document
      .getElementById('location-form')
      ?.addEventListener('submit', handleSearch);

    document
      .getElementById('geolocate-button')
      ?.addEventListener('click', geolocate);

    document
      .getElementById('refresh-button')
      ?.addEventListener('click', () => loadAll(true));

    const dailySelect = document.getElementById('daily-model-select');

    if (dailySelect) {
      dailySelect.value = dailySource;
      dailySelect.addEventListener('change', handleDailyModelChange);
    }

    document
      .getElementById('daily-comparison-close')
      ?.addEventListener('click', MeteoUI.closeDailyComparison);

    document.querySelectorAll('[data-arome-type]').forEach(button => {
      button.addEventListener('click', () => {
        MeteoCharts.setAromeType(button.dataset.aromeType);
      });
    });

    window.addEventListener('online', () => loadAll(true));
  }

  async function registerServiceWorker() {
    if (
      'serviceWorker' in navigator &&
      window.location.protocol !== 'file:'
    ) {
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

    // Annonce aussi la localisation initiale aux modules dynamiques.
    // Sans cet événement, certains modules ne se synchronisaient qu'après
    // un changement manuel de ville.
    window.dispatchEvent(
      new CustomEvent('meteo-location-changed', { detail: currentLocation })
    );

    await registerServiceWorker();
    await loadAll();

    window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(
      () => loadAll(true),
      MeteoConfig.refreshIntervalMs
    );
  }

  return {
    init,
    loadAll
  };
})();

document.addEventListener('DOMContentLoaded', MeteoApp.init);
