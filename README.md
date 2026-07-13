# Météo Lab V2

Tableau de bord météo statique, responsive et installable, conçu pour GitHub Pages.

## Fonctionnalités

- météo actuelle et température ressentie ;
- prévisions heure par heure et sur sept jours ;
- lever et coucher du soleil, UV, humidité, pression et vent ;
- qualité de l’air et synthèse des pollens ;
- comparaison ARPEGE, ICON, GFS et ECMWF avec Chart.js ;
- graphique AROME 48 h avec température, pluie et rafales ;
- tendance ECMWF IFS de J+5 à J+10 ;
- suivi de l’heure de récupération et du run estimé de chaque modèle ;
- recherche de ville et géolocalisation ;
- carte Ventusky ;
- PWA avec cache hors ligne de l’interface ;
- thèmes visuels selon la météo et le jour ou la nuit.

## Arborescence

```text
meteo-lab-v2/
├── index.html
├── style.css
├── manifest.json
├── service-worker.js
├── assets/
│   └── icon.svg
└── js/
    ├── config.js
    ├── api.js
    ├── weather.js
    ├── charts.js
    ├── ui.js
    ├── animations.js
    ├── radar.js
    └── app.js
```

## Tester localement

Un service worker ne fonctionne pas correctement en ouvrant directement `index.html`.
Lance un petit serveur local depuis le dossier du projet :

```bash
python -m http.server 8000
```

Puis ouvre `http://localhost:8000`.

## Publier sur GitHub Pages

1. Crée un dépôt GitHub.
2. Ajoute tout le contenu de ce dossier à la racine du dépôt.
3. Dans **Settings → Pages**, sélectionne **Deploy from a branch**.
4. Choisis la branche `main` et le dossier `/ (root)`.
5. Enregistre et ouvre l’adresse fournie par GitHub.

Tous les chemins sont relatifs et fonctionnent aussi sur une URL de type
`https://utilisateur.github.io/nom-du-depot/`.

## Données et dépendances

- Open-Meteo pour les prévisions, le géocodage, l’air et les pollens ;
- Chart.js chargé depuis jsDelivr ;
- Ventusky intégré dans une iframe.

Aucune clé API n’est nécessaire pour cette version.

## Personnalisation

La ville par défaut se modifie dans `js/config.js` :

```js
defaultLocation: {
  name: 'Brûlain',
  latitude: 46.2025,
  longitude: -0.3297,
  timezone: 'Europe/Paris'
}
```

## Limites

- Les données dépendent de services externes.
- Ventusky peut modifier ses paramètres d’intégration.
- Le cache du service worker conserve l’interface, mais les données météo hors ligne
  ne sont disponibles que si elles ont déjà été consultées.


## À propos des runs affichés

L’API ne communique pas toujours l’heure exacte d’initialisation de chaque modèle.
Le site calcule donc un **run estimé** à partir des horaires théoriques et d’un délai
approximatif de mise à disposition. L’heure « Données reçues » correspond, elle, à
l’heure réelle de la requête effectuée par le navigateur.

## Heures de mise à jour visibles

La liste compare un échantillon des données reçues à celui de la visite précédente.
Quand les valeurs changent, l'heure de détection est enregistrée dans le navigateur.
Elle représente donc une mise à jour réellement visible par ce navigateur, et non
l'heure officielle d'initialisation du modèle.


## Version 4

Cette version remplace entièrement `ui.js` et `app.js` afin d’éliminer les blocs
dupliqués qui provoquaient `Unexpected token '}'` et `MeteoUI is not defined`.


## Version 5 — Cartes Europe

Cette version ajoute une carte interactive Open-Meteo Maps couvrant l’Europe, le choix des modèles et paramètres dans la carte, ainsi qu’un radar pluie Europe animé basé sur RainViewer et OpenStreetMap.

Services externes : Open-Meteo Maps, RainViewer, OpenStreetMap et Leaflet. Leur disponibilité et leurs conditions d’utilisation s’appliquent.


# V6 — lecteur de cartes générées

Cette version remplace l’iframe des modèles par un lecteur autonome intégré au site.

## Mise en route

1. Dépose tous les fichiers à la racine du dépôt GitHub.
2. Ouvre l’onglet **Actions** du dépôt.
3. Sélectionne **Generate weather maps**.
4. Clique sur **Run workflow**.
5. Attends la fin du workflow et son commit automatique.
6. Recharge le site GitHub Pages.

Le workflow se relance ensuite automatiquement quatre fois par jour.

## Modèles et champs de la première version

### GFS

- température à 2 m ;
- pression au niveau de la mer ;
- précipitations cumulées ;
- vent à 10 m ;
- géopotentiel 500 hPa avec pression au sol.

### ICON-EU

- température à 2 m ;
- pression au niveau de la mer ;
- précipitations cumulées ;
- vent à 10 m.

Les cartes sont produites toutes les six heures d’échéance, de +0 h à +120 h.

## Architecture

```text
.github/workflows/generate-maps.yml
scripts/render_maps.py
scripts/requirements-maps.txt
maps/manifest.json
maps/gfs/...
maps/icon_eu/...
js/model-player.js
```

## Points importants

- Le premier workflow peut durer plusieurs dizaines de minutes.
- Les données brutes GRIB ne sont jamais conservées dans Git.
- Seules les images WebP et le manifeste sont commités.
- Le workflow utilise les données GFS de NOAA/NOMADS et ICON-EU du DWD.
- En cas d’échec partiel d’un modèle, l’autre peut tout de même être publié.
- Le dépôt peut grossir avec le temps ; le script supprime les anciennes cartes avant
  de produire le nouveau run.


# V7 — échelles et lecteur amélioré

La V7 ajoute :

- des valeurs chiffrées et les unités sur les barres de couleurs des images générées ;
- une légende HTML dynamique sous la carte ;
- une échelle adaptée à chaque variable ;
- un compteur d’images ;
- le téléchargement de la carte courante ;
- le préchargement des images précédente et suivante ;
- les raccourcis clavier gauche, droite et espace ;
- un indicateur de chargement ;
- une correction générale de l’attribut HTML `hidden`.

Après installation, il faut relancer le workflow **Generate weather maps** afin que
les nouvelles cartes soient régénérées avec les graduations directement inscrites sur
les images.


# V8
Ajoute ECMWF IFS, AROME, ARPEGE, CAPE, jet stream 300 hPa, Z500 + pression et anomalies de température.

Ordre conseillé dans GitHub Actions :
1. lancer une fois `Build 1991-2020 climatology` ;
2. lancer `Generate weather maps` ;
3. attendre le commit automatique puis recharger GitHub Pages.

Les cartes de base GFS/ICON restent issues du traitement GRIB natif. Les produits avancés et les modèles supplémentaires utilisent une grille synoptique Open-Meteo plus légère afin de rester compatibles avec GitHub Actions.


# V8.1 — climatologie résistante aux limites API

Le workflow de climatologie a été réécrit pour éviter l’erreur HTTP 429 :

- grille Europe allégée à 6° par défaut ;
- une coordonnée par requête ;
- périodes découpées en blocs de cinq ans ;
- pause entre les appels ;
- temporisation exponentielle et prise en charge de `Retry-After` ;
- fichier de progression local sauvegardé après chaque requête ;
- contrôle automatique du fichier final avant le commit.

Dans GitHub Actions, lance **Build 1991-2020 climatology** avec la valeur `6`.
Une fois le workflow terminé, lance **Generate weather maps** pour créer les anomalies.


# V8.2 — correction HTTP 429

Le workflow de climatologie 1991–2020 a été retiré. L’API historique gratuite
refusait encore le volume demandé avec une erreur HTTP 429.

La V8.2 conserve ECMWF, AROME, ARPEGE, GFS, ICON-EU, CAPE, jet stream,
Z500, température, pluie, vent et pression. Il ne reste qu’un workflow à lancer :

```text
Generate weather maps
```

Les anomalies sont désactivées jusqu’à l’utilisation de normales ERA5 mensuelles
provenant du Copernicus Climate Data Store.
