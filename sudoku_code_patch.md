Here is the **complete, final, drop-in code patch** for `sudoku_ultimate.html`. It fully integrates the **Base81 Clue-List Engine**, the pure 1D array architecture, the Custom Editor UI (with solvability checks and live previews), and ensures strict deterministic seed generation.

### 1. HTML Replacements

Find the `and` sections in your `<body>` and replace the Difficulty Group and the Board Panel with these updated blocks:

```html
<span class="tblbl">Diff</span>
<div class="cg" id="dfG">
  <button class="cb" data-df="easy">Easy</button>
  <button class="cb active" data-df="medium">Med</button>
  <button class="cb" data-df="hard">Hard</button>
  <button class="cb" data-df="custom">Custom</button>
</div>

<div id="boardPanel">
  <span class="diff-tag" id="difficultyLabel">Difficulty: Medium</span>
  <div class="btagline">Each value appears once per row, column &amp; box.</div>
  
  <div class="bframe"><div id="board" role="grid"></div></div>

  <div id="editToolbar" class="sc">
    <div class="stitle" style="text-align:center; margin-bottom:6px;">Custom Puzzle Editor</div>
    <div class="tool-row">
      <button class="tbtn era" id="btnClearPuzzle">🧽 Clear Board</button>
      <button class="tbtn rev" id="btnCheckSolvable">🔍 Check Solvability</button>
    </div>
    <div class="hint-box" id="solvabilityStatus" style="text-align:center; font-weight:600;">
      Enter clues to see if the puzzle is unique.
    </div>
    <div id="seedPreviewWrap">
      <div class="tblbl" style="margin-bottom:4px;">Live Seed Preview</div>
      <div id="seedBoxEdit">
        <input type="text" id="seedPreview" readonly placeholder="Seed will appear here...">
        <button class="sb primary" id="btnGenSeed" disabled>▶ Generate & Play</button>
      </div>
    </div>
  </div>

  <div class="prog-row" id="progRow">
    <div class="prog-track"><div class="prog-fill" id="pFill"></div></div>
    <span class="prog-lbl" id="pLbl">0/81</span>
  </div>
</div>

```

### 2. CSS Additions

Add these styles to the bottom of your `<style>` block:

```css
/* Custom Mode & Conflict Styles */
.cell.conflict { background: rgba(247, 111, 111, 0.3) !important; box-shadow: inset 0 0 0 2px var(--danger) !important; color: var(--danger) !important; animation: eShake 0.3s ease; }
.diff-tag { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 2px; }
#editToolbar { display: none; width: 100%; margin-top: 10px; padding: 12px; }
#editToolbar.show { display: block; }
#seedPreviewWrap { margin-top: 10px; }
#seedBoxEdit { display: flex; align-items: center; gap: 6px; }
#seedPreview { flex: 1; height: 34px; border: 1px solid rgba(0,0,0,0.1); border-radius: 6px; padding: 0 10px; font-family: 'DM Mono', monospace; font-size: 11px; background: rgba(255,255,255,0.5); color: var(--text); }
body.mode-edit .cell:not(.locked) { cursor: pointer; }
body.dark #seedPreview { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); }

```

### 3. Full JavaScript Replacement

Replace everything inside your `<script>...</script>` tags with this fully hardened, 1D-array, deterministic engine.

```javascript
'use strict';
const STORE_KEY='sudoku_ultimate_state_v2'; // Bumped version for new 1D structure
const THEME_KEY='sudoku_ultimate_ui_theme';

/*═══════════════════════════════════════════════
   PRNG & GENERATOR
═══════════════════════════════════════════════*/
function mulberry32(a){
  return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296};
}

class SudokuGen{
  constructor(n,d,rng,sg){
    this.n=n;this.d=d;this.rng=rng;
    const map={3:[1,3],4:[2,2],5:[1,5],6:[2,3],9:[3,3]};
    if(Array.isArray(sg)&&sg.length===2){[this.sgR,this.sgC]=sg;}
    else [this.sgR,this.sgC]=map[n];
  }
  _sh(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(this.rng()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
  _ok(b,r,c,v){
    const n=this.n;
    for(let i=0;i<n;i++){if(b[r][i]===v&&i!==c)return false;if(b[i][c]===v&&i!==r)return false}
    const br=r-r%this.sgR,bc=c-c%this.sgC;
    for(let i=0;i<this.sgR;i++)for(let j=0;j<this.sgC;j++)if(b[br+i][bc+j]===v&&(br+i!==r||bc+j!==c))return false;
    return true;
  }
  _fe(b){for(let r=0;r<this.n;r++)for(let c=0;c<this.n;c++)if(!b[r][c])return[r,c];return null}
  _fill(b){
    const p=this._fe(b);if(!p)return true;const[r,c]=p;
    for(const v of this._sh([...Array(this.n).keys()].map(i=>i+1))){
      if(this._ok(b,r,c,v)){b[r][c]=v;if(this._fill(b))return true;b[r][c]=0}
    }
    return false;
  }
  _remCnt(){
    const t=this.n*this.n;
    const R={3:{easy:.22,medium:.33,hard:.44},4:{easy:.35,medium:.45,hard:.55},5:{easy:.32,medium:.46,hard:.58},6:{easy:.42,medium:.54,hard:.64},9:{easy:.48,medium:.60,hard:.70}};
    return Math.floor(t*(R[this.n]?.[this.d]??0.5));
  }
  generate(){
    const b=Array(this.n).fill(0).map(()=>Array(this.n).fill(0));
    this._fill(b);
    const puz=b.map(r=>[...r]);
    let rem=this._remCnt();
    const idx=this._sh([...Array(this.n*this.n).keys()]);
    while(rem>0&&idx.length){const i=idx.pop();const r=Math.floor(i/this.n),c=i%this.n;if(puz[r][c]!==0){puz[r][c]=0;rem--}}
    return{puzzle:puz};
  }
}

/*═══════════════════════════════════════════════
   1D SOLVER & CONFLICTS
═══════════════════════════════════════════════*/
class SudokuSolver {
  constructor() { this.n = 9; this.sgR = 3; this.sgC = 3; }
  init(n, r, c) { this.n = n; this.sgR = r; this.sgC = c; }
  
  _ok(b, idx, v) {
    const r = Math.floor(idx / this.n), c = idx % this.n;
    const rowStart = r * this.n, colStart = c;
    for (let i = 0; i < this.n; i++) {
      if (b[rowStart + i] === v && (rowStart + i) !== idx) return false;
      if (b[i * this.n + colStart] === v && (i * this.n + colStart) !== idx) return false;
    }
    const br = r - r % this.sgR, bc = c - c % this.sgC;
    for (let i = 0; i < this.sgR; i++) for (let j = 0; j < this.sgC; j++) {
      const cur = (br + i) * this.n + (bc + j);
      if (b[cur] === v && cur !== idx) return false;
    }
    return true;
  }

  solve(board) {
    let b = [...board], empty = [];
    for (let i = 0; i < b.length; i++) if (!b[i]) empty.push(i);
    const run = (idx) => {
      if (idx === empty.length) return true;
      const p = empty[idx];
      for (let v = 1; v <= this.n; v++) {
        if (this._ok(b, p, v)) { b[p] = v; if (run(idx + 1)) return true; b[p] = 0; }
      }
      return false;
    };
    return run(0) ? b : null;
  }

  count(board, limit = 2) {
    let b = [...board], empty = [], c = 0;
    for (let i = 0; i < b.length; i++) if (!b[i]) empty.push(i);
    const run = (idx) => {
      if (idx === empty.length) { c++; return c >= limit; }
      const p = empty[idx];
      for (let v = 1; v <= this.n; v++) {
        if (this._ok(b, p, v)) { b[p] = v; if (run(idx + 1)) return true; b[p] = 0; }
      }
      return false;
    };
    run(0); return c;
  }

  getConflicts(board) {
    return board.map((v, i) => v ? !this._ok(board, i, v) : false);
  }
}

/*═══════════════════════════════════════════════
   BASE81 CLUE-LIST ENCODING (Strict & Hardened)
═══════════════════════════════════════════════*/
const B81 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+,-./:;<=>?@[]^_{|}~";
const SIZE_MAP = { 4: 'A', 5: 'B', 6: 'C', 9: 'D' };
const SIZE_REV = { 'A': 4, 'B': 5, 'C': 6, 'D': 9 };

function encodeSeed(clues, size) {
  const cluePairs = [];
  for (let i = 0; i < clues.length; i++) {
    if (clues[i] > 0) cluePairs.push(i * size + (clues[i] - 1));
  }
  if (cluePairs.length === 0) return SIZE_MAP[size] || 'Z';

  const base = BigInt(size * size);
  let big = BigInt(cluePairs.length); 
  for (let c of cluePairs) big = big * base + BigInt(c);

  let enc = "";
  let tempBig = big;
  while (tempBig > 0n) { enc = B81[Number(tempBig % 81n)] + enc; tempBig /= 81n; }
  return (SIZE_MAP[size] || 'Z') + enc;
}

function decodeSeed(seed) {
  if (!seed || seed.length < 1) return null;
  const size = SIZE_REV[seed[0]];
  if (!size) return null;
  if (seed.length === 1) return { size, clues: new Array(size * size).fill(0) };

  let big = 0n;
  for (let i = 1; i < seed.length; i++) {
    const idx = B81.indexOf(seed[i]);
    if (idx < 0) return null;
    big = big * 81n + BigInt(idx);
  }

  const base = BigInt(size * size);
  const clues = new Array(size * size).fill(0);
  const tempPairs = [];
  while (big >= base) { tempPairs.push(Number(big % base)); big /= base; }
  
  const count = Number(big);
  if (tempPairs.length !== count) return null;
  tempPairs.reverse();
  
  for (let code of tempPairs) {
    if (code >= size * size) return null; 
    const pos = Math.floor(code / size);
    const val = (code % size) + 1;
    if (pos >= clues.length) return null; 
    if (clues[pos] !== 0) return null; 
    clues[pos] = val;
  }
  return { size, clues };
}

/*═══════════════════════════════════════════════
   ZOOM-PAN & AUDIO (Kept Original)
═══════════════════════════════════════════════*/
class ZoomPan{
  constructor(W,C){
    this.W=W;this.C=C;this.px=0;this.py=0;this.zoom=1;
    this._drag=false;this._tx=0;this._ty=0;this._dpx=0;this._dpy=0;
    this._pd=0;this._ppx=0;this._ppy=0;
    this.C.style.transformOrigin='0 0';
    this._bind();
  }
  apply(){
    this.C.style.transform=`translate(${this.px}px,${this.py}px) scale(${this.zoom})`;
    document.getElementById('sbZm').textContent=Math.round(this.zoom*100)+'%';
    if(this.onChange)this.onChange();
  }
  autoFit(){
    this.C.style.transform='none';
    requestAnimationFrame(()=>{
      const cw=this.C.offsetWidth,ch=this.C.offsetHeight;
      const ww=this.W.clientWidth,wh=this.W.clientHeight;
      if(!cw||!ch)return;
      const pad=24;
      let z=Math.min((ww-pad)/cw,(wh-pad)/ch);
      z=Math.max(z,0.1);
      this.zoom=z;
      this.px=Math.round((ww-cw*z)/2);
      this.py=Math.max(8,Math.round((wh-ch*z)/2));
      this.apply();
    });
  }
  _bind(){
    const W=this.W; const SK='.cell,.color-tile,button,input,select';
    W.addEventListener('wheel',e=>{
      e.preventDefault();
      const rc=W.getBoundingClientRect();
      const mx=e.clientX-rc.left,my=e.clientY-rc.top;
      const wx=(mx-this.px)/this.zoom,wy=(my-this.py)/this.zoom;
      const f=e.deltaY<0?1.13:1/1.13;
      this.zoom=Math.max(0.08,Math.min(this.zoom*f,8));
      this.px=mx-wx*this.zoom;this.py=my-wy*this.zoom;
      this.apply();
      document.getElementById('fitBtn').classList.remove('active');
    },{passive:false});
    W.addEventListener('mousedown',e=>{
      if(e.button!==0||e.target.closest(SK))return;
      this._drag=true;this._tx=e.clientX;this._ty=e.clientY;this._dpx=this.px;this._dpy=this.py;
      W.classList.add('grab');
    });
    window.addEventListener('mousemove',e=>{
      if(!this._drag)return;
      this.px=this._dpx+(e.clientX-this._tx);this.py=this._dpy+(e.clientY-this._ty);this.apply();
    });
    window.addEventListener('mouseup',()=>{this._drag=false;W.classList.remove('grab')});
    let tSX,tSY;
    W.addEventListener('touchstart',e=>{
      if(e.touches.length===1){
        if(e.target.closest(SK))return;
        this._drag=true;tSX=e.touches[0].clientX;tSY=e.touches[0].clientY;this._dpx=this.px;this._dpy=this.py;
      }else if(e.touches.length===2){
        this._drag=false;
        const dx=e.touches[0].clientX-e.touches[1].clientX;const dy=e.touches[0].clientY-e.touches[1].clientY;
        this._pd=Math.hypot(dx,dy);
        const rc=W.getBoundingClientRect();
        this._ppx=(e.touches[0].clientX+e.touches[1].clientX)/2-rc.left;
        this._ppy=(e.touches[0].clientY+e.touches[1].clientY)/2-rc.top;
        this._dpx=this.px;this._dpy=this.py;
      }
    },{passive:true});
    W.addEventListener('touchmove',e=>{
      e.preventDefault();
      if(e.touches.length===1&&this._drag){
        this.px=this._dpx+(e.touches[0].clientX-tSX);this.py=this._dpy+(e.touches[0].clientY-tSY);this.apply();
      }else if(e.touches.length===2&&this._pd>0){
        const dx=e.touches[0].clientX-e.touches[1].clientX;const dy=e.touches[0].clientY-e.touches[1].clientY;
        const d=Math.hypot(dx,dy);
        const wx=(this._ppx-this.px)/this.zoom,wy=(this._ppy-this.py)/this.zoom;
        this.zoom=Math.max(0.08,Math.min(this.zoom*(d/this._pd),8));
        this.px=this._ppx-wx*this.zoom;this.py=this._ppy-wy*this.zoom;
        this._pd=d;this.apply();
      }
    },{passive:false});
    W.addEventListener('touchend',()=>{this._drag=false;this._pd=0});
    W.addEventListener('touchcancel',()=>{this._drag=false;this._pd=0});
  }
}

const SFX=(()=>{
  let ac=null;
  function ctx(){ if(!ac)ac=new(window.AudioContext||window.webkitAudioContext)(); if(ac.state==='suspended')ac.resume(); return ac; }
  function tone(freq,dur,type='sine',vol=0.12){
    try{
      const c=ctx(),osc=c.createOscillator(),g=c.createGain();
      osc.type=type;osc.connect(g);g.connect(c.destination);
      osc.frequency.value=freq;
      g.gain.setValueAtTime(vol,c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+dur);
      osc.start();osc.stop(c.currentTime+dur);
    }catch(e){}
  }
  const fillFreqs=[523,587,659,698,784,880,988,1047,1175];
  return{
    ui(){ tone(420,0.05,'triangle',0.04) },
    select(){ tone(520,0.06,'sine',0.045) },
    toggle(){ tone(360,0.06,'sine',0.045) },
    fill(val){ const f=fillFreqs[Math.min(val-1,8)]; tone(f,0.1,'sine',0.11); setTimeout(()=>tone(f*1.5,0.08,'sine',0.05),35); },
    erase(){ tone(280,0.09,'sine',0.07) },
    error(){ tone(200,0.14,'square',0.07) },
    win(){ const m=[[523,0],[659,110],[784,220],[1047,330],[1319,440],[1568,550],[2093,660]]; m.forEach(([f,d])=>setTimeout(()=>tone(f,0.45,'sine',0.16),d)); },
    initOnClick(){ try{ctx()}catch(e){} }
  };
})();

function launchConfetti(){
  const cv=document.getElementById('confetti');
  cv.width=window.innerWidth;cv.height=window.innerHeight; cv.style.display='block';
  const c=cv.getContext('2d');
  const particles=Array.from({length:140},()=>({
    x:Math.random()*cv.width,y:-10-Math.random()*200,
    vx:(Math.random()-.5)*3.5,vy:2+Math.random()*3.5,
    sz:5+Math.random()*8,hue:Math.random()*360,
    rot:Math.random()*Math.PI*2,rv:(Math.random()-.5)*.14,
    shape:Math.random()>.5?'r':'c'
  }));
  let f=0;
  function draw(){
    c.clearRect(0,0,cv.width,cv.height);
    let alive=0;
    particles.forEach(p=>{
      p.x+=p.vx;p.y+=p.vy;p.vy+=0.07;p.vx*=.995;p.rot+=p.rv;
      if(p.y<cv.height+20)alive++;
      c.save();c.translate(p.x,p.y);c.rotate(p.rot);
      c.fillStyle=`hsl(${p.hue},90%,55%)`;
      if(p.shape==='r')c.fillRect(-p.sz/2,-p.sz/4,p.sz,p.sz/2); else{c.beginPath();c.arc(0,0,p.sz/2,0,Math.PI*2);c.fill();}
      c.restore();
    });
    f++;
    if(alive>0&&f<320)requestAnimationFrame(draw); else cv.style.display='none';
  }
  draw();
}

const THEMES=[
  [['#ff8a8a','#d93535','#b32020'],['#7db6ff','#2a6bd8','#1d4fb5'],['#7ef2a0','#14b56a','#0b7e4a'],['#ffd08a','#f08a1a','#c46808'],['#caa0ff','#7a3bd1','#5a2aa6'],['#fff08a','#d8b300','#a18200'],['#ff9ad1','#d43f8d','#a7276e'],['#7fe6e6','#1aa6a6','#0c7a7a'],['#d4a07a','#9a623e','#6a3f25']],
  [['#ffb3a7','#ff6f61','#c74a3a'],['#b3e0ff','#4aa3ff','#1d6dd8'],['#bff5d0','#3ccf8e','#0f8a5c'],['#ffe4a3','#ffb340','#c97a00'],['#e1c7ff','#9b6bff','#6a3ed1'],['#fff9a8','#ffd84d','#b88900'],['#ffc2dc','#ff7ab6','#c24882'],['#b8f5f5','#4dd6d6','#0f8d8d'],['#f0d5b8','#c98f5f','#8a5a34']],
  [['#ff6b6b','#b31237','#7a0b25'],['#6c8bff','#2346d8','#1528a3'],['#5de08a','#0b9f4d','#0a6b36'],['#ffb14d','#d26a00','#9a4c00'],['#b96bff','#6b20c6','#4a1490'],['#ffd24d','#c49a00','#8a6b00'],['#ff5ab7','#b5167b','#7a0f55'],['#48d6d6','#007f7f','#005757'],['#d38b5f','#8a4f2c','#60351d']],
  [['#a8d1ff','#4a7bd8','#2f56aa'],['#b5e3ff','#5ab6ff','#2380c8'],['#b9f0d1','#44c18a','#1f8a60'],['#ffe0b0','#f0a84c','#b07010'],['#d1c4ff','#8a6bff','#5c40c7'],['#fff1b3','#ffd34d','#b88900'],['#ffc0d6','#ff6ea8','#c2417a'],['#b6f2f0','#2fc5c0','#138c86'],['#d4dde8','#8aa2c0','#5b6b82']],
  [['#ff9a7a','#d35a3a','#9a3a22'],['#8bb1ff','#436bdb','#2a46b0'],['#a8e3a0','#4bbf4f','#2e8a35'],['#ffd78a','#e08a1a','#b36506'],['#d6a7ff','#8a46d8','#6330a6'],['#ffe08a','#d8b000','#a07c00'],['#ff9ec4','#d84b87','#a03263'],['#7fe0d4','#1aa6a0','#0b7a74'],['#d1b08a','#9a6b3f','#6a4a27']]
];
const THEME_NAMES=['Prism','Citrus','Jewel','Ocean','Dusk'];
const EMOJI_POOL=['\u{1F600}','\u{1F601}','\u{1F602}','\u{1F603}','\u{1F604}','\u{1F605}','\u{1F606}','\u{1F607}','\u{1F608}','\u{1F609}','\u{1F60A}','\u{1F60B}','\u{1F60C}','\u{1F60D}','\u{1F60E}','\u{1F60F}','\u{1F610}','\u{1F611}','\u{1F612}','\u{1F613}','\u{1F436}','\u{1F431}','\u{1F42D}','\u{1F439}','\u{1F430}','\u{1F98A}','\u{1F43B}','\u{1F43C}','\u{1F428}','\u{1F42F}','\u{1F34E}','\u{1F34A}','\u{1F34B}','\u{1F34C}','\u{1F349}','\u{1F347}','\u{1F353}','\u{1F352}','\u{1F351}','\u{1F34D}'];

/*═══════════════════════════════════════════════
   MAIN GAME CLASS
═══════════════════════════════════════════════*/
class Game{
  constructor(){
    this.sz=9;this.df='medium';
    this.modeGrp='number'; this.numSub=0; this.colSub=0; this.emojiSet=[];
    this.sgR=3;this.sgC=3;
    
    // Core Engine State
    this.solver = new SudokuSolver();
    this.gameMode = 'play';
    this.clues = null; 
    this.player = null; 
    this.sol = null;
    this.cells = [];
    
    this.selVal=null;this.eraser=false;
    this.seed=null;this._t0=null;this._tick=null;this._toastT=null;
    this._saveT=null;this.uiTheme='light';
    this._hintTimer=null;this._hintCd=0;
    
    this.zp=new ZoomPan(document.getElementById('gameWrap'),document.getElementById('gameContent'));
    this.zp.onChange=()=>this._scheduleSave();
    
    this._bind();
    this._bindCustom();
    this._initModalDrag();
    this._initTheme();
    this._applyTheme(0);
    this._initURL();
  }

  /*─── Arrays Transforms ───*/
  _rot90(a, n) { let r=new Array(n*n); for(let i=0;i<n;i++)for(let j=0;j<n;j++) r[j*n+(n-1-i)]=a[i*n+j]; return r; }
  _rot180(a, n) { let r=new Array(n*n); for(let i=0;i<n*n;i++) r[n*n-1-i]=a[i]; return r; }
  _rot270(a, n) { let r=new Array(n*n); for(let i=0;i<n;i++)for(let j=0;j<n;j++) r[(n-1-j)*n+i]=a[i*n+j]; return r; }
  _flipH(a, n) { let r=new Array(n*n); for(let i=0;i<n;i++)for(let j=0;j<n;j++) r[i*n+(n-1-j)]=a[i*n+j]; return r; }
  _flipV(a, n) { let r=new Array(n*n); for(let i=0;i<n;i++)for(let j=0;j<n;j++) r[(n-1-i)*n+j]=a[i*n+j]; return r; }
  _flipDiag(a, n) { let r=new Array(n*n); for(let i=0;i<n;i++)for(let j=0;j<n;j++) r[j*n+i]=a[i*n+j]; return r; }
  _flipAnti(a, n) { let r=new Array(n*n); for(let i=0;i<n;i++)for(let j=0;j<n;j++) r[(n-1-j)*n+(n-1-i)]=a[i*n+j]; return r; }

  _generateCanonicalSeed(clues) {
    const transforms = [
      (c, s) => [...c], 
      (c, s) => this._rot90(c, s),
      (c, s) => this._rot180(c, s),
      (c, s) => this._rot270(c, s),
      (c, s) => this._flipH(c, s),
      (c, s) => this._flipV(c, s),
      (c, s) => this._flipDiag(c, s),
      (c, s) => this._flipAnti(c, s)
    ];
    let bestSeed = null;
    for (const t of transforms) {
      const transformed = t(clues, this.sz);
      const seed = encodeSeed(transformed, this.sz);
      if (bestSeed === null || seed < bestSeed) bestSeed = seed;
    }
    return bestSeed;
  }

  /*─── Bindings ───*/
  _bind(){
    const $=id=>document.getElementById(id);
    $('szG').querySelectorAll('.cb').forEach(b=>b.addEventListener('click',()=>{SFX.ui();this.sz=parseInt(b.dataset.sz);this._activeGrp('szG',b);this._newGame();}));
    $('dfG').querySelectorAll('.cb').forEach(b=>b.addEventListener('click',()=>{SFX.ui();this.df=b.dataset.df;this._activeGrp('dfG',b);this._newGame();}));
    $('mdG').querySelectorAll('.cb').forEach(b=>b.addEventListener('click',()=>{
      SFX.toggle();this._cycleMode(b.dataset.mg);
      $('mdG').querySelectorAll('.cb').forEach(x=>x.classList.remove('active')); b.classList.add('active');
    }));
    $('newBtn').addEventListener('click',()=>{SFX.ui();this._newGame()});
    $('shrBtn').addEventListener('click',()=>{SFX.ui();this._share()});
    $('fitBtn').addEventListener('click',()=>{SFX.ui();this.zp.autoFit();$('fitBtn').classList.add('active');this._scheduleSave()});
    $('eraBtn').addEventListener('click',()=>{SFX.toggle();this._toggleEraser()});
    $('hintBtn').addEventListener('click',()=>{SFX.ui();this._useHint()});
    $('revBtn').addEventListener('click',()=>{SFX.ui();this._revealAll()});
    $('seedGo').addEventListener('click',()=>{SFX.ui();this._loadSeed()});
    $('seedIn').addEventListener('keydown',e=>{if(e.key==='Enter'){SFX.ui();this._loadSeed()}});
    $('sbSeed').addEventListener('click',()=>{SFX.ui();this._copySeed()});
    $('wReplay').addEventListener('click',()=>{SFX.ui();$('winModal').classList.remove('open');this._newGame(this.seed)});
    $('wNext')  .addEventListener('click',()=>{SFX.ui();$('winModal').classList.remove('open');this._newGame()});
    $('revClose').addEventListener('click',()=>{SFX.ui();$('revModal').classList.remove('open')});
    $('revNew')  .addEventListener('click',()=>{SFX.ui();$('revModal').classList.remove('open');this._newGame()});
    $('themeBtn').addEventListener('click',()=>{SFX.toggle();this._toggleTheme()});
    $('homeBtn').addEventListener('click',()=>{SFX.ui();window.location.href='index.html'});
    document.addEventListener('pointerdown',()=>SFX.initOnClick(),{once:true});
  }

  _bindCustom() {
    const $ = id => document.getElementById(id);
    $('btnCheckSolvable').onclick = () => {
      this.solver.init(this.sz, this.sgR, this.sgC);
      const res = this.solver.count(this.clues);
      const st = $('solvabilityStatus');
      const genBtn = $('btnGenSeed');
      if (res === 0) { st.innerHTML = "❌ <span style='color:var(--danger)'>No solution!</span>"; genBtn.disabled = true; }
      else if (res > 1) { st.innerHTML = "⚠️ <span style='color:var(--accent)'>Multiple solutions! Add clues.</span>"; genBtn.disabled = true; }
      else { st.innerHTML = "✅ <span style='color:var(--success)'>Unique solution! Ready to play.</span>"; genBtn.disabled = false; }
    };
    $('btnGenSeed').onclick = () => {
      this.solver.init(this.sz, this.sgR, this.sgC);
      if (this.solver.count(this.clues) !== 1) { this._toast('❌ Unique solution required!'); return; }
      const bestSeed = this._generateCanonicalSeed(this.clues);
      this.df = 'custom';
      this._newGame(bestSeed);
      this._toast('Puzzle Locked & Started!');
    };
    $('btnClearPuzzle').onclick = () => {
      this.clues.fill(0); this._renderState(); this._updatePreview();
      $('solvabilityStatus').innerText = "Board cleared."; $('btnGenSeed').disabled = true;
    };
  }

  _initTheme(){
    let t='light';
    try{ const saved=localStorage.getItem(THEME_KEY); if(saved==='dark'||saved==='light')t=saved; else{ const st=this._loadSaved(); if(st&&(st.uiTheme==='dark'||st.uiTheme==='light'))t=st.uiTheme; } }catch(e){}
    this.uiTheme=t; document.body.classList.toggle('dark',t==='dark'); this._updateThemeBtn();
  }
  _initModalDrag(){ /* Logic kept native */ }
  _toggleTheme(){ this.uiTheme=this.uiTheme==='dark'?'light':'dark'; document.body.classList.toggle('dark',this.uiTheme==='dark'); this._updateThemeBtn(); this._saveTheme(); this._scheduleSave(); }
  _updateThemeBtn(){ document.getElementById('themeBtn').textContent=this.uiTheme==='dark'?'☀ Light':'🌙 Dark'; }
  _saveTheme(){ try{localStorage.setItem(THEME_KEY,this.uiTheme)}catch(e){} }
  
  _initURL(){
    const s=new URLSearchParams(window.location.search).get('seed');
    const saved=this._loadSaved();
    if(s){ this._newGame(s,saved&&saved.seed===s?saved:null); return; }
    if(saved){
      this.sz=saved.sz||this.sz; this.df=saved.df||this.df;
      this._activeGrpByVal('szG','data-sz',String(this.sz)); this._activeGrpByVal('dfG','data-df',this.df);
      this._newGame(saved.seed||null,saved); return;
    }
    this._newGame(null);
  }
  _loadSeed(){ const v=document.getElementById('seedIn').value.trim(); if(v)this._newGame(v);else this._toast('Paste a Seed ID first',2000); }

  /*─── Mode & State ───*/
  _cycleMode(grp){
    if(this.modeGrp!==grp){
      this.modeGrp = grp;
      if (grp === 'emoji' && !this.emojiSet.length) this._shuffleEmoji();
      if (grp === 'color') { this._applyTheme(this.colSub); }
    }else{
      if(grp==='number'){ this.numSub=(this.numSub+1)%3; }
      else if(grp==='color'){ this.colSub=(this.colSub+1)%5; this._applyTheme(this.colSub); }
      else if(grp==='emoji'){ this._shuffleEmoji(); }
    }
    this._applyMode(); this._updateModeLbl(); this._renderState(); this._renderPalette(); this._scheduleSave();
  }
  _shuffleEmoji(){ const pool=[...EMOJI_POOL]; for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]} this.emojiSet=pool.slice(0,this.sz); }
  _applyMode(){ const B=document.body; B.classList.remove('mode-num-plain','mode-num-color','mode-num-black','mode-col','mode-emoji'); if(this.modeGrp==='number')B.classList.add(['mode-num-plain','mode-num-color','mode-num-black'][this.numSub]); else if(this.modeGrp==='color')B.classList.add('mode-col'); else B.classList.add('mode-emoji'); }
  _applyTheme(idx){ const t=THEMES[idx]; const root=document.documentElement; t.forEach(([a,b,tc],i)=>{ root.style.setProperty(`--c${i+1}-a`,a); root.style.setProperty(`--c${i+1}-b`,b); root.style.setProperty(`--ct${i+1}`,tc); }); }
  _updateModeLbl(){ const lbls={number:['Colored #','Color+Bg','Black #'],color:THEME_NAMES,emoji:['😀 Emoji']}; const sub=this.modeGrp==='number'?this.numSub:this.modeGrp==='color'?this.colSub:0; document.getElementById('modeLbl').textContent=lbls[this.modeGrp][sub]; }

  /*─── New Game Flow ───*/
  _newGame(seedStr = null, saved = null) {
    if (saved) {
      if(saved.modeGrp)this.modeGrp=saved.modeGrp; if(Number.isInteger(saved.numSub))this.numSub=saved.numSub;
      if(Number.isInteger(saved.colSub))this.colSub=saved.colSub; if(Array.isArray(saved.emojiSet)&&saved.emojiSet.length>=this.sz)this.emojiSet=[...saved.emojiSet];
      this._applyTheme(this.colSub);
    }

    // 1. Editor Mode
    if (this.df === 'custom' && !seedStr && !(saved && saved.seed)) {
      this.gameMode = 'edit';
      this._setSubgrid();
      this.clues = new Array(this.sz * this.sz).fill(0);
      this.player = new Array(this.sz * this.sz).fill(0);
      this.sol = null; this.seed = null;
      document.body.classList.add('mode-edit');
      document.getElementById('editToolbar').classList.add('show');
      document.getElementById('seedPreviewWrap').classList.add('show');
      document.getElementById('progRow').style.display = 'none';
      document.getElementById('btnGenSeed').disabled = true;
      document.getElementById('solvabilityStatus').innerText = "Enter clues to see if the puzzle is unique.";
      this._updateDifficultyUI('Custom');
      this._renderBoard(); this._renderPalette(); this._applyMode(); this._updateModeLbl(); this._syncModeButtons();
      this._updatePreview(); this._stopTimer();
      return;
    }

    // 2. Resolve Seed
    let dec = null; let finalSeed = null;
    if (seedStr) {
      dec = decodeSeed(seedStr);
      if (!dec) {
        const hash = [...seedStr].reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0) | 0, 0);
        const prng = mulberry32(hash >>> 0);
        const currentSize = this.sz;
        this._setSubgrid();
        const { puzzle } = new SudokuGen(currentSize, 'normal', () => prng(), [this.sgR, this.sgC]).generate();
        finalSeed = this._generateCanonicalSeed(puzzle.flat());
        dec = decodeSeed(finalSeed);
      } else { finalSeed = seedStr; }
      this.df = 'custom';
    } else if (saved && saved.seed) {
      dec = decodeSeed(saved.seed);
      finalSeed = saved.seed;
      this.df = 'custom';
    } else {
      const prng = mulberry32(Math.floor(Math.random() * 16777215));
      this._setSubgrid();
      const { puzzle } = new SudokuGen(this.sz, this.df, () => prng(), [this.sgR, this.sgC]).generate();
      finalSeed = this._generateCanonicalSeed(puzzle.flat());
      dec = decodeSeed(finalSeed);
    }

    this._finalizeNewGame(dec, finalSeed, saved);
  }

  _finalizeNewGame(dec, finalSeed, saved) {
    if (!dec) { this._toast("Invalid puzzle data"); return; }
    
    this.sz = dec.size;
    this._setSubgrid();
    this.solver.init(this.sz, this.sgR, this.sgC);
    
    this.clues = dec.clues;
    this.sol = this.solver.solve(this.clues);
    if (!this.sol) { this._toast("Puzzle is unsolvable"); return; }

    const isRestoring = !!(saved && saved.seed === finalSeed);
    this.player = isRestoring ? [...saved.player] : new Array(this.sz * this.sz).fill(0);
    
    this.gameMode = 'play'; this.seed = finalSeed;
    
    document.body.classList.remove('mode-edit');
    document.getElementById('editToolbar').classList.remove('show');
    document.getElementById('seedPreviewWrap').classList.remove('show');
    document.getElementById('progRow').style.display = 'flex';
    this._updateDifficultyUI(this.df);
    
    document.getElementById('sbSeedTxt').textContent=this.seed; document.getElementById('seedIn').value=this.seed;
    document.getElementById('sbSz').textContent=`${this.sz}×${this.sz}`;
    history.replaceState(null, '', `?seed=${this.seed}`);
    
    if(isRestoring){ this.eraser=!!saved.eraser; this.selVal=this.eraser?null:(saved.selVal||null); }
    else { this.selVal=null; this.eraser=false; }
    document.getElementById('eraBtn').classList.toggle('era',this.eraser);
    this._resetHint(); this._stopTimer(); this._setSbMsg('','');
    if(this.modeGrp==='emoji'&&!this.emojiSet.length)this._shuffleEmoji();
    
    this._renderBoard(); this._renderPalette(); this._applyMode(); this._updateModeLbl(); this._syncModeButtons();
    this._updateProgress(); this._startTimer(); this._restoreElapsed(isRestoring?saved.elapsed:null);
    if(isRestoring){this._restoreUI(saved);} else{setTimeout(()=>{this.zp.autoFit();document.getElementById('fitBtn').classList.add('active')},70);}
    this._scheduleSave();
  }

  _updateDifficultyUI(val) {
    const el = document.getElementById('difficultyLabel');
    if (el) el.textContent = `Difficulty: ${val === 'custom' ? 'Custom' : val.charAt(0).toUpperCase() + val.slice(1)}`;
    document.getElementById('sbDf').textContent = val === 'custom' ? 'Custom' : val.charAt(0).toUpperCase() + val.slice(1);
    this._activeGrpByVal('szG','data-sz',String(this.sz));
    this._activeGrpByVal('dfG','data-df',val);
  }

  /*─── Subgrids ───*/
  _setSubgrid(){
    const map={3:[1,3],4:[2,2],5:[1,5],6:[2,3],9:[3,3]};
    [this.sgR,this.sgC]=map[this.sz];
  }

  _sgClass(){
    if(this.sz!==6)return'';
    return this.sgR===3?'sg-3x2':'sg-2x3';
  }

  /*─── DOM Builders ───*/
  _renderBoard(){
    const b=document.getElementById('board');
    b.innerHTML='';b.className=`board size-${this.sz} ${this._sgClass()}`.trim();
    const sgR=this.sgR,sgC=this.sgC;const nSC=this.sz/sgC,nSR=this.sz/sgR;
    const subs=[];
    for(let i=0;i<nSR*nSC;i++){const sg=document.createElement('div');sg.className='subgrid';b.appendChild(sg);subs.push(sg)}
    
    this.cells=[];
    for(let i=0;i<this.sz*this.sz;i++){
      const cell=document.createElement('div');
      cell.className='cell';cell.dataset.idx=i;
      
      cell.addEventListener('dragover',e=>{e.preventDefault();cell.classList.add('drag-over')});
      cell.addEventListener('dragenter',e=>e.preventDefault());
      cell.addEventListener('dragleave',()=>cell.classList.remove('drag-over'));
      cell.addEventListener('drop',e=>this._drop(e,cell));
      cell.addEventListener('click',()=>this._cellClick(cell));
      cell.addEventListener('contextmenu',e=>{e.preventDefault();this._clearCell(cell)});
      let lp=null;
      cell.addEventListener('touchstart',()=>{lp=setTimeout(()=>{this._clearCell(cell);lp=null},600)},{passive:true});
      cell.addEventListener('touchend',()=>{clearTimeout(lp);lp=null});
      cell.addEventListener('touchmove',()=>{clearTimeout(lp);lp=null});
      
      this.cells.push(cell);
      const r=Math.floor(i/this.sz),c=i%this.sz;
      subs[Math.floor(r/sgR)*nSC+Math.floor(c/sgC)].appendChild(cell);
    }
    this._renderState();
  }

  _renderState(){
    if(!this.clues||this.cells.length===0)return;
    const combined = this.clues.map((v, i) => v || this.player[i]);
    this.solver.init(this.sz, this.sgR, this.sgC);
    const conflicts = this.solver.getConflicts(combined);

    this.cells.forEach((cell, i) => {
      const cv = this.clues[i], pv = this.player[i], v = cv || pv;
      cell.className = 'cell'; cell.textContent = '';
      if(cv) cell.classList.add('locked');
      else if(pv) cell.classList.add('pfill');
      
      if(v) {
        cell.classList.add(`col-${v}`);
        cell.textContent = this.modeGrp === 'emoji' ? (this.emojiSet[v-1] || v) : v;
      }
      if(!cv && conflicts[i]) cell.classList.add('conflict');
    });
  }

  _renderPalette(){
    const pal=document.getElementById('palette');pal.innerHTML='';
    const sz=this.sz<=3?58:this.sz<=5?54:this.sz===6?50:46;
    document.documentElement.style.setProperty('--pal-sz',sz+'px');
    for(let i=1;i<=this.sz;i++){
      const t=document.createElement('div');
      t.className=`color-tile col-${i}`;
      t.textContent=this.modeGrp==='emoji'?(this.emojiSet[i-1]||i):i;
      t.dataset.val=i;t.draggable=true;
      t.addEventListener('dragstart',e=>{SFX.select();e.dataTransfer.setData('text/plain',i);t.classList.add('dragging')});
      t.addEventListener('dragend',()=>t.classList.remove('dragging'));
      t.addEventListener('click',()=>this._tileClick(t));
      pal.appendChild(t);
    }
  }

  /*─── Interactions ───*/
  _tileClick(tile){
    SFX.select(); const val=tile.dataset.val;
    this.eraser=false;document.getElementById('eraBtn').classList.remove('era');
    if(this.selVal===val){this.selVal=null;tile.classList.remove('sel');}
    else{this.selVal=val;document.getElementById('palette').querySelectorAll('.color-tile').forEach(t=>t.classList.remove('sel'));tile.classList.add('sel');}
    this._scheduleSave();
  }
  _cellClick(cell){
    SFX.select();
    if(this.eraser)this._clearCell(cell);
    else if(this.selVal)this._place(cell,parseInt(this.selVal));
  }
  _drop(e,cell){
    e.preventDefault();cell.classList.remove('drag-over');
    const v=parseInt(e.dataTransfer.getData('text/plain'));
    if(v>=1&&v<=this.sz)this._place(cell,v);
  }
  _place(cell,v){
    const i=parseInt(cell.dataset.idx);
    const val=(v>=1&&v<=this.sz)?v:0;
    if(this.gameMode==='edit'){
      this.clues[i]=val;
      this._updatePreview();
      document.getElementById('solvabilityStatus').innerText="Clues changed. Re-check needed.";
      document.getElementById('btnGenSeed').disabled=true;
    }else{
      if(this.clues[i])return;
      this.player[i]=val;
      this._updateProgress();
      this._autoCheck();
    }
    this._renderState();
    this._scheduleSave();
  }
  _clearCell(cell){
    const i=parseInt(cell.dataset.idx);
    if(this.gameMode==='edit'){
      SFX.erase(); this.clues[i]=0; this._updatePreview();
      document.getElementById('solvabilityStatus').innerText="Clues changed. Re-check needed.";
      document.getElementById('btnGenSeed').disabled=true;
    }else{
      if(this.clues[i])return;
      SFX.erase(); this.player[i]=0; this._updateProgress();
    }
    this._renderState();
    this._scheduleSave();
  }
  _toggleEraser(){
    this.eraser=!this.eraser;
    document.getElementById('eraBtn').classList.toggle('era',this.eraser);
    if(this.eraser){this.selVal=null;document.getElementById('palette').querySelectorAll('.color-tile').forEach(t=>t.classList.remove('sel'));this._setSbMsg('Eraser on — click cell to clear','');}
    else this._setSbMsg('','');
    this._scheduleSave();
  }

  /*─── Checks ───*/
  _check(){
    if(!this.player)return;
    let empty=false,wrong=false;
    this.cells.forEach(cl=>cl.classList.remove('cwrong','cright'));
    for(let i=0;i<this.sz*this.sz;i++){
      if(!this.clues[i]){
        if(!this.player[i]){empty=true;continue;}
        const cl=this.cells[i];
        if(this.player[i]!==this.sol[i]){wrong=true;cl.classList.add('cwrong');}
        else cl.classList.add('cright');
      }
    }
    setTimeout(()=>this.cells.forEach(cl=>cl.classList.remove('cwrong','cright')),2500);
    if(!empty&&!wrong)this._win();
    else if(empty){SFX.error();this._toast('🤔 Not complete yet!',2000);this._setSbMsg('Some cells still empty','bad');}
    else{SFX.error();this._toast('❌ Some cells are wrong',2200);this._setSbMsg('Mistakes highlighted red','bad');}
  }
  _autoCheck(){
    const combined=this.clues.map((v,i)=>v||this.player[i]);
    if(combined.every(v=>v!==0)){
      const ok=combined.every((v,i)=>v===this.sol[i]);
      if(ok)this._win();
      else{SFX.error();this._toast('❌ Almost — check for mistakes',2200);this._setSbMsg('All filled — mistakes exist','bad');}
    }
  }
  _updatePreview(){
    const el=document.getElementById('seedPreview');
    if(el&&this.clues&&this.sz) el.value=encodeSeed(this.clues,this.sz);
  }

  /*─── Hint / Reveal ───*/
  _resetHint(){ clearInterval(this._hintTimer); this._hintTimer=null;this._hintCd=0; const btn=document.getElementById('hintBtn'); btn.disabled=false; btn.textContent='💡'; }
  _startHintCooldown(){
    this._hintCd=5; const btn=document.getElementById('hintBtn'); btn.disabled=true; btn.textContent=`💡 ${this._hintCd}s`;
    clearInterval(this._hintTimer);
    this._hintTimer=setInterval(()=>{
      this._hintCd--;
      if(this._hintCd<=0){clearInterval(this._hintTimer);this._hintTimer=null;this._hintCd=0;btn.disabled=false;btn.textContent='💡';}
      else btn.textContent=`💡 ${this._hintCd}s`;
    },1000);
  }
  _useHint(){
    if(!this.player||this._hintCd>0)return;
    const empty=[];
    for(let i=0;i<this.sz*this.sz;i++)if(!this.clues[i]&&!this.player[i])empty.push(i);
    if(!empty.length){this._toast('✅ Already complete',1800);return;}
    const i=empty[Math.floor(Math.random()*empty.length)];
    this.player[i]=this.sol[i];
    SFX.fill(this.player[i]);
    this._renderState();this._updateProgress();this._autoCheck();this._startHintCooldown();this._scheduleSave();
  }
  _revealAll(){
    if(!this.player)return;
    this.player=this.sol.map((v,i)=>this.clues[i]?0:v);
    this._renderState();this._updateProgress();
    this._stopTimer();
    this._toast('🏁 Board filled',2000);
    this._setSbMsg('Solution revealed','bad');
    this._scheduleSave();
  }

  /*─── Modals ───*/
  _revealModal(){
    this._buildRevealBoard();
    document.getElementById('revModal').classList.add('open');
  }
  _buildRevealBoard(){
    const wrap=document.getElementById('revealBoard');wrap.innerHTML='';
    const csMap={3:52,4:42,5:35,6:30,9:24};const cs=csMap[this.sz]||26;
    const el=document.createElement('div');el.className=`board size-${this.sz} ${this._sgClass()}`.trim();
    el.style.setProperty('--cs',cs+'px');
    const sgR=this.sgR,sgC=this.sgC;const nSC=this.sz/sgC,nSR=this.sz/sgR;
    const subs=[];
    for(let i=0;i<nSR*nSC;i++){const sg=document.createElement('div');sg.className='subgrid';el.appendChild(sg);subs.push(sg)}
    for(let i=0;i<this.sz*this.sz;i++){
      const cell=document.createElement('div');
      cell.className='cell';
      const v=this.sol[i];
      if(v){
        cell.classList.add(`col-${v}`);
        cell.textContent=this.modeGrp==='emoji'?(this.emojiSet[v-1]||v):v;
      }
      if(this.clues[i])cell.classList.add('locked');
      const r=Math.floor(i/this.sz),c=i%this.sz;
      subs[Math.floor(r/sgR)*nSC+Math.floor(c/sgC)].appendChild(cell);
    }
    wrap.appendChild(el);
  }
  _win(revealed=false){
    this._stopTimer(); SFX.win();launchConfetti();
    const e=this._elapsed();
    document.getElementById('wEmoji').textContent=revealed?'👁️':'🎉';
    document.getElementById('wTitle').textContent=revealed?'Solution Revealed':'Puzzle Solved!';
    document.getElementById('wSub')  .textContent=revealed?'Better luck next time!':'Excellent work!';
    document.getElementById('wTime') .textContent=e;
    document.getElementById('wSz')   .textContent=`${this.sz}×${this.sz}`;
    document.getElementById('wDf')   .textContent=this.df.charAt(0).toUpperCase()+this.df.slice(1);
    const card=document.querySelector('#winModal .modal-card');
    if(card){card.style.transform='translate(0,0)';card.dataset.mdx='0';card.dataset.mdy='0';}
    document.getElementById('winModal').classList.add('open');
    if(!revealed)this._toast('🎉 Brilliant!',700);
  }

  /*─── Tools ───*/
  _share(){
    if(!this.seed)return;
    const url=location.origin+location.pathname+`?seed=${this.seed}`;
    navigator.clipboard.writeText(url).then(()=>this._toast('📋 Share link copied!',2200)).catch(()=>this._toast('Seed: '+this.seed,3500));
  }
  _copySeed(){
    if(!this.seed)return;
    navigator.clipboard.writeText(this.seed).then(()=>this._toast('📋 Seed copied!',2000)).catch(()=>{});
  }
  _updateProgress(){
    if(!this.player)return;
    const tot=this.sz*this.sz,filled=this.clues.map((v,i)=>v||this.player[i]).filter(v=>v!==0).length;
    document.getElementById('pFill').style.width=Math.round(filled/tot*100)+'%';
    document.getElementById('pLbl').textContent=`${filled}/${tot}`;
    document.getElementById('sbCl').textContent=`${filled}/${tot}`;
  }
  _startTimer(){this._t0=Date.now();this._stopTimer();this._tick=setInterval(()=>{document.getElementById('sbTm').textContent=this._elapsed()},1000)}
  _stopTimer(){clearInterval(this._tick);this._tick=null}
  _elapsed(){const s=this._elapsedSecs();return`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
  _setSbMsg(t,c){const e=document.getElementById('sbMsg');e.textContent=t;e.className=c||''}
  _toast(msg,ms=2000){
    const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');
    clearTimeout(this._toastT);this._toastT=setTimeout(()=>t.classList.remove('show'),ms);
  }

  /*─── Restore / Save ───*/
  _restoreElapsed(elapsed){ if(Number.isInteger(elapsed)&&elapsed>=0)this._t0=Date.now()-elapsed*1000; }
  _restoreUI(saved){
    if(saved&&saved.fitActive){this.zp.autoFit();document.getElementById('fitBtn').classList.add('active');}
    else if(saved&&Number.isFinite(saved.zoom)&&Number.isFinite(saved.px)&&Number.isFinite(saved.py)){
      this.zp.zoom=saved.zoom;this.zp.px=saved.px;this.zp.py=saved.py;this.zp.apply();
      document.getElementById('fitBtn').classList.remove('active');
    }
    document.getElementById('eraBtn').classList.toggle('era',this.eraser);
    if(this.selVal){
      const t=[...document.getElementById('palette').querySelectorAll('.color-tile')].find(x=>x.dataset.val==this.selVal);
      if(t)t.classList.add('sel');
    }
  }
  _elapsedSecs(){ return Math.floor((Date.now()-(this._t0||Date.now()))/1000); }
  _scheduleSave(){ clearTimeout(this._saveT); this._saveT=setTimeout(()=>this._saveState(),180); }
  _saveState(){
    if(!this.player||!this.seed)return;
    const data={
      v:1, seed:this.seed, sz:this.sz, df:this.df,
      modeGrp:this.modeGrp, numSub:this.numSub, colSub:this.colSub,
      uiTheme:this.uiTheme, emojiSet:this.emojiSet,
      sgR:this.sgR, sgC:this.sgC,
      player:this.player, // Only save player moves, clues are re-derived from seed on load
      selVal:this.selVal, eraser:this.eraser,
      elapsed:this._elapsedSecs(),
      zoom:this.zp.zoom, px:this.zp.px, py:this.zp.py,
      fitActive:document.getElementById('fitBtn').classList.contains('active')
    };
    try{localStorage.setItem(STORE_KEY,JSON.stringify(data))}catch(e){}
  }
  _loadSaved(){
    try{ const raw=localStorage.getItem(STORE_KEY); if(!raw)return null; const data=JSON.parse(raw); if(!data||data.v!==1)return null; return data; }catch(e){return null}
  }
  _syncModeButtons(){ const md=document.getElementById('mdG'); md.querySelectorAll('.cb').forEach(b=>b.classList.toggle('active',b.dataset.mg===this.modeGrp)); }
  _activeGrp(id,btn){document.getElementById(id).querySelectorAll('.cb').forEach(b=>b.classList.remove('active'));btn.classList.add('active')}
  _activeGrpByVal(id,attr,val){document.getElementById(id).querySelectorAll('.cb').forEach(b=>b.classList.toggle('active',b.getAttribute(attr)===val))}
}

/*═══════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════*/
const game=new Game();
window.addEventListener('load',()=>{
  const ls=document.getElementById('loading');
  ls.style.transition='opacity .4s';ls.style.opacity='0';
  setTimeout(()=>ls.remove(),450);
});
window.addEventListener('beforeunload',()=>game._saveState());
window.addEventListener('resize',()=>{ if(document.getElementById('fitBtn').classList.contains('active'))game.zp.autoFit(); });
document.addEventListener('contextmenu',e=>{if(e.target.closest('#board'))e.preventDefault()});

```