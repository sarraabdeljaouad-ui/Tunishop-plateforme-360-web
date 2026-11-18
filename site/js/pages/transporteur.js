/*
 * TuniShop - Plateforme vue 360 (version HTML)
 * Fiche Transporteur (maquette 06, v2), portage de pages/transporteur.py : bandeau « À retenir », 5 chiffres de
 * l'année face à la précédente, retard par semestre face à la moyenne, retard par région, comparaison des
 * transporteurs, colis en cours à risque de retard.
 *
 * Adresse : transporteur.html?id=SahelLog (nom) ou transporteur.html?id=TR03 (identifiant)
 * Auteure : Sarra Abdeljaouad
 */
import { demarrer } from "../app.js";
import { dateReference, retard as donneesRetard, transporteurs } from "../donnees.js";
import { dateFr, ecartPoints, nombre, pct, variation, vide } from "../format.js";
import { dessiner, styler } from "../graphiques.js";
import * as ui from "../ui.js";

const libelleSem = (an, s) => `S${Math.trunc(s)} ${String(Math.trunc(an) % 100).padStart(2, "0")}`;

/** round(x, 1) de Python (arrondi exact au dixième), à partir de nombre() qui arrondit comme Python. */
const arrondi1 = (x) => Number(nombre(x, 1).replace(/\s/g, "").replace(",", "."));

function enteteVide(zone, message, estErreur = false) {
  zone.innerHTML = ui.enTete("Accueil › Fiche transporteur", "Fiche transporteur")
    + (estErreur ? ui.erreur(message) : ui.info(message))
    + ui.lienPage("recherche", "Aller à la recherche");
}

async function afficher(zone) {
  const ident = (new URLSearchParams(location.search).get("id") || "").trim() || null;
  const [D, refIso, rt] = await Promise.all([transporteurs(), dateReference(), donneesRetard()]);
  const refT = D.ref;
  if (ident === null) {
    zone.innerHTML = ui.enTete("Accueil › Fiche transporteur", "Fiche transporteur")
      + ui.legende("Choisis un transporteur.")
      + ui.md(refT.map((r) => ui.lienBouton(r.nom_transporteur, "transporteur", r.transporteur_id)).join(" "));
    return;
  }
  const t = refT.find((r) => r.transporteur_id.toUpperCase() === ident.toUpperCase()
    || r.nom_transporteur.toLowerCase() === ident.toLowerCase());
  if (!t) return enteteVide(zone, `Aucun transporteur ne correspond à « ${ident} ».`, true);

  const nom = t.nom_transporteur;
  document.title = `${nom} · TuniShop · Vue 360`;
  const an = +refIso.slice(0, 4), prec = an - 1;
  const tabAn = D.annees.filter((r) => r.annee === an), tabPrec = D.annees.filter((r) => r.annee === prec);
  const a = tabAn.find((r) => r.transporteur === nom) || null;
  const p = tabPrec.find((r) => r.transporteur === nom) || null;
  const moy = tabAn.find((r) => r.transporteur === "ensemble") || null;
  const sem = D.semestres;
  const regions = D.regions.filter((r) => r.transporteur === nom && r.annee === an);
  const colis = D.colis.filter((r) => r.transporteur === nom);
  const seuil = rt.seuil;
  const aRisque = colis.filter((r) => r.alerte_retard === 1);
  const v = (serie, col) => (serie ? serie[col] : null);
  const h = [];

  // -------------------------------------------------------------------------
  // 1. En-tête
  // -------------------------------------------------------------------------
  const pastilles = [];
  if (!vide(t.couverture)) pastilles.push(ui.badge(`Couverture ${ui.e(String(t.couverture).toLowerCase())}`, "gris"));
  if (!vide(t.cout_base_ht)) pastilles.push(ui.badge(`Coût de base ${nombre(t.cout_base_ht, 1)} TND HT`, "gris"));
  const liens = [`<a class="ts-lien-bouton" href="#colis-en-cours">↗ ${colis.length} colis en cours</a>`,
    '<a class="ts-lien-bouton" href="#comparaison">↗ Comparer</a>'];
  h.push(ui.enTete("Accueil › Fiche transporteur", nom, { ident: t.transporteur_id, pastilles, liens }));

  // -------------------------------------------------------------------------
  // 2. À retenir
  // -------------------------------------------------------------------------
  const constats = [];
  const autres = tabAn.filter((r) => r.transporteur !== "ensemble")
    .sort((x, y) => (vide(y.taux_reel) ? -1 : vide(x.taux_reel) ? 1 : y.taux_reel - x.taux_reel));
  if (a && moy && !vide(a.taux_reel)) {
    const rang = autres.findIndex((r) => r.transporteur === nom) + 1;
    const debut = rang === 1 ? "Le plus en retard" : rang === autres.length ? "Le moins en retard" : `${rang}e sur ${autres.length}`;
    constats.push(`${debut} : <b>${pct(a.taux_reel)}</b> contre ${pct(moy.taux_reel)} en moyenne`);
  }
  const triSem = (l) => [...l].sort((x, y) => x.annee - y.annee || x.semestre - y.semestre);
  const sT = triSem(sem.filter((r) => r.transporteur === nom)).slice(-4);
  if (sT.length >= 3) {
    const x = sT.map((r) => r.taux);
    const hausse = x.slice(0, -1).every((xi, i) => xi < x[i + 1]);
    const baisse = x.slice(0, -1).every((xi, i) => xi > x[i + 1]);
    const depuis = libelleSem(sT[0].annee, sT[0].semestre).replace(" ", " 20");
    // Rupture : un saut d'au moins 10 pt, au moins deux fois plus grand que chacune des autres variations
    const sauts = x.slice(0, -1).map((xi, i) => x[i + 1] - xi);
    let iMax = 0;
    sauts.forEach((d, i) => { if (Math.abs(d) > Math.abs(sauts[iMax])) iMax = i; });
    const autresSauts = sauts.filter((_, i) => i !== iMax).map(Math.abs);
    const rupture = Math.abs(sauts[iMax]) >= 0.10 && autresSauts.every((d) => Math.abs(sauts[iMax]) >= 2 * d);
    if (rupture) {
      const quand = libelleSem(sT[iMax + 1].annee, sT[iMax + 1].semestre).replace(" ", " 20");
      const debut = sauts[iMax] > 0 ? "Rupture" : "Amélioration nette";
      constats.push(`${debut} au <b>${quand}</b> : retard passé de ${pct(x[iMax], 0)} à ${pct(x[iMax + 1], 0)}`);
    } else if (hausse) constats.push(`Dégradation continue depuis <b>${depuis}</b>`);
    else if (baisse) constats.push(`Amélioration continue depuis <b>${depuis}</b>`);
    else constats.push(`${pct(x.at(-1))} au dernier semestre, contre ${pct(x.at(-2))} au précédent`);
  }
  if (regions.length && a && !vide(a.taux_reel)) {
    const r0 = regions[0];
    constats.push(r0.taux >= 1.25 * a.taux_reel
      ? `Retards concentrés dans la région <b>${ui.e(r0.region)}</b> (${pct(r0.taux)})`
      : "Retards répartis, sans région dominante");
  }
  const action = aRisque.length > 1 ? `prévenir les ${aRisque.length} clients des colis à risque`
    : aRisque.length === 1 ? "prévenir le client du colis à risque" : null;
  const ecart = !a || !moy || vide(a.taux_reel) ? null : a.taux_reel - moy.taux_reel;
  const ton = ecart !== null && ecart > 0.05 ? "rouge" : ecart !== null && ecart > 0 ? "orange" : "neutre";
  const trois = constats.slice(0, 3);
  h.push(ui.aRetenir(trois.length ? trois : [`Aucune livraison en ${an}`], action, ton));

  // -------------------------------------------------------------------------
  // 3. Chiffres de l'année
  // -------------------------------------------------------------------------
  h.push(ui.section(`Chiffres clés ${an}`));
  const carte = (label, col, valeur, { bonSiHausse = true, points = false, jours = false, note = "" } = {}) => {
    const x = v(a, col), y = v(p, col);
    if (vide(x) || vide(y)) return ui.kpi(label, valeur, "", note);
    let delta;
    if (points) delta = ecartPoints(x, y);
    else if (jours) {
      const d = arrondi1(x - y);
      if (d === 0) return ui.kpi(label, valeur, ui.deltaHtml("stable", 0, { suffixe: `vs ${prec}` }));
      delta = `${d > 0 ? "+" : "-"}${nombre(Math.abs(d), 1)} j`;
    } else delta = variation(x, y);
    return ui.kpi(label, valeur, ui.deltaHtml(delta, ui.sens(x, y), { bonSiHausse, suffixe: `vs ${prec}` }));
  };
  const ecartModele = !a || vide(a.taux_predit) || vide(a.taux_reel) ? null : a.taux_predit - a.taux_reel;
  const notePred = ecartModele === null ? ""
    : `le modèle ${ecartModele < 0 ? "sous-estime" : "surestime"} de ${nombre(Math.abs(100 * ecartModele), 1)} pt`;
  h.push(ui.rangeeKpi([
    carte(`Colis livrés ${an}`, "colis_livres", nombre(v(a, "colis_livres"))),
    carte("Retard réel", "taux_reel", pct(v(a, "taux_reel")), { bonSiHausse: false, points: true }),
    ui.kpi("Retard prédit", pct(v(a, "taux_predit")), "",
      ecartModele !== null && Math.abs(ecartModele) >= 0.02 ? `<span style="color:${ui.ORANGE}">${notePred}</span>` : notePred),
    carte("Retard moyen", "retard_moyen_j", vide(v(a, "retard_moyen_j")) ? "—" : `${nombre(a.retard_moyen_j, 1)} j`,
      { bonSiHausse: false, jours: true, note: "parmi les colis en retard" }),
    carte("Avis négatifs livraison", "part_avis_negatifs", pct(v(a, "part_avis_negatifs")), { bonSiHausse: false, points: true }),
  ], 5));
  h.push(ui.legende("Retard prédit : moyenne des probabilités du modèle à l'expédition (test 2025). "
    + "Avis négatifs : part des avis commentés qui critiquent la livraison."));

  // -------------------------------------------------------------------------
  // 4. Semestres | régions | comparaison
  // -------------------------------------------------------------------------
  const c1 = ui.titreCarte("Retard par semestre", "face à la moyenne") + ui.graphique("g-semestres", 260);
  let c2 = ui.titreCarte("Retard par région", String(an));
  if (!regions.length) c2 += ui.legende(`Aucune livraison en ${an}.`);
  else {
    const m = Math.max(...regions.map((r) => r.taux)) * 1.1;
    c2 += ui.barres(regions.map((r) => [r.region, r.taux, pct(r.taux)]), m)
      + ui.legende("Colis livrés en retard, parmi les colis livrés de la région.");
  }
  let c3 = '<a id="comparaison"></a>' + ui.titreCarte("Comparaison des transporteurs", String(an));
  if (!autres.length) c3 += ui.legende("Aucune donnée.");
  else {
    const tonReel = (x) => {
      if (!moy || vide(x)) return "gris";
      return x > moy.taux_reel + 0.03 ? "rouge" : x > moy.taux_reel ? "orange" : "vert";
    };
    const identDe = new Map(refT.map((r) => [r.nom_transporteur, r.transporteur_id]));
    c3 += ui.tableau([["Transporteur", ""], ["Réel", "num"], ["Prédit", "num"], ["Avis nég.", "num"]],
      autres.map((r) => [r.transporteur === nom ? `<b>${ui.e(r.transporteur)}</b>`
        : ui.lien(r.transporteur, "transporteur", identDe.get(r.transporteur) || r.transporteur),
      ui.badge(pct(r.taux_reel), tonReel(r.taux_reel)), pct(r.taux_predit), pct(r.part_avis_negatifs)]));
  }
  h.push(ui.colonnes([ui.carte(c1), ui.carte(c2), ui.carte(c3)], [1.1, 1, 1.15], { ecart: "medium" }));

  // -------------------------------------------------------------------------
  // 5. Colis en cours
  // -------------------------------------------------------------------------
  let c5 = '<a id="colis-en-cours"></a>' + ui.titreCarte("Colis en cours, du plus risqué au moins risqué",
    `pbi.v_ml_scores_retard · au ${dateFr(refIso)} · alerte au-delà de ${pct(seuil, 0)}`);
  if (!colis.length) c5 += ui.legende("Aucun colis en transit à la date des données.");
  else {
    const tonP = (x) => (seuil !== null && x >= Math.max(0.5, seuil) ? "rouge" : seuil !== null && x >= seuil ? "orange" : "gris");
    c5 += ui.tableau([["Commande", ""], ["Client", ""], ["Destination", ""], ["Expédié le", ""], ["Prévu le", ""],
      ["Risque", "num"], ["", ""]], colis.slice(0, 10).map((r) => [
      ui.lien(r.id, "commande", r.id),
      !vide(r.client_id) ? ui.lien(r.client_id, "client", r.client_id) : "—",
      ui.e(!vide(r.gouvernorat) ? r.gouvernorat : r.region), dateFr(r.date_expedition), dateFr(r.date_prevue),
      ui.badge(nombre(r.proba_retard, 2), tonP(r.proba_retard)),
      `<a class="ts-lien-bouton" href="${ui.adresse("commande", { id: r.id })}">Fiche</a>`]))
      + ui.legende(`${aRisque.length} colis en alerte sur ${colis.length} en transit`
        + (colis.length > 10 ? " · 10 premiers affichés" : ""));
  }
  h.push(ui.carte(c5));

  zone.innerHTML = h.join("");

  // Graphique : retard par semestre, transporteur face à la moyenne, depuis l'année précédente
  const sAll = triSem(sem.filter((r) => r.transporteur === nom && r.annee >= prec));
  const sM = triSem(sem.filter((r) => r.transporteur === "ensemble" && r.annee >= prec));
  dessiner("g-semestres", [
    { type: "bar", name: nom, x: sAll.map((r) => libelleSem(r.annee, r.semestre)), y: sAll.map((r) => r.taux),
      marker: { color: ui.FONCE }, hovertemplate: "%{y:.1%}<extra></extra>" },
    { type: "bar", name: "Moyenne", x: sM.map((r) => libelleSem(r.annee, r.semestre)), y: sM.map((r) => r.taux),
      marker: { color: "#CBD3DD" }, hovertemplate: "%{y:.1%}<extra></extra>" },
  ], styler({ yaxis: { tickformat: ".0%", rangemode: "tozero" } }, 260));
}

demarrer("transporteur", afficher);
