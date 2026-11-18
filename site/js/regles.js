/*
 * TuniShop - Plateforme vue 360 (version HTML)
 * regles.js : portage de src/regles.py (règles de calcul des fiches), avec les mêmes seuils.
 * Auteure : Sarra Abdeljaouad
 */
import { vide } from "./format.js";

// ---------------------------------------------------------------------------
// Dates : jours entiers depuis 1970 (UTC), pour calculer comme pandas sans fuseau horaire
// ---------------------------------------------------------------------------
export const J = 86400000;
export const versJour = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / J;
export const versIso = (j) => new Date(j * J).toISOString().slice(0, 10);
export const joursDuMois = (iso) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).getUTCDate();
export const jjmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** round() de Python : au plus proche, à l'entier pair en cas d'égalité (2,5 -> 2). */
export function arrondiPython(x) {
  const e = Math.floor(x), r = x - e;
  return r > 0.5 ? e + 1 : r < 0.5 ? e : (e % 2 === 0 ? e : e + 1);
}

/** regles.date_rupture : jour estimé où le stock de départ est épuisé (null si le stock couvre la période). */
export function dateRupture(dem) {
  if (!dem.length) return null;
  const stock = dem[0].stock_depart || 0;
  let cumul = 0;
  for (const r of dem) {
    const q = r.quantite_prevue || 0;
    if (q > 0 && cumul + q >= stock) {
      const part = Math.max(stock - cumul, 0) / q;
      return versJour(r.mois) + Math.trunc(part * joursDuMois(r.mois));
    }
    cumul += q;
  }
  return null;
}

/** regles.couverture_mois : mois de vente couverts par le stock, au rythme moyen prévu du 1er trimestre. */
export function couvertureMois(stock, demandeT1) {
  if (vide(stock) || vide(demandeT1) || demandeT1 <= 0) return null;
  return stock / (demandeT1 / 3);
}

/** regles.projection_stock : stock projeté jour par jour sans réapprovisionnement, 30 jours après la rupture. */
export function projectionStock(dem, apresRuptureJ = 30) {
  if (!dem.length) return [];
  const t = [];
  for (const r of dem) {
    const n = joursDuMois(r.mois), debut = versJour(r.mois);
    for (let i = 0; i < n; i++) t.push({ jour: debut + i, demande: (r.quantite_prevue || 0) / n });
  }
  let cumul = 0, manquePrec = 0;
  for (const [i, x] of t.entries()) {
    cumul += x.demande;
    const reste = (dem[0].stock_depart || 0) - cumul;
    x.stock = Math.max(reste + x.demande, 0);                 // stock au début du jour : 0 le jour de la rupture
    const manque = Math.max(-reste, 0);
    x.perdu = Math.max(i === 0 ? manque : manque - manquePrec, 0);
    manquePrec = manque;
  }
  const rupture = t.findIndex((x) => x.stock <= 0);
  return rupture >= 0 ? t.slice(0, rupture + apresRuptureJ + 1) : t;
}

// ---------------------------------------------------------------------------
// Niveaux de risque et score fournisseur
// ---------------------------------------------------------------------------
/** regles.niveau_risque : niveau lisible à partir du décile de risque de churn. */
export function niveauRisque(decile) {
  if (vide(decile)) return null;
  const d = Math.trunc(decile);
  return d <= 2 ? "élevé" : d <= 5 ? "moyen" : "faible";
}

export const SCORE_BON = 80, SCORE_A_SURVEILLER = 60;

/** regles.score_fournisseurs : ajoute ponctualite, completude, qualite et score (0-100) à chaque ligne
 *  (un fournisseur, une même année). Qualité = rang moyen du taux de retour, 100 = le moins de retours. */
export function scoreFournisseurs(lignes) {
  const valides = lignes.filter((r) => !vide(r.taux_retour)).map((r) => r.taux_retour);
  const n = valides.length;
  const rang = (x) => {                                       // rang « average » de pandas, croissant
    const inf = valides.filter((y) => y < x).length, egaux = valides.filter((y) => y === x).length;
    return inf + (egaux + 1) / 2;
  };
  return lignes.map((r) => {
    const ponctualite = vide(r.fiabilite_reelle) ? null : 100 * r.fiabilite_reelle;
    const completude = vide(r.taux_reception) ? null : 100 * r.taux_reception;
    const qualite = vide(r.taux_retour) ? null : (n > 1 ? 100 * (n - rang(r.taux_retour)) / (n - 1) : 100);
    const notes = [ponctualite, completude, qualite].filter((x) => x !== null);
    const score = notes.length ? notes.reduce((s, x) => s + x, 0) / notes.length : null;
    return { ...r, ponctualite, completude, qualite, score };
  });
}

/** regles.niveau_fournisseur */
export function niveauFournisseur(score) {
  if (vide(score)) return null;
  return score >= SCORE_BON ? "fiable" : score >= SCORE_A_SURVEILLER ? "à surveiller" : "à risque";
}
