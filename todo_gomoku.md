This todo list outlines the development process for a high-performance, 5-in-a-row (Gomoku style) game optimized for web and mobile browsers.

### Phase 1: Engine & Core Logic
* [ ] **Grid Architecture:** Implement a coordinate-based system (e.g., a Map or Object) rather than a fixed array to allow for an "infinite" or very large game board without consuming memory for empty cells.
* [ ] **Win Detection Algorithm:** Create a function to check for 5 consecutive symbols in four directions (Horizontal, Vertical, Diagonal-Up, Diagonal-Down).
    * *Score Mode:* Algorithm must flag winning lines but allow the game to continue, preventing the same 5-set from being scored twice.
    * *First Check Mode:* Trigger a "Match Over" state immediately upon the first 5-in-a-row.
* [ ] **Turn Management System:** * Support 2, 3, or 4 players in a circular queue.
    * Implement 2vs2 logic (Player 1 & 3 vs. Player 2 & 4).
* [ ] **History Stack:** Build an array-based Undo/Redo system that stores board state and the score at that specific turn.

### Phase 2: User Interface (Windows 11 "Acrylic" Style)
* [ ] **Main Menu:** Design a clean overlay for mode selection (PvP vs. PvE) and player count.
* [ ] **Color & Symbol Picker:** * Selection logic to ensure unique colors (e.g., if Player 1 picks Blue, Blue is disabled for others).
    * Assign X/O symbols based on team or individual preference.
* [ ] **Floating Control Panel:**
    * Apply `backdrop-filter: blur(20px)` and semi-transparent white backgrounds for the "Acrylic" look.
    * Position at the bottom with a subtle shadow and rounded corners (`border-radius: 12px`).
* [ ] **Turn Queue:** A visual horizontal list at the bottom highlighting the active player with a pulse animation.
* [ ] **Status Popups:** Create HTML/CSS modals for game results that use `opacity` transitions instead of `filter: blur()` on the background to remain lightweight.

### Phase 3: Interaction & Viewport
* [ ] **Canvas Rendering:** Use an HTML5 Canvas for the game zone to ensure high FPS on low-end devices.
* [ ] **Pan & Zoom Logic:**
    * Implement pointer events to handle mouse dragging and two-finger touch gestures.
    * [ ] **Auto-Zoom Toggle:** Create a function that calculates the bounding box of all played pieces and adjusts the camera to fit them in view.
* [ ] **Responsive Canvas:** Ensure the canvas resizes dynamically to `window.innerWidth/Height` without losing the coordinate mapping.

### Phase 4: Artificial Intelligence (5 Levels)
* [ ] **Level 1 (Dumb):** Randomly selects any empty valid cell.
* [ ] **Level 2 (Easy):** Prioritizes blocking a player's "open 3" or "open 4".
* [ ] **Level 3 (Medium):** Basic heuristic—evaluates its own potential lines while defending.
* [ ] **Level 4 (Hard):** Minimax algorithm with a depth of 2-3 moves.
* [ ] **Level 5 (Smartest):** Minimax with Alpha-Beta pruning and a sophisticated evaluation function (threat-space search).

### Phase 5: Polish & Effects
* [ ] **SFX Engine:** Use the Web Audio API for a "Happy Tune" trigger on score.
* [ ] **Confetti System:** A lightweight particle emitter on the canvas for the winner.
* [ ] **Timer:** A countdown per turn that auto-skips or assigns a random move if it reaches zero.

---

### Sample Code: Windows 11 Acrylic Style (CSS)
```css
:root {
  --acrylic-bg: rgba(255, 255, 255, 0.7);
  --acrylic-border: rgba(255, 255, 255, 0.3);
  --win-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.15);
}

.bottom-panel {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 600px;
  background: var(--acrylic-bg);
  backdrop-filter: blur(15px) saturate(180%);
  -webkit-backdrop-filter: blur(15px) saturate(180%);
  border: 1px solid var(--acrylic-border);
  border-radius: 16px;
  box-shadow: var(--win-shadow);
  display: flex;
  justify-content: space-around;
  padding: 15px;
  z-index: 100;
}

.player-highlight {
  transition: all 0.3s ease;
  padding: 5px 10px;
  border-radius: 8px;
}

.player-highlight.active {
  background: rgba(0, 0, 0, 0.05);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1);
}
```

### Sample Logic: Pan and Zoom State
```javascript
const camera = {
  x: 0,
  y: 0,
  zoom: 1,
  isDragging: false,
  lastMouse: { x: 0, y: 0 }
};

function screenToWorld(screenX, screenY) {
  return {
    x: (screenX - window.innerWidth / 2) / camera.zoom + camera.x,
    y: (screenY - window.innerHeight / 2) / camera.zoom + camera.y
  };
}

function handleWheel(e) {
  e.preventDefault();
  const zoomSpeed = 0.001;
  camera.zoom -= e.deltaY * zoomSpeed;
  camera.zoom = Math.min(Math.max(0.5, camera.zoom), 3); // Constraints
}
```

### Recommended Asset Checklist
* **Audio:** 1 Short "Click" sound, 1 "Win/Score" melodic chime (approx 1-2 seconds).
* **Icons:** Use SVG for Undo, Redo, Zoom, and Rematch buttons to keep the file size minimal.
* **Optimization:** Ensure `requestAnimationFrame` is only running when the board is moving or an animation (confetti/zoom) is occurring to save battery on mobile devices.