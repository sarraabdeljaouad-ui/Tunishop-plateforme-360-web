/*
 * TuniShop - Plateforme vue 360 (version HTML)
 * Page Vérification : diagnostic du site, équivalent de pages/verification.py pour la version HTML.
 * Streamlit y contrôle Python, le pilote ODBC et les bases ; ici on contrôle le navigateur, la présence
 * de chaque fichier de données exporté et l'index de recherche. Utile après une publication ou un nouvel export.
 *
 * Adresse : verification.html
 * Auteure : Sarra Abdeljaouad
 */
import { demarrer } from "../app.js";
import { charger } from "../donnees.js";
import { nombre } from "../format.js";
import { construireIndex } from "../recherche.js";
import * as ui from "../ui.js";

const sousTitre = (t) => `<h3 style="margin:.6rem 0 0">${ui.e(t)}</h3>`;
const succes = (t) => `<p class="ts-message succes">${ui.e(t)}</p>`;
const taille = (o) => (o >= 1e6 ? `${nombre(o / 1e6, 2)} Mo` : `${nombre(o / 1e3, 1)} ko`);

/** Vérifie qu'un fichier répond (requête HEAD : rien n'est téléchargé). */
async function present(chemin) {
  try {
    const r = await fetch(`data/${chemin}`, { method: "HEAD", cache: "no-store" });
    return r.ok;
  } catch { return false; }
}

async function afficher(zone) {
  const h = [`<div><div class="ts-fil">Accueil › Vérification</div><h1 class="ts-titre">Vérification de l'environnement</h1></div>`];

  // 1. Navigateur et site
  h.push(sousTitre("1. Navigateur et site"));
  let stockage = "disponible";
  try { sessionStorage.setItem("ts-test", "1"); sessionStorage.removeItem("ts-test"); } catch { stockage = "indisponible (recherches récentes non gardées)"; }
  const nav = navigator.userAgentData?.brands?.filter((b) => !/not.?a.?brand/i.test(b.brand)).map((b) => `${b.brand} ${b.version}`).join(", ")
    || navigator.userAgent;
  h.push(ui.tableau([["Élément", ""], ["Valeur", ""]], [
    ["Version du site", ui.e(ui.VERSION)], ["Navigateur", ui.e(nav)], ["Modules JavaScript", "chargés"],
    ["Stockage de l'onglet", ui.e(stockage)], ["Adresse", ui.e(location.origin + location.pathname.replace(/[^/]*$/, ""))]]));

  // 2. Données exportées
  h.push(sousTitre("2. Données"));
  const m = await charger("manifeste.json");
  h.push(ui.info(`Données lues dans des fichiers JSON exportés le ${m.date_export_web}, à partir de l'export Parquet du `
    + `${m.date_export_source || "—"} (serveur ${m.serveur_source || "—"}).`));
  h.push('<div id="verif-fichiers" class="ts-pile"><p class="ts-chargement">Contrôle des fichiers…</p></div>');

  // 3. Index de recherche
  h.push(sousTitre("3. Index de recherche"));
  h.push('<div id="verif-index" class="ts-pile"><p class="ts-chargement">Chargement de l\'index…</p></div>');
  zone.innerHTML = h.join("");

  // Fichiers : présence de chacun, regroupés par dossier
  const fichiers = Object.entries(m.detail || {});
  const etats = await Promise.all(fichiers.map(async ([f, o]) => ({ f, o, ok: await present(f) })));
  const groupes = new Map();
  for (const x of etats) {
    const g = x.f.includes("/") ? `${x.f.split("/")[0]}/` : x.f;
    const v = groupes.get(g) || { n: 0, ok: 0, o: 0 };
    v.n += 1; v.ok += x.ok ? 1 : 0; v.o += x.o;
    groupes.set(g, v);
  }
  const manquants = etats.filter((x) => !x.ok);
  const objets = Object.entries(m.objets_source || {});
  document.getElementById("verif-fichiers").innerHTML =
    (manquants.length ? ui.erreur(`${etats.length - manquants.length} fichiers sur ${etats.length} présents`)
      : succes(`${etats.length} fichiers sur ${etats.length} présents`))
    + ui.tableau([["Fichier ou dossier", ""], ["Fichiers", "num"], ["Présents", "num"], ["Taille", "num"]],
      [...groupes.entries()].map(([g, v]) => [ui.e(g), nombre(v.n), nombre(v.ok), taille(v.o)]))
    + (manquants.length ? ui.legende(`Manquants : ${manquants.slice(0, 10).map((x) => x.f).join(", ")}`
      + (manquants.length > 10 ? "…" : "")) : "")
    + (objets.length ? ui.volet(`Vues et tables de la source (${objets.length})`,
      ui.tableau([["Objet", ""], ["Lignes", "num"]], objets.map(([o, n]) => [ui.e(o), nombre(n)]))) : "");

  // Index : entités par type
  try {
    const index = construireIndex((await charger("recherche.json")).index);
    const parType = new Map();
    for (const e of index) parType.set(e.type, (parType.get(e.type) || 0) + 1);
    document.getElementById("verif-index").innerHTML = succes(`${nombre(index.length)} entités indexées`)
      + ui.tableau([["Type", ""], ["Entités", "num"]], [...parType.entries()].sort().map(([t, n]) => [ui.e(t), nombre(n)]));
  } catch (err) {
    document.getElementById("verif-index").innerHTML = ui.erreur(`Index indisponible : ${err.message}`);
  }
}

demarrer("verification", afficher);
