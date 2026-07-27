This guide provides an architectural blueprint, data specifications, and core engine code to adapt the provided Laser Game (Slitherlink) codebase into a cell-centric Minesweeper variant titled **"Guess Which Cell Has Honey"**.

---

## Architectural Blueprint & System Changes

To convert an edge-based loop puzzle game (Slitherlink) into a cell-based deduction game, the core rendering pipeline and state matrix must change from tracking **line segments between intersections** to tracking the **state of tiles**.

```
[Slitherlink Engine]                     [Honey Game Engine]
- Focus: Edge States (0, 1, 2)     --->  - Focus: Cell States (0=Empty, 1=⭕, 2=❌)
- Constraints: Loop Topology             - Constraints: Exact Match Validation
- Geometry: Intersecting Vertices       - Geometry: Concentric Grid/Ax Axial Paths

```

### 1. Component Realignment Matrix

* **The Geometry Engine:** The layout control pill (`#gridTypeGroup`) switches between two structural map configurations:
* `square`: A standard orthogonal matrix representing a **Flower Patch**. Cells are filled with vector flower assets containing protein.
* `hexagon`: A regular hexagonal lattice representing a **Honeycomb**. Cells contain honey pools.


* **The Input Router:** Rebind click captures from line vectors (`.edge`) to structural polygons/divs (`.cell`).
* **Left-click (`click`)**: Toggles the custom target cell between unrevealed (`0`) and marked as containing honey/protein (`1` / `⭕`).
* **Right-click (`contextmenu`)**: Toggles the cell between unrevealed (`0`) and flagged as safe/empty (`2` / `❌`).


* **The Verification Pipeline:** The high-visibility operational action button replaces `#btnSolve` with `#btnCheckBoard`. Winning is no longer evaluated continuously via graph theory; it is verified explicitly when a player triggers this check.

---

## Technical Specifications & Data Schemas

### 1. Core Game State Model (`GS`)

Replace the existing edge tracking matrices (`hEdges`, `vEdges`, `gEdges`) with an explicit collection tracking active cell parameters.

```javascript
const GS = {
    gridType: "hexagon", // "square" (Flower Patch) or "hexagon" (Honeycomb)
    size: 7,             // Grid dimension parameter
    cells: [],           // Unified collection of Cell objects
    history: [],         // Undo stack preservation array
    won: false,          // Execution status flag
    timeSec: 0,          // Timer tracking duration
    timerOn: false,      // Timer execution status
    timerInt: null,      // Reference pointer for window.setInterval
    seed: null           // Unique string for map regeneration
};

```

### 2. Cell Primitive Schema

Each cell object in the `GS.cells` array must conform to this schema:

```javascript
{
    id: 42,               // Index sequence integer
    q: 2, r: -1, s: -1,   // Hexagonal axial system coordinates (null if square grid)
    row: 3, col: 5,       // Orthogonal matrix coordinates (null if hex grid)
    hasHoney: true,       // True hidden answer boolean map
    markedState: 0,       // 0 = Unmarked, 1 = Marked (⭕), 2 = Flagged (❌)
    clue: 3,              // Int count of adjacent honey-bearing cells
    pts: "25.2,14.1..."   // Computed string tracking explicit SVG vertex coordinates
}

```

### 3. Hexagonal Lattice Index Transformation

For hexagonal boards, apply a standard grid coordinate layout wrapped inside a max radius $N$. The axial structural coordinates $(q, r)$ use a third derivative vector $s$ calculated as:

$$s = -q - r$$

The system determines neighbor cells by checking for adjacent offsets where $\max(\vert{}q\vert{}, \vert{}r\vert{}, \vert{}s\vert{}) < N$.

---

## Core Engine Implementation Details

The following complete Javascript codebase drives the board generation engine, computes accurate local adjacency counts, handles dual-input routing, and provides state serialization hooks.

### 1. Unified Grid Generator & Adjacency Engine

```javascript
// Hex coordinate neighbor translation offsets array
const HEX_DIRECTIONS = [
    {q: +1, r:  0}, {q: +1, r: -1}, {q:  0, r: -1},
    {q: -1, r:  0}, {q: -1, r: +1}, {q:  0, r: +1}
];

function makeRng(seedStr) {
    let hash = seedStr.split('').reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 1);
    return () => {
        hash = Math.imul(hash, 16807) % 0x7fffffff;
        if (hash < 0) hash += 0x7fffffff;
        return (hash - 1) / 0x7ffffffe;
    };
}

function generateHoneyMap(gridType, size, seedString) {
    const rng = makeRng(seedString);
    let cells = [];

    // 1. Structural Lattice Generation Loop
    if (gridType === "square") {
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                cells.push({
                    id: cells.length, row: r, col: c,
                    q: null, r: null, s: null,
                    hasHoney: rng() < 0.28, // ~28% honey density profile
                    markedState: 0, clue: 0
                });
            }
        }
    } else if (gridType === "hexagon") {
        for (let q = -size + 1; q < size; q++) {
            for (let r = -size + 1; r < size; r++) {
                let s = -q - r;
                if (Math.abs(s) < size) {
                    cells.push({
                        id: cells.length, row: null, col: null,
                        q: q, r: r, s: s,
                        hasHoney: rng() < 0.25, // ~25% honey density profile
                        markedState: 0, clue: 0
                    });
                }
            }
        }
    }

    // 2. Proximity Index Calculation Engine
    cells.forEach(cell => {
        let neighbors = [];
        if (gridType === "square") {
            neighbors = cells.filter(n => 
                Math.abs(n.row - cell.row) <= 1 && 
                Math.abs(n.col - cell.col) <= 1 && 
                n.id !== cell.id
            );
        } else {
            neighbors = cells.filter(n => {
                let dq = n.q - cell.q;
                let dr = n.r - cell.r;
                let ds = n.s - cell.s;
                return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds)) === 1;
            });
        }
        cell.clue = neighbors.filter(n => n.hasHoney).length;
    });

    return cells;
}

```

### 2. Dual Interaction Event Pipeline

```javascript
function handleCellInteraction(cellId, clickType) {
    if (GS.won) return;
    pushToHistoryStack();
    
    const cell = GS.cells.find(c => c.id === cellId);
    if (!cell) return;

    if (clickType === "LEFT_CLICK") {
        // Toggle action: Unmarked/Flagged -> Marked (1). Marked -> Unmarked (0).
        cell.markedState = (cell.markedState === 1) ? 0 : 1;
        playAudioSfx("MARK_⭕");
    } else if (clickType === "RIGHT_CLICK") {
        // Toggle action: Unmarked/Marked -> Flagged (2). Flagged -> Unmarked (0).
        cell.markedState = (cell.markedState === 2) ? 0 : 2;
        playAudioSfx("FLAG_❌");
    }

    renderInteractiveBoard();
    autoSaveGameState();
}

```

### 3. Board Verification Engine

```javascript
function verifyBoardState() {
    // Condition: Check if honey placement exactly matches the player's ⭕ selections
    const isSolutionValid = GS.cells.every(cell => {
        const isMarked = (cell.markedState === 1);
        return cell.hasHoney === isMarked;
    });

    if (isSolutionValid) {
        GS.won = true;
        stopGameTimer();
        triggerConfettiCascade();
        displayVictoryModal(); // Ensure backdrop blur CSS parameter is set to none
    } else {
        showToastNotification("The hive notices discrepancies. Check your marks!");
    }
}

```

### 4. Compact SeedID Engine

This engine handles map sharing. It packs cell states using standard binary serialization wrapped inside a Base36 string format.

```javascript
function generateMapSeedID() {
    const typePrefix = GS.gridType === "square" ? "S" : "H";
    let binaryString = "";
    
    GS.cells.forEach(c => {
        binaryString += c.hasHoney ? "1" : "0";
    });

    // Encapsulate structural layout parameters into Base36
    const encodedPayload = BigInt("0b" + binaryString).toString(36).toUpperCase();
    return `${typePrefix}${GS.size}-${encodedPayload}`;
}

function loadMapFromSeedID(seedStr) {
    const match = seedStr.match(/^([SH])(\d+)-([0-9A-Z]+)$/i);
    if (!match) return false;

    GS.gridType = match[1].toUpperCase() === "S" ? "square" : "hexagon";
    GS.size = parseInt(match[2], 10);
    
    const decodedBigInt = BigInt(parseInt(match[3], 36));
    let binaryPayload = decodedBigInt.toString(2);
    
    // Generate empty structure to evaluate target dimensions
    let structureCells = generateHoneyMap(GS.gridType, GS.size, "INIT");
    binaryPayload = binaryPayload.padStart(structureCells.length, "0");

    // Map decoded binary flags back to layout array
    structureCells.forEach((cell, index) => {
        cell.hasHoney = (binaryPayload[index] === "1");
        cell.markedState = 0;
    });

    // Recompute local clues based on the decoded map configuration
    structureCells.forEach(cell => {
        let neighbors = GS.gridType === "square" ?
            structureCells.filter(n => Math.abs(n.row - cell.row) <= 1 && Math.abs(n.col - cell.col) <= 1 && n.id !== cell.id) :
            structureCells.filter(n => Math.max(Math.abs(n.q - cell.q), Math.abs(n.r - cell.r), Math.abs(n.s - cell.s)) === 1);
        cell.clue = neighbors.filter(n => n.hasHoney).length;
    });

    GS.cells = structureCells;
    GS.won = false;
    GS.timeSec = 0;
    GS.seed = seedStr;
    
    renderInteractiveBoard();
    return true;
}

```

---

## Vector Asset Specification (Inline Dynamic SVG Library)

To display distinct flower variations and colors within square layout tiles, use these curated programmatic path strings. Use uniform bounding dimensions inside the target viewport: `viewBox="0 0 64 64"`.

| Style Category | Base Visual Theme Hex Code | Programmatic Vector Data Paths (`d="..."`) |
| --- | --- | --- |
| **Rose Template** | `#FF597B` | `M32 16C24 16 20 24 32 36C44 24 40 16 32 16Z` (Petal Layer)<br>

<br>`M32 24C28 24 26 28 32 34C38 28 36 24 32 24Z` (Core Layer) |
| **Sunflower Template** | `#FFD124` | `M32 4C30 16 34 16 32 4Z` (Rotated dynamically every 30 degrees across a full circle path)<br>

<br>`M32 32m-10 0a10 10 0 1 0 20 0a10 10 0 1 0 -20 0` (Core, Center color: `#5C3D2E`) |
| **Cosmos Template** | `#E053D5` | `M32 32 M32 8 C38 8 36 24 32 32 C28 24 26 8 32 8Z` (Repeated along primary orthogonal and diagonal matrix axes) |

```javascript
// Dynamic Programmatic SVG Generation Factory
function createFlowerSvgMarkup(styleIndex, seedHueValue) {
    const palette = [seedHueValue, "#FF7B54", "#FFB26B", "#FFD56B", "#939B62"];
    const targetColor = palette[styleIndex % palette.length];
    
    let paths = "";
    if (styleIndex % 3 === 0) { // Rose Configuration
        paths = `<path d="M32 12C18 12 14 24 32 44C50 24 46 12 32 12Z" fill="${targetColor}"/>
                 <path d="M32 22C24 22 20 28 32 38C44 28 40 22 32 22Z" fill="#FFF" opacity="0.3"/>`;
    } else if (styleIndex % 3 === 1) { // Sunflower Configuration
        for(let deg = 0; deg < 360; deg += 45) {
            paths += `<path d="M32 6C34 18 30 18 32 6Z" fill="${targetColor}" transform="rotate(${deg} 32 32)"/>`;
        }
        paths += `<circle cx="32" cy="32" r="9" fill="#4A2E2B"/>`;
    } else { // Cosmos Variant
        for(let deg = 0; deg < 360; deg += 60) {
            paths += `<path d="M32 32 M32 8 C37 8 35 24 32 32 C29 24 27 8 32 8Z" fill="${targetColor}" transform="rotate(${deg} 32 32)"/>`;
        }
        paths += `<circle cx="32" cy="32" r="6" fill="#FFA41B"/>`;
    }
    return `<svg viewBox="0 0 64 64" style="width:80%; height:80%;">${paths}</svg>`;
}

```

---

## Critical Implementation Notes

* **Preventing Context Menu Triggers:** You must call `preventDefault()` on all cell elements to allow smooth right-click tracking:
```javascript
cellElement.addEventListener('contextmenu', e => e.preventDefault());

```


* **Targeted State Isolation:** Ensure that your data persistence layer completely clears the previous Slitherlink edge variables from the local store:
```javascript
localStorage.removeItem("laser-save"); // Purge legacy array format

```


* **Viewport Layout Architecture:** When rendering individual cells, overlay text tokens directly on top of the target element. For `square` layouts, append text strings using CSS Grid layers. For `hexagon` items, position elements using SVG `<text>` elements anchored to coordinate parameters:
```xml
<text x="${cell.cx}" y="${cell.cy}" text-anchor="middle" dominant-baseline="central">⭕</text>

```


* **Ensuring Modal Overlay Visibility:** Do not use `backdrop-filter: blur(...)` styles on your win modal templates. This ensures the particle animations and confetti displays are fully visible behind the completion prompt.

---
