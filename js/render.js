// Claycrown 2.0: Darstellung auf Canvas (prozedurale Grafik, keine externen Bilder)
// Terrain wird einmal pro Karte als weiches Gemälde mit Relief gebacken. Darüber liegen Details,
// Schatten mit wanderndem Sonnenstand, Tag und Nacht mit Lichtquellen, Partikel, Wolken und Vögel.
import { UNITS, BUILDINGS } from './data.js?v=202';
import { T } from './world.js?v=202';
import { shade, hash, mkCanvas, hexRgb, clamp01, lerp, OUT } from './gfx-util.js?v=202';
import { UNIT_DRAW, UNIT_BOX } from './gfx-units.js?v=202';
import { BUILD_DRAW, BUILD_TOP, setBuildAge } from './gfx-buildings.js?v=202';

export { BUILD_TOP };
export const TILE = 32;
const SPR = 64;    // Pixel pro Kachel in Gebäude und Ressourcen Sprites
const SPRU = 64;   // Pixel pro Kachel in Einheiten Sprites
const PAD = 0.4;   // Rand links und rechts in Gebäude Sprites
const DAY_LEN = 600;

export const QUALITY = {
  low: { name: 'Niedrig', tr: 6, maxDpr: 1, particles: 120, shadows: false, clouds: false, birds: false, vignette: false, grain: false, waterFx: false, sway: false, decor: 0.4, fireflies: false },
  mid: { name: 'Mittel', tr: 10, maxDpr: 1.5, particles: 500, shadows: true, clouds: false, birds: true, vignette: true, grain: false, waterFx: true, sway: true, decor: 0.8, fireflies: false },
  high: { name: 'Hoch', tr: 16, maxDpr: 2, particles: 1400, shadows: true, clouds: true, birds: true, vignette: true, grain: true, waterFx: true, sway: true, decor: 1, fireflies: true },
};

// ---------- Rauschen für das Terrain ----------
function h2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy, s), b = h2(ix + 1, iy, s), c = h2(ix, iy + 1, s), d = h2(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const TER_COL = {
  [T.GRASS]: [111, 160, 67], [T.SAND]: [222, 200, 145], [T.DIRT]: [166, 132, 90], [T.SHALLOW]: [104, 172, 170], [T.WATER]: [40, 104, 150],
};

export class Renderer {
  constructor(canvas, minimap) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.mm = minimap; this.mctx = minimap.getContext('2d');
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.sprites = new Map();
    this.markers = [];
    this.parts = [];
    this.fogT = 0; this.mmT = 0;
    this.w = 1; this.h = 1; this.dpr = 1; this.reqDpr = 1;
    this.dayNight = true;
    this.setQuality('high');
    this.lightSpr = this.makeLight([255, 196, 120]);
    this.lightCool = this.makeLight([150, 255, 170]);
    this.time = 0;
  }

  setQuality(name) {
    this.qName = QUALITY[name] ? name : 'high';
    this.q = QUALITY[this.qName];
    if (this.w > 1) this.resize(this.w, this.h, this.reqDpr);
    if (this.g) this.bakeTerrain();
    this.vig = null;
  }

  setGame(g) {
    this.g = g;
    this.fogSmall = mkCanvas(g.W, g.H);
    this.fogSmallCtx = this.fogSmall.getContext('2d');
    this.fogImg = this.fogSmallCtx.createImageData(g.W, g.H);
    this.fogF = new Float32Array(g.W * g.H);
    this.fogT = 0;
    this.mmBase = null; this.mmTerrain = null;
    this.markers = []; this.parts = [];
    this.bakeTerrain();
    this.buildDecor();
    this.initAmbient();
  }

  resize(w, h, dpr) {
    this.reqDpr = dpr;
    this.w = w; this.h = h; this.dpr = Math.min(dpr, this.q.maxDpr);
    this.cv.width = Math.round(w * this.dpr); this.cv.height = Math.round(h * this.dpr);
    this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
    this.vig = null;
  }

  get scale() { return TILE * this.cam.zoom; }
  toScreen(x, y) { const s = this.scale; return [(x - this.cam.x) * s, (y - this.cam.y) * s]; }
  toWorld(sx, sy) { const s = this.scale; return [sx / s + this.cam.x, sy / s + this.cam.y]; }
  clampCam() {
    const g = this.g, s = this.scale;
    const vw = this.w / s, vh = this.h / s, m = 3;
    this.cam.x = Math.max(-m, Math.min(g.W + m - vw, this.cam.x));
    const ins = this.inset || { top: 0, bottom: 0 };
    this.cam.y = Math.max(-m - ins.top / s, Math.min(g.H + m + ins.bottom / s - vh, this.cam.y));
    if (vw > g.W + 2 * m) this.cam.x = (g.W - vw) / 2;
    if (vh > g.H + 2 * m) this.cam.y = (g.H - vh) / 2;
  }
  centerOn(x, y) {
    const s = this.scale, ins = this.inset || { top: 0, bottom: 0 };
    this.cam.x = x - this.w / s / 2;
    this.cam.y = y - (ins.top + (this.h - ins.top - ins.bottom) / 2) / s;
    this.clampCam();
  }
  zoomAt(f, sx, sy) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.cam.zoom = Math.max(0.4, Math.min(2.4, this.cam.zoom * f));
    const s = this.scale; this.cam.x = wx - sx / s; this.cam.y = wy - sy / s; this.clampCam();
  }
  inView(x, y, m) {
    const s = this.scale;
    return x > this.cam.x - m && y > this.cam.y - m && x < this.cam.x + this.w / s + m && y < this.cam.y + this.h / s + m + 2;
  }

  // ---------- Terrain backen ----------
  bakeTerrain() {
    const g = this.g, W = g.W, H = g.H, ter = g.terrain;
    const tr = Math.max(4, Math.min(this.q.tr, Math.floor(2048 / Math.max(W, H))));
    this.tr = tr;
    const seed = (g.seed | 0) % 100000;
    // Wassertiefe per Breitensuche ab dem Ufer
    const depth = new Float32Array(W * H);
    const isW = i => ter[i] === T.WATER;
    let q = [];
    for (let i = 0; i < W * H; i++) { if (isW(i)) depth[i] = 99; else { depth[i] = 0; } }
    for (let i = 0; i < W * H; i++) if (!isW(i)) q.push(i);
    for (let d = 1; d < 8 && q.length; d++) {
      const nq = [];
      for (const i of q) {
        const x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx; if (depth[j] > d) { depth[j] = d; nq.push(j); }
        }
      }
      q = nq;
    }
    // Grundfarbe je Terrainart, Variation kommt pro Pixel aus stetigem Rauschen (keine Kachelkanten)
    const wet = new Float32Array(W * H), dep = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) { wet[i] = ter[i] === T.WATER ? 1 : ter[i] === T.SHALLOW ? 0.6 : 0; dep[i] = Math.min(depth[i], 7); }
    // Höhenfeld für Relief
    const HW = W + 1, hf = new Float32Array(HW * (H + 1));
    for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) {
      hf[y * HW + x] = vnoise(x * 0.09, y * 0.09, seed + 1) * 1.6 + vnoise(x * 0.23, y * 0.23, seed + 2) * 0.6 + vnoise(x * 0.6, y * 0.6, seed + 3) * 0.2;
    }
    const PW = W * tr, PH = H * tr;
    const cv = mkCanvas(PW, PH), cx = cv.getContext('2d');
    const img = cx.createImageData(PW, PH), d = img.data;
    const sharpen = f => { const v = clamp01((f - 0.5) * 1.9 + 0.5); return v * v * (3 - 2 * v); };
    const Hb = (x, y) => {
      x = Math.min(W - 0.001, Math.max(0, x)); y = Math.min(H - 0.001, Math.max(0, y));
      const ix = Math.floor(x), iy = Math.floor(y), ax = x - ix, ay = y - iy, i = iy * HW + ix;
      return (hf[i] * (1 - ax) + hf[i + 1] * ax) * (1 - ay) + (hf[i + HW] * (1 - ax) + hf[i + HW + 1] * ax) * ay;
    };
    const col = [0, 0, 0], acc = [0, 0, 0];
    let pn1 = 0, pn2 = 0, pdepth = 0;
    const typeCol = t => {
      if (t === T.GRASS) {
        const n = pn1, m = pn2;
        col[0] = lerp(92, 150, n * 0.6 + m * 0.4); col[1] = lerp(146, 172, n); col[2] = lerp(55, 78, m);
        const dry = clamp01((n - 0.66) * 6); col[0] += 18 * dry; col[1] += 6 * dry; col[2] -= 6 * dry;
      } else if (t === T.DIRT) { const n = pn2; col[0] = lerp(148, 178, n); col[1] = lerp(116, 142, n); col[2] = lerp(78, 96, n); }
      else if (t === T.SAND) { const n = pn1; col[0] = lerp(214, 230, n); col[1] = lerp(192, 208, n); col[2] = lerp(136, 154, n); }
      else if (t === T.SHALLOW) { col[0] = 104; col[1] = 172; col[2] = 170; }
      else { const k = clamp01((pdepth - 1) / 5); col[0] = lerp(62, 26, k); col[1] = lerp(140, 78, k); col[2] = lerp(176, 128, k); }
    };
    for (let py = 0; py < PH; py++) {
      const wy = (py + 0.5) / tr;
      for (let px = 0; px < PW; px++) {
        const wx = (px + 0.5) / tr;
        const wxp = wx + (vnoise(wx * 0.9, wy * 0.9, seed + 21) - 0.5) * 0.7 + (vnoise(wx * 2.7, wy * 2.7, seed + 23) - 0.5) * 0.45 - 0.5;
        const wyp = wy + (vnoise(wx * 0.9 + 17, wy * 0.9 + 5, seed + 22) - 0.5) * 0.7 + (vnoise(wx * 2.7 + 9, wy * 2.7 + 3, seed + 24) - 0.5) * 0.45 - 0.5;
        let ix = Math.floor(wxp), iy = Math.floor(wyp);
        let rfx = wxp - ix, rfy = wyp - iy;
        if (ix < 0) { ix = 0; rfx = 0; } if (iy < 0) { iy = 0; rfy = 0; }
        if (ix >= W - 1) { ix = W - 2; rfx = 1; } if (iy >= H - 1) { iy = H - 2; rfy = 1; }
        const fx = sharpen(rfx), fy = sharpen(rfy);
        const i00 = iy * W + ix, i10 = i00 + 1, i01 = i00 + W, i11 = i01 + 1;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        pn1 = vnoise(wx * 0.12, wy * 0.12, seed + 7); pn2 = vnoise(wx * 0.31, wy * 0.31, seed + 9);
        pdepth = dep[i00] * (1 - rfx) * (1 - rfy) + dep[i10] * rfx * (1 - rfy) + dep[i01] * (1 - rfx) * rfy + dep[i11] * rfx * rfy;
        acc[0] = acc[1] = acc[2] = 0;
        typeCol(ter[i00]); acc[0] += col[0] * w00; acc[1] += col[1] * w00; acc[2] += col[2] * w00;
        typeCol(ter[i10]); acc[0] += col[0] * w10; acc[1] += col[1] * w10; acc[2] += col[2] * w10;
        typeCol(ter[i01]); acc[0] += col[0] * w01; acc[1] += col[1] * w01; acc[2] += col[2] * w01;
        typeCol(ter[i11]); acc[0] += col[0] * w11; acc[1] += col[1] * w11; acc[2] += col[2] * w11;
        let r = acc[0], gg = acc[1], b = acc[2];
        const wv = wet[i00] * w00 + wet[i10] * w10 + wet[i01] * w01 + wet[i11] * w11;
        // Relief aus dem Höhenfeld
        const gx = Hb(wx + 0.5, wy) - Hb(wx - 0.5, wy);
        const gy = Hb(wx, wy + 0.5) - Hb(wx, wy - 0.5);
        let lit = 1 + (-gx * 0.55 - gy * 0.75) * (1 - wv * 0.8);
        // Feindetail und Körnung
        const det = vnoise(wx * 2.6, wy * 2.6, seed + 31) - 0.5;
        const grain = h2(px, py, seed) - 0.5;
        lit += det * 0.12 + grain * 0.07;
        // Ufer: nasser Sand und Schaumkante
        if (wv > 0.08 && wv < 0.55) { const k = 1 - Math.abs(wv - 0.3) / 0.25; r -= 26 * k; gg -= 22 * k; b -= 12 * k; }
        if (wv >= 0.55 && wv < 0.7) { const k = 1 - Math.abs(wv - 0.62) / 0.08; r += 70 * k; gg += 70 * k; b += 60 * k; }
        if (wv >= 0.7) { const ripple = vnoise(wx * 1.8, wy * 4, seed + 41); lit += (ripple - 0.5) * 0.12; }
        const o = (py * PW + px) * 4;
        d[o] = r * lit; d[o + 1] = gg * lit; d[o + 2] = b * lit; d[o + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    this.terrainCv = cv;
    this.depth = depth;
    // Uferkacheln für animierten Schaum
    this.shore = [];
    for (let i = 0; i < W * H; i++) {
      if (ter[i] !== T.WATER) continue;
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (ter[ny * W + nx] !== T.WATER) this.shore.push(i, dx, dy);
      }
    }
    // Minikarte Grundbild
    const mt = mkCanvas(this.mm.width, this.mm.height), mc = mt.getContext('2d');
    mc.imageSmoothingEnabled = true; mc.drawImage(cv, 0, 0, mt.width, mt.height);
    this.mmTerrain = mt;
    // Körnungsmuster für Nahansicht
    const gc = mkCanvas(128, 128), gx = gc.getContext('2d');
    for (let i = 0; i < 900; i++) {
      gx.fillStyle = h2(i, 3, 5) > 0.5 ? 'rgba(255,255,230,0.18)' : 'rgba(30,20,0,0.18)';
      gx.fillRect(h2(i, 1, 7) * 128, h2(i, 2, 9) * 128, 1 + h2(i, 4, 1) * 2.5, 1 + h2(i, 6, 2) * 1.5);
    }
    this.grainPat = this.ctx.createPattern(gc, 'repeat');
  }

  // ---------- Bodendetails ----------
  buildDecor() {
    const g = this.g, W = g.W, H = g.H, ter = g.terrain;
    this.decor = new Uint8Array(W * H);
    const sd = g.seed | 0;
    for (let i = 0; i < W * H; i++) {
      const r = h2(i, 77, sd), t = ter[i];
      let k = 0;
      if (t === T.GRASS) {
        if (r < 0.28) k = 1 + (h2(i, 3, sd) * 3 | 0);           // Grasbüschel 1..3
        else if (r < 0.34) k = 4 + (h2(i, 4, sd) * 3 | 0);      // Blumen 4..6
        else if (r < 0.37) k = 7;                                 // Steine
        else if (r < 0.38) k = 8;                                 // Pilze
      } else if (t === T.DIRT) { if (r < 0.2) k = 9; else if (r < 0.26) k = 7; }
      else if (t === T.SAND) { if (r < 0.12) k = 10; else if (r < 0.16) k = 7; }
      else if (t === T.SHALLOW) { if (r < 0.3) k = 11; }
      else if (t === T.WATER) { if (this.depth[i] <= 2 && r < 0.12) k = 12; }
      if (k && t !== T.WATER) {
        // Schilf an Land direkt am Wasser
        const x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H && ter[ny * W + nx] === T.WATER && r < 0.5) k = 11; }
      }
      this.decor[i] = k;
    }
  }

  decorSprite(k) {
    return this.sprite('d' + k, 1, 1, 0.5, c => {
      const tuft = (x, y, s, col) => {
        c.strokeStyle = col; c.lineWidth = 0.035; c.lineCap = 'round';
        for (let j = -2; j <= 2; j++) { c.beginPath(); c.moveTo(x + j * 0.03, y); c.quadraticCurveTo(x + j * 0.06, y - s * 0.6, x + j * 0.11, y - s); c.stroke(); }
      };
      if (k <= 3) {
        const cols = ['#4f7f2a', '#5d8f30', '#6f9e3a'];
        tuft(0.35, 0.6, 0.22, cols[k - 1]); tuft(0.6, 0.72, 0.18, shade(cols[k - 1], 0.15));
        if (k === 3) tuft(0.5, 0.45, 0.16, cols[0]);
      } else if (k <= 6) {
        const pc = ['#f4f1e8', '#f2d03a', '#e06aa0'][k - 4];
        tuft(0.5, 0.7, 0.14, '#4f7f2a');
        for (const [x, y] of [[0.35, 0.5], [0.55, 0.42], [0.65, 0.6], [0.45, 0.66]]) {
          c.fillStyle = pc; for (let a = 0; a < 5; a++) { c.beginPath(); c.arc(x + Math.cos(a * 1.26) * 0.03, y + Math.sin(a * 1.26) * 0.03, 0.025, 0, 7); c.fill(); }
          c.fillStyle = '#e8a020'; c.beginPath(); c.arc(x, y, 0.018, 0, 7); c.fill();
        }
      } else if (k === 7) {
        for (const [x, y, r] of [[0.4, 0.6, 0.09], [0.55, 0.66, 0.06], [0.62, 0.52, 0.05]]) {
          c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(x + 0.02, y + 0.03, r, r * 0.55, 0, 0, 7); c.fill();
          c.fillStyle = '#9a958c'; c.beginPath(); c.ellipse(x, y, r, r * 0.7, 0, 0, 7); c.fill();
          c.fillStyle = '#c4c0b6'; c.beginPath(); c.ellipse(x - r * 0.3, y - r * 0.3, r * 0.4, r * 0.3, 0, 0, 7); c.fill();
        }
      } else if (k === 8) {
        for (const [x, y] of [[0.45, 0.62], [0.58, 0.68]]) {
          c.fillStyle = '#efe6d2'; c.fillRect(x - 0.015, y - 0.08, 0.03, 0.08);
          c.fillStyle = '#c0392b'; c.beginPath(); c.ellipse(x, y - 0.08, 0.06, 0.04, 0, Math.PI, 0); c.fill();
          c.fillStyle = '#fff'; c.beginPath(); c.arc(x - 0.02, y - 0.1, 0.008, 0, 7); c.arc(x + 0.02, y - 0.095, 0.008, 0, 7); c.fill();
        }
      } else if (k === 9) {
        c.fillStyle = 'rgba(90,65,40,0.5)';
        for (let j = 0; j < 6; j++) { c.beginPath(); c.ellipse(0.2 + hash(j, 1) * 0.6, 0.3 + hash(2, j) * 0.6, 0.03, 0.02, 0, 0, 7); c.fill(); }
      } else if (k === 10) {
        c.strokeStyle = 'rgba(160,130,80,0.45)'; c.lineWidth = 0.02;
        for (let j = 0; j < 3; j++) { c.beginPath(); c.moveTo(0.15, 0.4 + j * 0.15); c.quadraticCurveTo(0.5, 0.35 + j * 0.15, 0.85, 0.4 + j * 0.15); c.stroke(); }
        c.fillStyle = '#f6efe2'; c.beginPath(); c.arc(0.6, 0.55, 0.035, Math.PI, 0); c.fill();
      } else if (k === 11) {
        c.lineCap = 'round';
        for (let j = 0; j < 6; j++) {
          const x = 0.25 + j * 0.1, h = 0.35 + hash(j, 9) * 0.25;
          c.strokeStyle = j % 2 ? '#6f8f3a' : '#87a64a'; c.lineWidth = 0.03;
          c.beginPath(); c.moveTo(x, 0.75); c.quadraticCurveTo(x + 0.04, 0.75 - h * 0.6, x + 0.02, 0.75 - h); c.stroke();
          if (j % 3 === 0) { c.fillStyle = '#6a4424'; c.beginPath(); c.ellipse(x + 0.02, 0.75 - h, 0.025, 0.06, 0, 0, 7); c.fill(); }
        }
      } else if (k === 12) {
        for (const [x, y, r] of [[0.4, 0.5, 0.12], [0.65, 0.65, 0.08]]) {
          c.fillStyle = '#3f7a34'; c.beginPath(); c.ellipse(x, y, r, r * 0.6, 0, 0.3, Math.PI * 2 - 0.1); c.lineTo(x, y); c.fill();
          c.fillStyle = '#5c9a48'; c.beginPath(); c.ellipse(x - r * 0.2, y - r * 0.15, r * 0.4, r * 0.25, 0, 0, 7); c.fill();
        }
        c.fillStyle = '#f2b8d0'; c.beginPath(); c.arc(0.42, 0.46, 0.04, 0, 7); c.fill();
      }
    });
  }

  // ---------- Sprites ----------
  sprite(key, wT, hT, top, fn, pad = 0) {
    let s = this.sprites.get(key);
    if (s) return s;
    const c = mkCanvas((wT + pad * 2) * SPR, (hT + top) * SPR), x = c.getContext('2d');
    x.translate(pad * SPR, top * SPR); x.scale(SPR, SPR);
    const A = { lights: [], flags: [], smoke: [], fire: [] };
    fn(x, A);
    s = { c, wT, hT, top, pad, A };
    this.sprites.set(key, s);
    return s;
  }
  // Silhouette für Schatten
  shadowOf(s) {
    if (s.sh) return s.sh;
    const c = mkCanvas(s.c.width, s.c.height), x = c.getContext('2d');
    x.drawImage(s.c, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    s.sh = c;
    return c;
  }
  drawSprite(s, wx, wy, alpha = 1, clipFrac = 1) {
    const [sx, sy] = this.toScreen(wx - s.pad, wy), sc = this.scale, c = this.ctx;
    const totalH = (s.hT + s.top) * sc, totalW = (s.wT + s.pad * 2) * sc;
    if (alpha !== 1) c.globalAlpha = alpha;
    if (clipFrac >= 1) c.drawImage(s.c, sx, sy - s.top * sc, totalW, totalH);
    else {
      const sh = s.c.height * clipFrac;
      c.drawImage(s.c, 0, s.c.height - sh, s.c.width, sh, sx, sy - s.top * sc + totalH * (1 - clipFrac), totalW, totalH * clipFrac);
    }
    if (alpha !== 1) c.globalAlpha = 1;
  }
  // Schräg geworfener Schatten eines Sprites, Basislinie am unteren Rand der Grundfläche
  drawShadow(s, wx, wy, baseY, alpha) {
    const sun = this.sun;
    if (!sun || sun.a <= 0.01) return;
    const c = this.ctx, sc = this.scale;
    const [bx, by] = this.toScreen(wx - s.pad, baseY);
    const [ox, oy] = this.toScreen(wx - s.pad, wy - s.top);
    c.save();
    c.globalAlpha = sun.a * (alpha ?? 1);
    c.setTransform(this.dpr, 0, -sun.k * this.dpr, sun.sq * this.dpr, bx * this.dpr, by * this.dpr);
    c.drawImage(this.shadowOf(s), 0, oy - by, (s.wT + s.pad * 2) * sc, (s.hT + s.top) * sc);
    c.restore();
  }

  buildingSprite(type, owner, mask) {
    const pl = this.g.players[owner], d = BUILDINGS[type], col = pl ? pl.color : '#888';
    const age = pl ? pl.age : 1;
    const key = `b_${type}_${col}_a${age}${mask != null ? '_' + mask : ''}`;
    return this.sprite(key, d.w, d.h, BUILD_TOP[type] || 1, (x, A) => { setBuildAge(age); BUILD_DRAW[type](x, col, A, mask); setBuildAge(1); }, PAD);
  }
  foundationSprite(w, h) {
    return this.sprite(`f_${w}_${h}`, w, h, 0.6, x => {
      x.fillStyle = 'rgba(110,80,48,0.8)'; x.fillRect(0.08, 0.08, w - 0.16, h - 0.16);
      x.strokeStyle = 'rgba(70,45,22,0.6)'; x.lineWidth = 0.02;
      for (let i = 0; i < w * h * 6; i++) { x.beginPath(); x.moveTo(0.1 + hash(i, w) * (w - 0.2), 0.1 + hash(h, i) * (h - 0.2)); x.lineTo(0.15 + hash(i, w) * (w - 0.2), 0.12 + hash(h, i) * (h - 0.2)); x.stroke(); }
      x.strokeStyle = '#5a3c20'; x.lineWidth = 0.05; x.setLineDash([0.15, 0.1]); x.strokeRect(0.1, 0.1, w - 0.2, h - 0.2); x.setLineDash([]);
      // Gerüst
      x.strokeStyle = OUT; x.lineWidth = 0.07;
      for (const [px, py] of [[0.15, 0.15], [w - 0.15, 0.15], [0.15, h - 0.15], [w - 0.15, h - 0.15]]) { x.beginPath(); x.moveTo(px, py); x.lineTo(px, py - 0.55); x.stroke(); }
      x.strokeStyle = '#8a5a33'; x.lineWidth = 0.045;
      for (const [px, py] of [[0.15, 0.15], [w - 0.15, 0.15], [0.15, h - 0.15], [w - 0.15, h - 0.15]]) { x.beginPath(); x.moveTo(px, py); x.lineTo(px, py - 0.55); x.stroke(); }
      x.beginPath(); x.moveTo(0.15, h - 0.5); x.lineTo(w - 0.15, h - 0.5); x.stroke();
      // Material
      for (let i = 0; i < Math.min(4, w); i++) { x.fillStyle = '#c98d5d'; x.fillRect(0.3 + i * 0.45, h - 0.42, 0.3, 0.14); x.strokeStyle = OUT; x.lineWidth = 0.02; x.strokeRect(0.3 + i * 0.45, h - 0.42, 0.3, 0.14); }
    });
  }

  resSprite(r) {
    if (r.kind === 'tree') {
      const v = r.v % 7;
      return this.sprite(`t_${v}`, 1, 1, 1.25, x => {
        const trunk = (h = 0.5) => {
          x.fillStyle = OUT; x.fillRect(0.425, 0.86 - h - 0.02, 0.15, h + 0.04);
          const tg = x.createLinearGradient(0.43, 0, 0.57, 0); tg.addColorStop(0, '#7a5232'); tg.addColorStop(1, '#4a2e18');
          x.fillStyle = tg; x.fillRect(0.44, 0.86 - h, 0.12, h);
        };
        if (v < 2) {
          // Tanne
          trunk(0.35);
          const cols = v ? ['#24502a', '#2f6232', '#3b733a'] : ['#2a5a2e', '#356d36', '#43803f'];
          for (let i = 0; i < 4; i++) {
            const y = -1.05 + i * 0.36, w = 0.24 + i * 0.1;
            x.fillStyle = OUT; x.beginPath(); x.moveTo(0.5, y - 0.03); x.lineTo(0.5 + w + 0.03, y + 0.5); x.lineTo(0.5 - w - 0.03, y + 0.5); x.closePath(); x.fill();
            const g = x.createLinearGradient(0.5 - w, 0, 0.5 + w, 0); g.addColorStop(0, cols[2]); g.addColorStop(0.5, cols[1]); g.addColorStop(1, cols[0]);
            x.fillStyle = g; x.beginPath(); x.moveTo(0.5, y); x.lineTo(0.5 + w, y + 0.48); x.quadraticCurveTo(0.5, y + 0.4, 0.5 - w, y + 0.48); x.closePath(); x.fill();
            x.fillStyle = 'rgba(255,255,220,0.12)'; x.beginPath(); x.moveTo(0.5, y + 0.02); x.lineTo(0.5 - w * 0.6, y + 0.42); x.lineTo(0.5 - w * 0.2, y + 0.4); x.fill();
          }
        } else if (v === 6) {
          // Birke
          x.fillStyle = OUT; x.fillRect(0.44, 0.08, 0.12, 0.8);
          x.fillStyle = '#efeae0'; x.fillRect(0.455, 0.1, 0.09, 0.76);
          x.fillStyle = '#2a2a2a'; for (let i = 0; i < 6; i++) x.fillRect(0.455 + hash(i, 3) * 0.05, 0.15 + i * 0.12, 0.04, 0.02);
          const blobs = [[0.5, -0.45, 0.3], [0.32, -0.2, 0.22], [0.68, -0.22, 0.22], [0.5, -0.05, 0.22]];
          for (const [bx, by, br] of blobs) { x.fillStyle = OUT; x.beginPath(); x.arc(bx, by, br + 0.03, 0, 7); x.fill(); }
          for (const [bx, by, br] of blobs) { const g = x.createRadialGradient(bx - br * 0.4, by - br * 0.4, br * 0.1, bx, by, br); g.addColorStop(0, '#b8d86a'); g.addColorStop(1, '#6e9a34'); x.fillStyle = g; x.beginPath(); x.arc(bx, by, br, 0, 7); x.fill(); }
        } else {
          // Laubbaum, teils herbstlich
          trunk(0.55);
          const base = ['#3f7a2e', '#4a8a35', '#567f2c', '#8a8a2a'][v - 2];
          const blobs = [[0.5, -0.2, 0.4], [0.24, 0.0, 0.28], [0.76, 0.0, 0.28], [0.5, -0.55, 0.3], [0.3, -0.38, 0.22], [0.7, -0.38, 0.22]];
          for (const [bx, by, br] of blobs) { x.fillStyle = OUT; x.beginPath(); x.arc(bx, by, br + 0.03, 0, 7); x.fill(); }
          for (const [bx, by, br] of blobs) {
            const g = x.createRadialGradient(bx - br * 0.45, by - br * 0.45, br * 0.1, bx, by, br * 1.05);
            g.addColorStop(0, shade(base, 0.35)); g.addColorStop(0.6, base); g.addColorStop(1, shade(base, -0.35));
            x.fillStyle = g; x.beginPath(); x.arc(bx, by, br, 0, 7); x.fill();
          }
          x.fillStyle = 'rgba(255,255,210,0.18)';
          for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(0.25 + hash(v, i) * 0.4, -0.6 + hash(i, v) * 0.6, 0.04, 0, 7); x.fill(); }
          if (v === 5) { x.fillStyle = '#d43c2c'; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(0.2 + hash(i, 5) * 0.6, -0.5 + hash(5, i) * 0.6, 0.035, 0, 7); x.fill(); } }
        }
      });
    }
    const v = r.v % 5;
    if (r.kind === 'gold' || r.kind === 'clay') {
      const gold = r.kind === 'gold';
      return this.sprite(`${r.kind}_${v}`, 1, 1, 0.45, x => {
        const rocks = [[0.28, 0.55, 0.26], [0.7, 0.52, 0.24], [0.5, 0.26, 0.28], [0.52 + (v - 2) * 0.05, 0.66, 0.2]];
        const base = gold ? '#8f8a80' : '#b0623a';
        for (const [bx, by, br] of rocks) { x.fillStyle = OUT; x.beginPath(); x.moveTo(bx - br - 0.02, by + 0.06); x.lineTo(bx - br * 0.6, by - br * 0.8 - 0.02); x.lineTo(bx + br * 0.5, by - br - 0.02); x.lineTo(bx + br + 0.02, by + 0.02); x.lineTo(bx + br * 0.4, by + br * 0.5 + 0.02); x.closePath(); x.fill(); }
        for (const [bx, by, br] of rocks) {
          x.fillStyle = shade(base, -0.3); x.beginPath(); x.moveTo(bx - br, by + 0.05); x.lineTo(bx - br * 0.6, by - br * 0.8); x.lineTo(bx + br * 0.5, by - br); x.lineTo(bx + br, by + 0.02); x.lineTo(bx + br * 0.4, by + br * 0.5); x.closePath(); x.fill();
          x.fillStyle = base; x.beginPath(); x.moveTo(bx - br * 0.6, by - br * 0.8); x.lineTo(bx + br * 0.5, by - br); x.lineTo(bx + br * 0.6, by - 0.02); x.lineTo(bx - br * 0.5, by + 0.02); x.closePath(); x.fill();
          x.fillStyle = shade(base, 0.3); x.beginPath(); x.moveTo(bx - br * 0.6, by - br * 0.8); x.lineTo(bx + br * 0.5, by - br); x.lineTo(bx + br * 0.1, by - br * 0.55); x.closePath(); x.fill();
        }
        const vein = gold ? ['#ffe066', '#f2b81c'] : ['#f0a070', '#d06a3a'];
        for (let i = 0; i < 9; i++) {
          const px = 0.18 + hash(v, i) * 0.64, py = 0.12 + hash(i, v + 3) * 0.6;
          x.fillStyle = vein[i % 2]; x.beginPath(); x.moveTo(px, py - 0.05); x.lineTo(px + 0.04, py); x.lineTo(px, py + 0.04); x.lineTo(px - 0.04, py); x.fill();
        }
      });
    }
    return this.sprite(`berry_${v}`, 1, 1, 0.25, x => {
      const blobs = [[0.33, 0.48, 0.27], [0.67, 0.48, 0.27], [0.5, 0.26, 0.28]];
      for (const [bx, by, br] of blobs) { x.fillStyle = OUT; x.beginPath(); x.arc(bx, by, br + 0.03, 0, 7); x.fill(); }
      for (const [bx, by, br] of blobs) { const g = x.createRadialGradient(bx - br * 0.4, by - br * 0.4, 0.02, bx, by, br); g.addColorStop(0, '#5aa84a'); g.addColorStop(1, '#245a26'); x.fillStyle = g; x.beginPath(); x.arc(bx, by, br, 0, 7); x.fill(); }
      for (let i = 0; i < 12; i++) {
        const px = 0.15 + hash(v, i + 9) * 0.7, py = 0.05 + hash(i + 9, v) * 0.62;
        x.fillStyle = '#5a0f1f'; x.beginPath(); x.arc(px, py, 0.06, 0, 7); x.fill();
        x.fillStyle = i % 3 ? '#d4264a' : '#7a2ad4'; x.beginPath(); x.arc(px, py, 0.048, 0, 7); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.7)'; x.beginPath(); x.arc(px - 0.015, py - 0.015, 0.014, 0, 7); x.fill();
      }
    });
  }

  unitSprite(type, col, k, i) {
    const key = `u_${type}_${col}_${k}${i}`;
    let s = this.sprites.get(key);
    if (s) return s;
    const [bw, bh] = UNIT_BOX[type] || [1.4, 1.2];
    const c = mkCanvas(bw * SPRU, (bh + 0.12) * SPRU), x = c.getContext('2d');
    x.translate(bw / 2 * SPRU, bh * SPRU); x.scale(SPRU, SPRU);
    x.lineJoin = 'round';
    UNIT_DRAW[type](x, col, { k, i });
    s = { c, bw, bh };
    this.sprites.set(key, s);
    return s;
  }

  // Bauernhof je Wachstumsstufe
  farmSprite(owner, stage) {
    const col = this.g.players[owner].color;
    return this.sprite(`farm_${col}_${stage}`, 3, 3, 0.35, x => {
      x.fillStyle = '#7a5a32'; x.fillRect(0.1, 0.1, 2.8, 2.8);
      for (let i = 0; i < 9; i++) {
        const y = 0.25 + i * 0.3;
        x.fillStyle = '#5e4424'; x.fillRect(0.15, y + 0.08, 2.7, 0.07);
        x.fillStyle = '#9a7646'; x.fillRect(0.15, y, 2.7, 0.06);
        if (stage > 0) for (let j = 0; j < 14; j++) {
          const px = 0.25 + j * 0.19 + hash(i, j) * 0.04, h = 0.08 + stage * 0.07;
          const cc = stage >= 3 ? ['#e8c84a', '#d9b73c'][j % 2] : stage === 2 ? '#a8b03a' : '#6f9a34';
          x.strokeStyle = cc; x.lineWidth = 0.035;
          x.beginPath(); x.moveTo(px, y + 0.06); x.lineTo(px - 0.02, y + 0.06 - h); x.moveTo(px, y + 0.06); x.lineTo(px + 0.03, y + 0.06 - h * 0.9); x.stroke();
          if (stage >= 3) { x.fillStyle = '#f2d870'; x.beginPath(); x.ellipse(px - 0.02, y + 0.03 - h, 0.022, 0.045, -0.2, 0, 7); x.fill(); }
        }
      }
      // Zaun in Spielerfarbe
      x.strokeStyle = OUT; x.lineWidth = 0.07; x.strokeRect(0.06, 0.06, 2.88, 2.88);
      x.strokeStyle = '#a07040'; x.lineWidth = 0.045; x.strokeRect(0.06, 0.06, 2.88, 2.88);
      for (let k = 0; k <= 6; k++) for (const [px, py] of [[0.06 + k * 0.48, 0.06], [0.06 + k * 0.48, 2.94], [0.06, 0.06 + k * 0.48], [2.94, 0.06 + k * 0.48]]) {
        x.fillStyle = OUT; x.fillRect(px - 0.04, py - 0.2, 0.08, 0.22); x.fillStyle = '#8a5a33'; x.fillRect(px - 0.025, py - 0.19, 0.05, 0.2);
      }
      x.fillStyle = col; x.fillRect(0.02, -0.15, 0.08, 0.09); x.fillRect(2.9, -0.15, 0.08, 0.09);
    });
  }

  makeLight(rgb) {
    const c = mkCanvas(128, 128), x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, `rgba(${rgb},0.9)`); g.addColorStop(0.25, `rgba(${rgb},0.45)`); g.addColorStop(0.6, `rgba(${rgb},0.12)`); g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return c;
  }

  // ---------- Umgebung: Wolken und Vögel ----------
  initAmbient() {
    const g = this.g;
    this.clouds = [];
    for (let i = 0; i < Math.round(g.W * g.H / 1100); i++) this.clouds.push({ x: h2(i, 1, 3) * g.W, y: h2(i, 2, 3) * g.H, s: 6 + h2(i, 3, 3) * 9 });
    if (!this.cloudSpr) {
      const c = mkCanvas(256, 160), x = c.getContext('2d');
      for (let i = 0; i < 9; i++) {
        const cx = 50 + hash(i, 1) * 156, cy = 50 + hash(1, i) * 60, r = 30 + hash(i, 2) * 30;
        const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, 'rgba(0,0,20,0.5)'); gr.addColorStop(1, 'rgba(0,0,20,0)');
        x.fillStyle = gr; x.fillRect(0, 0, 256, 160);
      }
      this.cloudSpr = c;
    }
    this.birds = []; this.birdT = 8;
    this.flies = [];
  }

  updateAmbient(dt) {
    const g = this.g, wind = 0.35;
    for (const c of this.clouds) {
      c.x += wind * dt; c.y += wind * 0.3 * dt;
      if (c.x > g.W + 10) c.x = -c.s * 2; if (c.y > g.H + 8) c.y = -c.s;
    }
    if (this.q.birds) {
      this.birdT -= dt;
      if (this.birdT <= 0 && this.birds.length < 2) {
        this.birdT = 20 + Math.random() * 30;
        const n = 4 + (Math.random() * 5 | 0), a = Math.random() * Math.PI * 2;
        const cx = this.cam.x + this.w / this.scale / 2, cy = this.cam.y + this.h / this.scale / 2;
        const sx = cx - Math.cos(a) * 30, sy = cy - Math.sin(a) * 20;
        const flock = { x: sx, y: sy, vx: Math.cos(a) * 3.2, vy: Math.sin(a) * 2.2, t: 0, b: [] };
        for (let i = 0; i < n; i++) flock.b.push({ ox: -Math.abs(i - n / 2) * 0.9, oy: (i - n / 2) * 0.7, ph: Math.random() * 6 });
        this.birds.push(flock);
      }
      for (const f of this.birds) { f.x += f.vx * dt; f.y += f.vy * dt; f.t += dt; }
      this.birds = this.birds.filter(f => f.t < 40);
    }
  }

  // ---------- Partikel ----------
  emit(k, x, y, o = {}) {
    if (this.parts.length >= this.q.particles) { if (k === 'smoke' || k === 'dust' || k === 'leaf') return; this.parts.shift(); }
    this.parts.push({
      k, x, y, z: o.z ?? 0, vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0, t: 0, life: o.life ?? 1, s: o.s ?? 0.1,
      c: o.c, g: o.g ?? 0, rot: Math.random() * 6, vr: o.vr ?? 0,
    });
  }
  burst(k, x, y, n, sp, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = sp * (0.4 + Math.random() * 0.6);
      this.emit(k, x, y, { ...o, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, vz: (o.vz ?? 0) * (0.6 + Math.random() * 0.8), life: (o.life ?? 1) * (0.6 + Math.random() * 0.6), s: (o.s ?? 0.1) * (0.7 + Math.random() * 0.6) });
    }
  }
  seen(x, y) { const g = this.g; return g.vis[Math.floor(y) * g.W + Math.floor(x)] === 2; }

  // Ereignisse aus der Simulation in Effekte übersetzen
  onEvent(e) {
    // Zeitalterwechsel: alle sichtbaren Gebäude des Spielers funkeln, während sie im neuen Stil erscheinen
    if (this.g && e.type === 'age') {
      for (const b of this.g.blds) {
        if (b.owner !== e.owner || b.dead || !b.done || !this.inView(b.x, b.y, 4)) continue;
        if (b.owner !== 0 && !this.seen(b.x, b.y)) continue;
        for (let i = 0; i < 3 + b.w * b.h; i++) this.emit('glint', b.tx + Math.random() * b.w, b.ty + Math.random() * b.h, { z: 0.3 + Math.random() * 1.6, vz: 0.6, life: 0.9 + Math.random() * 0.8, s: 0.12 });
        this.burst('dust', b.x, b.ty + b.h, 4, 1.2, { life: 1.2, s: 0.35, c: '230,210,160' });
      }
      return;
    }
    if (!this.g || e.x == null || !this.inView(e.x, e.y, 3) || !this.seen(e.x, e.y)) return;
    switch (e.type) {
      case 'hit':
        if (e.bld) this.burst('debris', e.x + (Math.random() - 0.5), e.y, 3, 1.2, { vz: 2.5, g: 9, life: 0.8, s: 0.06, c: '#b98a5f' });
        else { this.burst('blood', e.x, e.y, 4, 1.4, { z: 0.4, vz: 1.6, g: 8, life: 0.6, s: 0.035 }); this.burst('spark', e.x, e.y, 2, 2, { z: 0.45, vz: 1.5, g: 6, life: 0.25 }); }
        break;
      case 'impact':
        if (e.kind === 'stone') {
          this.burst('debris', e.x, e.y, 10, 2.2, { vz: 3.5, g: 10, life: 1.1, s: 0.08, c: '#8a857c' });
          this.burst('dust', e.x, e.y, 8, 1.4, { z: 0.2, life: 1.4, s: 0.35, c: '150,130,100' });
          this.emit('ring', e.x, e.y, { life: 0.5, s: 1.2 });
          this.shake = Math.max(this.shake || 0, 0.25);
        } else if (e.bld) this.burst('debris', e.x, e.y, 2, 1, { vz: 1.5, g: 8, life: 0.5, s: 0.05, c: '#a07850' });
        else this.burst('blood', e.x, e.y, 3, 1, { z: 0.4, vz: 1.2, g: 8, life: 0.5, s: 0.03 });
        break;
      case 'death':
        this.burst('blood', e.x, e.y, 7, 1.6, { z: 0.35, vz: 2, g: 8, life: 0.8, s: 0.04 });
        this.burst('dust', e.x, e.y, 3, 0.6, { life: 0.9, s: 0.25, c: '140,120,90' });
        break;
      case 'destroyed': {
        const w = e.w || 2, h = e.h || 2;
        for (let i = 0; i < w * h * 3; i++) this.emit('debris', e.tx + Math.random() * w, e.ty + Math.random() * h, { vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 2, vz: 2 + Math.random() * 4, g: 10, life: 1.5, s: 0.07 + Math.random() * 0.08, c: ['#b98a5f', '#8a5a33', '#6a655e', '#cf9566'][i % 4], vr: (Math.random() - 0.5) * 10 });
        for (let i = 0; i < w * h * 2; i++) this.emit('smoke', e.tx + Math.random() * w, e.ty + Math.random() * h, { vz: 0.6 + Math.random(), vx: 0.3, life: 3 + Math.random() * 2, s: 0.4 + Math.random() * 0.4, c: '70,62,55' });
        for (let i = 0; i < w * h; i++) this.emit('fire', e.tx + Math.random() * w, e.ty + Math.random() * h, { vz: 1.2, life: 0.8 + Math.random() * 0.6, s: 0.3 });
        this.shake = Math.max(this.shake || 0, 0.5);
        break;
      }
      case 'built': this.burst('dust', e.x, e.y + 0.5, 10, 1.6, { life: 1.4, s: 0.4, c: '190,170,130' }); break;
      case 'trained': this.burst('dust', e.x, e.y, 4, 0.8, { life: 0.8, s: 0.2, c: '190,170,130' }); break;
      case 'trade': break;
    }
  }

  // Laufende Quellen: Staub, Späne, Rauch, Feuer
  emitters(dt, list) {
    const q = this.q, rate = q.particles / 1400;
    this.emA = (this.emA || 0) + dt;
    if (this.emA < 0.05) return;
    const step = this.emA; this.emA = 0;
    const R = p => Math.random() < p * step * 20 * rate;
    const g = this.g;
    for (const e of list) {
      if (e.cls === 'u') {
        const d = UNITS[e.type];
        if (e.owner !== 0 && !this.seen(e.x, e.y)) continue;
        if (e.moving && (d.mounted || d.cls === 'siege' || e.type === 'golem') && R(0.25)) this.emit('dust', e.x - Math.cos(e.dir) * 0.3, e.y + 0.05, { vz: 0.2, life: 0.9, s: 0.18, c: '170,145,105' });
        if (e.work && e.type === 'worker' && e.order && e.order.t === 'gather' && R(0.12)) {
          const k = e.order.kind, f = Math.cos(e.dir) >= 0 ? 1 : -1;
          if (k === 'wood') this.emit('chip', e.x + f * 0.35, e.y - 0.1, { z: 0.3, vz: 1.8, vx: f * 0.6, g: 7, life: 0.7, s: 0.04, c: '#d8b07a', vr: 8 });
          else if (k === 'gold') this.emit('glint', e.x + f * 0.4, e.y - 0.1, { z: 0.3, vz: 0.8, life: 0.6, s: 0.08 });
          else if (k === 'clay') this.emit('chip', e.x + f * 0.4, e.y, { z: 0.2, vz: 1.4, vx: f * 0.4, g: 7, life: 0.6, s: 0.04, c: '#c06a3c', vr: 6 });
        }
        if (e.work && e.type === 'worker' && e.order && e.order.t === 'build' && R(0.08)) this.emit('dust', e.x + (Math.random() - 0.5) * 0.6, e.y, { vz: 0.3, life: 0.8, s: 0.15, c: '190,170,130' });
        if (e.healT > 0 && e.type !== 'priest' && R(0.2)) this.emit('heal', e.x + (Math.random() - 0.5) * 0.4, e.y, { z: 0.4, vz: 0.9, life: 1, s: 0.07 });
      } else if (e.cls === 'b' && e.done) {
        if (e.type === 'farm') continue;
        const s = e.type === 'wall' ? null : this.buildingSprite(e.type, e.owner);
        if (s) {
          for (const [ax, ay] of s.A.smoke) if (R(e.type === 'house' ? 0.05 : 0.12)) this.emit('smoke', e.tx + ax, e.ty + ay + 0.4, { z: 0.4, vz: 0.5, vx: 0.18, life: 2.6, s: 0.14, c: e.type === 'forge' || e.type === 'kiln' ? '70,66,62' : '200,200,200' });
          if (s.A.sparks && R(0.25)) this.emit('spark', e.tx + s.A.sparks[0], e.ty + s.A.sparks[1], { z: 0.1, vz: 2.2, vx: (Math.random() - 0.5) * 1.2, g: 5, life: 0.6 });
        }
        const f = e.hp / e.maxHp;
        if (f < 0.6 && (e.owner === 0 || e.seen)) {
          const n = f < 0.3 ? 0.6 : 0.25;
          if (R(n)) this.emit('fire', e.tx + 0.2 + Math.random() * (e.w - 0.4), e.ty + e.h * 0.5 + Math.random() * e.h * 0.4, { z: 0.6 + Math.random() * 0.8, vz: 1.2, life: 0.7, s: 0.22 });
          if (R(n * 0.7)) this.emit('smoke', e.tx + 0.2 + Math.random() * (e.w - 0.4), e.ty + e.h * 0.5, { z: 1.0, vz: 0.8, vx: 0.25, life: 3, s: 0.28, c: '55,50,48' });
        }
      } else if (!e.done && e.cls === 'b' && e.nb > 0 && R(0.3)) {
        this.emit('dust', e.tx + Math.random() * e.w, e.ty + e.h - Math.random() * 0.5, { vz: 0.4, life: 1, s: 0.2, c: '190,170,130' });
      }
    }
    // Glühwürmchen in der Nacht
    if (this.q.fireflies && this.night > 0.5 && R(0.4)) {
      const x = this.cam.x + Math.random() * this.w / this.scale, y = this.cam.y + Math.random() * this.h / this.scale;
      const i = Math.floor(y) * g.W + Math.floor(x);
      if (g.terrain[i] === T.GRASS && g.vis[i] === 2) this.emit('fly', x, y, { z: 0.3 + Math.random() * 0.5, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.3, life: 4, s: 0.05 });
    }
  }

  updateParts(dt) {
    const ps = this.parts;
    let j = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.g * dt; p.rot += p.vr * dt;
      if (p.z < 0 && p.g > 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.5; p.vy *= 0.5; p.vr *= 0.5; }
      if (p.k === 'smoke') { p.vx *= 0.99; p.s += dt * 0.25; }
      else if (p.k === 'dust') { p.vx *= 0.93; p.vy *= 0.93; p.s += dt * 0.2; }
      else if (p.k === 'fly') { p.vx += (Math.random() - 0.5) * dt; p.vy += (Math.random() - 0.5) * dt; }
      ps[j++] = p;
    }
    ps.length = j;
  }

  drawParts() {
    const c = this.ctx, s = this.scale, tm = this.time;
    for (const p of this.parts) {
      if (!this.inView(p.x, p.y, 1)) continue;
      const [sx, sy0] = this.toScreen(p.x, p.y), sy = sy0 - p.z * s, k = p.t / p.life;
      switch (p.k) {
        case 'dust': c.fillStyle = `rgba(${p.c},${0.35 * (1 - k)})`; c.beginPath(); c.arc(sx, sy, p.s * s, 0, 7); c.fill(); break;
        case 'smoke': c.fillStyle = `rgba(${p.c},${0.42 * (1 - k) * Math.min(1, p.t * 3)})`; c.beginPath(); c.arc(sx, sy, p.s * s, 0, 7); c.fill(); break;
        case 'fire': {
          c.globalCompositeOperation = 'lighter';
          const r = p.s * s * (1 - k * 0.7);
          c.fillStyle = `rgba(255,${(150 + 80 * (1 - k)) | 0},50,${0.75 * (1 - k)})`; c.beginPath(); c.arc(sx, sy, r, 0, 7); c.fill();
          c.fillStyle = `rgba(255,240,170,${0.6 * (1 - k)})`; c.beginPath(); c.arc(sx, sy + r * 0.2, r * 0.45, 0, 7); c.fill();
          c.globalCompositeOperation = 'source-over';
          break;
        }
        case 'spark': c.strokeStyle = `rgba(255,${200 + (55 * (1 - k)) | 0},120,${1 - k})`; c.lineWidth = Math.max(1, s * 0.03); c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx - p.vx * s * 0.03, sy + p.vz * s * 0.03); c.stroke(); break;
        case 'blood': c.fillStyle = `rgba(140,20,20,${0.9 * (1 - k)})`; c.beginPath(); c.arc(sx, sy, Math.max(1, p.s * s), 0, 7); c.fill(); break;
        case 'debris': case 'chip':
          c.save(); c.translate(sx, sy); c.rotate(p.rot); c.globalAlpha = Math.min(1, (1 - k) * 2);
          c.fillStyle = p.c; c.fillRect(-p.s * s, -p.s * s * 0.6, p.s * s * 2, p.s * s * 1.2);
          c.restore(); break;
        case 'glint': {
          const r = p.s * s * Math.sin(k * Math.PI);
          c.fillStyle = `rgba(255,240,150,${1 - k})`;
          c.beginPath(); c.moveTo(sx, sy - r); c.lineTo(sx + r * 0.25, sy); c.lineTo(sx, sy + r); c.lineTo(sx - r * 0.25, sy); c.fill();
          c.beginPath(); c.moveTo(sx - r, sy); c.lineTo(sx, sy + r * 0.25); c.lineTo(sx + r, sy); c.lineTo(sx, sy - r * 0.25); c.fill();
          break;
        }
        case 'heal': { const r = p.s * s; c.fillStyle = `rgba(120,255,140,${1 - k})`; c.fillRect(sx - r, sy - r * 0.25, r * 2, r * 0.5); c.fillRect(sx - r * 0.25, sy - r, r * 0.5, r * 2); break; }
        case 'ring': c.strokeStyle = `rgba(230,210,170,${0.6 * (1 - k)})`; c.lineWidth = Math.max(1, s * 0.06 * (1 - k)); c.beginPath(); c.ellipse(sx, sy, p.s * s * k, p.s * s * k * 0.5, 0, 0, 7); c.stroke(); break;
        case 'fly': {
          const a = (0.5 + 0.5 * Math.sin(tm * 6 + p.rot * 3)) * Math.sin(k * Math.PI) * this.night;
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = a; c.drawImage(this.lightCool, sx - s * 0.25, sy - s * 0.25, s * 0.5, s * 0.5);
          c.fillStyle = '#eaffb0'; c.fillRect(sx - 1, sy - 1, 2, 2);
          c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
          break;
        }
      }
    }
  }

  // ---------- Tageszeit ----------
  updateSun() {
    const g = this.g;
    if (!this.dayNight) { this.night = 0; this.tint = null; this.sun = this.q.shadows ? { k: 0.45, sq: 0.55, a: 0.3 } : null; return; }
    const tod = ((g.time + DAY_LEN * 0.3) / DAY_LEN) % 1;
    const el = Math.sin((tod - 0.25) * Math.PI * 2);
    const night = clamp01((0.12 - el) / 0.42);
    const dusk = clamp01(1 - Math.abs(el - 0.05) / 0.22) * (1 - night * 0.5);
    this.night = night;
    const r = lerp(255, 92, night), gg = lerp(255, 108, night) - dusk * 55, b = lerp(255, 168, night) - dusk * 95;
    this.tint = night > 0.01 || dusk > 0.01 ? `rgb(${r | 0},${Math.max(0, gg) | 0},${Math.max(0, b) | 0})` : null;
    // Schatten: morgens nach links, abends nach rechts, länger bei tiefer Sonne
    const dayFrac = clamp01((tod - 0.22) / 0.56);
    const len = 0.45 + (1 - clamp01(el)) * 0.8;
    this.sun = this.q.shadows ? { k: lerp(-0.9, 0.9, dayFrac) * len, sq: 0.35 + 0.25 * clamp01(el), a: 0.27 * (1 - night) } : null;
    this.tod = tod;
  }

  // ---------- Hauptzeichnung ----------
  draw(alpha, ui, dt = 0.016) {
    const g = this.g, c = this.ctx, s = this.scale;
    this.time += dt;
    const time = this.time;
    this.updateSun();
    this.updateAmbient(dt);
    this.updateParts(dt);
    // Kamerawackeln bei Einschlägen
    let shx = 0, shy = 0;
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); const m = this.shake * 6; shx = (Math.random() - 0.5) * m; shy = (Math.random() - 0.5) * m; }
    c.setTransform(this.dpr, 0, 0, this.dpr, shx * this.dpr, shy * this.dpr);
    c.imageSmoothingEnabled = true;
    c.fillStyle = '#0d0a08'; c.fillRect(-10, -10, this.w + 20, this.h + 20);

    // Terrain
    const [tx0, ty0] = this.toScreen(0, 0);
    c.drawImage(this.terrainCv, tx0, ty0, g.W * s, g.H * s);
    if (this.q.grain && s > 28) {
      c.save(); c.translate(tx0, ty0); c.scale(s / 64, s / 64);
      c.globalAlpha = Math.min(1, (s - 28) / 20) * 0.8;
      c.fillStyle = this.grainPat;
      c.fillRect((this.cam.x * 64) - 64, (this.cam.y * 64) - 64, this.w / s * 64 + 128, this.h / s * 64 + 128);
      c.restore();
    }
    const x0 = Math.max(0, Math.floor(this.cam.x) - 1), y0 = Math.max(0, Math.floor(this.cam.y) - 1);
    const x1 = Math.min(g.W - 1, Math.ceil(this.cam.x + this.w / s)), y1 = Math.min(g.H - 1, Math.ceil(this.cam.y + this.h / s + 1));
    const W = g.W, vis = g.vis;
    // Wasser glitzert, Schaum am Ufer
    if (this.q.waterFx) this.drawWater(x0, y0, x1, y1, time);
    // Bodendetails
    const dec = this.decor, decQ = this.q.decor;
    if (s > 14) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x, k = dec[i];
      if (!k || !vis[i]) continue;
      if (decQ < 1 && h2(i, 5, 1) > decQ) continue;
      const id = g.occ[i];
      if (id) { const e = g.ents.get(id); if (e && (e.cls === 'r' || (e.cls === 'b' && e.type !== 'farm'))) continue; }
      const ox = (h2(i, 8, 2) - 0.5) * 0.5, oy = (h2(i, 9, 2) - 0.5) * 0.4;
      this.drawSprite(this.decorSprite(k), x + ox, y + oy);
    }
    // Bodeneffekte
    this.drawDecals(time);
    // Sichtbare Objekte sammeln
    const list = [], sel = ui.selSet;
    for (const e of g.ents.values()) {
      if (e.cls === 'u') {
        if (!this.inView(e.x, e.y, 2)) continue;
        if (e.owner !== 0 && vis[Math.floor(e.y) * W + Math.floor(e.x)] !== 2) continue;
        list.push(e);
      } else {
        if (!this.inView(e.x, e.y, e.w + 3)) continue;
        if (e.cls === 'b') {
          if (!e.seen && e.owner !== 0) continue;
          if (e.type === 'farm') { this.drawFarm(e, sel.has(e.id), time); list.push(e); continue; }
        } else if (!vis[e.ty * W + e.tx]) continue;
        list.push(e);
      }
    }
    list.sort((a, b) => (a.cls === 'u' ? a.y : a.ty + a.h - 0.3) - (b.cls === 'u' ? b.y : b.ty + b.h - 0.3));
    this.emitters(dt, list);
    // Schatten
    const lights = [];
    if (this.sun && this.sun.a > 0.01) this.drawShadows(list, alpha);
    // Objekte
    for (const e of list) {
      if (e.cls === 'u') this.drawUnit(e, alpha, sel.has(e.id), time, lights);
      else if (e.cls === 'b') { if (e.type !== 'farm') this.drawBuilding(e, sel.has(e.id), time, lights); }
      else this.drawRes(e, sel.has(e.id), time);
    }
    this.drawProjectiles(lights);
    this.drawParts();
    // Wolkenschatten
    if (this.q.clouds && (1 - this.night) > 0.1) this.drawClouds();
    // Nacht und Lichter
    if (this.tint) {
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = this.tint; c.fillRect(-10, -10, this.w + 20, this.h + 20);
      c.globalCompositeOperation = 'source-over';
    }
    if (this.night > 0.05) this.drawLights(lights, time);
    // Vögel und ihre Schatten
    if (this.q.birds) this.drawBirds(time);
    // Nebel des Krieges
    this.drawFog();
    if (this.q.vignette) this.drawVignette();
    // Lebensbalken und Auswahl
    for (const e of list) {
      if (e.cls === 'r') continue;
      const isSel = sel.has(e.id);
      if (isSel || (e.hp < e.maxHp && (e.cls === 'u' || e.done))) this.hpBar(e, isSel);
    }
    if (ui.rallyOf) {
      const b = g.ents.get(ui.rallyOf);
      if (b && b.rally) {
        const [ax, ay] = this.toScreen(b.x, b.y), [bx, by] = this.toScreen(b.rally.x, b.rally.y);
        c.strokeStyle = 'rgba(255,255,255,0.6)'; c.setLineDash([6, 6]); c.lineDashOffset = -time * 20; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); c.setLineDash([]);
        this.drawFlag(bx, by, s * 0.9, this.g.players[0].color, time);
      }
    }
    this.drawMarkers();
    if (ui.ghost) this.drawGhost(ui.ghost);
    if (ui.box) {
      const b = ui.box;
      c.fillStyle = 'rgba(120,200,255,0.12)'; c.strokeStyle = 'rgba(160,220,255,0.9)'; c.lineWidth = 1.5;
      c.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
      c.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    }
  }

  drawWater(x0, y0, x1, y1, time) {
    const g = this.g, c = this.ctx, s = this.scale, W = g.W, ter = g.terrain, vis = g.vis;
    c.lineCap = 'round';
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (ter[i] !== T.WATER || !vis[i]) continue;
      const r = h2(i, 1, 1);
      if (r > 0.55) continue;
      const a = Math.sin(time * (0.8 + r) + r * 40);
      if (a < 0.4) continue;
      const [sx, sy] = this.toScreen(x + h2(i, 2, 1), y + h2(i, 3, 1));
      c.strokeStyle = `rgba(230,245,255,${(a - 0.4) * 0.6})`; c.lineWidth = Math.max(1, s * 0.035);
      c.beginPath(); c.moveTo(sx - s * 0.12, sy); c.quadraticCurveTo(sx, sy - s * 0.04, sx + s * 0.12, sy); c.stroke();
    }
    const sh = this.shore;
    c.lineWidth = Math.max(1, s * 0.05);
    for (let k = 0; k < sh.length; k += 3) {
      const i = sh[k], x = i % W, y = (i / W) | 0;
      if (x < x0 || x > x1 || y < y0 || y > y1 || !vis[i]) continue;
      const dx = sh[k + 1], dy = sh[k + 2];
      const ph = Math.sin(time * 1.2 + x * 0.7 + y * 0.9);
      const off = 0.38 + ph * 0.07;
      const cx = x + 0.5 + dx * off, cy = y + 0.5 + dy * off;
      const [sx, sy] = this.toScreen(cx, cy);
      c.strokeStyle = `rgba(255,255,255,${0.18 + 0.14 * (ph + 1) / 2})`;
      c.beginPath();
      if (dx) { c.moveTo(sx, sy - s * 0.42); c.quadraticCurveTo(sx - dx * s * 0.06, sy, sx, sy + s * 0.42); }
      else { c.moveTo(sx - s * 0.42, sy); c.quadraticCurveTo(sx, sy - dy * s * 0.06, sx + s * 0.42, sy); }
      c.stroke();
    }
  }

  drawDecals(time) {
    const g = this.g, c = this.ctx, s = this.scale, W = g.W, vis = g.vis;
    for (const d of g.decals) {
      if (!this.inView(d.x, d.y, 3)) continue;
      const [sx, sy] = this.toScreen(d.x, d.y);
      if (d.k === 'rubble') {
        const a = Math.max(0, 1 - d.t / 40);
        for (let k = 0; k < d.w * d.h * 4; k++) {
          const px = sx + hash(k, d.x | 0) * d.w * s, py = sy + hash(d.y | 0, k) * d.h * s;
          c.fillStyle = `rgba(${k % 3 ? '90,72,52' : '130,110,88'},${0.85 * a})`;
          c.fillRect(px, py, s * (0.12 + hash(k, 3) * 0.18), s * (0.08 + hash(3, k) * 0.12));
        }
        c.fillStyle = `rgba(30,25,20,${0.35 * a})`; c.fillRect(sx, sy, d.w * s, d.h * s);
        if (d.t < 12 && this.q.particles > 200 && Math.random() < 0.05 * d.w) this.emit('smoke', d.x + Math.random() * d.w, d.y + Math.random() * d.h, { vz: 0.5, vx: 0.2, life: 2.5, s: 0.25, c: '60,55,50' });
      } else if (d.k === 'stump') {
        if (!vis[Math.floor(d.y) * W + Math.floor(d.x)]) continue;
        const a = Math.min(1, (400 - d.t) / 30);
        c.globalAlpha = a;
        c.fillStyle = OUT; c.beginPath(); c.ellipse(sx, sy + s * 0.2, s * 0.15, s * 0.08, 0, 0, 7); c.fill();
        c.fillStyle = '#6a4424'; c.fillRect(sx - s * 0.12, sy + s * 0.08, s * 0.24, s * 0.12);
        c.fillStyle = '#d9b07a'; c.beginPath(); c.ellipse(sx, sy + s * 0.08, s * 0.12, s * 0.06, 0, 0, 7); c.fill();
        c.globalAlpha = 1;
      } else if (vis[Math.floor(d.y) * W + Math.floor(d.x)] === 2 || d.owner === 0) {
        const a = Math.max(0, 1 - d.t / 20);
        c.fillStyle = `rgba(110,20,20,${0.5 * a})`; c.beginPath(); c.ellipse(sx, sy + s * 0.1, s * 0.32, s * 0.15, 0, 0, 7); c.fill();
        if (d.type && UNIT_DRAW[d.type]) {
          const col = this.g.players[d.owner] ? this.g.players[d.owner].color : '#888';
          const sp = this.unitSprite(d.type, col, 'idle', 0);
          const sc = s / SPRU;
          c.save(); c.globalAlpha = 0.85 * a; c.translate(sx, sy + s * 0.05);
          c.rotate(UNITS[d.type].cls === 'siege' ? 0.25 : -Math.PI / 2 * ((d.x * 10 | 0) % 2 ? 1 : -1));
          c.drawImage(sp.c, -sp.bw / 2 * s, -sp.bh * s * 0.6, sp.bw * SPRU * sc, sp.c.height * sc);
          c.restore();
        }
      }
    }
  }

  drawShadows(list, alpha) {
    const c = this.ctx, s = this.scale, sun = this.sun;
    for (const e of list) {
      if (e.cls === 'u') {
        const d = UNITS[e.type];
        const x = e.px + (e.x - e.px) * alpha, y = e.py + (e.y - e.py) * alpha;
        const [sx, sy] = this.toScreen(x, y);
        const h = (UNIT_BOX[e.type] || [1, 1])[1];
        c.fillStyle = `rgba(0,0,0,${sun.a * 0.9})`;
        c.beginPath(); c.ellipse(sx + sun.k * h * s * 0.35, sy + s * 0.02, d.r * s * 1.1 + Math.abs(sun.k) * h * s * 0.3, d.r * s * 0.5, 0, 0, 7); c.fill();
      } else if (e.cls === 'b') {
        if (e.type === 'farm') continue;
        const sp = e.type === 'wall' ? this.buildingSprite('wall', e.owner, this.wallMask(e)) : this.buildingSprite(e.type, e.owner);
        if (!e.done && e.prog < 0.3) continue;
        this.drawShadow(sp, e.tx, e.ty, e.ty + e.h - 0.15, e.done ? 1 : e.prog);
      } else if (e.kind === 'tree' || e.kind === 'gold' || e.kind === 'clay') {
        this.drawShadow(this.resSprite(e), e.tx, e.ty, e.ty + 0.85, e.kind === 'tree' ? 0.8 : 0.6);
      }
    }
  }

  drawRes(e, isSel, time) {
    const c = this.ctx, s = this.scale;
    const sp = this.resSprite(e);
    if (isSel) this.selRing(e);
    if (e.kind === 'tree') {
      if (this.q.sway) {
        const sway = Math.sin(time * 1.3 + e.v * 0.37 + e.tx * 0.2) * 0.035;
        const [bx, by] = this.toScreen(e.tx + 0.5, e.ty + 0.85);
        c.save(); c.translate(bx, by); c.transform(1, 0, sway, 1, 0, 0);
        c.drawImage(sp.c, -0.5 * s, -(0.85 + sp.top) * s, s, (1 + sp.top) * s);
        c.restore();
      } else this.drawSprite(sp, e.tx, e.ty);
      return;
    }
    const scaleF = 0.55 + 0.45 * Math.min(1, e.amount / e.max);
    if (scaleF < 0.999) {
      const cx = e.tx + 0.5, by = e.ty + 1;
      const [sx, sy] = this.toScreen(cx - 0.5 * scaleF, by - scaleF), sc = s * scaleF;
      c.drawImage(sp.c, sx, sy - sp.top * sc, sc, (1 + sp.top) * sc);
    } else this.drawSprite(sp, e.tx, e.ty);
    if (e.kind === 'gold' && this.q.waterFx) {
      const ph = (time * 0.7 + e.v * 0.13) % 3;
      if (ph < 0.4) {
        const [sx, sy] = this.toScreen(e.tx + 0.25 + hash(e.v, 1) * 0.5, e.ty + 0.1 + hash(1, e.v) * 0.5);
        const r = s * 0.12 * Math.sin(ph / 0.4 * Math.PI);
        c.fillStyle = 'rgba(255,250,200,0.9)';
        c.beginPath(); c.moveTo(sx, sy - r); c.lineTo(sx + r * 0.2, sy); c.lineTo(sx, sy + r); c.lineTo(sx - r * 0.2, sy); c.fill();
        c.beginPath(); c.moveTo(sx - r, sy); c.lineTo(sx, sy + r * 0.2); c.lineTo(sx + r, sy); c.lineTo(sx, sy - r * 0.2); c.fill();
      }
    }
  }

  selRing(e) {
    const c = this.ctx, s = this.scale, [sx, sy] = this.toScreen(e.tx, e.ty);
    const col = e.cls === 'r' ? '#ffe680' : e.owner === 0 ? '#7dff7d' : '#ff6a5a';
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 4;
    c.beginPath(); c.ellipse(sx + e.w * s / 2, sy + e.h * s * 0.6, e.w * s * 0.64, e.h * s * 0.44, 0, 0, 7); c.stroke();
    c.strokeStyle = col; c.lineWidth = 2;
    c.beginPath(); c.ellipse(sx + e.w * s / 2, sy + e.h * s * 0.6, e.w * s * 0.64, e.h * s * 0.44, 0, 0, 7); c.stroke();
  }

  drawFarm(b, isSel, time) {
    const f = b.done ? b.food / BUILDINGS.farm.food : 0;
    const stage = !b.done ? 0 : f > 0.66 ? 3 : f > 0.33 ? 2 : 1;
    const sp = this.farmSprite(b.owner, stage);
    this.drawSprite(sp, b.tx, b.ty, b.done ? 1 : 0.5 + b.prog * 0.5);
    if (isSel) this.selRing(b);
  }

  wallMask(b) {
    const g = this.g;
    let m = 0;
    const is = (x, y) => { const e = g.entAt(x, y); return e && e.cls === 'b' && e.type === 'wall' && e.owner === b.owner; };
    if (is(b.tx + 1, b.ty)) m |= 1; if (is(b.tx - 1, b.ty)) m |= 2; if (is(b.tx, b.ty + 1)) m |= 4; if (is(b.tx, b.ty - 1)) m |= 8;
    return m;
  }

  drawFlag(x, y, size, col, time) {
    const c = this.ctx;
    c.strokeStyle = OUT; c.lineWidth = Math.max(1.5, size * 0.06);
    c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - size); c.stroke();
    this.flagCloth(x, y - size, size * 0.55, size * 0.32, col, time);
  }
  flagCloth(x, y, w, h, col, time) {
    const c = this.ctx, n = 6;
    c.fillStyle = col; c.strokeStyle = OUT; c.lineWidth = Math.max(1, h * 0.08);
    c.beginPath(); c.moveTo(x, y);
    for (let i = 1; i <= n; i++) { const t = i / n; c.lineTo(x + w * t, y + Math.sin(time * 5 - t * 4 + x * 0.01) * h * 0.18 * t); }
    for (let i = n; i >= 0; i--) { const t = i / n; c.lineTo(x + w * t, y + h + Math.sin(time * 5 - t * 4 + x * 0.01) * h * 0.18 * t); }
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.2)'; c.fillRect(x, y + h * 0.1, w * 0.25, h * 0.3);
  }

  drawBuilding(b, isSel, time, lights) {
    const c = this.ctx, s = this.scale;
    const col = this.g.players[b.owner].color;
    if (isSel) this.selRing(b);
    const sp = b.type === 'wall' ? this.buildingSprite('wall', b.owner, this.wallMask(b)) : this.buildingSprite(b.type, b.owner);
    if (!b.done) {
      this.drawSprite(this.foundationSprite(b.w, b.h), b.tx, b.ty);
      if (b.prog > 0.02) this.drawSprite(sp, b.tx, b.ty, 0.92, 0.12 + 0.88 * b.prog);
      return;
    }
    this.drawSprite(sp, b.tx, b.ty);
    const A = sp.A;
    for (const [fx, fy] of A.flags) {
      const [sx, sy] = this.toScreen(b.tx + fx, b.ty + fy);
      this.flagCloth(sx, sy, s * 0.5, s * 0.3, col, time + b.id);
    }
    if (A.mill) {
      const [cx, cy] = this.toScreen(b.tx + A.mill[0], b.ty + A.mill[1]);
      const r = s * 0.95, a = time * 1.2 + b.id;
      for (let k = 0; k < 4; k++) {
        const an = a + (k * Math.PI) / 2;
        c.save(); c.translate(cx, cy); c.rotate(an);
        c.fillStyle = OUT; c.fillRect(0, -s * 0.04, r, s * 0.08);
        c.fillStyle = '#6b4a2b'; c.fillRect(0, -s * 0.025, r, s * 0.05);
        c.fillStyle = 'rgba(245,235,215,0.92)'; c.fillRect(r * 0.25, 0, r * 0.72, s * 0.22);
        c.strokeStyle = 'rgba(90,60,30,0.6)'; c.lineWidth = 1; c.strokeRect(r * 0.25, 0, r * 0.72, s * 0.22);
        c.restore();
      }
      c.fillStyle = '#3a2a1a'; c.beginPath(); c.arc(cx, cy, s * 0.09, 0, 7); c.fill();
    }
    for (const [fx, fy, fs] of A.fire) {
      const [sx, sy] = this.toScreen(b.tx + fx, b.ty + fy);
      const fl = 0.8 + Math.sin(time * 13 + fx * 7) * 0.12 + Math.sin(time * 23 + fy) * 0.08;
      c.fillStyle = 'rgba(255,150,40,0.85)'; c.beginPath(); c.ellipse(sx, sy - s * 0.04 * fs, s * 0.06 * fs * fl, s * 0.11 * fs * fl, 0, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,240,170,0.9)'; c.beginPath(); c.ellipse(sx, sy - s * 0.02 * fs, s * 0.03 * fs * fl, s * 0.06 * fs * fl, 0, 0, 7); c.fill();
    }
    if (b.type === 'monument') {
      const [sx, sy] = this.toScreen(b.x, b.ty - 0.6);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.25 + Math.sin(time * 2) * 0.1;
      c.drawImage(this.lightSpr, sx - s * 3, sy - s * 3, s * 6, s * 6);
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      if (Math.random() < 0.15) this.emit('glint', b.tx + 1.5 + Math.random() * 2, b.ty - 1 + Math.random() * 1.5, { z: 0.5, vz: 0.6, life: 0.8, s: 0.12 });
    }
    // Lichtquellen für die Nacht
    if (this.night > 0.05 && lights) {
      for (const [lx, ly, li] of A.lights) lights.push(b.tx + lx, b.ty + ly, li, b.id);
      if (b.hp < b.maxHp * 0.6) lights.push(b.x, b.ty + b.h * 0.6, 2.4, b.id);
    }
  }

  drawUnit(u, alpha, isSel, time, lights) {
    const c = this.ctx, s = this.scale, d = UNITS[u.type];
    const x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha;
    const [sx, sy] = this.toScreen(x, y);
    const col = this.g.players[u.owner].color;
    const r = d.r;
    // Bodenring in Spielerfarbe
    c.strokeStyle = isSel ? (u.owner === 0 ? '#7dff7d' : '#ff6a5a') : col;
    c.globalAlpha = isSel ? 1 : 0.55; c.lineWidth = isSel ? 2 : 1.5;
    c.beginPath(); c.ellipse(sx, sy + s * 0.02, (r + 0.08) * s, (r + 0.08) * s * 0.5, 0, 0, 7); c.stroke();
    c.globalAlpha = 1;
    // Bild wählen
    let k = 'idle', i = 0;
    if (u.atkT > 0) { k = 'atk'; i = Math.min(2, Math.floor((0.35 - u.atkT) / 0.35 * 3)); }
    else if (u.work && (u.type === 'worker' || u.type === 'priest')) { k = 'work'; i = [0, 1, 2, 1][Math.floor(time * 7 + u.id) % 4]; }
    else if (u.moving) { k = 'walk'; i = Math.floor(u.walk * 0.55) % 4; }
    const sp = this.unitSprite(u.type, col, k, i);
    const face = Math.cos(u.dir) >= 0 ? 1 : -1;
    const sc = s / SPRU;
    c.save(); c.translate(sx, sy); c.scale(face * sc, sc);
    c.drawImage(sp.c, -sp.bw / 2 * SPRU, -sp.bh * SPRU);
    c.restore();
    // getroffen: kurzes Aufblitzen
    if (u.hitT && this.g.time - u.hitT < 0.12) {
      c.fillStyle = 'rgba(255,80,60,0.35)'; c.beginPath(); c.ellipse(sx, sy - s * sp.bh * 0.4, s * r * 1.1, s * sp.bh * 0.45, 0, 0, 7); c.fill();
    }
    if (u.type === 'priest') {
      const f = u.healT > 0 ? 0.6 + Math.sin(time * 12) * 0.25 : 0.25 + this.night * 0.3;
      const [ox, oy] = [sx + face * 0.2 * s, sy - (u.work ? 0.95 : 0.83) * s];
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = f;
      c.drawImage(this.lightCool, ox - s * 0.35, oy - s * 0.35, s * 0.7, s * 0.7);
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      if (u.healT > 0 && u.healId) {
        const t = this.g.ents.get(u.healId);
        if (t) {
          const [tx2, ty2] = this.toScreen(t.x, t.y - 0.4);
          c.strokeStyle = `rgba(140,255,160,${0.25 + Math.sin(time * 10) * 0.15})`; c.lineWidth = Math.max(1, s * 0.05);
          c.beginPath(); c.moveTo(ox, oy); c.quadraticCurveTo((ox + tx2) / 2, Math.min(oy, ty2) - s * 0.5, tx2, ty2); c.stroke();
        }
      }
    }
    if (u.type === 'worker' && u.carryN > 0.5) {
      const cc = { food: '#d4364a', wood: '#8a5a33', gold: '#f2c230', clay: '#c06a3c' }[u.carry] || '#888';
      const bx = sx - face * s * 0.2, by = sy - s * 0.48;
      c.fillStyle = OUT; c.fillRect(bx - s * 0.09, by - s * 0.09, s * 0.18, s * 0.16);
      c.fillStyle = cc; c.fillRect(bx - s * 0.075, by - s * 0.075, s * 0.15, s * 0.13);
      c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(bx - s * 0.075, by - s * 0.075, s * 0.15, s * 0.04);
    }
    if (this.night > 0.4 && lights && u.owner === 0 && (u.type === 'worker' || d.cls === 'siege')) lights.push(x, y - 0.3, 0.7, u.id);
  }

  hpBar(e, isSel) {
    const c = this.ctx, s = this.scale;
    let x, y, w;
    if (e.cls === 'u') { const bh = (UNIT_BOX[e.type] || [1, 1.1])[1]; x = e.x; y = e.y - bh * 0.95; w = Math.min(0.9, 0.5 + UNITS[e.type].r); }
    else { x = e.x; y = e.ty - (BUILD_TOP[e.type] || 0) * 0.6 - 0.1; w = Math.min(2.4, e.w * 0.7); }
    const [sx, sy] = this.toScreen(x, y);
    const bw = Math.max(18, w * s), bh = Math.max(3, s * 0.1);
    const f = Math.max(0, e.hp / e.maxHp);
    c.fillStyle = 'rgba(0,0,0,0.65)'; c.fillRect(sx - bw / 2 - 1, sy - 1, bw + 2, bh + 2);
    let col = f > 0.6 ? '#4ade4a' : f > 0.3 ? '#e8c23a' : '#e5483b';
    if (e.owner !== 0) col = f > 0.3 ? '#e5574a' : '#a8281e';
    c.fillStyle = col; c.fillRect(sx - bw / 2, sy, bw * f, bh);
    c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(sx - bw / 2, sy, bw * f, bh * 0.4);
    if (e.cls === 'b' && !e.done) { c.fillStyle = '#7fc8ff'; c.fillRect(sx - bw / 2, sy + bh + 1, bw * e.prog, Math.max(2, bh * 0.6)); }
    if (e.cls === 'b' && e.queue && e.queue.length && e.owner === 0 && isSel) {
      const q = e.queue[0];
      if (q.k === 'u') { c.fillStyle = '#ffd36a'; c.fillRect(sx - bw / 2, sy + bh + 1, bw * Math.min(1, q.t / this.g.trainTime(e.owner, q.key)), Math.max(2, bh * 0.6)); }
    }
  }

  drawProjectiles(lights) {
    const c = this.ctx, s = this.scale, g = this.g;
    for (const p of g.projectiles) {
      if (!this.inView(p.x, p.y, 1)) continue;
      if (g.vis[Math.floor(p.y) * g.W + Math.floor(p.x)] !== 2) continue;
      const total = p.d0, done = Math.hypot(p.x - p.sx, p.y - p.sy), k = Math.min(1, done / total);
      const kind = p.kind || (p.stone ? 'stone' : 'arrow');
      const peak = kind === 'stone' ? Math.min(3, total * 0.3) : kind === 'bolt' ? Math.min(0.5, total * 0.05) : Math.min(1.3, total * 0.13);
      const hgt = Math.sin(k * Math.PI) * peak + 0.3 * (1 - k);
      const [gx, gy] = this.toScreen(p.x, p.y);
      const [hx, hy] = this.toScreen(p.x, p.y - hgt);
      c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(gx, gy + s * 0.2, s * (kind === 'stone' ? 0.16 : 0.08), s * 0.04, 0, 0, 7); c.fill();
      if (kind === 'stone') {
        c.save(); c.translate(hx, hy); c.rotate(this.time * 8);
        c.fillStyle = OUT; c.beginPath(); c.arc(0, 0, s * 0.18, 0, 7); c.fill();
        c.fillStyle = '#8a857c'; c.beginPath(); c.arc(0, 0, s * 0.155, 0, 7); c.fill();
        c.fillStyle = '#b5b0a6'; c.beginPath(); c.arc(-s * 0.05, -s * 0.05, s * 0.06, 0, 7); c.fill();
        c.restore();
        continue;
      }
      // Flugrichtung aus der Bahnsteigung
      const dir = p.dir || 0;
      const vx = Math.cos(dir), vy = Math.sin(dir) - Math.cos(k * Math.PI) * peak * Math.PI / Math.max(1, total) * 0.9;
      const a = Math.atan2(vy, vx);
      const len = s * (kind === 'bolt' ? 0.55 : kind === 'jav' ? 0.6 : 0.4);
      c.save(); c.translate(hx, hy); c.rotate(a);
      if (this.q.particles > 200) { c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = Math.max(1, s * 0.03); c.beginPath(); c.moveTo(-len * 1.6, 0); c.lineTo(-len / 2, 0); c.stroke(); }
      c.strokeStyle = OUT; c.lineWidth = Math.max(1.5, s * (kind === 'arrow' ? 0.06 : 0.09));
      c.beginPath(); c.moveTo(-len / 2, 0); c.lineTo(len / 2, 0); c.stroke();
      c.strokeStyle = kind === 'jav' ? '#a07848' : '#c8a878'; c.lineWidth = Math.max(1, s * (kind === 'arrow' ? 0.035 : 0.06));
      c.beginPath(); c.moveTo(-len / 2, 0); c.lineTo(len / 2, 0); c.stroke();
      c.fillStyle = '#d8dde4'; c.beginPath(); c.moveTo(len / 2 + s * 0.1, 0); c.lineTo(len / 2 - s * 0.02, -s * 0.05); c.lineTo(len / 2 - s * 0.02, s * 0.05); c.fill();
      if (kind !== 'jav') { c.fillStyle = '#f4ead7'; c.beginPath(); c.moveTo(-len / 2, 0); c.lineTo(-len / 2 - s * 0.08, -s * 0.06); c.lineTo(-len / 2 + s * 0.06, 0); c.lineTo(-len / 2 - s * 0.08, s * 0.06); c.fill(); }
      c.restore();
      if (this.night > 0.3 && lights && kind === 'bolt') lights.push(p.x, p.y - hgt, 0.5, 0);
    }
  }

  drawClouds() {
    const c = this.ctx, s = this.scale;
    c.globalAlpha = 0.5 * (1 - this.night);
    for (const cl of this.clouds) {
      if (!this.inView(cl.x + cl.s, cl.y + cl.s * 0.3, cl.s * 2)) continue;
      const [sx, sy] = this.toScreen(cl.x, cl.y);
      c.drawImage(this.cloudSpr, sx, sy, cl.s * 2 * s, cl.s * 1.25 * s);
    }
    c.globalAlpha = 1;
  }

  drawLights(L, time) {
    const c = this.ctx, s = this.scale, n = this.night, g = this.g;
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < L.length; i += 4) {
      const x = L[i], y = L[i + 1], k = L[i + 2], id = L[i + 3];
      if (!this.inView(x, y, 3)) continue;
      const fl = 0.85 + Math.sin(time * 9 + id * 1.7 + i) * 0.08 + Math.sin(time * 17 + i) * 0.05;
      const r = s * (0.6 + k * 0.7) * fl;
      const [sx, sy] = this.toScreen(x, y);
      c.globalAlpha = Math.min(1, n * 0.55 * Math.min(1.3, k));
      c.drawImage(this.lightSpr, sx - r, sy - r, r * 2, r * 2);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    void g;
  }

  drawBirds(time) {
    const c = this.ctx, s = this.scale;
    for (const f of this.birds) for (const b of f.b) {
      const x = f.x + b.ox * Math.sign(f.vx || 1), y = f.y + b.oy;
      if (!this.inView(x, y, 4)) continue;
      const [gx, gy] = this.toScreen(x + 2.5, y + 3.5);
      c.fillStyle = `rgba(0,0,0,${0.15 * (1 - this.night)})`; c.beginPath(); c.ellipse(gx, gy, s * 0.12, s * 0.05, 0, 0, 7); c.fill();
      const [sx, sy] = this.toScreen(x, y);
      const fl = Math.sin(time * 10 + b.ph) * s * 0.12;
      c.strokeStyle = this.night > 0.5 ? 'rgba(40,40,60,0.8)' : 'rgba(40,30,25,0.85)'; c.lineWidth = Math.max(1.2, s * 0.045); c.lineCap = 'round';
      c.beginPath(); c.moveTo(sx - s * 0.2, sy - fl); c.quadraticCurveTo(sx - s * 0.08, sy - s * 0.05, sx, sy); c.quadraticCurveTo(sx + s * 0.08, sy - s * 0.05, sx + s * 0.2, sy - fl); c.stroke();
    }
  }

  drawFog() {
    const g = this.g, c = this.ctx;
    if (g.revealAll) return;
    const now = performance.now();
    if (now - this.fogT > 120) {
      this.fogT = now;
      const vis = g.vis, W = g.W, H = g.H, f = this.fogF, d = this.fogImg.data;
      for (let i = 0; i < vis.length; i++) f[i] = vis[i] === 2 ? 0 : vis[i] === 1 ? 0.48 : 1;
      // weicher Rand: 3x3 Mittelung
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let sum = f[i] * 4, n = 4;
        if (x > 0) { sum += f[i - 1]; n++; } if (x < W - 1) { sum += f[i + 1]; n++; }
        if (y > 0) { sum += f[i - W]; n++; } if (y < H - 1) { sum += f[i + W]; n++; }
        const v = Math.max(f[i] * 0.6, sum / n), k = i * 4;
        d[k] = 10; d[k + 1] = 10; d[k + 2] = 16; d[k + 3] = v * 255;
      }
      this.fogSmallCtx.putImageData(this.fogImg, 0, 0);
    }
    const [sx, sy] = this.toScreen(0, 0), s = this.scale;
    c.imageSmoothingEnabled = true;
    c.drawImage(this.fogSmall, sx, sy, g.W * s, g.H * s);
  }

  drawVignette() {
    const c = this.ctx;
    if (!this.vig || this.vig.width !== Math.round(this.w / 2)) {
      const v = mkCanvas(Math.round(this.w / 2), Math.round(this.h / 2)), x = v.getContext('2d');
      const gr = x.createRadialGradient(v.width / 2, v.height / 2, Math.min(v.width, v.height) * 0.35, v.width / 2, v.height / 2, Math.hypot(v.width, v.height) * 0.62);
      gr.addColorStop(0, 'rgba(10,5,0,0)'); gr.addColorStop(1, 'rgba(10,5,0,0.38)');
      x.fillStyle = gr; x.fillRect(0, 0, v.width, v.height);
      this.vig = v;
    }
    c.drawImage(this.vig, -10, -10, this.w + 20, this.h + 20);
  }

  drawMarkers() {
    const c = this.ctx, s = this.scale, now = performance.now();
    this.markers = this.markers.filter(m => now - m.t < 700);
    for (const m of this.markers) {
      const [mx, my] = this.toScreen(m.x, m.y), k = (now - m.t) / 700;
      c.globalAlpha = 1 - k;
      c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 4;
      c.beginPath(); c.ellipse(mx, my, s * (0.55 - k * 0.3), s * (0.27 - k * 0.15), 0, 0, 7); c.stroke();
      c.strokeStyle = m.col; c.lineWidth = 2.2;
      c.beginPath(); c.ellipse(mx, my, s * (0.55 - k * 0.3), s * (0.27 - k * 0.15), 0, 0, 7); c.stroke();
      // Pfeile zur Mitte
      c.fillStyle = m.col;
      for (let a = 0; a < 4; a++) {
        const an = a * Math.PI / 2 + Math.PI / 4, rr = s * (0.75 - k * 0.45);
        const px = mx + Math.cos(an) * rr, py = my + Math.sin(an) * rr * 0.5;
        c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(an) * s * 0.18 - Math.sin(an) * s * 0.08, py + (Math.sin(an) * s * 0.18 + Math.cos(an) * s * 0.08) * 0.5); c.lineTo(px + Math.cos(an) * s * 0.18 + Math.sin(an) * s * 0.08, py + (Math.sin(an) * s * 0.18 - Math.cos(an) * s * 0.08) * 0.5); c.fill();
      }
      c.globalAlpha = 1;
    }
  }

  drawGhost(gh) {
    const c = this.ctx, s = this.scale, d = BUILDINGS[gh.type];
    const [sx, sy] = this.toScreen(gh.tx, gh.ty);
    const ok = this.g.canPlace(gh.type, gh.tx, gh.ty, 0);
    // Raster um die Vorschau
    c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1;
    for (let x = -2; x <= d.w + 2; x++) { c.beginPath(); c.moveTo(sx + x * s, sy - 2 * s); c.lineTo(sx + x * s, sy + (d.h + 2) * s); c.stroke(); }
    for (let y = -2; y <= d.h + 2; y++) { c.beginPath(); c.moveTo(sx - 2 * s, sy + y * s); c.lineTo(sx + (d.w + 2) * s, sy + y * s); c.stroke(); }
    if (gh.type === 'farm') this.drawSprite(this.farmSprite(0, 0), gh.tx, gh.ty, 0.6);
    else this.drawSprite(this.buildingSprite(gh.type, 0, gh.type === 'wall' ? 0 : undefined), gh.tx, gh.ty, 0.6);
    c.fillStyle = ok ? 'rgba(80,255,80,0.22)' : 'rgba(255,60,60,0.35)';
    c.fillRect(sx, sy, d.w * s, d.h * s);
    c.strokeStyle = ok ? '#6f6' : '#f55'; c.lineWidth = 2; c.strokeRect(sx, sy, d.w * s, d.h * s);
    if (gh.touch) {
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = `${Math.round(Math.max(12, s * 0.45))}px sans-serif`; c.textAlign = 'center';
      c.fillText('✥', sx + d.w * s / 2, sy + d.h * s / 2 + s * 0.15);
    }
  }

  addMarker(x, y, col) { this.markers.push({ x, y, col, t: performance.now() }); }

  // ---------- Minikarte ----------
  drawMinimap(force) {
    const g = this.g, now = performance.now();
    if (!force && now - this.mmT < 300) return;
    this.mmT = now;
    const m = this.mctx, size = this.mm.width;
    if (!this.mmBase) {
      this.mmBase = mkCanvas(g.W, g.H);
      this.mmBaseCtx = this.mmBase.getContext('2d');
      this.mmImg = this.mmBaseCtx.createImageData(g.W, g.H);
    }
    const d = this.mmImg.data, vis = g.vis, W = g.W;
    for (let i = 0; i < vis.length; i++) {
      const k = i * 4, v = g.revealAll ? 2 : vis[i];
      if (!v) { d[k] = 12; d[k + 1] = 10; d[k + 2] = 8; d[k + 3] = 255; continue; }
      let col = null;
      const id = g.occ[i];
      if (id) {
        const e = g.ents.get(id);
        if (e && e.cls === 'r') col = e.kind === 'tree' ? [38, 84, 34] : e.kind === 'gold' ? [245, 205, 50] : e.kind === 'clay' ? [205, 110, 60] : [200, 60, 90];
        else if (e && e.cls === 'b' && (e.owner === 0 || e.seen)) col = hexRgb(g.players[e.owner].color);
      }
      if (!col) { d[k + 3] = v === 2 ? 0 : 110; d[k] = 8; d[k + 1] = 8; d[k + 2] = 14; continue; }
      const f = v === 2 ? 1 : 0.6;
      d[k] = col[0] * f; d[k + 1] = col[1] * f; d[k + 2] = col[2] * f; d[k + 3] = 255;
    }
    this.mmBaseCtx.putImageData(this.mmImg, 0, 0);
    m.imageSmoothingEnabled = true;
    m.drawImage(this.mmTerrain, 0, 0, size, size);
    m.imageSmoothingEnabled = false;
    m.drawImage(this.mmBase, 0, 0, size, size);
    const k = size / g.W;
    for (const e of g.ents.values()) {
      if (e.cls !== 'u') continue;
      if (e.owner !== 0 && vis[Math.floor(e.y) * W + Math.floor(e.x)] !== 2) continue;
      m.fillStyle = '#000'; m.fillRect(e.x * k - 2, e.y * k - 2, 4, 4);
      m.fillStyle = g.players[e.owner].color; m.fillRect(e.x * k - 1.5, e.y * k - 1.5, 3, 3);
    }
    if (this.ping && now - this.ping.t < 3000) {
      const a = (now - this.ping.t) / 3000;
      m.strokeStyle = `rgba(255,60,60,${1 - a})`; m.lineWidth = 2;
      m.beginPath(); m.arc(this.ping.x * k, this.ping.y * k, 4 + a * 14, 0, 7); m.stroke();
    }
    if (this.night > 0.05) { m.fillStyle = `rgba(20,30,70,${this.night * 0.35})`; m.fillRect(0, 0, size, size); }
    const s = this.scale;
    m.strokeStyle = '#fff'; m.lineWidth = 1.5;
    m.strokeRect(this.cam.x * k, this.cam.y * k, (this.w / s) * k, (this.h / s) * k);
  }
}
