"""
TuniShop - Plateforme vue 360 (version HTML)
scripts/exporter_web.py : exporte en JSON les données lues par le site statique (dossier site/data/).

Source : les fichiers Parquet de la démo Streamlit (dossier demo_data/ de la plateforme Streamlit),
eux-mêmes exportés de SQL Server par scripts/exporter_demo.py. Les deux versions de la plateforme
affichent donc exactement les mêmes données.

Principe :
    - chaque bloc reprend une fonction de src/donnees.py (même vue, mêmes colonnes, mêmes tris) ;
      les requêtes « WHERE client_id = :id » deviennent une seule requête sur tous les clients,
      puis le résultat est découpé par identifiant ;
    - les fiches (clients, commandes) sont réparties en 100 paquets : une fiche ne charge que le sien ;
    - les dates techniques du DWH (année 1900 ou avant) deviennent vides, comme dans donnees.py.

Lancer (depuis le dossier du site) :
    python scripts/exporter_web.py --source ..\\tunishop-vue360\\demo_data

Auteure : Sarra Abdeljaouad
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import time
from datetime import date, datetime
from pathlib import Path

import duckdb
import pandas as pd

RACINE = Path(__file__).resolve().parents[1]
SORTIE = RACINE / "site" / "data"
NB_PAQUETS = 100
SEUIL_ECART_FIABILITE = -0.05          # même valeur que donnees.SEUIL_ECART_FIABILITE

# Vues lues, sous le même nom qu'en SQL Server (catalogue TuniShop_DWH pour les vues bi du DWH)
OBJETS = [
    "TuniShop_DWH.bi.v_dim_client", "TuniShop_DWH.bi.v_dim_date", "TuniShop_DWH.bi.v_dim_geographie",
    "TuniShop_DWH.bi.v_dim_produit", "TuniShop_DWH.bi.v_dim_transporteur", "TuniShop_DWH.bi.v_fact_avis",
    "TuniShop_DWH.bi.v_fact_livraisons",
    "ana.dm02_profil_clusters", "ana.ml03_importance", "ana.ml_metriques_retard", "ana.ml_pred_ventes_2026",
    "ana.tm_avis", "ana.tm_avis_themes",
    "app.v_client_annee", "app.v_client_churn_test", "app.v_client_commandes", "app.v_client_experience",
    "app.v_client_habitudes", "app.v_client_identite", "app.v_client_kpi", "app.v_client_produits",
    "app.v_client_remboursements", "app.v_client_rfm", "app.v_client_ventes_mois", "app.v_commande_fiche",
    "app.v_commande_lignes", "app.v_commande_livraison", "app.v_fournisseur_achats_mois", "app.v_fournisseur_annee",
    "app.v_fournisseur_fiche", "app.v_index_recherche", "app.v_livraison_detail", "app.v_produit_annee",
    "app.v_produit_identite", "app.v_produit_kpi", "app.v_produit_stock_mois", "app.v_produit_ventes_mois",
    "ctl.v_derniere_execution",
    "pbi.v_dm_regles", "pbi.v_eda_vue_ensemble", "pbi.v_ml_modeles", "pbi.v_ml_registre", "pbi.v_ml_retard",
    "pbi.v_ml_scores_churn", "pbi.v_ml_scores_demande", "pbi.v_ml_scores_retard", "pbi.v_ml_suivi",
    "pbi.v_ml_suivi_historique", "pbi.v_ml_ventes",
    "pbi.v_tm_avis", "pbi.v_tm_avis_themes", "pbi.v_tm_produits", "pbi.v_tm_verification_faits",
]
# Objets apparus après la version 1.0.0 : s'ils manquent (export Streamlit plus ancien), une vue vide les remplace.
OPTIONNELS = {
    "pbi.v_ml_suivi_historique": "SELECT CAST(NULL AS DATE) AS date_donnees, CAST(NULL AS VARCHAR) AS cas, "
                                 "CAST(NULL AS VARCHAR) AS statut WHERE FALSE",       # étape 7 v1.5
}


# ---------------------------------------------------------------------------
# Lecture
# ---------------------------------------------------------------------------
def connexion(source: Path) -> duckdb.DuckDBPyConnection:
    """Base DuckDB en mémoire : une vue par fichier Parquet, sous le même nom qu'en SQL Server."""
    con = duckdb.connect()
    con.execute("ATTACH ':memory:' AS TuniShop_DWH")
    con.execute("CREATE SCHEMA IF NOT EXISTS TuniShop_DWH.bi")
    for schema in ("app", "pbi", "ana", "ctl"):
        con.execute(f"CREATE SCHEMA IF NOT EXISTS {schema}")
    manquants = []
    for objet in OBJETS:
        f = source / f"{objet}.parquet"
        if not f.exists():
            if objet in OPTIONNELS:
                con.execute(f"CREATE VIEW {objet} AS {OPTIONNELS[objet]}")
            else:
                manquants.append(objet)
            continue
        chemin = str(f).replace("'", "''")
        con.execute(f"CREATE VIEW {objet} AS SELECT * FROM read_parquet('{chemin}')")
    if manquants:
        raise SystemExit(f"Fichiers Parquet manquants dans {source} : {manquants}")
    return con


def sans_dates_techniques(df: pd.DataFrame) -> pd.DataFrame:
    """Comme donnees._sans_dates_techniques : une date de l'an 1900 ou avant devient vide."""
    for col in df.columns:
        s = df[col]
        if pd.api.types.is_datetime64_any_dtype(s):
            df[col] = s.where(s.dt.year > 1900)
        elif s.dtype == object:
            premier = s.dropna().iloc[0] if s.notna().any() else None
            if isinstance(premier, (date, datetime)):
                s = pd.to_datetime(s, errors="coerce")
                df[col] = s.where(s.dt.year > 1900)
    return df


def lire(con, sql: str, **params) -> pd.DataFrame:
    return sans_dates_techniques(con.execute(sql, params).df())


# ---------------------------------------------------------------------------
# Écriture JSON (tables compactes : colonnes + lignes)
# ---------------------------------------------------------------------------
def valeur(v):
    if v is None or v is pd.NaT or v is pd.NA:
        return None
    if isinstance(v, float):
        # 12 chiffres significatifs : les sommes calculées en parallèle par DuckDB varient au 16e chiffre ;
        # arrondies, deux exports successifs donnent des fichiers identiques (les pages affichent 3 décimales au plus)
        return None if math.isnan(v) else float(f"{v:.12g}")
    if isinstance(v, pd.Timestamp):
        if pd.isna(v):
            return None
        return v.strftime("%Y-%m-%d") if (v.hour, v.minute, v.second) == (0, 0, 0) else v.strftime("%Y-%m-%dT%H:%M:%S")
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if hasattr(v, "item"):                       # types numpy
        return valeur(v.item())
    return v


def table(df: pd.DataFrame) -> dict:
    """{"c": [colonnes], "l": [[valeurs], ...]} : 2 à 3 fois plus léger que des objets par ligne."""
    return {"c": list(df.columns), "l": [[valeur(v) for v in ligne] for ligne in df.itertuples(index=False)]}


def ecrire(chemin: Path, contenu) -> int:
    chemin.parent.mkdir(parents=True, exist_ok=True)
    texte = json.dumps(contenu, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    chemin.write_text(texte, encoding="utf-8")
    return len(texte.encode("utf-8"))


def paquet(identifiant: str) -> str:
    """CLI004761 -> '61' ; CMD0066011 -> '11' : les deux derniers chiffres (répartition régulière)."""
    chiffres = "".join(ch for ch in str(identifiant) if ch.isdigit())
    return f"{int(chiffres or 0) % NB_PAQUETS:02d}"


# ---------------------------------------------------------------------------
# Blocs communs
# ---------------------------------------------------------------------------
def bloc_global(con, manifeste: dict) -> dict:
    """Menu latéral (donnees.fraicheur) : dernière exécution de la chaîne, date des données."""
    ex = lire(con, "SELECT notebook, statut, debut, fin FROM ctl.v_derniere_execution")
    ref = pd.Timestamp(lire(con, "SELECT MAX(date_scoring) AS d FROM pbi.v_ml_scores_churn").iat[0, 0])
    return {
        "date_export": manifeste.get("date_export", "—"),
        "execution": ex["fin"].max().strftime("%d/%m/%Y · %H:%M") if not ex.empty else "—",
        "ok": bool(len(ex)) and bool((ex["statut"] == "OK").all()),
        "date_reference": ref.strftime("%Y-%m-%d"),
    }


def bloc_recherche(con) -> dict:
    """Page Recherche : index (donnees.index_recherche) et détails affichés sous chaque résultat
    (donnees.etat_produits, resume_fournisseurs, resume_clients). L'ordre des lignes de l'index est
    celui de la vue : il départage les scores égaux, comme dans la version Streamlit."""
    index = lire(con, "SELECT type_entite, id, libelle, detail, sku FROM app.v_index_recherche")
    produits = lire(con, """
        SELECT i.produit_id, i.categorie, d.stock_depart, d.mois_rupture
        FROM app.v_produit_identite AS i
        LEFT JOIN (SELECT produit_id, MAX(stock_depart) AS stock_depart,
                          MIN(CASE WHEN rupture_sans_reappro = 1 THEN mois END) AS mois_rupture
                   FROM pbi.v_ml_scores_demande
                   WHERE date_scoring = (SELECT MAX(date_scoring) FROM pbi.v_ml_scores_demande)
                   GROUP BY produit_id) AS d ON d.produit_id = i.produit_id
        ORDER BY i.produit_id""")
    fournisseurs = lire(con, """
        SELECT f.fournisseur_id, f.pays, f.fiabilite_annoncee, f.fiabilite_reelle,
               (SELECT COUNT(*) FROM app.v_produit_identite AS p WHERE p.fournisseur_id = f.fournisseur_id) AS nb_produits
        FROM app.v_fournisseur_fiche AS f ORDER BY f.fournisseur_id""")
    clients = lire(con, "SELECT client_id, segment_rfm FROM app.v_client_identite WHERE proba_churn IS NOT NULL ORDER BY client_id")
    return {"index": table(index), "produits": table(produits),
            "fournisseurs": table(fournisseurs), "clients": table(clients)}


# ---------------------------------------------------------------------------
# Fiche Client : un fichier par paquet de clients (data/clients/NN.json)
# ---------------------------------------------------------------------------
# Colonnes exportées par bloc (celles que la page lit). Chaque bloc reprend une fonction de donnees.py :
# la requête est la même, sans le filtre « WHERE client_id = :id », et « TOP (n) » devient un rang par client.
# En cas d'égalité parfaite sur le tri de donnees.py, un dernier critère (identifiant, libellé) rend l'export
# reproductible d'une exécution à l'autre ; SQL Server, lui, départage au hasard.
BLOCS_CLIENT = {
    # donnees.client_identite
    "i": ("""SELECT client_id, nom_complet, type_client, ville, date_inscription, cluster, segment_rfm,
                    date_scoring, proba_churn, alerte_churn, decile_risque, recence_j, frequence,
                    montant_reconnu_ttc, version_modele, action_recommandee
             FROM app.v_client_identite""", "ligne"),
    # donnees.client_kpi
    "k": ("""SELECT client_id, nb_commandes, ca_reconnu_ttc, premiere_commande, derniere_commande
             FROM app.v_client_kpi""", "ligne"),
    # donnees.client_annees
    "an": ("""SELECT client_id, annee, nb_commandes, ca_reconnu_ttc, panier_moyen_ttc, taux_retour, note_moyenne
              FROM app.v_client_annee ORDER BY client_id, annee""", "table"),
    # donnees.client_ventes_mois
    "vm": ("""SELECT client_id, mois, ca_reconnu_ttc FROM app.v_client_ventes_mois ORDER BY client_id, mois""", "table"),
    # donnees.client_rfm
    "rfm": ("""SELECT client_id, date_observation, segment_rfm FROM app.v_client_rfm
               ORDER BY client_id, date_observation""", "table"),
    # donnees.client_experience
    "xp": ("""SELECT client_id, nb_commandes, nb_commandes_avec_coupon, nb_livrees, nb_livrees_en_retard,
                     nb_tentatives_paiement, nb_paiements_echoues, nb_remboursements, montant_rembourse_ttc
              FROM app.v_client_experience""", "ligne"),
    # donnees.client_churn_test (seule la dernière observation est affichée)
    "test": ("""SELECT client_id, date_observation, prediction, churn_reel FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY date_observation DESC) AS rang
                    FROM app.v_client_churn_test) WHERE rang = 1""", "ligne"),
    # donnees.client_commandes(ident, 6)
    "cmd": ("""SELECT client_id, id, date_commande, libelle_statut, montant_total_ttc,
                      statut_livraison, retard_j, est_livree, transporteur FROM (
                   SELECT c.client_id, c.commande_id AS id, c.date_commande, c.libelle_statut, c.montant_total_ttc,
                          l.statut_livraison, l.retard_j, l.est_livree, l.transporteur,
                          ROW_NUMBER() OVER (PARTITION BY c.client_id
                                             ORDER BY c.date_commande DESC, c.commande_id DESC) AS rang
                   FROM app.v_client_commandes AS c
                   LEFT JOIN app.v_commande_livraison AS l ON l.commande_id = c.commande_id)
               WHERE rang <= 6 ORDER BY client_id, rang""", "table"),
    # donnees.client_produits(ident, 6)
    "prod": ("""SELECT client_id, id, nom_produit, categorie, quantite, montant_ttc, dernier_achat FROM (
                    SELECT client_id, produit_id AS id, nom_produit, categorie, quantite, montant_ttc, dernier_achat,
                           ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY montant_ttc DESC, produit_id) AS rang
                    FROM app.v_client_produits)
                WHERE rang <= 6 ORDER BY client_id, rang""", "table"),
    # donnees.client_avis : la page affiche le nombre d'avis et les 4 plus récents
    "av": ("""SELECT client_id, date_avis, langue, texte_nettoye, themes, note, nb FROM (
                  SELECT client_id, date_avis, langue, texte_nettoye, themes, note,
                         COUNT(*) OVER (PARTITION BY client_id) AS nb,
                         ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY date_avis DESC, avis_id DESC) AS rang
                  FROM pbi.v_tm_avis WHERE client_id IS NOT NULL)
              WHERE rang <= 4 ORDER BY client_id, rang""", "table"),
    # donnees.client_habitudes : pour chaque dimension affichée, la valeur la plus fréquente
    # (même ordre que la requête : nb_commandes puis montant décroissants) et le total des commandes
    "hab": ("""SELECT client_id, dimension, valeur, nb_commandes, total FROM (
                   SELECT client_id, dimension, valeur, nb_commandes,
                          SUM(nb_commandes) OVER (PARTITION BY client_id, dimension) AS total,
                          ROW_NUMBER() OVER (PARTITION BY client_id, dimension
                                             ORDER BY nb_commandes DESC, montant_ttc DESC, valeur) AS rang
                   FROM app.v_client_habitudes
                   WHERE dimension IN ('transporteur', 'canal', 'appareil', 'mode de paiement'))
               WHERE rang = 1 ORDER BY client_id, dimension""", "table"),
}


def bloc_fiches(con, blocs: dict, cle: str, sql_ids: str) -> tuple[dict, dict]:
    """Découpe des blocs par entité (client, commande…) en paquets.
    blocs : {nom: (requête qui renvoie la colonne `cle`, "ligne" ou "table")}.
    Renvoie (colonnes par bloc, {paquet: {identifiant: {bloc: valeurs}}})."""
    colonnes, paquets = {}, {}
    for ident in lire(con, sql_ids)[cle]:
        paquets.setdefault(paquet(ident), {})[ident] = {}
    index = {i: f for p in paquets.values() for i, f in p.items()}
    for nom, (sql, forme) in blocs.items():
        df = lire(con, sql)
        cols = [c for c in df.columns if c != cle]
        colonnes[nom] = cols
        for ident, *r in df[[cle] + cols].itertuples(index=False, name=None):   # une passe, ordre de la requête
            fiche = index.get(ident)
            if fiche is None:
                continue
            ligne = [valeur(v) for v in r]
            if forme == "ligne":
                fiche.setdefault(nom, ligne)
            else:
                fiche.setdefault(nom, []).append(ligne)
    return colonnes, paquets


def bloc_clients(con) -> tuple[dict, dict]:
    return bloc_fiches(con, BLOCS_CLIENT, "client_id", "SELECT client_id FROM app.v_client_identite")


# ---------------------------------------------------------------------------
# Fiche Commande : un fichier par paquet de commandes (data/commandes/NN.json)
# ---------------------------------------------------------------------------
BLOCS_COMMANDE = {
    # donnees.commande_fiche (colonnes lues par la page)
    "f": ("""SELECT commande_id, date_commande, date_expedition, date_annulation, date_paiement, client_id, client,
                    type_client, gouvernorat, region, libelle_canal, libelle_mode_paiement, statut_commande,
                    libelle_statut, nb_lignes, nb_articles, remise_coupon_ttc, frais_livraison_ttc, montant_total_ttc,
                    montant_rembourse_ttc, delai_livraison_j, livraison_id, transporteur, statut_livraison,
                    est_livree, retard_j, date_prevue, date_livraison_colis
             FROM app.v_commande_fiche""", "ligne"),
    # donnees.commande_lignes
    "l": ("""SELECT commande_id, produit_id AS id, nom_produit, quantite, prix_unitaire_ttc, montant_ttc,
                    quantite_retournee, montant_rembourse_ttc, motif_retour, statut_retour
             FROM app.v_commande_lignes ORDER BY commande_id, montant_ttc DESC, produit_id""", "table"),
    # donnees.commande_avis
    "av": ("""SELECT commande_id, avis_id, produit_id, date_avis, note, langue, texte_nettoye, themes, polarite_globale
              FROM pbi.v_tm_avis WHERE commande_id IS NOT NULL ORDER BY commande_id, date_avis, avis_id""", "table"),
    # donnees.prediction_retard : test 2025 (livraison terminée) sinon dernier scoring (colis en transit)
    "pr": ("""SELECT f.commande_id, p.source, p.proba_retard, p.retard_reel, p.date_expedition, p.date_scoring
              FROM app.v_commande_fiche AS f
              JOIN (SELECT livraison_id, 'test' AS source, proba_retard, retard_reel, date_expedition,
                           CAST(NULL AS DATE) AS date_scoring, 1 AS ordre
                    FROM pbi.v_ml_retard
                    UNION ALL
                    SELECT livraison_id, 'en cours', proba_retard, CAST(NULL AS INT), date_expedition, date_scoring, 2
                    FROM pbi.v_ml_scores_retard) AS p ON p.livraison_id = f.livraison_id
              ORDER BY f.commande_id, p.ordre""", "ligne"),
}


def bloc_commandes(con) -> tuple[dict, dict]:
    return bloc_fiches(con, BLOCS_COMMANDE, "commande_id", "SELECT commande_id FROM app.v_commande_fiche")


def bloc_retard(con) -> dict:
    """donnees.seuil_retard et donnees.taux_retard_facteurs, pour chaque année d'expédition."""
    seuil = lire(con, "SELECT seuil FROM ana.ml_metriques_retard WHERE retenu = 1 LIMIT 1")
    taux = lire(con, """
        WITH l AS (
            SELECT d.annee, t.nom_transporteur, g.region, d.nom_jour,
                   CASE WHEN f.est_livree_a_temps = 0 THEN 1.0 ELSE 0.0 END AS en_retard
            FROM TuniShop_DWH.bi.v_fact_livraisons AS f
            JOIN TuniShop_DWH.bi.v_dim_date        AS d ON d.date_sk = f.date_expedition_sk
            LEFT JOIN TuniShop_DWH.bi.v_dim_transporteur AS t ON t.transporteur_sk = f.transporteur_sk
            LEFT JOIN TuniShop_DWH.bi.v_dim_geographie   AS g ON g.geographie_sk = f.geographie_sk
            WHERE f.est_livree = 1
        )
        SELECT annee, 'transporteur' AS facteur, nom_transporteur AS valeur, COUNT(*) AS n, AVG(en_retard) AS taux
        FROM l GROUP BY annee, nom_transporteur
        UNION ALL SELECT annee, 'region', region, COUNT(*), AVG(en_retard) FROM l GROUP BY annee, region
        UNION ALL SELECT annee, 'jour', nom_jour, COUNT(*), AVG(en_retard) FROM l GROUP BY annee, nom_jour
        UNION ALL SELECT annee, 'ensemble', 'toutes', COUNT(*), AVG(en_retard) FROM l GROUP BY annee
        ORDER BY annee, facteur, valeur""")
    return {"seuil": None if seuil.empty else float(seuil.iat[0, 0]), "facteurs": table(taux)}


# ---------------------------------------------------------------------------
# Fiche Produit : un fichier par paquet de produits (data/produits/NN.json)
# ---------------------------------------------------------------------------
DEMANDE_DERNIER = "date_scoring = (SELECT MAX(date_scoring) FROM pbi.v_ml_scores_demande)"
BLOCS_PRODUIT = {
    # donnees.produit_identite, avec les délais du fournisseur (donnees.fournisseur_fiche)
    "i": ("""SELECT i.produit_id, i.sku, i.nom_produit, i.categorie, i.sous_categorie, i.statut_produit,
                    i.prix_catalogue_ttc, i.fournisseur_id, i.nom_fournisseur,
                    f.delai_reel_moyen_j, f.delai_annonce_j
             FROM app.v_produit_identite AS i
             LEFT JOIN app.v_fournisseur_fiche AS f ON f.fournisseur_id = i.fournisseur_id""", "ligne"),
    # donnees.produit_kpi
    "k": ("""SELECT produit_id, quantite_vendue, nb_clients, nb_avis FROM app.v_produit_kpi""", "ligne"),
    # donnees.produit_annees
    "an": ("""SELECT produit_id, annee, ca_ttc, quantite_vendue, marge_brute_ht, taux_marge, taux_retour, note_moyenne
              FROM app.v_produit_annee ORDER BY produit_id, annee""", "table"),
    # donnees.produit_ventes_mois
    "vm": ("""SELECT produit_id, mois, quantite FROM app.v_produit_ventes_mois ORDER BY produit_id, mois""", "table"),
    # donnees.produit_demande (dernier scoring)
    "dem": (f"""SELECT produit_id, mois, quantite_prevue, stock_depart FROM pbi.v_ml_scores_demande
               WHERE {DEMANDE_DERNIER} ORDER BY produit_id, mois""", "table"),
    # donnees.produit_themes (à égalité de nombre d'avis, ordre alphabétique du thème)
    "th": ("""SELECT produit_id, theme, COUNT(*) AS nb_avis,
                     SUM(CASE WHEN polarite = 'négatif' THEN 1 ELSE 0 END) AS nb_negatifs
              FROM pbi.v_tm_avis_themes GROUP BY produit_id, theme ORDER BY produit_id, COUNT(*) DESC, theme""", "table"),
    # donnees.produit_synthese_avis
    "sy": ("""SELECT produit_id, nb_commentes, part_derja, nb_incoherents FROM pbi.v_tm_produits""", "ligne"),
    # donnees.produit_avis(ident, 4)
    "av": ("""SELECT produit_id, date_avis, note, langue, texte_nettoye, coherence FROM (
                  SELECT *, ROW_NUMBER() OVER (PARTITION BY produit_id ORDER BY date_avis DESC, avis_id DESC) AS rang
                  FROM pbi.v_tm_avis WHERE produit_id IS NOT NULL)
              WHERE rang <= 4 ORDER BY produit_id, rang""", "table"),
}


def bloc_produits(con) -> tuple[dict, dict]:
    return bloc_fiches(con, BLOCS_PRODUIT, "produit_id", "SELECT produit_id FROM app.v_produit_identite")


def bloc_regles(con) -> dict:
    """donnees.regles_categorie : règles stables sur 2025 de niveau catégorie ou sous-catégorie (tri par lift)."""
    return table(lire(con, """SELECT niveau, antecedents, consequents, confidence_2025, lift_2025
                              FROM pbi.v_dm_regles
                              WHERE stable = 1 AND niveau IN ('catégorie', 'sous-catégorie')
                              ORDER BY lift_2025 DESC, niveau, antecedents, consequents"""))


# ---------------------------------------------------------------------------
# Fiche Fournisseur : 40 fournisseurs, un seul fichier (data/fournisseurs.json)
# ---------------------------------------------------------------------------
def bloc_fournisseurs(con) -> dict:
    """Le score sur 100 classe chaque fournisseur parmi tous les autres (rang des retours) : la page reçoit donc
    les chiffres de tous les fournisseurs par année (donnees.fournisseurs_annee), puis le détail de chacun
    (fiche, produits de l'année de référence, prévision de demande de ses produits, achats par mois)."""
    an = int(lire(con, "SELECT YEAR(MAX(date_scoring)) AS a FROM pbi.v_ml_scores_churn").iat[0, 0])
    annees = lire(con, """SELECT a.fournisseur_id, a.annee, a.nb_commandes, a.montant_achete_ht, a.delai_reel_moyen_j,
                                 a.taux_reception, a.fiabilite_reelle, a.ca_aval_ttc, a.taux_retour
                          FROM app.v_fournisseur_annee AS a
                          JOIN app.v_fournisseur_fiche AS f ON f.fournisseur_id = a.fournisseur_id
                          ORDER BY a.annee, a.fournisseur_id""")
    blocs = {
        # donnees.fournisseur_fiche
        "f": ("""SELECT fournisseur_id, nom_fournisseur, pays, est_local, conditions_paiement, delai_annonce_j,
                        fiabilite_annoncee FROM app.v_fournisseur_fiche""", "ligne"),
        # donnees.fournisseur_produits(ident, an) : à CA égal (ou vide), ordre de l'identifiant produit
        "prod": (f"""
            WITH rang AS (
                SELECT a.produit_id, a.ca_ttc, a.taux_marge, a.taux_retour,
                       RANK() OVER (PARTITION BY i.categorie ORDER BY a.ca_ttc DESC) AS rang_categorie
                FROM app.v_produit_annee AS a
                JOIN app.v_produit_identite AS i ON i.produit_id = a.produit_id
                WHERE a.annee = {an}
            ), dem AS (
                SELECT produit_id, MAX(stock_depart) AS stock_depart
                FROM pbi.v_ml_scores_demande WHERE {DEMANDE_DERNIER} GROUP BY produit_id
            )
            SELECT i.fournisseur_id, i.produit_id AS id, i.nom_produit, i.categorie, r.ca_ttc, r.taux_marge,
                   r.taux_retour, r.rang_categorie, d.stock_depart
            FROM app.v_produit_identite AS i
            LEFT JOIN rang AS r ON r.produit_id = i.produit_id
            LEFT JOIN dem  AS d ON d.produit_id = i.produit_id
            ORDER BY i.fournisseur_id, r.ca_ttc DESC NULLS LAST, i.produit_id""", "table"),
        # donnees.fournisseur_demande
        "dem": (f"""SELECT i.fournisseur_id, d.produit_id, d.mois, d.quantite_prevue, d.stock_depart
                    FROM pbi.v_ml_scores_demande AS d
                    JOIN app.v_produit_identite AS i ON i.produit_id = d.produit_id
                    WHERE d.{DEMANDE_DERNIER} ORDER BY i.fournisseur_id, d.produit_id, d.mois""", "table"),
        # donnees.fournisseur_achats_mois
        "ach": ("""SELECT fournisseur_id, mois, montant_ht, delai_reel_moyen_j FROM app.v_fournisseur_achats_mois
                   ORDER BY fournisseur_id, mois""", "table"),
    }
    colonnes, paquets = bloc_fiches(con, blocs, "fournisseur_id", "SELECT fournisseur_id FROM app.v_fournisseur_fiche")
    fiches = {i: f for p in paquets.values() for i, f in p.items()}
    return {"annee_reference": an, "annees": table(annees), "colonnes": colonnes, "fournisseurs": fiches}


# ---------------------------------------------------------------------------
# Fiche Transporteur : 4 transporteurs, un seul fichier (data/transporteurs.json)
# ---------------------------------------------------------------------------
def _avis_transporteurs(con) -> pd.DataFrame:
    """donnees._avis_transporteurs : avis commentés par transporteur (1re livraison de la commande) et par année,
    dont ceux qui critiquent la livraison ; plus une ligne « ensemble » par année."""
    avis = lire(con, """SELECT a.avis_id, COALESCE(tr.nom_transporteur, 'inconnu') AS transporteur, YEAR(a.date_avis) AS annee
                        FROM ana.tm_avis AS a
                        LEFT JOIN (SELECT l.commande_id, t.nom_transporteur,
                                          ROW_NUMBER() OVER (PARTITION BY l.commande_id ORDER BY l.livraison_id) AS rang
                                   FROM TuniShop_DWH.bi.v_fact_livraisons AS l
                                   JOIN TuniShop_DWH.bi.v_dim_transporteur AS t ON t.transporteur_sk = l.transporteur_sk
                                  ) AS tr ON tr.commande_id = a.commande_id AND tr.rang = 1""")
    neg = set(lire(con, """SELECT DISTINCT avis_id FROM ana.tm_avis_themes
                           WHERE theme = 'Livraison' AND polarite = 'négatif'""")["avis_id"])
    avis["negatif_livraison"] = avis["avis_id"].isin(neg).astype(int)
    par_t = avis.groupby(["annee", "transporteur"], as_index=False).agg(
        nb_avis=("avis_id", "size"), nb_negatifs_livraison=("negatif_livraison", "sum"))
    tout = avis.groupby("annee", as_index=False).agg(nb_avis=("avis_id", "size"),
                                                    nb_negatifs_livraison=("negatif_livraison", "sum"))
    return pd.concat([par_t, tout.assign(transporteur="ensemble")], ignore_index=True)


def bloc_transporteurs(con) -> dict:
    """Référentiel, chiffres par transporteur et par année (donnees.transporteurs_annee), retard par semestre,
    retard par région et par année, colis en transit au dernier scoring."""
    ref = lire(con, """SELECT transporteur_id, nom_transporteur, couverture, cout_base_ht
                       FROM TuniShop_DWH.bi.v_dim_transporteur WHERE transporteur_sk > 0 AND est_supprime = 0""")
    av = _avis_transporteurs(con)
    annees = []
    for an in lire(con, "SELECT DISTINCT annee FROM app.v_livraison_detail ORDER BY annee")["annee"]:
        liv = lire(con, f"""
            WITH l AS (SELECT transporteur, est_livree, en_retard, retard_j, proba_retard
                       FROM app.v_livraison_detail WHERE annee = {int(an)})
            SELECT transporteur, SUM(CASE WHEN est_livree THEN 1 ELSE 0 END) AS colis_livres,
                   AVG(CASE WHEN est_livree THEN CAST(en_retard AS DOUBLE) END) AS taux_reel,
                   AVG(CASE WHEN est_livree THEN proba_retard END) AS taux_predit,
                   AVG(CAST(retard_j AS DOUBLE)) AS retard_moyen_j
            FROM l GROUP BY transporteur
            UNION ALL
            SELECT 'ensemble', SUM(CASE WHEN est_livree THEN 1 ELSE 0 END),
                   AVG(CASE WHEN est_livree THEN CAST(en_retard AS DOUBLE) END),
                   AVG(CASE WHEN est_livree THEN proba_retard END), AVG(CAST(retard_j AS DOUBLE))
            FROM l
            ORDER BY transporteur = 'ensemble', transporteur""")
        a = av[av["annee"] == an].drop(columns="annee")
        t = liv.merge(a, on="transporteur", how="left")
        t["part_avis_negatifs"] = t["nb_negatifs_livraison"] / t["nb_avis"].where(t["nb_avis"] > 0)
        annees.append(t.drop(columns="nb_negatifs_livraison").assign(annee=int(an)))
    sem = lire(con, """SELECT transporteur, annee, semestre, AVG(CAST(en_retard AS DOUBLE)) AS taux
                       FROM app.v_livraison_detail WHERE est_livree GROUP BY transporteur, annee, semestre
                       UNION ALL
                       SELECT 'ensemble', annee, semestre, AVG(CAST(en_retard AS DOUBLE))
                       FROM app.v_livraison_detail WHERE est_livree GROUP BY annee, semestre
                       ORDER BY transporteur, annee, semestre""")
    regions = lire(con, """SELECT transporteur, annee, region, COUNT(*) AS colis, AVG(CAST(en_retard AS DOUBLE)) AS taux
                           FROM app.v_livraison_detail WHERE est_livree AND region IS NOT NULL
                           GROUP BY transporteur, annee, region
                           ORDER BY transporteur, annee, taux DESC, region""")
    colis = lire(con, """SELECT s.transporteur, s.commande_id AS id, c.client_id, g.gouvernorat, s.region, s.date_expedition,
                                dp.date AS date_prevue, s.proba_retard, s.alerte_retard
                         FROM pbi.v_ml_scores_retard AS s
                         LEFT JOIN TuniShop_DWH.bi.v_fact_livraisons AS l  ON l.livraison_id = s.livraison_id
                         LEFT JOIN TuniShop_DWH.bi.v_dim_client      AS c  ON c.client_sk = l.client_sk
                         LEFT JOIN TuniShop_DWH.bi.v_dim_geographie  AS g  ON g.geographie_sk = l.geographie_sk
                         LEFT JOIN TuniShop_DWH.bi.v_dim_date        AS dp ON dp.date_sk = l.date_prevue_sk
                         WHERE s.date_scoring = (SELECT MAX(date_scoring) FROM pbi.v_ml_scores_retard)
                         ORDER BY s.transporteur, s.proba_retard DESC, s.commande_id""")
    return {"ref": table(ref), "annees": table(pd.concat(annees, ignore_index=True)), "semestres": table(sem),
            "regions": table(regions), "colis": table(colis)}


# ---------------------------------------------------------------------------
# Accueil (data/accueil.json)
# ---------------------------------------------------------------------------
def bloc_accueil(con, n: int = 8) -> dict:
    """Chiffres de l'année (donnees.vue_ensemble), listes « à traiter » (donnees.alertes_*) et CA prévu par catégorie
    (donnees.ventes_categories)."""
    dernier_churn = "(SELECT MAX(date_scoring) FROM pbi.v_ml_scores_churn)"
    an = int(lire(con, f"SELECT YEAR({dernier_churn}) AS a").iat[0, 0])
    n_churn = int(lire(con, f"""SELECT COUNT(*) AS n FROM pbi.v_ml_scores_churn
                                WHERE alerte_churn = 1 AND date_scoring = {dernier_churn}""").iat[0, 0])
    n_eleve = int(lire(con, f"""SELECT COUNT(*) AS n FROM pbi.v_ml_scores_churn
                                WHERE decile_risque <= 2 AND date_scoring = {dernier_churn}""").iat[0, 0])
    # OUTER APPLY (avant-dernier segment RFM du client) : rang 2 par date d'observation décroissante
    churn = lire(con, f"""
        SELECT s.client_id AS id, i.nom_complet AS client, i.type_client, i.ville, s.segment_rfm,
               prec.segment_rfm AS segment_precedent, k.derniere_commande, s.proba_churn, s.decile_risque,
               s.montant_reconnu_ttc, s.recence_j, i.action_recommandee, s.proba_churn * s.montant_reconnu_ttc AS ca_en_jeu
        FROM pbi.v_ml_scores_churn AS s
        JOIN app.v_client_identite AS i ON i.client_id = s.client_id
        LEFT JOIN app.v_client_kpi AS k ON k.client_id = s.client_id
        LEFT JOIN (SELECT client_id, segment_rfm,
                          ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY date_observation DESC) AS rang
                   FROM app.v_client_rfm) AS prec ON prec.client_id = s.client_id AND prec.rang = 2
        WHERE s.decile_risque <= 2 AND s.date_scoring = {dernier_churn}
        ORDER BY s.proba_churn * s.montant_reconnu_ttc DESC, s.client_id LIMIT {n}""")
    base = """SELECT produit_id, MAX(nom_produit) AS produit, MAX(categorie) AS categorie,
                     MIN(CASE WHEN rupture_sans_reappro = 1 THEN mois END) AS mois_rupture,
                     MAX(stock_depart) AS stock_depart,
                     SUM(CASE WHEN MONTH(mois) <= 3 THEN quantite_prevue ELSE 0 END) AS demande_t1
              FROM pbi.v_ml_scores_demande
              GROUP BY produit_id
              HAVING MONTH(MIN(CASE WHEN rupture_sans_reappro = 1 THEN mois END)) <= 3"""
    n_rupt = int(lire(con, f"SELECT COUNT(*) AS n FROM ({base}) AS r").iat[0, 0])
    rupt = lire(con, f"""SELECT r.produit_id AS id, r.produit, r.categorie, r.mois_rupture, r.stock_depart,
                                r.demande_t1, i.fournisseur_id, i.nom_fournisseur
                         FROM ({base}) AS r LEFT JOIN app.v_produit_identite AS i ON i.produit_id = r.produit_id
                         ORDER BY r.mois_rupture, r.demande_t1 DESC, r.produit_id LIMIT {n}""")
    filtre = f"FROM app.v_fournisseur_fiche WHERE ecart_fiabilite < {SEUIL_ECART_FIABILITE}"
    n_four = int(lire(con, f"SELECT COUNT(*) AS n {filtre}").iat[0, 0])
    four = lire(con, f"""SELECT fournisseur_id AS id, nom_fournisseur AS fournisseur, pays, fiabilite_annoncee,
                                fiabilite_reelle, ecart_fiabilite, delai_annonce_j, delai_reel_moyen_j, tolerance_retard_j
                         {filtre} ORDER BY ecart_fiabilite, fournisseur_id LIMIT {n}""")
    filtre = """FROM pbi.v_ml_scores_retard WHERE alerte_retard = 1
                AND date_scoring = (SELECT MAX(date_scoring) FROM pbi.v_ml_scores_retard)"""
    n_colis = int(lire(con, f"SELECT COUNT(*) AS n {filtre}").iat[0, 0])
    colis = lire(con, f"""SELECT commande_id AS id, livraison_id, transporteur, region, date_expedition, proba_retard
                          {filtre} ORDER BY proba_retard DESC, commande_id LIMIT {n}""")
    reel = lire(con, f"SELECT categorie, SUM(ca_reel_ttc) AS reel FROM pbi.v_ml_ventes WHERE YEAR(mois) = {an} GROUP BY categorie")
    prev = lire(con, "SELECT categorie, SUM(prevision_ca_ttc) AS prevu FROM ana.ml_pred_ventes_2026 GROUP BY categorie")
    ventes = reel.merge(prev, on="categorie", how="outer").sort_values(["prevu", "categorie"], ascending=[False, True])
    return {"vue_ensemble": table(lire(con, "SELECT * FROM pbi.v_eda_vue_ensemble ORDER BY annee")),
            "n_churn": n_churn, "n_eleve": n_eleve, "churn": table(churn), "n_rupt": n_rupt, "rupt": table(rupt),
            "n_four": n_four, "four": table(four), "n_colis": n_colis, "colis": table(colis), "ventes": table(ventes)}


# ---------------------------------------------------------------------------
# Voix du client (data/voix.json) : chaque combinaison des filtres catégorie x année est calculée d'avance
# ---------------------------------------------------------------------------
def bloc_voix(con) -> dict:
    """donnees.tm_resume, tm_themes, tm_langues et tm_expressions_derja pour chaque filtre, plus tm_verification.
    À égalité de nombre, l'ordre alphabétique départage (thème, langue, expression)."""
    an_ref = int(lire(con, "SELECT YEAR(MAX(date_scoring)) AS a FROM pbi.v_ml_scores_churn").iat[0, 0])
    categories = lire(con, "SELECT DISTINCT categorie FROM pbi.v_tm_avis WHERE categorie IS NOT NULL ORDER BY categorie")["categorie"].tolist()
    annees = [an_ref, an_ref - 1, an_ref - 2]

    def filtres(cat, an, alias="a"):
        c = []
        if cat:
            c.append(f"{alias}.categorie = $c")
        if an:
            c.append(f"YEAR({alias}.date_avis) = {int(an)}")
        return (" WHERE " + " AND ".join(c)) if c else ""

    combos = {}
    for cat in [None] + categories:
        for an in [None] + annees:
            prm = {"c": cat} if cat else {}
            w = filtres(cat, an)
            com = lire(con, f"""SELECT COUNT(*) AS nb_commentes,
                                       SUM(CASE WHEN a.langue = 'derja' THEN 1 ELSE 0 END) AS nb_derja,
                                       COUNT(DISTINCT a.texte_nettoye) AS nb_formulations,
                                       SUM(CASE WHEN a.coherence LIKE 'texte %' THEN 1 ELSE 0 END) AS nb_incoherents
                                FROM pbi.v_tm_avis AS a{w}""", **prm).iloc[0]
            c2 = (["p.categorie = $c"] if cat else []) + ([f"d.annee = {int(an)}"] if an else [])
            w2 = (" WHERE " + " AND ".join(c2)) if c2 else ""
            nb_avis = lire(con, f"""SELECT COUNT(*) AS nb_avis
                                    FROM TuniShop_DWH.bi.v_fact_avis AS f
                                    JOIN TuniShop_DWH.bi.v_dim_produit AS p ON p.produit_sk = f.produit_sk
                                    JOIN TuniShop_DWH.bi.v_dim_date AS d ON d.date_sk = f.date_avis_sk{w2}""", **prm).iat[0, 0]
            themes = lire(con, f"""SELECT t.theme, COUNT(*) AS mentions,
                                          SUM(CASE WHEN t.polarite = 'négatif' THEN 1 ELSE 0 END) AS negatives
                                   FROM pbi.v_tm_avis_themes AS t{filtres(cat, an, "t")}
                                   GROUP BY t.theme ORDER BY COUNT(*) DESC, t.theme""", **prm)
            langues = lire(con, f"""SELECT a.langue, COUNT(*) AS avis FROM pbi.v_tm_avis AS a{w}
                                    GROUP BY a.langue ORDER BY COUNT(*) DESC, a.langue""", **prm)
            wd = (w + " AND " if w else " WHERE ") + "a.langue = 'derja'"
            ex = lire(con, f"""SELECT a.texte_nettoye AS expression, MAX(a.texte_fr) AS sens,
                                      MAX(a.polarite_globale) AS polarite, COUNT(*) AS avis
                               FROM pbi.v_tm_avis AS a{wd}
                               GROUP BY a.texte_nettoye ORDER BY COUNT(*) DESC, a.texte_nettoye LIMIT 5""", **prm)
            res = {"nb_avis": valeur(nb_avis), **{k: valeur(com[k]) for k in com.index}}
            combos[f"{cat or ''}|{an or ''}"] = {"res": res, "themes": table(themes), "langues": table(langues),
                                                 "ex": table(ex)}
    verif = lire(con, """SELECT theme, polarite, avis, part_colis_en_retard, part_retour, motifs_lies, part_retour_motif_lie
                         FROM pbi.v_tm_verification_faits ORDER BY avis DESC, theme, polarite""")
    return {"categories": categories, "annees": annees, "filtres": combos, "verif": table(verif)}


# ---------------------------------------------------------------------------
# Modèles (data/modeles.json) et Vérification (data/manifeste.json, écrit à la fin)
# ---------------------------------------------------------------------------
def bloc_modeles(con) -> dict:
    """donnees.ml_modeles, ml_registre, ml_suivi, ml_suivi_historique et importance_churn(8)."""
    return {
        "modeles": table(lire(con, "SELECT cas, modele, role, mesure, sens, valeur_validation, valeur_test, "
                                   "gain_vs_reference, retenu FROM pbi.v_ml_modeles")),
        "registre": table(lire(con, """SELECT nom, cas, role, version, appris_le, periode_apprentissage, lignes_apprentissage,
                                              nb_variables, seuil, source, notes
                                       FROM pbi.v_ml_registre ORDER BY cas, appris_le DESC, nom""")),
        "suivi": table(lire(con, "SELECT cas, objet, periode, indicateur, valeur, seuil, statut FROM pbi.v_ml_suivi")),
        "historique": table(lire(con, """SELECT CAST(date_donnees AS VARCHAR) AS date_donnees, cas, COUNT(*) AS indicateurs,
                                                CAST(SUM(CASE WHEN statut = 'ALERTE' THEN 1 ELSE 0 END) AS INTEGER) AS alertes
                                         FROM pbi.v_ml_suivi_historique
                                         GROUP BY date_donnees, cas ORDER BY date_donnees, cas""")),
        "importance": table(lire(con, "SELECT cle AS variable, perte_AUC AS perte_auc FROM ana.ml03_importance "
                                      "ORDER BY perte_AUC DESC LIMIT 8")),
    }


def bloc_importance(con) -> dict:
    """donnees.importance_churn(5) : variables qui pèsent le plus dans le modèle de churn."""
    return table(lire(con, "SELECT cle AS variable, perte_AUC AS perte_auc FROM ana.ml03_importance "
                           "ORDER BY perte_AUC DESC LIMIT 5"))


# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description="Export JSON du site TuniShop vue 360")
    parser.add_argument("--source", required=True, type=Path, help="dossier demo_data/ de la plateforme Streamlit")
    args = parser.parse_args()
    source = args.source.resolve()
    manifeste = json.loads((source / "manifeste.json").read_text(encoding="utf-8"))

    t0 = time.perf_counter()
    con = connexion(source)
    if SORTIE.exists():
        shutil.rmtree(SORTIE)
    tailles: dict[str, int] = {}

    glob = bloc_global(con, manifeste)
    glob["importance_churn"] = bloc_importance(con)
    tailles["global.json"] = ecrire(SORTIE / "global.json", glob)
    tailles["recherche.json"] = ecrire(SORTIE / "recherche.json", bloc_recherche(con))

    colonnes, paquets = bloc_clients(con)
    tailles["clients/*.json (100 paquets)"] = sum(
        ecrire(SORTIE / "clients" / f"{p}.json", {"colonnes": colonnes, "clients": fiches})
        for p, fiches in sorted(paquets.items()))

    glob["retard"] = bloc_retard(con)
    glob["regles"] = bloc_regles(con)
    tailles["fournisseurs.json"] = ecrire(SORTIE / "fournisseurs.json", bloc_fournisseurs(con))
    tailles["transporteurs.json"] = ecrire(SORTIE / "transporteurs.json", bloc_transporteurs(con))
    tailles["accueil.json"] = ecrire(SORTIE / "accueil.json", bloc_accueil(con))
    tailles["voix.json"] = ecrire(SORTIE / "voix.json", bloc_voix(con))
    tailles["modeles.json"] = ecrire(SORTIE / "modeles.json", bloc_modeles(con))
    colonnes, paquets = bloc_produits(con)
    tailles["produits/*.json (100 paquets)"] = sum(
        ecrire(SORTIE / "produits" / f"{p}.json", {"colonnes": colonnes, "produits": fiches})
        for p, fiches in sorted(paquets.items()))
    tailles["global.json"] = ecrire(SORTIE / "global.json", glob)
    colonnes, paquets = bloc_commandes(con)
    tailles["commandes/*.json (100 paquets)"] = sum(
        ecrire(SORTIE / "commandes" / f"{p}.json", {"colonnes": colonnes, "commandes": fiches})
        for p, fiches in sorted(paquets.items()))

    # Manifeste lu par la page Vérification : provenance, fichiers produits et leur taille
    fichiers = {str(f.relative_to(SORTIE)).replace("\\", "/"): f.stat().st_size
                for f in sorted(SORTIE.rglob("*.json"))}
    ecrire(SORTIE / "manifeste.json", {
        "date_export_source": manifeste.get("date_export"),
        "serveur_source": manifeste.get("serveur"),
        "objets_source": manifeste.get("objets", {}),
        "date_export_web": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "nb_paquets": NB_PAQUETS,
        "fichiers": tailles,
        "detail": fichiers,
    })
    total = sum(tailles.values())
    for nom, t in tailles.items():
        print(f"  {nom:<30} {t / 1e6:7.2f} Mo")
    print(f"Terminé en {time.perf_counter() - t0:.1f} s : {total / 1e6:.1f} Mo.")


if __name__ == "__main__":
    main()
