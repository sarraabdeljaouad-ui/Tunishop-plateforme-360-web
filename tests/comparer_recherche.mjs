// Exécute la recherche JS sur une liste de saisies et écrit les résultats en JSON (lu par test_recherche_js.py).
import { readFileSync } from "node:fs";
import * as R from "../site/js/recherche.js";
const [, , fichierDonnees, fichierSaisies] = process.argv;
const donnees = JSON.parse(readFileSync(fichierDonnees, "utf8"));
const saisies = JSON.parse(readFileSync(fichierSaisies, "utf8"));
const index = R.construireIndex(donnees.index);
const vocab = R.vocabulaire(index);
const sortie = {};
const t0 = performance.now();
for (const q of saisies) {
  sortie[q] = {
    res: R.rechercher(q, index, { limite: 20 }).map((r) => [r.type, r.id, r.score]),
    sugg: R.suggestion(q, vocab),
    surl: R.rechercher(q, index, { limite: 3 }).map((r) => R.surligner(r.libelle, q)),
    norm: R.normaliser(q),
  };
}
sortie._ms_par_recherche = (performance.now() - t0) / saisies.length / 2;
// scores bruts sur des paires difficiles
const paires = JSON.parse(readFileSync(fichierSaisies.replace(".json", "_paires.json"), "utf8"));
sortie._paires = paires.map(([a, b]) => [R.ratio(a, b), R.tokenSortRatio(a, b), R.tokenSetRatio(a, b)]);
console.log(JSON.stringify(sortie));
