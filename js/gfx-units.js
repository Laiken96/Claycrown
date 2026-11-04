// Claycrown 2.0: Einheitengrafik. Alle Figuren schauen nach rechts, Ursprung an den Füßen, 1 = eine Kachel.
// Die Figuren werden je Bild (Stehen, Laufen, Angriff, Arbeit) einmal gezeichnet und zwischengespeichert.
import { shade, limb, blob, poly, OUT } from './gfx-util.js?v=203';

const SKIN = '#e9b68c', HAIR = '#5a3a22', LEATHER = '#6e4527', WOOD = '#82562f', WOOD_D = '#563519';
const STEEL = '#c3c9d2', BRONZE = '#c98f3c', CLOTH = '#a07a50', BOOT = '#3d2717';

export const FRAMES = { idle: 1, walk: 4, atk: 3, work: 3 };

// Bildparameter: Beinphase, Hüpfen, Armwinkel
function phase(f) {
  if (f.k === 'walk') { const a = (f.i / 4) * Math.PI * 2; return { lp: Math.sin(a), bob: Math.abs(Math.cos(a)) * 0.035, a: 0, k: f.k }; }
  if (f.k === 'atk' || f.k === 'work') return { lp: 0, bob: 0, a: [-1, 0.25, 1][f.i] ?? 0, k: f.k };
  return { lp: 0, bob: 0, a: 0, k: 'idle' };
}

// ---------- Menschliche Figur ----------
function legs(c, p, pants, boots = BOOT) {
  const s = p.lp * 0.085;
  limb(c, -0.02, -0.22, -0.035 - s, -0.03, 0.075, shade(pants, -0.2));
  blob(c, -0.03 - s + 0.02, -0.025, 0.05, 0.028, boots, 0, 0.1);
  limb(c, 0.03, -0.22, 0.04 + s, -0.03, 0.075, pants);
  blob(c, 0.045 + s + 0.02, -0.025, 0.05, 0.028, boots, 0, 0.1);
}

function torso(c, col, y0 = -0.5, y1 = -0.19, w = 0.15, belt = LEATHER) {
  poly(c, [-w, y1, -w * 0.85, y0 + 0.04, -w * 0.4, y0, w * 0.4, y0, w * 0.85, y0 + 0.04, w, y1], col, 0.22);
  c.fillStyle = belt; c.fillRect(-w * 0.98, y1 - 0.07, w * 1.96, 0.045);
  c.fillStyle = '#d9b45a'; c.fillRect(-0.02, y1 - 0.072, 0.04, 0.05);
}

function head(c, y = -0.6, hair = HAIR, beard = false) {
  blob(c, 0.015, y, 0.095, 0.1, SKIN, 0, 0.25);
  c.fillStyle = hair;
  c.beginPath(); c.ellipse(-0.01, y - 0.04, 0.09, 0.065, -0.2, Math.PI * 0.95, Math.PI * 2.1); c.fill();
  if (beard) { c.fillStyle = hair; c.beginPath(); c.ellipse(0.04, y + 0.06, 0.06, 0.04, 0, 0, Math.PI); c.fill(); }
  c.fillStyle = '#2a1a10'; c.beginPath(); c.arc(0.07, y - 0.005, 0.014, 0, 7); c.fill();
  c.fillStyle = 'rgba(200,90,70,0.35)'; c.beginPath(); c.arc(0.05, y + 0.035, 0.022, 0, 7); c.fill();
}

function helmet(c, col, y = -0.6, plume) {
  c.fillStyle = OUT; c.beginPath(); c.arc(0.01, y - 0.015, 0.112, Math.PI * 1.02, Math.PI * 1.98); c.closePath(); c.fill();
  const g = c.createLinearGradient(-0.1, y - 0.12, 0.1, y);
  g.addColorStop(0, shade(col, 0.45)); g.addColorStop(1, shade(col, -0.25));
  c.fillStyle = g; c.beginPath(); c.arc(0.01, y - 0.015, 0.1, Math.PI, 0); c.closePath(); c.fill();
  c.fillStyle = shade(col, -0.35); c.fillRect(-0.1, y - 0.02, 0.22, 0.025);
  if (plume) {
    c.fillStyle = plume; c.beginPath();
    c.moveTo(0, y - 0.11); c.quadraticCurveTo(-0.08, y - 0.26, -0.2, y - 0.16); c.quadraticCurveTo(-0.1, y - 0.15, -0.02, y - 0.08); c.fill();
  }
}

function arm(c, sx, sy, ang, len, col, hand = true) {
  const ex = sx + Math.cos(ang) * len, ey = sy + Math.sin(ang) * len;
  limb(c, sx, sy, ex, ey, 0.06, col);
  if (hand) blob(c, ex, ey, 0.035, 0.035, SKIN, 0, 0.2);
  return [ex, ey];
}

function shield(c, x, y, col, r = 0.12) {
  blob(c, x, y, r * 0.8, r, col, 0, 0.3);
  c.strokeStyle = shade(col, 0.5); c.lineWidth = 0.02;
  c.beginPath(); c.ellipse(x, y, r * 0.55, r * 0.72, 0, 0, 7); c.stroke();
  blob(c, x, y, 0.025, 0.025, '#d9b45a', 0, 0.4);
}

function blade(c, x, y, ang, len, col = STEEL, w = 0.04) {
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  c.lineCap = 'round';
  c.strokeStyle = OUT; c.lineWidth = w + 0.03; c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke();
  c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = w * 0.3; c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke();
  // Parierstange
  const px = -Math.sin(ang) * 0.06, py = Math.cos(ang) * 0.06;
  limb(c, x - px, y - py, x + px, y + py, 0.025, '#b8862e');
}

function pole(c, x0, y0, x1, y1, w = 0.03, col = WOOD) { limb(c, x0, y0, x1, y1, w, col); }

// ---------- Pferd ----------
function horse(c, p, coat, bard) {
  const g = p.lp, gal = p.k === 'walk';
  const legA = gal ? g * 0.35 : 0, legB = gal ? -g * 0.35 : 0;
  const leg = (x, a, col) => {
    const kx = x + Math.sin(a) * 0.08, ky = -0.14;
    limb(c, x, -0.25, kx, ky, 0.06, col);
    limb(c, kx, ky, kx + Math.sin(a * 1.4) * 0.07, -0.02, 0.05, col);
    c.fillStyle = '#2a1c12'; c.fillRect(kx + Math.sin(a * 1.4) * 0.07 - 0.03, -0.035, 0.06, 0.035);
  };
  leg(-0.22, legB, shade(coat, -0.3)); leg(0.2, legA, shade(coat, -0.3));
  // Schweif
  c.strokeStyle = shade(coat, -0.55); c.lineWidth = 0.06; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-0.34, -0.38); c.quadraticCurveTo(-0.5, -0.3 + g * 0.03, -0.46, -0.12); c.stroke();
  blob(c, 0, -0.33, 0.36, 0.15, coat, 0, 0.25);
  if (bard) {
    poly(c, [-0.36, -0.36, 0.3, -0.36, 0.34, -0.16, 0.2, -0.12, -0.2, -0.12, -0.34, -0.18], bard, 0.25);
    c.strokeStyle = '#e8c45a'; c.lineWidth = 0.02; c.beginPath(); c.moveTo(-0.32, -0.17); c.lineTo(0.32, -0.17); c.stroke();
  }
  // Hals und Kopf
  poly(c, [0.18, -0.42, 0.33, -0.66, 0.45, -0.62, 0.36, -0.3], coat, 0.2);
  blob(c, 0.47, -0.6, 0.12, 0.065, coat, 0.5, 0.2);
  c.fillStyle = shade(coat, -0.55); c.beginPath(); c.moveTo(0.32, -0.68); c.lineTo(0.36, -0.75); c.lineTo(0.38, -0.66); c.fill();
  c.strokeStyle = shade(coat, -0.6); c.lineWidth = 0.05;
  c.beginPath(); c.moveTo(0.22, -0.46); c.quadraticCurveTo(0.27, -0.62, 0.34, -0.68); c.stroke();
  c.fillStyle = '#111'; c.beginPath(); c.arc(0.46, -0.63, 0.014, 0, 7); c.fill();
  if (bard) { c.fillStyle = shade(bard, -0.1); c.beginPath(); c.ellipse(0.46, -0.62, 0.08, 0.04, 0.5, 0, 7); c.fill(); }
  leg(-0.16, -legB * 0.8, coat); leg(0.26, -legA * 0.8, coat);
  // Sattel
  c.fillStyle = LEATHER; c.beginPath(); c.ellipse(-0.02, -0.46, 0.13, 0.05, 0, 0, 7); c.fill();
}

// ---------- Einheiten ----------
export const UNIT_DRAW = {
  worker(c, col, f) {
    const p = phase(f); c.translate(0, -p.bob);
    legs(c, p, '#7d6446');
    arm(c, -0.08, -0.45, 1.9, 0.2, shade(CLOTH, -0.2));
    torso(c, CLOTH);
    c.fillStyle = col; c.fillRect(-0.14, -0.31, 0.28, 0.05);
    head(c);
    // Strohhut
    blob(c, 0.0, -0.69, 0.17, 0.045, '#e3c47a', 0, 0.3);
    blob(c, 0.0, -0.73, 0.08, 0.05, '#d8b260', 0, 0.3);
    if (p.k === 'work') {
      const a = -2.1 + (p.a + 1) * 1.2;
      const [hx, hy] = arm(c, 0.06, -0.45, a, 0.2, CLOTH);
      pole(c, hx, hy, hx + Math.cos(a + 0.4) * 0.3, hy + Math.sin(a + 0.4) * 0.3, 0.03);
      const tx = hx + Math.cos(a + 0.4) * 0.3, ty = hy + Math.sin(a + 0.4) * 0.3;
      poly(c, [tx - 0.05, ty - 0.04, tx + 0.06, ty - 0.02, tx + 0.02, ty + 0.06], '#9aa0a8', 0.4);
    } else arm(c, 0.06, -0.45, 1.3, 0.2, CLOTH);
  },

  spear(c, col, f) {
    const p = phase(f); c.translate(0, -p.bob);
    legs(c, p, '#5d4a36');
    const th = p.k === 'atk' ? [0, 0.22, 0.08][f.i] : 0;
    arm(c, -0.07, -0.46, 2.0, 0.17, shade(col, -0.2));
    shield(c, -0.1, -0.33, col, 0.13);
    torso(c, col);
    head(c); helmet(c, '#9aa0a8');
    pole(c, -0.12 + th, -0.12 - (p.k === 'atk' ? 0.25 : 0), 0.38 + th, -0.95 + (p.k === 'atk' ? 0.55 : 0), 0.03);
    const tx = 0.38 + th, ty = -0.95 + (p.k === 'atk' ? 0.55 : 0);
    const ang = Math.atan2(ty - (-0.12 - (p.k === 'atk' ? 0.25 : 0)), tx - (-0.12 + th));
    poly(c, [tx + Math.cos(ang) * 0.12, ty + Math.sin(ang) * 0.12, tx - Math.sin(ang) * 0.035, ty + Math.cos(ang) * 0.035, tx + Math.sin(ang) * 0.035, ty - Math.cos(ang) * 0.035], STEEL, 0.5);
    arm(c, 0.06, -0.45, p.k === 'atk' ? 0.1 + th : 0.9, 0.2, col);
  },

  sword(c, col, f) {
    const p = phase(f); c.translate(0, -p.bob);
    legs(c, p, '#4e3d2c');
    shield(c, -0.13, -0.34, col, 0.15);
    torso(c, '#8e949c', -0.5, -0.19, 0.155);
    c.fillStyle = col; c.fillRect(-0.12, -0.42, 0.24, 0.15);
    c.strokeStyle = shade(col, 0.4); c.lineWidth = 0.015; c.strokeRect(-0.12, -0.42, 0.24, 0.15);
    head(c, -0.6, HAIR, true); helmet(c, BRONZE, -0.6, shade(col, 0.1));
    const a = p.k === 'atk' ? [-2.3, -0.6, 0.6][f.i] : -1.1;
    const [hx, hy] = arm(c, 0.07, -0.45, p.k === 'atk' ? a + 0.6 : 0.8, 0.18, '#8e949c');
    blade(c, hx, hy, a, 0.36);
  },

  archer(c, col, f) {
    const p = phase(f); c.translate(0, -p.bob);
    legs(c, p, '#4b5a32');
    // Köcher
    poly(c, [-0.2, -0.62, -0.12, -0.64, -0.06, -0.28, -0.13, -0.26], LEATHER, 0.2);
    c.strokeStyle = '#f2ead8'; c.lineWidth = 0.02;
    for (const dx of [-0.17, -0.14, -0.11]) { c.beginPath(); c.moveTo(dx, -0.62); c.lineTo(dx - 0.02, -0.7); c.stroke(); }
    torso(c, '#5f7a3a');
    c.fillStyle = col; c.beginPath(); c.moveTo(-0.15, -0.5); c.lineTo(0.15, -0.5); c.lineTo(0, -0.36); c.fill();
    head(c);
    // Kapuze
    c.fillStyle = '#4e6830'; c.beginPath(); c.arc(0.0, -0.63, 0.11, Math.PI * 0.9, Math.PI * 2.05); c.lineTo(-0.12, -0.55); c.fill();
    const draw = p.k === 'atk' ? [0.12, 0.02, -0.02][f.i] : 0;
    const bx = 0.24, by = -0.46;
    c.strokeStyle = OUT; c.lineWidth = 0.05;
    c.beginPath(); c.arc(bx - 0.14, by, 0.24, -1.05, 1.05); c.stroke();
    c.strokeStyle = WOOD; c.lineWidth = 0.032;
    c.beginPath(); c.arc(bx - 0.14, by, 0.24, -1.05, 1.05); c.stroke();
    const t1x = bx - 0.14 + Math.cos(-1.05) * 0.24, t1y = by + Math.sin(-1.05) * 0.24, t2y = by + Math.sin(1.05) * 0.24;
    c.strokeStyle = '#eee'; c.lineWidth = 0.01;
    c.beginPath(); c.moveTo(t1x, t1y); c.lineTo(t1x - 0.12 - draw, by); c.lineTo(t1x, t2y); c.stroke();
    arm(c, 0.06, -0.47, -0.1, 0.18, '#5f7a3a');
    arm(c, 0.02, -0.46, Math.PI - 0.1, 0.04 + draw * 0.6, '#5f7a3a');
    if (p.k !== 'atk' || f.i === 0) { limb(c, t1x - 0.12 - draw, by, bx + 0.12, by, 0.012, '#d8c8a0'); }
  },

  skirm(c, col, f) {
    const p = phase(f); c.translate(0, -p.bob);
    legs(c, p, '#6a5236');
    for (const dx of [-0.17, -0.13]) pole(c, dx, -0.25, dx + 0.06, -0.8, 0.02);
    arm(c, -0.07, -0.45, 2.1, 0.15, shade(col, -0.2));
    shield(c, -0.12, -0.34, '#c9a46a', 0.14);
    c.fillStyle = col; c.beginPath(); c.arc(-0.12, -0.34, 0.06, 0, 7); c.fill();
    torso(c, col);
    head(c, -0.6, '#2d1a0e');
    c.fillStyle = col; c.fillRect(-0.09, -0.67, 0.2, 0.03);
    const a = p.k === 'atk' ? [-2.6, -0.8, 0.3][f.i] : -1.6;
    const [hx, hy] = arm(c, 0.06, -0.46, a, 0.2, col);
    if (p.k !== 'atk' || f.i < 2) {
      pole(c, hx - Math.cos(a + 1.6) * 0.2, hy - Math.sin(a + 1.6) * 0.2, hx + Math.cos(a + 1.6) * 0.18, hy + Math.sin(a + 1.6) * 0.18, 0.02);
    }
  },

  crossbow(c, col, f) {
    const p = phase(f); c.translate(0, -p.bob);
    legs(c, p, '#3f3a40');
    torso(c, col);
    c.fillStyle = '#7c8088'; c.fillRect(-0.15, -0.5, 0.3, 0.07);
    head(c, -0.6, HAIR, true);
    // Eisenhut
    blob(c, 0.01, -0.665, 0.16, 0.035, '#8a9098', 0, 0.4);
    blob(c, 0.01, -0.7, 0.085, 0.055, '#9aa0a8', 0, 0.4);
    const k = p.k === 'atk' ? [0.03, -0.03, 0][f.i] : 0;
    arm(c, 0.06, -0.46, 0.15, 0.17, col);
    poly(c, [0.0, -0.43 + k, 0.36, -0.46 + k, 0.36, -0.42 + k, 0.0, -0.39 + k], WOOD, 0.2);
    c.strokeStyle = OUT; c.lineWidth = 0.045;
    c.beginPath(); c.moveTo(0.3, -0.6 + k); c.quadraticCurveTo(0.36, -0.44 + k, 0.3, -0.28 + k); c.stroke();
    c.strokeStyle = '#7d848e'; c.lineWidth = 0.028;
    c.beginPath(); c.moveTo(0.3, -0.6 + k); c.quadraticCurveTo(0.36, -0.44 + k, 0.3, -0.28 + k); c.stroke();
    c.strokeStyle = '#eee'; c.lineWidth = 0.01;
    const sx = p.k === 'atk' && f.i > 0 ? 0.28 : 0.12;
    c.beginPath(); c.moveTo(0.3, -0.6 + k); c.lineTo(sx, -0.44 + k); c.lineTo(0.3, -0.28 + k); c.stroke();
    arm(c, 0.0, -0.45, 0.4, 0.13, col);
  },

  priest(c, col, f) {
    const p = phase(f); c.translate(0, -p.bob);
    const s = p.lp * 0.04;
    poly(c, [-0.17 - s, -0.01, 0.17 + s, -0.01, 0.12, -0.42, 0.04, -0.5, -0.04, -0.5, -0.12, -0.42], '#efe6d2', 0.15);
    c.fillStyle = col; c.fillRect(-0.035, -0.48, 0.07, 0.47);
    c.fillStyle = '#d9b45a'; c.fillRect(-0.035, -0.08, 0.07, 0.03);
    head(c, -0.6, '#b8b0a0', true);
    c.fillStyle = '#efe6d2'; c.beginPath(); c.arc(0.0, -0.63, 0.108, Math.PI * 0.95, Math.PI * 2.05); c.lineTo(0.0, -0.52); c.fill();
    const a = p.k === 'work' ? -0.9 + p.a * 0.3 : 0.4;
    const [hx, hy] = arm(c, 0.05, -0.44, a, 0.18, '#e2d7bf');
    pole(c, hx, hy + 0.25, hx, hy - 0.42, 0.03, '#9a7442');
    blob(c, hx, hy - 0.46, 0.055, 0.055, '#9dffb0', 0, 0.5);
  },

  golem(c, col, f) {
    const p = phase(f); c.translate(0, -p.bob * 0.5);
    const clay = '#c27a47', s = p.lp * 0.08;
    blob(c, -0.12 - s, -0.15, 0.11, 0.16, shade(clay, -0.2));
    blob(c, 0.12 + s, -0.15, 0.11, 0.16, clay);
    blob(c, 0, -0.55, 0.38, 0.32, clay, 0, 0.3);
    // Risse mit Glut
    c.strokeStyle = '#ffb347'; c.lineWidth = 0.02;
    c.beginPath(); c.moveTo(-0.2, -0.7); c.lineTo(-0.1, -0.6); c.lineTo(-0.16, -0.45); c.moveTo(0.15, -0.72); c.lineTo(0.08, -0.55); c.stroke();
    c.fillStyle = col; c.fillRect(-0.3, -0.53, 0.6, 0.07);
    c.strokeStyle = shade(col, 0.4); c.lineWidth = 0.015; c.strokeRect(-0.3, -0.53, 0.6, 0.07);
    blob(c, 0.03, -0.92, 0.17, 0.14, '#b06a3c', 0, 0.3);
    c.fillStyle = '#ffe27a'; c.fillRect(0.06, -0.95, 0.05, 0.035); c.fillRect(0.13, -0.95, 0.04, 0.035);
    const a = p.k === 'atk' ? [-0.9, 0.2, 0.7][f.i] : 0;
    blob(c, -0.38, -0.48 + Math.sin(a) * 0.05, 0.13, 0.13, '#9c5a30');
    blob(c, 0.4 + Math.cos(a) * 0.08, -0.5 + a * 0.18, 0.15, 0.14, '#a8643a');
  },

  guard(c, col, f) {
    const p = phase(f); c.translate(0, -p.bob);
    legs(c, p, '#5a5f68', '#2d2f34');
    // Umhang
    poly(c, [-0.14, -0.5, -0.24, -0.08, -0.05, -0.12, 0.0, -0.5], shade(col, -0.25), 0.1);
    torso(c, '#aeb5bf', -0.52, -0.18, 0.17, '#3d2a1a');
    c.fillStyle = col; c.beginPath(); c.moveTo(-0.13, -0.47); c.lineTo(0.13, -0.47); c.lineTo(0.1, -0.24); c.lineTo(-0.1, -0.24); c.fill();
    c.fillStyle = '#f5c518'; c.beginPath(); c.moveTo(-0.05, -0.4); c.lineTo(-0.05, -0.34); c.lineTo(0.05, -0.34); c.lineTo(0.05, -0.4); c.lineTo(0.025, -0.37); c.lineTo(0, -0.41); c.lineTo(-0.025, -0.37); c.fill();
    blob(c, -0.14, -0.48, 0.07, 0.05, '#c3c9d2');
    head(c, -0.62);
    helmet(c, '#d8dde4', -0.62, col);
    c.fillStyle = '#2a2a30'; c.fillRect(0.02, -0.64, 0.09, 0.015);
    const a = p.k === 'atk' ? [-1.9, -0.4, 0.4][f.i] : -1.35;
    const [hx, hy] = arm(c, 0.08, -0.46, a + 1.1, 0.17, '#aeb5bf');
    const ex = hx + Math.cos(a) * 0.55, ey = hy + Math.sin(a) * 0.55;
    pole(c, hx - Math.cos(a) * 0.25, hy - Math.sin(a) * 0.25, ex, ey, 0.03);
    // Hellebarde
    const nx = -Math.sin(a), ny = Math.cos(a);
    poly(c, [ex, ey, ex + nx * 0.12 - Math.cos(a) * 0.04, ey + ny * 0.12 - Math.sin(a) * 0.04, ex + nx * 0.1 - Math.cos(a) * 0.14, ey + ny * 0.1 - Math.sin(a) * 0.14, ex - Math.cos(a) * 0.12, ey - Math.sin(a) * 0.12], STEEL, 0.5);
    poly(c, [ex + Math.cos(a) * 0.12, ey + Math.sin(a) * 0.12, ex + nx * 0.025, ey + ny * 0.025, ex - nx * 0.025, ey - ny * 0.025], STEEL, 0.5);
  },

  rider(c, col, f) {
    const p = phase(f);
    horse(c, p, '#8a5530');
    c.save(); c.translate(-0.03, -0.38 - p.bob);
    shield(c, -0.1, -0.33, col, 0.12);
    torso(c, col, -0.52, -0.2, 0.14);
    head(c, -0.62); helmet(c, '#a7adb5', -0.62);
    const a = p.k === 'atk' ? [-2.2, -0.5, 0.5][f.i] : -1.0;
    const [hx, hy] = arm(c, 0.07, -0.46, p.k === 'atk' ? a + 0.6 : 0.6, 0.17, col);
    blade(c, hx, hy, a, 0.34);
    c.restore();
  },

  horsearcher(c, col, f) {
    const p = phase(f);
    horse(c, p, '#c8a070');
    c.save(); c.translate(-0.03, -0.38 - p.bob);
    torso(c, col, -0.52, -0.2, 0.14);
    poly(c, [-0.2, -0.62, -0.12, -0.64, -0.06, -0.3, -0.13, -0.28], LEATHER, 0.2);
    head(c, -0.62, '#1e140c');
    c.fillStyle = shade(col, -0.2); c.beginPath(); c.arc(0.01, -0.67, 0.1, Math.PI, 0); c.fill();
    const draw = p.k === 'atk' ? [0.1, 0.0, -0.02][f.i] : 0;
    c.strokeStyle = OUT; c.lineWidth = 0.045; c.beginPath(); c.arc(0.1, -0.47, 0.21, -1.05, 1.05); c.stroke();
    c.strokeStyle = WOOD; c.lineWidth = 0.028; c.beginPath(); c.arc(0.1, -0.47, 0.21, -1.05, 1.05); c.stroke();
    const tx = 0.1 + Math.cos(1.05) * 0.21;
    c.strokeStyle = '#eee'; c.lineWidth = 0.01;
    c.beginPath(); c.moveTo(tx, -0.47 - 0.18); c.lineTo(tx - 0.1 - draw, -0.47); c.lineTo(tx, -0.47 + 0.18); c.stroke();
    arm(c, 0.06, -0.47, -0.05, 0.2, col);
    arm(c, 0.02, -0.46, Math.PI - 0.1, 0.03 + draw * 0.5, col);
    c.restore();
  },

  knight(c, col, f) {
    const p = phase(f);
    horse(c, p, '#e8e0d0', col);
    c.save(); c.translate(-0.03, -0.4 - p.bob);
    shield(c, -0.11, -0.33, col, 0.13);
    torso(c, '#c9cfd8', -0.53, -0.2, 0.15, '#3d2a1a');
    c.fillStyle = col; c.fillRect(-0.11, -0.46, 0.22, 0.12);
    head(c, -0.63);
    // Topfhelm
    blob(c, 0.01, -0.65, 0.105, 0.11, '#d4d9e0', 0, 0.45);
    c.fillStyle = '#222'; c.fillRect(0.02, -0.67, 0.09, 0.018);
    c.fillStyle = col; c.beginPath(); c.moveTo(0, -0.76); c.quadraticCurveTo(-0.1, -0.9, -0.22, -0.82); c.quadraticCurveTo(-0.1, -0.8, -0.02, -0.72); c.fill();
    const th = p.k === 'atk' ? [-0.08, 0.16, 0.06][f.i] : 0;
    const ang = p.k === 'atk' ? -0.12 : -0.6;
    const bx = -0.05 + th, by = -0.42;
    pole(c, bx - Math.cos(ang) * 0.2, by - Math.sin(ang) * 0.2, bx + Math.cos(ang) * 0.75, by + Math.sin(ang) * 0.75, 0.035, '#d8c49a');
    c.fillStyle = col; c.beginPath();
    const fx = bx + Math.cos(ang) * 0.55, fy = by + Math.sin(ang) * 0.55;
    c.moveTo(fx, fy); c.lineTo(fx - 0.12, fy - 0.1); c.lineTo(fx - 0.16, fy + 0.0); c.fill();
    arm(c, 0.07, -0.46, 0.5, 0.15, '#c9cfd8');
    c.restore();
  },

  dog(c, col, f) {
    const p = phase(f);
    const g = p.k === 'walk' ? p.lp * 0.3 : 0;
    const coat = '#8a6a48';
    const leg = (x, a, cc) => limb(c, x, -0.14, x + Math.sin(a) * 0.08, -0.015, 0.045, cc);
    leg(-0.13, -g, shade(coat, -0.3)); leg(0.13, g, shade(coat, -0.3));
    c.strokeStyle = coat; c.lineWidth = 0.04; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-0.18, -0.2); c.quadraticCurveTo(-0.3, -0.3 + g * 0.05, -0.28, -0.38); c.stroke();
    blob(c, 0, -0.19, 0.2, 0.085, coat, 0, 0.25);
    c.fillStyle = col; c.fillRect(0.1, -0.26, 0.05, 0.12);
    const bite = p.k === 'atk' ? [0, 0.05, 0.02][f.i] : 0;
    blob(c, 0.22 + bite, -0.28, 0.09, 0.07, coat, 0, 0.25);
    blob(c, 0.3 + bite, -0.26, 0.05, 0.035, shade(coat, -0.15), 0, 0.2);
    c.fillStyle = '#1a1a1a'; c.beginPath(); c.arc(0.345 + bite, -0.27, 0.014, 0, 7); c.fill();
    c.fillStyle = shade(coat, -0.4); c.beginPath(); c.moveTo(0.17 + bite, -0.33); c.lineTo(0.16 + bite, -0.42); c.lineTo(0.22 + bite, -0.34); c.fill();
    c.fillStyle = '#111'; c.beginPath(); c.arc(0.25 + bite, -0.3, 0.012, 0, 7); c.fill();
    leg(-0.08, g, coat); leg(0.17, -g, coat);
  },

  ram(c, col, f) {
    const p = phase(f);
    const th = p.k === 'atk' ? [-0.08, 0.18, 0.05][f.i] : 0;
    // Rammbalken
    limb(c, -0.5 + th, -0.3, 0.42 + th, -0.3, 0.1, WOOD);
    poly(c, [0.4 + th, -0.38, 0.56 + th, -0.34, 0.56 + th, -0.26, 0.4 + th, -0.22], '#6a6e76', 0.4);
    // Gehäuse
    poly(c, [-0.5, -0.12, 0.42, -0.12, 0.42, -0.4, -0.5, -0.4], '#6b4b2b', 0.2);
    poly(c, [-0.58, -0.38, -0.04, -0.72, 0.5, -0.38], shade(col, -0.15), 0.3);
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.015;
    for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-0.5 + i * 0.22, -0.4); c.lineTo(-0.04, -0.7); c.stroke(); }
    c.strokeStyle = shade(col, 0.4); c.lineWidth = 0.03; c.beginPath(); c.moveTo(-0.56, -0.39); c.lineTo(0.48, -0.39); c.stroke();
    for (const wx of [-0.36, 0.28]) {
      blob(c, wx, -0.08, 0.1, 0.1, '#4a3420', 0, 0.2);
      c.strokeStyle = '#2a1c10'; c.lineWidth = 0.015;
      const r = p.k === 'walk' ? f.i * 0.8 : 0;
      for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(wx, -0.08); c.lineTo(wx + Math.cos(r + k * 2.1) * 0.09, -0.08 + Math.sin(r + k * 2.1) * 0.09); c.stroke(); }
    }
  },

  treb(c, col, f) {
    const p = phase(f);
    poly(c, [-0.58, -0.08, 0.58, -0.08, 0.58, -0.2, -0.58, -0.2], WOOD_D, 0.2);
    for (const wx of [-0.44, 0.44]) blob(c, wx, -0.05, 0.11, 0.11, '#3a2a1a', 0, 0.2);
    limb(c, -0.32, -0.18, 0.0, -0.82, 0.07, WOOD);
    limb(c, 0.32, -0.18, 0.0, -0.82, 0.07, WOOD);
    c.fillStyle = col; c.fillRect(-0.58, -0.24, 1.16, 0.05);
    // Wurfarm
    const k = p.k === 'atk' ? [0.15, 0.7, 1.0][f.i] : 0;
    const a = -2.5 + k * 2.0;
    const ax = Math.cos(a), ay = Math.sin(a);
    limb(c, -ax * 0.3, -0.82 - ay * 0.3, ax * 0.8, -0.82 + ay * 0.8, 0.05, '#6b4a2b');
    poly(c, [-ax * 0.3 - 0.13, -0.82 - ay * 0.3 - 0.02, -ax * 0.3 + 0.13, -0.82 - ay * 0.3 - 0.02, -ax * 0.3 + 0.1, -0.82 - ay * 0.3 + 0.2, -ax * 0.3 - 0.1, -0.82 - ay * 0.3 + 0.2], '#6a655c', 0.3);
    if (k < 0.7) blob(c, ax * 0.8, -0.82 + ay * 0.8 + 0.05, 0.07, 0.07, '#8a857c');
    blob(c, 0, -0.82, 0.04, 0.04, '#333');
  },

  ballista(c, col, f) {
    const p = phase(f);
    poly(c, [-0.45, -0.1, 0.4, -0.1, 0.4, -0.24, -0.45, -0.24], WOOD_D, 0.2);
    for (const wx of [-0.32, 0.28]) {
      blob(c, wx, -0.06, 0.09, 0.09, '#3a2a1a', 0, 0.2);
      c.strokeStyle = '#1e140a'; c.lineWidth = 0.012;
      const r = p.k === 'walk' ? f.i * 0.8 : 0;
      for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(wx, -0.06); c.lineTo(wx + Math.cos(r + k * 2.1) * 0.08, -0.06 + Math.sin(r + k * 2.1) * 0.08); c.stroke(); }
    }
    limb(c, -0.1, -0.22, 0.0, -0.42, 0.06, WOOD);
    c.fillStyle = col; c.fillRect(-0.45, -0.27, 0.85, 0.04);
    const rec = p.k === 'atk' ? [0, -0.05, -0.02][f.i] : 0;
    c.save(); c.translate(rec, 0); c.rotate(-0.12);
    poly(c, [-0.4, -0.5, 0.44, -0.5, 0.44, -0.44, -0.4, -0.44], WOOD, 0.2);
    c.strokeStyle = OUT; c.lineWidth = 0.06;
    c.beginPath(); c.moveTo(0.18, -0.78); c.quadraticCurveTo(0.34, -0.47, 0.18, -0.16); c.stroke();
    c.strokeStyle = '#6a4a2a'; c.lineWidth = 0.04;
    c.beginPath(); c.moveTo(0.18, -0.78); c.quadraticCurveTo(0.34, -0.47, 0.18, -0.16); c.stroke();
    const sx = p.k === 'atk' && f.i > 0 ? 0.16 : -0.22;
    c.strokeStyle = '#eee'; c.lineWidth = 0.012;
    c.beginPath(); c.moveTo(0.18, -0.78); c.lineTo(sx, -0.47); c.lineTo(0.18, -0.16); c.stroke();
    if (p.k !== 'atk' || f.i === 0) { limb(c, sx, -0.47, 0.5, -0.47, 0.025, '#b89a6a'); poly(c, [0.5, -0.5, 0.6, -0.47, 0.5, -0.44], STEEL, 0.4); }
    c.restore();
  },
};

// Sprite Ausmaße je Typ in Kacheln: Breite, Höhe über dem Boden
export const UNIT_BOX = {
  worker: [1.2, 1.1], spear: [1.4, 1.2], sword: [1.4, 1.1], archer: [1.3, 1.1], skirm: [1.3, 1.1], crossbow: [1.3, 1.1],
  priest: [1.2, 1.1], golem: [1.4, 1.25], guard: [1.6, 1.2], rider: [1.6, 1.45], horsearcher: [1.6, 1.45], knight: [2.0, 1.6],
  dog: [1.0, 0.7], ram: [1.4, 1.0], treb: [2.2, 2.0], ballista: [1.5, 1.1],
};
