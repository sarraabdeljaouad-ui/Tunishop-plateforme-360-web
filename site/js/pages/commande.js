/*
 * TuniShop - Plateforme vue 360 (version HTML)
 * Fiche Commande (maquette 05, v2), portage de pages/commande.py : bandeau « À retenir », suivi en étapes
 * (passée, payée, expédiée, livrée), 5 chiffres, lignes avec leur retour, avis laissé confronté aux faits,
 * risque de retard prédit à l'expédition et taux de retard réels du trajet (transporteur, région, jour).
 *
 * Adresse : commande.html?id=CMD0047890
 * Auteure : Sarra Abdeljaouad
 */
import { demarrer } from "../app.js";
import { ficheCommande, retard as donneesRetard } from "../donnees.js";
import { dateFr, nombre, pct, tnd, vide } from "../format.js";
import { dessiner, jauge } from "../graphiques.js";
import * as ui from "../ui.js";

const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

/** Jour de la semaine d'une date ISO, lundi = 0 (comme pandas weekday). */
const jourSemaine = (iso) => (new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay() + 6) % 7;
const pluriel = (n, s = "s") => (n > 1 ? s : "");

function enteteVide(zone, message, estErreur = false) {
  zone.innerHTML = ui.enTete("Accueil › Fiche commande", "Fiche commande")
    + (estErreur ? ui.erreur(message) : ui.info(message))
    + ui.lienPage("recherche", "Aller à la recherche");
}

async function afficher(zone) {
  const ident = (new URLSearchParams(location.search).get("id") || "").trim() || null;
  if (ident === null) return enteteVide(zone, "Saisis un numéro de commande (CMD…) dans la recherche.");
  const [fc, rt] = await Promise.all([ficheCommande(ident), donneesRetard()]);
  if (!fc || !fc.f) return enteteVide(zone, `Aucune commande ne porte le numéro ${ident}.`, true);
  document.title = `Commande ${ident} · TuniShop · Vue 360`;

  const c = fc.f, lignes = fc.l, avis = fc.av, pr = fc.pr, seuil = rt.seuil;
  const annulee = !vide(c.date_annulation) || String(c.statut_commande).toLowerCase().startsWith("annul");
  const livree = !vide(c.est_livree) && Number(c.est_livree) === 1;
  const retard = livree && !vide(c.retard_j) && c.retard_j > 0 ? Math.trunc(c.retard_j) : 0;
  const nbRetour = lignes.reduce((s, r) => s + (r.quantite_retournee ?? 0), 0);
  const alerte = pr !== null && seuil !== null && pr.proba_retard >= seuil;
  const h = [];

  // -------------------------------------------------------------------------
  // 1. En-tête
  // -------------------------------------------------------------------------
  const pastilles = [ui.badge(dateFr(c.date_commande), "gris")];
  if (!vide(c.libelle_mode_paiement)) pastilles.push(ui.badge(ui.e(c.libelle_mode_paiement), "gris"));
  if (!vide(c.gouvernorat)) pastilles.push(ui.badge(ui.e(c.gouvernorat), "bleu"));
  if (!vide(c.libelle_canal)) pastilles.push(ui.badge(ui.e(c.libelle_canal), "gris"));
  pastilles.push(ui.badge(ui.e(c.libelle_statut), annulee ? "orange" : "gris"));
  const liens = [];
  if (!vide(c.client_id)) {
    const nom = vide(c.client) || !String(c.client).trim() ? "—" : c.client;
    liens.push(ui.lienBouton(`Client ${nom}`, "client", c.client_id));
  }
  if (!vide(c.transporteur)) liens.push(ui.lienBouton(c.transporteur, "transporteur", c.transporteur));
  h.push(ui.enTete("Accueil › Fiche commande", `Commande ${ident}`, { pastilles, liens }));

  // -------------------------------------------------------------------------
  // 2. À retenir
  // -------------------------------------------------------------------------
  const constats = [];
  let action = null;
  if (annulee) {
    constats.push(`Commande <b>annulée</b> le ${dateFr(c.date_annulation)}`);
  } else if (livree) {
    constats.push(retard ? `Livrée avec <b>${retard} jour${pluriel(retard)} de retard</b>` : "Livrée <b>à temps</b>");
  } else if (!vide(c.statut_livraison)) {
    constats.push(`Colis <b>${ui.e(String(c.statut_livraison).replaceAll("_", " "))}</b>, prévu le ${dateFr(c.date_prevue)}`);
  }
  if (pr !== null) {
    const p100 = pct(pr.proba_retard, 0);
    if (pr.source === "test") {
      if (alerte && retard) constats.push(`Le modèle l'avait <b>prédit</b> à l'expédition (${p100})`);
      else if (alerte) constats.push(`Le modèle prévoyait un retard (${p100}) : <b>fausse alerte</b>`);
      else if (retard) constats.push(`Le modèle <b>ne l'avait pas vu</b> (${p100}, seuil ${pct(seuil, 0)})`);
    } else if (alerte) {
      constats.push(`Risque de retard prédit : <b>${p100}</b>`);
      action = "prévenir le client";
    }
  }
  if (nbRetour) {
    const motifs = [...new Set(lignes.filter((r) => r.quantite_retournee > 0 && !vide(r.motif_retour))
      .map((r) => String(r.motif_retour).toLowerCase()))].sort().join(", ");
    constats.push(`${nbRetour} article${pluriel(nbRetour)} <b>retourné${pluriel(nbRetour)}</b>`
      + (motifs ? ` (${ui.e(motifs)})` : ""));
  }
  const livNeg = avis.filter((a) => String(a.themes ?? "").includes("Livraison") && a.polarite_globale === "négatif");
  if (livNeg.length) {
    constats.push(`Avis ${nombre(livNeg[0].note)}/5 sur la livraison, `
      + (retard ? "<b>confirmé par les faits</b>" : "<b>non confirmé</b> : livrée à temps"));
  }
  const ton = retard || (alerte && !livree && !annulee) ? "rouge" : nbRetour || annulee ? "orange" : "neutre";
  const trois = constats.slice(0, 3);
  h.push(ui.aRetenir(trois.length ? trois : ["Commande sans incident"], action, ton));

  // -------------------------------------------------------------------------
  // 3. Suivi
  // -------------------------------------------------------------------------
  const etapes = [["Passée", dateFr(c.date_commande), "ok"]];
  if (!vide(c.date_paiement)) etapes.push(["Payée", dateFr(c.date_paiement), "ok"]);
  else if (String(c.libelle_mode_paiement).toLowerCase().includes("livraison")) {
    etapes.push(["Payée", "à la livraison", livree ? "ok" : "attente"]);
  } else etapes.push(["Payée", "non payée", annulee ? "annule" : "attente"]);
  if (annulee) {
    etapes.push(["Annulée", dateFr(c.date_annulation), "annule"]);
  } else {
    const exp = dateFr(c.date_expedition) + (!vide(c.transporteur) ? ` · ${c.transporteur}` : "");
    etapes.push(["Expédiée", !vide(c.date_expedition) ? exp : "à venir", !vide(c.date_expedition) ? "ok" : "attente"]);
    const prevu = !vide(c.date_prevue) ? ` · prévu ${dateFr(c.date_prevue)}` : "";
    if (livree) etapes.push(["Livrée", dateFr(c.date_livraison_colis) + prevu, retard ? "ko" : "ok"]);
    else if (String(c.statut_livraison).toLowerCase().startsWith("echec")) etapes.push(["Livraison", `en échec${prevu}`, "ko"]);
    else etapes.push(["Livrée", `à venir${prevu}`, "attente"]);
  }
  h.push(ui.carte(ui.titreCarte("Suivi") + ui.suivi(etapes)));

  // -------------------------------------------------------------------------
  // 4. Chiffres
  // -------------------------------------------------------------------------
  const delai = c.delai_livraison_j, rembourse = c.montant_rembourse_ttc;
  h.push(ui.rangeeKpi([
    ui.kpi("Montant TTC", tnd(c.montant_total_ttc), "",
      c.remise_coupon_ttc && c.remise_coupon_ttc > 0 ? `dont remise ${tnd(c.remise_coupon_ttc)}` : ""),
    ui.kpi("Articles", nombre(c.nb_articles), "", `${nombre(c.nb_lignes)} produit(s)`),
    ui.kpi("Frais de livraison", tnd(c.frais_livraison_ttc)),
    ui.kpi("Délai réel", vide(delai) || !livree ? "—" : `${nombre(delai)} j`,
      retard ? ui.deltaHtml(`+${retard} j`, 1, { bonSiHausse: false, suffixe: "vs prévu" })
        : (livree ? ui.deltaHtml("à temps", 0, { suffixe: "" }) : "")),
    ui.kpi("Retour / remboursement",
      nbRetour ? `${nbRetour} article${pluriel(nbRetour)}` : (rembourse ? tnd(rembourse) : "Aucun"), "",
      nbRetour && rembourse ? `${tnd(rembourse)} remboursés` : rembourse ? "remboursés, sans article retourné" : ""),
  ], 5));

  // -------------------------------------------------------------------------
  // 5. Lignes et avis | risque de retard prédit
  // -------------------------------------------------------------------------
  const statut = (r) => {
    if (r.quantite_retournee > 0) {
      const motif = !vide(r.motif_retour) ? ` · ${ui.e(String(r.motif_retour).toLowerCase())}` : "";
      return ui.badge(`Retourné${motif}`, "rouge");
    }
    if (annulee) return ui.badge("Annulé", "gris");
    return livree ? ui.badge("Livré", "vert") : ui.badge("En cours", "orange");
  };
  let gauche = ui.titreCarte("Lignes", "clic → fiche produit")
    + ui.tableau([["Produit", ""], ["Qté", "num"], ["Prix unit.", "num"], ["Total", "num"], ["Statut", ""]],
      lignes.map((r) => [ui.lien(r.nom_produit, "produit", r.id), nombre(r.quantite), tnd(r.prix_unitaire_ttc),
        tnd(r.montant_ttc), statut(r)]));
  if (avis.length) {
    gauche += `<p style="margin:0"><b>Avis laissé${pluriel(avis.length)}</b></p>`;
    for (const a of avis) {
      const theme = !vide(a.themes) ? String(a.themes).split(";")[0] : "—";
      let txt = `<i>« ${ui.e(a.texte_nettoye)} »</i> · ${nombre(a.note)}/5 · thème ${ui.e(theme)}`;
      if (String(a.langue).toLowerCase() === "derja") txt += ` ${ui.badge("derja", "bleu")}`;
      if (String(a.themes).includes("Livraison") && a.polarite_globale === "négatif") {
        txt += ` ${retard ? ui.badge(`confirmé : retard mesuré ${retard} j`, "vert")
          : livree ? ui.badge("non confirmé : livrée à temps", "orange") : ""}`;
      }
      gauche += ui.encadre(txt);
    }
  }

  let droite = ui.titreCarte("Risque de retard prédit", "pbi.v_ml_retard · pbi.v_ml_scores_retard");
  let quand = null;
  if (pr === null) {
    droite += ui.legende("Pas de prédiction pour cette livraison : le modèle note les expéditions de 2025 "
      + "et les colis en transit.");
  } else {
    quand = pr.source === "test" ? `Prédit à l'expédition du ${dateFr(pr.date_expedition)}`
      : `Colis en transit · scoré le ${dateFr(pr.date_scoring)}`;
    droite += ui.graphique("g-retard", 210);
    if (pr.source === "test" && !vide(pr.retard_reel)) {
      const juste = Boolean(alerte) === Boolean(pr.retard_reel);
      droite += ui.md(ui.badge(juste ? "✓ Prédiction juste" : "✕ Prédiction fausse", juste ? "vert" : "rouge"));
    }
    droite += ui.legende(`Alerte au-delà de ${pct(seuil, 0)} : seuil du modèle retenu (régression logistique), `
      + "choisi sur la validation.");
  }

  // Ce qu'on sait du trajet : taux de retard réels de l'année d'expédition
  if (!vide(c.date_expedition)) {
    const anExp = +c.date_expedition.slice(0, 4);
    const fx = rt.facteurs.filter((r) => r.annee === anExp);
    const jour = JOURS[jourSemaine(c.date_expedition)];
    const taux = (facteur, valeur) => {
      const t = fx.find((r) => r.facteur === facteur && String(r.valeur).toLowerCase() === String(valeur).toLowerCase());
      return t ? t.taux : null;
    };
    const moy = taux("ensemble", "toutes");
    const lignesF = [[`Transporteur ${c.transporteur}`, taux("transporteur", c.transporteur)],
      [`Région ${c.region}`, taux("region", c.region)], [`Expédié un ${jour}`, taux("jour", jour)]]
      .filter(([, t]) => t !== null);
    if (lignesF.length && moy !== null) {
      const m = Math.max(...lignesF.map(([, t]) => t), moy) * 1.15;
      droite += "<p style=\"margin:0\"><b>Ce qu'on sait de ce trajet</b></p>"
        + ui.barres([...lignesF.map(([l, t]) => [l, t, pct(t, 0)]), [`Moyenne ${anExp}`, moy, pct(moy, 0)]], m)
        + ui.legende(`Taux de retard réels des livraisons ${anExp}. Ce ne sont pas les poids du modèle.`);
    }
  }
  h.push(ui.colonnes([ui.carte(gauche), ui.carte(droite)], [1.6, 1], { ecart: "medium" }));

  zone.innerHTML = h.join("");

  if (pr !== null) {
    const s = seuil !== null ? seuil : 0.5;
    const g = jauge(pr.proba_retard, quand, { rouge: s, orange: s });
    dessiner("g-retard", g.data, g.layout);
  }
}

demarrer("commande", afficher);
