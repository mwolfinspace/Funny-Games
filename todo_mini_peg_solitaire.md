Here is a comprehensive Markdown specification and To-Do list designed specifically for an AI coding agent. It breaks down the mechanics, UI, state management, and the core algorithms needed to build the game.

***

# Project Specification: "Leader's Gambit" (Peg Solitaire Variant)

## 📌 Project Overview
A responsive, full-screen web-based puzzle game where a player jumps pieces over one another to capture them. The objective is to clear the board until only the "Red Leader" piece remains. The game features a dynamic, scalable board, a setup phase, a play phase, and a puzzle generator that guarantees solvable states.

---

## 🛠️ Phase 1: Architecture & UI Layout (HTML/CSS)
**Goal:** Create a responsive full-screen web app with absolute positioned floating UI panels over a scalable game board area.

- [ ] **Setup `index.html`:** Create a standard HTML5 boilerplate.
- [ ] **CSS Resets:** Set `html, body { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; background: #f0f4f8; }`.
- [ ] **Create Main Layers:**
  - `<div id="game-container">` (Handles pan/zoom logic).
  - `<svg id="game-board">` OR `<canvas id="game-board">` (For drawing the lines and nodes).
  - `<div id="ui-layer">` (Pointer-events: none, except on child panels).
- [ ] **Build Floating Panels (pointer-events: auto):**
  - **Control Panel:** Buttons for `Undo`, `Redo`, `Random Game`, `Reset`, `Expand Board`.
  - **Piece Bank:** A container displaying the `Red Leader` and `Yellow Pieces (1-N)`. Must update dynamically.
  - **Exit Box:** A scrollable history container to catch pieces as they leave the board.
- [ ] **CSS Styling:** Use Flexbox/Grid for panel layout. Ensure buttons have `:hover` and `:active` states.
- [ ] **Animation Library:** (Optional but recommended) Include **Anime.js** or **GSAP** via CDN to handle smooth piece jumps, fading, and confetti drops.

---

## 🗺️ Phase 2: Board Geometry & Interactions (JavaScript)
**Goal:** Render a mathematically sound, pan/zoom-able grid. 

- [ ] **Define the Coordinate System:**
  - Base Board (2x2):
    - 3 columns, 3 rows of main intersections `(x=0..2, y=0..2)` = 9 nodes.
    - 4 center intersections of the small squares `(x=0.5..1.5, y=0.5..1.5)` = 4 nodes.
    - Total: 13 valid coordinate positions for pieces.
- [ ] **Implement Pan & Zoom:**
  - Bind `wheel` event to the `game-container` to scale.
  - Bind `pointerdown`, `pointermove`, `pointerup` to pan the camera offset `(translateX, translateY)`.
- [ ] **Render the Grid Structure (Visuals):**
  - Draw the outer border of the square.
  - Draw horizontal and vertical interior lines splitting the big square into smaller ones.
  - Draw the cross ('X') connecting opposite corners of each small square.
- [ ] **Define Valid Adjacency (The Graph):**
  - Two nodes are connected if they share an edge or a diagonal line in the specific board layout.
  - Create a lookup dictionary or function `getAdjacencyMatrix()` to store which coordinates connect to which.
- [ ] **Expand Functionality:**
  - Create a function `expandBoard(rows, cols)` that adds `+1` to `y` (3x2) or `+1` to `x` and `y` (3x3), recalculates the graph nodes, and updates the view boundary.

---

## ♟️ Phase 3: Game States & Entity Logic (JavaScript)
**Goal:** Establish clear boundaries between Setup Phase and Play Phase, and manage the underlying data model.

- [ ] **Data Structure (`State Object`):**
  - `board`: Map of `node_id -> piece_object | null`.
  - `bank`: Array of available pieces (`[{id: 'red', type: 'leader'}, {id: 'y1', type: 'yellow', label: '1'}, ...]`).
  - `exitBox`: Array of captured pieces in exact sequential order.
  - `history`: Stack for `Undo`.
  - `future`: Stack for `Redo`.
  - `phase`: String (`'setup'` or `'play'`).
- [ ] **Create the Pieces (DOM Nodes or SVG Elements):**
  - Generate the Red piece (no label) and yellow pieces (numbered or labeled A, B, C...).
  - Ensure pieces have `z-index` higher than the board nodes.
- [ ] **Setup Phase Rules:**
  - **Drag & Drop:** Implement `dragstart`, `dragover`, `drop` from Bank to Board.
  - **Click to Place:** Click a piece in the bank (highlights it), click an empty node on the board to move it there.
  - Allow picking pieces back up from the board to return to the bank.
- [ ] **Play Phase Initialization:**
  - When the "Start Game" button is clicked:
    - Lock the piece bank (disable interaction on unused pieces).
    - Set game phase to `'play'`.

---

## 🕹️ Phase 4: Core Gameplay & Mechanics (Play Phase)
**Goal:** Handle player moves, validate jumps, trigger animations, and check win states.

- [ ] **Valid Jumps Logic (`getValidMoves(node)`):**
  - For a selected piece at node `A`.
  - Check all adjacent nodes `B` (via the adjacency graph).
  - If `B` has a piece on it: Calculate the next node `C` in that straight line direction `A -> B -> C`.
  - If `C` is a valid node on the board AND `C` is empty: This is a valid jump.
- [ ] **Show Ghost Targets:**
  - When a piece on the board is clicked, calculate `getValidMoves()`.
  - Render semi-transparent "ghosts" or glowing circles at valid `C` nodes.
- [ ] **Execute the Jump:**
  - When a ghost target `C` is clicked:
    1. Update data state (move jumper to `C`, remove victim from `B`).
    2. Animate the jumper scaling up slightly and translating in an arc to `C`.
    3. Animate the middle piece fading out in 2 stages (e.g., opacity 0.5 -> 0.0).
    4. Translate the faded piece into the `Exit Box` UI panel, appending it to the bottom.
    5. Save state to `history` for Undo functionality.
- [ ] **Win Condition Logic:**
  - After every move: Check `board`. If `board` only has 1 piece left, AND that piece is the Red Leader: Trigger `Game Won`.
  - **Game Won Event:** Run a confetti animation (`canvas-confetti` library is perfect here), and show a "You Win!" overlay.

---

## 🎲 Phase 5: The "Random Game" Generator (Algorithmic Core)
**Goal:** Create a 100% solvable puzzle from a random configuration of the player's bank pieces.

*Note for AI Agent:* **Do not forward-search.** Forward searching random piece placements to see if they are solvable is computationally expensive and rarely yields a valid puzzle. **Use Reverse Searching.**

- [ ] **Implement Reverse-Play Algorithm (`generateLevel()`):**
  1. **Start at the End:** Place the Red Leader anywhere on an empty board.
  2. **Fetch Pieces:** Look at the player's setup in the piece bank (e.g., 1 Red, 4 Yellows). You need to place the 4 yellows.
  3. **Reverse a Jump:** Find an empty node `C`, an adjacent empty node `B`, and a piece currently at node `A`.
  4. Move the piece backward from `A` to `C`.
  5. Pull a yellow piece from the "required pieces" list and place it on the middle node `B`.
  6. **Iterate:** Repeat this random "un-jump" process until all required pieces are on the board.
  7. **Priority Check:** Before locking the puzzle, run a standard forward Depth-First Search (DFS) solver to ensure there is only *one* optimal sequence to win. If multiple solutions exist, either accept it (easier difficulty) or regenerate (harder).
- [ ] **Wire to UI:**
  - User selects exactly which pieces they want to play with in the Bank panel.
  - User clicks `Random Game`.
  - Generator runs -> Updates the board state immediately.

---

## 🤖 Core JS/Architecture Hints for the Coding Agent

Here is the essential JavaScript skeleton you should output or refer to while building:

```javascript
// Data Models
class Node {
    constructor(id, x, y) {
        this.id = id; 
        this.x = x; 
        this.y = y; 
        this.adjacent = []; // Array of connected Node IDs
    }
}

class GameState {
    constructor() {
        this.nodes = new Map(); // id -> Node
        this.board = new Map(); // id -> Piece
        this.bank = []; 
        this.exitBox = [];
        this.phase = 'setup'; // 'setup' | 'play'
    }

    // Helper to find valid jumps
    getJumps(nodeId) {
        const jumps = [];
        const startNode = this.nodes.get(nodeId);
        
        startNode.adjacent.forEach(midNodeId => {
            const midPiece = this.board.get(midNodeId);
            if (!midPiece) return; // Must jump OVER a piece
            
            // Calculate destination C based on vector A -> B
            const midNode = this.nodes.get(midNodeId);
            const dx = midNode.x - startNode.x;
            const dy = midNode.y - startNode.y;
            
            const destX = midNode.x + dx;
            const destY = midNode.y + dy;
            
            // Find if destination exists and is empty
            const destNode = Array.from(this.nodes.values()).find(n => n.x === destX && n.y === destY);
            if (destNode && !this.board.get(destNode.id)) {
                jumps.push({ to: destNode.id, over: midNodeId });
            }
        });
        return jumps;
    }
}
```

### Essential Tooling to Request from your Agent:
1.  **Vite / Webpack:** For quick module bundling if separating files.
2.  **D3.js or native Canvas:** Tell the agent to use `SVG` for the simplest node/click hit-boxing, and CSS transforms for `matrix3d` panning.
3.  **canvas-confetti:** Specifically request confetti.min.js for the win state.