'use strict';

window.SiteDataStore = (() => {
  const URL = './data/site-data.json';
  let cache = null;
  let loadingPromise = null;

  async function load(force = false) {
    if (cache && !force) return cache;
    if (loadingPromise && !force) return loadingPromise;

    loadingPromise = fetch(`${URL}?v=${Date.now()}`, {
      cache: 'no-store'
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Site data HTTP ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        cache = data;
        window.dispatchEvent(
          new CustomEvent('site-data-loaded', { detail: data })
        );
        return data;
      })
      .finally(() => {
        loadingPromise = null;
      });

    return loadingPromise;
  }

  function get() {
    return cache;
  }

  function ageMinutes() {
    const generated = cache?.generatedAt
      ? new Date(cache.generatedAt)
      : null;

    if (!generated || Number.isNaN(generated.getTime())) return null;
    return Math.max(0, Math.round((Date.now() - generated.getTime()) / 60000));
  }

  function provider(name) {
    return cache?.providers?.[name] || null;
  }

  return {
    load,
    get,
    ageMinutes,
    provider
  };
})();
