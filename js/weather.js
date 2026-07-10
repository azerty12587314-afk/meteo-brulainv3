'use strict';

window.WeatherUtils = (() => {
  const codes = {
    0: ['Ciel dégagé', '☀️', 'clear'],
    1: ['Peu nuageux', '🌤️', 'clear'],
    2: ['Partiellement nuageux', '⛅', 'cloudy'],
    3: ['Couvert', '☁️', 'cloudy'],
    45: ['Brouillard', '🌫️', 'cloudy'],
    48: ['Brouillard givrant', '🌫️', 'cloudy'],
    51: ['Bruine légère', '🌦️', 'rain'],
    53: ['Bruine modérée', '🌦️', 'rain'],
    55: ['Bruine dense', '🌧️', 'rain'],
    56: ['Bruine verglaçante', '🌧️', 'rain'],
    57: ['Forte bruine verglaçante', '🌧️', 'rain'],
    61: ['Pluie faible', '🌧️', 'rain'],
    63: ['Pluie modérée', '🌧️', 'rain'],
    65: ['Pluie forte', '🌧️', 'rain'],
    66: ['Pluie verglaçante', '🌧️', 'rain'],
    67: ['Forte pluie verglaçante', '🌧️', 'rain'],
    71: ['Neige légère', '🌨️', 'snow'],
    73: ['Neige modérée', '❄️', 'snow'],
    75: ['Neige forte', '❄️', 'snow'],
    77: ['Grains de neige', '🌨️', 'snow'],
    80: ['Averses faibles', '🌦️', 'rain'],
    81: ['Averses modérées', '🌧️', 'rain'],
    82: ['Averses violentes', '🌧️', 'rain'],
    85: ['Averses de neige', '🌨️', 'snow'],
    86: ['Fortes averses de neige', '❄️', 'snow'],
    95: ['Orage', '⛈️', 'storm'],
    96: ['Orage avec grêle', '⛈️', 'storm'],
    99: ['Fort orage avec grêle', '⛈️', 'storm']
  };

  function info(code, isDay = 1) {
    const entry = codes[Number(code)] || ['Conditions variables', '🌤️', 'cloudy'];
    if (!isDay && Number(code) <= 1) return { text: 'Ciel dégagé', icon: '🌙', theme: 'clear' };
    if (!isDay && Number(code) === 2) return { text: entry[0], icon: '☁️', theme: entry[2] };
    return { text: entry[0], icon: entry[1], theme: entry[2] };
  }

  function formatTemperature(value) {
    return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}°C` : '--°C';
  }

  function formatNumber(value, unit = '', digits = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(digits)}${unit}` : `--${unit}`;
  }

  function formatTime(iso, timezone) {
    if (!iso) return '--:--';
    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone
    }).format(new Date(iso));
  }

  function formatDay(iso, timezone) {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      timeZone: timezone
    }).format(new Date(iso)).replace('.', '');
  }

  function windDirection(degrees) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const index = Math.round((((Number(degrees) % 360) + 360) % 360) / 45) % 8;
    return dirs[index];
  }

  function airQualityLabel(index) {
    const value = Number(index);
    if (!Number.isFinite(value)) return { label: 'Indisponible', level: 'unknown' };
    if (value <= 20) return { label: 'Très bonne', level: 'good' };
    if (value <= 40) return { label: 'Bonne', level: 'good' };
    if (value <= 60) return { label: 'Moyenne', level: 'medium' };
    if (value <= 80) return { label: 'Mauvaise', level: 'bad' };
    if (value <= 100) return { label: 'Très mauvaise', level: 'bad' };
    return { label: 'Extrêmement mauvaise', level: 'bad' };
  }

  function uvLabel(value) {
    const uv = Number(value);
    if (!Number.isFinite(uv)) return 'Indisponible';
    if (uv < 3) return 'Faible';
    if (uv < 6) return 'Modéré';
    if (uv < 8) return 'Élevé';
    if (uv < 11) return 'Très élevé';
    return 'Extrême';
  }

  function pollenSummary(hourly, index = 0) {
    if (!hourly) return 'Indisponible';
    const keys = ['alder_pollen', 'birch_pollen', 'grass_pollen', 'mugwort_pollen', 'ragweed_pollen'];
    const values = keys.map(key => Number(hourly[key]?.[index] || 0));
    const max = Math.max(...values);
    if (max < 1) return 'Très faible';
    if (max < 10) return 'Faible';
    if (max < 50) return 'Modéré';
    return 'Élevé';
  }

  return {
    info, formatTemperature, formatNumber, formatTime, formatDay,
    windDirection, airQualityLabel, uvLabel, pollenSummary
  };
})();
