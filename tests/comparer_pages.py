"""
TuniShop - Plateforme vue 360 (version HTML)
tests/comparer_pages.py : compare, ligne à ligne, le texte affiché par une fiche Streamlit et par la même fiche
de la version HTML (volets ouverts, graphiques exclus). Sert de contrôle de recette : 0 différence attendue.

Prérequis : Streamlit lancé en mode démo sur le port 8501, le site lancé sur le port 8600
(python scripts/serveur_local.py), et Playwright (pip install playwright ; playwright install chromium).

Exemple : python tests/comparer_pages.py client client CLI004761 CLI000001 CLI004074
Auteure : Sarra Abdeljaouad
"""
import sys, asyncio, difflib, re
from playwright.async_api import async_playwright
JS_ST = r"""()=>{const m=document.querySelector('[data-testid="stMain"]').cloneNode(true);
 m.querySelectorAll('.js-plotly-plot,[data-testid="stPlotlyChart"],[data-testid="stHeader"],svg').forEach(e=>e.remove());
 document.body.appendChild(m); const t=m.innerText; m.remove(); return t;}"""
JS_WEB = r"""()=>{const m=document.querySelector('#page').cloneNode(true);
 m.querySelectorAll('.ts-graphique,svg').forEach(e=>e.remove());
 document.body.appendChild(m); const t=m.innerText; m.remove(); return t;}"""
def norm(t):
    lignes=[re.sub(r"\s+"," ",l).strip() for l in t.replace(" "," ").split("\n")]
    return [l for l in lignes if l and l not in ("keyboard_arrow_right","keyboard_arrow_down","search")]
async def main(page_st, page_web, ids):
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1920, "height": 1200})
        total=0
        for i in ids:
            await pg.goto(f"http://localhost:8501/{page_st}?id={i}"); await pg.wait_for_timeout(7000)
            ex=pg.locator('[data-testid="stExpander"] summary')
            for k in range(await ex.count()): await ex.nth(k).click(); await pg.wait_for_timeout(800)
            a=norm(await pg.evaluate(JS_ST))
            await pg.goto(f"http://localhost:8600/{page_web}.html?id={i}"); await pg.wait_for_timeout(1500)
            vo=pg.locator('details.ts-volet summary')
            for k in range(await vo.count()): await vo.nth(k).click()
            w=norm(await pg.evaluate(JS_WEB))
            d=[l for l in difflib.unified_diff(a,w,"streamlit","html",lineterm="",n=0) if not l.startswith(("---","+++","@@"))]
            # la durée de recherche et les temps ne sont pas comparables
            total+=len(d)
            print(f"{i}: {len(a)} lignes, {len(d)} différence(s)")
            for l in d[:30]: print("   ", l)
        await b.close()
        print("TOTAL différences :", total)
asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3:]))
