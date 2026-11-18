/*
 * TuniShop - Plateforme vue 360 (version HTML)
 * Fiche Client (maquette 02, v2), portage de pages/client.py : bandeau « À retenir », chiffres clés de l'année,
 * prédiction de churn et ce qui pèse dans le modèle, CA mensuel, parcours RFM, dernières commandes, avis,
 * puis le détail (produits achetés, habitudes, expérience) dans un volet repliable.
 *
 * Adresse : client.html?id=CLI004074
 * Auteure : Sarra Abdeljaouad
 */
import { demarrer } from "../app.js";
import { dateReference, ficheClient, importanceChurn } from "../donnees.js";
import { dateFr, ecartPoints, nombre, pct, tnd, variation, vide } from "../format.js";
import { dessiner, jauge, styler } from "../graphiques.js";
import { niveauRisque } from "../regles.js";
import * as ui from "../ui.js";

const JOURS_SANS_COMMANDE = 90;                 // regles.JOURS_SANS_COMMANDE

const COULEUR_SEGMENT = {
  Champions: "vert", "Fidèles": "vert", "Fidèles potentiels": "bleu", Nouveaux: "bleu",
  Prometteurs: "bleu", "À surveiller": "orange", "À risque": "orange", Hibernants: "rouge", Perdus: "rouge",
};
const POINT = { vert: ui.VERT, bleu: "#1F4E79", orange: ui.ORANGE, rouge: ui.ROUGE, gris: "#8A94A3" };

const jour = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const joursEntre = (a, b) => Math.round((jour(a) - jour(b)) / 86400000);
const trimestre = (iso) => `T${Math.floor((+iso.slice(5, 7) - 1) / 3) + 1} ${iso.slice(2, 4)}`;

function enteteVide(zone, message, estErreur = false) {
  zone.innerHTML = ui.enTete("Accueil › Fiche client", "Fiche client")
    + (estErreur ? ui.erreur(message) : ui.info(message))
    + ui.lienPage("recherche", "Aller à la recherche", "search");
}

async function afficher(zone) {
  const ident = (new URLSearchParams(location.search).get("id") || "").trim() || null;
  if (ident === null) return enteteVide(zone, "Choisis un client depuis la recherche.");
  const [f, refIso, imp] = await Promise.all([ficheClient(ident), dateReference(), importanceChurn()]);
  if (!f || !f.i) return enteteVide(zone, `Aucun client ne porte l'identifiant ${ident}.`, true);
  document.title = `${f.i.nom_complet} · TuniShop · Vue 360`;

  const c = f.i;
  const an = +refIso.slice(0, 4), prec = an - 1;
  const annees = new Map(f.an.map((r) => [r.annee, r]));
  const k = f.k, xp = f.xp, rfm = f.rfm, cmd = f.cmd, hab = f.hab;
  const nbAvis = f.av.length ? f.av[0].nb : 0;
  const score = !vide(c.proba_churn);
  const niveau = score ? niveauRisque(c.decile_risque) : null;
  const h = [];

  // -------------------------------------------------------------------------
  // 1. En-tête
  // -------------------------------------------------------------------------
  const pastilles = [ui.badge(ui.e(c.ville), "bleu")];
  if (!vide(c.date_inscription)) {
    pastilles.push(ui.badge(`Client depuis ${c.date_inscription.slice(5, 7)}/${c.date_inscription.slice(0, 4)}`, "gris"));
  }
  if (!vide(c.cluster)) pastilles.push(ui.badge(`Groupe : ${ui.e(c.cluster)}`, "gris"));
  if (String(c.type_client).toLowerCase() !== "particulier") pastilles.push(ui.badge(ui.e(c.type_client), "gris"));

  const liens = [];
  if (k) liens.push(`<a class="ts-lien-bouton" href="#dernieres-commandes">↗ ${nombre(k.nb_commandes)} commandes</a>`);
  liens.push(`<a class="ts-lien-bouton" href="#ses-avis">↗ ${nbAvis} avis</a>`);
  const transp = hab.find((x) => x.dimension === "transporteur");
  if (transp) liens.push(ui.lienBouton(transp.valeur, "transporteur", transp.valeur));
  const nom = vide(c.nom_complet) || !String(c.nom_complet).trim() ? "—" : c.nom_complet;
  h.push(ui.enTete("Accueil › Fiche client", nom, { ident, pastilles, liens }));

  // -------------------------------------------------------------------------
  // 2. À retenir
  // -------------------------------------------------------------------------
  const constats = [];
  if (score) {
    constats.push(`<b>Risque de départ ${niveau}</b> : ${pct(c.proba_churn, 0)}, décile ${Math.trunc(c.decile_risque)} `
      + "sur 10 (1 = le plus risqué)");
  }
  const jours = k && !vide(k.derniere_commande) ? joursEntre(refIso, k.derniere_commande) : null;
  if (jours !== null && jours >= JOURS_SANS_COMMANDE) {
    constats.push(`Aucun achat depuis le <b>${dateFr(k.derniere_commande)}</b> (${nombre(jours)} jours)`);
  }
  if (cmd.length) {
    const trois = cmd.slice(0, 3);
    const nRet = trois.filter((r) => (r.retard_j ?? 0) > 0).length;
    if (nRet) constats.push(`${nRet} de ses ${trois.length} dernières commandes livrées <b>en retard</b>`);
  }
  if (constats.length < 3 && rfm.length >= 2 && rfm.at(-2).segment_rfm !== rfm.at(-1).segment_rfm) {
    constats.push(`Segment passé de « ${ui.e(rfm.at(-2).segment_rfm)} » à « ${ui.e(rfm.at(-1).segment_rfm)} »`);
  }
  if (!constats.length) constats.push("Rien d'inquiétant à la date des données");
  const ton = { "élevé": "rouge", moyen: "orange" }[niveau] || "neutre";
  h.push(ui.aRetenir(constats, !vide(c.action_recommandee) && score ? ui.e(c.action_recommandee) : null, ton));

  // -------------------------------------------------------------------------
  // 3. Chiffres clés
  // -------------------------------------------------------------------------
  h.push(ui.section(`Chiffres clés ${an}`));
  const a = annees.get(an) || null, p = annees.get(prec) || null;
  const v = (serie, col) => (serie ? serie[col] : null);
  const carte = (label, col, valeur, { bonSiHausse = true, points = false } = {}) => {
    const x = v(a, col), y = v(p, col);
    const delta = vide(x) || vide(y) ? null : (points ? ecartPoints(x, y) : variation(x, y));
    return ui.kpi(label, valeur, ui.deltaHtml(delta, ui.sens(x, y), { bonSiHausse, suffixe: `vs ${prec}` }));
  };
  const na = v(a, "note_moyenne"), np = v(p, "note_moyenne");
  const dn = vide(na) || vide(np) ? null : na - np;
  h.push(ui.rangeeKpi([
    carte("CA", "ca_reconnu_ttc", tnd(v(a, "ca_reconnu_ttc"))),
    carte("Commandes", "nb_commandes", nombre(v(a, "nb_commandes"))),
    carte("Panier moyen", "panier_moyen_ttc", tnd(v(a, "panier_moyen_ttc"))),
    ui.kpi("Note moyenne donnée", vide(na) ? "—" : `${nombre(na, 1)} / 5`,
      ui.deltaHtml(dn === null ? null : (dn >= 0 ? "+" : "-") + nombre(Math.abs(dn), 1),
        dn !== null ? ui.sens(dn, 0) : 0, { suffixe: `vs ${prec}` })),
    carte("Taux de retour", "taux_retour", pct(v(a, "taux_retour")), { bonSiHausse: false, points: true }),
  ], 5));
  if (!a) h.push(ui.info(`Aucune commande en ${an}.`));

  // -------------------------------------------------------------------------
  // 4. Prédiction et explication
  // -------------------------------------------------------------------------
  h.push(ui.section("Prédiction et explication"));
  let churn = ui.titreCarte("Churn", "pbi.v_ml_scores_churn");
  if (!score) {
    churn += ui.info("Pas de score récent : le modèle ne note que les clients actifs à la date de scoring.");
  } else {
    churn += ui.graphique("g-jauge", 210)
      + ui.legende(`Gradient boosting (${vide(c.version_modele) ? "—" : c.version_modele}) · scoré au ${dateFr(c.date_scoring)}`);
    if (f.test) {
      const juste = f.test.prediction === f.test.churn_reel;
      churn += ui.md(ui.badge(`Test ${f.test.date_observation.slice(0, 4)} : prédiction ${juste ? "juste" : "fausse"}`,
        juste ? "vert" : "rouge"));
    }
  }

  let poids = ui.titreCarte("Ce qui pèse dans le score", "ana.ml03_importance");
  if (!imp.length || !score) {
    poids += ui.legende("Pas de score pour ce client.");
  } else {
    const anciennete = vide(c.date_inscription) ? null : joursEntre(refIso, c.date_inscription);
    const valeur = {
      recence_j: ["Récence", `${nombre(c.recence_j)} j`],
      nb_livraisons: ["Livraisons reçues", xp ? nombre(xp.nb_livrees) : "—"],
      anciennete_j: ["Ancienneté", anciennete !== null ? `${nombre(anciennete)} j` : "—"],
      montant_reconnu_ttc: ["Montant acheté", tnd(c.montant_reconnu_ttc)],
      segment_rfm: ["Segment RFM", ui.e(c.segment_rfm)],
      frequence: ["Fréquence", `${nombre(c.frequence)} commandes`],
    };
    const total = imp.reduce((s, r) => s + r.perte_auc, 0);
    poids += ui.barres(imp.map((r) => {
      const [libelle, val] = valeur[r.variable] || [r.variable, "—"];
      const w = r.perte_auc / total;
      return [`${libelle} : ${val}`, w, pct(w, 0)];
    }), 1)
      + ui.legende("Poids de chaque variable dans le modèle (perte d'AUC par permutation, test 2025), "
        + "avec la valeur de ce client. Ce n'est pas une contribution calculée client par client.");
  }

  const caMensuel = ui.titreCarte("CA mensuel", `${an} face à ${prec}`) + ui.graphique("g-ca", 260)
    + ui.legende("Un mois sans achat compte 0 : l'absence d'achat est l'information.");

  h.push(ui.colonnes([ui.carte(churn), ui.carte(poids), ui.carte(caMensuel)], [1, 1.3, 1.7], { ecart: "medium" }));

  // -------------------------------------------------------------------------
  // 5. Historique
  // -------------------------------------------------------------------------
  h.push(ui.section("Historique"));
  let parcours = ui.titreCarte("Parcours RFM", "app.v_client_rfm");
  if (!rfm.length) {
    parcours += ui.legende("Aucune observation RFM.");
  } else {
    // un point par changement de segment (les trimestres identiques sont regroupés), 5 derniers
    const etapes = rfm.filter((r, i) => i === 0 || r.segment_rfm !== rfm[i - 1].segment_rfm).slice(-5);
    const points = etapes.map((s) => {
      const col = POINT[COULEUR_SEGMENT[s.segment_rfm] || "gris"];
      return `<div style="text-align:center;flex:1"><div style="width:16px;height:16px;border-radius:99px;margin:0 auto;`
        + `border:3px solid ${col};background:#FFF"></div>`
        + `<div style="font-size:.84rem;font-weight:600;color:${col};margin-top:.3rem">${ui.e(s.segment_rfm)}</div>`
        + `<div style="font-size:.78rem;color:#8A94A3">${trimestre(s.date_observation)}</div></div>`;
    }).join("");
    parcours += ui.md(`<div style="display:flex;gap:.3rem;align-items:flex-start;position:relative;`
      + `background:linear-gradient(#E3E8EE,#E3E8EE) no-repeat center 8px/80% 2px">${points}</div>`);
    const der = rfm.at(-1);
    let phrase;
    if (etapes.length >= 2) {
      const avant = etapes.at(-2), depuis = trimestre(etapes.at(-1).date_observation);
      phrase = `« ${avant.segment_rfm} » avant le ${depuis}, « ${der.segment_rfm} » depuis le ${depuis}.`;
    } else {
      phrase = `« ${der.segment_rfm} » sur toute la période observée.`;
    }
    parcours += ui.encadre(ui.e(phrase));
  }

  const livraison = (r) => {
    if (vide(r.statut_livraison)) return ui.badge(ui.e(r.libelle_statut), "gris");
    if (r.est_livree != 1) return ui.badge(ui.e(String(r.statut_livraison).replaceAll("_", " ")), "orange");  // eslint-disable-line eqeqeq
    if (!vide(r.retard_j) && r.retard_j > 0) return ui.badge(`+${nombre(r.retard_j)} j`, "rouge");
    return ui.badge("À temps", "vert");
  };
  let commandes = '<a id="dernieres-commandes"></a>' + ui.titreCarte("Dernières commandes", "clic → fiche");
  commandes += !cmd.length ? ui.legende("Aucune commande.")
    : ui.tableau([["Commande", ""], ["Date", ""], ["Montant", "num"], ["Livraison", ""]],
      cmd.map((r) => [ui.lien(r.id, "commande", r.id), dateFr(r.date_commande), tnd(r.montant_total_ttc), livraison(r)]));

  let avis = '<a id="ses-avis"></a>' + ui.titreCarte("Ses avis", "thème · langue · note");
  if (!f.av.length) {
    avis += ui.legende("Aucun avis commenté.");
  } else {
    const tonNote = (n) => (n <= 2 ? "rouge" : n === 3 ? "orange" : "vert");
    avis += ui.tableau([["Avis", ""], ["Thème", ""], ["Note", "num"]], f.av.map((r) => [
      `<i>« ${ui.e(r.texte_nettoye)} »</i>`
        + (String(r.langue).toLowerCase() === "derja" ? ` ${ui.badge("derja", "bleu")}` : "")
        + `<br><span style="color:#8A94A3;font-size:.8rem">${dateFr(r.date_avis)}</span>`,
      vide(r.themes) ? "—" : ui.e(String(r.themes).split(";")[0]),
      vide(r.note) ? "—" : ui.badge(nombre(r.note), tonNote(r.note)),
    ])) + ui.legende("La note moyenne des chiffres clés compte aussi les avis sans commentaire.");
  }
  h.push(ui.colonnes([ui.carte(parcours), ui.carte(commandes), ui.carte(avis)], [1, 1.2, 1.3], { ecart: "medium" }));

  // -------------------------------------------------------------------------
  // 6. Détail (replié)
  // -------------------------------------------------------------------------
  const produits = !f.prod.length ? ui.legende("Aucun produit acheté.")
    : ui.tableau([["Produit", ""], ["Catégorie", ""], ["Quantité", "num"], ["Montant TTC", "num"], ["Dernier achat", ""]],
      f.prod.map((r) => [ui.lien(r.nom_produit, "produit", r.id), ui.e(r.categorie), nombre(r.quantite),
        tnd(r.montant_ttc), dateFr(r.dernier_achat)]));
  const habitudes = [];
  for (const dim of ["canal", "appareil", "mode de paiement"]) {
    const x = hab.find((r) => r.dimension === dim);
    if (x) habitudes.push([dim[0].toUpperCase() + dim.slice(1), `${ui.e(x.valeur)} (${pct(x.nb_commandes / x.total, 0)})`]);
  }
  if (xp) {
    habitudes.push(
      ["Coupons", `${nombre(xp.nb_commandes_avec_coupon)} commande(s) sur ${nombre(xp.nb_commandes)}`],
      ["Livraisons en retard", `${nombre(xp.nb_livrees_en_retard)} sur ${nombre(xp.nb_livrees)}`],
      ["Paiements échoués", `${nombre(xp.nb_paiements_echoues)} sur ${nombre(xp.nb_tentatives_paiement)}`],
      ["Remboursements", `${nombre(xp.nb_remboursements)} (${tnd(xp.montant_rembourse_ttc)})`]);
  }
  let detail = ui.colonnes([produits, ui.tableau([["Habitude", ""], ["Valeur", ""]], habitudes)], [1.3, 1], { ecart: "medium" });
  if (k) {
    detail += ui.legende(`Depuis le début : ${nombre(k.nb_commandes)} commandes, ${tnd(k.ca_reconnu_ttc)} de CA reconnu, `
      + `1re commande le ${dateFr(k.premiere_commande)}, dernière le ${dateFr(k.derniere_commande)}.`);
  }
  h.push(ui.volet("Produits achetés, habitudes et expérience", detail));

  zone.innerHTML = h.join("");

  // -------------------------------------------------------------------------
  // Graphiques (après l'affichage du texte)
  // -------------------------------------------------------------------------
  if (score) {
    const g = jauge(c.proba_churn, `Décile ${Math.trunc(c.decile_risque)} · ${c.alerte_churn === 1 ? "alerte" : "pas d'alerte"}`);
    dessiner("g-jauge", g.data, g.layout);
  }
  const traces = [[prec, ui.CLAIR], [an, ui.FONCE]].map(([annee, couleur]) => {
    const parMois = new Array(12).fill(0);
    for (const r of f.vm) if (+r.mois.slice(0, 4) === annee) parMois[+r.mois.slice(5, 7) - 1] = r.ca_reconnu_ttc ?? 0;
    return {
      type: "scatter", x: [...Array(12).keys()].map((i) => i + 1), y: parMois, name: String(annee), mode: "lines",
      line: { color: couleur, width: 3 }, hovertemplate: `%{y:,.0f} TND<extra>${annee}</extra>`,
    };
  });
  dessiner("g-ca", traces, styler({
    xaxis: { tickmode: "array", tickvals: [...Array(12).keys()].map((i) => i + 1),
      ticktext: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"] },
  }, 260));
}

demarrer("client", afficher);
