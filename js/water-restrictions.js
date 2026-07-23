'use strict';

const WaterRestrictions = (() => {
  const API_URL = 'https://api.vigieau.beta.gouv.fr/api/zones';
  const FALLBACK_URL = './data/water-restrictions.json';

  const META = {
    crise: ['🚨', 'Crise', 'crise'],
    alerte_renforcee: ['🔴', 'Alerte renforcée', 'renforcee'],
    alerte: ['🟠', 'Alerte', 'alerte'],
    vigilance: ['🟡', 'Vigilance', 'vigilance'],
    aucune: ['🟢', 'Aucune restriction publiée', 'aucune']
  };

  const ORDER = {
    crise: 5,
    alerte_renforcee: 4,
    alerte: 3,
    vigilance: 2,
    aucune: 1
  };

  const TYPE_LABELS = {
    AEP: 'Eau du réseau potable',
    SUP: 'Eaux superficielles',
    SOU: 'Eaux souterraines'
  };

  let currentLocation = null;
  let requestController = null;

  const escapeHtml = value =>
    String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);

  function formatDate(value) {
    if (!value) return 'Non précisée';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString('fr-FR');
  }

  function usageIcon(value) {
    if (/arros|irrig/i.test(value)) return '🌱';
    if (/pisc/i.test(value)) return '🏊';
    if (/véhic|voitur/i.test(value)) return '🚗';
    if (/lav|nettoy/i.test(value)) return '🧽';
    return '🚰';
  }

  function readStoredLocation() {
    try {
      const location = JSON.parse(localStorage.getItem('meteo-location'));
      if (
        location &&
        Number.isFinite(Number(location.latitude)) &&
        Number.isFinite(Number(location.longitude))
      ) {
        return location;
      }
    } catch {
      // Le cache local est facultatif.
    }
    return null;
  }

  function normalizeUsage(usage) {
    return {
      name: usage?.nom || usage?.name || 'Usage de l’eau',
      theme: usage?.thematique || usage?.theme || 'Usage',
      description: String(
        usage?.description || usage?.mesure || ''
      ).trim()
    };
  }

  function normalizeZone(zone) {
    const decree = zone?.arrete && typeof zone.arrete === 'object'
      ? zone.arrete
      : {};
    const level =
      zone?.niveauGravite || zone?.niveau_gravite || zone?.niveau || null;
    const type = zone?.type || zone?.typeEau || null;
    const usages = zone?.usages || zone?.restrictions || [];

    return {
      id: zone?.id,
      name: zone?.nom || zone?.name || 'Zone d’alerte',
      type,
      typeLabel: TYPE_LABELS[type] || type || 'Type d’eau non précisé',
      level,
      levelLabel:
        META[level]?.[1] ||
        String(level || 'Situation inconnue').replaceAll('_', ' '),
      department: zone?.departement || zone?.department,
      decree: {
        startDate:
          decree.dateDebutValidite || zone?.dateDebutValidite || null,
        endDate:
          decree.dateFinValidite || zone?.dateFinValidite || null,
        url: decree.cheminFichier || zone?.cheminFichier || null,
        frameworkUrl:
          decree.cheminFichierArreteCadre ||
          zone?.cheminFichierArreteCadre ||
          null
      },
      usages: Array.isArray(usages)
        ? usages.filter(item => item && typeof item === 'object').map(normalizeUsage)
        : []
    };
  }

  function extractZones(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];

    for (const key of ['zones', 'data', 'results']) {
      if (Array.isArray(payload[key])) return payload[key];
    }

    return Object.keys(payload).length ? [payload] : [];
  }

  function buildPayload(apiPayload, location) {
    const zones = extractZones(apiPayload)
      .filter(zone => zone && typeof zone === 'object')
      .map(normalizeZone)
      .sort(
        (first, second) =>
          (ORDER[second.level] || 0) - (ORDER[first.level] || 0)
      );

    const highestLevel = zones[0]?.level || 'aucune';

    return {
      status: 'ok',
      source: 'VigiEau',
      sourceUrl: 'https://vigieau.gouv.fr/',
      generatedAt: new Date().toISOString(),
      location,
      highestLevel,
      highestLevelLabel: zones[0]?.levelLabel || META.aucune[1],
      zones,
      notice: 'Informations indicatives : l’arrêté préfectoral fait foi.'
    };
  }

  function renderZone(zone) {
    const meta = META[zone.level] || [
      '💧',
      zone.levelLabel || 'Situation inconnue',
      'inconnu'
    ];

    const uses = (zone.usages || []).map(usage => `
      <article class="water-use">
        <b>${usageIcon(`${usage.theme} ${usage.name}`)} ${escapeHtml(usage.name)}</b>
        <p>${escapeHtml(usage.description || 'Consulter l’arrêté pour le détail.')}</p>
      </article>
    `).join('');

    const links = [
      zone.decree?.url
        ? `<a target="_blank" rel="noopener" href="${escapeHtml(zone.decree.url)}">Arrêté préfectoral ↗</a>`
        : '',
      zone.decree?.frameworkUrl
        ? `<a target="_blank" rel="noopener" href="${escapeHtml(zone.decree.frameworkUrl)}">Arrêté-cadre ↗</a>`
        : ''
    ].filter(Boolean).join(' ');

    return `
      <section class="water-zone water-${meta[2]}">
        <header>
          <div>
            <small>${escapeHtml(zone.typeLabel)}</small>
            <h3>${escapeHtml(zone.name)}</h3>
          </div>
          <strong>${meta[0]} ${escapeHtml(zone.levelLabel || meta[1])}</strong>
        </header>
        <p class="water-dates">
          Du ${formatDate(zone.decree?.startDate)} au ${formatDate(zone.decree?.endDate)}
          · ${escapeHtml(zone.department || 'Département non précisé')}
        </p>
        <div class="water-uses">
          ${uses || '<p>Aucune mesure détaillée publiée.</p>'}
        </div>
        <div class="water-links">${links}</div>
      </section>
    `;
  }

  function setLoading(location) {
    const status = document.getElementById('water-status');
    if (!status) return;

    status.className = 'water-status';
    status.innerHTML = `
      <span>💧</span>
      <div>
        <b>Recherche des restrictions en cours…</b>
        <small>${escapeHtml(location?.name || 'Localisation actuelle')}</small>
      </div>
    `;
  }

  function render(payload) {
    const content = document.getElementById('water-content');
    const status = document.getElementById('water-status');
    const banner = document.getElementById('water-banner');
    if (!content || !status) return;

    const meta = META[payload.highestLevel] || [
      '💧',
      payload.highestLevelLabel || 'Situation inconnue',
      'inconnu'
    ];

    status.className = `water-status water-${meta[2]}`;
    status.innerHTML = `
      <span>${meta[0]}</span>
      <div>
        <b>${escapeHtml(payload.highestLevelLabel || meta[1])}</b>
        <small>
          ${escapeHtml(payload.location?.name || 'Localisation actuelle')}
          · mise à jour ${new Date(payload.generatedAt).toLocaleString('fr-FR')}
          ${payload.status === 'stale' ? ' · cache de secours' : ''}
        </small>
      </div>
    `;

    content.innerHTML = payload.zones?.length
      ? payload.zones.map(renderZone).join('')
      : `
        <div class="water-empty">
          ${meta[0]} <b>${escapeHtml(payload.highestLevelLabel || meta[1])}</b>
          <p>Aucune mesure détaillée publiée pour les particuliers.</p>
        </div>
      `;

    if (banner) {
      const active = ['alerte', 'alerte_renforcee', 'crise'].includes(
        payload.highestLevel
      );
      banner.hidden = !active;
      banner.innerHTML = active
        ? `<b>${meta[0]} Restrictions d’eau : ${escapeHtml(meta[1])}</b><a href="#water-section">Voir les mesures</a>`
        : '';
    }
  }

  async function fetchFallback(location, originalError) {
    try {
      const response = await fetch(`${FALLBACK_URL}?v=${Date.now()}`, {
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      payload.status = 'stale';
      payload.location = location || payload.location;
      render(payload);
    } catch (fallbackError) {
      const status = document.getElementById('water-status');
      if (status) {
        status.textContent = '⚠️ Données VigiEau temporairement indisponibles';
      }
      console.error('VigiEau direct :', originalError);
      console.error('Cache VigiEau :', fallbackError);
    }
  }

  async function load(location = readStoredLocation()) {
    if (!location) {
      return fetchFallback(null, new Error('Localisation absente'));
    }

    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return fetchFallback(location, new Error('Coordonnées invalides'));
    }

    currentLocation = {
      ...location,
      latitude,
      longitude
    };

    requestController?.abort();
    requestController = new AbortController();
    setLoading(currentLocation);

    const parameters = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      profil: 'particulier'
    });

    try {
      const response = await fetch(`${API_URL}?${parameters}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: requestController.signal
      });

      if (!response.ok) throw new Error(`VigiEau HTTP ${response.status}`);
      const apiPayload = await response.json();
      render(buildPayload(apiPayload, currentLocation));
    } catch (error) {
      if (error.name === 'AbortError') return;
      await fetchFallback(currentLocation, error);
    }
  }

  function init() {
    load();

    document.getElementById('water-refresh')?.addEventListener('click', () => {
      load(currentLocation || readStoredLocation());
    });

    window.addEventListener('meteo-location-changed', event => {
      load(event.detail);
    });

    window.addEventListener('storage', event => {
      if (event.key === 'meteo-location') load(readStoredLocation());
    });
  }

  return { init, load };
})();

document.addEventListener('DOMContentLoaded', WaterRestrictions.init);
