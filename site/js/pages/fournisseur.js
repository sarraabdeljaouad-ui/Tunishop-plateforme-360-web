/*
 * TuniShop - Plateforme vue 360 (version HTML)
 * Fiche Fournisseur (maquette 04, v2), portage de pages/fournisseur.py : bandeau « À retenir », chiffres clés de
 * l'année dont le score sur 100, le score en détail (promesse face à la réalité), achats et délai réel par mois
 * face au délai annoncé, produits fournis avec leur stock et leur rupture prévue.
 *
 * Adresse : fournisseur.html?id=FRN002
 * Auteure : Sarra Abdeljaouad
 */
import { demarrer } from "../app.js";
import { dateReference, ficheFournisseur } from "../donnees.js";
import { dateFr, ecartPoints, nombre, pct, tndCompact, variation, vide } from "../format.js";
import { dessiner, styler } from "../graphiques.js";
import { arrondiPython, dateRupture, niveauFournisseur, scoreFournisseurs, versIso } from "../regles.js";
import * as ui from "../ui.js";

const SEUIL_ECART_FIABILITE = -0.05;         // donnees.SEUIL_ECART_FIABILITE

function enteteVide(zone, message, estErreur = false) {
  zone.innerHTML = ui.enTete("Accueil › Fiche fournisseur", "Fiche fournisseur")
    + (estErreur ? ui.erreur(message) : ui.info(message))
    + ui.lienPage("recherche", "Aller à la recherche");
}

async function afficher(zone) {
  const ident = (new URLSearchParams(location.search).get("id") || "").trim() || null;
  if (ident === null) return enteteVide(zone, "Choisis un fournisseur depuis la recherche.");
  const [ff, refIso] = await Promise.all([ficheFournisseur(ident), dateReference()]);
  if (!ff || !ff.f) return enteteVide(zone, `Aucun fournisseur ne porte l'identifiant ${ident}.`, true);

  const f = ff.f, produits = ff.prod, achats = ff.ach;
  document.title = `${f.nom_fournisseur} · TuniShop · Vue 360`;
  const an = +refIso.slice(0, 4), prec = an - 1;
  const ligneAnnee = (annee) => scoreFournisseurs(ff.annees.filter((r) => r.annee === annee))
    .find((r) => r.fournisseur_id === ident) || null;
  const a = ligneAnnee(an), p = ligneAnnee(prec);

  // Ruptures au 1er trimestre de l'année suivante, produit par produit
  const ruptures = new Map();
  const parProduit = new Map();
  for (const r of ff.dem) {
    if (!parProduit.has(r.produit_id)) parProduit.set(r.produit_id, []);
    parProduit.get(r.produit_id).push(r);
  }
  for (const [pid, d] of parProduit) {
    const jour = dateRupture(d);
    if (jour !== null) {
      const iso = versIso(jour);
      if (+iso.slice(0, 4) === an + 1 && +iso.slice(5, 7) <= 3) ruptures.set(pid, iso);
    }
  }
  const v = (serie, col) => (serie ? serie[col] : null);
  const score = v(a, "score");
  const niveau = niveauFournisseur(score);
  const pluriel = (n) => (n > 1 ? "s" : "");
  const h = [];

  // -------------------------------------------------------------------------
  // 1. En-tête
  // -------------------------------------------------------------------------
  const pastilles = [ui.badge(ui.e(f.pays), "bleu"), ui.badge(Number(f.est_local) === 1 ? "Local" : "Import", "gris")];
  const cats = new Map();
  for (const r of produits) cats.set(r.categorie, (cats.get(r.categorie) || 0) + 1);
  const catsTriees = [...cats.entries()].sort((x, y) => y[1] - x[1]);
  if (catsTriees.length) {
    pastilles.push(ui.badge(ui.e(catsTriees[0][0]) + (catsTriees.length > 1 ? ` + ${catsTriees.length - 1}` : ""), "gris"));
  }
  if (achats.length) pastilles.push(ui.badge(`Partenaire depuis ${achats.map((r) => r.mois).sort()[0].slice(0, 4)}`, "gris"));
  if (!vide(f.conditions_paiement)) pastilles.push(ui.badge(`Paiement : ${ui.e(f.conditions_paiement)}`, "gris"));
  const liens = [`<a class="ts-lien-bouton" href="#produits-fournis">↗ ${produits.length} produits</a>`];
  if (ruptures.size) {
    liens.push(`<a class="ts-lien-bouton" href="#produits-fournis">↗ ${ruptures.size} rupture${pluriel(ruptures.size)} `
      + `prévue${pluriel(ruptures.size)}</a>`);
  }
  h.push(ui.enTete("Accueil › Fiche fournisseur", f.nom_fournisseur, { ident, pastilles, liens }));

  // -------------------------------------------------------------------------
  // 2. À retenir
  // -------------------------------------------------------------------------
  const constats = [];
  if (a && !vide(a.fiabilite_reelle)) {
    constats.push(`Annonce <b>${pct(f.fiabilite_annoncee, 0)}</b> de ponctualité, en tient <b>${pct(a.fiabilite_reelle, 0)}</b> en ${an}`);
  }
  if (a && !vide(a.delai_reel_moyen_j)) {
    let txt = `Délai réel <b>${nombre(a.delai_reel_moyen_j)} j</b> pour ${nombre(f.delai_annonce_j)} annoncés`;
    if (p && !vide(p.delai_reel_moyen_j)) {
      const dd = arrondiPython(a.delai_reel_moyen_j) - arrondiPython(p.delai_reel_moyen_j);
      if (dd) txt += `, en ${dd > 0 ? "hausse" : "baisse"} de ${Math.abs(dd)} j`;
    }
    constats.push(txt);
  }
  if (ruptures.size) {
    const pr = produits.filter((r) => ruptures.has(r.id))
      .sort((x, y) => (vide(y.ca_ttc) ? -Infinity : y.ca_ttc) - (vide(x.ca_ttc) ? -Infinity : x.ca_ttc))[0];
    const rang = !vide(pr.rang_categorie) && pr.rang_categorie <= 3 ? `, n°${Math.trunc(pr.rang_categorie)} de sa catégorie` : "";
    constats.push(`${ruptures.size} produit${pluriel(ruptures.size)} épuisé${pluriel(ruptures.size)} `
      + `au T1 ${an + 1}, dont <b>${ui.e(pr.nom_produit)}</b>${rang}`);
  } else if (score !== null) {
    constats.push(`Score <b>${nombre(score)}/100</b> : ${niveau}`);
  }
  let action = null;
  if (a && !vide(a.delai_reel_moyen_j) && arrondiPython(a.delai_reel_moyen_j) > f.delai_annonce_j) {
    action = `planifier avec ${nombre(a.delai_reel_moyen_j)} j au lieu de ${nombre(f.delai_annonce_j)} j`;
  }
  const ton = { "à risque": "rouge", "à surveiller": "orange" }[niveau] || "neutre";
  h.push(ui.aRetenir(constats.length ? constats : [`Aucun achat en ${an}`], action, ton));

  // -------------------------------------------------------------------------
  // 3. Chiffres clés
  // -------------------------------------------------------------------------
  h.push(ui.section(`Chiffres clés ${an}`));
  const carte = (label, col, valeur, { bonSiHausse = true, points = false, jours = false } = {}) => {
    const x = v(a, col), y = v(p, col);
    let delta;
    if (vide(x) || vide(y)) delta = null;
    else if (points) delta = ecartPoints(x, y);
    else if (jours) {
      const dj = arrondiPython(x) - arrondiPython(y);
      delta = `${dj >= 0 ? "+" : "-"}${Math.abs(dj)} j`;
    } else delta = variation(x, y);
    const s = jours && delta ? ui.sens(arrondiPython(x), arrondiPython(y)) : ui.sens(x, y);
    return ui.kpi(label, valeur, ui.deltaHtml(delta, s, { bonSiHausse, suffixe: `vs ${prec}` }));
  };
  const couleurScore = { fiable: ui.VERT, "à surveiller": ui.ORANGE, "à risque": ui.ROUGE }[niveau] || "#1F2A37";
  const carteScore = `<div class="ts-kpi" style="text-align:center"><div class="ts-kpi-label">Score</div>`
    + `<div style="font-size:2.6rem;font-weight:800;color:${couleurScore};line-height:1.1">`
    + `${vide(score) ? "—" : nombre(score)}</div><div class="ts-kpi-note">sur 100 · ${niveau || "—"}</div></div>`;
  h.push(ui.rangeeKpi([
    carteScore,
    carte("Achats HT", "montant_achete_ht", tndCompact(v(a, "montant_achete_ht"))),
    carte("Bons de commande", "nb_commandes", nombre(v(a, "nb_commandes"))),
    carte("Délai réel moyen", "delai_reel_moyen_j", vide(v(a, "delai_reel_moyen_j")) ? "—" : `${nombre(a.delai_reel_moyen_j)} j`,
      { bonSiHausse: false, jours: true }),
    carte("Réception complète", "taux_reception", pct(v(a, "taux_reception"), 0), { points: true }),
    carte("CA généré en aval", "ca_aval_ttc", tndCompact(v(a, "ca_aval_ttc"))),
  ], 6));

  // -------------------------------------------------------------------------
  // 4. Promesse et réalité
  // -------------------------------------------------------------------------
  h.push(ui.section("Promesse et réalité"));
  let gauche = ui.titreCarte("Le score en détail", "moyenne de 3 notes");
  if (!a) {
    gauche += ui.legende(`Aucun achat en ${an}.`);
  } else {
    gauche += ui.barres([["Ponctualité", a.ponctualite, nombre(a.ponctualite)],
      ["Complétude", a.completude, nombre(a.completude)],
      ["Qualité (rang des retours)", a.qualite, nombre(a.qualite)]], 100);
    const ecart = vide(a.fiabilite_reelle) ? null : a.fiabilite_reelle - f.fiabilite_annoncee;
    const rouge = ecart !== null && ecart < SEUIL_ECART_FIABILITE;
    const col = rouge ? ui.ROUGE : "#1F2A37";
    gauche += `<div style="display:flex;justify-content:space-around;text-align:center;border-top:1px solid #E3E8EE;`
      + `padding-top:.7rem;margin-top:.3rem">`
      + `<div><div class="ts-kpi-label">Annoncé</div><div style="font-size:1.6rem;font-weight:700">${pct(f.fiabilite_annoncee, 0)}</div></div>`
      + `<div><div class="ts-kpi-label">Réel ${an}</div><div style="font-size:1.6rem;font-weight:700;color:${col}">`
      + `${pct(a.fiabilite_reelle, 0)}</div></div>`
      + `<div><div class="ts-kpi-label">Écart</div><div style="font-size:1.6rem;font-weight:700;color:${col}">`
      + `${ecart === null ? "—" : ecartPoints(a.fiabilite_reelle, f.fiabilite_annoncee, 0)}</div></div></div>`
      + ui.legende("Ponctualité : livraisons dans la tolérance (3 j ou 25 % du délai annoncé). Complétude : quantités "
        + "reçues / commandées. Qualité : 100 = le moins de retours parmi les fournisseurs. "
        + "80 et plus : fiable ; 60 à 79 : à surveiller.");
  }
  const droite = ui.titreCarte("Achats et délai réel par mois", String(an)) + ui.graphique("g-achats", 310)
    + ui.legende("Mois sans commande : pas de barre, la courbe relie les mois voisins.");
  h.push(ui.colonnes([ui.carte(gauche), ui.carte(droite)], [1, 1.7], { ecart: "medium" }));

  // -------------------------------------------------------------------------
  // 5. Portefeuille
  // -------------------------------------------------------------------------
  h.push(ui.section("Portefeuille"));
  let portefeuille = '<a id="produits-fournis"></a>'
    + ui.titreCarte("Produits fournis", `chiffres ${an} · ruptures prévues au T1 ${an + 1} · clic → fiche produit`);
  if (!produits.length) {
    portefeuille += ui.legende("Aucun produit référencé.");
  } else {
    // tri : rupture la plus proche d'abord (sans rupture à la fin), puis CA décroissant (vide à la fin)
    const t = produits.map((r) => ({ ...r, rupture: ruptures.get(r.id) || null }));
    t.sort((x, y) => {
      if (x.rupture !== y.rupture) {
        if (x.rupture === null) return 1;
        if (y.rupture === null) return -1;
        return x.rupture < y.rupture ? -1 : 1;
      }
      if (vide(x.ca_ttc) !== vide(y.ca_ttc)) return vide(x.ca_ttc) ? 1 : -1;
      return vide(x.ca_ttc) ? 0 : y.ca_ttc - x.ca_ttc;
    });
    const stock = (r) => {
      if (vide(r.stock_depart)) return "—";
      const tonS = r.rupture !== null ? "rouge" : r.stock_depart < 50 ? "orange" : "vert";
      return ui.badge(nombre(r.stock_depart), tonS);
    };
    portefeuille += ui.tableau([["Produit", ""], ["Catégorie", ""], [`CA ${an}`, "num"], ["Marge", "num"],
      ["Retours", "num"], ["Stock", "num"], ["Rupture prévue", ""]],
    t.slice(0, 12).map((r) => [ui.lien(r.nom_produit, "produit", r.id), ui.e(r.categorie),
      !vide(r.ca_ttc) ? tndCompact(r.ca_ttc).replace(" TND", "") : "—", pct(r.taux_marge, 0), pct(r.taux_retour), stock(r),
      r.rupture !== null ? ui.badge(dateFr(r.rupture), "rouge") : ui.badge("Aucune au T1", "gris")]));
    if (t.length > 12) portefeuille += ui.legende(`12 premiers sur ${t.length} : ceux qui seront épuisés d'abord, puis par CA.`);
  }
  h.push(ui.carte(portefeuille));

  zone.innerHTML = h.join("");

  // -------------------------------------------------------------------------
  // Graphique : achats (barres, axe gauche) et délai réel (courbe, axe droit) face au délai annoncé
  // -------------------------------------------------------------------------
  const douze = [...Array(12).keys()].map((i) => i + 1);
  const parMois = new Map(achats.filter((r) => +r.mois.slice(0, 4) === an).map((r) => [+r.mois.slice(5, 7), r]));
  const montants = douze.map((m) => (parMois.has(m) && !vide(parMois.get(m).montant_ht) ? parMois.get(m).montant_ht / 1000 : null));
  const delais = douze.map((m) => (parMois.has(m) && !vide(parMois.get(m).delai_reel_moyen_j) ? parMois.get(m).delai_reel_moyen_j : null));
  const hauts = [Math.max(...delais.filter((x) => x !== null)), f.delai_annonce_j].filter((x) => !vide(x) && Number.isFinite(x));
  const haut = hauts.length ? 1.2 * Math.max(...hauts) : 10;
  const pas = haut <= 30 ? 5 : haut <= 60 ? 10 : 20;                      // graduations rondes : 0, 10, 20 j…
  const base = styler({
    xaxis: { tickmode: "array", tickvals: douze, range: [0.4, 12.6],
      ticktext: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"] },
    yaxis: { rangemode: "tozero" },
  }, 310);
  base.yaxis2 = { ...base.yaxis, rangemode: undefined, overlaying: "y", side: "right", range: [0, haut], dtick: pas,
    showgrid: false, ticksuffix: " j" };
  dessiner("g-achats", [
    { type: "bar", x: douze, y: montants, name: "Achats (k TND, axe gauche)", marker: { color: ui.CLAIR },
      hovertemplate: "%{y:,.1f} k TND<extra></extra>" },
    { type: "scatter", x: douze, y: delais, name: "Délai réel (j, axe droit)", mode: "lines+markers", yaxis: "y2",
      line: { color: ui.ORANGE, width: 2.5 }, marker: { size: 6 }, connectgaps: true, hovertemplate: "%{y:,.1f} j<extra></extra>" },
    { type: "scatter", x: [0.6, 12.4], y: [f.delai_annonce_j, f.delai_annonce_j], yaxis: "y2",
      name: `Délai annoncé (${nombre(f.delai_annonce_j)} j)`, mode: "lines", line: { color: ui.VERT, width: 2, dash: "dash" },
      hoverinfo: "skip" },
  ], base);
}

demarrer("fournisseur", afficher);
