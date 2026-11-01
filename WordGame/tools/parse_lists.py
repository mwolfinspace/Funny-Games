# Parse the three A-Z wordlist sections (layout-mode text, multi-column table).
import re, json

raw = open("data_raw/flyers_layout.txt", encoding="utf-8").read()
raw = re.sub(r"===== PAGE \d+ =====", "", raw)
raw = raw.replace("\u2019", "'").replace("\u2018", "'")
lines = [l.rstrip() for l in raw.split("\n")]

hdr = re.compile(r"^\d*\s*(Pre A1 Starters|A1 Movers|A2 Flyers)\s+A[-–—]Z\s+wordlist\s*$")
end_hdr = re.compile(r"alphabetic vocabulary list|Combined lists|grammatical vocabulary list|thematic vocabulary list|Contents")

CODES = r"(?:adj|adv|n|v|prep|conj|det|pron|excl|num|dis|int|poss)"
POS_TAIL = rf"(?:{CODES}(?: of (?:place|time))?)(?:(?:\s*\+\s*|\s+){CODES})*"
entry_end = re.compile(rf"{POS_TAIL}$")
key_line = re.compile(r"^(?:adj|adv|conj|det|dis|excl|int|n|num|poss|prep|pron|v)\s+(?:adjective|adverb|conjunction|determiner|discourse marker|exclamation|interrogative|noun|number|possessive|preposition|pronoun|verb)\s*$")
token_split = re.compile(r"\s{2,}")

sections = {"prea1": [], "a1": [], "a2": []}
cur, done, in_key = None, False, False
bufs = {}

def try_emit(col):
    b = bufs.get(col, "").strip()
    if not b:
        return
    if entry_end.search(b):
        sections[cur].append(b)
        bufs[col] = ""
    else:
        bufs[col] = b

for s in lines:
    m = hdr.match(s.strip())
    if m:
        name = m.group(1)
        cur = {"Pre A1 Starters": "prea1", "A1 Movers": "a1", "A2 Flyers": "a2"}[name]
        done, in_key = False, False
        bufs = {}
        continue
    if cur is None:
        continue
    if end_hdr.search(s):
        for c in list(bufs):
            if bufs[c].strip():
                sections[cur].append(bufs[c].strip())
            bufs[c] = ""
        cur = None
        continue
    st = s.strip()
    # drop footer title repeats anywhere inside the line
    st = re.sub(r"\d*\s*(?:Pre A1 Starters|A1 Movers|A2 Flyers)\s+A[-–—]Z\s+wordlist", " ", st).strip()
    if not st:
        continue
    if "Candidates will be expected" in st or re.fullmatch(r"(?:Letters & )?[Nn]umbers|Names", st):
        done = True
    if done:
        continue
    if "Grammatical key" in st:
        in_key = True
        continue
    if in_key:
        if re.fullmatch(r"[A-Z]", st):
            in_key = False
        else:
            continue
    if key_line.match(st) or "©" in st or "UCLES" in st:
        continue
    if re.fullmatch(r"[\d\s]+", st) or re.fullmatch(r"[A-Z]", st):
        continue
    # split into column cells by 2+ spaces; join wrapped cells across lines by x proximity
    cells = []
    pos_acc = 0
    for part in token_split.split(s):
        idx = s.find(part, pos_acc)
        cells.append((idx, part.strip()))
        pos_acc = idx + len(part)
    for idx, cell in cells:
        if not cell:
            continue
        # find an existing partial buffer whose column start is within 16 chars
        target = None
        for c_idx in list(bufs):
            if abs(c_idx - idx) <= 16:
                target = c_idx
                break
        if target is None:
            target = idx
            bufs[target] = ""
        bufs[target] = (bufs[target] + " " + cell).strip()
        b = bufs[target]
        if entry_end.search(b):
            sections[cur].append(b)
            del bufs[target]

for c in list(bufs):
    if cur and bufs.get(c, "").strip():
        sections[cur].append(bufs[c].strip())

def split_pos(entry):
    m = re.search(rf"\s+({POS_TAIL})$", entry)
    if not m:
        return entry, ""
    return entry[: m.start()].strip(), m.group(1)

FULL = {"adj": "adjective", "adv": "adverb", "n": "noun", "v": "verb",
        "prep": "preposition", "conj": "conjunction", "det": "determiner",
        "pron": "pronoun", "excl": "exclamation", "num": "number",
        "dis": "expression", "int": "question word", "poss": "possessive"}

def expand_pos(pos):
    codes = re.findall(CODES, pos)
    return " + ".join(FULL.get(c, c) for c in codes)

def make_record(word, pos):
    note = ""
    m = re.search(r"\s*\(([^)]*)\)\s*$", word)
    if m:
        note = m.group(1)
        word = word[: m.start()].strip()
    alts = []
    mm = re.match(r"^(.+?)/(.+?)( .*)?$", word)
    if mm:
        base, right, rest = mm.group(1), mm.group(2), mm.group(3) or ""
        word = base + rest
        alts = [right + rest]
    m2 = re.match(r"^(.*?)\(s\)(.*)$", word)
    if m2:
        word = m2.group(1) + m2.group(2)
        alts.append(word + "s")
    rec = {"w": word, "t": expand_pos(pos)}
    if note:
        rec["note"] = note
    if alts:
        rec["a"] = sorted(set(alts))
    return rec

result, leftovers = {}, {}
for key, entries in sections.items():
    recs, leftovers[key] = [], []
    for e in entries:
        w, p = split_pos(e)
        if not p or not w or len(w) > 60:
            leftovers[key].append(e)
            continue
        if w == "could (as in past of can":  # PDF wrapped the closing paren away
            w = "could"
        recs.append(make_record(w, p))
    # dedupe by lowercase word, keep first
    seen, uniq = set(), []
    for r in recs:
        k = r["w"].lower()
        if k not in seen:
            seen.add(k)
            uniq.append(r)
    result[key] = uniq
    print(f"{key}: {len(entries)} raw -> {len(uniq)} unique, {len(leftovers[key])} leftover")
    for l in leftovers[key][:10]:
        print("   LEFT:", repr(l[:90]))

json.dump(result, open("data_raw/parsed_lists.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
