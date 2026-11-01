# Emit per-chunk input files for enrichment agents.
import json, os

pools = json.load(open("data_raw/csv_pools.json", encoding="utf-8"))
PLAN = {"prea1": 4, "a1": 3, "a2": 4}
os.makedirs("tools/enrich-input", exist_ok=True)

manifest = {}
for level, nchunks in PLAN.items():
    items = pools[level]
    size = (len(items) + nchunks - 1) // nchunks
    for i in range(nchunks):
        chunk = items[i * size:(i + 1) * size]
        name = f"{level}-{i + 1}"
        entries = []
        for r in chunk:
            e = {"w": r["w"], "t": r["t"]}
            if "note" in r:
                e["note"] = r["note"]
            if "a" in r:
                e["a"] = r["a"]
            if "theme" in r:
                e["th"] = r["theme"]
            entries.append(e)
        path = f"tools/enrich-input/{name}.json"
        json.dump(entries, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        manifest[name] = {"level": level, "count": len(entries), "path": path}
        print(name, len(entries))

json.dump(manifest, open("tools/enrich-input/manifest.json", "w", encoding="utf-8"), indent=1)
