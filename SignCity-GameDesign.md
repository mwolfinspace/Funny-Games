# 🚦 Sign City (*Thành Phố Biển Báo*) — Full Game Design Document

A grid-intersection logic puzzle where trucks 🚚 follow sign rules through a mini city. Players either **predict where a truck exits**, **decode what each sign means**, or **rebuild which signs belong where** — all from the same underlying map data.

> **Status:** Design/spec document (markdown). No working HTML build included — this is the blueprint to hand to a developer.
> **UI references used:** `Honey_and_Flowers.html` (top bar, modals, seed system, SVG export pipeline) and the two uploaded reference images (city-grid rendering, sign iconography, gateway arrow/number convention, "device" legend panel).

| Fig. 1 — "City G-7" reference | Fig. 2 — "City D-4" reference |
|---|---|
| ![City G-7 reference](assets/ref-fig1-city-G7.png) | ![City D-4 reference](assets/ref-fig2-city-D4.png) |

---

## Table of Contents
1. [Core Concept & Terminology](#1-core-concept--terminology)
2. [Grid & Coordinate System](#2-grid--coordinate-system)
3. [Map Data Model](#3-map-data-model)
4. [Sign Symbols & Meaning Pills](#4-sign-symbols--meaning-pills)
5. [Editing Tools](#5-editing-tools)
6. [Simulation Engine](#6-simulation-engine)
7. [Game Mode 1 — Predict the Exit](#7-game-mode-1--predict-the-exit)
8. [Game Mode 2 — Decode the Meaning](#8-game-mode-2--decode-the-meaning)
9. [Game Mode 3 — Rebuild the Signs](#9-game-mode-3--rebuild-the-signs)
10. [Field Visibility Matrix (one seed, three modes)](#10-field-visibility-matrix-one-seed-three-modes)
11. [Seed System](#11-seed-system)
12. [Top Bar & Global Chrome](#12-top-bar--global-chrome)
13. [Floating Play-Control Bar](#13-floating-play-control-bar)
14. [Visual & Rendering Spec (SVG)](#14-visual--rendering-spec-svg)
15. [Device-Style Legend Panel (optional skin)](#15-device-style-legend-panel-optional-skin)
16. [Export Spec](#16-export-spec)
17. [Feedback, Errors & Accessibility](#17-feedback-errors--accessibility)
18. [Open Design Decisions & Recommendations](#18-open-design-decisions--recommendations)
19. [Implementation Checklist](#19-implementation-checklist)

---

## 1. Core Concept & Terminology

| Term | Meaning |
|---|---|
| **Intersection / Node** | A point in the grid where a road crosses another road. Can be empty or hold one sign. |
| **Sign symbol** | 🟡 🟦 🔺 — the three *assignable* signs. Each map defines a unique meaning (Trái/Thẳng/Phải = Left/Straight/Right) per symbol *type*, applied everywhere that symbol appears. |
| **U-turn sign (🔄)** | A 4th placeable sign with a **fixed, non-assignable** meaning: reverse 180° and go back toward the node the truck just came from. Not part of the pill puzzle. |
| **Empty node** | An intersection with no sign = default behavior "go straight." |
| **Gateway** | A road stub that leaves the grid at its outer boundary. Every row has exactly one **left** and one **right** gateway; every column has exactly one **top** and one **bottom** gateway. All gateways physically exist whether or not they're marked. |
| **Start marker** | A numbered, inward-pointing arrow on a gateway = where a truck spawns. Numbered ①②③… in click order. |
| **End marker** | A numbered, outward-pointing arrow on a gateway = a claimed exit. Numbered independently from starts, ①②③… in click order. |
| **Track** | The polyline path a truck actually drives, recorded and drawn in a per-start color. |
| **Seed** | A short string encoding the entire map (grid size, signs, meanings, starts, ends) so any map can be re-loaded exactly. |

**Pedagogical goal:** conditional/deductive reasoning — "if this shape means X, and the truck must arrive at gate 3, what must this other shape mean?" — the exact same skill family as Bebras-style unplugged CS puzzles, wrapped in a simple traffic theme kids already understand (turn left / go straight / turn right).

> **Naming convention used throughout this doc:** the game never labels signs with text — kids read them purely by color+shape. This doc follows that convention: the three assignable signs are always written as **🟡 🟦 🔺** (never "Circle/Square/Triangle" or other placeholder glyphs), and the fixed-behavior sign is always **🔄**. Internal code/data may still use plain-word enum keys (`circle`/`square`/`triangle`/`uturn`) purely for readability in source files — see §3.1 for the mapping.

---

## 2. Grid & Coordinate System

The board is an **R × C grid of intersections** (rows × columns), connected like city streets (every node connects to its N/E/S/W neighbor, or to a gateway stub if it's on the boundary). There is **no maze/wall concept** — the road network is always fully connected, so a truck can always continue in any of the 4 directions from any node.

### 2.1 Supported grid presets

| Preset | Rows × Cols | Intersections (R×C) | Gateways `2×(R+C)` | Suggested difficulty |
|---|---|---|---|---|
| 2×2 | 2 rows, 2 cols | 4 | 8 | Beginner |
| 2×3 | 2 rows, 3 cols | 6 | 10 | Intermediate |
| 3×2 | 3 rows, 2 cols | 6 | 10 | Intermediate |
| 3×3 | 3 rows, 3 cols | 9 | 12 | Advanced |

(Confirmed against reference images: the 3×3 examples show 3 rows of 3 sign symbols each, and gateways at every row's L/R edge + every column's T/B edge.)

### 2.2 Addressing scheme

- Intersections: `(r, c)`, 1-indexed, `r` = 1..R top→bottom, `c` = 1..C left→right.
- Gateways: `side` + `index`
  - `L{r}` / `R{r}` — left/right gateway of row `r` (index = row number)
  - `T{c}` / `B{c}` — top/bottom gateway of column `c` (index = column number)
  - Example: in Fig. 1, the middle-row demo pair is `L2` (exit, outward arrow) and `R2` (entry, inward arrow); the bottom-left demo entry is `B1`.

### 2.3 Block rendering (visual only, no gameplay effect)

City "blocks" (the soft green gradient squares in the reference art) fill the space **between and around** roads. For an R×C intersection grid there are **(R+1) × (C+1)** visual blocks — this matches Fig. 1 (3×3 intersections → 4×4 blocks visible, edges soft-clipped by the decorative circular vignette mask).

Recommended parametrization for implementation:
```
U = cell pitch (block size + road width), e.g. 120px
B = block size, e.g. 90px
W = road/gutter width, e.g. 30px
node(r, c).x = marginX + c * U
node(r, c).y = marginY + r * U
gateway stub length = 1 × U beyond the outermost row/col
```
Blocks use a radial gradient (light edge → soft dark vignette center), same technique as the reference's `--hex-center` gradient family, just re-themed to greens.

> **Design note:** the reference images use a circular/oval soft-fade mask around the whole board purely for stylistic flavor. For the actual teaching tool, default to a clean rounded-rectangle board (predictable, printable, no clipped signs) and offer the organic circle/oval vignette as an optional cosmetic "city" skin toggle for exports/decoration only.

---

## 3. Map Data Model

### 3.1 Symbol ↔ code key mapping

| On-screen sign | Code/data key |
|---|---|
| 🟡 | `"circle"` |
| 🟦 | `"square"` |
| 🔺 | `"triangle"` |
| 🔄 | `"uturn"` |

The word keys below (`circle`/`square`/`triangle`/`uturn`) are **internal identifiers only** — every player-facing label, button, and legend entry uses 🟡 🟦 🔺 🔄 instead, per the convention in §1.

```jsonc
Map {
  id: string,
  seed: string,
  rows: int,               // R
  cols: int,                // C
  signs: {                  // key = "r,c"
    "1,1": "triangle" | "circle" | "square" | "uturn" | null,
    ...
  },
  meanings: {                // one entry per symbol TYPE used anywhere on the map
    "circle":   "left" | "straight" | "right",
    "square":   "left" | "straight" | "right",
    "triangle": "left" | "straight" | "right"
    // "uturn" never appears here — its behavior is fixed
  },
  starts: [                  // ordered list, index+1 == displayed number
    { num: 1, gate: "R2" },
    { num: 2, gate: "T2" }
  ],
  ends: [
    { num: 1, gate: "L2" }
  ]
}
```

Notes:
- `meanings` is a **bijection** across the 3 basic symbol types — Left/Straight/Right are each used exactly once. This is enforced by the UI (see §4).
- Only symbol types that actually appear in `signs` need a `meanings` entry / need to be shown in any legend or puzzle panel (Mode 2 rule: "if the map has only two signs, only two appear to set up").
- `starts`/`ends` are independent numbering sequences — matching numbers is the win condition, not matching gateway identity.
- Player scratch state (manually-disabled pills, in-progress lock state) is **session state**, not part of the seed — reloading a seed always restores the *answer key*, never a specific student's notes.

---

## 4. Sign Symbols & Meaning Pills

Each of the 🟡 🟦 🔺 symbols gets a row of **3 pills**: `Trái` (Left) · `Thẳng` (Straight) · `Phải` (Right) — matching the reference device panel exactly.

### 4.1 Pill states

| State | Trigger | Look |
|---|---|---|
| **Neutral** | Default | Outlined pill, muted text |
| **Active / selected** | Left-click | Filled accent color, white text — this IS the symbol's meaning |
| **Auto-disabled** | Another symbol already claimed this pill | Greyed out, ~35% opacity, not clickable, tooltip "Already used by 🔺" (whichever symbol claimed it) |
| **Manually disabled (scratch mark)** | Right-click by the student | Amber dashed outline + strike-through text — a *note*, not a rule. Still clickable to toggle off. Has **zero effect on game logic** — purely a thinking aid so a student can cross off options they've ruled out by deduction. |

### 4.2 Uniqueness rule
Exactly one active pill per symbol; the 3 active pills across 🟡 🟦 🔺 must together cover Left, Straight, Right with no repeats (bijection). The moment one symbol activates "Left," the "Left" pill auto-disables on the other two symbols until freed.

### 4.3 U-turn
Rendered in the legend with a badge (e.g., "🔄 Always reverses direction") instead of 3 pills — it's never guessable/assignable, it's a fixed rule element used to teach "some signs are unconditional."

---

## 5. Editing Tools

All editing tools live in a **Build Toolbar** (secondary bar under the top bar, shown only outside of active simulation). **Exactly one tool is active at a time.** Selecting a new tool auto-deactivates the previous one. `Esc`, or clicking the active tool's button again, exits back to a neutral "inspect" state.

### 5.1 Sign Placement Tool
- 4 toggle buttons: 🟡 · 🟦 · 🔺 · 🔄.
- Click a button → tool arms. Hovering the map shows a **ghost icon** snapped to the nearest intersection, so placement is unambiguous.
- Click an intersection → places the armed sign there (overwrites whatever was there).
- Right-click an intersection → removes its sign (returns to "empty = go straight").
- No placement limit; one sign per node max; empty nodes allowed anywhere.
- Clicking a different sign button mid-edit swaps the armed sign (old button auto-deactivates).

### 5.2 Meaning Assignment
- Not a "placement" tool — it's the pill panel described in §4. Always visible/interactive whenever meanings aren't locked for the current mode.
- Right-click = scratch-disable (see 4.1). Left-click = select.

### 5.3 Start Point Tool
- Toggle the ▶ Start Flag button to arm it.
- Hover near any of the `2×(R+C)` gateway stubs → ghost preview: an inward arrow snapped to that gateway, pointed at the first intersection the truck will meet.
- Click → commits the marker, auto-numbered as `next start number` (1, 2, 3…, in click order).
- Right-click an existing start marker → removes it; **remaining markers renumber to close the gap** (e.g., removing ② when ①②③ exist re-labels ③ → ②).
- No upper limit besides the number of gateways.
- Click the Start Flag button again (or `Esc`) → exits the tool.

### 5.4 End Point Tool
- Same interaction pattern as Start, via the 🏁 End Flag button.
- Arrow points **outward** (away from the grid); the number sits *closer* to the grid edge than the arrowhead (see §14.3 for the exact glyph geometry taken from the reference images).
- Independent numbering sequence from starts — a map can have more starts than ends (or vice versa) at any point during editing; the game doesn't force 1:1 coverage while editing.
- Right-click removes + renumbers, same as starts.

---

## 6. Simulation Engine

### 6.1 Preconditions
The floating **▶ Play** button is enabled only when **at least one start marker exists**. Everything else (signs, meanings, ends) can be partially or fully unset depending on the active mode's puzzle.

### 6.2 Per-node decision rule

```
function nextHeading(headingIn, node):
    if node.sign == null:            return headingIn                  // straight by default
    if node.sign == "uturn":         return reverse(headingIn)          // bounce back the way it came
    meaning = meanings[node.sign]    // "left" | "straight" | "right"
    if meaning == "straight":        return headingIn
    if meaning == "right":           return rotateClockwise90(headingIn)
    if meaning == "left":            return rotateCounterClockwise90(headingIn)
```

`headingIn` and the rotated result are always one of `{N, E, S, W}` — turns are always relative to the truck's current direction of travel, never to absolute map orientation (i.e. "right" always means "turn right from the driver's point of view").

### 6.3 Movement loop (per truck, per tick)
1. Truck sits at node `(r,c)` having just arrived with `headingIn`.
2. Compute `headingOut = nextHeading(headingIn, node)`.
3. Flash/pulse the active pill (or the U-turn badge) of that node's sign for ~200ms — visual feedback that "this rule just fired."
4. Step one cell in `headingOut`:
   - If the target is another intersection → truck travels there, becomes the new `headingIn`, repeat.
   - If the target is off-grid → truck is leaving via that row/column's gateway.
5. **On exit:**
   - If that exact gateway has an End marker **and** its number matches the truck's start number → ✅ valid arrival. Flag glows green. Track line locked in as "correct" color.
   - If that exact gateway has an End marker but a **different** number → ⚠️ mismatched. Flag does *not* light up; truck fades out; track line renders in a neutral/error color (e.g. dashed grey).
   - If that gateway has **no** End marker at all → the truck simply drives off-map (unclaimed exit). No flag reaction. Track shown as neutral grey (still useful visually — "this is where it actually goes" — but doesn't affect scoring).
6. **Loop-safety cap:** if a truck exceeds a fixed number of node-visits (recommend **200 steps**) without exiting (e.g., two adjacent U-turn signs bouncing forever, or a straight/left/right cycle that revisits nodes endlessly), the sim force-stops that truck, shows a toast ("This route never leaves the city — check your signs!"), and removes it without marking any flag.

### 6.4 Multi-car spacing ("Number of cars")
The bottom bar's car-count control (N, typically 1–6) controls how many trucks are visible on the board **at the same time**, spaced evenly in time:

```
referenceLapDuration = fixed constant (independent of any single route's real length),
                        tunable via the Speed control
spawnInterval = referenceLapDuration / N
```

- Every `spawnInterval`, a new truck spawns at the **next start marker in round-robin order** (①→②→③→①→…), so with multiple starts every one of them gets exercised repeatedly rather than only the first.
- `N = 1`: strictly sequential — a truck must finish (reach any exit or get capped) before the next spawns.
- `N = 2`: roughly 2 trucks visible, staggered ~50% apart in time; `N = 3` ≈ 33%; `N = 4` ≈ 25%; etc. — matches the requested spec directly.
- Pause freezes every truck mid-tween; Reset clears all trucks, all recorded tracks, and all flag highlight states (map setup itself is untouched).

### 6.5 Track visualization
- Each **start number** gets a fixed color from a 10-color palette (so start ① is always red-family, ② always blue-family, etc., across the whole session):

| # | Color name | Hex |
|---|---|---|
| 1 | Poppy Red | `#E0554A` |
| 2 | Sky Blue | `#3F8EFA` |
| 3 | Grass Green | `#4CAF50` |
| 4 | Sunflower | `#F5B301` |
| 5 | Grape | `#9B59B6` |
| 6 | Teal | `#16A2A2` |
| 7 | Tangerine | `#F2884B` |
| 8 | Rose | `#EA1E7C` |
| 9 | Slate | `#6B7A8F` |
| 10 | Lime | `#8BC34A` |

- A top-bar toggle (`Tracks: On/Off`) shows/hides all recorded polylines at once.
- Lines accumulate across multiple laps of the same start number (so repeated correct runs reinforce the same colored path; mismatched/unclaimed runs use the neutral grey regardless of start number, so "wrong" never gets confused with a real answer color).

### 6.6 Win condition
🎉 Confetti fires when **every End marker currently placed on the map** has been lit green at least once (i.e., its number's truck has successfully arrived). Start markers without a corresponding End marker are simply not part of the win check — matching the spec ("no need to force the user to set up all end points for all start points").

---

## 7. Game Mode 1 — Predict the Exit

**Setup phase (fully open):** the builder (teacher or self-quizzing student) sets grid size, places signs, assigns all 3 meanings, and places start markers — everything is visible and editable, same tools as §5.

**The puzzle:** mentally trace each start through the signs and place the matching End marker at the gateway you believe is correct, *then* press Play to confirm. Wrong guesses just show a grey "actual exit" track and an un-lit flag — no penalty, re-place and retry.

### 7.1 Quick Play defaults
A "⚡ Quick Play" button on the setup screen, with togglable options shown beneath it (all editable before generating):

| Option | Default |
|---|---|
| Grid size | random of the 4 presets |
| Auto-place signs | **On** — always FULL coverage; every intersection is signed. An empty intersection would just reveal "go straight", and since one symbol is always assigned the **straight** meaning, blanks are never needed (and never generated) in this mode. |
| Auto-assign meanings | **On** |
| Auto-place start gateways | **On**, default count = **2** |
| Auto-place end gateways | **Off** (this is what the student solves) |

---

## 8. Game Mode 2 — Decode the Meaning

**What's given:** grid, signs, start & end markers are all pre-placed and visible. **What's hidden:** the 3 meaning pills — student must assign them.

### 8.1 Flow
1. Only the symbol types actually present on this map appear in the legend/pill panel (a 2-sign map shows 2 rows, not 3).
2. Student assigns pills (§4), using right-click scratch-marks freely.
3. Student presses **🔒 Lock** (a button directly under the pill panel). This locks the pills and unlocks **▶ Play**.
4. Sim runs; correctness is judged purely by the existing flags (§6.3/6.6).
5. If wrong → **🔓 Unlock** button appears. Unlocking auto-clears all trucks/tracks/flag states (but keeps the student's pill picks so they can adjust rather than start over) and re-locks Play until Locked again.
6. **Track lines are never pre-rendered during setup** — even for the "given" correct pair — so the student can't just eyeball a drawn line instead of reasoning from the static sign layout. Tracks only appear once the student Locks + Plays their own answer.

### 8.2 Quick Play generation
- Random grid + **dense** signs (every intersection signed, so "empty = go straight" never gives the path away).
- **One confirmed start/end pair** (e.g. ①→①) shown as a hint, numbers visible, no track pre-drawn.
- **One extra start marker with no matching end** (e.g. ②) — the harder part: the student must both work out the full meaning mapping *and* figure out (and place) where ② actually exits, then verify by Play.
- Meaning pills start fully blank.
- **~50% chance of a "missing sign" variant:** 1–3 intersections *on the confirmed route* (only ones where the correct action is a turn / U-turn, i.e. a sign that actually changes the heading) are left blank. The student then does **two jobs** — assign the meaning pills *and* place the correct signs at those blanks — before the truck can reach the End. A fully-empty board is never generated.

---

## 9. Game Mode 3 — Rebuild the Signs

**What's hidden:** all sign placement (every intersection renders empty/blank, even nodes that do have a sign in the answer key). **What's given:** start & end hint pairs (with numbers, no pre-drawn tracks), so the student can reverse-engineer sign placement.

### 9.1 Meaning-availability fallback chain
Because both "where are the signs" and "what do they mean" *could* be unknown at once, Mode 3 resolves meanings in this priority order:

1. **If the map's seed defines meanings** → show them, **read-only/locked**. (Student solves sign placement only — the easier variant.)
2. **Else if the map has no defined meanings, but does have at least one confirmed 1→1 route** → the student must use that known-good route as a constraint to work out the meanings themselves (pill panel is editable) *in addition to* placing signs. (Hard variant, two unknowns solved from one shared clue.)
3. **Else (no meanings and no confirmed route at all)** → pill panel is fully open/editable with no hint — effectively Mode 2 + Mode 3 combined, validated only through however many in/out pairs exist.

### 9.2 Flow
1. Student arms a sign type (§5.1) and clicks intersections to place it — or leaves a node empty on purpose (empty is a valid, sometimes-correct answer).
2. Right-click removes a placed sign.
3. Press **▶ Play** any time (no separate lock step here — signs can be freely tweaked between runs) to test the current layout against the given hint pairs.
4. Iterate until every given End marker lights green → confetti.

### 9.3 Quick Play generation
- Random grid + a generated, internally-consistent set of meanings (shown **locked/visible** to the student, since this mode is about placement, not decoding).
- Generate **valid start/end pairs**: at least **2 pairs** for a 2×2 grid, at least **3 pairs** for 2×3 / 3×2 / 3×3 grids (more constraints needed on bigger grids to make the placement puzzle solvable/unambiguous).
- All signs hidden, no track pre-render.

---

## 10. Field Visibility Matrix (one seed, three modes)

Every mode can load the exact same seed — the seed always stores the full **answer key**; only the *display/lock* rules differ per mode.

| Field | Mode 1 (Predict Exit) | Mode 2 (Decode Meaning) | Mode 3 (Rebuild Signs) |
|---|---|---|---|
| Grid size | Given, editable | Given (from seed) | Given (from seed) |
| Signs | Given, editable | **Given, visible** | **Hidden — student sets** |
| Meanings | Given, editable | **Hidden — student sets, then Locks** | Locked-given → derived-from-hint → open (fallback chain, §9.1) |
| Start markers | Given, editable | Given, visible | Given, visible (hints) |
| End markers | **Student solves (the puzzle)** | Given, visible (≥1 confirmed pair + 1 unresolved extra start) | Given, visible (≥2–3 confirmed pairs) |
| Track pre-render | Off until Play | **Always off during setup**, even for given pairs | **Always off during setup** |

---

## 11. Seed System

### 11.1 What's encoded
`rows, cols, signs{}, meanings{}, starts[], ends[]` — i.e. the full answer key from §3. Player scratch state (manual pill scratch-marks, lock/unlock progress) is **not** part of the seed.

### 11.2 Format
A super-compact **Base-81** string (digits, upper/lowercase letters, and clean ASCII symbols) — no JSON, no base64. The entire game state packs into a single `BigInt`, then encodes with a Base-81 charset.

Field layout (least-significant first):
```
vTotal = grid(2 bits)
       + 4 × ( meanings(6 bits, 4×4×4 = 64 states: null/L/S/R per symbol)
             + 64 × ( signs(base-5 integer, 5^(R·C) states: none/○/■/▲/U)
                    + 5^(R·C) × gateways(starts-code + startsMax × ends-code) ) )
```
- **Grid size** — 4 states: `2×2, 2×3, 3×2, 3×3` (`rIdx*2 + cIdx`).
- **Meanings** — 3 symbols × 4 actions (null/left/straight/right) = 64 states, stored as the answer key.
- **Intersection signs** — one base-5 digit per node in row-major order.
- **Gateways** — up to **3 starts** and **3 ends**, each list packed as a mixed-radix code over the `2×(R+C)` perimeter gateways (`L1..R…/T…/B…`), combined with `startsCode + startsMax × endsCode`.

Example lengths: empty `2×2` map → `0`; empty `3×3` → `3`; a full game map → typically **3–8 characters**.

### 11.3 Behavior
- The **Seed field** in the top bar live-updates on every single edit (matches Honey & Flowers' `#seedInput`/live seed pattern).
- Clicking the seed text copies it to clipboard (toast confirmation, same UX as reference's `btnCopySeed`).
- Typing/pasting a seed + pressing **Load** rebuilds the full map, then immediately applies the *current mode's* visibility rules from §10 (so loading the same seed in Mode 2 vs Mode 3 looks different even though the underlying data is identical).

---

## 12. Top Bar & Global Chrome

Modeled directly on `Honey_and_Flowers.html`'s `#topBar` pattern (pill-groups, `.btn-icon`, `.sep` dividers, blurred translucent bar).

```
[🚦 Sign City]  |  (Mode 1 pill)(Mode 2 pill)(Mode 3 pill)  |  (2×2)(2×3)(3×2)(3×3) grid pills
  |  Tracks [on/off toggle]  |  Auto-zoom [on/off toggle]
  |  [seed input][📥 Load][📋 shows live seed, click=copy]  |  [⬇️ Export]  |  [❓ Help]
```

- **Mode switcher** — 3-way pill group, same visual language as the reference's `#gridTypeGroup`.
- **Grid size** — 4-way pill group (not a +/- stepper, since only the 4 named presets are valid).
- **Tracks on/off** — iOS-style toggle (`.ios-toggle`/`.ios-slider`, reused verbatim from the reference CSS).
- **Auto-zoom on/off** — when **on**, the board auto-fits to any viewport (mirrors reference's `fitBoard()`). When **off**, a teacher can freely pinch/scroll-zoom and pan to spotlight one intersection while presenting; clicking the toggle instantly snaps back to fit.
- **Seed row** — input + Load (📥) + live seed display that doubles as a Copy button (📋), same pairing as the reference's seed row.
- **Export** — opens the export preview modal (§16).

---

## 13. Floating Play-Control Bar

A floating, rounded, blurred bottom bar (visually consistent with the reference's modal/toast blur treatment), always available in Play-capable states:

```
[⏮ Reset]  [▶ Play / ⏸ Pause]  [🐢 Speed−]  [speed readout]  [🐇 Speed+]  [− Cars: N +]
```

- **Play** — disabled unless ≥1 start marker exists (tooltip explains why when disabled).
- **Pause** — freezes all truck tweens and the spawn timer in place; Play resumes from the same state.
- **Reset** — clears all trucks, all recorded tracks, all flag highlight states; keeps map setup intact.
- **Speed −/+** — multiplier steps, e.g. `0.5× · 1× · 2× · 4× · 10× · 20×` (4× = old default speed; x2 = half of that; x1 = quarter), affects truck travel speed.
- **Cars − / +** — adjusts `N` (recommend range **1–6**); live while playing, spacing recalculates immediately.

---

## 14. Visual & Rendering Spec (SVG)

### 14.1 Layer order
1. Background (transparent, or optional decorative vignette skin)
2. City blocks (radial-gradient greens, `(R+1)×(C+1)` grid, §2.3)
3. Roads (light gutter strips at every row/column line + gateway stubs)
4. Gateway arrows + number badges
5. Intersection sign icons
6. Track polylines (toggleable)
7. Trucks (🚚 emoji or simple SVG truck glyph, rotated to current heading)
8. Ghost/ preview layer (hover previews while a tool is armed) — editor-only, excluded from export

### 14.2 Sign icon spec (colorblind-safe: shape-coded *and* color-coded)

| Symbol | Shape rendered | Fill |
|---|---|---|
| 🟡 | filled circle | Amber `#F5B301` |
| 🟦 | filled square, slight rounded corners | Blue `#2E9BD6` |
| 🔺 | filled triangle, point up (glyph is static, never rotates) | Red `#E0554A` |
| 🔄 | hooked arrow glyph | Purple `#8E5DC7` |

### 14.3 Gateway glyph geometry (derived directly from the reference images, §pixel inspection)

Two mirrored layouts depending on marker type — **the number always sits closer to the grid edge than the arrow does; only the arrow's position/direction flips between Start and End:**

- **Start marker:** `[grid edge] → [arrow, pointing inward] → [number, outermost]`
  Arrow sits nearer the board, pointed at the first intersection the truck will reach.
- **End marker:** `[grid edge] → [number, nearest] → [arrow, pointing outward] → [open edge]`
  Number sits nearer the board (labels *which* gate), arrow points further out, continuing the truck's exit direction.

(Verified pixel-for-pixel against Fig. 1: the right-gateway `①` of row 2 has its inward-pointing arrow nearest the blue square with the number further out = Start; the left-gateway `①` of the same row has the number nearest the grid and its arrow — also pointing further left, i.e. away from the board — furthest out = End. Together they illustrate the panel's caption "Nếu đi đúng thì ①→①.")

### 14.4 Truck rendering
Simple 🚚 emoji (fast, no asset pipeline) rotated via CSS/SVG transform to match `headingOut`; alternatively an SVG glyph in the same visual family as the reference's use of simple flat vector icons, for print/export consistency (emoji don't reliably export to Office SVG).

---

## 15. Device-Style Legend Panel (optional skin)

The little handheld-device widget in both reference images ("City G-7" / "City D-4") is a fun, on-brand way to *skin* the abstract pill panel from §4, rather than a separate mechanic:

**Chrome details to reuse:**
- Rounded, thick-bordered shell, warm orange gradient body
- Top-left: small red circular "power" icon; top-right: small green "battery/lightning" icon
- Inner cream/white rounded panel holding the title (`City {map code}`) + one row per active symbol type + its 3 pills
- Bottom caption line, e.g. `Nếu đi đúng thì ①→①` — repurpose this line dynamically as a live hint/status string (e.g. it can show the *currently selected* start→end pair being tested, or a static instructional string in Mode 1/2/3 respectively)
- Bottom-corner "eye" speaker icons + a green progress/volume bar — purely decorative, can double as an actual **progress bar** (e.g., truck's progress along current lap, or puzzle-completion %) for a nice bit of functional reuse

Recommend building **two interchangeable skins** for the meaning panel:
- **Skin A — Flat panel:** matches the reference app's own `.pill-group`/`.pill` styling (fast, consistent with rest of chrome).
- **Skin B — Device HUD:** the orange handheld widget above, offered as a toggleable "fun theme" for younger audiences / marketing screenshots.

Both skins drive the exact same underlying pill state machine from §4 — purely cosmetic choice.

---

## 16. Export Spec

Export produces a **clean, static SVG** (no chrome, no trucks/animation, no ghost previews), matching the reference's "Standard SVG… transparent background… for Word/PowerPoint" requirement.

### 16.1 Preview modal (mirrors reference's `#previewModal`)
```
┌────────────────────────────┬───────────────────┐
│                            │ Show signs   [on ] │
│      <live SVG preview>   │ Show numbers [on ] │
│                            │ Show tracks  [off] │
│                            │ Include legend[off]│
│                            │ ─────────────────  │
│                            │ [💾 Save PNG]       │
│                            │ [⬇️ Save SVG]       │
│                            │ [Cancel]            │
└────────────────────────────┴───────────────────┘
```

### 16.2 Technical requirements (Office-compatibility)
- **Background is always transparent** (no toggle needed — this is a hard requirement per spec, unlike the reference's optional `tglBg`).
- All theming must be **baked to literal hex values** at export time — CSS custom properties (`var(--x)`) render fine in-browser but are frequently dropped by Word/PowerPoint's SVG importer. The export routine must walk the DOM/SVG and resolve every `var()` to its computed color before serializing.
- No `backdrop-filter`/CSS blur, no `<foreignObject>`, no external stylesheet `<link>` — inline `<style>` or (safer) fully presentational attributes only.
- Gradients must be real SVG `<radialGradient>`/`<linearGradient>` `<defs>` (already the reference's approach) — these import into Office correctly.
- Provide both **Save SVG** (vector, for editing inside Word/PPT) and **Save PNG** (raster, transparent, for quick paste) — matching the reference's dual export buttons.

---

## 17. Feedback, Errors & Accessibility

| Situation | Feedback |
|---|---|
| Press Play with 0 start markers | Toast: "Add at least one start point first" (button stays visibly disabled, not just inert) |
| Try to place 2nd sign on an occupied node | New sign simply replaces old one (no error needed — this is expected "swap" behavior) |
| Pill conflict (symbol tries to claim an already-used meaning) | That pill is visually disabled before click is even possible — no error state needed, prevention > error message |
| Load malformed/unknown seed | Toast: "That seed doesn't look right — check for typos" |
| Truck exceeds loop-safety cap (§6.3) | Toast: "This route never leaves the city — check your signs!" + truck removed, no flag penalty |
| All claimed End markers validated | 🎉 Confetti burst (reuse reference's `#confettiHost` particle system) |

**Accessibility notes:**
- Signs are shape-coded **and** color-coded (never rely on color alone) — already colorblind-safe by construction (§14.2).
- Right-click is used for two different things (remove marker/sign, and scratch-disable a pill) — on touch devices, provide a **long-press** equivalent for both, with a brief haptic/visual pulse so the gesture is discoverable.
- Keyboard shortcuts (optional, desktop): `Esc` = exit current tool, `Space` = Play/Pause, `←/→` = Speed −/+, `↑/↓` = Cars −/+, `Z` = Undo last edit — mirrors the reference's existing keybinding philosophy (`u`=undo, `n`=new, `c`=check).

---

## 18. Open Design Decisions & Recommendations

A few spots in the original spec were ambiguous; here's what this document assumes, flagged explicitly so the eventual developer can confirm or override:

1. **Multi-car spawn order** — assumed round-robin across all active start markers (§6.4), rather than only ever spawning start ①. Round-robin exercises every start point during a single Play session, which seems more useful for a classroom demo.
2. **Loop-safety cap** — the spec doesn't address infinite bouncing (e.g. two adjacent U-turns). This doc adds a 200-step cap + toast as a safety net; the exact number is tunable.
3. **Unclaimed exits** — a truck that exits at a gateway with no End marker isn't mentioned in the original spec's scoring; this doc treats it as "neutral, visually shown, no scoring effect" rather than an error, since in Mode 1 that's actually the *expected* everyday case before the student has placed their guess.
4. **Seed encoding** — proposed a versioned/base62 format in the spirit of the reference's seed strings; a v1 implementation can ship as base64(JSON) and swap the payload encoding later without touching any UI.
5. **Board vignette mask** — the reference images' circular/oval soft-edge crop is treated as an optional cosmetic skin, not the default board shape, so exported SVGs stay clean rectangles for classroom printing.
6. **Manual pill scratch-marks** — assumed to persist per-session until manually cleared or a new seed loads (not tied to the Lock/Unlock cycle in Mode 2), since they're explicitly framed as a thinking aid the student may want to keep across attempts.

---

## 19. Implementation Checklist

- [ ] Grid/gateway math (§2) + data model (§3)
- [ ] Pill state machine incl. auto-disable + manual scratch marks (§4)
- [ ] Sign/Start/End editing tools with single-active-tool exclusivity (§5)
- [ ] Simulation engine: heading rules, movement loop, loop-safety cap, multi-car spacing (§6)
- [ ] Mode 1 flow + Quick Play generator (§7)
- [ ] Mode 2 flow incl. Lock/Unlock + hidden-track rule + Quick Play generator (§8)
- [ ] Mode 3 flow incl. meaning fallback chain + Quick Play generator (§9)
- [ ] Seed encode/decode + mode-aware field visibility (§10, §11)
- [ ] Top bar chrome incl. mode/grid pill groups, tracks/auto-zoom toggles, seed row (§12)
- [ ] Floating play-control bar (§13)
- [ ] SVG board renderer + track polylines + truck animation (§14)
- [ ] Optional device-HUD legend skin (§15)
- [ ] Export pipeline: var()-baking, transparent bg, SVG + PNG (§16)
- [ ] Toasts, confetti, long-press mobile equivalents, keyboard shortcuts (§17)
