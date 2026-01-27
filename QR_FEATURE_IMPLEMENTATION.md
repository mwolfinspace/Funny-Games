# QR Code Feature Implementation

## Overview
Added QR code functionality to Nonogram.html that allows players to:
1. Generate a QR code linking to their current game state
2. Share games via QR code or direct link
3. Access games via URL hash and automatically restore the saved state

## Changes Made

### 1. QR Code Library (Line 7)
Added CDN link to QRCode.js library:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
```

### 2. QR Button UI (Lines 930-936)
Added QR button next to the seed display box at the bottom left of the gameboard:
```html
<div style="display: flex; gap: 8px; align-items: center;">
    <div id="seed-display-box" onclick="app.showSeedModal()">Seed: Loading...</div>
    <button id="qr-btn" class="float-btn" onclick="app.generateQR()" title="Generate QR Code">
        <svg>...</svg>
    </button>
</div>
```

### 3. QR Modal HTML (Lines 945-953)
Added modal popup that displays:
- QR code image
- Shareable link (clickable to copy)
- Copy link button
- Download QR code button
- Close button

### 4. QR Modal Styles (Lines 373-450)
Added comprehensive CSS for the QR modal:
- Modal overlay and backdrop
- QR code container styling
- Link display styling
- Button styling with animations

### 5. JavaScript Functions

#### `generateQRLink()` (Lines 2033-2047)
- Generates the full shareable URL including:
  - Base URL: `https://mwolfinspace.github.io/Funny-Games/Nonogram.html`
  - Seed/Level ID via URL hash
  - Current game state (player progress) encoded as state string
- Format: `URL#seed:state` or `URL#campaignLevel`

#### `generateQR()` (Lines 2049-2068)
- Creates QR code image using QRCode.js library
- Displays the QR modal with the generated code
- Shows the shareable link

#### `closeQRModal(event)` (Lines 2070-2074)
- Closes the QR modal when clicking outside or on close button

#### `copyQRLink()` (Lines 2076-2088)
- Copies the shareable link to clipboard
- Shows confirmation with "✓ Copied!" message for 2 seconds

#### `downloadQR()` (Lines 2090-2115)
- Downloads the QR code as PNG image
- Handles both canvas and SVG QR code formats
- File named with timestamp: `nonogram-[timestamp].png`

### 6. URL Hash Handling (Lines 2176-2192)
Added automatic game restoration from URL:

#### `hashchange` event listener
- Triggers when URL hash changes
- Automatically loads game with the seed/state from hash

#### `load` event listener
- On page load, checks for hash parameter
- If present, automatically loads the saved game state
- Uses `app.handleLoad()` with `preserveZoom: true` to maintain zoom level

## How It Works

### Generating a Shareable Link
1. Player clicks the QR button next to the seed display
2. `generateQR()` creates a link containing:
   - The puzzle seed (or campaign level)
   - Current game state (filled cells, crossed cells)
3. QR modal displays with options to:
   - Copy the link to clipboard
   - Download the QR code image

### Sharing & Restoring
1. Player shares QR code or link with others
2. When someone visits the link:
   - URL hash is parsed (e.g., `#seed:state`)
   - `app.handleLoad()` is called with the hash value
   - Game loads with exact same puzzle and player progress
   - Zoom level is preserved

### URL Format Examples
- **Seed only (puzzle without progress)**: `Nonogram.html#10xrandom123`
- **Seed with progress**: `Nonogram.html#10xrandom123:ABC123...`
- **Campaign level**: `Nonogram.html##5`
- **Full deployed URL**: `https://mwolfinspace.github.io/Funny-Games/Nonogram.html#10xrandom123:ABC123...`

## Local Testing
1. Open Nonogram.html locally
2. Start a game
3. Click the QR button
4. Copy the link and modify it to use `Nonogram.html` instead of the full URL for local testing
5. Paste link into browser to verify game restores correctly

## Features
✅ Generate QR codes for current game state  
✅ Copy shareable links to clipboard  
✅ Download QR code as PNG image  
✅ Automatic game restoration from URL hash  
✅ Works with both puzzle seeds and campaign levels  
✅ Preserves player progress when sharing  
✅ Mobile-friendly responsive design  
✅ Dark/Light theme support  

## Browser Compatibility
- Modern browsers with:
  - ES6 JavaScript support
  - Clipboard API support
  - Canvas API support (for QR code generation and download)
  - URL hash support
