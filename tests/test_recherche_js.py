"""
Vérifie que la recherche JavaScript (site/js/recherche.js) donne exactement les mêmes résultats que
src/recherche.py de la plateforme Streamlit : mêmes entités, même ordre, mêmes scores, même suggestion,
même surlignage.

Lancer : python tests/test_recherche_js.py --streamlit ..\\tunishop-vue360
"""
import argparse, json, random, subprocess, sys, tempfile
from pathlib import Path
import pandas as pd
from rapidfuzz import fuzz

RACINE = Path(__file__).resolve().parents[1]

SAISIES = ["carthgo", "riadh belhaj", "nexra", "nexra evasion", "lahmar kelibia", "zitouna", "cafe turc",
           "CLI004074", "cli004761", "PRD0094", "TS-03-00094", "FRN002", "frn035", "CMD0047890",
           "smartphone", "blender carthago", "aspirateur", "sahel", "tunis", "ben salah", "pomme",
           "robot patissier", "fer a repasser", "machine cafe", "kélibia", "sfax", "a", "zz", "xyz123",
           "mohamed ben ali", "société", "sarl", "bouilloire pro", "écouteurs", "montre", "nike", "medina",
           "hamza trabelsi sousse", "olfa abidi", "chaima", "téléviseur 55", "frigo", "climatiseur inverter"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--streamlit", required=True, type=Path)
    a = ap.parse_args()
    sys.path.insert(0, str(a.streamlit))
    from src import recherche as P          # module Python de la plateforme Streamlit

    donnees = json.loads((RACINE / "site/data/recherche.json").read_text(encoding="utf-8"))
    vue = pd.DataFrame(donnees["index"]["l"], columns=donnees["index"]["c"])
    index = P.index_depuis_vue(vue)
    vocab = P.vocabulaire(index)

    # saisies supplémentaires : libellés réels abîmés (lettre retirée, doublée ou échangée)
    random.seed(7)
    libelles = vue["libelle"].dropna().tolist()
    for lib in random.sample(libelles, 60):
        mots = lib.split()[:2]
        q = " ".join(mots)
        if len(q) > 4:
            i = random.randrange(1, len(q) - 1)
            q = random.choice([q[:i] + q[i + 1:], q[:i] + q[i] + q[i:], q[:i - 1] + q[i] + q[i - 1] + q[i + 1:]])
        SAISIES.append(q)
    paires = [(P.normaliser(random.choice(libelles)), P.normaliser(random.choice(libelles))) for _ in range(400)]
    paires += [("riadh belhaj", "riadh belhadj tabarka"), ("a b", "a b"), ("", "x"), ("nexra", "smartphone nexora")]

    with tempfile.TemporaryDirectory() as d:
        fs = Path(d) / "saisies.json"
        fs.write_text(json.dumps(SAISIES, ensure_ascii=False), encoding="utf-8")
        Path(d, "saisies_paires.json").write_text(json.dumps(paires), encoding="utf-8")
        out = subprocess.run(["node", str(RACINE / "tests/comparer_recherche.mjs"),
                              str(RACINE / "site/data/recherche.json"), str(fs)],
                             capture_output=True, text=True, encoding="utf-8", check=True).stdout
    js = json.loads(out)

    ecarts = 0
    for (x, y), (r, so, se) in zip(paires, js["_paires"]):
        attendu = (fuzz.ratio(x, y), fuzz.token_sort_ratio(x, y), fuzz.token_set_ratio(x, y))
        if any(abs(u - v) > 1e-9 for u, v in zip(attendu, (r, so, se))):
            ecarts += 1
            print("ÉCART score", x, "|", y, attendu, (r, so, se))
    for q in SAISIES:
        res = P.rechercher(q, index, limite=20)
        attendu = [[t, i, float(s)] for t, i, s in zip(res["type"], res["id"], res["score"])]
        j = js[q]
        if attendu != j["res"]:
            ecarts += 1
            print(f"ÉCART résultats « {q} »\n  py {attendu[:6]}\n  js {j['res'][:6]}")
        if P.suggestion(q, vocab) != j["sugg"]:
            ecarts += 1
            print(f"ÉCART suggestion « {q} » : py {P.suggestion(q, vocab)!r} js {j['sugg']!r}")
        surl = [P.surligner(l, q) for l in res["libelle"].head(3)]
        if surl != j["surl"]:
            ecarts += 1
            print(f"ÉCART surlignage « {q} » : py {surl} js {j['surl']}")
        if P.normaliser(q) != j["norm"]:
            ecarts += 1
            print(f"ÉCART normalisation « {q} »")
    print(f"{len(SAISIES)} saisies, {len(paires)} paires de scores, {ecarts} écart(s). "
          f"Temps JS moyen : {js['_ms_par_recherche']:.0f} ms par recherche.")
    sys.exit(1 if ecarts else 0)


if __name__ == "__main__":
    main()
