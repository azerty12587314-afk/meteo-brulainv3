# Déployer le projet pour une autre ville

Le projet utilise maintenant un profil central : `config/site.json`.

## Procédure rapide

1. Duplique le dépôt GitHub.
2. Modifie uniquement `config/site.json` : nom, coordonnées, fuseau horaire, code INSEE et stations METAR.
3. Dans GitHub, ouvre **Actions → Apply site profile → Run workflow**.
4. Lance ensuite les workflows de données : climatologie, observations, surveillance, restrictions d’eau et cartes.
5. Vérifie les secrets Ecowitt/API si la nouvelle ville utilise une autre station personnelle.

## Exemple de changement

```json
"location": {
  "name": "Poitiers",
  "latitude": 46.5802,
  "longitude": 0.3404,
  "timezone": "Europe/Paris",
  "insee": "86194"
}
```

Le workflow adapte automatiquement les libellés, la position initiale des cartes, la météo principale, les observations et le fichier `data/location.json` utilisé par les scripts Python.

Les anciens fichiers de données JSON peuvent encore contenir l’ancienne ville jusqu’à la première exécution des workflows de régénération.
