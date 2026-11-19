"""
TuniShop - Plateforme vue 360 (version HTML)
tests/test_fumee_web.py : ouvre chaque page du site sur les 17 cas du test de fumée Streamlit
(tests/test_fumee.py de la plateforme Streamlit) et vérifie qu'elle s'affiche sans erreur.
Écrit tests/rapport_fumee_web.csv (date, page, cas, identifiant, durée, statut, détail).

Prérequis : le site lancé (python scripts/serveur_local.py) et Playwright
(pip install playwright ; playwright install chromium).
Lancer : python tests/test_fumee_web.py [adresse du site, par défaut http://localhost:8600/]
Auteure : Sarra Abdeljaouad
"""
import asyncio, csv, sys, time
from datetime import datetime
from pathlib import Path
from playwright.async_api import async_playwright


async def lancer(p):
    """Chromium de Playwright s'il est installé, sinon le Chrome du poste."""
    try:
        return await p.chromium.launch()
    except Exception:
        return await p.chromium.launch(channel="chrome")

SITE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8600/"
CAS = [  # page, cas, identifiant, texte attendu
    ("index.html", "accueil", "", "Bonjour, que cherches-tu ?"),
    ("client.html", "client à risque", "CLI004761", "Risque de départ élevé"),
    ("client.html", "client sans score", "CLI000001", "Pas de score récent"),
    ("produit.html", "produit en rupture", "PRD0067", "rupture vers le"),
    ("produit.html", "meilleur produit 2025", "PRD0094", "Unités vendues"),
    ("fournisseur.html", "fournisseur en alerte", "FRN035", "Le score en détail"),
    ("commande.html", "colis en transit", "CMD0066011", "Risque de retard prédit"),
    ("commande.html", "retard et retour", "CMD0065619", "jours de retard"),
    ("commande.html", "commande annulée", "CMD0066248", "annulée"),
    ("transporteur.html", "transporteur le plus en retard", "SahelLog", "Le plus en retard"),
    ("voix-du-client.html", "toutes catégories", "", "Le texte suit-il les faits ?"),
    ("modeles.html", "registre et suivi", "", "Registre des versions"),
    ("verification.html", "vérification", "", "fichiers sur"),
    ("recherche.html", "recherche « nexra »", "nexra", "Nexora"),
    ("recherche.html", "recherche « carthgo »", "carthgo", "Carthago"),
    ("recherche.html", "recherche « riadh belhaj »", "riadh belhaj", "Belhadj"),
    ("voix-du-client.html", "filtres catégorie et 2025", "Mode|2025", "À RETENIR"),
]


async def main():
    lignes, ok = [], 0
    async with async_playwright() as p:
        nav = await lancer(p)
        for page, cas, ident, attendu in CAS:
            pg = await nav.new_page(viewport={"width": 1440, "height": 900})
            erreurs = []
            pg.on("pageerror", lambda e: erreurs.append(str(e)))
            pg.on("console", lambda m: erreurs.append(m.text) if m.type == "error" else None)
            param = "" if not ident or page == "voix-du-client.html" else \
                ("?q=" if page == "recherche.html" else "?id=") + ident
            t0 = time.perf_counter()
            await pg.goto(SITE + page + param)
            if page == "voix-du-client.html" and ident:
                cat, an = ident.split("|")
                await pg.wait_for_selector("#f-categorie")
                await pg.select_option("#f-categorie", cat)
                await pg.select_option("#f-periode", an)
            try:
                await pg.wait_for_function("t => document.querySelector('#page')?.innerText.includes(t)",
                                           arg=attendu, timeout=15000)
                statut = "OK" if not erreurs else "KO"
            except Exception:
                statut, erreurs = "KO", erreurs + [f"texte attendu absent : {attendu}"]
            duree = round(time.perf_counter() - t0, 2)
            ok += statut == "OK"
            lignes.append([datetime.now().strftime("%d/%m/%Y %H:%M"), page, cas, ident, duree, statut, " | ".join(erreurs)])
            print(f"{statut}  {page:<20} {cas:<34} {duree:5.2f} s  {' | '.join(erreurs)}")
            await pg.close()
        await nav.close()
    sortie = Path(__file__).with_name("rapport_fumee_web.csv")
    with sortie.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["date", "page", "cas", "identifiant", "duree_s", "statut", "detail"])
        w.writerows(lignes)
    print(f"{ok}/{len(CAS)} cas OK · rapport : {sortie}")
    sys.exit(0 if ok == len(CAS) else 1)

asyncio.run(main())
