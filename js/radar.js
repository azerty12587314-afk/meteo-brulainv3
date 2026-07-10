'use strict';

window.MeteoRadar = (() => {
  function update(location) {
    const iframe = document.getElementById('ventusky');
    if (!iframe) return;
    const lat = Number(location.latitude).toFixed(3);
    const lon = Number(location.longitude).toFixed(3);
    iframe.title = `Carte météo interactive autour de ${location.name}`;
    iframe.src = `https://www.ventusky.com/?p=${lat};${lon};8&l=rain-3h`;
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('allowfullscreen', '');
  }
  return { update };
})();
