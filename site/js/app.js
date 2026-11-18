/*
 * TuniShop - Plateforme vue 360 (version HTML)
 * app.js : cadre commun à toutes les pages (équivalent de app.py), mis en page avec la charte :
 * menu latéral (titre, recherche, navigation, état de la chaîne en pied), puis la page demandée.
 *
 * Chaque page HTML appelle demarrer(nomDeLaPage, fonctionDAffichage).
 * Auteure : Sarra Abdeljaouad
 */
import { fraicheur } from "./donnees.js";
import { adresse, badge, e, VERSION } from "./ui.js";

const PAGES = {
  Navigation: [["index", "Accueil", "⌂"], ["recherche", "Recherche", "🔍"]],
  Fiches: [["client", "Client", "👤"], ["produit", "Produit", "▣"], ["fournisseur", "Fournisseur", "🚚"],
    ["commande", "Commande", "🧾"], ["transporteur", "Transporteur", "📦"]],
  Analyses: [["voix-du-client", "Voix du client", "💬"], ["modeles", "Modèles", "📈"]],
  Outils: [["verification", "Vérification", "☑"]],
};

function menu(pageActive) {
  const nav = Object.entries(PAGES).map(([groupe, liens]) =>
    `<div class="ts-menu-groupe">${e(groupe)}</div>` + liens.map(([page, titre, icone]) =>
      `<a class="ts-menu-lien${page === pageActive ? " actif" : ""}" href="${page}.html"${page === pageActive ? ' aria-current="page"' : ""}>`
      + `<span class="ic" aria-hidden="true">${icone}</span>${e(titre)}</a>`).join("")).join("");
  return `
    <a class="ts-menu-titre" href="index.html"><img src="assets/icone_tunishop.svg" alt="">TuniShop · Vue 360</a>
    <form id="recherche-laterale" role="search">
      <input class="ts-champ" name="q" placeholder="Rechercher…" aria-label="Rechercher" autocomplete="off">
    </form>
    <nav aria-label="Pages">${nav}</nav>
    <div class="ts-menu-pied" id="etat-chaine"></div>`;
}

async function etatChaine() {
  const zone = document.getElementById("etat-chaine");
  try {
    const f = await fraicheur();
    const etat = f.ok ? badge("● Chaîne OK", "vert") : badge("● Chaîne à vérifier", "orange");
    zone.innerHTML = `<div class="ts-statut">${etat} ${e(f.execution)}<br>
      Données au <b>${e(f.date_donnees)}</b><br>
      Comparaison : ${e(f.comparaison)}<br>${e(f.mode)}</div>
      <div class="ts-signature">Sarra Abdeljaouad · ${VERSION}</div>`;
  } catch {
    zone.innerHTML = `<div class="ts-signature">Sarra Abdeljaouad · ${VERSION}</div>`;
  }
}

/** Construit le cadre, puis appelle afficher(zone) pour remplir la page. */
export async function demarrer(pageActive, afficher) {
  document.body.innerHTML = `<div class="ts-app">
    <aside class="ts-menu">${menu(pageActive)}</aside>
    <main class="ts-contenu"><div class="ts-pile" id="page"></div></main></div>`;

  document.getElementById("recherche-laterale").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const q = ev.target.q.value.trim();
    if (q) location.href = adresse("recherche", { q });
  });
  etatChaine();

  const zone = document.getElementById("page");
  zone.innerHTML = '<div class="ts-chargement">Chargement…</div>';
  try {
    await afficher(zone);
  } catch (err) {
    console.error(err);
    zone.innerHTML = `<p class="ts-message erreur">La page n'a pas pu être chargée : ${e(err.message)}</p>`;
  }
}
