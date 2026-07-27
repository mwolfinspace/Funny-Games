Your rule is correct and actually simplifies the whole system a lot:

**SeedID = puzzle clues only.**
Everything else (difficulty, generator settings, rating) must be **derived after loading**, never stored.

So the model becomes:

```
SeedID → decode clues → solve → analyze difficulty → display rating
```

And **every seed always loads as Custom**.

That design is clean and avoids seed bloat.

---

# Correct Architecture

## 1. What SeedID must contain

Only two things:

```
size
clues
```

Nothing else.

Not:

```
difficulty
generator seed
symmetry
rating
```

Difficulty should always be **computed after solving**.

---

# 2. Loading flow

When a seed loads:

```
decodeSeed(seed)
↓
board.clues = decoded
↓
solver.solve()
↓
difficulty = solver.rate()
↓
gameMode = "custom"
```

Important rule:

```
this.df = "custom"
```

always.

Difficulty shown in UI becomes something like:

```
Custom (Easy)
Custom (Hard)
Custom (Expert)
```

but that text is **derived**, not stored.

---

# 3. Generator flow

When the game creates a new puzzle normally:

```
generate puzzle
↓
encodeSeed(clues)
↓
store seed
↓
difficulty = analyze puzzle
```

The seed still contains **only clues**.

So sharing the seed recreates the puzzle exactly.

---

# 4. Custom editor flow

You proposed:

```
Edit puzzle
↓
press Generate SeedID
↓
canonicalize
↓
encodeSeed
```

That is correct.

But canonicalization should be **minimal** to avoid huge CPU cost.

Only apply **8 grid symmetries**:

```
identity
rotate90
rotate180
rotate270
flipH
flipV
flipDiag
flipAntiDiag
```

Pick the lexicographically smallest encoded seed.

This guarantees:

```
same puzzle rotated
→ same seed
```

while staying fast.

---

# 5. Why your current patch still creates long seeds

Your patch encodes the puzzle as a **bitstream of 81 cells**.

Example:

```
0 = empty
1 + valueBits = clue
```

That means **every empty cell still costs 1 bit**.

For a 9×9 board:

```
81 bits minimum
```

After Base81 encoding that already becomes several characters even if the board is empty.

So the seed cannot become very short.

---

# 6. Correct shortest encoding

Encode **only clues**.

Each clue stores:

```
position
value
```

For 9×9:

```
position = 0..80
value = 1..9
```

Pack them as:

```
code = position * 9 + (value - 1)
```

Range:

```
0..728
```

Which fits inside **10 bits per clue**.

Typical Sudoku puzzle:

```
25–35 clues
```

So seed size roughly:

```
250–350 bits
≈ 7–11 Base81 characters
```

Which is already near optimal.

---

# 7. Ensuring identical puzzles always produce identical seeds

Before encoding clues:

```
sort clues by position
```

Otherwise two identical puzzles could produce different seeds depending on insertion order.

---

# 8. Random letters → deterministic puzzle

You also wanted this behavior.

If the string **cannot decode as a seed**, treat it as a generator seed.

Example:

```
player enters "DRAGON"
```

Process:

```
hash("DRAGON")
↓
seed RNG
↓
generate puzzle
↓
encode clues → new seed
```

Now:

```
DRAGON + 9×9
```

always produces the same puzzle.

---

# 9. Final rule summary for your agent

Tell your agent these strict rules:

### Seed rules

```
SeedID stores:
- puzzle size
- clue list only
```

### Never store

```
difficulty
generator seed
rating
```

### On load

```
decode seed
solve puzzle
compute difficulty
mode = custom
```

### Custom editor

```
press Generate SeedID
apply 8 board symmetries
choose smallest encoded seed
```

### Encoding

```
encode only clues
position,value pairs
sorted by position
```

---

# Result

Your system will now satisfy all your goals:

```
short seeds
deterministic puzzles
difficulty independent
seed always loads custom
normal game show seed, not broken start game seedid
same puzzle → same seed
```

And seeds will typically look like:

```
9×9 → 7–11 chars
6×6 → 4–7 chars
5×5 → 3–5 chars
4×4 → 2–4 chars
```

---