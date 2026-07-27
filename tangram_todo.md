# 🧩 Tangram Puzzle Game — Full Agent TODO

> Based on `pattern_ultimate.html`. This document is the single source of truth for building the tangram game from scratch as one self-contained HTML file. Read every section before writing a single line of code.

---

## 0. Project Overview & Key Differences from Pattern Game

| Feature | Pattern Game | Tangram Game |
|---|---|---|
| Pieces | Unlimited copies of 6 shapes | Exactly 7 fixed pieces, no duplicates |
| Grid | Square OR triangle, multi-type | Triangle-only (right-triangle cells) |
| Rotation step | 30° | **15°** in grid mode; **free/continuous** in no-grid mode |
| Piece stacking | Allowed (z-order) | **NEVER** — physics wood pieces, no overlap |
| Snap threshold | High (jumpy) | **Low / gentle** — smallest triangle unit focus |
| 3D appearance | Flat colored polygons | **2.5D bevel/shadow per piece** — beautiful |
| Color system | Theme palette by shape type | **Per-piece custom color** + separate color seed |
| Seed format | Complex multi-shape v11 | **Compact 7-piece positional seed** + **separate color code** |

---

## 1. The 7 Tangram Pieces — Canonical Definitions

All pieces are defined relative to a **unit size `T`** (the leg of the smallest right triangle).  
Set `T = 60` px as the base unit.

```
The classic tangram fits exactly into a square of side 2T.
All piece vertices must land on the right-triangle grid.
```

### Piece table

| ID | Name | Vertices (local coords, origin = centroid) | Grid cells |
|---|---|---|---|
| 0 | Large Triangle A | Right isoceles, legs = 2T | 4 small triangles |
| 1 | Large Triangle B | Same shape as A | 4 small triangles |
| 2 | Medium Triangle | Right isoceles, legs = √2·T | 2 small triangles |
| 3 | Small Triangle A | Right isoceles, legs = T | 1 small triangle |
| 4 | Small Triangle B | Same shape as A | 1 small triangle |
| 5 | Square | Side = T | 2 small triangles |
| 6 | Parallelogram | Legs T, T√2, 45° angle | 2 small triangles |

### Canonical vertex arrays (T = 60, centroid-centered)

```javascript
const T = 60; // base unit — leg of smallest right triangle

const TANGRAM_DEFS = {
  // ── ID 0 & 1: Large Right-Isoceles Triangle (legs = 2T) ─────────────────
  // Centroid of right triangle is at (1/3 of each leg from right angle)
  // Right angle at top-left, hypotenuse going bottom-right
  large_tri_a: (() => {
    const cx = (0 + 2*T + 0) / 3;
    const cy = (0 + 0 + 2*T) / 3;
    return [
      [0 - cx,       0 - cy],
      [2*T - cx,     0 - cy],
      [0 - cx,       2*T - cy],
    ];
  })(),

  large_tri_b: (() => {  // identical shape, separate piece
    const cx = (0 + 2*T + 0) / 3;
    const cy = (0 + 0 + 2*T) / 3;
    return [
      [0 - cx,       0 - cy],
      [2*T - cx,     0 - cy],
      [0 - cx,       2*T - cy],
    ];
  })(),

  // ── ID 2: Medium Right-Isoceles Triangle (legs = T√2) ───────────────────
  // Note: legs = T*sqrt(2), which equals the hypotenuse of the small triangle
  med_tri: (() => {
    const L = T * Math.SQRT2;
    const cx = (0 + L + 0) / 3;
    const cy = (0 + 0 + L) / 3;
    return [
      [0 - cx,   0 - cy],
      [L - cx,   0 - cy],
      [0 - cx,   L - cy],
    ];
  })(),

  // ── ID 3 & 4: Small Right-Isoceles Triangle (legs = T) ──────────────────
  small_tri_a: (() => {
    const cx = (0 + T + 0) / 3;
    const cy = (0 + 0 + T) / 3;
    return [
      [0 - cx,   0 - cy],
      [T - cx,   0 - cy],
      [0 - cx,   T - cy],
    ];
  })(),

  small_tri_b: (() => {  // identical shape, separate piece
    const cx = (0 + T + 0) / 3;
    const cy = (0 + 0 + T) / 3;
    return [
      [0 - cx,   0 - cy],
      [T - cx,   0 - cy],
      [0 - cx,   T - cy],
    ];
  })(),

  // ── ID 5: Square (side = T) ─────────────────────────────────────────────
  square: [
    [-T/2, -T/2],
    [ T/2, -T/2],
    [ T/2,  T/2],
    [-T/2,  T/2],
  ],

  // ── ID 6: Parallelogram (right-angle sides T and T, slant 45°) ──────────
  // Vertices: bottom-left at origin, going clockwise
  // It has a chirality — the piece can be FLIPPED (mirrored).
  // Store base form; flipping is done via scaleX = -1 flag.
  parallelogram: (() => {
    // Points: [0,T], [T,T], [2T,0], [T,0]  — flat top variant
    const pts = [[0,T],[T,T],[2*T,0],[T,0]];
    const cx = pts.reduce((s,p)=>s+p[0],0)/4;
    const cy = pts.reduce((s,p)=>s+p[1],0)/4;
    return pts.map(([x,y])=>[x-cx, y-cy]);
  })(),
};

// Canonical order: index 0..6 maps to these keys
const PIECE_KEYS = [
  'large_tri_a','large_tri_b','med_tri',
  'small_tri_a','small_tri_b',
  'square','parallelogram'
];
```

> **Important**: The parallelogram is the only chiral piece. Store a `flipped: boolean` on the piece state and render with `ctx.scale(-1,1)` before drawing when true. Flipping counts as a valid operation (like real wood tangram pieces that can be turned over).

---

## 2. Grid System — Right-Triangle Only

### 2.1 Grid cell geometry

The grid is made of **right isoceles triangles** with leg = `T`.

Each grid cell is half of a `T × T` square, divided diagonally.
Two orientations alternate: `/` and `\` diagonals.

```
Grid origin at (ox, oy).
Cell at column i, row j (0-indexed):

Square (i,j) top-left world position: (ox + i*T, oy + j*T)
Two triangles per square:
  Upper-left  triangle: [TL, TR, BL]  — the "\" diagonal
  Lower-right triangle: [TR, BR, BL]  — the "\" diagonal
```

**Visual pattern:**
```
+--+--+--+
|\ |\ |\ |
| \| \| \|
+--+--+--+
|\ |\ |\ |
+--+--+--+
```

### 2.2 Grid snap points

Snap targets are the **vertices** of the grid, i.e., all points `(ox + i*T, oy + j*T)` for integer i, j.

There are **no half-points needed** — the right-triangle grid vertices are the same as the square grid corners. This makes snapping much simpler than the pattern game's triangular grid.

### 2.3 Valid rotation angles on grid

In **grid mode** (snap ON), pieces rotate in **15° increments**.

Why 15°? A right isoceles triangle at 45° alignment covers the grid. The full set of angles that keep the tangram pieces on the right-triangle grid vertices are multiples of 45°. But the medium triangle aligns at 45° offsets too, so **15° is the finest step that gives all meaningful grid positions**.

Valid grid angles: `0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, ...`

In **free mode** (snap OFF): rotation is continuous, no quantization.

### 2.4 Grid rendering

Draw grid lines as a canvas background:
- Horizontal lines: `y = oy + j*T` for all visible `j`
- Vertical lines: `x = ox + i*T` for all visible `i`  
- Diagonal lines: `y - x = oy - ox + k*T` for all visible `k` (the `\` diagonals)

Use `rgba(0,0,0,0.07)` for grid lines. Grid is always **behind pieces** (no "overlay" option needed — simpler than pattern game).

Grid visibility states: `on` | `off` | `behind` (same as off but snapping still active).

---

## 3. Snapping System

### 3.1 Philosophy

> "Low threshold, no jump" — the piece should feel like it glides into place, not teleport.

The pattern game has a high snap threshold that causes jarring jumps. Tangram must feel like placing real wooden pieces on a felt mat — a gentle magnetic pull when close enough.

### 3.2 Snap algorithm

```javascript
const SNAP_RADIUS = T * 0.28;  // 28% of T — gentle pull, not a jump
const ROTATE_SNAP_STEP = 15;   // degrees, grid mode only

/**
 * Snap a piece's centroid to the nearest grid vertex.
 * Returns {x, y} snapped coords, or original if none close enough.
 */
function snapPieceCentroid(px, py) {
  if (!snapEnabled || !gridOrigin) return { x: px, y: py };

  const { ox, oy } = gridOrigin;

  // Find nearest grid vertex
  const i = Math.round((px - ox) / T);
  const j = Math.round((py - oy) / T);

  // Check 3x3 neighborhood of nearest vertex
  let bestDist = SNAP_RADIUS;
  let best = null;

  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const gx = ox + (i + di) * T;
      const gy = oy + (j + dj) * T;
      const dist = Math.hypot(px - gx, py - gy);
      if (dist < bestDist) {
        bestDist = dist;
        best = { x: gx, y: gy };
      }
    }
  }

  return best || { x: px, y: py };
}

/**
 * Snap rotation to nearest 15° step.
 * Only in grid mode. Returns angle in degrees [0, 360).
 */
function snapRotation(angle) {
  if (!snapEnabled) return ((angle % 360) + 360) % 360;
  const step = ROTATE_SNAP_STEP;
  return Math.round(angle / step) * step;
}
```

### 3.3 Piece vertex snapping (better than centroid-only)

For tangram, we want pieces to snap **by their corner vertices**, not just centroid. This is key because when you place a large triangle next to a small one, the corners must touch.

```javascript
/**
 * Find best snap offset for a piece being dragged.
 * Tests each vertex of the piece against grid vertices.
 * Returns the {dx, dy} to add to piece position.
 */
function findBestVertexSnap(piece) {
  if (!snapEnabled || !gridOrigin) return { dx: 0, dy: 0 };

  const verts = worldVertices(piece);  // transformed world-space vertices
  const { ox, oy } = gridOrigin;

  let bestDist = T * 0.35;  // max snap pull distance per vertex
  let bestOffset = null;

  for (const v of verts) {
    // Nearest grid vertex to this piece vertex
    const gi = Math.round((v.x - ox) / T);
    const gj = Math.round((v.y - oy) / T);

    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const gx = ox + (gi + di) * T;
        const gy = oy + (gj + dj) * T;
        const dist = Math.hypot(v.x - gx, v.y - gy);
        if (dist < bestDist) {
          bestDist = dist;
          // offset needed to snap this vertex to grid
          bestOffset = { dx: gx - v.x, dy: gy - v.y };
        }
      }
    }
  }

  return bestOffset || { dx: 0, dy: 0 };
}
```

### 3.4 No-overlap enforcement

> Pieces are like physical wood — they cannot stack.

```javascript
/**
 * Check if moving `piece` to position (nx, ny) would overlap any other piece.
 * Uses Separating Axis Theorem (SAT) for convex polygon collision.
 * Returns true if overlap would occur.
 */
function wouldOverlap(piece, nx, ny) {
  const testVerts = worldVerticesAt(piece, nx, ny, piece.rotation);
  for (const other of pieces) {
    if (other.id === piece.id) continue;
    if (satOverlap(testVerts, worldVertices(other))) return true;
  }
  return false;
}

/**
 * SAT overlap test for two convex polygon vertex arrays.
 */
function satOverlap(polyA, polyB) {
  const polys = [polyA, polyB];
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const nx = -(poly[j].y - poly[i].y);
      const ny =   poly[j].x - poly[i].x;
      const [minA, maxA] = project(polyA, nx, ny);
      const [minB, maxB] = project(polyB, nx, ny);
      // Add a tiny epsilon gap so touching edges are allowed
      if (maxA <= minB + 0.5 || maxB <= minA + 0.5) return false;
    }
  }
  return true;
}

function project(poly, nx, ny) {
  let min = Infinity, max = -Infinity;
  for (const v of poly) {
    const d = v.x * nx + v.y * ny;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}
```

**When a drop would cause overlap:**  
- Do NOT place the piece there.
- Return the piece to its **last valid position** (store `piece.lastValidX/Y` on drag start).
- Play a subtle "bump" animation (shake 2px for 200ms).
- No snap occurs.

**Edge touching is allowed** — pieces can share an edge (that's the whole point of tangram). The SAT epsilon `0.5` handles floating point and allows edge-touch.

---

## 4. Piece State Model

```javascript
// The complete piece object
const piece = {
  id: 0,              // 0–6, fixed, matches PIECE_KEYS index
  x: 0,              // centroid world-x
  y: 0,              // centroid world-y
  rotation: 0,       // degrees, [0, 360)
  flipped: false,    // only meaningful for parallelogram (id=6)
  color: '#E74C3C',  // current fill color (per-piece, editable)
  // Runtime only (not serialized):
  isDragging: false,
  zIndex: 0,         // drawing order (last touched = highest)
};
```

### 4.1 Piece array

```javascript
let pieces = [];  // always length exactly 7 after init
```

Pieces are initialized once on game start. They are **never** created or destroyed — only repositioned.

---

## 5. Seed & Color Code System

### 5.1 Position seed — compact 7-piece format

Since there are always exactly 7 pieces in a fixed order (id 0..6), the seed only needs to encode `(x, y, rotation, flipped)` for each. No piece type info needed.

**Encoding per piece:**
- `x`, `y`: world coordinates, stored as integers (round to nearest 0.5T for precision, multiply by 2 to store as int)
- `rotation`: 0..359 degrees, snapped to 15° → encode as `0..23` (divide by 15)
- `flipped`: 1 bit (only piece 6 / parallelogram can be flipped)

**Base encoding:** Use base-64 URL-safe alphabet.

```javascript
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function encodeInt(n, digits) {
  // encode n in `digits` base-64 characters
  let s = '';
  for (let i = 0; i < digits; i++) {
    s = B64[n & 63] + s;
    n >>= 6;
  }
  return s;
}

function decodeInt(s) {
  let n = 0;
  for (const c of s) n = (n << 6) | B64.indexOf(c);
  return n;
}

/**
 * Export position seed.
 * Format: "T" + 7 × (3 chars for x, 3 chars for y, 1 char for rot+flip)
 * Total: 1 + 7×7 = 50 chars max.
 *
 * x/y range: ±4096 px → encode as offset+4096, 3 b64 chars = 18 bits = 262144 range ✓
 * rot: 0..23 (4 bits) | flipped: 1 bit → packed into 1 b64 char (6 bits)
 */
function exportPositionSeed() {
  let s = 'T';
  for (const p of pieces) {
    const xi = Math.round(p.x) + 4096;
    const yi = Math.round(p.y) + 4096;
    const ri = Math.round(((p.rotation % 360) + 360) % 360 / 15) & 0x1F;
    const fi = p.flipped ? 1 : 0;
    const rf = (ri << 1) | fi;  // 6 bits total
    s += encodeInt(xi, 3) + encodeInt(yi, 3) + B64[rf];
  }
  return s;  // ~50 chars
}

function importPositionSeed(seed) {
  if (!seed.startsWith('T') || seed.length !== 50) return false;
  let pos = 1;
  for (let i = 0; i < 7; i++) {
    const xi = decodeInt(seed.slice(pos, pos+3)) - 4096;
    const yi = decodeInt(seed.slice(pos+3, pos+6)) - 4096;
    const rf = B64.indexOf(seed[pos+6]);
    const ri = (rf >> 1) & 0x1F;
    const fi = rf & 1;
    pieces[i].x = xi;
    pieces[i].y = yi;
    pieces[i].rotation = ri * 15;
    pieces[i].flipped = fi === 1;
    pos += 7;
  }
  return true;
}
```

### 5.2 Color seed — separate compact format

```javascript
/**
 * Export color seed.
 * Format: "C" + 7 × 6-char hex color (no #)
 * Total: 1 + 7×6 = 43 chars.
 * Example: "CFF5733E74C3C3498DBA9B59B62ECC71F39C12"
 */
function exportColorSeed() {
  let s = 'C';
  for (const p of pieces) {
    s += p.color.replace('#','').toUpperCase().padStart(6,'0');
  }
  return s;
}

function importColorSeed(seed) {
  if (!seed.startsWith('C') || seed.length !== 43) return false;
  for (let i = 0; i < 7; i++) {
    pieces[i].color = '#' + seed.slice(1 + i*6, 7 + i*6);
  }
  return true;
}
```

### 5.3 Combined URL sharing

```
?p=T<50chars>&c=C<42chars>
```

Both are optional. Loading with only `?p=` keeps current colors. Loading with only `?c=` keeps current positions.

### 5.4 Preset color themes

Store 6 built-in color themes as arrays of 7 hex colors:

```javascript
const COLOR_THEMES = {
  'Classic':    ['#E74C3C','#E74C3C','#3498DB','#2ECC71','#F39C12','#9B59B6','#1ABC9C'],
  'Warm Wood':  ['#8B4513','#A0522D','#CD853F','#DEB887','#D2691E','#BC8A5F','#F4A460'],
  'Ocean':      ['#006994','#0099CC','#00CED1','#48D1CC','#20B2AA','#5F9EA0','#4682B4'],
  'Pastel':     ['#FFB3BA','#FFDFBA','#FFFFBA','#BAFFC9','#BAE1FF','#E8BAFF','#FFBAE8'],
  'Mono Dark':  ['#1a1a1a','#2d2d2d','#3d3d3d','#4d4d4d','#5d5d5d','#6d6d6d','#7d7d7d'],
  'Neon':       ['#FF0080','#FF4500','#FFD700','#00FF41','#00BFFF','#BF00FF','#FF6EC7'],
};
```

---

## 6. 2.5D Piece Rendering

Each piece should look like a **physical wooden tangram piece** seen from a slight angle — not flat.

### 6.1 Render order per piece

```javascript
function drawPiece(ctx, piece) {
  ctx.save();

  // Apply camera transform (done outside this function)
  ctx.translate(piece.x, piece.y);
  ctx.rotate(piece.rotation * Math.PI / 180);
  if (piece.flipped) ctx.scale(-1, 1);

  const verts = TANGRAM_DEFS[PIECE_KEYS[piece.id]];
  
  // ── Layer 1: Drop shadow ────────────────────────────────────
  const shadowOffset = piece.isDragging ? 12 : 5;
  const shadowBlur   = piece.isDragging ? 18 : 8;
  ctx.save();
  ctx.translate(shadowOffset * 0.7, shadowOffset);
  drawPath(ctx, verts);
  ctx.fillStyle = `rgba(0,0,0,${piece.isDragging ? 0.22 : 0.14})`;
  ctx.shadowBlur = shadowBlur;
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.fill();
  ctx.restore();

  // ── Layer 2: Main fill ──────────────────────────────────────
  drawPath(ctx, verts);
  const grad = makeGradient(ctx, verts, piece.color);
  ctx.fillStyle = grad;
  ctx.fill();

  // ── Layer 3: Bevel highlight (top-left edge) ────────────────
  drawPath(ctx, verts);
  ctx.strokeStyle = lighten(piece.color, 0.35);
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.stroke();  // full outline as subtle highlight

  // Draw brighter highlight on top/left edges only
  drawTopEdges(ctx, verts, lighten(piece.color, 0.55), 1.5);

  // ── Layer 4: Bevel shadow (bottom-right edge) ───────────────
  drawBottomEdges(ctx, verts, darken(piece.color, 0.3), 2);

  // ── Layer 5: Selection highlight ───────────────────────────
  if (piece.isSelected) {
    drawPath(ctx, verts);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // Outer glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#fff';
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Create a linear gradient simulating a top-left light source.
 */
function makeGradient(ctx, verts, color) {
  // Bounding box of verts
  const xs = verts.map(v=>v[0]), ys = verts.map(v=>v[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  const grad = ctx.createLinearGradient(minX, minY, maxX, maxY);
  grad.addColorStop(0, lighten(color, 0.18));
  grad.addColorStop(0.6, color);
  grad.addColorStop(1, darken(color, 0.15));
  return grad;
}

function drawPath(ctx, verts) {
  ctx.beginPath();
  ctx.moveTo(verts[0][0], verts[0][1]);
  for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i][0], verts[i][1]);
  ctx.closePath();
}

/** Lighten/darken a hex color by amount [0,1] */
function lighten(hex, amount) {
  const [r,g,b] = hexToRgb(hex);
  return rgbToHex(
    Math.min(255, Math.round(r + (255-r)*amount)),
    Math.min(255, Math.round(g + (255-g)*amount)),
    Math.min(255, Math.round(b + (255-b)*amount))
  );
}
function darken(hex, amount) {
  const [r,g,b] = hexToRgb(hex);
  return rgbToHex(
    Math.max(0, Math.round(r * (1-amount))),
    Math.max(0, Math.round(g * (1-amount))),
    Math.max(0, Math.round(b * (1-amount)))
  );
}
```

### 6.2 Edge detection for bevel

```javascript
/**
 * Draw only edges where the normal points upward-left (light source).
 * "Top" edges: those where the outward normal has a negative Y component.
 */
function drawTopEdges(ctx, verts, color, lineWidth) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i+1) % verts.length];
    // Outward normal (for CCW poly, outward = right of edge direction)
    const nx = -(b[1] - a[1]);
    const ny =   b[0] - a[0];
    // If normal points up-left, it's a highlight edge
    if (ny < -0.1 || nx < -0.1) {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  }
}

function drawBottomEdges(ctx, verts, color, lineWidth) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i+1) % verts.length];
    const nx = -(b[1] - a[1]);
    const ny =   b[0] - a[0];
    if (ny > 0.1 || nx > 0.1) {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  }
}
```

### 6.3 Drag lift effect

When a piece is being dragged:
- Increase shadow offset to `(10, 14)` and blur to `20`
- Scale up slightly: `ctx.scale(1.03, 1.03)`
- Animate the lift with `requestAnimationFrame` easing (150ms ease-out)

---

## 7. UI Structure

### 7.1 Layout

```
┌─────────────────────────────────────────────────────────┐
│ [Toolbar: Title | New | Shuffle | Snap toggle | Grid]   │ ← top, acrylic
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ [Tray]   │            Canvas (pieces + grid)            │
│ 7 pieces │                                              │
│ sidebar  │                                              │
│          │                                              │
├──────────┴──────────────────────────────────────────────┤
│ [Zoom] [Rotate] [Color theme] [Seed: T... ] [📋] [🔗]  │ ← status bar
└─────────────────────────────────────────────────────────┘
```

### 7.2 Piece tray (sidebar)

The left sidebar shows a **tray** of all 7 tangram pieces in their current colors. This is the "home position" area — not used for spawning (pieces already exist on the board). Instead, the tray shows a mini-preview and allows **double-click to teleport piece to tray** (reset position).

```javascript
const TRAY_POSITIONS = [
  // Pre-arranged positions to the left of the play area
  // Laid out as a vertical stack, separated by T*1.5 spacing
];
```

### 7.3 Color picker per piece

- **Click a piece** → it becomes selected (glow highlight)
- A floating **color pill** appears above the piece: `[🎨 current color] [pick] [theme swatches]`
- Use `<input type="color">` as hidden, triggered on pick button click
- **Right-click piece** → context menu: `[Change Color | Reset Color | Flip (parallelogram only)]`

### 7.4 Toolbar buttons

| Button | Action |
|---|---|
| 🆕 New | Reset all 7 pieces to tray home positions |
| 🔀 Shuffle | Scatter pieces randomly with valid non-overlap positions |
| ▣ Grid | Cycle: On → Off → Subtle (snap active, dots only) |
| 🔒 Snap | Toggle snap on/off |
| 🎨 Theme | Cycle through 6 color theme presets |
| ❓ Help | Show keyboard shortcuts overlay |

### 7.5 Action bar (appears when piece selected)

```
[ ↺ -15° ] [ ↻ +15° ] [ ↔ Flip ] [ 🏠 To Tray ] [ 🎨 Color ]
```

- Flip only active for parallelogram
- `-15°` / `+15°` respect snap: in grid mode they snap to next 15° mark; in free mode they rotate exactly 15°

---

## 8. Interaction Model

### 8.1 Mouse / Touch events

```
pointerdown  → hitTest pieces (back-to-front z-order)
               If hit: start drag, bring piece to front (max zIndex)
               Else: start camera pan (middle mouse / 2-finger)
pointermove  → if dragging: update piece position
                            run vertex snap
                            run overlap check (block if overlap)
               if panning: update camera
pointerup    → if dragging: finalize snap, release piece
                            update lastValidX/Y
               if panning: stop pan
```

### 8.2 Rotation

- **Keyboard `[`**: rotate selected piece -15°
- **Keyboard `]`**: rotate selected piece +15°
- **Scroll wheel on piece**: rotate piece ±15° per tick (in snap mode) or ±5° (free mode)
- **Two-finger rotate gesture (touch)**: continuous rotation, snap on release

### 8.3 Camera

- **Right-drag or two-finger pan**: pan camera
- **Scroll (on empty area)**: zoom
- **Pinch**: zoom
- **`0` key**: fit all pieces to screen
- **Camera rotation**: keep from pattern game (Q/E keys) — useful for solving rotated puzzles

### 8.4 Selection

- **Click** piece → select it (single selection only — tangram doesn't benefit from multi-select)
- **Click empty area** → deselect
- **No marquee selection** — keep it simple

---

## 9. Puzzle Mode (Silhouette / Challenge)

Puzzle mode shows a **black silhouette** target shape. Player arranges the 7 pieces to match.

### 9.1 Silhouette rendering

```javascript
/**
 * Draw puzzle target silhouette.
 * The silhouette is stored as a set of {x, y, rotation, flipped, pieceId}
 * for each of the 7 pieces in their solved positions.
 */
function drawSilhouette(ctx, solution) {
  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = '#1a1a2e';
  
  for (const s of solution) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rotation * Math.PI / 180);
    if (s.flipped) ctx.scale(-1, 1);
    
    const verts = TANGRAM_DEFS[PIECE_KEYS[s.pieceId]];
    drawPath(ctx, verts);
    ctx.fill();
    ctx.restore();
  }
  
  ctx.restore();
}
```

### 9.2 Win detection

```javascript
const WIN_THRESHOLD_POS = T * 0.15;   // 15% of T for position match
const WIN_THRESHOLD_ROT = 7.5;         // half a snap step for rotation

function checkWin() {
  if (!puzzleSolution) return false;
  let allMatch = true;
  for (let i = 0; i < 7; i++) {
    const p = pieces[i];
    const s = puzzleSolution[i];
    const dx = Math.abs(p.x - s.x);
    const dy = Math.abs(p.y - s.y);
    const dr = Math.abs(((p.rotation - s.rotation) % 360 + 360) % 360);
    const dra = Math.min(dr, 360 - dr);
    if (dx > WIN_THRESHOLD_POS || dy > WIN_THRESHOLD_POS || dra > WIN_THRESHOLD_ROT) {
      allMatch = false;
      break;
    }
  }
  return allMatch;
}
```

### 9.3 Built-in puzzle library

Include at minimum **20 classic tangram silhouettes** encoded as position seeds:
- Animals: cat, rabbit, swan, fish, fox
- People: running person, dancer, sitting figure
- Objects: boat, rocket, house, candle, arrow
- Geometric: square, parallelogram, rectangle, triangle (the full square re-assembly)

---

## 10. Full Build Task List

### Phase 1 — Foundation

- [ ] **10.1** Set up single HTML file with canvas, CSS acrylic panels (copy from pattern_ultimate.html)
- [ ] **10.2** Define `T`, `TANGRAM_DEFS`, `PIECE_KEYS` constants
- [ ] **10.3** Implement `worldVertices(piece)` — apply rotation + flip transform
- [ ] **10.4** Implement camera system (pan, zoom, rotation) — copy from pattern game, simplify
- [ ] **10.5** Implement canvas render loop with `requestAnimationFrame`
- [ ] **10.6** Implement right-triangle grid drawing

### Phase 2 — Pieces & Interaction

- [ ] **10.7** Initialize 7 piece objects with home tray positions
- [ ] **10.8** Implement `drawPiece()` with 2.5D bevel rendering (layers: shadow, gradient fill, highlight edges, shadow edges)
- [ ] **10.9** Implement pointer hit-test (point-in-convex-polygon, back-to-front z-order)
- [ ] **10.10** Implement drag with pointer capture (`setPointerCapture`)
- [ ] **10.11** Implement `findBestVertexSnap()` — vertex-based snapping
- [ ] **10.12** Implement `satOverlap()` + `wouldOverlap()` — no-overlap enforcement
- [ ] **10.13** Implement drag lift animation (scale + shadow on drag start)
- [ ] **10.14** Implement piece selection (click to select, click empty to deselect)
- [ ] **10.15** Implement piece rotation via keyboard `[` `]` and scroll wheel
- [ ] **10.16** Implement parallelogram flip (`F` key or action bar button)

### Phase 3 — Color System

- [ ] **10.17** Add `color` property to each piece, defaulting to 'Classic' theme
- [ ] **10.18** Implement hidden `<input type="color">` triggered by color button
- [ ] **10.19** Implement `exportColorSeed()` / `importColorSeed()`
- [ ] **10.20** Add 6 preset color themes with swatch UI
- [ ] **10.21** Per-piece color shown in tray mini-preview
- [ ] **10.22** Theme cycling button in toolbar

### Phase 4 — Seed System

- [ ] **10.23** Implement `exportPositionSeed()` — compact 50-char format
- [ ] **10.24** Implement `importPositionSeed()` — parse and restore
- [ ] **10.25** Seed input field in status bar (always visible)
- [ ] **10.26** Copy seed button (📋)
- [ ] **10.27** Copy URL button (🔗) — encodes both position + color seeds
- [ ] **10.28** URL parameter loading on page start (`?p=...&c=...`)
- [ ] **10.29** Auto-save to `localStorage` on every move (debounced 500ms)
- [ ] **10.30** Resume from localStorage on page load (welcome screen)

### Phase 5 — Puzzle Mode

- [ ] **10.31** Implement silhouette drawing (`drawSilhouette()`)
- [ ] **10.32** Implement `checkWin()` with position/rotation threshold
- [ ] **10.33** Win celebration: confetti + toast (copy from pattern game)
- [ ] **10.34** Encode 20 classic tangram puzzles as position seeds
- [ ] **10.35** Puzzle library modal (grid of thumbnails, click to load)
- [ ] **10.36** Puzzle thumbnail generation (mini canvas render of silhouette)

### Phase 6 — Polish & Extras

- [ ] **10.37** Keyboard shortcut overlay (`?` key)
- [ ] **10.38** Snap mode: free rotation (continuous, no grid) when snap OFF
- [ ] **10.39** `Shuffle` button: scatter pieces with non-overlap guarantee
- [ ] **10.40** `New` button: reset all pieces to tray home positions
- [ ] **10.41** Hint bar (bottom-right, keyboard shortcuts reminder)
- [ ] **10.42** Toast notifications system (copy from pattern game)
- [ ] **10.43** Touch support: 2-finger pan/zoom, 1-finger drag pieces
- [ ] **10.44** Responsive canvas resize on window resize
- [ ] **10.45** Mobile: action bar buttons slightly larger, bottom safe area padding

---

## 11. File Structure

```
tangram.html                ← single self-contained file
  <style>                   ← all CSS inline
  <body>
    <canvas id="c">
    #toolbar                ← top acrylic bar
    #sidebar (tray)         ← left, 7 piece previews
    #actionBar              ← floating, appears on selection
    #statusBar              ← bottom: zoom | seed | color
    #colorPicker            ← hidden <input type="color">
    #puzzleModal            ← puzzle library
    #welcomeModal           ← start screen
    #toast
  <script>                  ← all JS inline, no external deps
```

**Zero external dependencies.** No libraries. Everything inline.

---

## 12. Constants Reference

```javascript
// ── Core ───────────────────────────────────────────────────────────
const T           = 60;          // base unit: leg of smallest right triangle
const SNAP_RADIUS = T * 0.28;    // gentle snap pull distance
const ROT_STEP    = 15;          // degrees per rotation step (grid mode)
const FREE_ROT    = 5;           // degrees per scroll tick (free mode)
const LIFT_SCALE  = 1.025;       // scale factor when piece is picked up
const LIFT_MS     = 150;         // ms for lift animation
const WIN_POS_THR = T * 0.15;    // win detection position threshold
const WIN_ROT_THR = 7.5;         // win detection rotation threshold (deg)

// ── Rendering ──────────────────────────────────────────────────────
const SHADOW_IDLE_X   = 3;
const SHADOW_IDLE_Y   = 5;
const SHADOW_IDLE_BLR = 8;
const SHADOW_DRAG_X   = 8;
const SHADOW_DRAG_Y   = 12;
const SHADOW_DRAG_BLR = 20;
const BEVEL_LIGHT     = 0.35;    // lighten amount for highlight edge
const BEVEL_DARK      = 0.30;    // darken amount for shadow edge

// ── Grid ───────────────────────────────────────────────────────────
const GRID_LINE_COLOR = 'rgba(0,0,0,0.07)';
const GRID_DOT_COLOR  = 'rgba(0,0,0,0.15)';

// ── Camera ─────────────────────────────────────────────────────────
const ZOOM_MIN    = 0.25;
const ZOOM_MAX    = 6.0;
const ZOOM_FACTOR = 1.12;        // per scroll tick
```

---

## 13. Known Edge Cases & Solutions

| Edge case | Solution |
|---|---|
| Parallelogram appears mirrored after rotation | Track `flipped` separately from rotation; apply `ctx.scale(-1,1)` in render |
| SAT gives false positive on shared edges | Add epsilon `0.5` gap to separation test |
| Snap fights with overlap block | Always check overlap AFTER snap; if snapped position overlaps, try unsnapped position; if still overlaps, reject |
| Two large triangles identical shapes | They have separate IDs (0 and 1), both tracked separately in seed |
| Free rotation seed encoding | In free mode, store angle as 0..359 integer (1 byte); detection: if seed char count differs, auto-detect mode |
| Camera rotation + vertex snap | Transform snap candidates through inverse camera rotation before distance test |
| Touch drag on mobile — scroll conflict | `touch-action: none` on canvas + `event.preventDefault()` in touch handlers |
| Win detection with camera rotation | Always test in world coordinates, not screen coordinates |
| Undo/redo | Store piece snapshot array (7 items) per move; stack depth 50; Ctrl+Z/Ctrl+Y |

---

## 14. Reuse Checklist from `pattern_ultimate.html`

Copy these directly (adapt as needed):

- [x] Acrylic panel CSS (`.acrylic`, `.tb-btn`, toolbar styles)
- [x] Camera pan/zoom/rotation system
- [x] `animateCameraToTarget()` smooth animation
- [x] `resetViewToPuzzle()` → rename to `fitToScreen()`
- [x] Toast notification system (`#toast`, `toast()` function)
- [x] Confetti win celebration
- [x] LZString library (if you want URL-compressed seeds — optional, base64 is fine)
- [x] `lighten()` / `darken()` color helpers
- [x] Keyboard shortcuts handling pattern
- [x] Welcome modal structure
- [x] `saveGameState()` / `loadGameState()` localStorage pattern

**Do NOT copy:**
- ❌ Multi-shape definitions (use only TANGRAM_DEFS)
- ❌ Seed format (v9/v10/v11 — use new compact T-seed)
- ❌ Duplicate/delete/clipboard logic (no duplicates in tangram)
- ❌ Marquee selection
- ❌ Puzzle loading system (replace with new puzzle mode)
- ❌ Grid type cycling (triangle only in tangram)

---

## 15. Quality Bar

Before submitting, verify:

1. **All 7 pieces fit together into a 4T×4T square** — the classic tangram square. Test this.
2. **Drag feels smooth** — no lag, no jumps. Snap is gentle.
3. **No overlap ever** — test by rapidly dragging pieces on top of each other.
4. **Seed round-trips** — export seed, paste back, get exact same state.
5. **Color seed independent** — change colors, copy color seed, fresh page, import color seed — only colors change.
6. **Works on mobile touch** — test with Safari iOS (WebKit canvas bugs).
7. **Pieces look beautiful** — the 2.5D bevel with gradient fill should make pieces look like lacquered wood tiles.
