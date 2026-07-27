Below is a **clear technical instruction document** you can copy directly to another AI agent so it can modify your `chess_ultimate.html` correctly and integrate the **Stockfish WASM engine**.
The goal is **stable integration + proper AI difficulty levels + correct checkmate detection**.

---

# Instruction for Agent: Integrate Stockfish Engine into `chess_ultimate.html`

## 1. Objective

Replace or enhance the current JavaScript chess AI with the **Stockfish WASM engine** located in:

```
./stockfish/stockfish.js
./stockfish/stockfish.wasm
```

The engine must:

* Provide **4 AI levels mapped to ELO strength**
* Prevent illegal situations such as **king capture without game ending**
* Improve **checkmate detection**
* Display **AI ELO rating in the UI**

---

# 2. Required Folder Structure

The project must follow this structure:

```
/chess_ultimate.html
/stockfish/
    stockfish.js
    stockfish.wasm
```

The HTML must load the engine like this:

```html
<script src="./stockfish/stockfish.js"></script>
```

---

# 3. Create Stockfish Engine Controller

Add a **Stockfish controller module** in JavaScript.

```javascript
let stockfish = null;
let stockfishReady = false;

function initStockfish() {
    stockfish = new Worker("./stockfish/stockfish.js");

    stockfish.onmessage = function(event) {
        const line = event.data;

        if (line === "uciok") {
            stockfishReady = true;
        }

        if (line.startsWith("bestmove")) {
            const move = line.split(" ")[1];
            onStockfishMove(move);
        }
    };

    stockfish.postMessage("uci");
}
```

Call this once when the game loads:

```javascript
initStockfish();
```

---

# 4. AI Level Configuration

Define the AI difficulty mapping.

```javascript
const AI_LEVELS = {
    1: { elo: 2300, depth: 10 },
    2: { elo: 2450, depth: 14 },
    3: { elo: 2550, depth: 18 },
    4: { elo: 2800, depth: 22 }
};
```

Explanation:

| Level | ELO   | Behavior             |
| ----- | ----- | -------------------- |
| AI 1  | ~2300 | Strong club master   |
| AI 2  | ~2450 | IM / weak GM         |
| AI 3  | ~2550 | GM strength          |
| AI 4  | ~2800 | near top engine play |

---

# 5. Set Engine Strength

Before asking Stockfish to move, configure its strength:

```javascript
function configureStockfish(level) {
    const cfg = AI_LEVELS[level];

    stockfish.postMessage("setoption name UCI_LimitStrength value true");
    stockfish.postMessage("setoption name UCI_Elo value " + cfg.elo);
}
```

---

# 6. Send Board Position to Engine

Whenever the AI must move:

```javascript
function requestAIMove(fen, level) {

    configureStockfish(level);

    stockfish.postMessage("position fen " + fen);

    const depth = AI_LEVELS[level].depth;

    stockfish.postMessage("go depth " + depth);
}
```

The board **must use FEN format**.

Example:

```
rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
```

---

# 7. Handle AI Move

Stockfish returns moves in **UCI format**:

```
e2e4
g8f6
e7e8q
```

Convert and apply move:

```javascript
function onStockfishMove(move) {

    const from = move.substring(0,2);
    const to = move.substring(2,4);
    const promotion = move.length > 4 ? move[4] : null;

    makeMove(from, to, promotion);
}
```

`makeMove()` should already exist in your chess logic.

---

# 8. Prevent King Capture

The engine will **never return illegal moves**.

But your UI must enforce rules using a chess engine library or rule validation.

Ensure:

```
if (game.isCheckmate())
    endGame("checkmate");

if (game.isStalemate())
    endGame("stalemate");
```

Do **NOT allow king capture as a normal move**.

---

# 9. Detect Checkmate Using Stockfish

Stockfish also reports mate evaluation.

Example engine output:

```
info depth 20 score mate 3
```

This means **mate in 3 moves**.

Parse this:

```javascript
if(line.includes("score mate")) {
   // highlight forced mate
}
```

But the actual game end should still rely on your **game rule system**.

---

# 10. Display AI ELO in UI

Add to the AI status panel:

Example UI text:

```
AI Level 1 (ELO 2300)
AI Level 2 (ELO 2450)
AI Level 3 (ELO 2550)
AI Level 4 (ELO 2800)
```

Example:

```javascript
function getAIName(level){
   const elo = AI_LEVELS[level].elo;
   return "AI Level " + level + " (ELO " + elo + ")";
}
```

---

# 11. Prevent Multiple Engine Calls

Ensure AI thinking only happens once per turn.

Add protection:

```javascript
let aiThinking = false;

function startAITurn(fen, level) {

    if(aiThinking) return;

    aiThinking = true;

    requestAIMove(fen, level);
}

function onStockfishMove(move){
    aiThinking = false;
    applyMove(move);
}
```

---

# 12. Engine Reset for New Game

When starting a new game:

```javascript
stockfish.postMessage("ucinewgame");
```

---

# 13. Performance Settings

To keep the browser responsive:

```
Threads = 1
Hash = 16
```

Set these once after engine start:

```javascript
stockfish.postMessage("setoption name Threads value 1");
stockfish.postMessage("setoption name Hash value 16");
```

---

# 14. Debug Mode (Optional)

Enable logging during development:

```javascript
stockfish.onmessage = function(e){
   console.log("SF:", e.data);
}
```

---

# 15. Expected Result

After integration:

* AI no longer makes **random weak moves**
* **Checkmate detection works correctly**
* **No king capture bug**
* AI strength behaves like **real chess ELO levels**
* UI displays **AI level + ELO**

---

# 16. Example Move Flow

```
Player move
↓
Update board
↓
Generate FEN
↓
Send FEN to Stockfish
↓
Stockfish calculates
↓
Receive bestmove
↓
Apply move to board
↓
Check checkmate/stalemate
```

---

If you want, I can also give you a **much stronger configuration used by professional chess sites** (adaptive depth, move time control, and instant blunder prevention).
That version makes the AI feel **far more human instead of perfect engine moves** — but it ends with the engine slowly grinding the player into a hopeless position anyway. ♟️
