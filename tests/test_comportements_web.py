"""
TuniShop - Plateforme vue 360 (version HTML)
tests/test_comportements_web.py : cas de recette qui demandent un navigateur (saisies, redirections, liens entre
fiches, filtres, retour arrière, messages des cas vides, affichage sur téléphone).
Écrit tests/resultats_comportements_web.json (cas, attendu, obtenu, statut).

Prérequis : le site lancé (python scripts/serveur_local.py) et Playwright.
Lancer : python tests/test_comportements_web.py [adresse du site]
Auteure : Sarra Abdeljaouad
"""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

SITE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8600/"
resultats = []


def noter(cas, attendu, obtenu, ok):
    resultats.append({"cas": cas, "attendu": attendu, "obtenu": obtenu, "statut": "OK" if ok else "KO"})
    print(f"{'OK' if ok else 'KO'}  {cas:<5} {obtenu}")


async def main():
    async with async_playwright() as p:
        nav = await p.chromium.launch()
        pg = await nav.new_page(viewport={"width": 1440, "height": 900})
        erreurs = []
        pg.on("pageerror", lambda e: erreurs.append(str(e)))

        async def aller(adresse, attente=1200):
            await pg.goto(SITE + adresse)
            await pg.wait_for_timeout(attente)
            return pg.url.replace(SITE, "")

        async def texte(sel="#page"):
            return await pg.locator(sel).inner_text()

        # Recherche
        await aller("recherche.html?q=riadh%20belhaj")
        marques = await pg.locator(".ts-resultat mark").count()
        premier = await pg.locator(".ts-resultat .x b").first.inner_text()
        noter("R01", "Riadh Belhadj trouvé et surligné", f"1er résultat « {premier} », {marques} mots surlignés",
              "Belhadj" in premier and marques > 0)
        await aller("recherche.html?q=nexra")
        t1 = await texte()
        await aller("recherche.html?q=carthgo")
        t2 = await texte()
        noter("R02", "Produits Nexora et Carthago trouvés", f"Nexora : {'Nexora' in t1}, Carthago : {'Carthago' in t2}",
              "Nexora" in t1 and "Carthago" in t2)
        vides = []
        for q in ["xqwz", "pomme banane"]:
            await aller(f"recherche.html?q={q}")
            vides.append(await pg.locator(".ts-resultat").count())
        noter("R03", "Aucun résultat, message d'aide", f"résultats : {vides}", vides == [0, 0])
        ouverts = {}
        for q in ["CLI004074", "PRD0094", "FRN002", "TS-03-00094"]:
            ouverts[q] = (await aller(f"recherche.html?q={q}")).split("?")[0]
        noter("R04", "La fiche s'ouvre directement", ", ".join(f"{k} → {v}" for k, v in ouverts.items()),
              list(ouverts.values()) == ["client.html", "produit.html", "fournisseur.html", "produit.html"])
        u = await aller("recherche.html?q=cmd0000033")
        noter("R05", "La fiche Commande s'ouvre", u, u == "commande.html?id=CMD0000033")
        await aller("recherche.html?q=nexra%20evasion")
        sous = await texte(".ts-sous-titre")
        noter("R06", "« nexora evasion » proposé", sous.split("·")[-1].strip(), "nexora evasion" in sous)

        # Accueil
        await aller("index.html")
        await pg.fill("#form-accueil input", "riadh belhaj")
        await pg.press("#form-accueil input", "Enter")
        await pg.wait_for_timeout(1200)
        u = pg.url.replace(SITE, "")
        noter("A04", "Ouverture de la page Recherche", u, u.startswith("recherche.html?q=riadh"))
        await aller("index.html")
        onglets = [x.replace("\n", " ") for x in await pg.locator(".ts-onglet").all_inner_texts()]
        noter("A02", "4 onglets avec leur nombre", " · ".join(onglets), len(onglets) == 4)
        await pg.locator(".ts-onglet").nth(2).click()
        t = await pg.locator(".ts-panneau:not([hidden])").inner_text()
        noter("A05", "Action « Planifier avec … j au lieu de … j »", "présente" if "Planifier avec" in t else "absente",
              "Planifier avec" in t)
        etat = await texte("#etat-chaine")
        noter("M01", "« Chaîne OK », date des données, période comparée", etat.replace("\n", " · ")[:90],
              "Chaîne OK" in etat and "31/12/2025" in etat and "2025 face à 2024" in etat)

        # Cas vides et identifiants inconnus
        messages = {}
        for adr in ["client.html", "client.html?id=CLI999999", "produit.html?id=PRD9999", "fournisseur.html?id=FRN999",
                    "commande.html?id=CMD9999999", "transporteur.html?id=Inconnu%20Express"]:
            await aller(adr)
            m = await pg.locator(".ts-message").first.inner_text() if await pg.locator(".ts-message").count() else ""
            lien = await pg.locator(".ts-lien-page").count()
            messages[adr] = (m, lien)
        ok = all(m for m, _ in messages.values()) and all(l for a, (m, l) in messages.items() if "transporteur" not in a)
        noter("C03", "Message clair et lien vers la recherche", f"{len(messages)} adresses testées, message affiché partout", ok)
        noter("T03", "Message d'erreur clair", messages["transporteur.html?id=Inconnu%20Express"][0],
              "Aucun transporteur" in messages["transporteur.html?id=Inconnu%20Express"][0])

        # Liens entre fiches
        parcours = []
        await aller("client.html?id=CLI004761")
        await pg.locator("#page .ts-table a[href^='commande.html']").first.click(); await pg.wait_for_timeout(1000)
        parcours.append(pg.url.replace(SITE, ""))
        await pg.locator("#page .ts-table a[href^='produit.html']").first.click(); await pg.wait_for_timeout(1000)
        parcours.append(pg.url.replace(SITE, ""))
        await pg.locator(".ts-liens a[href^='fournisseur.html']").first.click(); await pg.wait_for_timeout(1000)
        parcours.append(pg.url.replace(SITE, ""))
        await aller("commande.html?id=CMD0065619")
        await pg.locator(".ts-liens a[href^='transporteur.html']").first.click(); await pg.wait_for_timeout(1000)
        parcours.append(pg.url.replace(SITE, ""))
        noter("N01", "Client → commande → produit → fournisseur ; commande → transporteur", " → ".join(parcours),
              [x.split(".html")[0] for x in parcours] == ["commande", "produit", "fournisseur", "transporteur"])

        # Adresse partageable et retour arrière
        await aller("recherche.html")
        await pg.fill("#form-recherche input", "nexra"); await pg.press("#form-recherche input", "Enter")
        await pg.wait_for_timeout(1000)
        apres = pg.url.replace(SITE, "")
        await pg.go_back(); await pg.wait_for_timeout(800)
        titre = await texte(".ts-titre")
        noter("N02", "L'adresse suit la saisie ; le retour arrière revient à la page précédente", f"{apres} puis « {titre} »",
              apres == "recherche.html?q=nexra" and titre == "Recherche")

        # Filtres de la recherche et de Voix du client
        await aller("recherche.html?q=sahel")
        avant = await pg.locator(".ts-resultat").count()
        await pg.locator(".ts-onglet").nth(1).click(); await pg.wait_for_timeout(200)
        apres_f = await pg.locator(".ts-resultat").count()
        noter("R07", "Le filtre par type réduit la liste", f"{avant} résultats, puis {apres_f} produits", apres_f < avant)
        await aller("voix-du-client.html")
        avant = await texte(".ts-kpis")
        await pg.select_option("#f-categorie", "Mode"); await pg.select_option("#f-periode", "2024")
        await pg.wait_for_timeout(300)
        apres_v = await texte(".ts-kpis")
        noter("V02", "Les filtres recalculent les chiffres", f"avis : {avant.split(chr(10))[1]} → {apres_v.split(chr(10))[1]}",
              avant != apres_v)

        # Vérification
        await aller("verification.html", 5000)
        t = await texte()
        noter("W01", "Tous les fichiers de données présents, index chargé",
              " ; ".join(l for l in t.split("\n") if "présents" in l or "indexées" in l), "307 fichiers sur 307" in t and "16 636" in t)

        # Téléphone
        await pg.set_viewport_size({"width": 390, "height": 844})
        await aller("client.html?id=CLI004761", 2000)
        largeur = await pg.evaluate("document.documentElement.scrollWidth")
        noter("N03", "Sur téléphone (390 px), pas de défilement horizontal de la page", f"largeur de page {largeur} px", largeur <= 390)

        noter("X04", "Aucune erreur JavaScript pendant les cas", f"{len(erreurs)} erreur(s)", not erreurs)
        await nav.close()

    sortie = Path(__file__).with_name("resultats_comportements_web.json")
    sortie.write_text(json.dumps(resultats, ensure_ascii=False, indent=1), encoding="utf-8")
    ok = sum(r["statut"] == "OK" for r in resultats)
    print(f"{ok}/{len(resultats)} cas OK · {sortie}")
    sys.exit(0 if ok == len(resultats) else 1)

asyncio.run(main())
