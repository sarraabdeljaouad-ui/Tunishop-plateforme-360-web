/*
 * TuniShop - Plateforme vue 360 (version HTML)
 * graphiques.js : graphiques Plotly, portage de ui.styler et ui.jauge, aux couleurs de la charte
 * (police, gris, grille et ordre des séries de tunishop-theme.css).
 * Auteure : Sarra Abdeljaouad
 */
import { SERIES } from "./format.js";
import { ORANGE, ROUGE, VERT } from "./ui.js";

const POLICE = "Inter, 'Segoe UI', system-ui, sans-serif";
const CONFIG = { displayModeBar: false, responsive: true };

/** Charge Plotly (une seule fois) : le fichier n'est téléchargé que par les pages qui ont des graphiques. */
let chargement = null;
function plotly() {
  if (window.Plotly) return Promise.resolve(window.Plotly);
  if (!chargement) {
    chargement = new Promise((ok, ko) => {
      const s = document.createElement("script");
      s.src = "assets/vendor/plotly-finance.min.js";
      s.onload = () => ok(window.Plotly);
      s.onerror = () => ko(new Error("Plotly n'a pas pu être chargé"));
      document.head.appendChild(s);
    });
  }
  return chargement;
}

/** ui.styler : mise en forme commune des graphiques. layout.xaxis et layout.yaxis complètent les axes. */
export function styler(layout = {}, hauteur = 300, legende = true) {
  return {
    ...layout,
    height: hauteur, margin: { l: 0, r: 0, t: 30, b: 0, pad: 6 }, plot_bgcolor: "#FFFFFF", paper_bgcolor: "#FFFFFF",
    font: { family: POLICE, color: "#5B6675", size: 12 }, separators: ", ", colorway: SERIES,
    showlegend: legende,
    legend: { orientation: "h", y: 1.08, x: 0, yanchor: "bottom", font: { size: 13, color: "#344054" } },
    bargap: 0.25, hoverlabel: { bgcolor: "#FFFFFF", bordercolor: "#E3E8EE", font: { family: POLICE, color: "#1F2A37" } },
    xaxis: { showgrid: false, linecolor: "#E3E8EE", ticks: "", automargin: true, ...(layout.xaxis || {}) },
    yaxis: { gridcolor: "#EEF1F4", zeroline: false, ticks: "", automargin: true, ...(layout.yaxis || {}) },
  };
}

/** ui.jauge : demi-jauge 0-100 %, rouge à partir de `rouge`, orange à partir de `orange`, vert en dessous. */
export function jauge(valeur, legende, { hauteur = 210, rouge = 0.6, orange = 0.3 } = {}) {
  const couleur = valeur >= rouge ? ROUGE : valeur >= orange ? ORANGE : VERT;
  const data = [{
    type: "indicator", mode: "gauge+number", value: 100 * valeur,
    number: { suffix: " %", valueformat: ".0f", font: { size: 40, color: "#1F2A37" } },
    domain: { x: [0, 1], y: [0.2, 1] },
    gauge: { shape: "angular", axis: { range: [0, 100], visible: false }, bar: { color: couleur, thickness: 0.32 },
      bgcolor: "#EEF1F5", borderwidth: 0 },
  }];
  const layout = {
    height: hauteur, margin: { l: 20, r: 20, t: 10, b: 0 }, paper_bgcolor: "#FFFFFF", font: { family: POLICE },
    separators: ", ",
    annotations: [{ text: legende, x: 0.5, y: 0, yanchor: "bottom", xref: "paper", yref: "paper",
      showarrow: false, font: { size: 13, color: "#5B6675" } }],
  };
  return { data, layout };
}

/** Dessine un graphique dans l'emplacement id (créé par ui.graphique). */
export async function dessiner(id, data, layout) {
  const P = await plotly();
  const div = document.getElementById(id);
  if (div) await P.newPlot(div, data, layout, CONFIG);
}
