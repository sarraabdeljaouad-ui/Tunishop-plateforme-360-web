"""
Vérifie que site/js/format.js donne exactement les mêmes textes que src/format.py (plateforme Streamlit)
sur 3 000 valeurs, cas d'arrondi difficiles compris.
Lancer : python tests/test_format_js.py --streamlit ..\\tunishop-vue360   (Node.js requis)
"""
import argparse, json, random, subprocess, sys, tempfile
from pathlib import Path
RACINE = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser(); ap.add_argument("--streamlit", required=True, type=Path); a = ap.parse_args()
sys.path.insert(0, str(a.streamlit))
from src import format as F
random.seed(3)
xs = [0, 0.5, 1.5, 2.5, -0.5, 0.125, 0.375, -0.4, 1234.5, 89.45, 89.55, 99.95, 1e6 + 0.125, 0.1 + 0.2, 7130000, 845000]
xs += [round(random.uniform(-1e5, 1e7), random.choice([0, 1, 2, 3])) for _ in range(1500)]
xs += [random.random() for _ in range(1500)]
paires = [(random.choice(xs), random.choice(xs)) for _ in range(300)]
attendu = {"nombre": [[F.nombre(x, d) for d in (0, 1, 2)] for x in xs], "pct": [F.pct(x) for x in xs],
           "tnd_compact": [F.tnd_compact(x) for x in xs], "variation": [F.variation(x, y) for x, y in paires],
           "ecart": [F.ecart_points(x, y) for x, y in paires]}
js = f"""import * as F from {json.dumps((RACINE / 'site/js/format.js').as_uri())};
import {{ readFileSync }} from "node:fs";
const [xs, paires] = JSON.parse(readFileSync(process.argv[2], "utf8"));
console.log(JSON.stringify({{nombre: xs.map(x => [0,1,2].map(d => F.nombre(x, d))), pct: xs.map(x => F.pct(x)),
  tnd_compact: xs.map(x => F.tndCompact(x)), variation: paires.map(([x,y]) => F.variation(x,y)),
  ecart: paires.map(([x,y]) => F.ecartPoints(x,y))}}));"""
with tempfile.TemporaryDirectory() as d:
    Path(d, "t.mjs").write_text(js, encoding="utf-8"); Path(d, "v.json").write_text(json.dumps([xs, paires]))
    obtenu = json.loads(subprocess.run(["node", str(Path(d, "t.mjs")), str(Path(d, "v.json"))], capture_output=True,
                                       text=True, encoding="utf-8", check=True).stdout)
ecarts = sum(1 for k in attendu for u, v in zip(attendu[k], obtenu[k]) if u != v)
for k in attendu:
    for i, (u, v) in enumerate(zip(attendu[k], obtenu[k])):
        if u != v and ecarts < 50: print(f"ÉCART {k} : py {u!r} js {v!r}")
print(f"{len(xs)} valeurs, {len(paires)} paires : {ecarts} écart(s).")
sys.exit(1 if ecarts else 0)
