# Build level pools from the ozbonus YLE CSV dataset, cross-check with PDF parse.
import csv, json, re

rows = list(csv.DictReader(open("data_raw/yle-vocabulary-dataset.csv", encoding="utf-8")))
print("csv rows:", len(rows))

POS_COLS = [("adjective", "adjective"), ("adverb", "adverb"), ("conjunction", "conjunction"),
            ("determiner", "determiner"), ("discourse_marker", "expression"), ("exclamation", "exclamation"),
            ("interrogative", "question word"), ("noun", "noun"), ("possessive", "possessive"),
            ("preposition", "preposition"), ("pronoun", "pronoun"), ("title", "title"), ("verb", "verb")]

def truthy(v):
    return str(v).strip().upper() == "TRUE"

def clean_word(raw):
    """Split 'catch (a ball)' -> ('catch', 'a ball'); keep interior context in parens only at end."""
    s = raw.strip()
    note = ""
    m = re.search(r"\s*\(([^)]*)\)\s*$", s)
    if m:
        note = m.group(1).strip()
        s = s[: m.start()].strip()
    return s, note

pools = {"prea1": [], "a1": [], "a2": []}
skipped = []
for r in rows:
    brit = r["british"].strip()
    amer = r["american"].strip()
    if not brit:
        skipped.append(r)
        continue
    w, note = clean_word(brit)
    if not w:
        skipped.append(r)
        continue
    pos = [label for col, label in POS_COLS if truthy(r.get(col, ""))]
    if not pos:
        pos = ["expression"]
    rec = {"w": w, "t": " + ".join(pos)}
    if note:
        rec["note"] = note
    alts = []
    aw, _ = clean_word(amer)
    if aw and aw.lower() != w.lower():
        alts.append(aw)
    ip = r.get("irregular_plural", "").strip()
    if ip:
        alts.append(ip)
    if alts:
        rec["a"] = sorted(set(alts))
    themes = [c for c in r if c not in ("british", "american", "irregular_plural")
              and not any(c == col for col, _ in POS_COLS)
              and c not in ("starters", "movers", "flyers") and truthy(r[c])]
    if themes:
        rec["theme"] = themes[0]
    if truthy(r["starters"]):
        pools["prea1"].append(rec)
    elif truthy(r["movers"]):
        pools["a1"].append(rec)
    elif truthy(r["flyers"]):
        pools["a2"].append(rec)
    else:
        skipped.append(r)

for k in pools:
    seen, uniq = set(), []
    for r in pools[k]:
        lk = r["w"].lower()
        if lk not in seen:
            seen.add(lk)
            uniq.append(r)
    pools[k] = sorted(uniq, key=lambda r: r["w"].lower())
    print(k, len(uniq))

json.dump(pools, open("data_raw/csv_pools.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# cross-check vs PDF parse
pdf = json.load(open("data_raw/parsed_lists.json", encoding="utf-8"))
norm = lambda s: re.sub(r"[^a-z0-9']", "", s.lower())
for k in ("prea1", "a1", "a2"):
    csv_set = {norm(r["w"]) for r in pools[k]}
    pdf_set = {norm(r["w"]) for r in pdf[k]}
    only_csv = sorted(csv_set - pdf_set)
    only_pdf = sorted(pdf_set - csv_set)
    print(f"\n[{k}] csv={len(csv_set)} pdf={len(pdf_set)} | only-csv({len(only_csv)}): {only_csv[:25]}")
    print(f"[{k}] only-pdf({len(only_pdf)}): {only_pdf[:25]}")
print("\nskipped rows:", len(skipped))
