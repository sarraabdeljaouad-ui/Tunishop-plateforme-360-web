/* =============================================================================
   TuniShop · Vue 360 : formats d'affichage (version HTML)
   Transposition de src/format.py (Streamlit) : mêmes sorties, caractère pour caractère
   (vérifié par tests/test_format_js.py, arrondi compris).
   - milliers séparés par une espace simple, décimales avec une virgule : 12 450,5
   - montants : « 12 450 TND », compacts « 8,42 M TND » / « 845 k TND »
   - parts : « 18,5 % » ; écarts de taux : « +1,2 pt »
   - dates : JJ/MM/AAAA (avec HH:MM s'il y a une heure)
   - valeur manquante : « — »
   Auteure : Sarra Abdeljaouad
   ============================================================================= */

const VIDE = "—";
export const estVide = (v) => v === null || v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v));

/**
 * Équivalent exact de f"{x:.{d}f}" en Python : arrondi sur la valeur binaire exacte, et à l'entier PAIR
 * en cas d'égalité parfaite (0,5 -> 0 ; 2,5 -> 2 ; 0,125 -> 0,12). toFixed arrondit ces cas vers le haut.
 * Un nombre négatif garde son signe même s'il s'arrondit à zéro (-0,4 -> « -0 »), comme en Python.
 */
function fixe(x, d) {
  const exact = Math.abs(x).toFixed(Math.min(100, d + 30));      // développement décimal (quasi) exact
  const [ent, dec = ""] = exact.split(".");
  const garde = dec.slice(0, d), reste = dec.slice(d);
  let n = BigInt(ent + garde);
  const egalite = /^50*$/.test(reste);
  if (reste[0] > "5" || (reste[0] === "5" && !egalite) || (egalite && n % 2n === 1n)) n += 1n;
  let t = n.toString().padStart(d + 1, "0");
  t = d ? `${t.slice(0, -d)}.${t.slice(-d)}` : t;
  return (x < 0 || Object.is(x, -0) ? "-" : "") + t;
}

/** 12450.5 -> "12 450" ; décimales avec une virgule (espace simple, comme format.py). */
export function nombre(v, decimales = 0) {
  if (estVide(v)) return VIDE;
  const [ent, dec] = fixe(Number(v), decimales).split(".");
  const signe = ent.startsWith("-") ? "-" : "";
  return signe + ent.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (dec ? "," + dec : "");
}

/** Montant en dinars : "12 450 TND". */
export const tnd = (v, decimales = 0) => (estVide(v) ? VIDE : `${nombre(v, decimales)} TND`);

/** Grand montant pour une carte KPI : "7,13 M TND", "845 k TND". */
export function tndCompact(v) {
  if (estVide(v)) return VIDE;
  const x = Number(v);
  if (Math.abs(x) >= 1e6) return `${nombre(x / 1e6, 2)} M TND`;
  if (Math.abs(x) >= 1e4) return `${nombre(x / 1e3, 0)} k TND`;
  return tnd(x);
}

/** Part entre 0 et 1 -> "18,5 %". */
export const pct = (v, decimales = 1) => (estVide(v) ? VIDE : `${nombre(100 * Number(v), decimales)} %`);

/** Variation relative : "+8,2 %" (null si non calculable). */
export function variation(nouveau, ancien, decimales = 1) {
  if (estVide(nouveau) || estVide(ancien) || Number(ancien) === 0) return null;
  const v = (Number(nouveau) - Number(ancien)) / Math.abs(Number(ancien));
  return `${v >= 0 ? "+" : "-"}${nombre(Math.abs(100 * v), decimales)} %`;
}

/** Écart entre deux parts, en points : "+1,2 pt". */
export function ecartPoints(nouveau, ancien, decimales = 1) {
  if (estVide(nouveau) || estVide(ancien)) return null;
  const v = 100 * (Number(nouveau) - Number(ancien));
  return `${v >= 0 ? "+" : "-"}${nombre(Math.abs(v), decimales)} pt`;
}

/** +1 si x > y, -1 si x < y, 0 sinon ou si une valeur manque. */
export const sens = (x, y) => (estVide(x) || estVide(y) ? 0 : Math.sign(Number(x) - Number(y)));

/**
 * Variation colorée (HTML), comme delta_html de ui.py :
 * ▲ / ▼, vert si favorable, rouge sinon ; sans flèche si sens = 0.
 */
export function deltaHtml(texte, s, bonSiHausse = true, suffixe = "vs 2024") {
  if (!texte) return "";
  // un suffixe vide reste vide (echapper le remplacerait par « — ») : « à temps » sans suffixe, fiche Commande
  const esc = (v) => (v === "" ? "" : echapper(v));
  if (s === 0) return `<span class="ts-kpi-delta">${esc(texte)} ${esc(suffixe)}</span>`;
  const classe = (s > 0) === bonSiHausse ? "favorable" : "defavorable";
  return `<span class="ts-kpi-delta"><span class="${classe}">${s > 0 ? "▲" : "▼"} ${esc(texte)}</span> ${esc(suffixe)}</span>`;
}

/** Lit "AAAA-MM-JJ[ T]HH:MM..." sans conversion de fuseau (new Date("2025-09-03") décalerait l'heure). */
function lireDate(v) {
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  return m ? { a: m[1], mo: m[2], j: m[3], h: m[4] || "00", mi: m[5] || "00" } : null;
}

/** Date ISO ("2025-09-03" ou "2025-09-03T22:14") -> "03/09/2025" (ou "03/09/2025 22:14"). */
export function dateFr(v) {
  if (estVide(v)) return VIDE;
  const d = lireDate(v);
  if (!d) return VIDE;
  const j = `${d.j}/${d.mo}/${d.a}`;
  return d.h !== "00" || d.mi !== "00" ? `${j} ${d.h}:${d.mi}` : j;
}

export const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
              "septembre", "octobre", "novembre", "décembre"];

/** "2026-03-01" -> "mars 2026". */
export function moisFr(v) {
  if (estVide(v)) return VIDE;
  const d = lireDate(v);
  return d ? `${MOIS[Number(d.mo) - 1]} ${d.a}` : VIDE;
}

/** Échappe une valeur pour l'insérer dans du HTML ("—" si vide). */
export function echapper(v) {
  if (estVide(v)) return VIDE;
  return String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Couleurs des graphiques, dans le même ordre que chartCategoricalColors (config.toml). */
export const SERIES = ["#0F4C5C", "#9CC3C9", "#1B7F8C", "#D97706", "#B42318", "#1E7B4F", "#7B4F9E", "#8C8C8C"];

/** Seuils de la jauge de churn (ui.jauge) : rouge >= 0,6 ; orange >= 0,3 ; vert en dessous. */
export const couleurJauge = (v, rouge = 0.6, orange = 0.3) =>
  v >= rouge ? "#B42318" : v >= orange ? "#B45309" : "#1E7B4F";

/** Alias utilisé par les pages. */
export const vide = estVide;
