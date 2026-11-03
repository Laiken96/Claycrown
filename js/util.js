// Hilfsfunktionen

export class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  next() {
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
}

// Binärer Min Heap für A*
export class Heap {
  constructor(cap = 4096) { this.idx = new Int32Array(cap); this.f = new Float64Array(cap); this.size = 0; }
  clear() { this.size = 0; }
  push(i, f) {
    if (this.size >= this.idx.length) {
      const ni = new Int32Array(this.idx.length * 2); ni.set(this.idx); this.idx = ni;
      const nf = new Float64Array(this.f.length * 2); nf.set(this.f); this.f = nf;
    }
    let k = this.size++;
    const I = this.idx, F = this.f;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (F[p] <= f) break;
      I[k] = I[p]; F[k] = F[p]; k = p;
    }
    I[k] = i; F[k] = f;
  }
  pop() {
    const I = this.idx, F = this.f;
    const top = I[0];
    const n = --this.size;
    if (n > 0) {
      const li = I[n], lf = F[n];
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= n) break;
        if (c + 1 < n && F[c + 1] < F[c]) c++;
        if (F[c] >= lf) break;
        I[k] = I[c]; F[k] = F[c]; k = c;
      }
      I[k] = li; F[k] = lf;
    }
    return top;
  }
}

export function valueNoise(W, H, scale, rng) {
  const gw = Math.ceil(W / scale) + 2, gh = Math.ceil(H / scale) + 2;
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  const out = new Float32Array(W * H);
  const sm = t => t * t * (3 - 2 * t);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const fx = x / scale, fy = y / scale;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = sm(fx - ix), ty = sm(fy - iy);
      const a = g[iy * gw + ix], b = g[iy * gw + ix + 1];
      const c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
      out[y * W + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function costText(cost) {
  const ic = { food: '🌾', wood: '🪵', gold: '🪙', clay: '🧱' };
  return Object.entries(cost).map(([k, v]) => `${ic[k]}${v}`).join(' ');
}

export function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
