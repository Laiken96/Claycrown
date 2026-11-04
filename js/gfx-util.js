// Claycrown 2.0: gemeinsame Grafikhelfer

export function hexRgb(h) {
  if (h[0] !== '#') { const m = h.match(/\d+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]]; }
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Farbe aufhellen (f > 0) oder abdunkeln (f < 0)
export function shade(hex, f) {
  let [r, g, b] = hexRgb(hex);
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function rgba(hex, a) { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; }

export function hash(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

export const OUT = 'rgba(28,16,8,0.9)';

// Linie mit dunkler Kontur
export function limb(c, x0, y0, x1, y1, w, col) {
  c.lineCap = 'round';
  c.strokeStyle = OUT; c.lineWidth = w + 0.035;
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  c.strokeStyle = col; c.lineWidth = w;
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
}

// Gefüllte Ellipse mit Kontur und Glanzlicht
export function blob(c, x, y, rx, ry, col, rot = 0, gloss = 0.22) {
  c.fillStyle = OUT;
  c.beginPath(); c.ellipse(x, y, rx + 0.018, ry + 0.018, rot, 0, 7); c.fill();
  const g = c.createLinearGradient(x - rx, y - ry, x + rx * 0.6, y + ry);
  g.addColorStop(0, shade(col, gloss)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.28));
  c.fillStyle = g;
  c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, 7); c.fill();
}

// Polygon mit Kontur und Verlauf
export function poly(c, pts, col, gloss = 0.18, outline = true) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  if (outline) { c.strokeStyle = OUT; c.lineWidth = 0.035; c.lineJoin = 'round'; c.stroke(); }
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, shade(col, gloss)); g.addColorStop(1, shade(col, -0.25));
  c.fillStyle = g; c.fill();
}

export function smooth(t) { return t * t * (3 - 2 * t); }
export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
