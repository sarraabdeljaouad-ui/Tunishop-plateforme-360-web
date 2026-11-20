# TuniShop · Plateforme vue 360 (version HTML)

Auteure : Sarra Abdeljaouad · Étape 9 du projet TuniShop, version 2 de la plateforme

> **Projet complet** (du staging à l'automatisation : DWH, cubes SSAS, Power BI, ML) : [tunishop-projet-data-bi](https://github.com/sarraabdeljaouad-ui/tunishop-projet-data-bi)
> 
> **Site en ligne : [sarraabdeljaouad-ui.github.io/Tunishop-plateforme-360-web](https://sarraabdeljaouad-ui.github.io/Tunishop-plateforme-360-web/)**
>
> **Version Streamlit : [tunishopsarraapps.streamlit.app](https://tunishopsarraapps.streamlit.app)** · code : [sarraabdeljaouad-ui/tunishop-plateforme-360](https://github.com/sarraabdeljaouad-ui/tunishop-plateforme-360) (v0.13.3)

Même plateforme que la version Streamlit, en site statique (données : export `demo_data` du 17/11/2026) : HTML, CSS et JavaScript, sans serveur.
Les données sont des fichiers JSON exportés une fois ; le navigateur fait tout le reste (recherche floue comprise).

## Architecture

```
demo_data/ (Parquet, plateforme Streamlit)          mêmes données que la démo Streamlit
   └─ scripts/exporter_web.py  (DuckDB)             une requête par bloc de donnees.py, sur toutes les entités
        └─ site/data/*.json                         fichiers JSON ; fiches découpées en 100 paquets
             └─ site/js/                            donnees.js (lecture), recherche.js, format.js, ui.js
                  └─ site/*.html + js/pages/        une page HTML par page Streamlit
```

```
site/                    le site publié (GitHub Pages)
  *.html                 une page par écran : recherche.html?q=…, client.html?id=CLI004074…
  css/tunishop-theme.css charte de la version HTML (jetons, mise en page, composants de ui.py), telle quelle
  css/complements.css    ce que la charte ne couvre pas encore (messages, volet, légendes), avec ses jetons
  js/app.js              cadre commun : menu latéral, recherche, état de la chaîne
  js/recherche.js        recherche floue : portage exact de src/recherche.py (scores rapidfuzz recodés)
  js/format.js           formats à la française (tunishop-format.js), arrondi identique à Python
  js/regles.js           règles de calcul de src/regles.py (rupture, couverture, projection, score fournisseur)
  data/                  JSON exportés (ne pas modifier à la main)
scripts/exporter_web.py  export Parquet -> JSON
tests/                   conformité de la recherche JS (test_recherche_js.py) et des formats (test_format_js.py),
                         test de fumée du site (test_fumee_web.py)
                         avec la version Python
                         et du texte des fiches avec Streamlit (comparer_pages.py)
```

## Mettre à jour les données

Après un nouvel export de la démo Streamlit (`python scripts/exporter_demo.py` dans la plateforme Streamlit) :

```
python scripts/exporter_web.py --source ..\tunishop-vue360\demo_data
python tests/test_recherche_js.py --streamlit ..\tunishop-vue360
```

Puis, site lancé :

```
python tests/test_fumee_web.py
```

Le test de fumée ouvre les 17 cas du test de fumée Streamlit et écrit `tests/rapport_fumee_web.csv`.
Le test de recherche compare la recherche JavaScript à `src/recherche.py` sur une centaine de saisies (dont 60 avec fautes)
et 400 paires de scores : il doit afficher 0 écart. Il demande Node.js.

## Voir le site en local

Les pages lisent des fichiers JSON : il faut un petit serveur (un double-clic sur le fichier HTML ne suffit pas).

```
python scripts/serveur_local.py
```

Puis ouvrir http://localhost:8600/recherche.html. Ne pas utiliser `python -m http.server` sous Windows :
il annonce souvent les fichiers .js comme du texte, et le navigateur affiche alors des pages blanches.

## Publication

Le fichier `.github/workflows/pages.yml` publie le dossier `site/` sur GitHub Pages à chaque envoi sur `main`
(réglage du dépôt : Settings > Pages > Source : GitHub Actions).

## Avancement

| Page | État |
|---|---|
| Recherche | faite : 0 écart avec la recherche Python (103 saisies) |
| Client | faite : texte identique à Streamlit sur 42 clients (35 au hasard + 7 cas limites) |
| Commande | faite : texte identique à Streamlit sur 29 commandes (19 au hasard + 10 cas limites) |
| Produit | faite : texte identique à Streamlit sur 19 produits, hors ordre des thèmes à égalité |
| Fournisseur | faite : texte identique à Streamlit sur les 40 fournisseurs |
| Transporteur | faite : texte identique à Streamlit pour les 4 transporteurs (par nom ou identifiant) |
| Accueil | faite : texte identique à Streamlit (4 onglets compris), libellés d'onglets au format de la charte |
| Voix du client | faite : texte identique à Streamlit sur 6 filtres, hors ordre des thèmes à égalité |
| Modèles | faite : texte identique à Streamlit |
| Vérification | faite : adaptée au site (navigateur, présence des 307 fichiers de données, index de recherche) |
