// ============================================================
//  COMPACT SHAPE SEED SYSTEM for Random_Cubes_Puzzle.html
//
//  Saves ONLY the shape (cube positions relative to each other).
//  Colors, edges, and camera are NOT saved — just the structure.
//
//  SEED LENGTH:
//    1 cube  →  1 char
//    2 cubes →  2 chars
//    3 cubes →  2 chars
//    5 cubes →  3–4 chars
//   10 cubes →  ~8 chars
//   20 cubes →  ~18 chars
//   50 cubes →  ~53 chars
//  150 cubes →  ~196 chars
//
//  HOW TO ADD:
//  1. Open Random_Cubes_Puzzle.html
//  2. Find this line near the bottom of the <script type="module">:
//         init();
//  3. Paste this ENTIRE file contents just above that line.
//  4. Inside the init() function, find:
//         setupEventListeners();
//     and add right after it:
//         initSeedUI();
//
//  Two buttons appear in the HUD:
//    💾  → copies seed to clipboard
//    📂  → prompts for seed and restores the shape
// ============================================================


// --- Alphabet: 89 safe printable ASCII chars (no " ' ` \ /) ---
const SEED_ALPHA = '!#$%&()*+,-.0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz[]^_{|}~';
const SEED_BASE  = 89; // SEED_ALPHA.length

// BigInt base-89 encode/decode
function b89Enc(bn) {
    if (typeof bn === 'number') bn = BigInt(bn);
    if (bn === 0n) return SEED_ALPHA[0];
    const B = BigInt(SEED_BASE);
    let s = '', x = bn;
    while (x > 0n) { s = SEED_ALPHA[Number(x % B)] + s; x = x / B; }
    return s;
}
function b89Dec(s) {
    const B = BigInt(SEED_BASE);
    let n = 0n;
    for (const c of s) {
        const idx = SEED_ALPHA.indexOf(c);
        if (idx === -1) throw new Error(`Unknown character in seed: "${c}"`);
        n = n * B + BigInt(idx);
    }
    return n;
}


// --- The 6 face directions (index matches THREE.js cube face order) ---
const SEED_DIRS = [
    [ 1, 0, 0], [-1, 0, 0],
    [ 0, 1, 0], [ 0,-1, 0],
    [ 0, 0, 1], [ 0, 0,-1],
];


// =============================================================
//  ENCODE: cube positions → seed string
//
//  Algorithm: BFS spanning tree.
//  Each cube (after the first) is described by:
//    - which already-placed cube it connects to  (parentSlot, 0..k-1)
//    - which face it attaches to                 (faceIdx, 0..5)
//  Combined digit = parentSlot * 6 + faceIdx
//  Radix for step k = k * 6   (k choices for parent × 6 faces)
//  All digits are packed into one big integer → encoded in base-89.
// =============================================================
function encodeSeedShape(positions) {
    const n = positions.length;
    if (n <= 1) return encodeCount(n); // "!" for 1 cube

    // Build a map from "x,y,z" → original array index
    const posMap = new Map();
    positions.forEach((p, i) => posMap.set(p.join(','), i));

    // BFS to record the spanning tree
    const visited  = new Array(n).fill(false);
    const bfsSlot  = new Array(n).fill(-1); // which BFS-visit slot each cube got
    visited[0]     = true;
    bfsSlot[0]     = 0;
    const queue    = [0];
    const steps    = []; // steps[k] = [parentSlot, faceIdx] for the (k+1)-th cube

    while (queue.length) {
        const cur         = queue.shift();
        const [cx, cy, cz] = positions[cur];
        for (let f = 0; f < 6; f++) {
            const [dx, dy, dz] = SEED_DIRS[f];
            const key = `${cx+dx},${cy+dy},${cz+dz}`;
            if (posMap.has(key)) {
                const ni = posMap.get(key);
                if (!visited[ni]) {
                    visited[ni]  = true;
                    bfsSlot[ni]  = steps.length + 1;
                    steps.push([bfsSlot[cur], f]);
                    queue.push(ni);
                }
            }
        }
    }

    // Mixed-radix pack into one BigInt
    // step k (0-indexed): digit = parentSlot*6 + faceIdx, radix = (k+1)*6
    let value = 0n, multiplier = 1n;
    for (let k = 0; k < steps.length; k++) {
        const [parentSlot, faceIdx] = steps[k];
        value      += (BigInt(parentSlot) * 6n + BigInt(faceIdx)) * multiplier;
        multiplier *= BigInt(k + 1) * 6n;
    }

    return encodeCount(n) + b89Enc(value);
}


// =============================================================
//  DECODE: seed string → array of [x,y,z] positions
// =============================================================
function decodeSeedShape(seed) {
    if (!seed || !seed.trim()) throw new Error('Empty seed');

    const { n, skip } = decodeCount(seed);
    if (n <= 1) return [[0, 0, 0]];

    let value = b89Dec(seed.slice(skip));

    // Unpack mixed-radix digits
    const steps = [];
    for (let k = 0; k < n - 1; k++) {
        const radix = BigInt(k + 1) * 6n;
        const digit = Number(value % radix);
        steps.push([Math.floor(digit / 6), digit % 6]);
        value = value / radix;
    }

    // Rebuild positions in BFS order
    const placed = [[0, 0, 0]];
    for (const [parentSlot, faceIdx] of steps) {
        const [px, py, pz]   = placed[parentSlot];
        const [dx, dy, dz]   = SEED_DIRS[faceIdx];
        placed.push([px+dx, py+dy, pz+dz]);
    }
    return placed;
}


// --- Count encoding ---
// n = 1..89  → 1 char (SEED_ALPHA[n-1])
// n = 90..150 → '/' + SEED_ALPHA[n-90]   ('/' is not in SEED_ALPHA, safe sentinel)
function encodeCount(n) {
    if (n <= SEED_BASE) return SEED_ALPHA[n - 1];
    return '/' + SEED_ALPHA[n - SEED_BASE - 1];
}
function decodeCount(seed) {
    if (seed[0] === '/') return { n: SEED_ALPHA.indexOf(seed[1]) + SEED_BASE + 1, skip: 2 };
    const n = SEED_ALPHA.indexOf(seed[0]) + 1;
    if (n === 0) throw new Error('Invalid count character');
    return { n, skip: 1 };
}


// =============================================================
//  APPLY: restore a decoded position list into the scene
// =============================================================
function applyDecodedShape(positions) {
    const n = positions.length;

    leaveMoveState();
    clearCubes();
    settings.cubeCount = n;
    document.getElementById('cube-count').textContent = n;

    positions.forEach(([x, y, z]) => {
        createCubeAndEdges(new THREE.Vector3(x, y, z));
    });

    requestRender();
}


// =============================================================
//  UI: inject 💾 and 📂 buttons into the first HUD cluster
// =============================================================
function initSeedUI() {
    const cluster = document.querySelector('.hud-cluster');

    const copyBtn       = document.createElement('button');
    copyBtn.title       = 'Copy Seed ID (shape only)';
    copyBtn.textContent = '💾';
    copyBtn.addEventListener('click', () => {
        // Collect current cube positions from the scene
        const cubes     = app.cubeGroup.children.filter(c => c.isMesh);
        const positions = cubes.map(c => [
            Math.round(c.position.x),
            Math.round(c.position.y),
            Math.round(c.position.z),
        ]);

        if (positions.length === 0) {
            alert('No cubes to save!');
            return;
        }

        const seed = encodeSeedShape(positions);
        navigator.clipboard.writeText(seed)
            .then(() => {
                copyBtn.textContent = '✅';
                setTimeout(() => { copyBtn.textContent = '💾'; }, 1500);
            })
            .catch(() => {
                // Fallback for browsers that block clipboard API
                prompt('Copy this seed:', seed);
            });
    });

    const loadBtn       = document.createElement('button');
    loadBtn.title       = 'Load Seed ID';
    loadBtn.textContent = '📂';
    loadBtn.addEventListener('click', () => {
        const seed = prompt('Paste Seed ID to restore shape:');
        if (seed === null) return;
        try {
            const positions = decodeSeedShape(seed.trim());
            applyDecodedShape(positions);
        } catch (e) {
            alert('❌ Invalid seed: ' + e.message);
        }
    });

    cluster.appendChild(copyBtn);
    cluster.appendChild(loadBtn);

    // Optional: auto-load from URL hash for shareable links:
    //   Random_Cubes_Puzzle.html#<seed>
    const hashSeed = location.hash.slice(1);
    if (hashSeed) {
        try {
            const positions = decodeSeedShape(decodeURIComponent(hashSeed));
            applyDecodedShape(positions);
        } catch (e) {
            console.warn('Could not load seed from URL hash:', e.message);
        }
    }
}

// ============================================================
//  SEED LENGTH REFERENCE (shape only, no colors saved):
//
//    chars = 1 (count) + ceil(log_89( product of k*6 for k=1..N-1 ))
//
//    1 cube   →   1 char
//    2 cubes  →   2 chars
//    3 cubes  →   2 chars
//    5 cubes  →   3–4 chars     ← always < 5 chars ✓
//    10 cubes →   ~8 chars
//    20 cubes →   ~18 chars
//    50 cubes →   ~53 chars
//   150 cubes →   ~196 chars
// ============================================================
