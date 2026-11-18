/*
 * TuniShop - Plateforme vue 360 (version HTML)
 * recherche.js : recherche floue, portage fidèle de src/recherche.py (version Streamlit).
 *
 * Les trois scores de rapidfuzz sont recodés à l'identique :
 *   - ratio            : similarité Indel normalisée, 100 x 2 x LCS / (len1 + len2) ;
 *   - token_sort_ratio : ratio après tri alphabétique des mots ;
 *   - token_set_ratio  : comparaison intersection / différences de mots (algorithme rapidfuzz 3).
 * Score retenu, comme en Python : max(score mixte sur le nom, score mixte sur nom + détail,
 * 0,95 x score mot à mot sur le nom), seuil 60, tri stable par score décroissant.
 * La conformité est vérifiée par tests/test_recherche_js.py (mêmes résultats que Python).
 *
 * Auteure : Sarra Abdeljaouad
 */

export const SEUIL_PAR_DEFAUT = 60;
export const NB_RESULTATS_PAR_DEFAUT = 10;
export const SEUIL_MOT = 75;

const RE_ID = /^\s*(CLI\d+|PRD\d+|FRN\d+|TS-\d{2}-\d{5})\s*$/i;
const RE_COMMANDE = /^\s*(CMD\d+)\s*$/i;

// ---------------------------------------------------------------------------
// Scores rapidfuzz
// ---------------------------------------------------------------------------
/** Longueur de la plus longue sous-séquence commune (programmation dynamique sur une ligne). */
function lcs(a, b) {
  if (!a.length || !b.length) return 0;
  if (a.length < b.length) [a, b] = [b, a];
  const ligne = new Uint16Array(b.length + 1);
  for (let i = 0; i < a.length; i++) {
    let diag = 0;
    const ca = a.charCodeAt(i);
    for (let j = 1; j <= b.length; j++) {
      const haut = ligne[j];
      ligne[j] = ca === b.charCodeAt(j - 1) ? diag + 1 : Math.max(haut, ligne[j - 1]);
      diag = haut;
    }
  }
  return ligne[b.length];
}

/** Distance Indel (insertions et suppressions seulement). */
function indel(a, b) {
  return a.length + b.length - 2 * lcs(a, b);
}

/** rapidfuzz _norm_distance : 100 - 100 x distance / somme des longueurs. */
function normDistance(dist, somme) {
  return somme ? 100 - (100 * dist) / somme : 100;
}

/** fuzz.ratio */
export function ratio(a, b) {
  if (!a.length && !b.length) return 100;
  return normDistance(indel(a, b), a.length + b.length);
}

const mots = (s) => s.split(/\s+/).filter(Boolean);

/** fuzz.token_sort_ratio */
export function tokenSortRatio(a, b) {
  return ratio(mots(a).sort().join(" "), mots(b).sort().join(" "));
}

/** fuzz.token_set_ratio (rapidfuzz 3, sans seuil de coupure) */
export function tokenSetRatio(a, b) {
  const ta = new Set(mots(a));
  const tb = new Set(mots(b));
  if (!ta.size || !tb.size) return 0;
  const inter = [...ta].filter((m) => tb.has(m)).sort();
  const diffAB = [...ta].filter((m) => !tb.has(m)).sort();
  const diffBA = [...tb].filter((m) => !ta.has(m)).sort();
  if (inter.length && (!diffAB.length || !diffBA.length)) return 100;

  const ab = diffAB.join(" ");
  const ba = diffBA.join(" ");
  const lenSect = inter.join(" ").length;
  const sep = lenSect ? 1 : 0;
  const lenSectAB = lenSect + sep + ab.length;
  const lenSectBA = lenSect + sep + ba.length;

  const resultat = normDistance(indel(ab, ba), lenSectAB + lenSectBA);
  if (!lenSect) return resultat;
  const ratioSectAB = normDistance(sep + ab.length, lenSect + lenSectAB);
  const ratioSectBA = normDistance(sep + ba.length, lenSect + lenSectBA);
  return Math.max(resultat, ratioSectAB, ratioSectBA);
}

/** scores_mixtes : moyenne token_set_ratio et token_sort_ratio. */
export function scoreMixte(saisie, cle) {
  return 0.5 * tokenSetRatio(saisie, cle) + 0.5 * tokenSortRatio(saisie, cle);
}

// ---------------------------------------------------------------------------
// Normalisation et index
// ---------------------------------------------------------------------------
/** Minuscules, sans accents, ponctuation remplacée par des espaces (comme normaliser en Python :
 *  NFKD puis suppression des caractères non ASCII). */
export function normaliser(texte) {
  if (texte === null || texte === undefined) return "";
  const t = String(texte).normalize("NFKD").replace(/[^\x00-\x7F]/g, "").toLowerCase();
  return t.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

const joindre = (...v) => v.map((x) => (x === null || x === undefined ? "" : String(x)))
  .filter((x) => x.trim()).join(" ");

/** index_depuis_vue : une entrée par entité, avec ses clés normalisées et ses mots. */
export function construireIndex(vue) {
  const c = Object.fromEntries(vue.c.map((nom, i) => [nom, i]));
  return vue.l.map((r) => {
    const detail = r[c.detail] ?? "";
    const cleNom = normaliser(r[c.libelle]);
    return {
      type: r[c.type_entite], id: r[c.id], libelle: r[c.libelle], detail,
      sku: r[c.sku] ?? null, cleNom, cle: normaliser(joindre(r[c.libelle], detail)), motsNom: mots(cleNom),
    };
  });
}

/** Mots distincts des noms de la base cherchée (pour le score mot à mot). Calculé une fois pour l'index
 *  complet ; recalculé si la base est filtrée par type, comme en Python. */
function vocabulaireBase(base, index) {
  const calcul = () => [...new Set(base.flatMap((e) => e.motsNom))].sort();
  if (base !== index) return calcul();
  if (!index._vocab) index._vocab = calcul();
  return index._vocab;
}

/** numpy.round(x, 1) : arrondi au dixième, à l'entier pair en cas d'égalité exacte. */
export function arrondi1(x) {
  const y = x * 10, e = Math.floor(y), r = y - e;
  const n = r > 0.5 ? e + 1 : r < 0.5 ? e : (e % 2 === 0 ? e : e + 1);
  return n / 10;
}

/** scores_mot_a_mot : chaque mot saisi prend son meilleur ratio parmi les mots de la clé ;
 *  moyenne des mots, ou 0 si un mot saisi ne trouve aucun écho (score < SEUIL_MOT). */
function scoresMotAMot(saisie, base, vocab) {
  const ms = mots(saisie).filter((m) => m.length >= 2);
  if (!ms.length || !vocab.length) return base.map(() => 0);
  const meilleurs = ms.map((m) => {
    const d = new Map();
    for (const w of vocab) d.set(w, ratio(m, w));
    return d;
  });
  return base.map((e) => {
    if (!e.motsNom.length) return 0;
    const parMot = meilleurs.map((d) => Math.max(0, ...e.motsNom.map((w) => d.get(w) ?? 0)));
    return Math.min(...parMot) >= SEUIL_MOT ? parMot.reduce((s, x) => s + x, 0) / parMot.length : 0;
  });
}

// ---------------------------------------------------------------------------
// Recherche
// ---------------------------------------------------------------------------
export function estIdentifiant(saisie) {
  return RE_ID.test(saisie || "");
}

/** rechercher : liste triée de {type, id, libelle, detail, score}. */
export function rechercher(saisie, index, { types = null, seuil = SEUIL_PAR_DEFAUT, limite = NB_RESULTATS_PAR_DEFAUT } = {}) {
  if (!saisie || !saisie.trim()) return [];
  const base = types ? index.filter((e) => types.includes(e.type)) : index;

  // 1. Identifiant exact : pas de flou
  const m = RE_ID.exec(saisie);
  if (m) {
    const code = m[1].toUpperCase();
    return base.filter((e) => e.id.toUpperCase() === code || (e.sku || "").toUpperCase() === code)
      .map((e) => ({ ...e, score: 100 }));
  }

  // 2. Recherche floue
  const requete = normaliser(saisie);
  if (requete.length < 2) return [];
  const motAMot = scoresMotAMot(requete, base, vocabulaireBase(base, index));
  const scores = base.map((e, i) => Math.max(
    Math.max(scoreMixte(requete, e.cleNom), scoreMixte(requete, e.cle)), 0.95 * motAMot[i]));
  const garder = [];
  scores.forEach((s, i) => { if (s >= seuil) garder.push(i); });
  garder.sort((a, b) => scores[b] - scores[a] || a - b);            // tri stable : ordre de l'index à égalité
  return garder.slice(0, limite).map((i) => ({ ...base[i], score: arrondi1(scores[i]) }));
}

/** commande_exacte : « cmd0047890 » -> « CMD0047890 », sinon null. */
export function commandeExacte(saisie) {
  const m = RE_COMMANDE.exec(saisie || "");
  return m ? m[1].toUpperCase() : null;
}

/** vocabulaire : mots des noms indexés hors clients (3 lettres et plus, pas que des chiffres). */
export function vocabulaire(index) {
  const v = new Set();
  for (const e of index) {
    if (e.type === "Client") continue;
    for (const w of e.motsNom) if (w.length >= 3 && !/^\d+$/.test(w)) v.add(w);
  }
  return [...v].sort();
}

/** suggestion : chaque mot inconnu est remplacé par le mot connu le plus proche (ratio >= 80). */
export function suggestion(saisie, vocab, seuil = 80) {
  const ms = mots(normaliser(saisie));
  if (!ms.length || !vocab.length) return null;
  const connus = new Set(vocab);
  const sortie = ms.map((m) => {
    if (connus.has(m) || m.length < 3 || /^\d+$/.test(m)) return m;
    let meilleur = null, scoreMax = -1;
    for (const w of vocab) {
      const s = ratio(m, w);
      if (s > scoreMax) { scoreMax = s; meilleur = w; }
    }
    return scoreMax >= seuil ? meilleur : m;
  });
  const propose = sortie.join(" ");
  return propose !== ms.join(" ") ? propose : null;
}

const echapper = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" }[c]));

/** surligner : HTML du libellé, mots proches d'un mot saisi entre <mark>. */
export function surligner(libelle, saisie, seuil = 75) {
  const cibles = mots(normaliser(saisie)).filter((m) => m.length >= 2);
  return String(libelle).split(" ").map((mot) => {
    const n = normaliser(mot);
    const proche = !!n && cibles.some((c) => ratio(n, c) >= seuil || (c.length >= 4 && n.startsWith(c)));
    return proche ? `<mark>${echapper(mot)}</mark>` : echapper(mot);
  }).join(" ");
}
