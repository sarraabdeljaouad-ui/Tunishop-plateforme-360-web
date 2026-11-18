/*
 * TuniShop - Plateforme vue 360 (version HTML)
 * Page d'accueil (maquette 01, v2), portage de pages/accueil.py : recherche, visite guidée en 3 cartes,
 * l'année en chiffres, un tableau à onglets « à traiter » et le CA prévu par catégorie.
 *
 * Adresse : index.html (ou index.html?q=… pour lancer une recherche)
 * Auteure : Sarra Abdeljaouad
 */
import { demarrer } from "../app.js";
import { accueil, charger, dateReference, ficheProduit } from "../donnees.js";
import { dateFr, ecartPoints, moisFr, nombre, pct, tnd, tndCompact, variation, vide } from "../format.js";
import * as R from "../recherche.js";
import { dateRupture, versIso } from "../regles.js";
import * as ui from "../ui.js";

const URL_FICHE = { Client: "client", Produit: "produit", Fournisseur: "fournisseur" };

/** Saisie de l'accueil : un numéro de commande ou un identifiant exact ouvre la fiche, sinon la page Recherche. */
async function chercher(q) {
  const cmd = R.commandeExacte(q);
  if (cmd) { location.href = ui.adresse("commande", { id: cmd }); return; }
  if (R.estIdentifiant(q)) {
    const index = R.construireIndex((await charger("recherche.json")).index);
    const exact = R.rechercher(q, index);
    if (exact.length === 1) { location.href = ui.adresse(URL_FICHE[exact[0].type], { id: exact[0].id }); return; }
  }
  location.href = ui.adresse("recherche", { q });
}

const tonScore = (x) => (x >= 0.7 ? "rouge" : x >= 0.5 ? "orange" : "gris");
const boutonFiche = (page, ident) => `<a class="ts-lien-bouton" href="${ui.adresse(page, { id: ident })}">Fiche</a>`;

async function afficher(zone) {
  const q = (new URLSearchParams(location.search).get("q") || "").trim();
  if (q) { await chercher(q); return; }
  const [A, refIso] = await Promise.all([accueil(), dateReference()]);
  const an = +refIso.slice(0, 4), prec = an - 1;
  const { churn, rupt, four, colis } = A;
  const h = [];

  // -------------------------------------------------------------------------
  // 1. En-tête et recherche
  // -------------------------------------------------------------------------
  h.push(ui.enTete("TuniShop · Vue 360", "Bonjour, que cherches-tu ?",
    { sousTitre: "Client, produit, fournisseur ou commande. Les fautes de frappe sont tolérées." }));
  const exempleCli = churn.length ? churn[0].id : "CLI004074";
  const exempleCmd = colis.length ? colis[0].id : "CMD0047890";
  h.push(`<form id="form-accueil" role="search"><input class="ts-champ grand" name="q" aria-label="Rechercher"
    autocomplete="off" placeholder="Essaie « nexra evasion », « ${ui.e(exempleCli)} » ou « ${ui.e(exempleCmd)} »"></form>`);

  // Visite guidée : les trois cas les plus parlants du moment, cliquables
  const cartes = [];
  if (churn.length) {
    const r = churn[0];
    cartes.push(["Un client sur le départ", `${r.id} · churn ${pct(r.proba_churn, 0)}`, "client", r.id]);
  }
  if (rupt.length) {
    const r = rupt[0];
    const fp = await ficheProduit(r.id);
    const jour = fp ? dateRupture(fp.dem) : null;
    const quand = jour !== null ? `rupture le ${dateFr(versIso(jour))}` : `rupture en ${moisFr(r.mois_rupture)}`;
    cartes.push(["Un produit bientôt épuisé", `${r.produit} · ${quand}`, "produit", r.id]);
  }
  if (four.length) {
    const r = four[0];
    cartes.push(["Un fournisseur qui promet trop",
      `${pct(r.fiabilite_annoncee, 0)} annoncé, ${pct(r.fiabilite_reelle, 0)} réel`, "fournisseur", r.id]);
  }
  if (cartes.length) {
    h.push(ui.colonnes(cartes.map(([titre, detail, page, ident], i) =>
      `<div class="ts-visite"><div class="n">${i + 1}</div><div class="x"><b>${ui.e(titre)}</b>`
      + `<span>${ui.e(detail)}</span></div>${boutonFiche(page, ident).replace(">Fiche<", ">Voir<")}</div>`),
    cartes.map(() => 1), { ecart: "medium" }));
  }

  // -------------------------------------------------------------------------
  // 2. L'année en chiffres
  // -------------------------------------------------------------------------
  h.push(ui.section(`L'année ${an} en chiffres`));
  const a = A.vue_ensemble.find((r) => r.annee === an), p = A.vue_ensemble.find((r) => r.annee === prec);
  if (a && p) {
    const carte = (label, col, valeur, { bonSiHausse = true, points = false } = {}) => {
      const delta = points ? ecartPoints(a[col], p[col]) : variation(a[col], p[col]);
      return ui.kpi(label, valeur, ui.deltaHtml(delta, ui.sens(a[col], p[col]), { bonSiHausse, suffixe: `vs ${prec}` }));
    };
    const dn = a.note_moyenne - p.note_moyenne;
    h.push(ui.rangeeKpi([
      carte("Chiffre d'affaires", "ca_reconnu_ttc", tndCompact(a.ca_reconnu_ttc)),
      carte("Commandes", "commandes_reconnues", nombre(a.commandes_reconnues)),
      carte("Clients actifs", "clients_actifs", nombre(a.clients_actifs)),
      carte("Panier moyen", "panier_moyen_ttc", tnd(a.panier_moyen_ttc)),
      carte("Livraisons en retard", "taux_retard", pct(a.taux_retard), { bonSiHausse: false, points: true }),
      ui.kpi("Note moyenne", `${nombre(a.note_moyenne, 1)} / 5`,
        ui.deltaHtml((dn >= 0 ? "+" : "-") + nombre(Math.abs(dn), 2), ui.sens(dn, 0), { suffixe: `vs ${prec}` })),
    ], 6));
  }

  // -------------------------------------------------------------------------
  // 3. À traiter (onglets) | CA prévu par catégorie
  // -------------------------------------------------------------------------
  h.push(ui.section(`À traiter, à la date des données (${dateFr(refIso)})`));

  const lChurn = churn.slice(0, 5).map((r) => {
    const seg = vide(r.segment_precedent) || r.segment_precedent === r.segment_rfm ? r.segment_rfm
      : `${r.segment_precedent} → ${r.segment_rfm}`;
    return [ui.lien(r.id, "client", r.id), ui.e(seg), dateFr(r.derniere_commande),
      !vide(r.action_recommandee) ? ui.e(String(r.action_recommandee).split(":")[0].trim()) : "—",
      ui.badge(nombre(r.proba_churn, 2), tonScore(r.proba_churn)), boutonFiche("client", r.id)];
  });
  const pChurn = ui.tableau([["Client", ""], ["Segment", ""], ["Dernier achat", ""], ["Action recommandée", ""],
    ["Score", "num"], ["", ""]], lChurn)
    + ui.legende(`pbi.v_ml_scores_churn · déciles 1-2 (risque élevé), triés par CA en jeu · 5 premiers sur `
      + `${nombre(A.n_eleve)}. L'alerte du modèle (seuil 0,37) concerne ${nombre(A.n_churn)} clients.`);

  const pRupt = ui.tableau([["Produit", ""], ["Stock", "num"], ["Demande T1", "num"], ["Épuisé en", ""],
    ["Action recommandée", ""], ["", ""]], rupt.slice(0, 5).map((r) => [
    ui.lien(r.produit, "produit", r.id), nombre(r.stock_depart), nombre(r.demande_t1),
    ui.badge(moisFr(r.mois_rupture), +r.mois_rupture.slice(5, 7) === 1 ? "rouge" : "orange"),
    !vide(r.fournisseur_id) ? `Commander chez ${ui.lien(r.nom_fournisseur, "fournisseur", r.fournisseur_id)}` : "—",
    boutonFiche("produit", r.id)]))
    + ui.legende(`pbi.v_ml_scores_demande · sans réapprovisionnement · 5 premiers sur ${nombre(A.n_rupt)}`);

  const lFour = four.slice(0, 5).map((r) => [ui.lien(r.fournisseur, "fournisseur", r.id), ui.e(r.pays),
    pct(r.fiabilite_annoncee, 0), pct(r.fiabilite_reelle, 0), ui.badge(ecartPoints(r.ecart_fiabilite, 0), "rouge"),
    `Planifier avec ${nombre(r.delai_reel_moyen_j)} j au lieu de ${nombre(r.delai_annonce_j)} j`, boutonFiche("fournisseur", r.id)]);
  const pFour = (lFour.length ? ui.tableau([["Fournisseur", ""], ["Pays", ""], ["Annoncée", "num"], ["Réelle", "num"],
    ["Écart", "num"], ["Action recommandée", ""], ["", ""]], lFour) : '<p class="ts-message succes">Aucun fournisseur sous le seuil.</p>')
    + ui.legende("app.v_fournisseur_fiche · retard compté au-delà de 3 j ou 25 % du délai annoncé · écart ≥ 5 pt · "
      + "action : délai réel moyen à utiliser pour planifier les commandes");

  const lColis = colis.slice(0, 5).map((r) => [ui.lien(r.id, "commande", r.id), ui.e(r.transporteur), ui.e(r.region),
    dateFr(r.date_expedition), ui.badge(nombre(r.proba_retard, 2), tonScore(r.proba_retard)), "Prévenir le client",
    boutonFiche("commande", r.id)]);
  const pColis = (lColis.length ? ui.tableau([["Commande", ""], ["Transporteur", ""], ["Région", ""], ["Expédié le", ""],
    ["Risque", "num"], ["Action recommandée", ""], ["", ""]], lColis) : '<p class="ts-message succes">Aucun colis en alerte.</p>')
    + ui.legende(`pbi.v_ml_scores_retard · alerte_retard = 1 · 5 premiers sur ${nombre(A.n_colis)}`);

  const onglets = [["Churn", A.n_eleve, pChurn], ["Ruptures T1", A.n_rupt, pRupt],
    ["Fournisseurs", A.n_four, pFour], ["Colis à risque", A.n_colis, pColis]];
  const gauche = `<div class="ts-onglets" role="tablist">${onglets.map(([lib, n], i) =>
    `<button type="button" role="tab" class="ts-onglet${i === 0 ? " actif" : ""}" data-i="${i}">${ui.e(lib)}`
    + `<span class="ts-compteur">${nombre(n)}</span></button>`).join("")}</div>`
    + onglets.map(([, , contenu], i) => `<div class="ts-panneau" data-i="${i}"${i ? " hidden" : ""}>${contenu}</div>`).join("");

  let droite = ui.titreCarte(`CA ${an + 1} prévu par catégorie`, "ana.ml_pred_ventes_2026");
  const vc = A.ventes;
  if (!vc.length) droite += ui.info("Prévision non publiée.");
  else {
    droite += ui.barres(vc.map((r) => [r.categorie, r.prevu, tndCompact(r.prevu).replace(" TND", "")]));
    const totalP = vc.reduce((s, r) => s + (r.prevu ?? 0), 0), totalR = vc.reduce((s, r) => s + (r.reel ?? 0), 0);
    droite += ui.cleValeur([[`Total prévu ${an + 1}`,
      `${tndCompact(totalP)} ${ui.deltaHtml(variation(totalP, totalR), ui.sens(totalP, totalR), { suffixe: "" })}`]])
      + ui.legende(`Variation face au réel ${an} de la série du modèle (pbi.v_ml_ventes), à environ 1 % du CA reconnu.`);
  }
  h.push(ui.colonnes([ui.carte(gauche), ui.carte(droite)], [1.6, 1], { ecart: "medium" }));

  zone.innerHTML = h.join("");

  // Onglets
  zone.querySelectorAll(".ts-onglet").forEach((b) => b.addEventListener("click", () => {
    zone.querySelectorAll(".ts-onglet").forEach((x) => x.classList.toggle("actif", x === b));
    zone.querySelectorAll(".ts-panneau").forEach((p2) => { p2.hidden = p2.dataset.i !== b.dataset.i; });
  }));
  // Recherche
  const form = document.getElementById("form-accueil");
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const saisie = form.q.value.trim();
    if (saisie) chercher(saisie);
  });
  form.q.focus();
}

demarrer("index", afficher);
