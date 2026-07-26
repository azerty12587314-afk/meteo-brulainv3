# Mise à jour — échéances toutes les 3 heures

La génération des cartes utilise maintenant un pas de **3 heures** par défaut :

- +0 h, +3 h, +6 h, +9 h, etc. jusqu’à l’échéance maximale ;
- le manifeste est régénéré automatiquement à partir des nouvelles images ;
- le lecteur affiche les nouvelles échéances sans modification supplémentaire.

## Mise en service

1. Publier les fichiers modifiés sur GitHub.
2. Ouvrir **Actions > Generate weather maps**.
3. Cliquer sur **Run workflow**.
4. Conserver `step = 3` et choisir l’échéance maximale souhaitée.
5. Attendre le commit automatique du dossier `maps/`.

Le nombre de cartes étant environ doublé par rapport à un pas de 6 heures, le workflow peut prendre plus longtemps et utiliser davantage d’espace dans le dépôt.
