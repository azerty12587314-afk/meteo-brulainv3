'use strict';

window.WeatherHistory = (() => {
  const byId = id => document.getElementById(id);
  let climate = null;

  function finite(value) {
    return value !== null && value !== undefined && Number.isFinite(Number(value));
  }

  function formatDate(value) {
    if (!value) return 'Date inconnue';
    const parsed = new Date(`${value}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return 'Date inconnue';
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric'
    }).format(parsed);
  }

  function normalTemperature(data) {
    const values = (data?.normals?.monthly || [])
      .map(month => Number(month.temperatureMean))
      .filter(Number.isFinite);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }

  function normalRain(data) {
    const values = (data?.normals?.monthly || [])
      .map(month => Number(month.precipitation))
      .filter(Number.isFinite);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  }

  function buildCards(data) {
    const records = data?.records || {};
    const years = (data?.recentYears || []).filter(item => item && item.year);
    const cards = [];

    const daily = [
      ['🔥', 'Température maximale', records.highestTemperature, '°C'],
      ['❄️', 'Température minimale', records.lowestTemperature, '°C'],
      ['🌧️', 'Journée la plus arrosée', records.wettestDay, 'mm'],
      ['💨', 'Rafale maximale', records.strongestGust, 'km/h']
    ];

    for (const [icon, title, record, unit] of daily) {
      if (!finite(record?.value)) continue;
      cards.push({
        icon,
        title,
        value: `${Number(record.value).toFixed(1)} ${unit}`,
        detail: `${formatDate(record.date)} · réanalyse locale`
      });
    }

    const validTemp = years.filter(year => finite(year.temperatureMean));
    const validRain = years.filter(year => finite(year.precipitation));
    const warmest = [...validTemp].sort((a, b) => Number(b.temperatureMean) - Number(a.temperatureMean))[0];
    const coldest = [...validTemp].sort((a, b) => Number(a.temperatureMean) - Number(b.temperatureMean))[0];
    const wettest = [...validRain].sort((a, b) => Number(b.precipitation) - Number(a.precipitation))[0];
    const driest = [...validRain].sort((a, b) => Number(a.precipitation) - Number(b.precipitation))[0];
    const tempNormal = normalTemperature(data);
    const rainNormal = normalRain(data);

    if (warmest) cards.push({ icon: '📈', title: 'Année récente la plus chaude', value: String(warmest.year), detail: `${Number(warmest.temperatureMean).toFixed(1)} °C${finite(tempNormal) ? ` · ${(Number(warmest.temperatureMean) - tempNormal) >= 0 ? '+' : ''}${(Number(warmest.temperatureMean) - tempNormal).toFixed(1)} °C vs normale` : ''}` });
    if (coldest) cards.push({ icon: '📉', title: 'Année récente la plus fraîche', value: String(coldest.year), detail: `${Number(coldest.temperatureMean).toFixed(1)} °C${finite(tempNormal) ? ` · ${(Number(coldest.temperatureMean) - tempNormal) >= 0 ? '+' : ''}${(Number(coldest.temperatureMean) - tempNormal).toFixed(1)} °C vs normale` : ''}` });
    if (wettest) cards.push({ icon: '🌊', title: 'Année récente la plus humide', value: String(wettest.year), detail: `${Math.round(Number(wettest.precipitation))} mm${finite(rainNormal) ? ` · ${Math.round(100 * (Number(wettest.precipitation) - rainNormal) / rainNormal)} % vs normale` : ''}` });
    if (driest) cards.push({ icon: '🌵', title: 'Année récente la plus sèche', value: String(driest.year), detail: `${Math.round(Number(driest.precipitation))} mm${finite(rainNormal) ? ` · ${Math.round(100 * (Number(driest.precipitation) - rainNormal) / rainNormal)} % vs normale` : ''}` });

    return cards;
  }

  function render() {
    const list = byId('weather-history-list');
    if (!list || !climate) return;
    const cards = buildCards(climate);
    list.innerHTML = cards.map(card => `
      <article class="weather-history-item climate-record-summary">
        <span class="weather-history-icon" aria-hidden="true">${card.icon}</span>
        <div>
          <small>${card.title}</small>
          <strong>${card.value}</strong>
          <p>${card.detail}</p>
        </div>
      </article>
    `).join('') || '<p>Aucun record climatique disponible pour cette localisation.</p>';
  }

  function init() {
    if (!byId('weather-history-section')) return;
    window.addEventListener('climate-data-ready', event => {
      climate = event.detail;
      render();
    });
  }

  return { init };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', WeatherHistory.init);
} else {
  WeatherHistory.init();
}
