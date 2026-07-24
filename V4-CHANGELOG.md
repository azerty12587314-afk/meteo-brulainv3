# Météo Lab V4

## Ajouts
- ECMWF IFS Open Data dans le générateur de cartes et le manifeste.
- Comparaison GFS / ICON-EU / ECMWF via le lecteur existant.
- Alertes issues du cache de surveillance sur la carte Leaflet.
- Graphiques climatologiques d’anomalies et de tendance.
- Chronologie d’événements extrêmes issue de la réanalyse.
- Refonte responsive mobile/tablette et harmonisation visuelle.
- Cache Service Worker V4, cache API étendu et images en stale-while-revalidate.

## Premier test des cartes
Lancer **Generate weather maps** avec `max_hour=12` et `step=6`, puis passer à 120 h.
ECMWF Open Data utilise le flux `oper`, type `fc`, cycles 00/12 UTC.
