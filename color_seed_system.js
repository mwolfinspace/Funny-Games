// ============================================================
// COLOR SEED SYSTEM — ≤6 char version
// Uses 216-color web-safe palette (6 levels per channel)
// 5 colors × log_89(216) → exactly 6 chars
//
// Encodes: Color1, Color2, Color3, Background, Edge
// Always produces exactly 6 characters.
// ============================================================

const CSEED_LEVELS = [0, 51, 102, 153, 204, 255]; // 6 web-safe steps
const CSEED_SLOTS = 5; // color1, color2, color3, background, edge
const CSEED_BASE = 216; // 6^3 colors per slot

// Snap a 0–255 value to nearest web-safe level
function snapLevel(v) {
    return CSEED_LEVELS.reduce((best, lv) => Math.abs(lv - v) < Math.abs(best - v) ? lv : best);
}

// RGB object → palette index 0–215
function rgbToIdx({ r, g, b }) {
    const ri = CSEED_LEVELS.indexOf(snapLevel(r));
    const gi = CSEED_LEVELS.indexOf(snapLevel(g));
    const bi = CSEED_LEVELS.indexOf(snapLevel(b));
    return ri * 36 + gi * 6 + bi;
}

// Palette index → { r, g, b }
function idxToRGB(idx) {
    return {
        r: CSEED_LEVELS[Math.floor(idx / 36) % 6],
        g: CSEED_LEVELS[Math.floor(idx / 6) % 6],
        b: CSEED_LEVELS[idx % 6],
    };
}

// =============================================================
// ENCODE: 5 colors → 6-char string
// =============================================================
function encodeColorSeed() {
    let value = 0n;
    const getters = [
        () => getColorAsRGB('colorA'),      // Corresponds to settings.colorA
        () => getColorAsRGB('colorB'),      // Corresponds to settings.colorB
        () => getColorAsRGB('colorC'),      // Corresponds to settings.colorC
        () => getColorAsRGB('bgColor'),     // Corresponds to settings.bgColor
        () => getColorAsRGB('edgeColor'),   // Corresponds to settings.edgeColor
    ];
    for (let i = 0; i < CSEED_SLOTS; i++) {
        value = value * BigInt(CSEED_BASE) + BigInt(rgbToIdx(getters[i]()));
    }
    const raw = window.b89Enc(value);
    return raw.padStart(6, window.SEED_ALPHA[0]);
}

// =============================================================
// DECODE: 6-char string → apply 5 colors
// =============================================================
function decodeColorSeed(seed) {
    seed = seed.trim();
    if (seed.length !== 6) throw new Error('Color seed must be exactly 6 characters');
    let value = window.b89Dec(seed);
    const indices = [];
    for (let i = 0; i < CSEED_SLOTS; i++) {
        indices.unshift(Number(value % BigInt(CSEED_BASE)));
        value /= BigInt(CSEED_BASE);
    }
    return indices.map(idxToRGB);
}

function applyColorSeed(seed) {
    const setters = [
        (r,g,b) => setColorFromRGB('colorA', r, g, b),
        (r,g,b) => setColorFromRGB('colorB', r, g, b),
        (r,g,b) => setColorFromRGB('colorC', r, g, b),
        (r,g,b) => setColorFromRGB('bgColor', r, g, b),
        (r,g,b) => setColorFromRGB('edgeColor', r, g, b),
    ];
    const colors = decodeColorSeed(seed);
    colors.forEach(({ r, g, b }, i) => setters[i](r, g, b));

    // After applying all colors, trigger a single render and save
    window.updateAllCubeMaterials(); // This function should exist in the main script
    window.saveSettingsToLocalStorage(); // This function should exist
}

// =============================================================
// IMPLEMENTATION HELPERS — replace stubs with real app calls
// =============================================================
function hexToRgb(hex) {
    if (!hex) return { r: 0, g: 0, b: 0 };
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).padStart(6, '0');
}

// Gets color from the main app's `settings` object
function getColorAsRGB(slot) {
    const colorHex = window.settings[slot]; // Assumes window.settings is accessible
    return hexToRgb(colorHex);
}

// Sets color in the main app's `settings` object and updates the UI
function setColorFromRGB(slot, r, g, b) {
    const hex = rgbToHex(r, g, b);
    window.settings[slot] = hex; // Update settings object

    // Update the corresponding color picker UI element
    let picker;
    switch(slot) {
        case 'colorA': picker = document.getElementById('color-picker-a'); break;
        case 'colorB': picker = document.getElementById('color-picker-b'); break;
        case 'colorC': picker = document.getElementById('color-picker-c'); break;
        case 'bgColor': picker = document.getElementById('bg-color-picker'); break;
        case 'edgeColor': picker = document.getElementById('edges-color-picker'); break;
    }
    if (picker) {
        picker.value = hex;
    }
}


// =============================================================
// UI: 🎨 copy and 🖌️ load buttons
// =============================================================
function initColorSeedUI() {
    // UI is now created directly in the HTML for better structure.
    // This function just hooks up the listeners.
    const copyBtn = document.getElementById('copy-color-seed-btn');
    const seedInput = document.getElementById('color-seed-input');

    copyBtn.addEventListener('click', () => {
        const seed = encodeColorSeed();
        seedInput.value = seed;
        navigator.clipboard.writeText(seed).then(() => {
            window.showToast('Color seed copied!'); // Assumes a global showToast function
        }).catch(err => {
            console.error('Failed to copy color seed: ', err);
            seedInput.select(); // Fallback for user to copy manually
        });
    });

    seedInput.addEventListener('change', (event) => {
        const seed = event.target.value.trim();
        if (seed.length === 6) {
            try {
                applyColorSeed(seed);
                window.showToast('Color scheme loaded!');
            } catch (e) {
                console.error('Invalid color seed:', e.message);
                window.showToast('Invalid color seed!', true);
            }
        } else if (seed.length > 0) {
            window.showToast('Color seed must be 6 characters.', true);
        }
    });

     // Also automatically generate and show the seed whenever colors change
    const colorPickers = [
        'color-picker-a', 'color-picker-b', 'color-picker-c',
        'bg-color-picker', 'edges-color-picker'
    ];
    colorPickers.forEach(id => {
        const picker = document.getElementById(id);
        if(picker) {
            picker.addEventListener('input', () => {
                 seedInput.value = encodeColorSeed();
            });
        }
    });

    // Set initial value
    seedInput.value = encodeColorSeed();
}
