/*
 * TuniShop - Plateforme vue 360 (version HTML)
 * Page Voix du client (maquette 07, v2), portage de pages/voix_client.py : text mining des avis (v1.4).
 * Filtres catégorie et année, bandeau « À retenir », 5 chiffres, volume par thème, langues et expressions derja
 * fréquentes, confrontation des thèmes aux faits (retards et retours réels) avec sa conclusion.
 * Chaque combinaison de filtres est calculée d'avance par scripts/exporter_web.py.
 *
 * Adresse : voix-du-client.html
 * Auteure : Sarra Abdeljaouad
 */
import { demarrer } from "../app.js";
import { voix } from "../donnees.js";
import { nombre, pct, vide } from "../format.js";
import * as ui from "../ui.js";

/** Moyenne d'une colonne pondérée par le nombre d'avis (lignes où la colonne est vide exclues). */
function tauxPondere(t, col) {
  const l = t.filter((r) => !vide(r[col]));
  const n = l.reduce((s, r) => s + r.avis, 0);
  return !l.length || n === 0 ? null : l.reduce((s, r) => s + r[col] * r.avis, 0) / n;
}

let V = null;

function contenu(cat, an) {
  const f = V.filtres[`${cat || ""}|${an || ""}`];
  const { res, themes, langues, ex } = f;
  const verif = V.verif;
  const h = [];

  // Conclusion de la confrontation aux faits (toutes catégories, toute la période)
  const neg = verif.filter((r) => r.polarite === "négatif");
  const liv = neg.filter((r) => r.theme === "Livraison");
  const rLiv = liv.length ? liv[0].part_colis_en_retard : null;
  const rNegAutres = tauxPondere(neg.filter((r) => r.theme !== "Livraison"), "part_colis_en_retard");
  const rPos = tauxPondere(verif.filter((r) => r.polarite === "positif"), "part_colis_en_retard");
  const suitLaNote = rLiv !== null && rNegAutres !== null && rLiv <= rNegAutres + 0.03;

  // 1. À retenir
  const partDerja = res.nb_commentes ? res.nb_derja / res.nb_commentes : null;
  const constats = [];
  if (partDerja !== null) constats.push(`<b>${pct(partDerja, 0)}</b> des commentaires en derja`);
  if (themes.length) constats.push(`Le thème « ${ui.e(themes[0].theme)} » domine (<b>${nombre(themes[0].mentions)}</b> mentions)`);
  if (rLiv !== null) {
    constats.push(suitLaNote ? "Le texte suit la <b>note</b>, pas l'événement vécu"
      : "Les plaintes de livraison reflètent de <b>vrais retards</b>");
  }
  h.push(ui.aRetenir(constats.length ? constats : ["Aucun avis commenté pour ce filtre"], null, "neutre"));

  // 2. Chiffres
  h.push(ui.rangeeKpi([
    ui.kpi("Avis", nombre(res.nb_avis), "", "commentés ou non"),
    ui.kpi("Avec commentaire", nombre(res.nb_commentes), "", res.nb_avis ? `${pct(res.nb_commentes / res.nb_avis, 0)} des avis` : ""),
    ui.kpi("En derja", nombre(res.nb_derja), "", partDerja !== null ? `${pct(partDerja, 0)} des commentaires` : ""),
    ui.kpi("Formulations distinctes", nombre(res.nb_formulations), "", "phrases différentes"),
    ui.kpi("Incohérences texte / note", nombre(res.nb_incoherents), "", "texte positif et note basse, ou l'inverse"),
  ], 5));

  // 3. Thèmes | langue
  let g = ui.titreCarte("Volume par thème", "un avis peut en avoir plusieurs · pbi.v_tm_avis_themes");
  g += !themes.length ? ui.legende("Aucun avis commenté.")
    : ui.barres(themes.slice(0, 8).map((r) => [r.theme, r.mentions, `${nombre(r.mentions)} · ${pct(r.negatives / r.mentions, 0)} nég.`]))
      + ui.legende("Nombre de mentions, puis part de mentions négatives.");
  let d = ui.titreCarte("Langue", "pbi.v_tm_avis");
  if (!langues.length) d += ui.legende("Aucun avis commenté.");
  else {
    const tot = langues.reduce((s, r) => s + r.avis, 0);
    const couleurs = { derja: "#5B8DB8" };
    const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1).toLowerCase() : x);
    d += '<div style="display:flex;border-radius:10px;overflow:hidden;color:#FFF;font-weight:600;font-size:.95rem">'
      + langues.map((r) => `<div style="width:${(100 * r.avis / tot).toFixed(1)}%;background:${couleurs[r.langue] || ui.CANARD};`
        + `padding:.55rem .8rem;white-space:nowrap">${ui.e(cap(String(r.langue)))} · ${nombre(r.avis)}</div>`).join("") + "</div>";
    if (ex.length) {
      const ton = { positif: "vert", "négatif": "rouge", neutre: "gris" };
      d += "<p style=\"margin:0\"><b>Expressions derja les plus fréquentes</b></p>"
        + ui.tableau([["Expression", ""], ["Sens", ""], ["Polarité", ""], ["Avis", "num"]], ex.map((r) =>
          [`<i>${ui.e(r.expression)}</i>`, ui.e(r.sens), ui.badge(ui.e(r.polarite), ton[r.polarite] || "gris"), nombre(r.avis)]));
    }
  }
  h.push(ui.colonnes([ui.carte(g), ui.carte(d)], [1.15, 1], { ecart: "medium" }));

  // 4. Le texte suit-il les faits ?
  let c = ui.titreCarte("Le texte suit-il les faits ?", "retards et retours réels · pbi.v_tm_verification_faits");
  if (rLiv !== null && rNegAutres !== null) {
    const debut = rPos !== null ? `<b>Conclusion.</b> Les avis négatifs ont plus de retards que les positifs `
      + `(${pct(rNegAutres)} contre ${pct(rPos)}). ` : "<b>Conclusion.</b> ";
    const txt = suitLaNote
      ? `${debut}Mais un avis qui <i>parle</i> de livraison n'en a pas plus qu'un autre avis négatif : `
        + `${pct(rLiv)} contre ${pct(rNegAutres)}. Le texte suit la note, pas l'événement vécu.`
      : `${debut}Et un avis qui parle de livraison en a nettement plus : ${pct(rLiv)} contre `
        + `${pct(rNegAutres)}. Les plaintes de livraison reflètent de vrais retards.`;
    c += ui.encadre(txt, true);
  }
  if (!verif.length) c += ui.legende("Confrontation non publiée.");
  else {
    const ton = { positif: "vert", "négatif": "rouge", neutre: "gris", toutes: "bleu" };
    const ordre = { "négatif": 0, neutre: 1, positif: 2, toutes: 3 };
    const v = verif.map((r, i) => ({ ...r, o: ordre[r.polarite] ?? 4, i }))
      .sort((x, y) => x.o - y.o || y.avis - x.avis || x.i - y.i);
    const motif = (r) => {
      if (vide(r.part_retour_motif_lie)) return "—";
      const codes = !vide(r.motifs_lies) ? String(r.motifs_lies).split(",").map((m) => m.trim().replaceAll("_", " ")).join(", ") : "";
      return pct(r.part_retour_motif_lie) + (codes ? `<br><span style="color:${ui.GRIS_CLAIR};font-size:.8rem">${ui.e(codes)}</span>` : "");
    };
    const gras = (r, texte) => (r.polarite === "toutes" || r.theme === "Livraison" ? `<b>${texte}</b>` : texte);
    c += ui.tableau([["Thème", ""], ["Polarité", ""], ["Avis", "num"], ["Colis en retard", "num"], ["Retour", "num"],
      ["Retour pour le motif lié", "num"]], v.map((r) => [gras(r, ui.e(r.theme)), ui.badge(ui.e(r.polarite), ton[r.polarite] || "gris"),
      nombre(r.avis), gras(r, pct(r.part_colis_en_retard)), pct(r.part_retour), motif(r)]))
      + ui.legende("Toutes catégories, toute la période : la confrontation n'est pas recalculée par filtre. "
        + "Retour pour le motif lié : par exemple, retour pour « taille inadaptée » quand l'avis parle de taille.");
  }
  h.push(ui.carte(c));
  return h.join("");
}

async function afficher(zone) {
  V = await voix();
  const options = (l) => l.map(([val, lib]) => `<option value="${ui.e(val)}">${ui.e(lib)}</option>`).join("");
  const filtres = ui.colonnes([
    `<select class="ts-champ" id="f-categorie" aria-label="Catégorie">${options([["", "Toutes les catégories"], ...V.categories.map((c) => [c, c])])}</select>`,
    `<select class="ts-champ" id="f-periode" aria-label="Période">${options([["", "Toute la période"], ...V.annees.map((a) => [String(a), String(a)])])}</select>`,
    "",
  ], [1.3, 1, 2]);
  zone.innerHTML = ui.enTete("Accueil › Voix du client", "Voix du client",
    { sousTitre: "Text mining des avis : thèmes, langue (français et derja en arabizi), polarité, confrontation aux faits." })
    + filtres + '<div class="ts-pile" id="voix-contenu"></div>';
  const cible = document.getElementById("voix-contenu");
  const fc = document.getElementById("f-categorie"), fp = document.getElementById("f-periode");
  const maj = () => { cible.innerHTML = contenu(fc.value || null, fp.value ? Number(fp.value) : null); };
  fc.addEventListener("change", maj);
  fp.addEventListener("change", maj);
  maj();
}

demarrer("voix-du-client", afficher);
