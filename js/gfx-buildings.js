// Claycrown 2.0: Gebäudegrafik in schräger Draufsicht.
// Koordinaten in Kacheln, (0,0) ist die linke obere Ecke der Grundfläche, negative y ragen nach oben.
// Jede Zeichenfunktion sammelt Ankerpunkte: Fenster für Nachtlicht, Fahnen, Rauch und Feuer.
import { shade, hash, OUT } from './gfx-util.js?v=202';

const MAT = {
  adobe: { top: '#ecc59a', front: '#cf9564', tex: 'adobe' },
  brick: { top: '#d48a62', front: '#b0603c', tex: 'brick' },
  stone: { top: '#c4bdb2', front: '#9c958a', tex: 'stone' },
  plaster: { top: '#f4e8d0', front: '#dcc8a4', tex: 'adobe' },
  wood: { top: '#b4834f', front: '#8a5a33', tex: 'wood' },
  dark: { top: '#8c8780', front: '#6a655e', tex: 'stone' },
  clay: { top: '#e3a77a', front: '#c07a4c', tex: 'adobe' },
  rough: { top: '#d9b08a', front: '#b5845a', tex: 'adobe' },
  marble: { top: '#f7f3ea', front: '#dcd4c4', tex: 'stone' },
};

// Zeitalterstil: Lehmzeit roh, Brennofenzeit gebrannt, Bronzezeit Stein und Bronze, Kronenzeit Marmor und Gold
let AGE = 1;
export function setBuildAge(a) { AGE = Math.max(0, Math.min(3, a | 0)); }
const AGE_MAT = [
  { brick: 'adobe', stone: 'rough', plaster: 'adobe', dark: 'rough' },
  {},
  { adobe: 'brick', brick: 'stone', clay: 'brick' },
  { adobe: 'marble', brick: 'marble', stone: 'marble', plaster: 'marble', dark: 'stone' },
];
const TRIM = [null, null, '#c98f3c', '#f2c53d'];
const matOf = m => AGE_MAT[AGE][m] || m;
const WOOD = '#8a5a33', WOOD_D = '#5e3a1f', GOLD = '#f2c53d';

function texture(c, x, y, w, h, tex, seed) {
  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  if (tex === 'brick') {
    c.strokeStyle = 'rgba(70,30,15,0.35)'; c.lineWidth = 0.018;
    const rh = 0.11;
    for (let r = 0, yy = y + rh; yy < y + h; r++, yy += rh) {
      c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy); c.stroke();
      for (let xx = x + (r % 2 ? 0.1 : 0.2); xx < x + w; xx += 0.2) { c.beginPath(); c.moveTo(xx, yy - rh); c.lineTo(xx, yy); c.stroke(); }
    }
  } else if (tex === 'stone') {
    c.strokeStyle = 'rgba(40,35,30,0.35)'; c.lineWidth = 0.02;
    const rh = 0.17;
    for (let r = 0, yy = y; yy < y + h; r++, yy += rh) {
      c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy); c.stroke();
      let xx = x + hash(seed, r) * 0.2;
      while (xx < x + w) {
        c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx, yy + rh); c.stroke();
        c.fillStyle = `rgba(255,255,255,${0.04 + hash(r, xx * 10 | 0) * 0.08})`; c.fillRect(xx + 0.02, yy + 0.02, 0.2, rh - 0.04);
        xx += 0.22 + hash(xx * 7 | 0, r + seed) * 0.16;
      }
    }
  } else if (tex === 'wood') {
    c.strokeStyle = 'rgba(40,20,8,0.4)'; c.lineWidth = 0.018;
    for (let xx = x + 0.12; xx < x + w; xx += 0.14) { c.beginPath(); c.moveTo(xx, y); c.lineTo(xx, y + h); c.stroke(); }
    c.fillStyle = 'rgba(255,230,200,0.06)';
    for (let xx = x + 0.02; xx < x + w; xx += 0.28) c.fillRect(xx, y, 0.06, h);
  } else {
    for (let i = 0; i < w * h * 30; i++) {
      c.fillStyle = hash(seed, i) > 0.5 ? 'rgba(255,240,220,0.12)' : 'rgba(80,40,20,0.1)';
      c.fillRect(x + hash(i, seed + 1) * w, y + hash(seed + 2, i) * h, 0.04 + hash(i, 9) * 0.06, 0.025);
    }
    c.strokeStyle = 'rgba(90,50,25,0.25)'; c.lineWidth = 0.012;
    for (let i = 0; i < 2; i++) {
      const sx = x + hash(seed, i + 40) * w, sy = y + hash(i + 40, seed) * h * 0.5;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 0.05, sy + 0.1); c.lineTo(sx + 0.02, sy + 0.2); c.stroke();
    }
  }
  c.restore();
}

// Quader: Grundfläche x,y,w,d und Höhe z
function block(c, x, y, w, d, z, mat, seed = 1) {
  const m = MAT[matOf(mat)] || MAT.adobe;
  // Vorderseite
  const g = c.createLinearGradient(0, y + d - z, 0, y + d);
  g.addColorStop(0, shade(m.front, 0.08)); g.addColorStop(0.75, m.front); g.addColorStop(1, shade(m.front, -0.3));
  c.fillStyle = g; c.fillRect(x, y + d - z, w, z);
  texture(c, x, y + d - z, w, z, m.tex, seed);
  // seitlicher Lichtabfall
  const sg = c.createLinearGradient(x, 0, x + w, 0);
  sg.addColorStop(0, 'rgba(255,240,210,0.1)'); sg.addColorStop(1, 'rgba(40,20,10,0.12)');
  c.fillStyle = sg; c.fillRect(x, y + d - z, w, z);
  // Oberseite
  const tg = c.createLinearGradient(x, y - z, x + w, y + d - z);
  tg.addColorStop(0, shade(m.top, 0.12)); tg.addColorStop(1, shade(m.top, -0.08));
  c.fillStyle = tg; c.fillRect(x, y - z, w, d);
  texture(c, x, y - z, w, d, m.tex === 'wood' ? 'wood' : 'adobe', seed + 5);
  c.strokeStyle = OUT; c.lineWidth = 0.03; c.lineJoin = 'round';
  c.strokeRect(x, y - z, w, d); c.strokeRect(x, y + d - z, w, z);
  c.strokeStyle = 'rgba(255,245,225,0.35)'; c.lineWidth = 0.02;
  c.beginPath(); c.moveTo(x + 0.02, y + d - z + 0.015); c.lineTo(x + w - 0.02, y + d - z + 0.015); c.stroke();
  // Zierband aus Bronze oder Gold ab der Bronzezeit
  if (TRIM[AGE] && z > 0.35) {
    c.fillStyle = OUT; c.fillRect(x, y + d - z + 0.05, w, 0.065);
    c.fillStyle = TRIM[AGE]; c.fillRect(x, y + d - z + 0.06, w, 0.045);
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x, y + d - z + 0.06, w, 0.015);
  }
  // Lehmzeit: Risse und Flickstellen
  if (AGE === 0 && z > 0.3) {
    c.strokeStyle = 'rgba(80,45,20,0.4)'; c.lineWidth = 0.018;
    for (let i = 0; i < Math.ceil(w * 1.5); i++) {
      const sx = x + hash(seed + 9, i) * w, sy = y + d - z + 0.1 + hash(i, seed + 9) * z * 0.6;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 0.06, sy + 0.12); c.lineTo(sx + 0.02, sy + 0.24); c.stroke();
    }
  }
}

// Satteldach in Spielerfarbe mit Ziegelreihen
function roof(c, x, y, w, d, z, col, rh = 0.38, ov = 0.08) {
  if (AGE === 0) return thatch(c, x, y, w, d, z, col, rh, ov + 0.04);
  if (AGE === 2) col = shade(col, -0.28);
  const top = y - z - ov * 0.5, mid = y + d / 2 - z - rh, bot = y + d - z + ov;
  const back = c.createLinearGradient(0, top, 0, mid);
  back.addColorStop(0, shade(col, 0.05)); back.addColorStop(1, shade(col, 0.32));
  c.fillStyle = back; c.fillRect(x - ov, top, w + ov * 2, mid - top);
  const front = c.createLinearGradient(0, mid, 0, bot);
  front.addColorStop(0, shade(col, -0.02)); front.addColorStop(1, shade(col, -0.38));
  c.fillStyle = front; c.fillRect(x - ov, mid, w + ov * 2, bot - mid);
  // Ziegel
  c.strokeStyle = 'rgba(20,10,5,0.22)'; c.lineWidth = 0.016;
  for (let yy = mid + 0.1; yy < bot; yy += 0.1) { c.beginPath(); c.moveTo(x - ov, yy); c.lineTo(x + w + ov, yy); c.stroke(); }
  for (let yy = mid - 0.1; yy > top; yy -= 0.1) { c.beginPath(); c.moveTo(x - ov, yy); c.lineTo(x + w + ov, yy); c.stroke(); }
  c.strokeStyle = 'rgba(20,10,5,0.14)';
  let r = 0;
  if (AGE === 2) {
    // Schiefer: Schuppen
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.014;
    for (let yy = mid + 0.02; yy < bot - 0.04; yy += 0.1, r++) for (let xx = x - ov + (r % 2) * 0.07; xx < x + w + ov; xx += 0.14) { c.beginPath(); c.arc(xx + 0.07, yy + 0.03, 0.07, 0.1, Math.PI - 0.1); c.stroke(); }
  } else for (let yy = mid; yy < bot - 0.05; yy += 0.1, r++) for (let xx = x - ov + (r % 2) * 0.07; xx < x + w + ov; xx += 0.14) { c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx, yy + 0.1); c.stroke(); }
  if (AGE === 3) {
    // Glasur: Glanzstreifen
    const gl = c.createLinearGradient(0, mid, 0, bot);
    gl.addColorStop(0, 'rgba(255,255,255,0.0)'); gl.addColorStop(0.3, 'rgba(255,255,255,0.28)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)');
    c.fillStyle = gl; c.fillRect(x - ov, mid, w + ov * 2, bot - mid);
  }
  c.strokeStyle = OUT; c.lineWidth = 0.032;
  c.strokeRect(x - ov, top, w + ov * 2, bot - top);
  // First
  c.strokeStyle = TRIM[AGE] || shade(col, 0.5); c.lineWidth = TRIM[AGE] ? 0.06 : 0.035;
  c.beginPath(); c.moveTo(x - ov, mid); c.lineTo(x + w + ov, mid); c.stroke();
  if (TRIM[AGE]) for (const fx of [x - ov, x + w + ov]) { c.fillStyle = OUT; c.beginPath(); c.arc(fx, mid, 0.065, 0, 7); c.fill(); c.fillStyle = TRIM[AGE]; c.beginPath(); c.arc(fx, mid, 0.048, 0, 7); c.fill(); }
  c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.02;
  c.beginPath(); c.moveTo(x - ov, mid + 0.03); c.lineTo(x + w + ov, mid + 0.03); c.stroke();
  // Traufschatten
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, bot, w, 0.06);
}

// Strohdach der Lehmzeit, First in Spielerfarbe
function thatch(c, x, y, w, d, z, col, rh, ov) {
  const top = y - z - ov * 0.5, mid = y + d / 2 - z - rh, bot = y + d - z + ov;
  const straw = '#c9a85a';
  c.fillStyle = OUT; c.beginPath(); c.moveTo(x - ov - 0.02, top - 0.02); c.lineTo(x + w + ov + 0.02, top - 0.02); c.lineTo(x + w + ov + 0.04, bot + 0.04); c.quadraticCurveTo(x + w / 2, bot + 0.1, x - ov - 0.04, bot + 0.04); c.closePath(); c.fill();
  const back = c.createLinearGradient(0, top, 0, mid);
  back.addColorStop(0, shade(straw, -0.05)); back.addColorStop(1, shade(straw, 0.25));
  c.fillStyle = back; c.fillRect(x - ov, top, w + ov * 2, mid - top);
  const front = c.createLinearGradient(0, mid, 0, bot);
  front.addColorStop(0, straw); front.addColorStop(1, shade(straw, -0.4));
  c.fillStyle = front; c.beginPath(); c.moveTo(x - ov, mid); c.lineTo(x + w + ov, mid); c.lineTo(x + w + ov + 0.02, bot); c.quadraticCurveTo(x + w / 2, bot + 0.07, x - ov - 0.02, bot); c.closePath(); c.fill();
  // Halme
  c.lineWidth = 0.014;
  for (let i = 0; i < (w + ov * 2) * 22; i++) {
    const sx = x - ov + hash(i, 3) * (w + ov * 2), sy = mid + hash(4, i) * (bot - mid) * 0.9;
    c.strokeStyle = hash(i, 7) > 0.5 ? 'rgba(90,60,20,0.35)' : 'rgba(255,240,170,0.35)';
    c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 0.01, sy + 0.12); c.stroke();
  }
  for (let i = 0; i < (w + ov * 2) * 10; i++) {
    const sx = x - ov + hash(i, 13) * (w + ov * 2), sy = top + hash(14, i) * (mid - top);
    c.strokeStyle = 'rgba(90,60,20,0.25)'; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx, sy + 0.08); c.stroke();
  }
  // gebundener First in Spielerfarbe
  c.fillStyle = OUT; c.fillRect(x - ov - 0.02, mid - 0.08, w + ov * 2 + 0.04, 0.16);
  c.fillStyle = col; c.fillRect(x - ov, mid - 0.065, w + ov * 2, 0.13);
  c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.015;
  for (let xx = x - ov + 0.12; xx < x + w + ov; xx += 0.2) { c.beginPath(); c.moveTo(xx, mid - 0.065); c.lineTo(xx, mid + 0.065); c.stroke(); }
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, bot + 0.02, w, 0.06);
}

function cone(c, cx, by, r, h, col) {
  if (AGE === 0) col = shade(col, -0.05);
  if (AGE === 2) col = shade(col, -0.28);
  const g = c.createLinearGradient(cx - r, 0, cx + r, 0);
  g.addColorStop(0, shade(col, 0.35)); g.addColorStop(0.45, col); g.addColorStop(1, shade(col, -0.4));
  c.fillStyle = g;
  c.beginPath(); c.moveTo(cx - r, by); c.lineTo(cx, by - h); c.lineTo(cx + r, by); c.quadraticCurveTo(cx, by + r * 0.3, cx - r, by); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.2)'; c.lineWidth = 0.015;
  for (let k = 1; k < 4; k++) { const t = k / 4; c.beginPath(); c.moveTo(cx - r * (1 - t), by - h * t); c.lineTo(cx + r * (1 - t), by - h * t); c.stroke(); }
  c.strokeStyle = OUT; c.lineWidth = 0.03;
  c.beginPath(); c.moveTo(cx - r, by); c.lineTo(cx, by - h); c.lineTo(cx + r, by); c.quadraticCurveTo(cx, by + r * 0.3, cx - r, by); c.stroke();
  if (AGE === 0) { c.fillStyle = OUT; c.beginPath(); c.arc(cx, by - h, 0.055, 0, 7); c.fill(); c.fillStyle = '#7a5232'; c.beginPath(); c.arc(cx, by - h, 0.04, 0, 7); c.fill(); }
  else if (AGE === 1) { c.fillStyle = GOLD; c.beginPath(); c.arc(cx, by - h, 0.04, 0, 7); c.fill(); }
  else {
    const t = TRIM[AGE], L = AGE === 3 ? 0.3 : 0.22;
    c.strokeStyle = OUT; c.lineWidth = 0.05; c.beginPath(); c.moveTo(cx, by - h); c.lineTo(cx, by - h - L); c.stroke();
    c.strokeStyle = t; c.lineWidth = 0.03; c.beginPath(); c.moveTo(cx, by - h); c.lineTo(cx, by - h - L); c.stroke();
    c.fillStyle = OUT; c.beginPath(); c.arc(cx, by - h - L * 0.45, AGE === 3 ? 0.07 : 0.055, 0, 7); c.fill();
    c.fillStyle = t; c.beginPath(); c.arc(cx, by - h - L * 0.45, AGE === 3 ? 0.055 : 0.04, 0, 7); c.fill();
    if (AGE === 3) { c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 0.012; c.beginPath(); c.arc(cx - 0.015, by - h - L * 0.45 - 0.015, 0.025, 3.5, 5); c.stroke(); }
  }
}

function door(c, x, y, w, h, arch = true) {
  c.fillStyle = OUT; c.beginPath();
  c.moveTo(x - 0.02, y); c.lineTo(x - 0.02, y - h + (arch ? w / 2 : 0));
  if (arch) c.arc(x + w / 2, y - h + w / 2, w / 2 + 0.02, Math.PI, 0); else c.lineTo(x + w + 0.02, y - h);
  c.lineTo(x + w + 0.02, y); c.fill();
  const g = c.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#6a4226'); g.addColorStop(1, '#3e2414');
  c.fillStyle = g; c.beginPath();
  c.moveTo(x, y); c.lineTo(x, y - h + (arch ? w / 2 : 0));
  if (arch) c.arc(x + w / 2, y - h + w / 2, w / 2, Math.PI, 0); else c.lineTo(x + w, y - h);
  c.lineTo(x + w, y); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.012;
  for (let xx = x + w / 3; xx < x + w; xx += w / 3) { c.beginPath(); c.moveTo(xx, y); c.lineTo(xx, y - h + w / 2); c.stroke(); }
  c.fillStyle = GOLD; c.beginPath(); c.arc(x + w * 0.75, y - h * 0.45, 0.018, 0, 7); c.fill();
}

function win(c, x, y, w, h, A, warm = true) {
  c.fillStyle = OUT; c.fillRect(x - 0.02, y - h - 0.02, w + 0.04, h + 0.04);
  c.fillStyle = '#2a1c14'; c.fillRect(x, y - h, w, h);
  c.fillStyle = 'rgba(255,214,140,0.28)'; c.fillRect(x, y - h, w, h * 0.45);
  c.strokeStyle = '#7a5a3a'; c.lineWidth = 0.015;
  c.beginPath(); c.moveTo(x + w / 2, y - h); c.lineTo(x + w / 2, y); c.moveTo(x, y - h / 2); c.lineTo(x + w, y - h / 2); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(x - 0.03, y, w + 0.06, 0.025);
  if (A) A.lights.push([x + w / 2, y - h / 2, warm ? 1 : 0.6]);
}

function crenel(c, x, y, w, z, mat) {
  const m = MAT[matOf(mat)] || MAT.adobe;
  if (AGE === 0) {
    // Lehmzeit: Palisadenspitzen aus Holz statt Zinnen
    for (let i = 0; i < w - 0.03; i += 0.12) {
      c.fillStyle = OUT; c.beginPath(); c.moveTo(x + i - 0.01, y - z + 0.02); c.lineTo(x + i + 0.05, y - z - 0.16); c.lineTo(x + i + 0.11, y - z + 0.02); c.fill();
      c.fillStyle = i % 0.24 < 0.12 ? '#8a5a33' : '#7a4e2c'; c.beginPath(); c.moveTo(x + i, y - z + 0.01); c.lineTo(x + i + 0.05, y - z - 0.14); c.lineTo(x + i + 0.1, y - z + 0.01); c.fill();
    }
    return;
  }
  for (let i = 0; i < w - 0.05; i += 0.26) {
    c.fillStyle = OUT; c.fillRect(x + i - 0.015, y - z - 0.15, 0.17, 0.17);
    c.fillStyle = m.top; c.fillRect(x + i, y - z - 0.14, 0.14, 0.15);
    c.fillStyle = shade(m.front, -0.1); c.fillRect(x + i, y - z - 0.04, 0.14, 0.05);
  }
}

function pole(c, x, y, h, A) {
  c.strokeStyle = OUT; c.lineWidth = 0.055; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h); c.stroke();
  c.strokeStyle = '#6b4a2b'; c.lineWidth = 0.032; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h); c.stroke();
  c.fillStyle = GOLD; c.beginPath(); c.arc(x, y - h, 0.035, 0, 7); c.fill();
  if (A) A.flags.push([x, y - h + 0.04]);
}

function torch(c, x, y, A) {
  c.fillStyle = '#3a2614'; c.fillRect(x - 0.02, y - 0.1, 0.04, 0.14);
  c.fillStyle = '#ffb347'; c.beginPath(); c.arc(x, y - 0.13, 0.035, 0, 7); c.fill();
  if (A) { A.lights.push([x, y - 0.14, 1.6]); A.fire.push([x, y - 0.14, 0.4]); }
}

function barrel(c, x, y) {
  c.fillStyle = OUT; c.beginPath(); c.ellipse(x, y - 0.12, 0.1, 0.14, 0, 0, 7); c.fill();
  c.fillStyle = '#8a5a33'; c.beginPath(); c.ellipse(x, y - 0.12, 0.085, 0.125, 0, 0, 7); c.fill();
  c.strokeStyle = '#3a2a1a'; c.lineWidth = 0.018; c.beginPath(); c.moveTo(x - 0.085, y - 0.18); c.lineTo(x + 0.085, y - 0.18); c.moveTo(x - 0.085, y - 0.06); c.lineTo(x + 0.085, y - 0.06); c.stroke();
}

function crate(c, x, y, s = 0.18) {
  c.fillStyle = OUT; c.fillRect(x - 0.015, y - s - 0.015, s + 0.03, s + 0.03);
  c.fillStyle = '#b07a44'; c.fillRect(x, y - s, s, s);
  c.strokeStyle = '#6a4424'; c.lineWidth = 0.015; c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s, y); c.moveTo(x + s, y - s); c.lineTo(x, y); c.stroke();
}

function banner(c, x, y, col, w = 0.18, h = 0.36) {
  c.fillStyle = OUT; c.fillRect(x - 0.015, y - 0.015, w + 0.03, h + 0.03);
  c.fillStyle = col; c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h); c.lineTo(x + w / 2, y + h - 0.07); c.lineTo(x, y + h); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x, y, w * 0.3, h * 0.9);
  c.fillStyle = GOLD; c.beginPath(); c.arc(x + w / 2, y + h * 0.38, w * 0.22, 0, 7); c.fill();
  if (AGE === 3) { c.strokeStyle = GOLD; c.lineWidth = 0.02; c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h); c.stroke(); }
}

function anvil(c, x, y) {
  c.fillStyle = OUT; c.fillRect(x - 0.15, y - 0.16, 0.3, 0.09);
  c.fillStyle = '#4a4d52'; c.fillRect(x - 0.13, y - 0.15, 0.26, 0.07);
  c.fillStyle = '#3a3c40'; c.fillRect(x - 0.05, y - 0.08, 0.1, 0.08);
}

function target(c, x, y) {
  c.fillStyle = WOOD_D; c.fillRect(x - 0.025, y - 0.3, 0.05, 0.3);
  for (const [r, col] of [[0.18, OUT], [0.165, '#f4ead7'], [0.12, '#d43c2c'], [0.075, '#f4ead7'], [0.035, '#d43c2c']]) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y - 0.36, r, r * 1.05, 0, 0, 7); c.fill(); }
}

function hay(c, x, y) {
  c.fillStyle = OUT; c.beginPath(); c.ellipse(x, y - 0.1, 0.17, 0.13, 0, 0, 7); c.fill();
  c.fillStyle = '#e2c45a'; c.beginPath(); c.ellipse(x, y - 0.1, 0.155, 0.115, 0, 0, 7); c.fill();
  c.strokeStyle = '#b8962e'; c.lineWidth = 0.012;
  for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x + k * 0.05, y - 0.2); c.lineTo(x + k * 0.04, y); c.stroke(); }
}

function logs(c, x, y, n = 4) {
  for (let r = 0; r < 3; r++) for (let i = 0; i < n - r; i++) {
    const lx = x + i * 0.26 + r * 0.13, ly = y - r * 0.2;
    c.fillStyle = OUT; c.beginPath(); c.arc(lx, ly, 0.125, 0, 7); c.fill();
    c.fillStyle = WOOD; c.beginPath(); c.arc(lx, ly, 0.11, 0, 7); c.fill();
    c.fillStyle = '#e0bb84'; c.beginPath(); c.arc(lx, ly, 0.075, 0, 7); c.fill();
    c.strokeStyle = 'rgba(120,80,40,0.6)'; c.lineWidth = 0.01; c.beginPath(); c.arc(lx, ly, 0.04, 0, 7); c.stroke();
  }
}

export const BUILD_DRAW = {
  keep(c, col, A) {
    // Ringmauer
    block(c, 0.15, 0.3, 3.7, 3.45, 0.6, 'adobe', 3);
    c.fillStyle = '#c89a6c'; c.fillRect(0.45, -0.02, 3.1, 2.75);
    c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(0.45, -0.02, 3.1, 0.15);
    crenel(c, 0.15, 3.75 - 3.45, 3.7, 0.6, 'adobe');
    // Bergfried
    block(c, 1.0, 0.75, 2.0, 1.95, 1.75, 'brick', 4);
    crenel(c, 1.0, 0.75, 2.0, 1.75, 'brick');
    banner(c, 1.15, 2.7 - 1.62, col, 0.22, 0.5);
    banner(c, 2.63, 2.7 - 1.62, col, 0.22, 0.5);
    win(c, 1.55, 2.7 - 1.2, 0.16, 0.24, A); win(c, 2.28, 2.7 - 1.2, 0.16, 0.24, A);
    win(c, 1.92, 2.7 - 0.6, 0.16, 0.22, A);
    // Ecktürme
    for (const [x, y] of [[0.0, 0.2], [3.25, 0.2], [0.0, 3.1], [3.25, 3.1]]) {
      block(c, x, y, 0.75, 0.7, 1.1, 'adobe', x * 3 + y);
      cone(c, x + 0.375, y - 1.05, 0.5, 0.75, col);
      win(c, x + 0.3, y + 0.7 - 0.55, 0.13, 0.18, A);
    }
    door(c, 1.62, 3.75, 0.76, 0.6);
    torch(c, 1.45, 3.75 - 0.42, A); torch(c, 2.55, 3.75 - 0.42, A);
    pole(c, 2.0, 0.75 - 1.75 - 0.12, 0.85, A);
  },

  house(c, col, A) {
    block(c, 0.22, 0.5, 1.56, 1.25, 0.62, 'plaster', 7);
    // Fachwerk
    c.strokeStyle = '#5e3a1f'; c.lineWidth = 0.045;
    const fy = 1.75 - 0.62;
    c.beginPath(); c.moveTo(0.22, fy + 0.02); c.lineTo(1.78, fy + 0.02); c.moveTo(0.24, fy); c.lineTo(0.24, 1.75); c.moveTo(1.76, fy); c.lineTo(1.76, 1.75);
    c.moveTo(0.24, fy); c.lineTo(0.6, 1.75); c.moveTo(1.76, fy); c.lineTo(1.4, 1.75); c.stroke();
    roof(c, 0.22, 0.5, 1.56, 1.25, 0.62, col, 0.36);
    // Schornstein
    block(c, 1.32, 0.42, 0.18, 0.16, 0.95, 'brick', 2);
    A.smoke.push([1.41, 0.42 - 0.95 + 0.02]);
    door(c, 0.86, 1.75, 0.3, 0.45);
    win(c, 0.4, 1.75 - 0.22, 0.2, 0.2, A); win(c, 1.4, 1.75 - 0.22, 0.2, 0.2, A);
    barrel(c, 1.86, 1.86);
  },

  mill(c, col, A) {
    block(c, 0.3, 0.55, 1.4, 1.2, 0.95, 'stone', 11);
    roof(c, 0.3, 0.55, 1.4, 1.2, 0.95, col, 0.32);
    door(c, 0.85, 1.75, 0.3, 0.48);
    win(c, 1.3, 1.75 - 0.55, 0.16, 0.18, A);
    for (let i = 0; i < 3; i++) { c.fillStyle = OUT; c.beginPath(); c.ellipse(1.8, 1.75 - i * 0.16, 0.15, 0.1, 0, 0, 7); c.fill(); c.fillStyle = '#ead8a8'; c.beginPath(); c.ellipse(1.8, 1.75 - i * 0.16, 0.135, 0.085, 0, 0, 7); c.fill(); }
    A.mill = [1.0, 0.55 - 0.95 + 0.08];
  },

  lumber(c, col, A) {
    for (const [x, y] of [[0.22, 0.45], [1.78, 0.45], [0.22, 1.5], [1.78, 1.5]]) { c.fillStyle = OUT; c.fillRect(x - 0.06, y - 0.65, 0.12, 0.72); c.fillStyle = WOOD; c.fillRect(x - 0.045, y - 0.64, 0.09, 0.7); }
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(0.2, 0.4, 1.6, 1.15);
    roof(c, 0.15, 0.45, 1.7, 1.15, 0.6, col, 0.24);
    logs(c, 0.42, 1.88, 4);
    // Hackklotz mit Axt
    c.fillStyle = OUT; c.fillRect(1.6, 1.62, 0.26, 0.2); c.fillStyle = '#a07040'; c.fillRect(1.62, 1.64, 0.22, 0.17);
    c.strokeStyle = '#5e3a1f'; c.lineWidth = 0.03; c.beginPath(); c.moveTo(1.73, 1.64); c.lineTo(1.82, 1.4); c.stroke();
    c.fillStyle = '#9aa0a8'; c.beginPath(); c.moveTo(1.68, 1.62); c.lineTo(1.8, 1.6); c.lineTo(1.74, 1.7); c.fill();
  },

  mine(c, col, A) {
    block(c, 0.15, 0.55, 1.25, 1.0, 0.65, 'wood', 13);
    roof(c, 0.15, 0.55, 1.25, 1.0, 0.65, col, 0.26);
    door(c, 0.6, 1.55, 0.32, 0.44, false);
    // Lore
    c.fillStyle = OUT; c.fillRect(1.32, 1.42, 0.6, 0.32); c.fillStyle = '#5e3a1f'; c.fillRect(1.34, 1.44, 0.56, 0.28);
    c.fillStyle = '#ffd23a'; for (const [x, y] of [[1.45, 1.42], [1.6, 1.38], [1.76, 1.43]]) { c.beginPath(); c.arc(x, y, 0.08, 0, 7); c.fill(); }
    c.fillStyle = '#c06a3c'; c.beginPath(); c.arc(1.52, 1.47, 0.06, 0, 7); c.fill();
    for (const x of [1.42, 1.82]) { c.fillStyle = '#222'; c.beginPath(); c.arc(x, 1.78, 0.07, 0, 7); c.fill(); }
    c.strokeStyle = '#6a6e76'; c.lineWidth = 0.03; c.beginPath(); c.moveTo(0.1, 1.9); c.lineTo(1.95, 1.9); c.stroke();
    torch(c, 0.5, 1.2, A);
  },

  kiln(c, col, A) {
    block(c, 0.25, 0.7, 1.5, 1.05, 0.55, 'brick', 17);
    // Ofenkuppel
    c.fillStyle = OUT; c.beginPath(); c.ellipse(1.0, 1.75 - 0.55, 0.62, 0.72, 0, Math.PI, 0); c.fill();
    const g = c.createLinearGradient(0.4, 0.4, 1.6, 1.2);
    g.addColorStop(0, '#e09a6a'); g.addColorStop(1, '#8a4a2a');
    c.fillStyle = g; c.beginPath(); c.ellipse(1.0, 1.75 - 0.55, 0.59, 0.69, 0, Math.PI, 0); c.fill();
    texture(c, 0.42, 0.55, 1.16, 0.62, 'brick', 3);
    c.fillStyle = col; c.fillRect(0.4, 1.12, 1.2, 0.08);
    block(c, 0.9, 0.18, 0.22, 0.2, 0.45, 'brick', 4);
    A.smoke.push([1.01, 0.18 - 0.45]);
    // Glut im Ofenloch
    c.fillStyle = OUT; c.beginPath(); c.ellipse(1.0, 1.72, 0.25, 0.3, 0, Math.PI, 0); c.fill();
    const fg = c.createRadialGradient(1.0, 1.7, 0.02, 1.0, 1.7, 0.25);
    fg.addColorStop(0, '#fff2a0'); fg.addColorStop(0.5, '#ff8a2a'); fg.addColorStop(1, '#8a2a10');
    c.fillStyle = fg; c.beginPath(); c.ellipse(1.0, 1.72, 0.22, 0.27, 0, Math.PI, 0); c.fill();
    A.lights.push([1.0, 1.6, 1.8]); A.fire.push([1.0, 1.66, 0.6]);
    for (const [x, y] of [[0.18, 1.88], [1.82, 1.85]]) { c.fillStyle = OUT; c.beginPath(); c.ellipse(x, y - 0.12, 0.1, 0.13, 0, 0, 7); c.fill(); c.fillStyle = '#c87a4a'; c.beginPath(); c.ellipse(x, y - 0.12, 0.085, 0.115, 0, 0, 7); c.fill(); }
  },

  market(c, col, A) {
    // Stände mit gestreiften Markisen
    for (const [x, y, w] of [[0.15, 0.8, 1.25], [1.6, 0.8, 1.25], [0.85, 2.0, 1.3]]) {
      for (const px of [x + 0.05, x + w - 0.05]) { c.fillStyle = OUT; c.fillRect(px - 0.04, y + 0.62 - 0.6, 0.08, 0.64); c.fillStyle = WOOD; c.fillRect(px - 0.025, y + 0.62 - 0.59, 0.05, 0.6); }
      c.fillStyle = OUT; c.fillRect(x - 0.02, y + 0.28, w + 0.04, 0.38);
      c.fillStyle = '#a87848'; c.fillRect(x, y + 0.3, w, 0.34);
      for (let i = 0; i < 5; i++) {
        const cx = x + 0.15 + i * (w - 0.3) / 4;
        c.fillStyle = ['#e8c23a', '#d4364a', '#7a9a3a', '#c06a3c', '#f2e6cf'][(i + Math.round(x * 3)) % 5];
        c.beginPath(); c.arc(cx, y + 0.3, 0.08, 0, 7); c.fill();
      }
      c.fillStyle = OUT; c.beginPath(); c.moveTo(x - 0.1, y - 0.02); c.lineTo(x + w + 0.1, y - 0.02); c.lineTo(x + w + 0.16, y + 0.32); c.lineTo(x - 0.16, y + 0.32); c.fill();
      const n = 6;
      for (let i = 0; i < n; i++) {
        c.fillStyle = i % 2 ? '#f4ead7' : col;
        const a = x - 0.08 + (w + 0.16) * i / n, b = x - 0.08 + (w + 0.16) * (i + 1) / n;
        const a2 = x - 0.14 + (w + 0.28) * i / n, b2 = x - 0.14 + (w + 0.28) * (i + 1) / n;
        c.beginPath(); c.moveTo(a, y); c.lineTo(b, y); c.lineTo(b2, y + 0.3); c.lineTo(a2, y + 0.3); c.fill();
      }
      c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(x - 0.14, y + 0.24, w + 0.28, 0.06);
    }
    // Waage
    c.strokeStyle = OUT; c.lineWidth = 0.04; c.beginPath(); c.moveTo(2.45, 2.9); c.lineTo(2.45, 2.3); c.moveTo(2.2, 2.35); c.lineTo(2.7, 2.35); c.stroke();
    c.fillStyle = GOLD; c.beginPath(); c.arc(2.22, 2.5, 0.08, 0, Math.PI); c.arc(2.68, 2.5, 0.08, 0, Math.PI); c.fill();
    crate(c, 0.25, 2.85); crate(c, 0.45, 2.85, 0.15); barrel(c, 2.8, 2.9);
    A.lights.push([0.8, 1.2, 1.2], [2.2, 1.2, 1.2], [1.5, 2.4, 1.2]);
    pole(c, 1.5, 0.75, 0.9, A);
  },

  barracks(c, col, A) {
    block(c, 0.2, 0.55, 2.6, 2.0, 0.85, 'adobe', 19);
    roof(c, 0.2, 0.55, 2.6, 2.0, 0.85, col, 0.48);
    door(c, 1.22, 2.55, 0.56, 0.62);
    win(c, 0.45, 2.55 - 0.38, 0.22, 0.22, A); win(c, 2.33, 2.55 - 0.38, 0.22, 0.22, A);
    for (const x of [0.75, 2.05]) { c.fillStyle = OUT; c.beginPath(); c.arc(x + 0.1, 2.55 - 0.5, 0.15, 0, 7); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(x + 0.1, 2.55 - 0.5, 0.13, 0, 7); c.fill(); c.strokeStyle = '#f4ead7'; c.lineWidth = 0.025; c.beginPath(); c.moveTo(x + 0.02, 2.55 - 0.58); c.lineTo(x + 0.18, 2.55 - 0.42); c.moveTo(x + 0.18, 2.55 - 0.58); c.lineTo(x + 0.02, 2.55 - 0.42); c.stroke(); }
    // Waffenständer
    c.strokeStyle = OUT; c.lineWidth = 0.05; c.beginPath(); c.moveTo(2.75, 2.85); c.lineTo(2.95, 2.85); c.stroke();
    for (let i = 0; i < 3; i++) { c.strokeStyle = '#8a6a48'; c.lineWidth = 0.03; c.beginPath(); c.moveTo(2.78 + i * 0.07, 2.85); c.lineTo(2.72 + i * 0.1, 2.05); c.stroke(); c.fillStyle = '#c3c9d2'; c.beginPath(); c.moveTo(2.72 + i * 0.1, 2.05); c.lineTo(2.69 + i * 0.1, 2.15); c.lineTo(2.75 + i * 0.1, 2.15); c.fill(); }
    torch(c, 1.08, 2.55 - 0.38, A); torch(c, 1.92, 2.55 - 0.38, A);
    pole(c, 0.35, 0.55 - 0.85 + 0.05, 0.8, A);
  },

  range(c, col, A) {
    block(c, 0.2, 0.45, 2.5, 1.5, 0.75, 'wood', 23);
    roof(c, 0.2, 0.45, 2.5, 1.5, 0.75, col, 0.42);
    door(c, 1.2, 1.95, 0.48, 0.55);
    win(c, 0.5, 1.95 - 0.36, 0.2, 0.2, A); win(c, 2.2, 1.95 - 0.36, 0.2, 0.2, A);
    for (const x of [0.55, 1.5, 2.45]) target(c, x, 2.85);
    hay(c, 2.85, 2.1);
  },

  stable(c, col, A) {
    block(c, 0.2, 0.45, 2.6, 1.55, 0.78, 'wood', 29);
    roof(c, 0.2, 0.45, 2.6, 1.55, 0.78, col, 0.42);
    for (const x of [0.45, 1.25, 2.05]) {
      door(c, x, 2.0, 0.5, 0.52, false);
      c.strokeStyle = '#e8d8b8'; c.lineWidth = 0.02; c.beginPath(); c.moveTo(x, 2.0 - 0.52); c.lineTo(x + 0.5, 2.0); c.moveTo(x + 0.5, 2.0 - 0.52); c.lineTo(x, 2.0); c.stroke();
    }
    // Koppel
    c.strokeStyle = OUT; c.lineWidth = 0.06;
    c.beginPath(); c.moveTo(0.12, 2.55); c.lineTo(2.88, 2.55); c.moveTo(0.12, 2.78); c.lineTo(2.88, 2.78); c.stroke();
    c.strokeStyle = '#a07040'; c.lineWidth = 0.035;
    c.beginPath(); c.moveTo(0.12, 2.55); c.lineTo(2.88, 2.55); c.moveTo(0.12, 2.78); c.lineTo(2.88, 2.78); c.stroke();
    for (const x of [0.15, 1.0, 1.85, 2.85]) { c.fillStyle = OUT; c.fillRect(x - 0.04, 2.4, 0.08, 0.5); c.fillStyle = '#8a5a33'; c.fillRect(x - 0.025, 2.41, 0.05, 0.48); }
    hay(c, 2.6, 2.35); hay(c, 0.4, 2.35);
    torch(c, 1.15, 2.0 - 0.6, A);
  },

  kennel(c, col, A) {
    block(c, 0.25, 0.6, 1.5, 0.95, 0.5, 'wood', 31);
    roof(c, 0.25, 0.6, 1.5, 0.95, 0.5, col, 0.28);
    door(c, 0.85, 1.55, 0.32, 0.36, true);
    // Zaun und Knochen
    c.strokeStyle = OUT; c.lineWidth = 0.045;
    c.beginPath(); c.moveTo(0.1, 1.85); c.lineTo(1.9, 1.85); c.stroke();
    c.strokeStyle = '#a07040'; c.lineWidth = 0.025; c.beginPath(); c.moveTo(0.1, 1.85); c.lineTo(1.9, 1.85); c.stroke();
    for (let x = 0.12; x < 1.95; x += 0.25) { c.fillStyle = OUT; c.fillRect(x - 0.03, 1.66, 0.06, 0.26); c.fillStyle = '#b08050'; c.fillRect(x - 0.018, 1.67, 0.036, 0.24); }
    c.fillStyle = '#f4ead7'; c.fillRect(1.4, 1.68, 0.22, 0.04); for (const x of [1.4, 1.62]) { c.beginPath(); c.arc(x, 1.67, 0.03, 0, 7); c.arc(x, 1.73, 0.03, 0, 7); c.fill(); }
    // Napf
    c.fillStyle = OUT; c.beginPath(); c.ellipse(0.45, 1.72, 0.12, 0.06, 0, 0, 7); c.fill(); c.fillStyle = '#8a8f99'; c.beginPath(); c.ellipse(0.45, 1.71, 0.1, 0.045, 0, 0, 7); c.fill();
  },

  forge(c, col, A) {
    block(c, 0.3, 0.55, 2.3, 1.85, 0.75, 'stone', 37);
    roof(c, 0.3, 0.55, 2.3, 1.85, 0.75, col, 0.36);
    block(c, 1.95, 0.4, 0.45, 0.4, 1.7, 'brick', 5);
    A.smoke.push([2.17, 0.4 - 1.7]);
    // Esse
    c.fillStyle = OUT; c.fillRect(0.75, 2.4 - 0.52, 0.66, 0.48);
    const fg = c.createLinearGradient(0, 2.4 - 0.5, 0, 2.4);
    fg.addColorStop(0, '#ffef9a'); fg.addColorStop(0.5, '#ff8a2a'); fg.addColorStop(1, '#a8301a');
    c.fillStyle = fg; c.fillRect(0.78, 2.4 - 0.49, 0.6, 0.44);
    A.lights.push([1.08, 2.15, 2.0]); A.fire.push([1.08, 2.15, 0.7]); A.sparks = [1.08, 2.1];
    anvil(c, 1.95, 2.75);
    barrel(c, 2.55, 2.85);
    win(c, 2.15, 2.4 - 0.38, 0.2, 0.2, A);
  },

  temple(c, col, A) {
    block(c, 0.15, 0.75, 2.7, 2.0, 0.35, 'plaster', 41);
    block(c, 0.45, 0.85, 2.1, 1.6, 1.05, 'plaster', 43);
    // Säulen
    for (let i = 0; i < 5; i++) {
      const x = 0.55 + i * 0.45;
      c.fillStyle = OUT; c.fillRect(x - 0.015, 2.45 - 1.0, 0.2, 1.0);
      const g = c.createLinearGradient(x, 0, x + 0.17, 0);
      g.addColorStop(0, '#fffaf0'); g.addColorStop(1, '#cfc0a0');
      c.fillStyle = g; c.fillRect(x, 2.45 - 0.99, 0.17, 0.98);
      c.fillStyle = '#e8dcc4'; c.fillRect(x - 0.03, 2.45 - 1.02, 0.23, 0.06);
    }
    // Giebel
    const top = 0.85 - 1.05;
    c.fillStyle = OUT; c.beginPath(); c.moveTo(0.3, top + 0.02); c.lineTo(1.5, top - 0.7); c.lineTo(2.7, top + 0.02); c.fill();
    c.fillStyle = '#f2e6cf'; c.beginPath(); c.moveTo(0.38, top); c.lineTo(1.5, top - 0.64); c.lineTo(2.62, top); c.fill();
    c.fillStyle = col; c.beginPath(); c.moveTo(0.8, top - 0.06); c.lineTo(1.5, top - 0.46); c.lineTo(2.2, top - 0.06); c.fill();
    roof(c, 0.45, 0.85, 2.1, 1.6, 1.05, col, 0.3, 0.05);
    c.fillStyle = OUT; c.fillRect(1.43, top - 1.12, 0.14, 0.5); c.fillRect(1.32, top - 0.98, 0.36, 0.12);
    c.fillStyle = GOLD; c.fillRect(1.46, top - 1.1, 0.08, 0.46); c.fillRect(1.34, top - 0.96, 0.32, 0.08);
    door(c, 1.3, 2.45, 0.4, 0.55);
    A.lights.push([1.5, 2.15, 1.5], [0.7, 2.6, 1.0], [2.3, 2.6, 1.0]);
    // Feuerschalen
    for (const x of [0.25, 2.75]) { c.fillStyle = OUT; c.fillRect(x - 0.03, 2.55, 0.06, 0.3); c.beginPath(); c.ellipse(x, 2.55, 0.12, 0.05, 0, 0, Math.PI); c.fill(); c.fillStyle = '#ffb347'; c.beginPath(); c.arc(x, 2.5, 0.06, 0, 7); c.fill(); A.fire.push([x, 2.5, 0.5]); A.lights.push([x, 2.5, 1.4]); }
  },

  tower(c, col, A) {
    block(c, 0.45, 0.65, 1.1, 1.05, 2.35, 'stone', 47);
    crenel(c, 0.45, 0.65, 1.1, 2.35, 'stone');
    win(c, 0.92, 1.7 - 1.75, 0.16, 0.28, A); win(c, 0.92, 1.7 - 0.95, 0.16, 0.24, A);
    c.fillStyle = col; c.fillRect(0.45, 1.7 - 2.35 + 0.18, 1.1, 0.08);
    cone(c, 1.0, 0.65 - 2.35 + 0.12, 0.72, 0.95, col);
    door(c, 0.86, 1.7, 0.28, 0.4);
    pole(c, 1.0, 0.65 - 2.35 - 0.8, 0.55, A);
  },

  bastion(c, col, A) {
    block(c, 0.25, 0.75, 1.5, 1.05, 1.6, 'dark', 53);
    c.fillStyle = col; c.fillRect(0.25, 1.8 - 0.9, 1.5, 0.08);
    crenel(c, 0.25, 0.75, 1.5, 1.6, 'dark');
    win(c, 0.6, 1.8 - 0.45, 0.14, 0.2, A); win(c, 1.25, 1.8 - 0.45, 0.14, 0.2, A);
    // Geschütz auf der Plattform
    const py = 0.75 - 1.6 + 0.45;
    c.fillStyle = OUT; c.fillRect(0.55, py - 0.18, 0.9, 0.16);
    c.fillStyle = WOOD; c.fillRect(0.57, py - 0.17, 0.86, 0.13);
    c.strokeStyle = OUT; c.lineWidth = 0.07; c.beginPath(); c.moveTo(1.3, py - 0.5); c.quadraticCurveTo(1.5, py - 0.12, 1.3, py + 0.25); c.stroke();
    c.strokeStyle = '#6a4a2a'; c.lineWidth = 0.045; c.beginPath(); c.moveTo(1.3, py - 0.5); c.quadraticCurveTo(1.5, py - 0.12, 1.3, py + 0.25); c.stroke();
    c.strokeStyle = '#eee'; c.lineWidth = 0.015; c.beginPath(); c.moveTo(1.3, py - 0.5); c.lineTo(0.75, py - 0.1); c.lineTo(1.3, py + 0.25); c.stroke();
    c.strokeStyle = '#c9b48a'; c.lineWidth = 0.035; c.beginPath(); c.moveTo(0.75, py - 0.1); c.lineTo(1.6, py - 0.1); c.stroke();
    door(c, 0.86, 1.8, 0.28, 0.38);
    torch(c, 0.4, 1.8 - 0.55, A); torch(c, 1.6, 1.8 - 0.55, A);
    pole(c, 0.35, 0.75 - 1.6 - 0.1, 0.6, A);
  },

  wall(c, col, A, mask = 0) {
    // mask: 1 rechts, 2 links, 4 unten, 8 oben. Verbundene Stücke ergeben eine durchgehende Mauer.
    const z = 0.75, m = 'adobe';
    const x0 = mask & 2 ? 0 : 0.2, x1 = mask & 1 ? 1 : 0.8, y0 = mask & 8 ? 0 : 0.25, y1 = mask & 4 ? 1 : 0.75;
    if ((mask & 12) && (mask & 3)) {
      block(c, 0.25, y0, 0.5, y1 - y0, z, m, 5);
      block(c, x0, 0.25, x1 - x0, 0.5, z, m, 3);
    } else if (mask & 12) block(c, 0.25, y0, 0.5, y1 - y0, z, m, 5);
    else block(c, x0, 0.25, x1 - x0, 0.5, z, m, 3);
    crenel(c, (mask & 12) && !(mask & 3) ? 0.25 : x0, 0.25, (mask & 12) && !(mask & 3) ? 0.5 : x1 - x0, z, m);
    c.fillStyle = col; c.fillRect(x0, 0.75 - z + 0.12, x1 - x0, 0.05);
    if (!mask) { block(c, 0.2, 0.2, 0.6, 0.6, z + 0.15, m, 9); crenel(c, 0.2, 0.2, 0.6, z + 0.15, m); }
  },

  workshop(c, col, A) {
    block(c, 0.15, 0.65, 2.7, 1.65, 0.85, 'wood', 59);
    roof(c, 0.15, 0.65, 2.7, 1.65, 0.85, col, 0.42);
    door(c, 0.95, 2.3, 1.1, 0.72, false);
    c.strokeStyle = '#d8b88a'; c.lineWidth = 0.02; c.beginPath(); c.moveTo(1.5, 2.3 - 0.72); c.lineTo(1.5, 2.3); c.stroke();
    // Kran
    c.strokeStyle = OUT; c.lineWidth = 0.1; c.beginPath(); c.moveTo(2.75, 2.85); c.lineTo(2.75, 0.0); c.lineTo(1.9, -0.45); c.stroke();
    c.strokeStyle = '#6b4a2b'; c.lineWidth = 0.065; c.beginPath(); c.moveTo(2.75, 2.85); c.lineTo(2.75, 0.0); c.lineTo(1.9, -0.45); c.stroke();
    c.strokeStyle = '#ccc'; c.lineWidth = 0.015; c.beginPath(); c.moveTo(1.95, -0.42); c.lineTo(1.95, 0.5); c.stroke();
    crate(c, 1.85, 0.68, 0.2);
    // Rad und Bretter
    c.fillStyle = OUT; c.beginPath(); c.arc(0.4, 2.62, 0.25, 0, 7); c.fill();
    c.fillStyle = '#8a5a33'; c.beginPath(); c.arc(0.4, 2.62, 0.22, 0, 7); c.fill();
    c.fillStyle = '#4a3020'; c.beginPath(); c.arc(0.4, 2.62, 0.06, 0, 7); c.fill();
    c.strokeStyle = '#4a3020'; c.lineWidth = 0.02; for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(0.4, 2.62); c.lineTo(0.4 + Math.cos(k) * 0.2, 2.62 + Math.sin(k) * 0.2); c.stroke(); }
    torch(c, 0.82, 2.3 - 0.5, A); torch(c, 2.18, 2.3 - 0.5, A);
  },

  fortress(c, col, A) {
    // Äußere Mauer mit Türmen
    block(c, 0.1, 0.35, 3.8, 3.45, 0.85, 'stone', 61);
    c.fillStyle = '#9c958a'; c.fillRect(0.45, -0.25, 3.1, 2.8);
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(0.45, -0.25, 3.1, 0.2);
    crenel(c, 0.1, 3.8 - 3.45, 3.8, 0.85, 'stone');
    // Haupthaus
    block(c, 0.85, 0.5, 2.3, 2.1, 2.1, 'dark', 67);
    crenel(c, 0.85, 0.5, 2.3, 2.1, 'dark');
    block(c, 1.45, 0.65, 1.1, 1.0, 2.9, 'stone', 71);
    crenel(c, 1.45, 0.65, 1.1, 2.9, 'stone');
    cone(c, 2.0, 0.65 - 2.9 + 0.05, 0.7, 0.95, col);
    banner(c, 1.0, 2.6 - 1.9, col, 0.3, 0.75); banner(c, 2.7, 2.6 - 1.9, col, 0.3, 0.75);
    win(c, 1.75, 2.6 - 1.55, 0.18, 0.3, A); win(c, 2.07, 2.6 - 1.55, 0.18, 0.3, A);
    win(c, 1.92, 1.65 - 2.45, 0.16, 0.26, A);
    for (const [x, y] of [[-0.05, 0.1], [3.2, 0.1], [-0.05, 3.05], [3.2, 3.05]]) {
      block(c, x, y, 0.85, 0.8, 1.55, 'stone', x * 7 + y);
      crenel(c, x, y, 0.85, 1.55, 'stone');
      win(c, x + 0.35, y + 0.8 - 0.8, 0.14, 0.22, A);
      c.fillStyle = col; c.fillRect(x, y + 0.8 - 1.2, 0.85, 0.07);
    }
    door(c, 1.55, 3.8, 0.9, 0.78);
    c.strokeStyle = '#3a3a3a'; c.lineWidth = 0.025;
    for (let x = 1.62; x < 2.42; x += 0.12) { c.beginPath(); c.moveTo(x, 3.8 - 0.62); c.lineTo(x, 3.8 - 0.25); c.stroke(); }
    torch(c, 1.35, 3.8 - 0.55, A); torch(c, 2.65, 3.8 - 0.55, A);
    pole(c, 2.0, 0.65 - 2.9 - 0.85, 0.7, A);
    pole(c, 0.38, 0.1 - 1.55 - 0.05, 0.6, A); pole(c, 3.62, 0.1 - 1.55 - 0.05, 0.6, A);
  },

  monument(c, col, A) {
    block(c, 0.2, 0.6, 4.6, 4.2, 0.5, 'plaster', 73);
    block(c, 0.8, 1.0, 3.4, 3.2, 1.15, 'clay', 79);
    block(c, 1.4, 1.4, 2.2, 2.2, 1.9, 'plaster', 83);
    block(c, 1.9, 1.75, 1.2, 1.2, 2.75, 'clay', 89);
    // Krone
    const by = 1.75 - 2.75 + 0.35;
    c.fillStyle = OUT; c.beginPath();
    c.moveTo(1.85, by + 0.04); c.lineTo(1.85, by - 0.66); c.lineTo(2.2, by - 0.32); c.lineTo(2.5, by - 0.88); c.lineTo(2.8, by - 0.32); c.lineTo(3.15, by - 0.66); c.lineTo(3.15, by + 0.04); c.fill();
    const g = c.createLinearGradient(1.9, by - 0.8, 3.1, by);
    g.addColorStop(0, '#fff2a0'); g.addColorStop(0.5, '#f5c518'); g.addColorStop(1, '#b8860b');
    c.fillStyle = g; c.beginPath();
    c.moveTo(1.9, by); c.lineTo(1.9, by - 0.6); c.lineTo(2.2, by - 0.27); c.lineTo(2.5, by - 0.8); c.lineTo(2.8, by - 0.27); c.lineTo(3.1, by - 0.6); c.lineTo(3.1, by); c.fill();
    for (const [x, cc] of [[2.15, '#e5483b'], [2.5, '#3b82f6'], [2.85, '#5fcf5f']]) { c.fillStyle = cc; c.beginPath(); c.arc(x, by - 0.15, 0.06, 0, 7); c.fill(); }
    A.lights.push([2.5, by - 0.4, 2.5]);
    for (const x of [0.4, 4.35]) banner(c, x, 4.8 - 0.48, col, 0.25, 0.4);
    for (const [x, y] of [[0.55, 1.6], [4.45, 1.6], [0.55, 4.45], [4.45, 4.45]]) torch(c, x, y, A);
    door(c, 2.2, 4.8, 0.6, 0.42);
  },
};

export const BUILD_TOP = {
  keep: 2.3, house: 1.25, mill: 1.6, lumber: 1.05, mine: 1.05, barracks: 1.45, range: 1.3, stable: 1.35, forge: 1.7,
  temple: 2.0, tower: 3.5, workshop: 1.5, monument: 2.4, farm: 0, kennel: 0.85, fortress: 3.6, bastion: 2.45, wall: 1.0,
  market: 0.5, kiln: 1.0,
};
