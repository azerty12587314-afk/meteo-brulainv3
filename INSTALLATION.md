# Pack Cartes modèles Europe

Copier les fichiers dans le dépôt en conservant exactement cette arborescence :

```text
.github/workflows/generate-maps.yml
scripts/render_maps.py
scripts/generate_weather_maps.py
scripts/validate_maps.py
scripts/requirements-maps.txt
```

Supprimer l'ancien `scripts/generate-maps.yml` s'il existe : les workflows doivent être placés dans `.github/workflows/`.

Pour un premier essai rapide dans GitHub Actions, lancer le workflow avec `max_hour = 12` et `step = 6`. Après validation, relancer avec `max_hour = 120`.
