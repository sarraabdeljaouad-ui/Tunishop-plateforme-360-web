/*
 * TuniShop - Plateforme vue 360 (version HTML)
 * Page Modèles (maquette 08, v2), portage de pages/modeles.py : une carte par cas (modèle retenu, mesure 2025,
 * gain face à la référence, état du suivi, pages alimentées), indicateurs de suivi de la dernière exécution
 * face à leur seuil, variables les plus importantes du churn, registre des versions.
 *
 * Adresse : modeles.html
 * Auteure : Sarra Abdeljaouad
 */
import { demarrer } from "../app.js";
import { modeles as donneesModeles } from "../donnees.js";
import { nombre, pct, vide } from "../format.js";
import * as ui from "../ui.js";

const TITRE = { ventes: "Prévision des ventes", churn: "Churn client", demande: "Demande par produit", retard: "Retard de livraison" };
const ALIMENTE = { ventes: "Accueil", churn: "Accueil, fiche Client", demande: "Accueil, fiches Produit et Fournisseur",
  retard: "Accueil, fiches Commande et Transporteur" };
const ERREUR = ["MAPE", "WAPE", "MAE", "RMSE"];                 // mesures d'erreur : plus bas = mieux

const cleCas = (cas) => { const c = String(cas).toLowerCase(); return Object.keys(TITRE).find((k) => c.includes(k)) || c; };
const estAlerte = (statut) => {
  const s = String(statut).toLowerCase();
  return s.includes("alerte") || s === "ko" || s.includes("dépass") || s.includes("depass");
};
const estErreur = (mesure) => ERREUR.some((m) => String(mesure).toUpperCase().includes(m));
const formatMesure = (mesure, valeur) => (vide(valeur) ? "—" : estErreur(mesure) ? pct(valeur) : nombre(valeur, 3));
const titre = (cle, cas) => TITRE[cle] || cas;

async function afficher(zone) {
  const D = await donneesModeles();
  const { modeles, registre } = D;
  const suivi = D.suivi.map((r) => ({ ...r, cle: cleCas(r.cas), alerte: estAlerte(r.statut) }));
  const retenus = modeles.filter((r) => Number(r.retenu) === 1).map((r) => ({ ...r, cle: cleCas(r.cas) }));
  const alerteCas = (k) => suivi.some((r) => r.cle === k && r.alerte);
  const h = [];

  // 1. En-tête
  const nAlertes = suivi.filter((r) => r.alerte).length;
  const pastilles = [ui.badge(`${new Set(retenus.map((r) => r.cle)).size} modèles en production`, "gris"),
    ui.badge("Rescorés chaque nuit à 22 h", "vert")];
  if (nAlertes) pastilles.push(ui.badge(`${nAlertes} indicateur${nAlertes > 1 ? "s" : ""} en alerte`, "orange"));
  h.push(ui.enTete("Accueil › Modèles", "Modèles de machine learning", { pastilles,
    liens: ['<span class="ts-lien-bouton">pbi.v_ml_modeles · v_ml_registre · v_ml_suivi</span>'] }));

  // 2. Une carte par cas
  const presents = new Set(retenus.map((r) => r.cle));
  const cles = [...Object.keys(TITRE).filter((k) => presents.has(k)), ...[...presents].filter((k) => !(k in TITRE)).sort()];
  const cartes = cles.map((k) => {
    const r = retenus.find((x) => x.cle === k);
    const etat = alerteCas(k) ? ui.badge("À surveiller", "orange") : ui.badge("Actif", "vert");
    const ver = registre.find((x) => cleCas(x.cas) === k);
    const version = ver && !vide(ver.version) ? ` · ${ui.e(ver.version)}` : "";
    // Gain face à la référence : positif = le modèle fait mieux (moins d'erreur, ou AUC plus haute)
    const erreur = estErreur(r.mesure);
    let gain = r.gain_vs_reference;
    if (vide(gain)) {                                  // colonne vide : recalcul depuis la ligne « référence »
      const ref = modeles.find((x) => x.cas === r.cas && String(x.role).toLowerCase().startsWith("réf"));
      if (ref && !vide(ref.valeur_test) && ref.valeur_test) {
        gain = erreur ? (ref.valeur_test - r.valeur_test) / ref.valeur_test : (r.valeur_test - ref.valeur_test) / ref.valeur_test;
      }
    }
    let txtGain = "";
    if (!vide(gain)) {
      const couleur = gain > 0 ? ui.VERT : ui.ROUGE;
      const txt = erreur ? `${gain > 0 ? "-" : "+"}${pct(Math.abs(gain))} d'erreur` : `${gain >= 0 ? "+" : "-"}${pct(Math.abs(gain))}`;
      txtGain = `<span style="color:${couleur};font-weight:600">${txt}</span> vs référence`;
    }
    return `<div class="ts-kpi"><div style="display:flex;justify-content:space-between;align-items:center">`
      + `<b style="font-size:1.05rem">${ui.e(titre(k, r.cas))}</b>${etat}</div>`
      + `<div class="ts-kpi-note">${ui.e(r.modele)}${version}</div>`
      + `<div class="ts-kpi-label" style="margin-top:.5rem">${ui.e(r.mesure)} 2025</div>`
      + `<div class="ts-kpi-valeur">${formatMesure(r.mesure, r.valeur_test)}</div>`
      + `<span class="ts-kpi-delta">${txtGain}</span>`
      + `<div class="ts-kpi-note" style="margin-top:.4rem;color:${ui.FONCE}">Alimente : ${ALIMENTE[k] || "—"}</div></div>`;
  });
  h.push(ui.rangeeKpi(cartes, Math.max(cartes.length, 1)));

  // 3. Suivi | variables importantes
  let g = ui.titreCarte("Suivi de la dernière exécution", "pbi.v_ml_suivi · indicateur face à son seuil");
  if (!suivi.length) g += ui.legende("Suivi non publié.");
  else {
    const alertes = suivi.filter((r) => r.alerte);
    if (alertes.length) {
      const a0 = alertes[0];
      g += ui.encadre(`<b>${alertes.length} alerte${alertes.length > 1 ? "s" : ""}.</b> Exemple : ${ui.e(titre(a0.cle, a0.cas))}, `
        + `${ui.e(a0.indicateur)} (${ui.e(a0.objet)}) = ${nombre(a0.valeur, 3)} pour un seuil de ${nombre(a0.seuil, 3)}.`, true);
    }
    const t = suivi.map((r, i) => ({ ...r, i })).sort((x, y) => (y.alerte - x.alerte)
      || (x.cle < y.cle ? -1 : x.cle > y.cle ? 1 : 0) || x.i - y.i);
    g += ui.tableau([["Modèle", ""], ["Objet", ""], ["Indicateur", ""], ["Période", ""], ["Valeur", "num"], ["Seuil", "num"],
      ["Statut", ""]], t.slice(0, 12).map((r) => [ui.e(titre(r.cle, r.cas)), ui.e(r.objet), ui.e(r.indicateur), ui.e(r.periode),
      nombre(r.valeur, 3), nombre(r.seuil, 3), ui.badge(ui.e(r.statut), r.alerte ? "orange" : "vert")]))
      + ui.legende(`${suivi.length} indicateurs suivis` + (suivi.length > 12 ? " · 12 premiers, alertes d'abord" : "")
        + ". Le suivi ne garde que la dernière exécution : pas encore de courbe dans le temps.");
  }
  let d = ui.titreCarte("Variables les plus importantes · churn", "ana.ml03_importance");
  d += !D.importance.length ? ui.legende("Importance non publiée.")
    : ui.barres(D.importance.map((r) => [r.variable, r.perte_auc, nombre(r.perte_auc, 3)]))
      + ui.legende("Perte d'AUC quand on mélange la variable (permutation, test 2025). La récence explique l'essentiel du modèle.");
  h.push(ui.colonnes([ui.carte(g), ui.carte(d)], [1.5, 1], { ecart: "medium" }));

  // 4. Registre
  let c = ui.titreCarte("Registre des versions", "pbi.v_ml_registre");
  if (!registre.length) c += ui.legende("Registre non publié.");
  else {
    const statut = (r) => {
      const role = String(r.role).toLowerCase();
      if (role.includes("retenu") || role.includes("production")) {
        return alerteCas(cleCas(r.cas)) ? ui.badge("À surveiller", "orange") : ui.badge("Actif", "vert");
      }
      return ui.badge(ui.e(r.role), "gris");
    };
    c += ui.tableau([["Modèle", ""], ["Cas", ""], ["Version", ""], ["Appris le", ""], ["Période d'apprentissage", ""],
      ["Lignes", "num"], ["Variables", "num"], ["Seuil", "num"], ["Statut", ""]], registre.map((r) => [ui.e(r.nom),
      ui.e(titre(cleCas(r.cas), r.cas)), ui.e(r.version), ui.e(r.appris_le), ui.e(r.periode_apprentissage),
      nombre(r.lignes_apprentissage), nombre(r.nb_variables), !vide(r.seuil) ? nombre(r.seuil, 2) : "—", statut(r)]));
  }
  h.push(ui.carte(c));
  zone.innerHTML = h.join("");
}

demarrer("modeles", afficher);
