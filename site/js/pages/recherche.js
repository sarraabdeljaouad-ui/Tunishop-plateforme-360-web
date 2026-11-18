/*
 * TuniShop - Plateforme vue 360 (version HTML)
 * Page Recherche (maquette 00), portage de pages/recherche.py : résultats de la recherche floue, filtres par
 * type avec leur nombre, mots surlignés, score de correspondance, « Vouliez-vous dire ? » et recherches récentes.
 *
 * Adresse : recherche.html?q=carthgo
 * Auteure : Sarra Abdeljaouad
 */
import { demarrer } from "../app.js";
import { charger, parCle } from "../donnees.js";
import { moisFr, nombre, pct } from "../format.js";
import * as R from "../recherche.js";
import * as ui from "../ui.js";

const URL_FICHE = { Client: "client", Produit: "produit", Fournisseur: "fournisseur" };
const ICONE = { Client: "👤", Produit: "▣", Fournisseur: "🚚" };
const PLURIEL = { Client: "Clients", Produit: "Produits", Fournisseur: "Fournisseurs" };
const CLE_RECENTES = "tunishop.recherches_recentes";

// ---------------------------------------------------------------------------
// Données (chargées une fois)
// ---------------------------------------------------------------------------
let D = null;
async function donnees() {
  if (!D) {
    const j = await charger("recherche.json");
    const index = R.construireIndex(j.index);
    D = {
      index, vocab: R.vocabulaire(index),
      prod: parCle(j.produits, "produit_id"), four: parCle(j.fournisseurs, "fournisseur_id"),
      cli: parCle(j.clients, "client_id"),
    };
  }
  return D;
}

// Recherches récentes : gardées pour l'onglet en cours (comme st.session_state)
function recentes() {
  try { return JSON.parse(sessionStorage.getItem(CLE_RECENTES) || "[]"); } catch { return []; }
}
function noterRecente(saisie) {
  const l = recentes().filter((r) => r !== saisie);
  l.unshift(saisie);
  try { sessionStorage.setItem(CLE_RECENTES, JSON.stringify(l.slice(0, 6))); } catch { /* stockage indisponible */ }
}

// ---------------------------------------------------------------------------
// Détail affiché sous chaque résultat
// ---------------------------------------------------------------------------
function detail(r) {
  const morceaux = [ui.e(r.id)];
  if (r.type === "Produit" && D.prod.has(r.id)) {
    const p = D.prod.get(r.id);
    morceaux.push(ui.e(p.categorie));
    if (p.stock_depart !== null) {
      const rouge = p.mois_rupture !== null;
      const stock = `stock ${nombre(p.stock_depart)} u.`;
      morceaux.push(rouge ? `<span style="color:${ui.ROUGE}">${stock}</span>` : stock);
      if (rouge) morceaux.push(`<span style="color:${ui.ROUGE}">épuisé prévu en ${moisFr(p.mois_rupture)}</span>`);
    }
  } else if (r.type === "Fournisseur" && D.four.has(r.id)) {
    const f = D.four.get(r.id);
    morceaux.push(ui.e(f.pays), `${nombre(f.nb_produits)} produits`);
    if (f.fiabilite_reelle !== null) {
      const ecart = f.fiabilite_reelle - f.fiabilite_annoncee;
      const txt = `fiabilité réelle ${pct(f.fiabilite_reelle, 0)}`;
      morceaux.push(ecart < -0.05 ? `<span style="color:${ui.ORANGE}">${txt}</span>` : txt);
    }
  } else if (r.type === "Client") {
    morceaux.push(ui.e(r.detail));
    if (D.cli.has(r.id)) morceaux.push(ui.e(D.cli.get(r.id).segment_rfm));
  } else {
    morceaux.push(ui.e(r.detail));
  }
  return morceaux.filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------
async function afficher(zone) {
  const saisie = (new URLSearchParams(location.search).get("q") || "").trim();
  await donnees();

  let tous = [], duree = 0;
  if (saisie) {
    // Identifiant exact : la fiche s'ouvre directement, sans passer par la liste
    const cmd = R.commandeExacte(saisie);
    if (cmd) { location.replace(ui.adresse("commande", { id: cmd })); return; }
    const t0 = performance.now();
    tous = R.rechercher(saisie, D.index, { limite: 20 });
    duree = (performance.now() - t0) / 1000;
    if (tous.length === 1 && tous[0].score === 100 && R.estIdentifiant(saisie)) {
      location.replace(ui.adresse(URL_FICHE[tous[0].type], { id: tous[0].id }));
      return;
    }
  }

  // En-tête
  let entete;
  if (saisie) {
    const sugg = R.suggestion(saisie, D.vocab);
    let sous = `Recherche tolérante aux fautes · ${tous.length} résultat(s) en ${nombre(duree, 2)} s`;
    if (sugg) sous += ` · Vouliez-vous dire <a href="${ui.adresse("recherche", { q: sugg })}"><b>« ${ui.e(sugg)} »</b></a> ?`;
    entete = ui.enTete("Accueil › Recherche", `Résultats pour « ${saisie} »`, { sousTitre: sous });
  } else {
    entete = ui.enTete("Accueil › Recherche", "Recherche",
      { sousTitre: "Un client, un produit, un fournisseur ou une commande. Les fautes de frappe sont tolérées." });
  }

  // Champ de saisie et filtre par type
  const nb = {};
  for (const r of tous) nb[r.type] = (nb[r.type] || 0) + 1;
  const options = [[null, "Tous", tous.length],
    ...["Client", "Produit", "Fournisseur"].filter((t) => nb[t]).map((t) => [t, PLURIEL[t], nb[t]])];
  const champ = `<form id="form-recherche" role="search">
      <input class="ts-champ grand" name="q" value="${saisie ? ui.e(saisie) : ""}" aria-label="Rechercher" autocomplete="off"
             placeholder="ex. « nexra evasion », « CLI004074 », « CMD0047890 »"></form>`;
  const segments = `<div class="ts-onglets" role="group" aria-label="Type" style="margin-bottom:0">${options.map(([t, lib, n], i) =>
    `<button type="button" data-type="${t ?? ""}" class="ts-onglet${i === 0 ? " actif" : ""}">${ui.e(lib)}`
    + `<span class="ts-compteur">${n}</span></button>`).join("")}</div>`;

  // Colonne de droite (après la gauche : la recherche en cours devient une recherche récente)
  let gauche;
  if (!saisie) gauche = ui.legende("Tape un nom, un identifiant ou un SKU.");
  else if (!tous.length) gauche = ui.info("Aucun résultat. Essaie un autre mot, ou moins de mots.");
  else {
    noterRecente(saisie);
    gauche = ui.titreCarte("Meilleurs résultats", "triés par score de correspondance") + '<div id="resultats"></div>';
  }
  const rec = recentes();
  const droite = ui.carte(ui.titreCarte("Formats acceptés") + ui.cleValeur([
      ["CLI004074", "fiche client"], ["PRD0094 ou SKU TS-03-00094", "fiche produit"],
      ["FRN002", "fiche fournisseur"], ["CMD0047890", "fiche commande"],
      ["Un nom, même mal orthographié", "liste de résultats"]]))
    + (rec.length ? ui.carte(ui.titreCarte("Recherches récentes") + ui.md(rec.map((r) =>
        `<a href="${ui.adresse("recherche", { q: r })}">${ui.badge(ui.e(r), "gris")}</a>`).join(" "))) : "")
    + ui.encadre("Un identifiant exact ouvre directement la fiche, sans passer par cette page.");

  zone.innerHTML = entete
    + ui.colonnes([champ, segments], [3, 2], { centre: true })
    + ui.colonnes([ui.carte(gauche), droite], [1.75, 1], { ecart: "medium" });

  // Résultats, filtrés par le type choisi
  const afficherResultats = (filtre) => {
    const cible = document.getElementById("resultats");
    if (!cible) return;
    const res = filtre ? tous.filter((r) => r.type === filtre) : tous;
    cible.innerHTML = res.map((r) =>
      `<div class="ts-resultat"><div class="ic">${ICONE[r.type]}</div>`
      + `<div class="x"><b>${R.surligner(r.libelle, saisie)}</b><br><span>${detail(r)}</span></div>`
      + ui.badge(r.type, "gris")
      + `<a class="ts-lien-bouton" href="${ui.adresse(URL_FICHE[r.type], { id: r.id })}">`
      + `Ouvrir · ${nombre(r.score, 0)} %</a></div>`).join("");
  };
  afficherResultats(null);

  zone.querySelectorAll(".ts-onglet").forEach((b) => b.addEventListener("click", () => {
    zone.querySelectorAll(".ts-onglet").forEach((x) => x.classList.toggle("actif", x === b));
    afficherResultats(b.dataset.type || null);
  }));

  // Nouvelle saisie : l'adresse est mise à jour (?q=), puis la page est recalculée
  const form = document.getElementById("form-recherche");
  const lancer = () => {
    const q = form.q.value.trim();
    if (q === saisie) return;
    history.pushState(null, "", ui.adresse("recherche", { q }));
    afficher(zone);
  };
  form.addEventListener("submit", (ev) => { ev.preventDefault(); lancer(); });
  form.q.addEventListener("change", lancer);
  if (!saisie) form.q.focus();
}

window.addEventListener("popstate", () => afficher(document.getElementById("page")));
demarrer("recherche", afficher);
