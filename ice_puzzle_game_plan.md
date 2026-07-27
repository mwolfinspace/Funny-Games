# 🧊 Ice Skate Puzzle — Complete Build Plan

> **Reference UI:** `robot_cleaner.html` — adopt its glass-morphism design system, CSS variables, canvas-based rendering, top-controls bar, modal patterns, and toast system verbatim where possible.
> **Agent instruction:** Build this as a single self-contained `ice_puzzle.html` file. No external assets needed — all graphics are drawn with Canvas 2D API or pure CSS/emoji.

---

## 1. Concept Overview

An ice-floor sliding puzzle. The **pawn** (🏒 or a drawn circle with face) sits on a grid of cells. When the player inputs a direction, the pawn **slides in that direction indefinitely** until it hits a wall or the boundary. The goal is to slide the pawn so it **stops exactly on the ⭐ cell**. Passing through ⭐ without stopping is **not** a win.

This mechanic is identical to the ice-cave puzzles in Pokémon games and variants of _Roller Splat_ / _AMAZE!_ — but simplified to pure A-to-B navigation (no floor-painting).

---

## 2. Visual Design System

Inherit from `robot_cleaner.html` directly:

```css
:root {
  --glass-bg:     rgba(255,255,255,0.72);
  --glass-border: rgba(255,255,255,0.92);
  --glass-shadow: 0 4px 20px rgba(0,0,0,0.10);
  --glass-blur:   blur(16px) saturate(180%);
  --radius:       12px;
  --radius-lg:    18px;
  --accent:       #4F8EF7;
  --accent2:      #7C6FF7;
  --danger:       #F76F6F;
  --success:      #52C87A;
  --text:         #1a1a2e;
}
html, body {
  width: 100vw; height: 100vh; overflow: hidden;
  background: #e8edf5;   /* same warm-blue page bg */
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: none;    /* block all native zoom/scroll */
}
```

### 2.1 Cell Rendering (Canvas)

| Element         | Visual                                                                          |
|-----------------|---------------------------------------------------------------------------------|
| Floor cell      | Rounded rect, white with 8 % blue tint, subtle inner shadow                    |
| Wall cell       | Dark slate (#2c3e50) rounded rect, slight 3-D bevel (lighter top edge)         |
| Boundary        | Same dark slate, drawn as the outer ring around the grid                        |
| Start cell ⭕   | Floor cell + large ⭕ emoji centered                                            |
| End cell ⭐     | Floor cell + large ⭐ emoji centered, soft gold glow pulse animation           |
| Pawn            | Filled circle (#4F8EF7), white border, face (two dots + smile), shadow         |
| Ghost pawn      | Same circle at 35 % opacity, dashed border, no shadow                          |
| Pawn trail      | Thin fading blue line left behind during the current slide animation            |
| Drag line       | Dashed line from drag-start point following cursor/touch; arrow tip at end      |

### 2.2 Pawn Slide Animation

- Duration: `200ms` base, scaled by number of cells traveled (`+20ms per extra cell`, max `420ms`)
- Easing: `ease-out` (fast start, smooth stop — "icy deceleration")
- Implement with `requestAnimationFrame` lerping the canvas draw position, **not** CSS transitions (canvas game)
- Trail: as the pawn moves, draw a fading blue rectangle path on the cells it passed through; fade out after `600ms`

### 2.3 Win Effect

- Canvas confetti burst (20–30 colored rectangles fly out from pawn position, gravity + rotation)
- ⭐ cell emits a golden ring-pulse for `800ms`
- Win modal slides up from bottom (matching robot_cleaner popIn keyframe)

---

## 3. Layout

```
┌─────────────────────────────────────────────────────────┐
│  TOP BAR  [Size▾] [Easy|Med|Hard] [↺Reset] [✨New] [✏️Edit] [💡Solve] [🌱SeedID input]  │
├────────────┬────────────────────────────────┬────────────┤
│            │                                │            │
│  LEFT DPAD │       GAME BOARD CANVAS        │ RIGHT DPAD │
│  (▲▼◀▶)   │  (gesture zone, no pan/zoom)   │  (▲▼◀▶)   │
│            │                                │            │
├────────────┴────────────────────────────────┴────────────┤
│  STATUS BAR  Moves: 3 | Size: 6×6 | Seed: abc123        │
└─────────────────────────────────────────────────────────┘
```

### 3.1 Top Bar (`#topBar`)

Fixed, `position: fixed; top: 0; left: 0; right: 0; z-index: 100`  
Glass morphism panel: same `.glass` class from reference.  
Single row of `.ctrl-btn` glass buttons (identical class from reference).

Controls (left → right):

| Control             | Type              | Detail                                                     |
|---------------------|-------------------|------------------------------------------------------------|
| **Size**            | `ctrl-group` stepper `−` `4×4` `+` | Range 4–10, changes both rows and cols equally   |
| **Difficulty**      | `ctrl-btn` cycling | Easy → Medium → Hard, shows label, updates color accent   |
| **↺ Reset**         | `ctrl-btn`        | Restore pawn to ⭕ cell; clears move history; no map change|
| **✨ New**           | `ctrl-btn`        | Generate a fresh random map (same size + difficulty)       |
| **✏️ Editor**       | `ctrl-btn toggle` | Activates editor mode (see §8)                             |
| **💡 Solve**        | `ctrl-btn`        | Ghost-solve animation (see §7), has cooldown indicator     |
| **🌱 Seed input**   | `<input>` field (same style as `#mapIdInput` from reference) | Shows current seed; type + Enter to load |

### 3.2 Game Board Area

- Center of screen between top bar and status bar
- Canvas (`#gameCanvas`) fills this space, `touch-action: none`
- Board auto-fits: `cellSize = Math.floor(min(availW, availH) / gridSize)`, minimum 32 px, maximum 80 px
- Grid is always centered in canvas
- **No pan, no zoom, no pinch** — game is always fully visible

### 3.3 D-Pad Panels (left & right of canvas)

Two identical panels, `position: fixed`, vertically centered.  
Each has four arrow buttons arranged in a cross:

```
      [ ▲ ]
[ ◀ ] [ · ] [ ▶ ]
      [ ▼ ]
```

Button style: same `.nav-btn` (62 px circle, glass) from reference.  
On narrow screens (width < 640 px): hide both D-pads to save space (keyboard + drag still work).  
On tablet/desktop: show both (one on each side).

### 3.4 Status Bar (`#statusBar`)

Fixed bottom, same dark-glass style as reference:

```
Moves: 3  |  Best: 2  |  Size: 6×6  |  Seed: a1b2c3  [copy icon]
```

- **Moves**: increments each time pawn successfully slides (even if it doesn't move far)
- **Best**: optimal move count for this puzzle (computed at generation time by BFS); shows `—` in editor mode
- **Seed**: monospace font, click to copy

---

## 4. Game State Object (`GS`)

```js
const GS = {
  // Board
  gridSize:    6,          // n, grid is n×n
  grid:        [],         // 2D array: 0=floor, 1=wall
  startCell:   {r,c},
  endCell:     {r,c},

  // Pawn
  pawnCell:    {r,c},      // current logical cell
  pawnPixel:   {x,y},      // animated canvas position
  isSliding:   false,      // pawn in motion?

  // Ghost
  ghostCell:   null,       // current ghost draw cell (or null)
  ghostPath:   [],         // sequence of cells ghost travels
  ghostIndex:  0,
  ghostActive: false,
  solveCooldown: false,

  // Input
  dragStart:   null,       // {x,y} screen coords
  dragCurrent: null,
  isDragging:  false,

  // Difficulty / meta
  difficulty:  'MEDIUM',   // 'EASY' | 'MEDIUM' | 'HARD'
  seed:        '',
  moveCount:   0,
  optimalMoves: 0,

  // Mode
  mode:        'PLAY',     // 'PLAY' | 'EDITOR'
  editorTool:  'WALL',     // 'WALL' | 'START' | 'END'

  // Animation
  animId:      null,
  trail:       [],         // [{r,c, opacity}] cells to fade
};
```

---

## 5. Map Generation Algorithm

### 5.1 Seeded PRNG

Use a simple seeded pseudo-random number generator (Mulberry32 or xoshiro128) so the same seed always reproduces the same map.

```js
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
```

Seed string → number: `hashStr(s) = s.split('').reduce((a,c) => (Math.imul(31,a)+c.charCodeAt(0))|0, 0)`

### 5.2 Generation Loop

```
generateMap(seed, gridSize, difficulty):
  1. Initialize grid: all cells = 0 (floor)
  2. Place random walls:
     - Easy:   wall density ~15%
     - Medium: wall density ~22%
     - Hard:   wall density ~28%
  3. Place start (⭕) and end (⭐) cells:
     - Random empty cells, must be ≥ gridSize/2 apart (Manhattan)
  4. Solve: run ice-BFS to find all distinct move sequences
     (see §5.3)
  5. Count solution paths:
     - Easy:   require ≥ 3 paths → accept
     - Medium: require 2–3 paths → accept
     - Hard:   require exactly 1 path → accept
  6. If not accepted: mutate walls slightly and retry (max 500 attempts)
  7. Compute optimalMoves = length of shortest solution path
  8. Encode map as seed string (see §5.4)
```

### 5.3 Ice-Floor BFS (core solver)

The pawn slides from cell `(r,c)` in direction `dir` until it hits a wall or boundary. Implement `slide(grid, r, c, dir) → {r2, c2}`.

BFS state: `{r, c, moves: [dir, ...]}`.  
Goal: reach `endCell` by stopping on it (not passing through).  
Explored set: `Set` of `"r,c"` strings (since stopping position uniquely defines state).  
"One-way" constraint for Medium/Hard: do NOT revisit a cell that the pawn has already **stopped on** in this path (prevents backtracking to old stop positions).

Find **all** solutions up to a maximum depth (Easy: 12, Medium: 8, Hard: 6) to count paths.

### 5.4 Seed / Map ID Encoding

Encode the full map as a compact base64 string:

```
FORMAT: {gridSize}{difficulty_char}{wallBitmask_base64}{startR}{startC}{endR}{endC}
```

- `difficulty_char`: E/M/H
- `wallBitmask`: each cell is 1 bit (1=wall), packed into bytes, then base64url encoded
- Append 4 digits for start/end cells (zero-padded row+col each 0-9)

Seed displayed in status bar is the first 8 chars of this string for brevity; full string in input field.

---

## 6. Input Handling

### 6.1 Keyboard

```
document.addEventListener('keydown', e => {
  const map = {
    ArrowUp:'UP', ArrowDown:'DOWN', ArrowLeft:'LEFT', ArrowRight:'RIGHT',
    w:'UP', s:'DOWN', a:'LEFT', d:'RIGHT',
    W:'UP', S:'DOWN', A:'LEFT', D:'RIGHT'
  };
  const dir = map[e.key];
  if (dir && !GS.isSliding && GS.mode === 'PLAY') {
    e.preventDefault();
    applyMove(dir);
  }
});
```

### 6.2 Mouse / Touch Drag (gesture zone = entire canvas)

**Threshold:** drag must travel ≥ 30 px before committing direction.  
**Direction lock:** once threshold crossed, direction is locked for that drag gesture.  
**Visual feedback:** draw dashed line from `dragStart` to current pointer, with an arrowhead.

```
pointerdown → record dragStart
pointermove →
  if dragging:
    dx = current.x - dragStart.x
    dy = current.y - dragStart.y
    if |dx| > 30 or |dy| > 30:
      dir = |dx| > |dy| ? (dx>0 ? RIGHT : LEFT) : (dy>0 ? DOWN : UP)
      draw gesture line on canvas overlay
pointerup →
  if threshold crossed and not sliding: applyMove(dir)
  clear drag state
```

Disable `touch-action` everywhere on the game canvas and `<body>`. Also call `e.preventDefault()` on all touch events to block browser scroll/zoom.

```js
document.addEventListener('gesturestart', e => e.preventDefault()); // iOS safari
document.addEventListener('gesturechange', e => e.preventDefault());
```

### 6.3 D-Pad Buttons

```js
['UP','DOWN','LEFT','RIGHT'].forEach(dir => {
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (!GS.isSliding && GS.mode === 'PLAY') applyMove(dir);
  });
});
```

---

## 7. Core Game Logic

### 7.1 `slide(grid, r, c, dir, n)` → `{r2, c2, passed: [{r,c}]}`

```
dr/dc = direction deltas
r2 = r, c2 = c
passed = []
loop:
  nr = r2 + dr, nc = c2 + dc
  if out-of-bounds OR grid[nr][nc] === 1: break
  r2 = nr, c2 = nc
  passed.push({r:r2, c:c2})
return {r2, c2, passed}
```

### 7.2 `applyMove(dir)`

```
1. if GS.isSliding: return (ignore input during animation)
2. {r2, c2, passed} = slide(GS.grid, GS.pawnCell.r, GS.pawnCell.c, dir, GS.gridSize)
3. if r2 === GS.pawnCell.r && c2 === GS.pawnCell.c: 
     showToast("Can't move that way!"); return  (wall immediately adjacent)
4. GS.moveCount++
5. GS.isSliding = true
6. animateSlide(GS.pawnCell, {r:r2,c:c2}, passed, () => {
     GS.pawnCell = {r:r2, c:c2}
     GS.isSliding = false
     addTrail(passed)
     checkWin()
   })
```

### 7.3 `checkWin()`

```
if GS.pawnCell.r === GS.endCell.r && GS.pawnCell.c === GS.endCell.c:
  triggerWin()
```

### 7.4 `triggerWin()`

1. Play canvas confetti animation (no audio file required — optional Web Audio API beep)
2. Pulse ⭐ cell
3. After 800 ms: show Win Modal

---

## 8. Solve / Ghost Hint (§7 in requirements)

### 8.1 Trigger

Button "💡 Solve" in top bar.  
**Cooldown:** 30 seconds between uses. Show countdown on button label: `💡 28s`.  
Pawn must be at start cell OR ghost shows solution from start regardless of current pawn position.

### 8.2 Ghost Animation

```
1. Run ice-BFS from startCell to endCell → solutionMoves[]
2. Compute ghost path: sequence of {r,c} stop cells
3. ghostCell = startCell (draw ghost at start)
4. For each move in solutionMoves with 600ms delay between:
   a. Animate ghost pawn sliding to next stop cell (same animateSlide but ghost style)
   b. Ghost leaves a faded dashed trail
5. Ghost disappears after reaching endCell
6. Real pawn position is UNCHANGED
```

Ghost visual: same circle as pawn but `globalAlpha = 0.35`, dashed stroke border, lighter fill `#a8c8ff`.

---

## 9. Editor Mode

### 9.1 Activation

Top bar "✏️ Editor" button toggles `GS.mode = 'EDITOR'`.  
Top bar gets extra controls injected (same pattern as `#customControls` in reference):

```
[Wall ✏️] [Start ⭕] [End ⭐] [Clear] [Size: − N +] [Test ▶]
```

### 9.2 Cell Painting

In editor mode, `pointerdown + pointermove` on canvas paints cells:  
- Active tool = **Wall**: click toggles floor↔wall  
- Active tool = **Start ⭕**: click moves start marker  
- Active tool = **End ⭐**: click moves end marker  
- Only one start and one end cell allowed at a time

### 9.3 Validation & Test

"Test ▶" button:
1. Runs ice-BFS solver
2. If no solution found → show toast "No valid path! Add/remove walls."
3. If solution found → switch to PLAY mode, place pawn at start, show `optimalMoves`

### 9.4 Map Export

After validation, encode map to seed string and show in seed input field.

---

## 10. Difficulty-Aware Map Generation Details

### EASY
- Wall density: 15 % of interior cells
- Minimum 3 distinct solution paths (BFS counts unique stop-sequences)
- Max depth search: 12 moves
- Optimal moves: typically 3–5

### MEDIUM (default on load)
- Wall density: 22 %
- 2–3 distinct solution paths (no revisiting previously stopped cells)
- Max depth: 8
- Optimal moves: typically 4–7

### HARD
- Wall density: 28 %
- Exactly 1 solution path
- Max depth: 6
- Optimal moves: typically 5–8
- Generation may take more retries (up to 500); show brief spinner if > 200ms

> **Important note for generation:** always verify that the start and end cells are NOT walls, and that the start cell will actually cause the pawn to slide (i.e., start cell is not surrounded on all 4 sides by walls — there must be at least one valid first slide).

---

## 11. Win Modal

Same pattern as `#winModal` / `#winCard` in reference with `popIn` animation.

```html
<div id="winModal">
  <div id="winCard">
    <h2>🎉 Nailed it!</h2>
    <p>You slid the pawn to the ⭐</p>
    <div class="win-stats-grid">
      <div class="win-stat"><div class="val" id="wMoves">0</div><div class="lbl">Your Moves</div></div>
      <div class="win-stat"><div class="val" id="wOptimal">0</div><div class="lbl">Optimal</div></div>
      <div class="win-stat"><div class="val" id="wRating">⭐⭐⭐</div><div class="lbl">Rating</div></div>
    </div>
    <div class="win-actions">
      <button class="win-btn win-btn-replay" onclick="G.reset()">🔄 Retry</button>
      <button class="win-btn win-btn-next"   onclick="G.newMap()">⏭ Next</button>
    </div>
  </div>
</div>
```

**Star rating:**
- ⭐⭐⭐ — completed in `optimal` moves
- ⭐⭐ — completed in `optimal + 1` or `+2` moves  
- ⭐ — completed in `> optimal + 2` moves

---

## 12. Responsive / Auto-Fit Rules

```js
function computeLayout() {
  const topH    = 56;   // top bar height
  const botH    = 38;   // status bar height
  const dpadW   = window.innerWidth >= 640 ? 96 : 0; // show dpads only if wide enough
  const availW  = window.innerWidth  - dpadW * 2 - 16;
  const availH  = window.innerHeight - topH - botH   - 16;
  const cellSize = Math.max(32, Math.min(80, Math.floor(Math.min(availW, availH) / GS.gridSize)));
  const boardPx  = cellSize * GS.gridSize;
  // center canvas
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight - topH - botH;
  canvas.style.top = topH + 'px';
  GS.boardOffsetX = (canvas.width  - boardPx) / 2;
  GS.boardOffsetY = (canvas.height - boardPx) / 2;
  GS.cellSize = cellSize;
}
window.addEventListener('resize', () => { computeLayout(); render(); });
```

Viewport meta (prevent all zooming):
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0,
  maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">
```

Also add:
```js
document.addEventListener('wheel',        e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove',    e => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
```

---

## 13. Rendering Pipeline

Single `render()` function, called via `requestAnimationFrame` loop during animations and directly on state changes.

```
render():
  ctx.clearRect(0,0,canvas.width,canvas.height)
  drawBackground()       // soft gradient, same #e8edf5 as body
  drawTrails()           // fading blue path cells
  drawGrid()             // floor cells + wall cells
  drawStartEnd()         // ⭕ and ⭐ with glow
  if ghostActive: drawGhost()
  drawPawn()             // animated position (lerped pixel)
  if isDragging: drawGestureLine()
  drawBoundary()         // outer border ring
```

### Cell Drawing

```js
function drawCell(ctx, px, py, size, type) {
  const r = size * 0.12;  // corner radius
  ctx.beginPath();
  ctx.roundRect(px+1, py+1, size-2, size-2, r);
  if (type === 'floor') {
    ctx.fillStyle = 'rgba(220,232,255,0.7)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (type === 'wall') {
    ctx.fillStyle = '#2c3e50';
    ctx.fill();
    // highlight top/left edges for 3-D feel
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
```

### Pawn Drawing

```js
function drawPawnAt(ctx, px, py, cellSize, alpha=1, ghost=false) {
  const cx = px + cellSize/2, cy = py + cellSize/2;
  const r  = cellSize * 0.34;
  ctx.save();
  ctx.globalAlpha = alpha;
  // shadow
  if (!ghost) {
    ctx.shadowColor = 'rgba(79,142,247,0.5)';
    ctx.shadowBlur  = 10;
  }
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = ghost ? '#a8c8ff' : '#4F8EF7';
  ctx.fill();
  if (ghost) { ctx.setLineDash([4,3]); }
  ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke();
  ctx.setLineDash([]);
  // face
  if (!ghost) {
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(cx-r*0.28, cy-r*0.15, r*0.13, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+r*0.28, cy-r*0.15, r*0.13, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy+r*0.2, r*0.22, 0, Math.PI); ctx.stroke();
  }
  ctx.restore();
}
```

### Gesture Line Drawing

```js
function drawGestureLine(ctx) {
  if (!GS.dragStart || !GS.dragCurrent) return;
  const {x:x1,y:y1} = GS.dragStart;
  const {x:x2,y:y2} = GS.dragCurrent;
  ctx.save();
  ctx.setLineDash([8,5]);
  ctx.strokeStyle = 'rgba(79,142,247,0.7)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  // arrowhead
  const angle = Math.atan2(y2-y1, x2-x1);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(79,142,247,0.85)';
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2-18*Math.cos(angle-0.4), y2-18*Math.sin(angle-0.4));
  ctx.lineTo(x2-18*Math.cos(angle+0.4), y2-18*Math.sin(angle+0.4));
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
```

---

## 14. Slide Animation Implementation

```js
function animateSlide(fromCell, toCell, passedCells, onDone) {
  const startPx = cellToPixel(fromCell);
  const endPx   = cellToPixel(toCell);
  const cells   = [fromCell, ...passedCells]; // for trail
  const dist    = passedCells.length;
  const duration = Math.min(420, 200 + dist * 20); // ms
  const startTime = performance.now();

  function frame(now) {
    let t = Math.min(1, (now - startTime) / duration);
    t = 1 - Math.pow(1-t, 3); // ease-out-cubic (icy deceleration)
    GS.pawnPixel.x = startPx.x + (endPx.x - startPx.x) * t;
    GS.pawnPixel.y = startPx.y + (endPx.y - startPx.y) * t;
    render();
    if (t < 1) { GS.animId = requestAnimationFrame(frame); }
    else        { GS.pawnPixel = {...endPx}; onDone(); }
  }
  GS.animId = requestAnimationFrame(frame);
}
```

---

## 15. Local Storage Persistence

Save on every state-relevant change:

```js
function saveSettings() {
  try {
    localStorage.setItem('ICE_settings', JSON.stringify({
      gridSize:   GS.gridSize,
      difficulty: GS.difficulty,
      seed:       GS.seed,
    }));
  } catch {}
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('ICE_settings') || '{}');
    if (s.gridSize)   GS.gridSize   = Math.max(4, Math.min(10, s.gridSize));
    if (s.difficulty) GS.difficulty = s.difficulty;
    if (s.seed)       GS.seed       = s.seed;
  } catch {}
}
```

On load: `loadSettings()` → if seed exists, `loadMapFromSeed(GS.seed)`, else `generateMap()`.

---

## 16. HTML Structure Skeleton

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0,
    maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">
  <title>🧊 Ice Puzzle</title>
  <style>/* ... all CSS ... */</style>
</head>
<body>

<!-- Loading Screen (same pattern as reference) -->
<div id="loadingScreen">
  <div class="loader"></div>
  <h1>🧊 Ice Puzzle</h1>
  <p>Generating puzzle…</p>
</div>

<!-- Game Canvas (full screen) -->
<canvas id="gameCanvas"></canvas>

<!-- Top Bar -->
<div id="topBar" class="glass">
  <!-- size stepper -->
  <div class="ctrl-group">
    <button class="ctrl-btn" id="btnSizeDown">−</button>
    <span   class="ctrl-label" id="sizeLabel">6×6</span>
    <button class="ctrl-btn" id="btnSizeUp">+</button>
  </div>
  <!-- difficulty -->
  <button class="ctrl-btn" id="btnDifficulty">
    <span class="icon">🎯</span><span id="diffLabel">Medium</span>
  </button>
  <!-- reset -->
  <button class="ctrl-btn" id="btnReset" title="Reset puzzle">↺ Reset</button>
  <!-- new map -->
  <button class="ctrl-btn" id="btnNew" title="New puzzle">✨ New</button>
  <!-- editor -->
  <button class="ctrl-btn" id="btnEditor" title="Map editor">✏️ Edit</button>
  <!-- solve hint -->
  <button class="ctrl-btn" id="btnSolve" title="Show solution hint">💡 Solve</button>
  <!-- seed input -->
  <input type="text" id="seedInput" placeholder="Seed ID…"
         autocomplete="off" spellcheck="false">

  <!-- EDITOR CONTROLS (hidden by default) -->
  <div id="editorControls" style="display:none">
    <button class="ctrl-btn active" id="btnToolWall">✏️ Wall</button>
    <button class="ctrl-btn"        id="btnToolStart">⭕ Start</button>
    <button class="ctrl-btn"        id="btnToolEnd">⭐ End</button>
    <button class="ctrl-btn"        id="btnClear">🗑 Clear</button>
    <button class="ctrl-btn"        id="btnTest">▶ Test</button>
  </div>
</div>

<!-- Left D-Pad -->
<div id="dpadLeft" class="dpad">
  <button class="dpad-btn" data-dir="UP">▲</button>
  <div class="dpad-mid">
    <button class="dpad-btn" data-dir="LEFT">◀</button>
    <div class="dpad-center"></div>
    <button class="dpad-btn" data-dir="RIGHT">▶</button>
  </div>
  <button class="dpad-btn" data-dir="DOWN">▼</button>
</div>

<!-- Right D-Pad (identical) -->
<div id="dpadRight" class="dpad">
  <!-- same buttons -->
</div>

<!-- Status Bar -->
<div id="statusBar">
  <div class="status-item"><span class="label">Moves</span><span id="movesVal">0</span></div>
  <div class="status-item"><span class="label">Best</span><span id="bestVal">—</span></div>
  <div class="status-item"><span class="label">Size</span><span id="sizeVal">6×6</span></div>
  <div id="seedDisplay" title="Click to copy seed">—</div>
</div>

<!-- Win Modal -->
<div id="winModal">
  <div id="winCard">
    <h2>🎉 Nailed it!</h2>
    <p class="win-sub">Pawn reached the ⭐</p>
    <div class="win-stats-grid">
      <div class="win-stat"><div class="val" id="wMoves">0</div><div class="lbl">Your Moves</div></div>
      <div class="win-stat"><div class="val" id="wOptimal">0</div><div class="lbl">Optimal</div></div>
      <div class="win-stat"><div class="val" id="wRating">⭐⭐⭐</div><div class="lbl">Rating</div></div>
    </div>
    <div class="win-actions">
      <button class="win-btn win-btn-replay" id="wBtnRetry">🔄 Retry</button>
      <button class="win-btn win-btn-next"   id="wBtnNext">⏭ Next</button>
    </div>
  </div>
</div>

<!-- Toast -->
<div id="toast"></div>

<script>/* ... all JS ... */</script>
</body>
</html>
```

---

## 17. JavaScript Module Structure

Organize inside one `<script>` tag in this order:

```
1.  CSS Variables + DOM refs
2.  GS (game state object)
3.  PRNG + seed utilities
4.  Grid helpers: slide(), isInBounds(), cellToPixel(), pixelToCell()
5.  BFS solver: iceBFS(), countSolutions()
6.  Map generator: generateMap(seed, size, difficulty)
7.  Map encoder/decoder: encodeMap(), decodeMap(str)
8.  Animation: animateSlide(), animateGhost(), confetti()
9.  Rendering: render(), drawGrid(), drawPawn(), drawGhost(), drawGestureLine(), drawTrails()
10. Input handlers: keyboard, pointer (drag), D-pad buttons
11. Game logic: applyMove(), checkWin(), triggerWin(), reset()
12. UI helpers: showToast(), updateStatusBar(), updateWinModal(), solveCooldown()
13. Editor: enterEditorMode(), exitEditorMode(), handleEditorClick(), validateEditorMap()
14. Settings: saveSettings(), loadSettings()
15. Layout: computeLayout(), resizeCanvas()
16. init() — entry point
```

---

## 18. Key Constraints & Edge Cases

| Scenario | Handling |
|---|---|
| Pawn already adjacent to wall in chosen direction | Toast "Can't move that way!" — move NOT counted |
| Player passes through ⭐ without stopping | No win — pawn continues to next wall |
| Generator fails after 500 retries | Reduce wall density by 3 % and retry |
| Hard puzzle on 4×4 grid | May be impossible; fallback to Medium if no 1-solution found in 500 tries |
| Seed input invalid / not decodeable | Toast "Invalid seed" — keep current map |
| Editor: no start or end placed | Toast "Place ⭕ start and ⭐ end first" |
| Window resize mid-game | Recompute layout, re-render, pawn pixel position recalculated from logical cell |
| Ghost running while player moves | Ghost is cancelled/cleared when player makes a move |

---

## 19. Accessibility & UX Polish

- **Touch devices:** disable double-tap zoom via `touch-action: manipulation` on all buttons; `touch-action: none` on canvas
- **Cursor:** `cursor: crosshair` on canvas in PLAY mode; `cursor: cell` in EDITOR mode
- **Button feedback:** `.ctrl-btn:active { transform: scale(0.94) }` (same as reference)
- **D-Pad visibility:** hide with `display:none` when `window.innerWidth < 640px`; show when wide
- **Solve button cooldown:** show `💡 Solve (28s)` countdown in button text using `setInterval`
- **New map transition:** brief canvas fade-out → generate → fade-in (300ms opacity transition)

---

## 20. File Checklist for Agent

- [ ] Single file: `ice_puzzle.html`
- [ ] No external images, fonts, or audio files required
- [ ] All CSS in `<style>` tag, all JS in `<script>` tag
- [ ] Tested with keyboard, mouse drag, touch drag
- [ ] No zoom or pan on board — always auto-fits
- [ ] Generator always produces solvable maps
- [ ] Seed round-trips: encode → decode → same map
- [ ] Editor produces valid maps or shows error
- [ ] Ghost hint works with cooldown
- [ ] Win modal shows correct stats and star rating
- [ ] Local storage saves and restores last difficulty/size/seed
