# Polyiamond Pattern Game — Agent Build Plan

> **Reference**: `pattern_ultimate.html` is in the same folder. Port ALL features that are not explicitly changed below. Reuse its CSS design system (acrylic panels, toolbar, status bar, seeds, export, puzzle library, stamp, snap, undo/redo, camera, welcome screen, confetti, toast, SFX stubs, preload screen) wholesale — only the shape engine and sidebar change.

---

## 0. Quick-Reference Changes vs Original

| Feature | Original | This Game |
|---|---|---|
| Shapes | 6 polygon types | 23 polyiamonds (n=1..6) |
| Sidebar | 1-column, 6 buttons | 2-column, scrollable, sectioned by n |
| Grid | none / triangle / square / star | **none + triangle only** |
| Rotation snap | 30° (some 15°) | **60°** for all pieces |
| Per-shape color | No | **Yes** — stored on instance |
| Context menu items | flip/rotate/dup/remove | flip/rotate/dup/remove + **Set Color** |
| Shape data model | `{type, x, y, rotation}` | `{type, cells[], x, y, rotation, flipped, color}` |

Everything else (UI layout, seeds, export PNG golden ratio, puzzle library, stamp, vertex snapping, camera, keyboard shortcuts, welcome modal, confetti, auto-zoom) is **identical** to the original.

---

## 1. Triangular Grid Coordinate System

### 1.1 Constants
```js
const S  = 44;                        // unit triangle side length (px)
const TH = S * Math.sqrt(3) / 2;     // row height ≈ S*0.866
const CELL = 120;                     // vtxGrid bucket size (reuse from original)
```

### 1.2 Triangle Cell Definition
Each triangle is addressed by `(col, row)` integers.  
`isUp(col, row) = (col + row) % 2 === 0`

**Vertex positions for cell (c, r):**
```js
function cellVerts(c, r) {
  const x0 = c * S / 2;
  const y0 = r * TH;
  if ((c + r) % 2 === 0) {          // UP triangle — apex at top
    return [
      { x: x0 + S/2, y: y0      },  // apex
      { x: x0 + S,   y: y0 + TH },  // bottom-right
      { x: x0,       y: y0 + TH },  // bottom-left
    ];
  } else {                           // DOWN triangle — apex at bottom
    return [
      { x: x0,       y: y0      },  // top-left
      { x: x0 + S,   y: y0      },  // top-right
      { x: x0 + S/2, y: y0 + TH },  // apex
    ];
  }
}
```

### 1.3 Adjacency Rules
```
UP(c,r) is adjacent to:   DOWN(c-1,r), DOWN(c+1,r), DOWN(c, r+1)
DOWN(c,r) is adjacent to: UP(c-1,r),   UP(c+1,r),   UP(c, r-1)
```

### 1.4 Polygon Merging (cells → single outline polygon)
This is the most critical algorithm. Given a set of `{c,r}` cells:

```js
function mergeCells(cells) {
  // 1. Collect all directed edges as [v0,v1] strings → count occurrences
  const edgeCount = new Map();
  for (const {c, r} of cells) {
    const vs = cellVerts(c, r);
    for (let i = 0; i < 3; i++) {
      const a = vs[i], b = vs[(i+1)%3];
      const fwd = ptKey(a) + '|' + ptKey(b);
      const rev = ptKey(b) + '|' + ptKey(a);
      edgeCount.set(fwd, (edgeCount.get(fwd)||0) + 1);
      edgeCount.set(rev, (edgeCount.get(rev)||0) + 1);
    }
  }
  // 2. Keep only edges that appear exactly once (not shared between 2 cells)
  //    Build adjacency map of pt → next pt for outline traversal
  const adj = new Map();   // ptKey → [ptKey, ...]
  for (const [edge, count] of edgeCount) {
    if (count === 1) {
      const [a, b] = edge.split('|');
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a).push(b);
    }
  }
  // 3. Walk the outline starting from first boundary point
  const start = adj.keys().next().value;
  const polygon = [start];
  let cur = start, prev = null;
  while (true) {
    const nexts = adj.get(cur).filter(n => n !== prev);
    const next = nexts[0];
    if (next === start) break;
    polygon.push(next);
    prev = cur; cur = next;
  }
  // 4. Convert ptKeys back to {x,y} objects
  return polygon.map(k => { const [x,y]=k.split(',').map(Number); return {x,y}; });
}

function ptKey(p) {
  return Math.round(p.x*100)/100 + ',' + Math.round(p.y*100)/100;
}
```

---

## 2. Piece Definitions — All 23 Polyiamonds

Each piece is defined as canonical `cells[]` (min col=0, min row=0, starts UP if possible). Pieces are **immutable canonical forms**; rotation/flip are applied at render-time via the transform on the instance.

### 2.1 Shape Data Structure (instance on board)
```js
{
  id:       "s1",          // unique id ("s" + counter)
  type:     "hex_bar",     // piece type key (matches PIECES table)
  x:        0,             // world-space x of piece ORIGIN (centroid of canonical cells)
  y:        0,             // world-space y
  rotation: 0,             // degrees: 0,60,120,180,240,300
  flipped:  false,         // horizontal mirror applied BEFORE rotation
  color:    null,          // null = use theme color; "#rrggbb" = override
}
```

### 2.2 Canonical Cell Tables

**n = 1 — Moniamond (1 piece)**
| Key | Name | Cells (c,r) |
|---|---|---|
| `mono` | Moniamond | [(0,0)] |

**n = 2 — Diamond (1 piece)**
| Key | Name | Cells |
|---|---|---|
| `diamond` | Diamond | [(0,0),(1,0)] |

> UP(0,0) + DOWN(1,0) share right edge of UP = left edge of DOWN → rhombus outline

**n = 3 — Triamond (1 piece)**
| Key | Name | Cells |
|---|---|---|
| `tri` | Triamond | [(0,0),(1,0),(2,0)] |

> 3 in a row: UP-DOWN-UP

**n = 4 — Tetriamonds (4 pieces)**
| Key | Name | Cells |
|---|---|---|
| `tet_bar` | Bar | [(0,0),(1,0),(2,0),(3,0)] |
| `tet_diamond` | Diamond | [(0,0),(1,0),(0,1),(1,1)] |
| `tet_hook` | Hook | [(0,0),(1,0),(2,0),(0,1)] |
| `tet_skew` | Skew | [(0,0),(1,0),(2,0),(2,1)] |

> Verify connectivity: each piece must form a connected graph under adjacency rules in §1.3.  
> The remaining 4th tetriamond can be found by checking all distinct connected 4-cell sets.

**n = 5 — Pentiamonds (4 pieces)**

Implement a generator (see §2.3) to enumerate all 4 canonical free pentiamonds. Their standard names:

| Key | Name |
|---|---|
| `pen_bar` | Pentiamond Bar (5 in a row) |
| `pen_hook` | Pentiamond Hook |
| `pen_diamond` | Pentiamond Diamond |
| `pen_chevron` | Pentiamond Chevron |

**n = 6 — Hexiamonds (12 pieces)**

Implement the generator to enumerate all 12. Standard names (use as display labels):

| Key | Name | Key | Name |
|---|---|---|---|
| `hex_bar` | Bar | `hex_crook` | Crook |
| `hex_crown` | Crown | `hex_lobster` | Lobster |
| `hex_hex` | Hexagon | `hex_hook` | Hook |
| `hex_rhomboid` | Rhomboid | `hex_snake` | Snake |
| `hex_sphinx` | Sphinx | `hex_triangle` | Triangle |
| `hex_chevron` | Chevron | `hex_yacht` | Yacht |

### 2.3 Canonical Form Generator (implement this — do not hardcode n≥5)
```js
// Generates all free polyiamonds of order n
// Returns array of canonical cell-sets [{c,r}[]]
function generatePolyiamonds(n) {
  if (n === 1) return [[{c:0,r:0}]];
  const smaller = generatePolyiamonds(n-1);
  const seen = new Set();
  const results = [];
  for (const poly of smaller) {
    for (const cell of poly) {
      for (const nb of neighbors(cell)) {
        if (poly.some(p => p.c===nb.c && p.r===nb.r)) continue;
        const candidate = [...poly, nb];
        const canon = canonicalize(candidate);
        const key = JSON.stringify(canon);
        if (!seen.has(key)) {
          seen.add(key);
          results.push(canon);
        }
      }
    }
  }
  return results;
}

function neighbors({c, r}) {
  if ((c+r)%2===0) // UP: 3 down neighbors
    return [{c:c-1,r},{c:c+1,r},{c,r:r+1}];
  else              // DOWN: 3 up neighbors
    return [{c:c-1,r},{c:c+1,r},{c,r:r-1}];
}

// Canonicalize = apply all 6 rotations × 2 flips, pick lexicographically smallest
function canonicalize(cells) {
  const transforms = [];
  for (let flip=0;flip<2;flip++)
    for (let rot=0;rot<6;rot++)
      transforms.push(applyTransform(cells, rot*60, flip===1));
  transforms.sort((a,b)=> JSON.stringify(a)<JSON.stringify(b)?-1:1);
  return transforms[0];
}

// Transform cells by rotating 60°×rot and optional horizontal flip,
// then translate so min(c)=0, min(r)=0
function applyTransform(cells, deg, flip) {
  // Convert (c,r) → cartesian centroid → rotate → convert back → normalize
  // Use the cellCentroid() helper and then find nearest valid cell coords
  // ... (implement using rotation matrix on centroid positions)
}
```

> **Implementation note**: For the transform, convert each cell to its centroid in world-space coordinates, rotate around `(0,0)`, then invert the centroid→cell mapping (round to nearest cell index). Translate so minimum column and row indices are 0.

---

## 3. World-Space Transform for Placed Piece

Given a placed piece instance, compute screen vertices:

```js
function worldVerts(sh) {
  const def = PIECES[sh.type];
  if (!def) return [];

  // 1. Get centroid of canonical cells for this piece type (pre-compute, cache)
  const refCentroid = getPieceCentroid(def.cells); // average of all cell centroids

  // 2. Build raw polygon from cells
  const rawPoly = mergeCells(def.cells); // [{x,y}] in local space

  // 3. Apply flip (horizontal mirror around centroid)
  let verts = rawPoly;
  if (sh.flipped) {
    verts = verts.map(v => ({ x: 2*refCentroid.x - v.x, y: v.y }));
  }

  // 4. Apply rotation around centroid
  const rad = sh.rotation * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  verts = verts.map(v => {
    const lx = v.x - refCentroid.x, ly = v.y - refCentroid.y;
    return {
      x: sh.x + lx*cos - ly*sin,
      y: sh.y + lx*sin + ly*cos,
    };
  });

  return verts;
}

function getPieceCentroid(cells) {
  let sx=0,sy=0;
  for(const {c,r} of cells) {
    const vs=cellVerts(c,r);
    sx+=vs.reduce((a,v)=>a+v.x,0)/3;
    sy+=vs.reduce((a,v)=>a+v.y,0)/3;
  }
  return {x:sx/cells.length, y:sy/cells.length};
}
```

---

## 4. Sidebar — 2-Column Scrollable Bank

### 4.1 HTML Structure
```html
<div id="sidebar" class="acrylic">
  <!-- Generated by buildPalette() -->
  <div class="palette-section">
    <div class="palette-label">n=1</div>
    <div class="palette-grid">  <!-- 2 columns -->
      <button class="shape-btn" data-type="mono">...</button>
    </div>
  </div>
  <div class="palette-section">
    <div class="palette-label">n=2</div>
    <div class="palette-grid">...</div>
  </div>
  <!-- ... n=3..6 -->
</div>
```

### 4.2 CSS for Sidebar
```css
#sidebar {
  position: fixed;
  left: 14px;
  top: 64px;               /* below toolbar */
  bottom: 64px;            /* above status bar */
  width: 210px;
  display: flex;
  flex-direction: column;
  padding: 10px 8px;
  border-radius: 18px;
  z-index: 200;
  overflow-y: auto;
  overflow-x: hidden;
  gap: 6px;
}
#sidebar::-webkit-scrollbar { width: 4px; }
#sidebar::-webkit-scrollbar-thumb { background:rgba(0,0,0,0.15); border-radius:4px; }

.palette-label {
  font-size: 10px; font-weight: 700; color: #888;
  text-transform: uppercase; letter-spacing: 1px;
  padding: 2px 4px; margin-bottom: 2px;
}
.palette-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.shape-btn {
  width: 100%; aspect-ratio: 1;
  border: none; background: transparent;
  border-radius: 10px; cursor: grab;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.13s, transform 0.12s;
  position: relative;
}
.shape-btn:hover { background: rgba(0,0,0,0.06); transform: scale(1.06); }
.shape-btn:active { cursor: grabbing; transform: scale(0.96); }
```

### 4.3 Building Palette
```js
const N_GROUPS = [
  { n:1, label:'n = 1 · Moniamond' },
  { n:2, label:'n = 2 · Diamond' },
  { n:3, label:'n = 3 · Triamond' },
  { n:4, label:'n = 4 · Tetriamonds' },
  { n:5, label:'n = 5 · Pentiamonds' },
  { n:6, label:'n = 6 · Hexiamonds' },
];

function buildPalette() {
  const sb = document.getElementById('sidebar');
  sb.innerHTML = '';
  for (const {n, label} of N_GROUPS) {
    const pieces = Object.entries(PIECES).filter(([,p])=>p.n===n);
    if (!pieces.length) continue;
    const sec = document.createElement('div');
    sec.className = 'palette-section';
    sec.innerHTML = `<div class="palette-label">${label}</div>`;
    const grid = document.createElement('div');
    grid.className = 'palette-grid';
    for (const [type, def] of pieces) {
      const btn = document.createElement('button');
      btn.className = 'shape-btn';
      btn.dataset.type = type;
      btn.innerHTML = buildPieceSVG(type, def) +
                      `<span class="tooltip">${def.name}</span>`;
      btn.addEventListener('pointerdown', e => { e.stopPropagation(); spawnPiece(type, e); });
      grid.appendChild(btn);
    }
    sec.appendChild(grid);
    sb.appendChild(sec);
  }
}

function buildPieceSVG(type, def) {
  // Render the canonical cells as a centered SVG preview (64×64 viewBox)
  const poly = mergeCells(def.cells);
  const xs = poly.map(v=>v.x), ys = poly.map(v=>v.y);
  const pw = Math.max(...xs)-Math.min(...xs);
  const ph = Math.max(...ys)-Math.min(...ys);
  const scale = 52 / Math.max(pw,ph,1) * 0.78;
  const cx = (Math.min(...xs)+Math.max(...xs))/2;
  const cy = (Math.min(...ys)+Math.max(...ys))/2;
  const pts = poly.map(v=>`${32+(v.x-cx)*scale},${32+(v.y-cy)*scale}`).join(' ');
  const fill = getInstanceColor(null, type);
  const stroke = '#333';
  return `<svg width="64" height="64" viewBox="0 0 64 64">
    <polygon points="${pts}" fill="${fill}" stroke="${stroke}"
      stroke-width="1.2" stroke-linejoin="round"/>
  </svg>`;
}
```

---

## 5. Grid System (Simplified — 2 Types Only)

Remove square and star grids entirely. The `GRID_TYPES` array becomes:
```js
const GRID_TYPES = [
  { id:'none',     icon:'❌', label:'Grid',     badge:'' },
  { id:'triangle', icon:'🔺', label:'Triangle', badge:'🔺 Tri' },
];
```

Remove the `altGridBtn` ("Sub") from toolbar — polyiamond game has no sub-grid.

**Triangle grid snapping** is identical to the original's triangle grid logic (reuse `snapToGrid`, `nearestTriVtx`, `setGridOrigin`). The snap cell size is `S` (the triangle side length). Rotation snap is 60° for all pieces (not 30°/15°).

**Seed themes** reduce to:
```js
const SEED_THEMES = {
  'none:0':     { color:'#9e9e9e', label:'Free Form' },
  'triangle:0': { color:'#FF9800', label:'Triangle Grid' },
};
```

---

## 6. Rotation & Flip

All polyiamond pieces snap to 60° multiples:
```js
function applyRotationSnap(sh) {
  sh.rotation = Math.round(sh.rotation / 60) * 60;
}
```

`rotateGroupBy` always uses ±60° (remove the 30°/15° branch from original).

Keyboard `[` and `]` rotate by −60° and +60°.

**Flip** for a polyiamond piece: set `sh.flipped = !sh.flipped`, then negate rotation to maintain visual orientation:
```js
function flipPiece(sh) {
  sh.flipped = !sh.flipped;
  sh.rotation = (360 - sh.rotation) % 360;
}
```

---

## 7. Per-Piece Color System

### 7.1 Color Storage
Each shape instance has `color: null | "#rrggbb"`. `null` = use the theme default for piece's n-group.

### 7.2 Default Theme Colors (by n-group)
```js
const N_COLORS = {
  1: '#FF6B6B',   // moniamond — red
  2: '#FF9F43',   // diamond — orange
  3: '#FECA57',   // triamond — yellow
  4: '#48DBFB',   // tetriamonds — cyan
  5: '#1DD1A1',   // pentiamonds — teal
  6: '#54A0FF',   // hexiamonds — blue
};
function getInstanceColor(sh, type) {
  if (sh && sh.color) return sh.color;
  const n = PIECES[type]?.n || 1;
  return N_COLORS[n];
}
```

### 7.3 16 Preset Swatches
```js
const COLOR_PRESETS = [
  '#FF6B6B','#FF9F43','#FECA57','#48DBFB',
  '#1DD1A1','#FF9FF3','#54A0FF','#5F27CD',
  '#C8D6E5','#8395A7','#EE5A24','#009432',
  '#0652DD','#9980FA','#ED4C67','#F8EFBA',
];
```

---

## 8. Context Menu (Right-Click Popup)

### 8.1 How to Trigger (same as original)
Right-click on canvas → if shape hit → show context menu at mouse position.

### 8.2 Menu Items
```
┌──────────────────────┐
│ ↔  Flip              │  ← flipPiece(sh)
│ ⟲  Rotate CCW  60°  │  ← sh.rotation=(sh.rotation-60+360)%360
│ ⟳  Rotate CW   60°  │  ← sh.rotation=(sh.rotation+60)%360
│ 📋 Duplicate         │  ← duplicateSelection()
│ ────────────────────  │
│ 🎨 Set Color         │  ← openColorPicker(sh)
│ ────────────────────  │
│ 🧽 Remove            │  ← deleteSelection() [danger color]
└──────────────────────┘
```

### 8.3 Color Picker Sub-Panel HTML

Opens as a second popup pinned below "Set Color" row (or replaces context menu):
```html
<div id="colorPicker" class="acrylic color-picker-panel" style="display:none">
  <div class="cp-swatches" id="cpSwatches"><!-- 16 buttons injected by JS --></div>
  <div class="cp-actions">
    <button id="cpCustomBtn">🖌 Custom…</button>
    <button id="cpDefaultBtn">↩ Default</button>
    <input type="color" id="cpNativeInput" style="display:none">
  </div>
</div>
```

```css
.color-picker-panel {
  position:fixed; z-index:1100;
  padding:10px; border-radius:14px;
  display:flex; flex-direction:column; gap:8px;
  width:172px;
}
.cp-swatches {
  display:grid; grid-template-columns:repeat(4,1fr); gap:6px;
}
.cp-swatch {
  width:32px; height:32px; border-radius:8px; border:2px solid transparent;
  cursor:pointer; transition:transform 0.12s, border-color 0.12s;
}
.cp-swatch:hover { transform:scale(1.15); border-color:rgba(255,255,255,0.6); }
.cp-swatch.active { border-color:#0078d4; transform:scale(1.1); }
.cp-actions {
  display:flex; gap:6px;
}
.cp-actions button {
  flex:1; padding:6px; border:none; border-radius:8px;
  background:rgba(0,0,0,0.06); cursor:pointer; font-size:11px;
}
```

```js
function openColorPicker(sh) {
  hideContextMenu();
  const panel = document.getElementById('colorPicker');
  const swatches = document.getElementById('cpSwatches');
  swatches.innerHTML = '';
  for (const color of COLOR_PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'cp-swatch' + (sh.color===color?' active':'');
    btn.style.background = color;
    btn.title = color;
    btn.addEventListener('click', () => {
      sh.color = color;
      saveUndo(); buildVtxGrid(); updateSeedDisplay(); saveGameState(); render();
      hideColorPicker();
    });
    swatches.appendChild(btn);
  }
  document.getElementById('cpDefaultBtn').onclick = () => {
    sh.color = null;
    saveUndo(); render(); hideColorPicker();
  };
  document.getElementById('cpCustomBtn').onclick = () => {
    const inp = document.getElementById('cpNativeInput');
    inp.value = sh.color || getInstanceColor(null, sh.type);
    inp.click();
  };
  document.getElementById('cpNativeInput').onchange = e => {
    sh.color = e.target.value;
    saveUndo(); render(); hideColorPicker();
  };
  // Position near clicked shape
  const sPos = w2s(sh.x, sh.y);
  panel.style.left = Math.min(sPos.x + 20, window.innerWidth - 190) + 'px';
  panel.style.top  = Math.min(sPos.y - 20, window.innerHeight - 200) + 'px';
  panel.style.display = 'flex';
}
function hideColorPicker() {
  document.getElementById('colorPicker').style.display = 'none';
}
```

---

## 9. Seed System

Port the B81 + LZ-string system from the original verbatim. Only change:

### 9.1 Version Prefix
Use `"v1pi:"` (polyiamond v1) to distinguish from the original game's seeds.

### 9.2 Shape Encoding
For each shape instance `{type, x, y, rotation, flipped, color}`:
```
Field           Encoding
type            index into sorted PIECE_KEYS array → toB81(index)
dx, dy          position relative to anchor → toB81(Math.round(dx)), toB81(Math.round(dy))
rotation        0..5 (÷60°) → single B81 char
flipped         '0' or '1'
color           if null → '0'; if preset → index+1; if custom → '#' + hex (6 chars)
```

Anchor = first shape in `board.shapes[]`.

```js
function exportSeed() {
  if (!board.shapes.length) return '';
  const anchor = board.shapes[0];
  const shapeTokens = board.shapes.map((sh, i) => {
    const dx = i===0 ? 0 : sh.x - anchor.x;
    const dy = i===0 ? 0 : sh.y - anchor.y;
    const rotIdx = Math.round(((sh.rotation%360)+360)%360 / 60) % 6;
    const flip = sh.flipped ? '1' : '0';
    const colorStr = encodeColor(sh.color);
    const typeIdx = PIECE_KEYS.indexOf(sh.type);
    return [toB81(typeIdx), toB81(Math.round(dx)), toB81(Math.round(dy)), rotIdx, flip, colorStr].join(',');
  });
  const gridPart = gridState.type + ':' + (gridState.alt?'1':'0');
  const raw = ['v1pi', gridPart, ...shapeTokens].join('~');
  return LZString.compressToEncodedURIComponent(raw);
}

function encodeColor(color) {
  if (!color) return '0';
  const idx = COLOR_PRESETS.indexOf(color);
  if (idx >= 0) return String(idx + 1);
  return color; // custom hex "#rrggbb"
}
function decodeColor(str) {
  if (str === '0') return null;
  const idx = parseInt(str, 10);
  if (!isNaN(idx) && idx >= 1) return COLOR_PRESETS[idx-1];
  return str; // custom hex
}
```

---

## 10. Snapping (Adapted from Original)

### 10.1 Vertex-to-Vertex Snap
Port `snapV2V`, `findImmediateContact`, `buildVtxGrid`, `worldVertsAndMids` from original verbatim. The polygon vertices for polyiamonds are computed by `worldVerts(sh)`.

### 10.2 Grid Snap  
Port `snapToGrid` from original. Use only the `triangle` branch (remove `square` and `star` branches). `snapToGrid` already uses `nearestTriVtx` which works perfectly for polyiamonds — the vertices of all polyiamonds land exactly on triangular grid points when the pieces are properly aligned.

### 10.3 Rotation Snap on Drop
```js
function applyRotationSnap(sh) {
  sh.rotation = Math.round(sh.rotation / 60) * 60;
}
```

### 10.4 Snap Leader
Port `findSnapLeader` from original. New size weights for polyiamonds:
```js
const SNAP_WEIGHTS = {
  hex_hex:8, hex_sphinx:7, hex_triangle:7,
  pen_diamond:5, pen_bar:5,
  tet_bar:4, tet_diamond:4,
  tri:3, diamond:2, mono:1,
};
// All others default to 1
```

---

## 11. Rendering (Canvas)

Port the entire `render()` function from original. For polyiamonds, `worldVerts(sh)` now returns merged polygon vertices instead of per-type hardcoded points.

```js
function render() {
  ctx.clearRect(0,0,W,H_win);
  ctx.save();
  ctx.translate(W/2, H_win/2);
  ctx.rotate(camera.rotation * Math.PI/180);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  // Draw grid (triangle only)
  if (gridState.type==='triangle' && gridState.layer==='behind') drawTriangleGrid();

  // Draw puzzle shapes (outline only, grey)
  for (const sh of board.puzzleShapes) {
    const vs = worldVerts(sh);
    drawPolygon(ctx, vs, 'transparent', 'rgba(100,100,200,0.35)', 1.5);
  }

  // Draw regular shapes
  for (const sh of board.shapes) {
    const vs = worldVerts(sh);
    const fill = getInstanceColor(sh, sh.type);
    const isSelected = sel.has(sh.id);
    drawPolygon(ctx, vs, fill, isSelected?'#0078d4':'rgba(0,0,0,0.25)',
                isSelected?2.5:1.4);
    if (isSelected) {
      ctx.shadowColor='rgba(0,120,212,0.4)';
      ctx.shadowBlur=12/camera.zoom;
    }
  }

  // Draw grid overlay
  if (gridState.type==='triangle' && gridState.layer==='overlay') drawTriangleGrid();

  // Draw rotation handle, marquee (port from original)
  ctx.restore();
  requestAnimationFrame(render);
}

function drawPolygon(ctx, vs, fill, stroke, lw) {
  if (!vs.length) return;
  ctx.beginPath();
  ctx.moveTo(vs[0].x, vs[0].y);
  for (let i=1;i<vs.length;i++) ctx.lineTo(vs[i].x,vs[i].y);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = lw/camera.zoom;
  ctx.lineJoin = 'round'; ctx.stroke();
}
```

---

## 12. Export (PNG — Golden Ratio)

Port `openExportPreview`, `updateExportPreview`, `downloadExport` from original verbatim. The only change: remove the grid-thickness slider for square/star patterns; keep just the two sliders (outline thickness, triangle-grid thickness).

In `updateExportPreview()`, replace the `getShapeColor(sh.type)` call with `getInstanceColor(sh, sh.type)` to respect per-piece colors.

---

## 13. Puzzle Library

Port the entire library system from original verbatim:
- `globalLibrary`, `devFileHandle`, `initGlobalLibrary`
- `openLibraryModal`, `closeLibraryModal`, `updateLibDisplay`
- `saveCurrentToLibrary`, `deleteFromLibrary`
- `saveToLibBtn` visibility toggle (show when puzzle shapes exist)
- Library card thumbnails: render shapes onto off-screen canvas using `worldVerts`
- JSON file sync (`pickDevFile`, `syncToDevJson`, `refreshLibrary`)

Change library file name to `polyiamond_user_puzzle.json` to avoid conflicts.

---

## 14. Stamp System

Port `promptStampSeed`, `stampSeed` from original verbatim. A stamp loads shapes as `board.shapes` without setting puzzle shapes — it's just a way to paste a saved layout from a seed.

---

## 15. Toolbar HTML

```html
<div id="toolbar" class="acrylic">
  <button class="tb-btn" onclick="window.location.href='index.html'" title="Home">🏠</button>
  <span class="tb-title" onclick="openWelcome()">🔺 Polyiamond</span>
  <div class="tb-sep"></div>
  <button class="tb-btn" onclick="undo()" title="Ctrl+Z">↩</button>
  <button class="tb-btn" onclick="redo()" title="Ctrl+Y">↪</button>
  <div class="tb-sep"></div>
  <button class="tb-btn" onclick="clearBoard()">🧽 Clear</button>
  <button class="tb-btn" onclick="promptStampSeed()">📥 Stamp</button>
  <button class="tb-btn" onclick="promptPuzzleSeed()">🧩 Puzzle</button>
  <button class="tb-btn" onclick="clearPuzzles()">🧽 Clear Puz</button>
  <button class="tb-btn" onclick="openExportPreview()">🖼️ Export</button>
  <div class="tb-sep"></div>
  <!-- NO theme button — color is per-piece -->
  <button class="tb-btn" id="gridTypeBtn" onclick="cycleGridType()" title="G">📐 Grid</button>
  <button class="tb-btn dim" id="gridLayerBtn" onclick="cycleGridLayer()" title="V">🔽 Behind</button>
</div>
```

Remove "Sub" and "Theme" buttons. All other toolbar behavior is unchanged.

---

## 16. Status Bar

Port from original verbatim:
- Zoom panel (`−`, `%`, `+`)
- Camera rotation panel (`↺`, `°`, `↻`, reset)
- Library panel (`📚 N`, `💾`, `📁`, `🔄`)
- Grid badge
- Seed panel (input, `📋`, `🔗`)

No changes needed to status bar.

---

## 17. Keyboard Shortcuts

| Key | Action |
|---|---|
| `[` | Rotate selection −60° |
| `]` | Rotate selection +60° |
| `G` | Cycle grid (none/triangle) |
| `V` | Cycle grid layer |
| `Q` / `E` | Rotate camera −30° / +30° |
| `R` | Reset camera rotation |
| `0` | Fit view |
| `+` / `−` | Zoom in/out |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+D` | Duplicate selection |
| `Ctrl+A` | Select all |
| `Ctrl+C` / `Ctrl+V` | Copy / Paste |
| `Del` / `Backspace` | Delete selection |
| `Esc` | Deselect all |

Remove `T` (sub-grid) key binding.

---

## 18. spawnPiece (Drag from Sidebar)

```js
function spawnPiece(type, e) {
  saveUndo();
  const wc = s2w(W/2, H_win/2);
  const sh = {
    id:       's' + idCtr++,
    type:     type,
    x:        wc.x,
    y:        wc.y,
    rotation: 0,
    flipped:  false,
    color:    null,
  };
  board.shapes.push(sh);
  sel.clear(); sel.add(sh.id);
  setGridOrigin(sh);
  buildVtxGrid();
  updateSeedDisplay();
  updateActionBar();
  saveGameState();
  render();
  // Immediately start dragging (same pointer capture pattern as original)
  const w = s2w(pointerPos(e).x, pointerPos(e).y);
  drag = { offs: { [sh.id]: { dx: sh.x - w.x, dy: sh.y - w.y } } };
  sh._moving = true;
  canvas.setPointerCapture(e.pointerId);
}
```

---

## 19. Hit Testing

```js
function shapeAt(wx, wy) {
  // Walk board.shapes in reverse (topmost first)
  for (let i = board.shapes.length-1; i>=0; i--) {
    const sh = board.shapes[i];
    if (pointInPolygon(wx, wy, worldVerts(sh))) return sh;
  }
  return null;
}

function pointInPolygon(px, py, vs) {
  let inside = false;
  for (let i=0,j=vs.length-1; i<vs.length; j=i++) {
    const xi=vs[i].x,yi=vs[i].y,xj=vs[j].x,yj=vs[j].y;
    if (((yi>py)!==(yj>py)) && (px<(xj-xi)*(py-yi)/(yj-yi)+xi))
      inside = !inside;
  }
  return inside;
}
```

---

## 20. PIECES Registry

Build `PIECES` as a plain object, populated by the generator + manually assigned names:

```js
const PIECES = {};   // populated at init

function initPieces() {
  const groups = [
    { n:1, names:['Moniamond'] },
    { n:2, names:['Diamond'] },
    { n:3, names:['Triamond'] },
    { n:4, names:['Bar','Hook','Skew','Diamond'] },
    { n:5, names:['Bar','Hook','Diamond','Chevron'] },
    { n:6, names:['Bar','Crook','Crown','Lobster','Hexagon',
                  'Hook','Rhomboid','Snake','Sphinx','Triangle','Chevron','Yacht'] },
  ];
  for (const {n, names} of groups) {
    const forms = generatePolyiamonds(n);
    forms.forEach((cells, i) => {
      const key = n===1?'mono': n===2?'diamond': n===3?'tri':
                  `${'mono di tri tet pen hex'.split(' ')[n-1]}_${i}`;
      PIECES[key] = { n, cells, name: names[i] || `n${n}-${i+1}` };
    });
  }
  PIECE_KEYS = Object.keys(PIECES);
}
```

> **Important**: The generator's output order may differ from the `names[]` arrays above. After generating, visually confirm which generated form matches which standard name, then hard-code the name mapping if needed.

---

## 21. PIECES Registry — Initial Precomputed Cells (Seed)

To avoid runtime generation overhead on first load, pre-compute canonical cells once and cache:

```js
let PIECE_KEYS = [];
let CELL_CACHE = {};   // type → mergeCells(cells) polygon (cached)

function getPiecePoly(type) {
  if (!CELL_CACHE[type]) CELL_CACHE[type] = mergeCells(PIECES[type].cells);
  return CELL_CACHE[type];
}
```

---

## 22. Action Bar

Port from original verbatim. Adjust button labels/actions for 60° rotation:

```html
<div id="actionBar" class="acrylic hidden">
  <span class="ab-label" id="selCount">1 selected</span>
  <div class="ab-sep"></div>
  <button class="ab-btn" onclick="rotateGroupBy(-60)" title="[ — Rotate −60°">⟲</button>
  <button class="ab-btn" onclick="rotateGroupBy(60)"  title="] — Rotate +60°">⟳</button>
  <div class="ab-sep"></div>
  <button class="ab-btn" onclick="flipSelectionH()" title="Flip">↔</button>
  <div class="ab-sep"></div>
  <button class="ab-btn" onclick="openColorPickerForSelection()" title="Color">🎨</button>
  <div class="ab-sep"></div>
  <button class="ab-btn" onclick="duplicateSelection()" title="Ctrl+D">📋</button>
  <button class="ab-btn danger" onclick="deleteSelection()" title="Del">🧽</button>
</div>
```

`openColorPickerForSelection()`: picks first selected shape and calls `openColorPicker(sh)`.

---

## 23. Welcome Screen

Port from original verbatim. Change emoji to 🔺 and title to "Polyiamond".  
Remove any reference to theme or square/star grid in the welcome tips.

---

## 24. File Structure (Single HTML)

```
polyiamond_game.html   ← single self-contained file
polyiamond_user_puzzle.json  ← (optional, user-created, not bundled)
```

All JavaScript is inline `<script>` at bottom of `<body>`, same as original.  
All CSS is inline `<style>` in `<head>`.

Include `LZString` library (copy from original's inline copy).  
Include `BIP39_WORDS` array for phrase seed feature (copy from original).  
Include `SFX` stub (copy from original).

---

## 25. Implementation Checklist

### Phase 1 — Core Engine
- [ ] Implement `cellVerts(c,r)` 
- [ ] Implement `mergeCells(cells)` polygon merger
- [ ] Implement `generatePolyiamonds(n)` for n=1..6
- [ ] Implement `canonicalize(cells)` with all 12 transforms (6 rot × 2 flip)
- [ ] Build `PIECES` registry, verify all 23 pieces generate correctly
- [ ] Implement `worldVerts(sh)` with rotation + flip + position
- [ ] Implement `getPieceCentroid(cells)`
- [ ] Implement `pointInPolygon` hit test

### Phase 2 — Sidebar & Palette
- [ ] 2-column scrollable sidebar with `n=1..6` sections
- [ ] `buildPieceSVG` renders correct preview for each piece
- [ ] Drag-to-spawn works from sidebar

### Phase 3 — Interactions (port from original)
- [ ] Camera (pan, zoom, rotate) — verbatim port
- [ ] Drag shapes, marquee select
- [ ] Vertex-to-vertex snap (port `snapV2V`)
- [ ] Triangle grid snap (port `snapToGrid`, triangle branch only)
- [ ] Rotation handle (port from original)
- [ ] Undo/redo

### Phase 4 — Context Menu & Color
- [ ] Right-click context menu with 6 items
- [ ] Color picker panel with 16 swatches + custom + default
- [ ] Per-piece color rendering in canvas and SVG preview

### Phase 5 — Seed, Export, Library
- [ ] Seed encode/decode (`v1pi:` prefix)
- [ ] Seed input in status bar + copy/URL buttons
- [ ] Export PNG (golden ratio, per-piece colors)
- [ ] Puzzle library (localStorage + JSON file)
- [ ] Stamp + Puzzle load

### Phase 6 — Polish
- [ ] Welcome modal (🔺 Polyiamond)
- [ ] Preload screen
- [ ] Toast notifications
- [ ] SFX (snap, pick, drop sounds)
- [ ] Confetti on puzzle win
- [ ] Auto-zoom feature
- [ ] Keyboard shortcuts
- [ ] Hint bar text update for polyiamond game
- [ ] Responsive layout (small screen)
- [ ] `localStorage` save/restore game state

---

## 26. Differences Summary (Do NOT port)

- Remove `TYPE_INDEX` / `INDEX_TYPE` maps (replaced by `PIECE_KEYS` array index)
- Remove `THEMES` and `cycleTheme()` — colors are per-piece per n-group
- Remove grid types: `square`, `star` — keep only `none`, `triangle`
- Remove `altGridBtn` and `toggleAltGrid()`
- Remove the `themeBtn` from toolbar
- Remove 15°/30° rotation logic — only 60°
- Remove `SHAPE_ORDER`, `SHAPE_NAMES` — replaced by `PIECES` registry

---

*End of build plan. The agent should reference `pattern_ultimate.html` for all UI/UX patterns, CSS design tokens, and interaction details not explicitly covered here.*
