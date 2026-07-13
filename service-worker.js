'use strict';

const CACHE_NAME = 'meteo-lab-v10-1';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './maps/manifest.json',
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
  './js/interactive-map.js',
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
