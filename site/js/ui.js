/*
 * TuniShop - Plateforme vue 360 (version HTML)
 * ui.js : composants visuels communs. Mêmes composants que src/ui.py (Streamlit), habillés avec la charte
 * tunishop-theme.css : les tons passent par des classes (.ts-badge.rouge…), pas par des couleurs en ligne.
 * Toutes les valeurs sont échappées (e) avant affichage.
 * Auteure : Sarra Abdeljaouad
 */
import { deltaHtml as deltaFormat, echapper, sens as sensFormat } from "./format.js";

export const VERSION = "v1.0.0";               // version de la version HTML (Streamlit : v0.13.3)

// Palette (mêmes valeurs que les jetons de tunishop-theme.css, pour les graphiques et les couleurs calculées)
export const FONCE = "#0F4C5C", CANARD = "#1B7F8C", CLAIR = "#9CC3C9";
export const ROUGE = "#B42318", VERT = "#1E7B4F", ORANGE = "#B45309", BLEU = "#1F4E79", GRIS = "#5B6675";
export const GRIS_CLAIR = "#8A94A3";

/** Échappe une valeur pour l'afficher dans du HTML, comme ui.e en Python : « — » si la valeur manque
 *  (null, NaN), mais un texte vide reste vide (echapper de format.js le remplacerait par « — »). */
export const e = (v) => (v === "" ? "" : echapper(v));
export const sens = sensFormat;

/** deltaHtml(texte, sens, {bonSiHausse, suffixe}) : variation colorée (▲ / ▼). */
export const deltaHtml = (texte, s, { bonSiHausse = true, suffixe = "vs 2024" } = {}) =>
  deltaFormat(texte, s, bonSiHausse, suffixe);

/** Adresse d'une page du site : adresse("client", {id: "CLI004074"}) -> « client.html?id=CLI004074 ». */
export function adresse(page, params = {}) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ""));
  return `${page}.html${q.toString() ? `?${q}` : ""}`;
}

/** Badge ; ton : rouge, vert, orange, bleu, gris, canard. Le texte est déjà du HTML sûr. */
export const badge = (texte, ton = "gris") => `<span class="ts-badge ${ton}">${texte}</span>`;

export const lien = (texte, page, ident) => `<a href="${adresse(page, { id: ident })}">${e(texte)}</a>`;
export const lienBouton = (texte, page, ident) =>
  `<a class="ts-lien-bouton" href="${adresse(page, { id: ident })}">↗ ${e(texte)}</a>`;

/** Fil d'Ariane, titre (et identifiant gris), sous-titre, pastilles, liens à droite. */
export function enTete(fil, titre, { ident = "", sousTitre = "", pastilles = null, liens = null } = {}) {
  const t = titre.length + ident.length <= 48
    ? `<h1 class="ts-titre">${e(titre)}${ident ? ` <span class="ts-id">· ${e(ident)}</span>` : ""}</h1>`
    : `<h1 class="ts-titre">${e(titre)}</h1><div class="ts-id-dessous">${e(ident)}</div>`;
  return `<div class="ts-grille haut" style="grid-template-columns:3fr 2fr">
    <div><div class="ts-fil">${e(fil)}</div>${t}
      ${sousTitre ? `<div class="ts-sous-titre">${sousTitre}</div>` : ""}
      ${pastilles ? `<div class="ts-pastilles">${pastilles.join("")}</div>` : ""}</div>
    <div>${liens ? `<div class="ts-liens">${liens.join("")}</div>` : ""}</div></div>`;
}

export const titreCarte = (titre, source = "") =>
  `<div class="ts-carte-titre"><b>${e(titre)}</b><span>${e(source)}</span></div>`;

/** Lignes « libellé ...... valeur » ; la valeur est du HTML sûr. */
export const cleValeur = (paires) =>
  `<div>${paires.map(([c, v]) => `<div class="ts-kv"><span>${e(c)}</span><b>${v}</b></div>`).join("")}</div>`;

export const encadre = (html, alerte = false) => `<div class="ts-encadre${alerte ? " alerte" : ""}">${html}</div>`;

/** Bloc de HTML déjà sûr (gardé pour la lisibilité des pages). */
export const md = (html) => `<div>${html}</div>`;

/** Carte à bord (st.container(border=True)). */
export const carte = (html) => `<div class="ts-carte">${html}</div>`;

/** Colonnes (st.columns) : poids relatifs ; écart « small » (0,9 rem, charte) ou « medium » (1,4 rem). */
export function colonnes(contenus, poids, { ecart = "small", centre = false } = {}) {
  const gabarit = poids.map((p) => `${p}fr`).join(" ");
  return `<div class="ts-grille ${centre ? "centre" : "haut"}" style="grid-template-columns:${gabarit};`
    + `${ecart === "medium" ? "gap:1.4rem" : ""}">${contenus.map((c) => `<div class="ts-pile">${c}</div>`).join("")}</div>`;
}

/** Légende grise (st.caption). legende échappe le texte ; legendeHtml accepte du HTML sûr. */
export const legende = (texte) => `<p class="ts-legende">${e(texte)}</p>`;
export const legendeHtml = (html) => `<p class="ts-legende">${html}</p>`;

/** Messages (st.info, st.error). */
export const info = (texte) => `<p class="ts-message info">${e(texte)}</p>`;
export const erreur = (texte) => `<p class="ts-message erreur">${e(texte)}</p>`;

/** Lien vers une page (st.page_link). */
export const lienPage = (page, libelle) => `<a class="ts-lien-page" href="${page}.html">${e(libelle)}</a>`;

/** Une carte KPI. delta : sortie de deltaHtml ; note : petite ligne grise. */
export function kpi(label, valeur, delta = "", note = "") {
  const bas = delta || (note ? `<span class="ts-kpi-note">${note}</span>` : "");
  return `<div class="ts-kpi"><div class="ts-kpi-label">${e(label)}</div><div class="ts-kpi-valeur">${e(valeur)}</div>${bas}</div>`;
}

export const rangeeKpi = (cartes, colonnes = null) =>
  `<div class="ts-kpis" style="grid-template-columns:repeat(${colonnes || cartes.length}, minmax(0,1fr))">${cartes.join("")}</div>`;

/** Intertitre en capitales avec un filet. */
export const section = (titre) => `<div class="ts-section">${e(titre)}</div>`;

/** Bandeau « À retenir » : 3 constats au plus, puis l'action. ton : rouge, orange ou neutre. */
export function aRetenir(constats, action = null, ton = "neutre") {
  const blocs = constats.slice(0, 3).map((c) => `<div class="c">${c}</div>`);
  if (action) blocs.push(`<div class="c">Action : <b>${action}</b></div>`);
  return `<div class="ts-retenir ${ton}"><div class="t">À RETENIR</div>${blocs.join("")}</div>`;
}

/** Tableau HTML. entetes = [[libellé, 'num' ou '']] ; les cellules sont déjà du HTML sûr. */
export function tableau(entetes, lignes, classes = null) {
  const th = entetes.map(([t, c]) => `<th class="${c}">${e(t)}</th>`).join("");
  const corps = lignes.map((l, i) => {
    const cls = classes && classes[i] ? ` class="${classes[i]}"` : "";
    return `<tr${cls}>${l.map((v, j) => `<td class="${entetes[j][1]}">${v}</td>`).join("")}</tr>`;
  }).join("");
  return `<div class="ts-defile"><table class="ts-table"><thead><tr>${th}</tr></thead><tbody>${corps}</tbody></table></div>`;
}

/** Volumes en barres horizontales : [libellé, valeur, valeur affichée]. */
export function barres(lignes, maximum = null) {
  const m = maximum || Math.max(1, ...lignes.map(([, v]) => v)) || 1;
  const h = lignes.map(([l, v, t]) => `<tr><td style="width:38%">${e(l)}</td><td style="width:47%"><div class="ts-barre">`
    + `<div style="width:${(100 * v / m).toFixed(1)}%"></div></div></td><td class="num">${e(t)}</td></tr>`).join("");
  return `<table class="ts-table"><tbody>${h}</tbody></table>`;
}

/** Volet repliable (st.expander), fermé au départ. */
export const volet = (titre, contenu) =>
  `<details class="ts-volet"><summary>${e(titre)}</summary><div class="ts-volet-corps ts-pile">${contenu}</div></details>`;

/** Emplacement d'un graphique Plotly (rempli ensuite par graphiques.js). */
export const graphique = (id, hauteur) => `<div class="ts-graphique" id="${id}" style="height:${hauteur}px"></div>`;

/** Frise de suivi : [libellé, détail, état] ; état = ok, ko, attente ou annule (classes de la charte). */
export function suivi(etapes) {
  const symbole = { ok: "✓", ko: "!", attente: "…", annule: "✕" };
  return `<div class="ts-suivi">${etapes.map(([lib, det, etat]) =>
    `<div class="e"><div class="p ${etat}">${symbole[etat]}</div><div class="l">${e(lib)}</div><div class="d">${e(det)}</div></div>`).join("")}</div>`;
}
