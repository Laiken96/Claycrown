// Claycrown: Darstellung auf Canvas (prozedurale Grafik, keine externen Bilder)
import { UNITS, BUILDINGS } from './data.js';
import { T } from './world.js';

export const TILE = 32;
const SPR = 64; // Pixel pro Kachel in Sprite Caches

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function hash(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

const WALL = '#cf9566', WALL_D = '#a8693f', WALL_T = '#e2b48a', WOOD = '#8a5a33', WOOD_D = '#5e3a1f', STONE = '#9a958c';

// Quader in schräger Draufsicht: Grundfläche x,y,w,d und Höhe z (Kacheleinheiten)
function box(c, x, y, w, d, z, top, front) {
  c.fillStyle = front; c.fillRect(x, y + d - z, w, z);
  c.fillStyle = top; c.fillRect(x, y - z, w, d);
  c.strokeStyle = 'rgba(40,20,10,0.35)'; c.lineWidth = 0.03;
  c.strokeRect(x, y - z, w, d); c.strokeRect(x, y + d - z, w, z);
}
function gable(c, x, y, w, d, z, col, rh = 0.35) {
  const top = y - z, mid = y + d / 2 - z - rh, bot = y + d - z;
  c.fillStyle = shade(col, 0.15);
  c.beginPath(); c.moveTo(x - 0.06, top); c.lineTo(x + w + 0.06, top); c.lineTo(x + w + 0.06, mid); c.lineTo(x - 0.06, mid); c.fill();
  c.fillStyle = shade(col, -0.18);
  c.beginPath(); c.moveTo(x - 0.06, mid); c.lineTo(x + w + 0.06, mid); c.lineTo(x + w + 0.06, bot + 0.04); c.lineTo(x - 0.06, bot + 0.04); c.fill();
  c.strokeStyle = 'rgba(30,15,5,0.4)'; c.lineWidth = 0.035;
  c.beginPath(); c.moveTo(x - 0.06, mid); c.lineTo(x + w + 0.06, mid); c.stroke();
  c.lineWidth = 0.02; c.strokeStyle = 'rgba(30,15,5,0.18)';
  for (let i = x + 0.15; i < x + w; i += 0.18) { c.beginPath(); c.moveTo(i, top); c.lineTo(i, bot); c.stroke(); }
}
function cone(c, cx, by, r, h, col) {
  c.fillStyle = shade(col, -0.15);
  c.beginPath(); c.moveTo(cx - r, by); c.lineTo(cx, by - h); c.lineTo(cx + r, by); c.closePath(); c.fill();
  c.fillStyle = shade(col, 0.15);
  c.beginPath(); c.moveTo(cx - r, by); c.lineTo(cx, by - h); c.lineTo(cx - r * 0.2, by); c.closePath(); c.fill();
}
function flag(c, x, y, col) {
  c.strokeStyle = '#3a2a1a'; c.lineWidth = 0.04;
  c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 0.7); c.stroke();
  c.fillStyle = col; c.beginPath(); c.moveTo(x, y - 0.7); c.lineTo(x + 0.42, y - 0.58); c.lineTo(x, y - 0.44); c.fill();
}
function door(c, x, y, w, h) { c.fillStyle = '#4a2c16'; c.fillRect(x, y - h, w, h); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x, y - h, w * 0.3, h); }
function crenel(c, x, y, w, z, col) { c.fillStyle = col; for (let i = 0; i < w - 0.05; i += 0.3) c.fillRect(x + i, y - z - 0.12, 0.17, 0.14); }

const BUILD_DRAW = {
  keep(c, col) {
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0.15, 0.35, 3.9, 3.8);
    box(c, 0.2, 0.4, 3.6, 3.4, 0.55, WALL_T, WALL_D);
    c.fillStyle = '#b98a5f'; c.fillRect(0.55, 0.3, 2.9, 2.6);
    box(c, 1.0, 0.9, 2.0, 2.0, 1.5, WALL_T, WALL);
    crenel(c, 1.0, 0.9, 2.0, 1.5, WALL_D);
    c.fillStyle = shade(col, -0.1); c.fillRect(1.7, 2.9 - 1.5 + 0.15, 0.6, 0.7);
    for (const [x, y] of [[0.1, 0.3], [3.3, 0.3], [0.1, 3.2], [3.3, 3.2]]) { box(c, x, y, 0.6, 0.6, 1.0, WALL_T, WALL_D); cone(c, x + 0.3, y - 0.95, 0.4, 0.6, col); }
    door(c, 1.65, 3.8, 0.7, 0.5);
    flag(c, 2.0, -0.6, col);
  },
  house(c, col) {
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0.3, 0.5, 1.6, 1.4);
    box(c, 0.25, 0.45, 1.5, 1.3, 0.55, WALL_T, WALL);
    gable(c, 0.25, 0.45, 1.5, 1.3, 0.55, col);
    door(c, 0.85, 1.75, 0.32, 0.4);
    c.fillStyle = '#ffe9a8'; c.fillRect(0.4, 1.75 - 0.38, 0.22, 0.16); c.fillRect(1.38, 1.75 - 0.38, 0.22, 0.16);
  },
  mill(c, col) {
    box(c, 0.35, 0.5, 1.3, 1.25, 0.8, WALL_T, WALL);
    gable(c, 0.35, 0.5, 1.3, 1.25, 0.8, col, 0.3);
    door(c, 0.85, 1.75, 0.3, 0.42);
    c.fillStyle = '#e8cf7a'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(1.75, 1.7 - i * 0.15, 0.15, 0, 7); c.fill(); }
  },
  lumber(c, col) {
    for (const [x, y] of [[0.2, 0.4], [1.7, 0.4], [0.2, 1.6], [1.7, 1.6]]) { c.fillStyle = WOOD_D; c.fillRect(x, y - 0.6, 0.1, 0.7); }
    gable(c, 0.15, 0.4, 1.7, 1.25, 0.6, col, 0.25);
    c.fillStyle = WOOD; for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) {
      c.beginPath(); c.arc(0.45 + i * 0.3 + r * 0.15, 1.85 - r * 0.22, 0.14, 0, 7); c.fill();
      c.fillStyle = '#d8b07a'; c.beginPath(); c.arc(0.45 + i * 0.3 + r * 0.15, 1.85 - r * 0.22, 0.08, 0, 7); c.fill(); c.fillStyle = WOOD;
    }
  },
  mine(c, col) {
    box(c, 0.2, 0.5, 1.2, 1.0, 0.6, WALL_T, WALL);
    gable(c, 0.2, 0.5, 1.2, 1.0, 0.6, col, 0.25);
    c.fillStyle = WOOD_D; c.fillRect(1.35, 1.45, 0.55, 0.35);
    c.fillStyle = '#e6c33a'; c.beginPath(); c.arc(1.5, 1.42, 0.12, 0, 7); c.arc(1.72, 1.45, 0.1, 0, 7); c.fill();
    c.fillStyle = '#b8643c'; c.beginPath(); c.arc(0.5, 1.8, 0.18, 0, 7); c.arc(0.8, 1.85, 0.14, 0, 7); c.fill();
    c.fillStyle = '#333'; c.beginPath(); c.arc(1.45, 1.85, 0.07, 0, 7); c.arc(1.8, 1.85, 0.07, 0, 7); c.fill();
  },
  barracks(c, col) {
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0.2, 0.5, 2.7, 2.3);
    box(c, 0.2, 0.5, 2.6, 2.1, 0.75, WALL_T, WALL);
    gable(c, 0.2, 0.5, 2.6, 2.1, 0.75, col, 0.45);
    door(c, 1.25, 2.6, 0.5, 0.55);
    for (const x of [0.55, 2.2]) { c.fillStyle = col; c.beginPath(); c.arc(x + 0.12, 2.6 - 0.4, 0.16, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 0.03; c.stroke(); }
    c.strokeStyle = '#ccc'; c.lineWidth = 0.04;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(2.95, 2.75 - i * 0.03); c.lineTo(2.95 - 0.1 + i * 0.1, 1.95); c.stroke(); }
  },
  range(c, col) {
    box(c, 0.2, 0.4, 2.4, 1.6, 0.7, WALL_T, WALL);
    gable(c, 0.2, 0.4, 2.4, 1.6, 0.7, col, 0.4);
    door(c, 1.15, 2.0, 0.45, 0.5);
    for (const x of [0.6, 1.5, 2.4]) {
      c.fillStyle = WOOD_D; c.fillRect(x - 0.03, 2.4, 0.06, 0.4);
      c.fillStyle = '#f4ead7'; c.beginPath(); c.arc(x, 2.4, 0.22, 0, 7); c.fill();
      c.fillStyle = '#d43c2c'; c.beginPath(); c.arc(x, 2.4, 0.14, 0, 7); c.fill();
      c.fillStyle = '#f4ead7'; c.beginPath(); c.arc(x, 2.4, 0.06, 0, 7); c.fill();
    }
  },
  stable(c, col) {
    box(c, 0.2, 0.4, 2.6, 1.6, 0.7, '#b4835a', WOOD);
    gable(c, 0.2, 0.4, 2.6, 1.6, 0.7, col, 0.4);
    for (const x of [0.5, 1.3, 2.1]) door(c, x, 2.0, 0.45, 0.45);
    c.strokeStyle = WOOD_D; c.lineWidth = 0.05;
    c.beginPath(); c.moveTo(0.15, 2.55); c.lineTo(2.85, 2.55); c.moveTo(0.15, 2.75); c.lineTo(2.85, 2.75); c.stroke();
    c.fillStyle = '#e2c45a'; c.beginPath(); c.arc(2.55, 2.3, 0.2, 0, 7); c.fill();
  },
  forge(c, col) {
    box(c, 0.3, 0.5, 2.3, 1.9, 0.7, '#a59c90', '#7a736a');
    gable(c, 0.3, 0.5, 2.3, 1.9, 0.7, col, 0.35);
    box(c, 2.0, 0.4, 0.4, 0.4, 1.6, '#555', '#3c3c3c');
    c.fillStyle = '#ff8a2a'; c.fillRect(0.9, 2.4 - 0.45, 0.5, 0.35);
    c.fillStyle = '#444'; c.fillRect(1.9, 2.55, 0.5, 0.18); c.fillRect(2.05, 2.73, 0.2, 0.12);
  },
  tower(c, col) {
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(1.1, 1.6, 0.9, 0.4, 0, 0, 7); c.fill();
    box(c, 0.45, 0.6, 1.1, 1.1, 2.2, WALL_T, WALL);
    crenel(c, 0.45, 0.6, 1.1, 2.2, WALL_D);
    c.fillStyle = '#3a2a1a'; c.fillRect(0.88, 1.7 - 1.6, 0.24, 0.35); c.fillRect(0.88, 1.7 - 0.9, 0.24, 0.3);
    cone(c, 1.0, 0.6 - 2.2 + 0.1, 0.72, 0.9, col);
    flag(c, 1.0, 0.6 - 2.2 - 0.75, col);
  },
  workshop(c, col) {
    box(c, 0.15, 0.6, 2.7, 1.7, 0.8, '#b4835a', WOOD);
    gable(c, 0.15, 0.6, 2.7, 1.7, 0.8, col, 0.4);
    door(c, 1.0, 2.3, 1.0, 0.7);
    c.strokeStyle = WOOD_D; c.lineWidth = 0.08;
    c.beginPath(); c.moveTo(2.7, 2.8); c.lineTo(2.7, 0.2); c.lineTo(1.9, -0.2); c.stroke();
    c.lineWidth = 0.02; c.beginPath(); c.moveTo(1.95, -0.15); c.lineTo(1.95, 0.6); c.stroke();
  },
  monument(c, col) {
    c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(0.2, 0.6, 4.8, 4.4);
    box(c, 0.2, 0.6, 4.6, 4.2, 0.5, '#e0b88d', '#b98a5f');
    box(c, 0.8, 1.0, 3.4, 3.2, 1.1, '#e6c39b', '#c4966a');
    box(c, 1.4, 1.4, 2.2, 2.2, 1.8, '#edd0aa', '#cfa274');
    box(c, 1.9, 1.75, 1.2, 1.2, 2.6, '#f2dbb8', '#d8ae80');
    c.fillStyle = '#f5c518';
    c.beginPath(); const by = 1.75 - 2.6 + 0.4;
    c.moveTo(1.9, by); c.lineTo(1.9, by - 0.6); c.lineTo(2.2, by - 0.3); c.lineTo(2.5, by - 0.8); c.lineTo(2.8, by - 0.3); c.lineTo(3.1, by - 0.6); c.lineTo(3.1, by); c.fill();
    c.strokeStyle = '#a07a10'; c.lineWidth = 0.04; c.stroke();
    c.fillStyle = col; for (const x of [0.5, 4.3]) c.fillRect(x, 4.8 - 0.45, 0.25, 0.35);
    door(c, 2.2, 4.8, 0.6, 0.4);
  },
};
export const BUILD_TOP = { keep: 2.3, house: 1.1, mill: 1.3, lumber: 1.0, mine: 1.0, barracks: 1.3, range: 1.2, stable: 1.2, forge: 1.7, tower: 3.4, workshop: 1.4, monument: 2.2, farm: 0 };

export class Renderer {
  constructor(canvas, minimap) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.mm = minimap; this.mctx = minimap.getContext('2d');
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.sprites = new Map();
    this.tiles = this.makeTiles();
    this.markers = [];
    this.fogCv = null; this.fogT = 0; this.mmT = 0;
    this.w = 1; this.h = 1; this.dpr = 1;
  }

  setGame(g) {
    this.g = g;
    this.fogCv = mkCanvas(g.W, g.H);
    this.fogCtx = this.fogCv.getContext('2d');
    this.fogImg = this.fogCtx.createImageData(g.W, g.H);
    this.mmBase = null; this.shadeMap = null;
    this.buildShade();
    this.markers = [];
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
  }

  get scale() { return TILE * this.cam.zoom; }
  toScreen(x, y) { const s = this.scale; return [(x - this.cam.x) * s, (y - this.cam.y) * s]; }
  toWorld(sx, sy) { const s = this.scale; return [sx / s + this.cam.x, sy / s + this.cam.y]; }
  clampCam() {
    const g = this.g, s = this.scale;
    const vw = this.w / s, vh = this.h / s;
    const m = 3;
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
    this.cam.zoom = Math.max(0.4, Math.min(2.2, this.cam.zoom * f));
    const s = this.scale; this.cam.x = wx - sx / s; this.cam.y = wy - sy / s; this.clampCam();
  }

  // ---------- Kacheln ----------
  makeTiles() {
    const mk = (base, dots, seed, extra) => {
      const c = mkCanvas(SPR, SPR), x = c.getContext('2d');
      x.fillStyle = base; x.fillRect(0, 0, SPR, SPR);
      for (let i = 0; i < 46; i++) {
        const r = hash(seed, i), r2 = hash(i, seed + 7), r3 = hash(seed + i, 3);
        x.fillStyle = dots[Math.floor(r3 * dots.length)];
        x.globalAlpha = 0.5; x.fillRect(Math.floor(r * SPR), Math.floor(r2 * SPR), 2 + (r3 * 3 | 0), 2);
      }
      x.globalAlpha = 1;
      if (extra) extra(x, seed);
      return c;
    };
    const tuft = (x, seed) => {
      x.strokeStyle = 'rgba(40,80,20,0.55)'; x.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        const px = hash(seed, i + 50) * SPR, py = hash(seed + 50, i) * SPR;
        x.beginPath(); x.moveTo(px, py); x.lineTo(px - 2, py - 5); x.moveTo(px, py); x.lineTo(px + 2, py - 5); x.moveTo(px, py); x.lineTo(px, py - 6); x.stroke();
      }
    };
    const t = {};
    t.grass = [0, 1, 2, 3].map(i => mk('#79a64a', ['#6c9a3f', '#86b357', '#5f8c36', '#91bd5f'], i + 1, i % 2 ? tuft : null));
    t.sand = [0, 1].map(i => mk('#d8c48c', ['#c9b47a', '#e6d5a1', '#bfa86c'], i + 11));
    t.dirt = [0, 1].map(i => mk('#a88a5c', ['#977a4f', '#b99b6b', '#8a6d44'], i + 21));
    t.water = [0, 1, 2, 3].map(f => {
      const c = mkCanvas(SPR, SPR), x = c.getContext('2d');
      x.fillStyle = '#3678a8'; x.fillRect(0, 0, SPR, SPR);
      x.strokeStyle = 'rgba(255,255,255,0.16)'; x.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const yy = (i * 22 + f * 5) % SPR, xx = (i * 37) % SPR;
        x.beginPath(); x.moveTo(xx, yy); x.quadraticCurveTo(xx + 8, yy - 4, xx + 16, yy); x.stroke();
      }
      return c;
    });
    t.shallow = [0, 1].map(i => mk('#6aaeb0', ['#5d9fa1', '#7cbcbc', '#8fc7b9'], i + 31));
    return t;
  }

  buildShade() {
    const g = this.g;
    const sm = new Float32Array(g.W * g.H);
    for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) {
      const a = Math.sin(x * 0.21 + y * 0.07) + Math.sin(y * 0.17 - x * 0.05) + Math.sin((x + y) * 0.09);
      sm[y * g.W + x] = a / 3;
    }
    this.shadeMap = sm;
  }

  // ---------- Sprites ----------
  sprite(key, wT, hT, top, fn) {
    let s = this.sprites.get(key);
    if (s) return s;
    const c = mkCanvas(wT * SPR, (hT + top) * SPR), x = c.getContext('2d');
    x.translate(0, top * SPR); x.scale(SPR, SPR);
    fn(x);
    s = { c, wT, hT, top };
    this.sprites.set(key, s);
    return s;
  }
  drawSprite(s, wx, wy, alpha = 1, clipFrac = 1) {
    const [sx, sy] = this.toScreen(wx, wy), sc = this.scale, c = this.ctx;
    const totalH = (s.hT + s.top) * sc;
    if (alpha !== 1) c.globalAlpha = alpha;
    if (clipFrac >= 1) c.drawImage(s.c, sx, sy - s.top * sc, s.wT * sc, totalH);
    else {
      const sh = s.c.height * clipFrac;
      c.drawImage(s.c, 0, s.c.height - sh, s.c.width, sh, sx, sy - s.top * sc + totalH * (1 - clipFrac), s.wT * sc, totalH * clipFrac);
    }
    if (alpha !== 1) c.globalAlpha = 1;
  }

  buildingSprite(type, owner) {
    const d = BUILDINGS[type], col = this.g.players[owner] ? this.g.players[owner].color : '#888';
    return this.sprite(`b_${type}_${col}`, d.w, d.h, BUILD_TOP[type], x => BUILD_DRAW[type](x, col));
  }
  foundationSprite(w, h) {
    return this.sprite(`f_${w}_${h}`, w, h, 0.3, x => {
      x.fillStyle = 'rgba(120,85,50,0.75)'; x.fillRect(0.1, 0.1, w - 0.2, h - 0.2);
      x.strokeStyle = '#6b4a2b'; x.lineWidth = 0.06; x.setLineDash([0.15, 0.1]); x.strokeRect(0.12, 0.12, w - 0.24, h - 0.24); x.setLineDash([]);
      x.fillStyle = WOOD_D;
      for (const [px, py] of [[0.15, 0.15], [w - 0.25, 0.15], [0.15, h - 0.25], [w - 0.25, h - 0.25]]) x.fillRect(px, py - 0.3, 0.1, 0.4);
    });
  }
  resSprite(r) {
    const v = r.v % 5;
    if (r.kind === 'tree') {
      return this.sprite(`t_${v}`, 1, 1, 1.0, x => {
        x.fillStyle = 'rgba(0,0,0,0.22)'; x.beginPath(); x.ellipse(0.55, 0.82, 0.42, 0.18, 0, 0, 7); x.fill();
        x.fillStyle = '#5b3a1e'; x.fillRect(0.44, 0.35, 0.12, 0.5);
        if (v < 2) {
          const cols = ['#2f6b2a', '#3d7f33', '#4e943e'];
          for (let i = 0; i < 3; i++) { x.fillStyle = cols[i]; x.beginPath(); x.moveTo(0.5, -0.95 + i * 0.32); x.lineTo(0.92 - i * 0.05, 0.25 + i * 0.12 - i * 0.2); x.lineTo(0.08 + i * 0.05, 0.25 + i * 0.12 - i * 0.2); x.closePath(); x.fill(); }
        } else {
          const base = ['#3f7a2e', '#4a8a35', '#567f2c'][v - 2];
          const blobs = [[0.5, -0.05, 0.42], [0.28, 0.1, 0.3], [0.72, 0.1, 0.3], [0.5, -0.35, 0.3]];
          x.fillStyle = shade(base, -0.25); for (const [bx, by, br] of blobs) { x.beginPath(); x.arc(bx, by + 0.05, br, 0, 7); x.fill(); }
          x.fillStyle = base; for (const [bx, by, br] of blobs) { x.beginPath(); x.arc(bx, by, br * 0.92, 0, 7); x.fill(); }
          x.fillStyle = shade(base, 0.2); for (const [bx, by, br] of blobs) { x.beginPath(); x.arc(bx - br * 0.25, by - br * 0.3, br * 0.4, 0, 7); x.fill(); }
        }
      });
    }
    if (r.kind === 'gold' || r.kind === 'clay') {
      const gold = r.kind === 'gold';
      return this.sprite(`${r.kind}_${v}`, 1, 1, 0.4, x => {
        x.fillStyle = 'rgba(0,0,0,0.2)'; x.beginPath(); x.ellipse(0.5, 0.75, 0.48, 0.2, 0, 0, 7); x.fill();
        const rocks = [[0.3, 0.5, 0.26], [0.68, 0.48, 0.24], [0.5, 0.22, 0.27], [0.5 + (v - 2) * 0.05, 0.62, 0.2]];
        const base = gold ? '#8f8a80' : '#b0623a';
        for (const [bx, by, br] of rocks) {
          x.fillStyle = shade(base, -0.3); x.beginPath(); x.arc(bx, by + 0.04, br, 0, 7); x.fill();
          x.fillStyle = base; x.beginPath(); x.arc(bx, by, br * 0.92, 0, 7); x.fill();
          x.fillStyle = shade(base, 0.25); x.beginPath(); x.arc(bx - br * 0.3, by - br * 0.35, br * 0.35, 0, 7); x.fill();
        }
        x.fillStyle = gold ? '#ffd23a' : '#e88a55';
        for (let i = 0; i < 7; i++) { x.beginPath(); x.arc(0.2 + hash(v, i) * 0.6, 0.1 + hash(i, v + 3) * 0.55, 0.045, 0, 7); x.fill(); }
      });
    }
    return this.sprite(`berry_${v}`, 1, 1, 0.2, x => {
      x.fillStyle = 'rgba(0,0,0,0.2)'; x.beginPath(); x.ellipse(0.5, 0.75, 0.42, 0.16, 0, 0, 7); x.fill();
      x.fillStyle = '#2f6e2f'; x.beginPath(); x.arc(0.35, 0.45, 0.28, 0, 7); x.arc(0.65, 0.45, 0.28, 0, 7); x.arc(0.5, 0.25, 0.28, 0, 7); x.fill();
      x.fillStyle = '#3f8a3a'; x.beginPath(); x.arc(0.42, 0.3, 0.16, 0, 7); x.fill();
      x.fillStyle = '#d4264a';
      for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(0.18 + hash(v, i + 9) * 0.64, 0.05 + hash(i + 9, v) * 0.6, 0.055, 0, 7); x.fill(); }
    });
  }

  // ---------- Hauptzeichnung ----------
  draw(alpha, ui) {
    const g = this.g, c = this.ctx, s = this.scale, time = performance.now() / 1000;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.imageSmoothingEnabled = true;
    c.fillStyle = '#0d0a08'; c.fillRect(0, 0, this.w, this.h);
    const x0 = Math.max(0, Math.floor(this.cam.x)), y0 = Math.max(0, Math.floor(this.cam.y));
    const x1 = Math.min(g.W - 1, Math.ceil(this.cam.x + this.w / s)), y1 = Math.min(g.H - 1, Math.ceil(this.cam.y + this.h / s + 1));
    const W = g.W, vis = g.vis, ter = g.terrain, tl = this.tiles;
    const wf = Math.floor(time * 2) % 4;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (!vis[i]) continue;
        const sx = (x - this.cam.x) * s, sy = (y - this.cam.y) * s;
        const t = ter[i], hv = (x * 7 + y * 13) & 3;
        let img;
        if (t === T.GRASS) img = tl.grass[hv];
        else if (t === T.WATER) img = tl.water[(wf + hv) & 3];
        else if (t === T.SAND) img = tl.sand[hv & 1];
        else if (t === T.DIRT) img = tl.dirt[hv & 1];
        else img = tl.shallow[hv & 1];
        c.drawImage(img, sx, sy, s + 0.6, s + 0.6);
        const sh = this.shadeMap[i];
        if (t !== T.WATER) {
          c.fillStyle = sh > 0 ? `rgba(255,240,180,${sh * 0.07})` : `rgba(20,40,0,${-sh * 0.09})`;
          c.fillRect(sx, sy, s + 0.6, s + 0.6);
        }
      }
    }
    // Felder und Bodeneffekte
    for (const d of g.decals) {
      if (!this.inView(d.x, d.y, 3)) continue;
      const [sx, sy] = this.toScreen(d.x, d.y);
      const a = Math.max(0, 1 - d.t / (d.k === 'rubble' ? 40 : 20));
      if (d.k === 'rubble') {
        c.fillStyle = `rgba(70,55,40,${0.6 * a})`; c.fillRect(sx, sy, d.w * s, d.h * s);
        c.fillStyle = `rgba(110,90,70,${0.8 * a})`;
        for (let k = 0; k < d.w * d.h * 2; k++) { c.fillRect(sx + hash(k, d.x) * d.w * s, sy + hash(d.y, k) * d.h * s, s * 0.18, s * 0.12); }
      } else if (vis[Math.floor(d.y) * W + Math.floor(d.x)] === 2 || d.owner === 0) {
        c.fillStyle = `rgba(90,20,20,${0.45 * a})`; c.beginPath(); c.ellipse(sx, sy + s * 0.1, s * 0.3, s * 0.14, 0, 0, 7); c.fill();
        c.strokeStyle = `rgba(60,40,30,${0.8 * a})`; c.lineWidth = Math.max(1, s * 0.05);
        c.beginPath(); c.moveTo(sx - s * 0.2, sy - s * 0.05); c.lineTo(sx + s * 0.2, sy + s * 0.12); c.stroke();
      }
    }
    // Objekte sammeln und nach Tiefe sortieren
    const list = [];
    const sel = ui.selSet;
    for (const e of g.ents.values()) {
      if (e.cls === 'u') {
        if (!this.inView(e.x, e.y, 2)) continue;
        if (e.owner !== 0 && vis[Math.floor(e.y) * W + Math.floor(e.x)] !== 2) continue;
        list.push(e);
      } else {
        if (!this.inView(e.x, e.y, e.w + 3)) continue;
        if (e.cls === 'b') {
          if (!e.seen && e.owner !== 0) continue;
          if (e.type === 'farm') { this.drawFarm(e, sel.has(e.id)); continue; }
        } else if (!vis[e.ty * W + e.tx]) continue;
        list.push(e);
      }
    }
    list.sort((a, b) => (a.cls === 'u' ? a.y : a.ty + a.h - 0.3) - (b.cls === 'u' ? b.y : b.ty + b.h - 0.3));
    for (const e of list) {
      if (e.cls === 'u') this.drawUnit(e, alpha, sel.has(e.id), time);
      else if (e.cls === 'b') this.drawBuilding(e, sel.has(e.id), time);
      else {
        const sp = this.resSprite(e);
        if (sel.has(e.id)) this.selRect(e);
        const scaleF = e.kind === 'tree' ? 1 : 0.55 + 0.45 * Math.min(1, e.amount / e.max);
        if (scaleF < 1) {
          const cx = e.tx + 0.5, by = e.ty + 1;
          const [sx, sy] = this.toScreen(cx - 0.5 * scaleF, by - scaleF), sc = s * scaleF;
          c.drawImage(sp.c, sx, sy - sp.top * sc, sc, (1 + sp.top) * sc);
        } else this.drawSprite(sp, e.tx, e.ty);
      }
    }
    this.drawProjectiles();
    // Nebel des Krieges
    this.drawFog();
    // Lebensbalken und Auswahl darüber
    for (const e of list) {
      if (e.cls === 'r') continue;
      const isSel = sel.has(e.id);
      if (isSel || (e.hp < e.maxHp && (e.cls === 'u' || e.done || isSel))) this.hpBar(e, isSel);
    }
    for (const id of sel) {
      const e = g.ents.get(id);
      if (e && e.cls === 'b' && e.type === 'farm') this.hpBar(e, true);
    }
    // Sammelpunkt
    if (ui.rallyOf) {
      const b = g.ents.get(ui.rallyOf);
      if (b && b.rally) {
        const [ax, ay] = this.toScreen(b.x, b.y), [bx, by] = this.toScreen(b.rally.x, b.rally.y);
        c.strokeStyle = 'rgba(255,255,255,0.5)'; c.setLineDash([6, 6]); c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); c.setLineDash([]);
        c.font = `${Math.round(s * 0.7)}px sans-serif`; c.textAlign = 'center'; c.fillText('🚩', bx, by);
      }
    }
    // Markierungen für Befehle
    const now = performance.now();
    this.markers = this.markers.filter(m => now - m.t < 600);
    for (const m of this.markers) {
      const [mx, my] = this.toScreen(m.x, m.y), k = (now - m.t) / 600;
      c.strokeStyle = m.col; c.globalAlpha = 1 - k; c.lineWidth = 2;
      c.beginPath(); c.ellipse(mx, my, s * (0.5 - k * 0.3), s * (0.25 - k * 0.15), 0, 0, 7); c.stroke();
      c.globalAlpha = 1;
    }
    // Bauvorschau
    if (ui.ghost) this.drawGhost(ui.ghost);
    if (ui.box) {
      const b = ui.box;
      c.fillStyle = 'rgba(120,200,255,0.12)'; c.strokeStyle = 'rgba(160,220,255,0.9)'; c.lineWidth = 1.5;
      c.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
      c.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    }
  }

  inView(x, y, m) {
    const s = this.scale;
    return x > this.cam.x - m && y > this.cam.y - m && x < this.cam.x + this.w / s + m && y < this.cam.y + this.h / s + m + 2;
  }

  selRect(e) {
    const c = this.ctx, s = this.scale, [sx, sy] = this.toScreen(e.tx, e.ty);
    c.strokeStyle = e.cls === 'r' ? '#ffe680' : e.owner === 0 ? '#7dff7d' : '#ff6a5a'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(sx + e.w * s / 2, sy + e.h * s * 0.62, e.w * s * 0.62, e.h * s * 0.42, 0, 0, 7); c.stroke();
  }

  drawFarm(b, isSel) {
    const c = this.ctx, s = this.scale, [sx, sy] = this.toScreen(b.tx, b.ty);
    const w = b.w * s, h = b.h * s;
    c.fillStyle = b.done ? '#8a6a3a' : 'rgba(138,106,58,0.6)'; c.fillRect(sx + s * 0.08, sy + s * 0.08, w - s * 0.16, h - s * 0.16);
    const f = b.done ? b.food / BUILDINGS.farm.food : b.prog;
    const crop = f > 0.5 ? '#d9b73c' : f > 0.2 ? '#a9a23a' : '#7b8a34';
    for (let i = 0; i < 6; i++) {
      const yy = sy + s * 0.25 + i * (h - s * 0.5) / 5;
      c.strokeStyle = '#6b4f28'; c.lineWidth = Math.max(1, s * 0.08);
      c.beginPath(); c.moveTo(sx + s * 0.2, yy); c.lineTo(sx + w - s * 0.2, yy); c.stroke();
      if (b.done || i < b.prog * 6) {
        c.strokeStyle = crop; c.lineWidth = Math.max(1, s * 0.12); c.setLineDash([s * 0.12, s * 0.08]);
        c.beginPath(); c.moveTo(sx + s * 0.25, yy - s * 0.05); c.lineTo(sx + w - s * 0.25, yy - s * 0.05); c.stroke(); c.setLineDash([]);
      }
    }
    c.strokeStyle = this.g.players[b.owner].color; c.lineWidth = Math.max(1, s * 0.05);
    c.strokeRect(sx + s * 0.08, sy + s * 0.08, w - s * 0.16, h - s * 0.16);
    if (isSel) this.selRect(b);
  }

  drawBuilding(b, isSel, time) {
    const c = this.ctx, s = this.scale;
    if (isSel) this.selRect(b);
    if (!b.done) {
      this.drawSprite(this.foundationSprite(b.w, b.h), b.tx, b.ty);
      if (b.prog > 0.02) this.drawSprite(this.buildingSprite(b.type, b.owner), b.tx, b.ty, 0.9, 0.15 + 0.85 * b.prog);
      return;
    }
    this.drawSprite(this.buildingSprite(b.type, b.owner), b.tx, b.ty);
    const [sx, sy] = this.toScreen(b.tx, b.ty);
    if (b.type === 'mill') {
      const cx = sx + s * 1.0, cy = sy + s * (0.5 - 0.8 - 0.1), r = s * 0.95, a = time * 1.4 + b.id;
      c.strokeStyle = '#5a3a20'; c.lineWidth = Math.max(1, s * 0.07);
      for (let k = 0; k < 4; k++) {
        const an = a + (k * Math.PI) / 2;
        c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r); c.stroke();
        c.fillStyle = 'rgba(240,230,210,0.85)';
        c.save(); c.translate(cx, cy); c.rotate(an); c.fillRect(r * 0.25, 0, r * 0.72, s * 0.2); c.restore();
      }
      c.fillStyle = '#3a2a1a'; c.beginPath(); c.arc(cx, cy, s * 0.09, 0, 7); c.fill();
    }
    if (b.type === 'forge' || (b.queue.length && b.type !== 'keep')) {
      const chim = b.type === 'forge' ? [sx + s * 2.2, sy + s * (0.4 - 1.6)] : [sx + b.w * s * 0.7, sy - s * 0.6];
      for (let k = 0; k < 3; k++) {
        const ph = (time * 0.6 + k / 3 + b.id * 0.1) % 1;
        c.fillStyle = `rgba(200,200,200,${0.35 * (1 - ph)})`;
        c.beginPath(); c.arc(chim[0] + Math.sin(ph * 6 + k) * s * 0.2, chim[1] - ph * s * 1.2, s * (0.12 + ph * 0.25), 0, 7); c.fill();
      }
    }
    if (b.type === 'monument' && b.done) {
      c.fillStyle = 'rgba(255,215,80,0.12)'; c.beginPath(); c.arc(sx + s * 2.5, sy + s * 0.5, s * (2.5 + Math.sin(time * 2) * 0.2), 0, 7); c.fill();
    }
    if (b.hp < b.maxHp * 0.5) {
      for (let k = 0; k < 2; k++) {
        const ph = (time * 0.8 + k * 0.5 + b.id * 0.13) % 1;
        c.fillStyle = `rgba(255,${120 + k * 60},40,${0.7 * (1 - ph)})`;
        c.beginPath(); c.arc(sx + s * (0.6 + k * (b.w - 1.2)), sy + s * (0.3 - ph), s * 0.2 * (1 - ph * 0.5), 0, 7); c.fill();
        c.fillStyle = `rgba(60,60,60,${0.4 * (1 - ph)})`;
        c.beginPath(); c.arc(sx + s * (0.6 + k * (b.w - 1.2)), sy - s * ph * 1.5, s * 0.25, 0, 7); c.fill();
      }
    }
  }

  drawUnit(u, alpha, isSel, time) {
    const c = this.ctx, s = this.scale, d = UNITS[u.type];
    const x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha;
    const [sx, sy] = this.toScreen(x, y);
    const col = this.g.players[u.owner].color;
    const r = d.r;
    c.save(); c.translate(sx, sy); c.scale(s, s);
    if (isSel) { c.strokeStyle = u.owner === 0 ? '#7dff7d' : '#ff6a5a'; c.lineWidth = 0.06; c.beginPath(); c.ellipse(0, 0.05, r + 0.12, (r + 0.12) * 0.55, 0, 0, 7); c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(0, 0.08, r, r * 0.5, 0, 0, 7); c.fill();
    const bob = u.moving ? Math.abs(Math.sin(u.walk)) * 0.06 : 0;
    const face = Math.cos(u.dir) >= 0 ? 1 : -1;
    const swing = u.work ? Math.sin(time * 9 + u.id) : u.atkT > 0 ? Math.sin((0.35 - u.atkT) * 18) : 0;
    c.translate(0, -bob);
    const leg = u.moving ? Math.sin(u.walk) * 0.08 : 0;
    if (u.type === 'rider') {
      c.fillStyle = '#7a4a26'; c.beginPath(); c.ellipse(0, -0.1, 0.42, 0.2, 0, 0, 7); c.fill();
      c.fillRect(-0.3 + leg, -0.05, 0.07, 0.17); c.fillRect(0.22 - leg, -0.05, 0.07, 0.17);
      c.beginPath(); c.ellipse(face * 0.38, -0.28, 0.13, 0.1, face * -0.6, 0, 7); c.fill();
      c.fillStyle = '#3a2210'; c.fillRect(face * 0.25 - 0.04, -0.36, 0.08, 0.14);
      this.body(c, 0, -0.42, 0.17, col, face);
      c.strokeStyle = '#ddd'; c.lineWidth = 0.05; c.beginPath(); c.moveTo(face * 0.05, -0.5); c.lineTo(face * (0.45 + swing * 0.1), -0.75 + swing * 0.2); c.stroke();
    } else if (u.type === 'treb') {
      const f = Math.cos(u.dir) >= 0 ? 1 : -1;
      c.fillStyle = WOOD_D; c.fillRect(-0.55, -0.12, 1.1, 0.2);
      c.fillStyle = '#222'; for (const wx of [-0.42, 0.42]) { c.beginPath(); c.arc(wx, 0.1, 0.11, 0, 7); c.fill(); }
      c.strokeStyle = WOOD; c.lineWidth = 0.09;
      c.beginPath(); c.moveTo(-0.3, -0.1); c.lineTo(0, -0.75); c.lineTo(0.3, -0.1); c.stroke();
      // Wurfarm schwingt beim Schuss
      const k = u.atkT > 0 ? Math.min(1, (0.35 - u.atkT) / 0.35) : 0;
      const a = (-0.5 - k * 2.2) * f + (f < 0 ? Math.PI : 0);
      c.strokeStyle = '#6b4a2b'; c.lineWidth = 0.07;
      c.beginPath(); c.moveTo(0, -0.75); c.lineTo(Math.cos(a) * 0.75, -0.75 + Math.sin(a) * 0.75); c.stroke();
      c.beginPath(); c.moveTo(0, -0.75); c.lineTo(-Math.cos(a) * 0.3, -0.75 - Math.sin(a) * 0.3); c.stroke();
      c.fillStyle = '#5a5550'; c.fillRect(-Math.cos(a) * 0.3 - 0.12, -0.75 - Math.sin(a) * 0.3 - 0.05, 0.24, 0.2);
      c.fillStyle = col; c.fillRect(-0.55, -0.16, 1.1, 0.06);
    } else if (u.type === 'ram') {
      c.save(); c.rotate(Math.cos(u.dir) >= 0 ? 0 : Math.PI);
      c.fillStyle = WOOD_D; c.fillRect(-0.5, -0.2, 1.0, 0.36);
      c.fillStyle = '#6b4b2b'; c.fillRect(-0.45, -0.45, 0.9, 0.3);
      c.fillStyle = col; c.fillRect(-0.45, -0.5, 0.9, 0.08);
      c.fillStyle = '#5a4a3a'; c.fillRect(0.3 + (u.atkT > 0 ? 0.15 : 0), -0.18, 0.35, 0.16);
      c.fillStyle = '#222'; for (const wx of [-0.35, 0.3]) { c.beginPath(); c.arc(wx, 0.16, 0.1, 0, 7); c.fill(); }
      c.restore();
    } else if (u.type === 'golem') {
      c.fillStyle = '#a5643a'; c.fillRect(-0.2 + leg, -0.25, 0.14, 0.3); c.fillRect(0.06 - leg, -0.25, 0.14, 0.3);
      c.fillStyle = '#c27a47'; c.beginPath(); c.ellipse(0, -0.5, 0.38, 0.32, 0, 0, 7); c.fill();
      c.fillStyle = '#9c5a30'; c.beginPath(); c.arc(face * -0.38, -0.45 + swing * 0.1, 0.13, 0, 7); c.arc(face * 0.4, -0.45 - swing * 0.15, 0.13, 0, 7); c.fill();
      c.fillStyle = '#b06a3c'; c.beginPath(); c.arc(0, -0.88, 0.17, 0, 7); c.fill();
      c.fillStyle = col; c.fillRect(-0.3, -0.55, 0.6, 0.08);
      c.fillStyle = '#ffe27a'; c.fillRect(face * 0.05 - 0.04, -0.92, 0.05, 0.04); c.fillRect(face * 0.05 + 0.04, -0.92, 0.05, 0.04);
    } else {
      c.fillStyle = '#4a3020'; c.fillRect(-0.1 + leg, -0.12, 0.07, 0.17); c.fillRect(0.03 - leg, -0.12, 0.07, 0.17);
      const tunic = u.type === 'worker' ? '#9a7a52' : col;
      this.body(c, 0, -0.27, 0.16, tunic, face);
      if (u.type === 'worker') {
        c.fillStyle = col; c.fillRect(-0.15, -0.3, 0.3, 0.06);
        c.fillStyle = '#d8b66a'; c.beginPath(); c.ellipse(0, -0.6, 0.15, 0.05, 0, 0, 7); c.fill();
        if (u.work) {
          c.strokeStyle = '#6b4a2b'; c.lineWidth = 0.04;
          const a = -0.6 + swing * 0.9;
          c.beginPath(); c.moveTo(face * 0.08, -0.32); c.lineTo(face * (0.08 + Math.cos(a) * 0.3), -0.32 + Math.sin(a) * 0.3); c.stroke();
        }
        if (u.carryN > 0.5) {
          const cc = { food: '#d4364a', wood: '#8a5a33', gold: '#f2c230', clay: '#c06a3c' }[u.carry] || '#888';
          c.fillStyle = cc; c.fillRect(-face * 0.22 - 0.07, -0.42, 0.14, 0.14);
        }
      } else if (u.type === 'spear') {
        c.strokeStyle = '#7a5a3a'; c.lineWidth = 0.035;
        const tip = 0.55 + (u.atkT > 0 ? 0.15 * Math.max(0, swing) : 0);
        c.beginPath(); c.moveTo(face * 0.12, -0.05); c.lineTo(face * 0.12 + face * tip * 0.6, -0.8); c.stroke();
        c.fillStyle = '#ddd'; c.beginPath(); c.arc(face * 0.12 + face * tip * 0.6, -0.8, 0.04, 0, 7); c.fill();
        this.helmet(c, '#8f8f8f');
      } else if (u.type === 'sword') {
        c.fillStyle = shade(col, -0.25); c.beginPath(); c.arc(-face * 0.15, -0.3, 0.12, 0, 7); c.fill();
        c.strokeStyle = '#ddd'; c.lineWidth = 0.05;
        const a = -1.2 + swing * 1.1;
        c.beginPath(); c.moveTo(face * 0.14, -0.3); c.lineTo(face * (0.14 + Math.cos(a) * 0.35), -0.3 + Math.sin(a) * 0.35); c.stroke();
        this.helmet(c, '#b8a060');
      } else if (u.type === 'archer') {
        c.strokeStyle = '#6b4a2b'; c.lineWidth = 0.035;
        c.beginPath(); c.arc(face * 0.12, -0.32, 0.22, face > 0 ? -1.2 : Math.PI - 1.2 + 0.4, face > 0 ? 1.2 : Math.PI + 1.2 - 0.4 + 0.0001); c.stroke();
        c.fillStyle = '#5a7a3a'; c.beginPath(); c.moveTo(-0.13, -0.6); c.lineTo(0.13, -0.6); c.lineTo(0, -0.78); c.fill();
      }
    }
    if (u.type === 'priest') {
      // Robe, Stola in Spielerfarbe und Stab mit leuchtender Kugel
      c.fillStyle = '#efe6d2'; c.beginPath(); c.moveTo(-0.17, 0.02); c.lineTo(0.17, 0.02); c.lineTo(0.12, -0.4); c.lineTo(-0.12, -0.4); c.closePath(); c.fill();
      c.fillStyle = col; c.fillRect(-0.04, -0.4, 0.08, 0.4);
      c.fillStyle = '#f0c8a0'; c.beginPath(); c.arc(face * 0.02, -0.5, 0.1, 0, 7); c.fill();
      c.fillStyle = '#efe6d2'; c.beginPath(); c.arc(face * 0.02, -0.53, 0.105, Math.PI, 0); c.fill();
      c.strokeStyle = '#8a6a3a'; c.lineWidth = 0.035;
      c.beginPath(); c.moveTo(face * 0.2, 0.02); c.lineTo(face * 0.2, -0.72); c.stroke();
      const glow = u.healT > 0 ? 0.6 + Math.sin(time * 12) * 0.3 : 0.35;
      c.fillStyle = `rgba(140,255,160,${glow})`; c.beginPath(); c.arc(face * 0.2, -0.76, u.healT > 0 ? 0.11 : 0.07, 0, 7); c.fill();
    }
    c.restore();
    if (u.healT > 0 && u.type !== 'priest') {
      // Heilfunken steigen auf
      for (let k = 0; k < 3; k++) {
        const ph = (time * 1.5 + k / 3 + u.id * 0.17) % 1;
        const hx = sx + Math.sin(k * 2.1 + u.id) * s * 0.25, hy = sy - s * (0.3 + ph * 0.8);
        c.fillStyle = `rgba(120,255,140,${1 - ph})`;
        c.fillRect(hx - s * 0.06, hy - s * 0.015, s * 0.12, s * 0.03); c.fillRect(hx - s * 0.015, hy - s * 0.06, s * 0.03, s * 0.12);
      }
    }
  }
  body(c, x, y, r, col, face) {
    c.fillStyle = shade(col, -0.25); c.beginPath(); c.arc(x, y + 0.02, r, 0, 7); c.fill();
    c.fillStyle = col; c.beginPath(); c.arc(x, y, r * 0.9, 0, 7); c.fill();
    c.fillStyle = '#f0c8a0'; c.beginPath(); c.arc(x + face * 0.02, y - r - 0.1, 0.1, 0, 7); c.fill();
  }
  helmet(c, col) { c.fillStyle = col; c.beginPath(); c.arc(0.0, -0.56, 0.105, Math.PI, 0); c.fill(); }

  hpBar(e, isSel) {
    const c = this.ctx, s = this.scale;
    let x, y, w;
    if (e.cls === 'u') { x = e.x; y = e.y - (e.type === 'rider' || e.type === 'golem' ? 1.15 : 0.95); w = 0.7; }
    else { x = e.x; y = e.ty - (BUILD_TOP[e.type] || 0) * 0.6 - 0.1; w = Math.min(2.4, e.w * 0.7); }
    const [sx, sy] = this.toScreen(x, y);
    const bw = w * s, bh = Math.max(3, s * 0.1);
    const f = Math.max(0, e.hp / e.maxHp);
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(sx - bw / 2 - 1, sy - 1, bw + 2, bh + 2);
    c.fillStyle = f > 0.6 ? '#4ade4a' : f > 0.3 ? '#e8c23a' : '#e5483b';
    if (e.owner !== 0) c.fillStyle = f > 0.3 ? '#e5574a' : '#a8281e';
    c.fillRect(sx - bw / 2, sy, bw * f, bh);
    if (e.cls === 'b' && !e.done) { c.fillStyle = '#7fc8ff'; c.fillRect(sx - bw / 2, sy + bh + 1, bw * e.prog, Math.max(2, bh * 0.6)); }
    if (e.cls === 'b' && e.queue && e.queue.length && e.owner === 0 && isSel) {
      const q = e.queue[0], tt = q.k === 'u' ? UNITS[q.key].time : 1;
      const qt = q.k === 'u' ? q.t / tt : 0;
      if (q.k === 'u') { c.fillStyle = '#ffd36a'; c.fillRect(sx - bw / 2, sy + bh + 1, bw * qt, Math.max(2, bh * 0.6)); }
    }
  }

  drawProjectiles() {
    const c = this.ctx, s = this.scale, g = this.g;
    c.strokeStyle = '#3a2a1a'; c.lineWidth = Math.max(1, s * 0.05);
    for (const p of g.projectiles) {
      if (!this.inView(p.x, p.y, 1)) continue;
      if (g.vis[Math.floor(p.y) * g.W + Math.floor(p.x)] !== 2) continue;
      const total = p.d0, done = Math.hypot(p.x - p.sx, p.y - p.sy), k = Math.min(1, done / total);
      const arc = Math.sin(k * Math.PI) * Math.min(1.2, total * 0.12);
      const [sx, sy] = this.toScreen(p.x, p.y - arc);
      if (p.stone) {
        const [gx, gy] = this.toScreen(p.x, p.y);
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(gx, gy, s * 0.15, s * 0.07, 0, 0, 7); c.fill();
        const [hx, hy] = this.toScreen(p.x, p.y - Math.sin(k * Math.PI) * Math.min(3, total * 0.3));
        c.fillStyle = '#7a756c'; c.beginPath(); c.arc(hx, hy, s * 0.16, 0, 7); c.fill();
        c.fillStyle = '#a9a398'; c.beginPath(); c.arc(hx - s * 0.05, hy - s * 0.05, s * 0.07, 0, 7); c.fill();
        continue;
      }
      const dir = p.dir || 0, l = s * 0.35;
      c.beginPath(); c.moveTo(sx - Math.cos(dir) * l / 2, sy - Math.sin(dir) * l / 2 + (k < 0.5 ? l * 0.2 : -l * 0.2)); c.lineTo(sx + Math.cos(dir) * l / 2, sy + Math.sin(dir) * l / 2); c.stroke();
    }
  }

  drawFog() {
    const g = this.g, c = this.ctx;
    if (g.revealAll) return;
    const now = performance.now();
    if (now - this.fogT > 150) {
      this.fogT = now;
      const d = this.fogImg.data, vis = g.vis;
      for (let i = 0; i < vis.length; i++) {
        const v = vis[i], k = i * 4;
        d[k] = 8; d[k + 1] = 6; d[k + 2] = 5;
        d[k + 3] = v === 2 ? 0 : v === 1 ? 135 : 255;
      }
      this.fogCtx.putImageData(this.fogImg, 0, 0);
    }
    const [sx, sy] = this.toScreen(0, 0), s = this.scale;
    c.imageSmoothingEnabled = true;
    c.drawImage(this.fogCv, sx, sy, g.W * s, g.H * s);
  }

  drawGhost(gh) {
    const c = this.ctx, s = this.scale, d = BUILDINGS[gh.type];
    const [sx, sy] = this.toScreen(gh.tx, gh.ty);
    const ok = this.g.canPlace(gh.type, gh.tx, gh.ty, 0);
    if (d.walk) { c.fillStyle = 'rgba(200,170,90,0.5)'; c.fillRect(sx, sy, d.w * s, d.h * s); }
    else this.drawSprite(this.buildingSprite(gh.type, 0), gh.tx, gh.ty, 0.6);
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
    const d = this.mmImg.data, ter = g.terrain, vis = g.vis, W = g.W;
    const tc = [[121, 166, 74], [54, 120, 168], [106, 174, 176], [216, 196, 140], [168, 138, 92]];
    for (let i = 0; i < ter.length; i++) {
      const k = i * 4, v = g.revealAll ? 2 : vis[i];
      if (!v) { d[k] = 12; d[k + 1] = 10; d[k + 2] = 8; d[k + 3] = 255; continue; }
      let col = tc[ter[i]];
      const id = g.occ[i];
      if (id) {
        const e = g.ents.get(id);
        if (e && e.cls === 'r') col = e.kind === 'tree' ? [40, 92, 36] : e.kind === 'gold' ? [240, 200, 50] : e.kind === 'clay' ? [200, 110, 60] : [200, 60, 90];
        else if (e && e.cls === 'b' && (e.owner === 0 || e.seen)) col = hexRgb(g.players[e.owner].color);
      }
      const f = v === 2 ? 1 : 0.55;
      d[k] = col[0] * f; d[k + 1] = col[1] * f; d[k + 2] = col[2] * f; d[k + 3] = 255;
    }
    this.mmBaseCtx.putImageData(this.mmImg, 0, 0);
    m.imageSmoothingEnabled = false;
    m.drawImage(this.mmBase, 0, 0, size, size);
    const k = size / g.W;
    for (const e of g.ents.values()) {
      if (e.cls !== 'u') continue;
      if (e.owner !== 0 && vis[Math.floor(e.y) * W + Math.floor(e.x)] !== 2) continue;
      m.fillStyle = g.players[e.owner].color;
      m.fillRect(e.x * k - 1.5, e.y * k - 1.5, 3, 3);
    }
    if (this.ping && now - this.ping.t < 3000) {
      const a = (now - this.ping.t) / 3000;
      m.strokeStyle = `rgba(255,60,60,${1 - a})`; m.lineWidth = 2;
      m.beginPath(); m.arc(this.ping.x * k, this.ping.y * k, 4 + a * 14, 0, 7); m.stroke();
    }
    const s = this.scale;
    m.strokeStyle = '#fff'; m.lineWidth = 1.5;
    m.strokeRect(this.cam.x * k, this.cam.y * k, (this.w / s) * k, (this.h / s) * k);
  }
}

function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
