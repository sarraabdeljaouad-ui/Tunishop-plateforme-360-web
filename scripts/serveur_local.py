"""
TuniShop - Plateforme vue 360 (version HTML)
scripts/serveur_local.py : petit serveur pour voir le site en local.

Pourquoi pas simplement « python -m http.server » ? Sous Windows, ce serveur lit le type des fichiers dans
le registre, qui annonce souvent les .js comme « text/plain ». Le navigateur refuse alors de charger les
modules JavaScript et les pages restent blanches. Ce script impose les bons types.

Lancer (depuis le dossier du projet) :
    python scripts/serveur_local.py
puis ouvrir http://localhost:8600/recherche.html (Ctrl + C pour arrêter).

Auteure : Sarra Abdeljaouad
"""
import functools
import http.server
import sys
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8600
SITE = Path(__file__).resolve().parents[1] / "site"


class Gestionnaire(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
        ".css": "text/css", ".svg": "image/svg+xml", ".html": "text/html", ".woff2": "font/woff2",
    }


if __name__ == "__main__":
    serveur = http.server.ThreadingHTTPServer(("localhost", PORT), functools.partial(Gestionnaire, directory=str(SITE)))
    print(f"Site TuniShop : http://localhost:{PORT}/recherche.html  (Ctrl + C pour arrêter)")
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        print("\nServeur arrêté.")
