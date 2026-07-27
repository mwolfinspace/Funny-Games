/**
 * SUDOKU COLOR THEMES
 * 9 colors per theme (for digits 1–9)
 * Includes standard, colorblind-friendly, and special themes.
 *
 * Each color entry:
 *   bg      — cell background fill
 *   text    — digit text color
 *   label   — human-readable name (useful for accessibility / legend)
 */

const SUDOKU_THEMES = {

  // ─────────────────────────────────────────────
  // 1. CLASSIC PASTEL  (default, wide-audience)
  // ─────────────────────────────────────────────
  classicPastel: {
    name: "Classic Pastel",
    description: "Soft, pleasant pastels. Good for most players.",
    colors: [
      { digit: 1, bg: "#FF9AA2", text: "#7B0008", label: "Rose" },
      { digit: 2, bg: "#FFB347", text: "#7B3A00", label: "Peach" },
      { digit: 3, bg: "#FFDAC1", text: "#7B4B00", label: "Apricot" },
      { digit: 4, bg: "#E2F0CB", text: "#2D5A00", label: "Pistachio" },
      { digit: 5, bg: "#B5EAD7", text: "#005C3B", label: "Mint" },
      { digit: 6, bg: "#C7CEEA", text: "#1A2A7B", label: "Periwinkle" },
      { digit: 7, bg: "#DEB8F5", text: "#4A007B", label: "Lavender" },
      { digit: 8, bg: "#F7C8E0", text: "#7B0050", label: "Blush" },
      { digit: 9, bg: "#FFF1A8", text: "#7B6200", label: "Butter" },
    ],
  },

  // ─────────────────────────────────────────────
  // 2. VIVID RAINBOW  (high contrast, fun)
  // ─────────────────────────────────────────────
  vividRainbow: {
    name: "Vivid Rainbow",
    description: "Bold, saturated hues for players who love color.",
    colors: [
      { digit: 1, bg: "#E63946", text: "#FFFFFF", label: "Red" },
      { digit: 2, bg: "#F4842D", text: "#FFFFFF", label: "Orange" },
      { digit: 3, bg: "#F9C74F", text: "#2D2D00", label: "Yellow" },
      { digit: 4, bg: "#43AA8B", text: "#FFFFFF", label: "Teal Green" },
      { digit: 5, bg: "#277DA1", text: "#FFFFFF", label: "Cerulean" },
      { digit: 6, bg: "#4361EE", text: "#FFFFFF", label: "Blue" },
      { digit: 7, bg: "#7B2D8B", text: "#FFFFFF", label: "Purple" },
      { digit: 8, bg: "#F72585", text: "#FFFFFF", label: "Hot Pink" },
      { digit: 9, bg: "#80B918", text: "#FFFFFF", label: "Lime" },
    ],
  },

  // ─────────────────────────────────────────────
  // 3. DARK MODE NEON  (dark background theme)
  // ─────────────────────────────────────────────
  darkNeon: {
    name: "Dark Mode Neon",
    description: "Neon glows on dark cells — great for night play.",
    boardBg: "#1A1A2E",
    colors: [
      { digit: 1, bg: "#16213E", text: "#FF6B6B", label: "Neon Red" },
      { digit: 2, bg: "#16213E", text: "#FF9F43", label: "Neon Orange" },
      { digit: 3, bg: "#16213E", text: "#FECA57", label: "Neon Yellow" },
      { digit: 4, bg: "#16213E", text: "#48DBFB", label: "Neon Cyan" },
      { digit: 5, bg: "#16213E", text: "#1DD1A1", label: "Neon Green" },
      { digit: 6, bg: "#16213E", text: "#54A0FF", label: "Neon Blue" },
      { digit: 7, bg: "#16213E", text: "#A29BFE", label: "Neon Violet" },
      { digit: 8, bg: "#16213E", text: "#FD79A8", label: "Neon Pink" },
      { digit: 9, bg: "#16213E", text: "#BADC58", label: "Neon Lime" },
    ],
  },

  // ─────────────────────────────────────────────
  // 4. EARTHY TONES  (calm, nature-inspired)
  // ─────────────────────────────────────────────
  earthy: {
    name: "Earthy Tones",
    description: "Warm, grounded palette inspired by nature.",
    colors: [
      { digit: 1, bg: "#C1440E", text: "#FFFFFF", label: "Terracotta" },
      { digit: 2, bg: "#D4845A", text: "#FFFFFF", label: "Clay" },
      { digit: 3, bg: "#E8B86D", text: "#3B2000", label: "Sand" },
      { digit: 4, bg: "#6B8F71", text: "#FFFFFF", label: "Sage" },
      { digit: 5, bg: "#4A7C59", text: "#FFFFFF", label: "Forest" },
      { digit: 6, bg: "#3D7A8A", text: "#FFFFFF", label: "Teal" },
      { digit: 7, bg: "#5B4A72", text: "#FFFFFF", label: "Plum" },
      { digit: 8, bg: "#8B5E3C", text: "#FFFFFF", label: "Bark" },
      { digit: 9, bg: "#B5A642", text: "#FFFFFF", label: "Olive" },
    ],
  },

  // ─────────────────────────────────────────────
  // 5. DEUTERANOPIA SAFE  ✅ Red-Green Colorblind
  //    Uses Blue / Orange / Yellow family — avoids red/green confusion
  // ─────────────────────────────────────────────
  deuteranopiaFriendly: {
    name: "Deuteranopia Friendly",
    description:
      "Safe for red-green colorblindness (deuteranopia/protanopia). Uses blue-orange-yellow spectrum + symbols.",
    accessibilityNote:
      "Pair with digit labels or shapes (●▲■) for full accessibility.",
    colors: [
      { digit: 1, bg: "#0077BB", text: "#FFFFFF", label: "Blue",          symbol: "●" },
      { digit: 2, bg: "#EE7733", text: "#FFFFFF", label: "Orange",        symbol: "▲" },
      { digit: 3, bg: "#FFDD00", text: "#333300", label: "Yellow",        symbol: "■" },
      { digit: 4, bg: "#33BBEE", text: "#003344", label: "Cyan",          symbol: "◆" },
      { digit: 5, bg: "#CC3311", text: "#FFFFFF", label: "Vermillion",    symbol: "★" },
      { digit: 6, bg: "#009988", text: "#FFFFFF", label: "Teal",          symbol: "▼" },
      { digit: 7, bg: "#AA4499", text: "#FFFFFF", label: "Purple",        symbol: "⬟" },
      { digit: 8, bg: "#FFFFFF", text: "#000000", label: "White",         symbol: "○" },
      { digit: 9, bg: "#000000", text: "#FFFFFF", label: "Black",         symbol: "□" },
    ],
  },

  // ─────────────────────────────────────────────
  // 6. TRITANOPIA SAFE  ✅ Blue-Yellow Colorblind
  //    Avoids blue/yellow confusion — uses red/green/pink/gray range
  // ─────────────────────────────────────────────
  tritanopiaFriendly: {
    name: "Tritanopia Friendly",
    description:
      "Safe for blue-yellow colorblindness (tritanopia). Uses red-pink-green spectrum.",
    accessibilityNote: "Pair with digit labels for best results.",
    colors: [
      { digit: 1, bg: "#C0392B", text: "#FFFFFF", label: "Red",          symbol: "●" },
      { digit: 2, bg: "#E74C3C", text: "#FFFFFF", label: "Crimson",      symbol: "▲" },
      { digit: 3, bg: "#F39C12", text: "#FFFFFF", label: "Amber",        symbol: "■" },
      { digit: 4, bg: "#27AE60", text: "#FFFFFF", label: "Green",        symbol: "◆" },
      { digit: 5, bg: "#2ECC71", text: "#FFFFFF", label: "Emerald",      symbol: "★" },
      { digit: 6, bg: "#8E44AD", text: "#FFFFFF", label: "Violet",       symbol: "▼" },
      { digit: 7, bg: "#E91E8C", text: "#FFFFFF", label: "Magenta",      symbol: "⬟" },
      { digit: 8, bg: "#795548", text: "#FFFFFF", label: "Brown",        symbol: "○" },
      { digit: 9, bg: "#607D8B", text: "#FFFFFF", label: "Slate",        symbol: "□" },
    ],
  },

  // ─────────────────────────────────────────────
  // 7. MONOCHROME ACCESSIBLE  ✅ Full Colorblind / Low Vision
  //    Relies on lightness contrast + shape, not hue at all
  // ─────────────────────────────────────────────
  monochromeAccessible: {
    name: "Monochrome Accessible",
    description:
      "Works for ALL types of colorblindness including achromatopsia. Pure grayscale with high contrast.",
    accessibilityNote:
      "Relies entirely on lightness contrast. Best combined with digit numbers clearly shown.",
    colors: [
      { digit: 1, bg: "#FFFFFF", text: "#000000", label: "White",         symbol: "1" },
      { digit: 2, bg: "#DDDDDD", text: "#000000", label: "Light Gray",    symbol: "2" },
      { digit: 3, bg: "#BBBBBB", text: "#000000", label: "Silver",        symbol: "3" },
      { digit: 4, bg: "#999999", text: "#FFFFFF", label: "Gray",          symbol: "4" },
      { digit: 5, bg: "#777777", text: "#FFFFFF", label: "Dark Gray",     symbol: "5" },
      { digit: 6, bg: "#555555", text: "#FFFFFF", label: "Charcoal",      symbol: "6" },
      { digit: 7, bg: "#333333", text: "#FFFFFF", label: "Almost Black",  symbol: "7" },
      { digit: 8, bg: "#111111", text: "#FFFFFF", label: "Near Black",    symbol: "8" },
      { digit: 9, bg: "#000000", text: "#FFFFFF", label: "Black",         symbol: "9" },
    ],
  },

  // ─────────────────────────────────────────────
  // 8. IBM COLORBLIND PALETTE  ✅ Well-tested accessible
  //    Based on IBM's official colorblind-safe palette
  // ─────────────────────────────────────────────
  ibmAccessible: {
    name: "IBM Accessible",
    description:
      "Based on IBM's scientifically tested colorblind-safe color palette. Safe for most CVD types.",
    colors: [
      { digit: 1, bg: "#648FFF", text: "#000000", label: "IBM Ultramarine" },
      { digit: 2, bg: "#785EF0", text: "#FFFFFF", label: "IBM Purple" },
      { digit: 3, bg: "#DC267F", text: "#FFFFFF", label: "IBM Magenta" },
      { digit: 4, bg: "#FE6100", text: "#FFFFFF", label: "IBM Orange" },
      { digit: 5, bg: "#FFB000", text: "#000000", label: "IBM Gold" },
      { digit: 6, bg: "#009E73", text: "#FFFFFF", label: "Teal" },
      { digit: 7, bg: "#56B4E9", text: "#000000", label: "Sky Blue" },
      { digit: 8, bg: "#F0E442", text: "#000000", label: "Yellow" },
      { digit: 9, bg: "#E69F00", text: "#000000", label: "Amber" },
    ],
  },

  // ─────────────────────────────────────────────
  // 9. WONG COLORBLIND PALETTE  ✅ Most cited accessible set
  //    Bang Wong (Nature Methods 2011) — widely recommended
  // ─────────────────────────────────────────────
  wongAccessible: {
    name: "Wong Accessible (Nature Methods)",
    description:
      "Bang Wong's 8+1 palette (Nature Methods, 2011). One of the most widely cited colorblind-safe palettes in science.",
    colors: [
      { digit: 1, bg: "#E69F00", text: "#000000", label: "Orange" },
      { digit: 2, bg: "#56B4E9", text: "#000000", label: "Sky Blue" },
      { digit: 3, bg: "#009E73", text: "#FFFFFF", label: "Bluish Green" },
      { digit: 4, bg: "#F0E442", text: "#333300", label: "Yellow" },
      { digit: 5, bg: "#0072B2", text: "#FFFFFF", label: "Blue" },
      { digit: 6, bg: "#D55E00", text: "#FFFFFF", label: "Vermillion" },
      { digit: 7, bg: "#CC79A7", text: "#000000", label: "Reddish Purple" },
      { digit: 8, bg: "#000000", text: "#FFFFFF", label: "Black" },
      { digit: 9, bg: "#FFFFFF", text: "#000000", label: "White" },
    ],
  },

  // ─────────────────────────────────────────────
  // 10. OCEAN  (bonus calm theme)
  // ─────────────────────────────────────────────
  ocean: {
    name: "Ocean",
    description: "Deep sea blues and teals for a relaxing experience.",
    colors: [
      { digit: 1, bg: "#03045E", text: "#FFFFFF", label: "Abyss" },
      { digit: 2, bg: "#023E8A", text: "#FFFFFF", label: "Navy" },
      { digit: 3, bg: "#0077B6", text: "#FFFFFF", label: "Ocean" },
      { digit: 4, bg: "#0096C7", text: "#FFFFFF", label: "Sea" },
      { digit: 5, bg: "#00B4D8", text: "#000000", label: "Lagoon" },
      { digit: 6, bg: "#48CAE4", text: "#000000", label: "Aqua" },
      { digit: 7, bg: "#90E0EF", text: "#000000", label: "Sky" },
      { digit: 8, bg: "#ADE8F4", text: "#000000", label: "Mist" },
      { digit: 9, bg: "#CAF0F8", text: "#000000", label: "Foam" },
    ],
  },

  // ─────────────────────────────────────────────
  // 11. SUNSET GRADIENT  (warm dusk tones)
  // ─────────────────────────────────────────────
  sunset: {
    name: "Sunset",
    description: "Warm dusk gradient from gold to deep violet.",
    colors: [
      { digit: 1, bg: "#FFCA28", text: "#3B2000", label: "Gold" },
      { digit: 2, bg: "#FF8F00", text: "#FFFFFF", label: "Amber" },
      { digit: 3, bg: "#FF6D00", text: "#FFFFFF", label: "Tangerine" },
      { digit: 4, bg: "#F4511E", text: "#FFFFFF", label: "Coral" },
      { digit: 5, bg: "#E53935", text: "#FFFFFF", label: "Red" },
      { digit: 6, bg: "#C62828", text: "#FFFFFF", label: "Crimson" },
      { digit: 7, bg: "#AD1457", text: "#FFFFFF", label: "Berry" },
      { digit: 8, bg: "#6A1B9A", text: "#FFFFFF", label: "Grape" },
      { digit: 9, bg: "#283593", text: "#FFFFFF", label: "Dusk" },
    ],
  },

};

// ─────────────────────────────────────────────────────────────────
// USAGE EXAMPLE
// ─────────────────────────────────────────────────────────────────
//
//   import { SUDOKU_THEMES } from './sudoku-color-themes.js';
//
//   const theme = SUDOKU_THEMES.wongAccessible;
//   const colorForDigit3 = theme.colors.find(c => c.digit === 3);
//   // → { digit: 3, bg: "#009E73", text: "#FFFFFF", label: "Bluish Green" }
//
//   // Apply to a cell:
//   cell.style.backgroundColor = colorForDigit3.bg;
//   cell.style.color           = colorForDigit3.text;
//
// ─────────────────────────────────────────────────────────────────
// ACCESSIBILITY RECOMMENDATIONS
// ─────────────────────────────────────────────────────────────────
//
//  1. Always display the digit number on top of the color (don't replace digits with color alone).
//  2. For colorblind modes, also render the `symbol` field inside the cell.
//  3. Offer a theme picker so users can choose what works for them.
//  4. Recommended theme order in your UI picker:
//       - wongAccessible       ← best general colorblind-safe default
//       - deuteranopiaFriendly ← red/green blind (most common)
//       - tritanopiaFriendly   ← blue/yellow blind
//       - monochromeAccessible ← all colorblind types / low vision
//       - ibmAccessible        ← tested accessible alternative
//       - classicPastel        ← standard players
//       - vividRainbow         ← kids / fun
//       - darkNeon             ← night mode
//       - earthy               ← calm/nature
//       - ocean                ← relaxing
//       - sunset               ← warm aesthetic
//
// ─────────────────────────────────────────────────────────────────

export { SUDOKU_THEMES };
export default SUDOKU_THEMES;
