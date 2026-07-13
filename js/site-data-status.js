'use strict';

window.SiteDataStatus = (() => {
  const $ = id => document.getElementById(id);

  function formatDate(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function render(data) {
    const container = $('site-data-provider-grid');
    const badge = $('site-data-age');
    if (!container || !badge) return;

    const age = window.SiteDataStore.ageMinutes();
    badge.textContent = age === null
      ? 'Cache non généré'
      : age < 2
        ? 'Mis à jour à l’instant'
        : `Mis à jour il y a ${age} min`;

    const labels = {
      weather: ['🌦️', 'Météo locale'],
      air: ['🍃', 'Air & pollens'],
      radar: ['🌧️', 'Radar'],
      rivers: ['🌊', 'Rivières'],
      metar: ['🛩️', 'METAR']
    };

    container.innerHTML = Object.entries(labels).map(([key, [icon, label]]) => {
      const provider = data.providers?.[key];
      const ok = provider?.status === 'ok';

      return `
        <article class="site-data-provider ${ok ? 'is-ok' : 'is-error'}">
          <span class="site-data-provider-icon">${icon}</span>
          <div>
            <strong>${label}</strong>
            <small>
              ${ok
                ? `OK · ${formatDate(provider.updatedAt)}`
                : provider?.message || 'En attente du workflow'}
            </small>
          </div>
          <span class="site-data-state-dot" aria-hidden="true"></span>
        </article>
      `;
    }).join('');
  }

  async function refresh() {
    const button = $('site-data-refresh');
    if (button) {
      button.disabled = true;
      button.textContent = 'Chargement…';
    }

    try {
      const data = await window.SiteDataStore.load(true);
      render(data);
    } catch (error) {
      console.error(error);
      const badge = $('site-data-age');
      if (badge) badge.textContent = 'Cache inaccessible';
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = '↻ Relire le cache';
      }
    }
  }

  async function init() {
    if (!$('site-data-status-card')) return;
    $('site-data-refresh')?.addEventListener('click', refresh);
    try {
      const data = await window.SiteDataStore.load();
      render(data);
    } catch (error) {
      console.error(error);
    }
  }

  return { init, refresh };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.SiteDataStatus.init();
  });
} else {
  window.SiteDataStatus.init();
}
