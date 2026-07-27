// ============================================================
//  SEED ID SYSTEM for Random_Cubes_Puzzle.html
//
//  HOW TO ADD:
//  1. Open Random_Cubes_Puzzle.html
//  2. Find this line near the very bottom of the <script type="module">:
//         init();
//  3. Paste this ENTIRE file contents just above that line.
//  4. Then inside the init() function, find the line:
//         setupEventListeners();
//     and add this line right after it:
//         initSeedUI();
//
//  That's it! Two buttons appear in the top HUD:
//    💾  — copies the current seed to clipboard
//    📂  — prompts to paste a seed and restores the state
// ============================================================


// --- Seed Alphabet: 90 printable characters (no space, quote, backtick) ---
const SEED_ALPHA =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|;:,.?';

// Base-90 encode/decode helpers
function b90Enc(n) {
    if (n === 0) return SEED_ALPHA[0];
    let s = '';
    while (n > 0) { s = SEED_ALPHA[n % 90] + s; n = Math.floor(n / 90); }
    return s;
}
function b90Dec(s) {
    let n = 0;
    for (const c of s) { n = n * 90 + SEED_ALPHA.indexOf(c); }
    return n;
}
function b90EncW(n, w) {
    return b90Enc(n).padStart(w, SEED_ALPHA[0]);
}

// --- The 24 valid cube orientations (90 degree increments only) ---
// Cubes can only be rotated in 90-degree steps with the R key,
// so exactly 24 orientations exist. We store them as an index (0-23).
function buildOrientations() {
    function q(ax, ay, az, deg) {
        return new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(ax, ay, az).normalize(),
            deg * Math.PI / 180
        );
    }
    const faceUps = [
        new THREE.Quaternion(),   // identity (+Y up)
        q(1,0,0,  90),           // +Z face up
        q(1,0,0, 180),           // -Y face up
        q(1,0,0, 270),           // -Z face up
        q(0,0,1,  90),           // +X face up
        q(0,0,1, 270),           // -X face up
    ];
    const spins = [0, 90, 180, 270].map(d => q(0, 1, 0, d));
    const result = [];
    faceUps.forEach(fu => {
        spins.forEach(sp => {
            const combined = new THREE.Quaternion().multiplyQuaternions(fu, sp);
            combined.normalize();
            result.push(combined);
        });
    });
    return result;
}
let _orientations = null;
function getOrientations() {
    if (!_orientations) _orientations = buildOrientations();
    return _orientations;
}

// Find the closest of the 24 valid orientations to a given quaternion
function nearestOrientationIndex(q) {
    let best = 0, bestDot = -Infinity;
    getOrientations().forEach((o, i) => {
        const d = Math.abs(o.dot(q));
        if (d > bestDot) { bestDot = d; best = i; }
    });
    return best;
}

// --- Color encoding: #rrggbb -> 4 base-90 chars ---
// Max color value 16777215 < 90^4 = 65610000, so 4 chars is enough
function colorEnc(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return b90EncW(n, 4);
}
function colorDec(s4) {
    const n = b90Dec(s4);
    return '#' + n.toString(16).padStart(6, '0');
}

// --- Position encoding: integer range +-63, offset by 63 -> 0..126, fits in 2 base-90 chars ---
const POS_OFFSET = 63;
function posEnc(v) { return b90EncW(v + POS_OFFSET, 2); }
function posDec(s2) { return b90Dec(s2) - POS_OFFSET; }

// --- Edge opacity: 0.00-1.00 in 0.05 steps -> 21 values -> 1 base-90 char ---
function opacityEnc(v) { return b90Enc(Math.round(v / 0.05)); }
function opacityDec(c) { return b90Dec(c) * 0.05; }

// --- Edge width: 1-20 -> 1 base-90 char ---
function ewEnc(v) { return b90Enc(v - 1); }
function ewDec(c) { return b90Dec(c) + 1; }


// =============================================================
//  ENCODE: current state -> seed string
// =============================================================
function encodeSeed() {
    updateSettingsFromDOM();

    const cubes = app.cubeGroup.children.filter(c => c.isMesh);
    const count = cubes.length;

    // Flags: bit0=edgeVisible, bit1=threeColorMode, bit2=exportSolidBg
    let flags = 0;
    if (settings.edgeVisible)    flags |= 1;
    if (settings.threeColorMode) flags |= 2;
    if (settings.exportSolidBg)  flags |= 4;

    // Settings block (27 chars total):
    //   cubeColor(4) bgColor(4) edgeColor(4) opacity(1) edgeWidth(1)
    //   colorA(4) colorB(4) colorC(4) flags(1)
    const settingsBlock =
        colorEnc(settings.cubeColor)    +  // 4
        colorEnc(settings.bgColor)      +  // 4
        colorEnc(settings.edgeColor)    +  // 4
        opacityEnc(settings.edgeOpacity)+  // 1
        ewEnc(settings.edgeWidth)       +  // 1
        colorEnc(settings.colorA)       +  // 4
        colorEnc(settings.colorB)       +  // 4
        colorEnc(settings.colorC)       +  // 4
        b90Enc(flags);                     // 1  -> total 27

    // Cube block: each cube = x(2) y(2) z(2) rotation(1) = 7 chars
    let cubeBlock = '';
    cubes.forEach(cube => {
        const x  = Math.round(cube.position.x);
        const y  = Math.round(cube.position.y);
        const z  = Math.round(cube.position.z);
        const ri = nearestOrientationIndex(cube.quaternion);
        cubeBlock += posEnc(x) + posEnc(y) + posEnc(z) + b90Enc(ri);
    });

    // Final seed: countPrefix(2) + settingsBlock(27) + cubeBlock(7 x n)
    return b90EncW(count, 2) + settingsBlock + cubeBlock;
}


// =============================================================
//  DECODE: seed string -> restore state
// =============================================================
function decodeSeed(seed) {
    try {
        if (!seed || seed.trim() === '') return;

        let i = 0;
        const rd = (n) => { const s = seed.slice(i, i + n); i += n; return s; };

        // Count
        const count = b90Dec(rd(2));
        if (count < 0 || count > 150) throw new Error('Cube count out of range');

        // Settings
        const cubeColor   = colorDec(rd(4));
        const bgColor     = colorDec(rd(4));
        const edgeColor   = colorDec(rd(4));
        const edgeOpacity = opacityDec(rd(1));
        const edgeWidth   = ewDec(rd(1));
        const colorA      = colorDec(rd(4));
        const colorB      = colorDec(rd(4));
        const colorC      = colorDec(rd(4));
        const flags       = b90Dec(rd(1));
        const edgeVisible    = !!(flags & 1);
        const threeColorMode = !!(flags & 2);
        const exportSolidBg  = !!(flags & 4);

        // --- Step 1: Write ALL values to DOM first ---
        document.getElementById('color-picker').value             = cubeColor;
        document.getElementById('bg-color-picker').value          = bgColor;
        document.getElementById('edges-color-picker').value       = edgeColor;
        document.getElementById('edges-opacity-slider').value     = edgeOpacity;
        document.getElementById('edge-width-display').textContent = edgeWidth;
        document.getElementById('edges-toggle').checked           = edgeVisible;
        document.getElementById('three-color-toggle').checked     = threeColorMode;
        document.getElementById('color-picker-a').value           = colorA;
        document.getElementById('color-picker-b').value           = colorB;
        document.getElementById('color-picker-c').value           = colorC;
        document.getElementById('export-solid-bg').checked        = exportSolidBg;

        // Show/hide single vs 3-color pickers correctly
        const singleColorPicker = document.getElementById('color-picker');
        const singleColorLabel  = document.querySelector('label[for="color-picker"]');
        const threeColorPickers = document.getElementById('three-color-pickers');
        if (threeColorMode) {
            threeColorPickers.style.display = 'flex';
            singleColorPicker.style.display = 'none';
            singleColorLabel.style.display  = 'none';
        } else {
            threeColorPickers.style.display = 'none';
            singleColorPicker.style.display = '';
            singleColorLabel.style.display  = '';
        }

        // --- Step 2: Sync settings object from DOM ---
        // IMPORTANT: must happen AFTER all DOM values are set above,
        // so that settings.colorA/B/C are correct when cubes are built.
        updateSettingsFromDOM();

        // --- Step 3: Read cube positions and rotations ---
        const cubeData = [];
        for (let ci = 0; ci < count; ci++) {
            const x  = posDec(rd(2));
            const y  = posDec(rd(2));
            const z  = posDec(rd(2));
            const ri = b90Dec(rd(1));
            cubeData.push({ x, y, z, ri });
        }

        // --- Step 4: Rebuild the scene ---
        leaveMoveState();
        clearCubes();
        settings.cubeCount = count;
        document.getElementById('cube-count').textContent = count;

        const orients = getOrientations();
        cubeData.forEach(({ x, y, z, ri }) => {
            createCubeAndEdges(new THREE.Vector3(x, y, z));

            // Apply rotation to the cube and edges just created
            const allCubes = app.cubeGroup.children.filter(c => c.isMesh);
            const allEdges = app.cubeGroup.children.filter(c => c.userData.isEdges);
            const cube  = allCubes[allCubes.length - 1];
            const edges = allEdges[allEdges.length - 1];
            const q = orients[ri] ?? new THREE.Quaternion();
            cube.quaternion.copy(q);
            edges.quaternion.copy(q);
        });

        // --- Step 5: Apply edge color/opacity/visibility ---
        const newEdgeColor = new THREE.Color(edgeColor);
        app.cubeGroup.children.forEach(c => {
            if (c.userData.isEdges) {
                c.visible = edgeVisible;
                c.children.forEach(tube => {
                    tube.material.color.set(newEdgeColor);
                    tube.material.opacity = edgeOpacity;
                });
            }
        });

        // --- Step 6: Rebuild cube face materials ---
        // This is the critical fix for 3-color mode: must be called AFTER
        // updateSettingsFromDOM() has set settings.colorA/B/C correctly.
        updateAllCubeMaterials();

        // --- Step 7: Apply background color ---
        updateBackground();

        requestRender();

    } catch (e) {
        alert('Invalid seed: ' + e.message);
    }
}


// =============================================================
//  UI: inject the two buttons into the HUD
// =============================================================
function initSeedUI() {
    const cluster = document.querySelector('.hud-cluster');

    const copyBtn = document.createElement('button');
    copyBtn.title       = 'Copy Seed ID';
    copyBtn.textContent = '💾';
    copyBtn.addEventListener('click', () => {
        const seed = encodeSeed();
        navigator.clipboard.writeText(seed)
            .then(() => {
                copyBtn.textContent = '✅';
                setTimeout(() => { copyBtn.textContent = '💾'; }, 1500);
            })
            .catch(() => {
                // Fallback if clipboard API is blocked
                prompt('Copy this seed:', seed);
            });
    });

    const loadBtn = document.createElement('button');
    loadBtn.title       = 'Load Seed ID';
    loadBtn.textContent = '📂';
    loadBtn.addEventListener('click', () => {
        const seed = prompt('Paste Seed ID to restore:');
        if (seed !== null) decodeSeed(seed.trim());
    });

    cluster.appendChild(copyBtn);
    cluster.appendChild(loadBtn);

    // Bonus: auto-load from URL hash so you can share links like:
    //   Random_Cubes_Puzzle.html#<seed>
    const hashSeed = location.hash.slice(1);
    if (hashSeed) decodeSeed(decodeURIComponent(hashSeed));
}

// ============================================================
//  SEED LENGTH REFERENCE:
//    Total chars = 2 (count) + 27 (settings) + 7 x N (cubes)
//
//    1 cube   ->  36 chars
//    5 cubes  ->  64 chars
//   10 cubes  ->  99 chars
//   20 cubes  -> 169 chars
//   50 cubes  -> 379 chars
//  150 cubes  -> 1079 chars
// ============================================================
