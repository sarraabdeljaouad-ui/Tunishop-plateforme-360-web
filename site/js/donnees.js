/*
 * TuniShop - Plateforme vue 360 (version HTML)
 * donnees.js : la seule porte vers les données (fichiers JSON de site/data, produits par
 * scripts/exporter_web.py). Chaque fichier n'est téléchargé qu'une fois par page.
 * Auteure : Sarra Abdeljaouad
 */

const cache = new Map();

/** Télécharge un fichier JSON de data/ (une seule fois). */
export function charger(chemin) {
  if (!cache.has(chemin)) {
    cache.set(chemin, fetch(`data/${chemin}`).then((r) => {
      if (!r.ok) throw new Error(`Données introuvables : data/${chemin} (${r.status})`);
      return r.json();
    }));
  }
  return cache.get(chemin);
}

/** Table compacte {c, l} -> liste d'objets {colonne: valeur}. */
export function lignes(table) {
  return table.l.map((l) => Object.fromEntries(table.c.map((c, i) => [c, l[i]])));
}

/** Table compacte -> Map clé -> objet (pour retrouver une ligne par identifiant). */
export function parCle(table, cle) {
  return new Map(lignes(table).map((o) => [o[cle], o]));
}

/** Menu latéral : dernière exécution de la chaîne, date des données (donnees.fraicheur). */
export async function fraicheur() {
  const g = await charger("global.json");
  const a = Number(g.date_reference.slice(0, 4));
  const [an, mo, jo] = g.date_reference.split("-");
  return {
    mode: `Instantané du ${g.date_export}`, execution: g.execution, ok: g.ok,
    date_donnees: `${jo}/${mo}/${an}`, comparaison: `${a} face à ${a - 1}`,
  };
}

/** Paquet d'une fiche : les deux derniers chiffres de l'identifiant (comme scripts/exporter_web.py). */
export function paquet(identifiant) {
  const chiffres = String(identifiant).replace(/\D/g, "");
  return String(Number(chiffres || 0) % 100).padStart(2, "0");
}

/** Fiche d'une entité découpée en paquets (clients, commandes) : chaque bloc devient un objet {colonne: valeur}
 *  (bloc « ligne ») ou une liste d'objets (bloc « table »). Un bloc absent vaut null (ligne) ou [] (table).
 *  Renvoie null si l'identifiant n'existe pas. */
async function fiche(dossier, cle, id, blocsLigne) {
  const p = await charger(`${dossier}/${paquet(id)}.json`);
  const brut = p[cle][id];
  if (!brut) return null;
  const objet = (cols, l) => Object.fromEntries(cols.map((c, i) => [c, l[i]]));
  const f = {};
  for (const [bloc, cols] of Object.entries(p.colonnes)) {
    const v = brut[bloc];
    if (v === undefined) f[bloc] = blocsLigne.includes(bloc) ? null : [];
    else f[bloc] = blocsLigne.includes(bloc) ? objet(cols, v) : v.map((l) => objet(cols, l));
  }
  return f;
}

/** Fiche Client : {i, k, an, vm, rfm, xp, test, cmd, prod, av, hab}. */
export const ficheClient = (id) =>
  (/^CLI\d+$/.test(id) ? fiche("clients", "clients", id, ["i", "k", "xp", "test"]) : Promise.resolve(null));

/** Fiche Commande : {f, l, av, pr}. */
export const ficheCommande = (id) =>
  (/^CMD\d+$/.test(id) ? fiche("commandes", "commandes", id, ["f", "pr"]) : Promise.resolve(null));

/** Fiche Produit : {i, k, an, vm, dem, th, sy, av}. */
export const ficheProduit = (id) =>
  (/^PRD\d+$/.test(id) ? fiche("produits", "produits", id, ["i", "k", "sy"]) : Promise.resolve(null));

/** Fiche Fournisseur : {annees (tous les fournisseurs, toutes années), f, prod, dem, ach} ou null. */
export async function ficheFournisseur(id) {
  const d = await charger("fournisseurs.json");
  const brut = d.fournisseurs[id];
  if (!brut) return null;
  const objet = (cols, l) => Object.fromEntries(cols.map((c, i) => [c, l[i]]));
  const fiche = { annees: lignes(d.annees) };
  for (const [bloc, cols] of Object.entries(d.colonnes)) {
    const v = brut[bloc];
    fiche[bloc] = bloc === "f" ? (v ? objet(cols, v) : null) : (v || []).map((l) => objet(cols, l));
  }
  return fiche;
}

/** Données de la fiche Transporteur : {ref, annees, semestres, regions, colis}, chaque table en liste d'objets. */
export async function transporteurs() {
  const d = await charger("transporteurs.json");
  return Object.fromEntries(Object.entries(d).map(([k, t]) => [k, lignes(t)]));
}

/** Données de l'accueil : chiffres par année, listes « à traiter » (et leur total), CA prévu par catégorie. */
export async function accueil() {
  const d = await charger("accueil.json");
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v && v.c ? lignes(v) : v]));
}

/** Voix du client : catégories, années, résultats de chaque filtre (« catégorie|année ») et confrontation aux faits. */
export async function voix() {
  const d = await charger("voix.json");
  const filtres = Object.fromEntries(Object.entries(d.filtres).map(([k, f]) =>
    [k, { res: f.res, themes: lignes(f.themes), langues: lignes(f.langues), ex: lignes(f.ex) }]));
  return { categories: d.categories, annees: d.annees, filtres, verif: lignes(d.verif) };
}

/** Page Modèles : {modeles, registre, suivi, importance}, chaque table en liste d'objets. */
export async function modeles() {
  const d = await charger("modeles.json");
  return Object.fromEntries(Object.entries(d).map(([k, t]) => [k, lignes(t)]));
}

/** Règles d'association stables sur 2025, de niveau catégorie ou sous-catégorie (donnees.regles_categorie). */
export async function regles() {
  return lignes((await charger("global.json")).regles);
}

/** Seuil du modèle de retard retenu et taux de retard réels par facteur et par année d'expédition. */
export async function retard() {
  const r = (await charger("global.json")).retard;
  return { seuil: r.seuil, facteurs: lignes(r.facteurs) };
}

/** Variables qui pèsent le plus dans le modèle de churn (donnees.importance_churn). */
export async function importanceChurn() {
  return lignes((await charger("global.json")).importance_churn);
}

/** Date des dernières données (donnees.date_reference), au format AAAA-MM-JJ. */
export async function dateReference() {
  return (await charger("global.json")).date_reference;
}
