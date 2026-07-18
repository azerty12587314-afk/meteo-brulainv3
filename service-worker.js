'use strict';

const CACHE_NAME = 'meteo-lab-v18-2-confidence-fix';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/surveillance-center.js',
  './js/climate-center.js',
  './js/site-data-status.js',
  './js/site-data.js',
  './assets/icon.svg',
  './js/config.js',
  './js/api.js',
  './js/weather.js',
  './js/charts.js',
  './js/ui.js',
  './js/animations.js',
  './js/radar.js',
  './js/europe-maps.js',
  './js/model-player.js',
  './js/model-comparator.js',
  './js/interactive-map.js',
  './js/observations-config.js',
  './js/observations.js',
  './js/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isApi = [
    'api.open-meteo.com',
    'air-quality-api.open-meteo.com',
    'geocoding-api.open-meteo.com'
  ].includes(url.hostname);

  if (isApi) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  const isFreshAsset =
    request.mode === 'navigate' ||
    ['script', 'style'].includes(request.destination);

  if (isFreshAsset) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then(response => {
          if (response.ok && url.origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok && url.origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
