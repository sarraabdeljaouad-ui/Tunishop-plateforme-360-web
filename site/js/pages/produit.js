/*
 * TuniShop - Plateforme vue 360 (version HTML)
 * Fiche Produit (maquette 03, v2), portage de pages/produit.py : bandeau « À retenir », chiffres clés de l'année,
 * demande mensuelle prévue face au réel, projection du stock jour par jour sans réapprovisionnement (rupture,
 * date limite de commande, ventes perdues), catégories achetées ensemble, thèmes et exemples d'avis.
 * Les règles de calcul de regles.py (date_rupture, couverture_mois, projection_stock) sont portées ici.
 *
 * Adresse : produit.html?id=PRD0001
 * Auteure : Sarra Abdeljaouad
 */
import { demarrer } from "../app.js";
import { dateReference, ficheProduit, regles as donneesRegles } from "../donnees.js";
import { dateFr, ecartPoints, nombre, pct, tnd, tndCompact, variation, vide } from "../format.js";
import { dessiner, styler } from "../graphiques.js";
import { arrondiPython, couvertureMois, dateRupture, jjmm, projectionStock, versIso, versJour } from "../regles.js";
import * as ui from "../ui.js";

function enteteVide(zone, message, estErreur = false) {
  zone.innerHTML = ui.enTete("Accueil › Fiche produit", "Fiche produit")
    + (estErreur ? ui.erreur(message) : ui.info(message))
    + ui.lienPage("recherche", "Aller à la recherche");
}

async function afficher(zone) {
  const ident = (new URLSearchParams(location.search).get("id") || "").trim() || null;
  if (ident === null) return enteteVide(zone, "Choisis un produit depuis la recherche.");
  const [fp, refIso, toutesRegles] = await Promise.all([ficheProduit(ident), dateReference(), donneesRegles()]);
  if (!fp || !fp.i) return enteteVide(zone, `Aucun produit ne porte l'identifiant ${ident}.`, true);

  const p = fp.i, k = fp.k, dem = fp.dem, ref = versJour(refIso);
  document.title = `${p.nom_produit} · TuniShop · Vue 360`;
  const an = +refIso.slice(0, 4), prec = an - 1;
  const annees = new Map(fp.an.map((r) => [r.annee, r]));
  const a = annees.get(an) || null, pa = annees.get(prec) || null;
  const v = (serie, col) => (serie ? serie[col] : null);
  const rupture = dateRupture(dem);
  const h = [];

  // -------------------------------------------------------------------------
  // Calculs de la fiche : prévision, stock, fournisseur
  // -------------------------------------------------------------------------
  const annee = (iso) => +iso.slice(0, 4), mois = (iso) => +iso.slice(5, 7);
  const stockDep = dem.length ? dem[0].stock_depart : null;
  const t1 = dem.length ? dem.filter((r) => annee(r.mois) === an + 1 && mois(r.mois) <= 3)
    .reduce((s, r) => s + r.quantite_prevue, 0) : null;
  const couv = couvertureMois(stockDep, t1);
  const delai = !vide(p.delai_reel_moyen_j) ? p.delai_reel_moyen_j : null;
  const annonce = !vide(p.delai_annonce_j) ? p.delai_annonce_j : null;
  const lent = delai !== null && annonce !== null && arrondiPython(delai) > annonce;
  const limite = rupture !== null && delai !== null ? rupture - arrondiPython(delai) : null;
  const tropTard = limite !== null && limite <= ref;

  // -------------------------------------------------------------------------
  // 1. En-tête
  // -------------------------------------------------------------------------
  const pastilles = [ui.badge(`${ui.e(p.categorie)} › ${ui.e(p.sous_categorie)}`, "bleu"),
    ui.badge(tnd(p.prix_catalogue_ttc), "gris")];
  if (!vide(v(a, "taux_marge"))) pastilles.push(ui.badge(`Marge ${pct(a.taux_marge, 0)}`, "gris"));
  if (!vide(p.statut_produit) && String(p.statut_produit).toLowerCase() !== "actif") {
    pastilles.push(ui.badge(ui.e(p.statut_produit), "orange"));
  }
  const liens = [];
  if (!vide(p.fournisseur_id)) liens.push(ui.lienBouton(p.nom_fournisseur, "fournisseur", p.fournisseur_id));
  if (k) liens.push(`<a class="ts-lien-bouton" href="#avis-produit">↗ ${nombre(k.nb_avis)} avis</a>`);
  const identAffiche = ident + (!vide(p.sku) ? ` · SKU ${p.sku}` : "");
  h.push(ui.enTete("Accueil › Fiche produit", p.nom_produit, { ident: identAffiche, pastilles, liens }));

  // -------------------------------------------------------------------------
  // 2. À retenir
  // -------------------------------------------------------------------------
  const constats = [];
  if (dem.length) {
    const prevu = dem.filter((r) => annee(r.mois) === an + 1);
    const moisPrevus = prevu.map((r) => mois(r.mois));
    const reelMeme = fp.vm.filter((r) => annee(r.mois) === an && moisPrevus.includes(mois(r.mois)))
      .reduce((s, r) => s + r.quantite, 0);
    const tot = prevu.reduce((s, r) => s + r.quantite_prevue, 0);
    const periode = moisPrevus.length === 12 ? "" : ` sur ${moisPrevus.length} mois`;
    const vr = reelMeme ? variation(tot, reelMeme) : null;
    constats.push(`Demande ${an + 1} prévue${periode} ` + (vr ? `<b>${vr}</b> ` : "") + `(${nombre(tot)} u.)`);
    constats.push(rupture !== null
      ? `Stock de <b>${nombre(stockDep)} u.</b> : rupture vers le <b>${dateFr(versIso(rupture))}</b>`
      : `Stock de <b>${nombre(stockDep)} u.</b> : couvre toute la période prévue`);
  }
  if (lent) constats.push(`Fournisseur lent : <b>${nombre(delai)} j réels</b> pour ${nombre(annonce)} annoncés`);
  else if (couv !== null) constats.push(`Couverture de stock : <b>${nombre(couv, 1)} mois</b>`);
  let action = null, ton = "neutre";
  if (rupture === null) { action = null; ton = "neutre"; }
  else if (tropTard) { action = "commander dès maintenant"; ton = "rouge"; }
  else if (limite !== null) { action = `commander avant le ${dateFr(versIso(limite))}`; ton = "orange"; }
  else { action = "réapprovisionner avant la rupture"; ton = "orange"; }
  h.push(ui.aRetenir(constats.length ? constats : ["Pas de prévision de demande pour ce produit"], action, ton));

  // -------------------------------------------------------------------------
  // 3. Chiffres clés
  // -------------------------------------------------------------------------
  h.push(ui.section(`Chiffres clés ${an}`));
  const carte = (label, col, valeur, { bonSiHausse = true, points = false } = {}) => {
    const x = v(a, col), y = v(pa, col);
    const delta = vide(x) || vide(y) ? null : (points ? ecartPoints(x, y) : variation(x, y));
    return ui.kpi(label, valeur, ui.deltaHtml(delta, ui.sens(x, y), { bonSiHausse, suffixe: `vs ${prec}` }));
  };
  const na = v(a, "note_moyenne"), np = v(pa, "note_moyenne");
  const dn = vide(na) || vide(np) ? null : na - np;
  const noteCouv = couv === null ? "pas de prévision"
    : couv < 1 ? `<span style="color:${ui.ROUGE}">sous le seuil de 1 mois</span>` : `au rythme prévu du T1 ${an + 1}`;
  h.push(ui.rangeeKpi([
    carte("CA", "ca_ttc", tndCompact(v(a, "ca_ttc"))),
    carte("Unités vendues", "quantite_vendue", nombre(v(a, "quantite_vendue"))),
    carte("Marge brute HT", "marge_brute_ht", tndCompact(v(a, "marge_brute_ht"))),
    ui.kpi("Couverture de stock", couv === null ? "—" : `${nombre(couv, 1)} mois`, "", noteCouv),
    ui.kpi("Note moyenne", vide(na) ? "—" : `${nombre(na, 1)} / 5`,
      ui.deltaHtml(dn === null ? null : (dn >= 0 ? "+" : "-") + nombre(Math.abs(dn), 1),
        dn !== null ? ui.sens(dn, 0) : 0, { suffixe: `vs ${prec}` })),
    carte("Taux de retour", "taux_retour", pct(v(a, "taux_retour")), { bonSiHausse: false, points: true }),
  ], 6));
  if (!a) h.push(ui.info(`Aucune vente en ${an}.`));

  // -------------------------------------------------------------------------
  // 4. Prévision et stock
  // -------------------------------------------------------------------------
  h.push(ui.section("Prévision et stock"));
  const gauche = ui.titreCarte(`Demande mensuelle : prévu ${an + 1} et réel ${an}`, "pbi.v_ml_scores_demande · modèle v2")
    + ui.graphique("g-demande", 280)
    + ui.legende("Modèle de demande v2 (WAPE 47,5 %) : à lire comme un ordre de grandeur, pas au mois près.");

  const proj = projectionStock(dem);
  let droite = ui.titreCarte("Projection du stock sans réapprovisionnement", `à partir du 01/01/${an + 1}`);
  if (!proj.length) {
    droite += ui.legende("Pas de prévision de demande : pas de projection.");
  } else {
    droite += ui.graphique("g-stock", 280);
    const premiers = proj.slice(0, Math.min(31, proj.length));
    const parJour = premiers.reduce((s, x) => s + x.demande, 0) / premiers.length;
    let txt = `Demande prévue ≈ ${nombre(parJour, 1)} u./jour en janvier`;
    if (delai !== null) txt += ` · délai réel du fournisseur ${nombre(delai)} j` + (annonce ? ` (annoncé ${nombre(annonce)} j)` : "");
    if (tropTard) txt += ` · la commande aurait dû partir le ${dateFr(versIso(limite))}`;
    droite += ui.legende(`${txt}. Demande supposée régulière dans le mois.`);
  }
  h.push(ui.colonnes([ui.carte(gauche), ui.carte(droite)], [1.5, 1], { ecart: "medium" }));

  // -------------------------------------------------------------------------
  // 5. Ce que disent les clients et ce qu'ils achètent avec
  // -------------------------------------------------------------------------
  h.push(ui.section("Ce que disent les clients et ce qu'ils achètent avec"));
  const rg = toutesRegles.filter((r) => (r.niveau === "catégorie" && r.antecedents === p.categorie)
    || (r.niveau === "sous-catégorie" && r.antecedents === p.sous_categorie));
  let c1 = ui.titreCarte("Catégories achetées avec", "pbi.v_dm_regles · règles stables");
  c1 += !rg.length ? ui.legende(`Aucune règle stable sur 2025 pour « ${p.categorie} ».`)
    : ui.tableau([["Achetée avec", ""], ["Confiance", "num"], ["Lift", "num"]],
      rg.slice(0, 4).map((r) => [ui.e(r.consequents), pct(r.confidence_2025, 0), nombre(r.lift_2025, 2)]));
  c1 += ui.legende("Mesures 2025. Entre produits, les règles ne tiennent pas sur 2025 (notebook DM03) : "
    + "on montre les catégories.");

  const s = fp.sy;
  const nCom = s && !vide(s.nb_commentes) ? ` ${nombre(s.nb_commentes)}` : "";
  let c2 = ui.titreCarte(`Thèmes de ses${nCom} avis commentés`, "text mining");
  c2 += !fp.th.length ? ui.legende("Aucun avis commenté.")
    : ui.barres(fp.th.slice(0, 5).map((r) => [r.theme, r.nb_avis, nombre(r.nb_avis)]));
  if (s) {
    const nInc = Math.trunc(s.nb_incoherents || 0);
    c2 += ui.md([ui.badge(`Derja ${pct(s.part_derja, 0)}`, "bleu"),
      ui.badge(`${nInc} avis incohérent${nInc > 1 ? "s" : ""}`, nInc ? "orange" : "gris")].join(" "));
  }

  let c3 = '<a id="avis-produit"></a>' + ui.titreCarte("Exemples d'avis", "les plus récents");
  if (!fp.av.length) {
    c3 += ui.legende("Aucun avis commenté.");
  } else {
    const tonNote = (n) => (n <= 2 ? "rouge" : n === 3 ? "orange" : "vert");
    const texteAvis = (r) => {
      let t = `<i>« ${ui.e(r.texte_nettoye)} »</i>`;
      if (String(r.langue).toLowerCase() === "derja") t += ` ${ui.badge("derja", "bleu")}`;
      if (typeof r.coherence === "string" && !["cohérent", "non évaluable"].includes(r.coherence)) {
        t += ` ${ui.badge("incohérent", "orange")}`;
      }
      return `${t}<br><span style="color:${ui.GRIS_CLAIR};font-size:.8rem">${dateFr(r.date_avis)}</span>`;
    };
    c3 += ui.tableau([["Avis", ""], ["Note", "num"]], fp.av.map((r) =>
      [texteAvis(r), vide(r.note) ? "—" : ui.badge(nombre(r.note), tonNote(r.note))]));
  }
  if (k) {
    c3 += ui.legende(`Depuis le début : ${nombre(k.quantite_vendue)} unités vendues à ${nombre(k.nb_clients)} clients, `
      + `${nombre(k.nb_avis)} avis (commentés ou non).`);
  }
  h.push(ui.colonnes([ui.carte(c1), ui.carte(c2), ui.carte(c3)], [1, 1.05, 1.25], { ecart: "medium" }));

  zone.innerHTML = h.join("");

  // -------------------------------------------------------------------------
  // Graphiques
  // -------------------------------------------------------------------------
  const douze = [...Array(12).keys()].map((i) => i + 1);
  const reel = new Array(12).fill(0);
  for (const r of fp.vm) if (annee(r.mois) === an) reel[mois(r.mois) - 1] = r.quantite ?? 0;
  const traces = [{ type: "scatter", x: douze, y: reel, name: `Réel ${an}`, mode: "lines",
    line: { color: ui.CLAIR, width: 3 }, hovertemplate: `%{y:,.0f} u.<extra>${an}</extra>` }];
  if (dem.length) {
    const dp = dem.filter((r) => annee(r.mois) === an + 1);
    traces.push({ type: "scatter", x: dp.map((r) => mois(r.mois)), y: dp.map((r) => r.quantite_prevue),
      name: `Prévu ${an + 1}`, mode: "lines", line: { color: ui.FONCE, width: 3, dash: "dash" },
      hovertemplate: `%{y:,.0f} u.<extra>${an + 1}</extra>` });
  }
  dessiner("g-demande", traces, styler({
    xaxis: { tickmode: "array", tickvals: douze, range: [0.7, 12.3],
      ticktext: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"] },
    yaxis: { rangemode: "tozero" },
  }, 280));

  if (proj.length) {
    const jours = proj.map((x) => versIso(x.jour));
    const dernier = jours.at(-1);
    const shapes = [], annotations = [];
    if (rupture !== null) {
      const rIso = versIso(rupture);
      shapes.push({ type: "rect", xref: "x", yref: "paper", x0: rIso, x1: dernier, y0: 0, y1: 1,
        fillcolor: "rgba(180,35,24,0.06)", line: { width: 0 }, layer: "below" });
      shapes.push({ type: "line", xref: "x", yref: "paper", x0: rIso, x1: rIso, y0: 0, y1: 1,
        line: { color: ui.ROUGE, dash: "dash", width: 1.5 } });
      annotations.push({ x: rIso, y: 1.06, yref: "paper", text: `Rupture le ${jjmm(rIso)}`, showarrow: false,
        font: { color: ui.ROUGE, size: 12 }, xanchor: "left" });
      const perdues = proj.filter((x) => x.jour >= rupture).reduce((s2, x) => s2 + x.perdu, 0);
      annotations.push({ x: dernier, y: Math.max(stockDep, 1) * 0.25, xanchor: "right", showarrow: false,
        text: `≈ ${nombre(perdues)} ventes perdues<br>jusqu'au ${jjmm(dernier)}`, font: { color: ui.ROUGE, size: 12 } });
    }
    if (limite !== null && limite >= proj[0].jour) {
      const lIso = versIso(limite);
      shapes.push({ type: "line", xref: "x", yref: "paper", x0: lIso, x1: lIso, y0: 0, y1: 1,
        line: { color: ui.ORANGE, dash: "dash", width: 1.5 } });
      annotations.push({ x: lIso, y: 0.94, yref: "paper", text: `Commander le ${jjmm(lIso)}`, showarrow: false,
        font: { color: ui.ORANGE, size: 12 }, xanchor: "left" });
    }
    dessiner("g-stock", [{ type: "scatter", x: jours, y: proj.map((x) => x.stock), mode: "lines", name: "Stock projeté (u.)",
      line: { color: ui.ROUGE, width: 3 }, fill: "tozeroy", fillcolor: "rgba(180,35,24,0.07)",
      hovertemplate: "%{x|%d/%m} · %{y:,.0f} u.<extra></extra>" }],
    styler({ shapes, annotations, xaxis: { tickformat: "%d/%m" }, yaxis: { rangemode: "tozero" } }, 280, false));
  }
}

demarrer("produit", afficher);
