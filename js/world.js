// Claycrown: Simulation
import {
  SIM_DT, MAX_POP, MONUMENT_TIME, UNITS, BUILDINGS, TECHS, PLAYER_COLORS, PLAYER_NAMES, RES_INFO,
} from './data.js';
import { RNG, Heap, valueNoise, clamp } from './util.js';

export const T = { GRASS: 0, WATER: 1, SHALLOW: 2, SAND: 3, DIRT: 4 };
export const RES_KIND = { tree: 'wood', gold: 'gold', clay: 'clay', berry: 'food' };
const RES_AMOUNT = { tree: 100, gold: 800, clay: 600, berry: 125 };
const BASE_RATE = { tree: 0.48, gold: 0.40, clay: 0.44, berry: 0.50, farm: 0.44 };
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];
const CELL = 4;
const AI_MULT = { easy: 0.85, normal: 1.0, hard: 1.25 };

const circleCache = new Map();
function circleOffsets(r) {
  let c = circleCache.get(r);
  if (c) return c;
  c = [];
  const R = Math.ceil(r);
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (x * x + y * y <= r * r + 0.5) c.push(x, y);
  circleCache.set(r, c);
  return c;
}

export class Game {
  static create(opts) { const g = new Game(); g._init(opts || {}); return g; }
  static load(data) { const g = new Game(); g._load(data); return g; }

  _alloc() {
    const N = this.W * this.H;
    this.occ = new Int32Array(N);
    this.blk = new Uint8Array(N);
    this.ents = new Map();
    this.events = [];
    this._gen = 0;
    this._stamp = new Uint32Array(N);
    this._closed = new Uint32Array(N);
    this._g = new Float32Array(N);
    this._came = new Int32Array(N);
    this._heap = new Heap(8192);
    this.gw = Math.ceil(this.W / CELL); this.gh = Math.ceil(this.H / CELL);
    this.grid = Array.from({ length: this.gw * this.gh }, () => []);
    this.units = []; this.blds = [];
    this.pathBudget = 0; this.fogT = 0; this.checkT = 0;
    this.attackAlertT = -99;
  }

  _init(opts) {
    const size = opts.size || 96;
    this.W = size; this.H = size;
    this.seed = opts.seed ?? ((Math.random() * 2 ** 31) | 0);
    this.difficulty = opts.difficulty || 'normal';
    this.time = 0; this.nextId = 1; this.over = false; this.winner = null;
    this.terrain = new Uint8Array(size * size);
    this.vis = new Uint8Array(size * size);
    this.projectiles = []; this.decals = [];
    this.revealAll = !!opts.reveal;
    this._alloc();
    const n = 1 + clamp(opts.ais || 1, 1, 3);
    this.players = [];
    for (let i = 0; i < n; i++) {
      this.players.push({
        id: i, name: PLAYER_NAMES[i], color: PLAYER_COLORS[i], isAI: i > 0, ai: i > 0 ? {} : null,
        res: { food: 200, wood: 200, gold: 100, clay: 100 }, age: 0, techs: {}, researching: {},
        pop: 0, popCap: 0, defeated: false, stats: { gathered: 0, trained: 0, killed: 0, lost: 0, built: 0 },
      });
    }
    this.generateMap(new RNG(this.seed));
    this.recalcPop();
    this.updateFog();
  }

  // ---------- Speichern und Laden ----------
  toJSON() {
    return {
      v: 1, W: this.W, H: this.H, seed: this.seed, difficulty: this.difficulty, time: this.time, nextId: this.nextId,
      over: this.over, winner: this.winner, revealAll: this.revealAll, spawns: this.spawns,
      terrain: Array.from(this.terrain), vis: Array.from(this.vis), players: this.players,
      ents: Array.from(this.ents.values()), projectiles: this.projectiles, decals: this.decals,
    };
  }

  _load(d) {
    this.W = d.W; this.H = d.H; this.seed = d.seed; this.difficulty = d.difficulty; this.time = d.time;
    this.nextId = d.nextId; this.over = d.over; this.winner = d.winner; this.revealAll = d.revealAll; this.spawns = d.spawns;
    this.terrain = Uint8Array.from(d.terrain); this.vis = Uint8Array.from(d.vis);
    this.projectiles = d.projectiles || []; this.decals = d.decals || [];
    this._alloc();
    this.players = d.players;
    for (let i = 0; i < this.terrain.length; i++) this.blk[i] = this.terrain[i] === T.WATER ? 1 : 0;
    for (const e of d.ents) { this.ents.set(e.id, e); if (e.cls !== 'u') this.occupy(e, true); }
    this.recalcPop();
  }

  emit(ev) { this.events.push(ev); }

  // ---------- Karte ----------
  inb(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
  passable(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.W && ty < this.H && !this.blk[ty * this.W + tx]; }
  passableAt(x, y) { return this.passable(Math.floor(x), Math.floor(y)); }
  buildableTile(x, y) {
    if (!this.inb(x, y)) return false;
    const i = y * this.W + x, t = this.terrain[i];
    return (t === T.GRASS || t === T.SAND || t === T.DIRT) && this.occ[i] === 0;
  }

  generateMap(rng) {
    const { W, H } = this;
    const n = this.players.length;
    const cx = W / 2, cy = H / 2, R = W * 0.34;
    const a0 = rng.next() * Math.PI * 2;
    const spawns = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (i * Math.PI * 2) / n;
      spawns.push({ x: Math.round(cx + Math.cos(a) * R), y: Math.round(cy + Math.sin(a) * R) });
    }
    this.spawns = spawns;
    const forest = valueNoise(W, H, 9, rng), forest2 = valueNoise(W, H, 4, rng), lake = valueNoise(W, H, 14, rng);
    const dmin = (x, y) => { let m = 1e9; for (const s of spawns) { const d = Math.hypot(x - s.x, y - s.y); if (d < m) m = d; } return m; };
    const treeTiles = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, d = dmin(x + 0.5, y + 0.5), edge = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (lake[i] > 0.7 && d > 15 && edge > 3) this.terrain[i] = T.WATER;
      else {
        const fv = forest[i] * 0.75 + forest2[i] * 0.25;
        if ((fv > 0.62 && d > 12) || edge < 2 || (edge < 4 && rng.next() < 0.45)) treeTiles.push(i);
      }
    }
    // Korridore zwischen den Startpositionen sichern
    const noTree = new Uint8Array(W * H);
    const carve = (x0, y0, x1, y1) => {
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(x0 + ((x1 - x0) * s) / steps), y = Math.round(y0 + ((y1 - y0) * s) / steps);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!this.inb(x + dx, y + dy)) continue;
          const i = (y + dy) * W + x + dx;
          if (this.terrain[i] === T.WATER) this.terrain[i] = T.SHALLOW;
          noTree[i] = 1;
        }
      }
    };
    spawns.forEach((s, i) => { carve(s.x, s.y, cx, cy); const t = spawns[(i + 1) % n]; if (n > 2) carve(s.x, s.y, t.x, t.y); });
    // Ufer
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (this.terrain[i] !== T.GRASS) continue;
      for (let k = 0; k < 8; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (this.inb(nx, ny) && this.terrain[ny * W + nx] === T.WATER) { this.terrain[i] = T.SAND; break; }
      }
    }
    for (const s of spawns) for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) {
      const tx = s.x + x, ty = s.y + y; if (!this.inb(tx, ty)) continue;
      const d = Math.hypot(x, y), i = ty * W + tx;
      if (this.terrain[i] === T.GRASS && rng.next() < 0.75 - d / 8) this.terrain[i] = T.DIRT;
    }
    for (let i = 0; i < W * H; i++) this.blk[i] = this.terrain[i] === T.WATER ? 1 : 0;
    for (const i of treeTiles) {
      if (noTree[i] || this.terrain[i] === T.WATER || this.terrain[i] === T.SHALLOW) continue;
      const x = i % W, y = (i / W) | 0;
      if (dmin(x + 0.5, y + 0.5) < 7) continue;
      this.addResource('tree', x, y, rng);
    }
    spawns.forEach((s, pid) => {
      const tx = s.x - 2, ty = s.y - 2;
      this.clearArea(tx - 2, ty - 2, 8, 8);
      for (let y = ty; y < ty + 4; y++) for (let x = tx; x < tx + 4; x++) {
        const i = y * W + x; if (this.terrain[i] !== T.GRASS && this.terrain[i] !== T.DIRT) this.terrain[i] = T.DIRT;
        this.blk[i] = 0;
      }
      this.addBuilding('keep', pid, tx, ty, true);
      const dirs = [[s.x - 1, s.y + 3], [s.x, s.y + 3], [s.x + 1, s.y + 3], [s.x + 3, s.y]];
      ['worker', 'worker', 'worker', 'spear'].forEach((t, k) => this.addUnit(t, pid, dirs[k][0] + 0.5, dirs[k][1] + 0.5));
      this.placeCluster(rng, 'berry', 6, s, 5, 7);
      this.placeCluster(rng, 'gold', 5, s, 8, 10);
      this.placeCluster(rng, 'clay', 5, s, 8, 11);
      this.placeCluster(rng, 'gold', 4, s, 15, 19);
      this.placeCluster(rng, 'tree', 26, s, 9, 12);
      this.placeCluster(rng, 'tree', 14, s, 10, 14);
      this.placeCluster(rng, 'berry', 5, s, 13, 17);
    });
    const extra = Math.round((W * H) / 1300);
    for (let k = 0; k < extra; k++) {
      for (let tries = 0; tries < 30; tries++) {
        const x = rng.int(4, W - 5), y = rng.int(4, H - 5);
        if (dmin(x, y) < 20 || !this.buildableTile(x, y)) continue;
        this.placeCluster(rng, k % 3 === 2 ? 'clay' : 'gold', rng.int(4, 6), { x, y }, 0, 0);
        break;
      }
    }
  }

  clearArea(x0, y0, w, h) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      if (!this.inb(x, y)) continue;
      const id = this.occ[y * this.W + x];
      if (id) { const e = this.ents.get(id); if (e && e.cls === 'r') this.removeEnt(e); }
    }
  }

  placeCluster(rng, kind, count, s, dMin, dMax) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const a = rng.next() * Math.PI * 2, d = rng.range(dMin, dMax);
      const cx = Math.round(s.x + Math.cos(a) * d), cy = Math.round(s.y + Math.sin(a) * d);
      if (!this.okCluster(cx, cy, kind)) continue;
      const placed = [[cx, cy]];
      this.addResource(kind, cx, cy, rng);
      let guard = 0;
      while (placed.length < count && guard++ < count * 20) {
        const [bx, by] = placed[rng.int(0, placed.length - 1)];
        const k = rng.int(0, 3), nx = bx + DX[k], ny = by + DY[k];
        if (!this.okCluster(nx, ny, kind)) continue;
        this.addResource(kind, nx, ny, rng);
        placed.push([nx, ny]);
      }
      return placed.length;
    }
    return 0;
  }

  okCluster(x, y, kind) {
    if (x < 2 || y < 2 || x >= this.W - 2 || y >= this.H - 2 || !this.buildableTile(x, y)) return false;
    const minD = kind === 'tree' ? 6 : 4.5;
    for (const s of this.spawns) if (Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y) < minD) return false;
    return true;
  }

  // ---------- Entitäten ----------
  addUnit(type, owner, x, y) {
    const d = UNITS[type];
    const u = {
      id: this.nextId++, cls: 'u', type, owner, x, y, px: x, py: y, hp: d.hp, maxHp: d.hp,
      order: null, path: null, pi: 0, pkey: null, repT: 0, cool: Math.random() * 0.3, carry: null, carryN: 0,
      dir: Math.PI / 2, walk: 0, scanT: Math.random() * 0.5, stT: 0, stX: x, stY: y, stN: 0, work: 0, atkT: 0,
    };
    this.ents.set(u.id, u);
    return u;
  }

  bMaxHp(owner, type) { return Math.round(BUILDINGS[type].hp * (this.players[owner].techs.masonry ? 1.3 : 1)); }

  addBuilding(type, owner, tx, ty, done) {
    const d = BUILDINGS[type], maxHp = this.bMaxHp(owner, type);
    const b = {
      id: this.nextId++, cls: 'b', type, owner, tx, ty, w: d.w, h: d.h, x: tx + d.w / 2, y: ty + d.h / 2,
      hp: done ? maxHp : 1, maxHp, done: !!done, prog: done ? 1 : 0, queue: [], rally: null, cool: 0, nb: 0, nbN: 0,
      food: done ? d.food || 0 : 0, farmer: 0, seen: owner === 0, mt: 0,
    };
    this.ents.set(b.id, b);
    this.occupy(b, true);
    return b;
  }

  addResource(kind, tx, ty, rng) {
    const r = {
      id: this.nextId++, cls: 'r', kind, tx, ty, w: 1, h: 1, x: tx + 0.5, y: ty + 0.5, owner: -1,
      amount: RES_AMOUNT[kind], max: RES_AMOUNT[kind], hp: 1, v: Math.floor((rng ? rng.next() : Math.random()) * 1000),
    };
    this.ents.set(r.id, r);
    this.occupy(r, true);
    return r;
  }

  occupy(e, on) {
    const walk = e.cls === 'b' && BUILDINGS[e.type].walk;
    for (let y = e.ty; y < e.ty + e.h; y++) for (let x = e.tx; x < e.tx + e.w; x++) {
      if (!this.inb(x, y)) continue;
      const i = y * this.W + x;
      if (on) { this.occ[i] = e.id; this.blk[i] = walk ? 0 : 1; }
      else if (this.occ[i] === e.id) { this.occ[i] = 0; this.blk[i] = this.terrain[i] === T.WATER ? 1 : 0; }
    }
  }

  removeEnt(e) {
    if (!this.ents.has(e.id)) return;
    this.ents.delete(e.id);
    e.dead = true;
    if (e.cls !== 'u') this.occupy(e, false);
  }

  entAt(tx, ty) { if (!this.inb(tx, ty)) return null; const id = this.occ[ty * this.W + tx]; return id ? this.ents.get(id) : null; }

  // ---------- Spieler und Wirtschaft ----------
  canAfford(p, cost) { for (const k in cost) if (p.res[k] < cost[k]) return false; return true; }
  missing(p, cost) { for (const k in cost) if (p.res[k] < cost[k]) return RES_INFO[k].name; return null; }
  pay(p, cost) { for (const k in cost) p.res[k] -= cost[k]; }
  refund(p, cost, f = 1) { for (const k in cost) p.res[k] += Math.floor(cost[k] * f); }

  recalcPop() {
    for (const p of this.players) p.popCap = 0;
    for (const e of this.ents.values()) {
      if (e.cls === 'b' && e.done) { const pop = BUILDINGS[e.type].pop; if (pop) this.players[e.owner].popCap += pop; }
    }
    for (const p of this.players) p.popCap = Math.min(MAX_POP, p.popCap);
    for (const p of this.players) p.pop = 0;
    for (const e of this.ents.values()) if (e.cls === 'u') this.players[e.owner].pop++;
  }

  hasDone(owner, type) {
    for (const e of this.ents.values()) if (e.cls === 'b' && e.owner === owner && e.type === type && e.done) return true;
    return false;
  }

  gatherRate(owner, kind) {
    const p = this.players[owner];
    let r = BASE_RATE[kind];
    if (kind === 'tree' && p.techs.axe) r *= 1.2;
    if ((kind === 'gold' || kind === 'clay') && p.techs.pick) r *= 1.2;
    if (kind === 'farm' && p.techs.plow) r *= 1.2;
    if (p.isAI) r *= AI_MULT[this.difficulty] || 1;
    return r;
  }
  carryCap(p) { return p.techs.wheelbarrow ? 15 : 10; }
  unitSpeed(u) {
    const d = UNITS[u.type];
    return d.speed * (u.type === 'worker' && this.players[u.owner].techs.wheelbarrow ? 1.1 : 1);
  }

  // ---------- Befehle ----------
  canPlace(type, tx, ty, owner) {
    const d = BUILDINGS[type];
    for (let y = ty; y < ty + d.h; y++) for (let x = tx; x < tx + d.w; x++) {
      if (!this.buildableTile(x, y)) return false;
      if (owner === 0 && !this.revealAll && this.vis[y * this.W + x] === 0) return false;
    }
    return true;
  }

  buildError(owner, type) {
    const p = this.players[owner], d = BUILDINGS[type];
    if (p.age < d.age) return 'Benötigt ' + ['Lehmzeit', 'Brennofenzeit', 'Bronzezeit', 'Kronenzeit'][d.age];
    if (d.req && !this.hasDone(owner, d.req)) return 'Benötigt ' + BUILDINGS[d.req].name;
    const m = this.missing(p, d.cost);
    if (m) return 'Nicht genug ' + m;
    return null;
  }

  placeBuilding(owner, type, tx, ty, builderIds) {
    const err = this.buildError(owner, type);
    if (err) return err;
    if (!this.canPlace(type, tx, ty, owner)) return 'Hier kann nicht gebaut werden';
    const p = this.players[owner];
    this.pay(p, BUILDINGS[type].cost);
    const b = this.addBuilding(type, owner, tx, ty, false);
    // Einheiten aus dem Fundament schieben
    for (const u of this.ents.values()) {
      if (u.cls !== 'u') continue;
      if (u.x >= tx - 0.2 && u.x <= tx + b.w + 0.2 && u.y >= ty - 0.2 && u.y <= ty + b.h + 0.2 && !BUILDINGS[type].walk) {
        const s = this.freeSpotNear(b, null);
        u.x = u.px = s.x; u.y = u.py = s.y; u.path = null;
      }
    }
    if (builderIds) this.issueBuild(builderIds, b.id);
    return b;
  }

  train(bid, key) {
    const b = this.ents.get(bid);
    if (!b || !b.done) return 'Gebäude nicht bereit';
    const p = this.players[b.owner], d = UNITS[key];
    if (!(BUILDINGS[b.type].trains || []).includes(key)) return 'Nicht möglich';
    if (p.age < d.age) return 'Benötigt ' + ['Lehmzeit', 'Brennofenzeit', 'Bronzezeit', 'Kronenzeit'][d.age];
    if (b.queue.length >= 6) return 'Warteschlange voll';
    const m = this.missing(p, d.cost);
    if (m) return 'Nicht genug ' + m;
    this.pay(p, d.cost);
    b.queue.push({ k: 'u', key, t: 0 });
    return true;
  }

  research(bid, key) {
    const b = this.ents.get(bid);
    if (!b || !b.done) return 'Gebäude nicht bereit';
    const p = this.players[b.owner], t = TECHS[key];
    if (!(BUILDINGS[b.type].techs || []).includes(key)) return 'Nicht möglich';
    if (p.techs[key] || p.researching[key]) return 'Bereits erforscht';
    if (t.ageUp && t.ageUp !== p.age + 1) return 'Nicht verfügbar';
    if (p.age < t.age) return 'Benötigt ' + ['Lehmzeit', 'Brennofenzeit', 'Bronzezeit', 'Kronenzeit'][t.age];
    if (b.queue.length >= 6) return 'Warteschlange voll';
    const m = this.missing(p, t.cost);
    if (m) return 'Nicht genug ' + m;
    this.pay(p, t.cost);
    p.researching[key] = true;
    b.queue.push({ k: 't', key, t: 0 });
    return true;
  }

  cancelQueue(bid, idx) {
    const b = this.ents.get(bid);
    if (!b || !b.queue[idx]) return;
    const q = b.queue[idx], p = this.players[b.owner];
    if (q.k === 'u') this.refund(p, UNITS[q.key].cost);
    else { this.refund(p, TECHS[q.key].cost); delete p.researching[q.key]; }
    b.queue.splice(idx, 1);
  }

  setRally(bid, x, y, tid) { const b = this.ents.get(bid); if (b) b.rally = { x, y, id: tid || 0 }; }

  demolish(id) {
    const e = this.ents.get(id);
    if (!e || e.cls === 'r') return;
    if (e.cls === 'b' && !e.done) this.refund(this.players[e.owner], BUILDINGS[e.type].cost, 0.5 * (1 - e.prog));
    this.kill(e, -1);
  }

  unitsOf(ids) { const out = []; for (const id of ids) { const e = this.ents.get(id); if (e && e.cls === 'u') out.push(e); } return out; }

  issueStop(ids) { for (const u of this.unitsOf(ids)) { u.order = null; u.path = null; } }

  issueMove(ids, x, y, amove) {
    const us = this.unitsOf(ids);
    if (!us.length) return;
    const spots = this.formation(x, y, us.length);
    const free = spots.slice();
    us.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    for (const u of us) {
      let bi = 0, bd = 1e9;
      for (let i = 0; i < free.length; i++) { const d = Math.hypot(free[i].x - u.x, free[i].y - u.y); if (d < bd) { bd = d; bi = i; } }
      const s = free.splice(bi, 1)[0] || { x, y };
      u.order = { t: amove ? 'amove' : 'move', x: s.x, y: s.y };
      u.path = null; u.stN = 0;
    }
  }

  issueAttack(ids, tid) {
    const t = this.ents.get(tid);
    if (!t) return;
    for (const u of this.unitsOf(ids)) {
      if (!this.canAttack(u, t)) { if (t.cls === 'u') this.issueMove([u.id], t.x, t.y); continue; }
      u.order = { t: 'attack', id: tid }; u.path = null;
    }
  }

  issueGather(ids, rid) {
    const r = this.ents.get(rid);
    if (!r) return;
    const kind = r.cls === 'r' ? RES_KIND[r.kind] : 'food';
    const others = [];
    for (const u of this.unitsOf(ids)) {
      if (u.type !== 'worker') { others.push(u.id); continue; }
      u.order = { t: 'gather', id: rid, kind }; u.path = null; u.stN = 0;
    }
    if (others.length) this.issueMove(others, r.x, r.y + 1.2);
  }

  issueBuild(ids, bid) {
    const b = this.ents.get(bid);
    if (!b) return;
    for (const u of this.unitsOf(ids)) {
      if (u.type !== 'worker') continue;
      u.order = { t: 'build', id: bid }; u.path = null; u.stN = 0;
    }
  }

  // Kontextbefehl wie beim Tippen auf ein Ziel
  smartCommand(ids, x, y, target) {
    const us = this.unitsOf(ids);
    if (!us.length) return null;
    const owner = us[0].owner;
    if (target && target.cls === 'u' && target.owner !== owner) { this.issueAttack(ids, target.id); return 'attack'; }
    if (target && target.cls === 'b' && target.owner !== owner) { this.issueAttack(ids, target.id); return 'attack'; }
    if (target && target.cls === 'r') { this.issueGather(ids, target.id); return 'gather'; }
    if (target && target.cls === 'b' && target.owner === owner) {
      const workers = us.filter(u => u.type === 'worker').map(u => u.id);
      const rest = us.filter(u => u.type !== 'worker').map(u => u.id);
      if (workers.length) {
        if (!target.done) this.issueBuild(workers, target.id);
        else if (target.type === 'farm') this.issueGather(workers.slice(0, 1), target.id);
        else if (target.hp < target.maxHp) this.issueBuild(workers, target.id);
        else {
          const d = BUILDINGS[target.type];
          if (d.drop) { for (const u of this.unitsOf(workers)) if (u.carryN > 0) u.order = { t: 'gather', id: 0, kind: u.carry, dropping: true }; else u.order = null; }
          else this.issueMove(workers, target.x, target.y + target.h / 2 + 1);
        }
      }
      if (rest.length) this.issueMove(rest, target.x, target.y + target.h / 2 + 1);
      return workers.length ? 'build' : 'move';
    }
    this.issueMove(ids, x, y);
    return 'move';
  }

  formation(x, y, n) {
    const W = this.W;
    let sx = clamp(Math.floor(x), 0, W - 1), sy = clamp(Math.floor(y), 0, this.H - 1);
    const out = [];
    if (!this.passable(sx, sy)) {
      const near = this.nearestPassable(sx, sy, 8);
      if (near) { sx = near.x; sy = near.y; } else return [{ x, y }];
      out.push({ x: sx + 0.5, y: sy + 0.5 });
    } else out.push({ x, y });
    const seen = new Set([sy * W + sx]);
    const q = [[sx, sy]];
    while (q.length && out.length < n) {
      const [cx, cy] = q.shift();
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], ny = cy + DY[k];
        const i = ny * W + nx;
        if (!this.passable(nx, ny) || seen.has(i)) continue;
        seen.add(i); q.push([nx, ny]);
        if (out.length < n) out.push({ x: nx + 0.5, y: ny + 0.5 });
      }
      if (seen.size > 600) break;
    }
    while (out.length < n) out.push({ x, y });
    return out;
  }

  nearestPassable(tx, ty, maxR) {
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = 1e9;
      for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) {
        if (Math.abs(x - tx) !== r && Math.abs(y - ty) !== r) continue;
        if (!this.passable(x, y)) continue;
        const d = Math.hypot(x - tx, y - ty);
        if (d < bd) { bd = d; best = { x, y }; }
      }
      if (best) return best;
    }
    return null;
  }

  freeSpotNear(b, toward) {
    const tx = toward ? toward.x : b.x, ty = toward ? toward.y : b.ty + b.h + 1;
    for (let r = 0; r < 6; r++) {
      let best = null, bd = 1e9;
      for (let y = b.ty - 1 - r; y <= b.ty + b.h + r; y++) for (let x = b.tx - 1 - r; x <= b.tx + b.w + r; x++) {
        const edge = x === b.tx - 1 - r || x === b.tx + b.w + r || y === b.ty - 1 - r || y === b.ty + b.h + r;
        if (!edge || !this.passable(x, y)) continue;
        const d = Math.hypot(x + 0.5 - tx, y + 0.5 - ty) + Math.random() * 0.4;
        if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5 }; }
      }
      if (best) return best;
    }
    return { x: b.x, y: b.ty + b.h + 0.5 };
  }

  // ---------- Wegfindung ----------
  findPath(fx, fy, gx0, gy0, gx1, gy1, maxIter = 7000) {
    const W = this.W, H = this.H, blk = this.blk;
    const sx = clamp(Math.floor(fx), 0, W - 1), sy = clamp(Math.floor(fy), 0, H - 1);
    gx0 = clamp(gx0, 0, W - 1); gx1 = clamp(gx1, 0, W - 1); gy0 = clamp(gy0, 0, H - 1); gy1 = clamp(gy1, 0, H - 1);
    if (sx >= gx0 && sx <= gx1 && sy >= gy0 && sy <= gy1) return [];
    if (++this._gen > 4e9) { this._gen = 1; this._stamp.fill(0); this._closed.fill(0); }
    const gen = this._gen, stamp = this._stamp, closed = this._closed, g = this._g, came = this._came, heap = this._heap;
    heap.clear();
    const h = (x, y) => {
      const dx = x < gx0 ? gx0 - x : x > gx1 ? x - gx1 : 0, dy = y < gy0 ? gy0 - y : y > gy1 ? y - gy1 : 0;
      return dx > dy ? dx + 0.4142 * dy : dy + 0.4142 * dx;
    };
    const s = sy * W + sx;
    stamp[s] = gen; g[s] = 0; came[s] = -1;
    heap.push(s, h(sx, sy));
    let best = s, bestH = h(sx, sy), found = -1, iter = 0;
    while (heap.size && iter++ < maxIter) {
      const cur = heap.pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      const cx = cur % W, cy = (cur / W) | 0;
      if (cx >= gx0 && cx <= gx1 && cy >= gy0 && cy <= gy1) { found = cur; break; }
      const hc = h(cx, cy);
      if (hc < bestH) { bestH = hc; best = cur; }
      for (let k = 0; k < 8; k++) {
        const dx = DX[k], dy = DY[k], nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (blk[ni] || closed[ni] === gen) continue;
        if (dx && dy && (blk[cy * W + nx] || blk[ny * W + cx])) continue;
        const ng = g[cur] + (dx && dy ? 1.4142 : 1);
        if (stamp[ni] !== gen || ng < g[ni]) {
          stamp[ni] = gen; g[ni] = ng; came[ni] = cur;
          heap.push(ni, ng + h(nx, ny) * 1.01);
        }
      }
    }
    if (found < 0) found = best;
    const tiles = [];
    for (let c = found; c !== s && c >= 0; c = came[c]) tiles.push(c);
    tiles.reverse();
    // Pfad glätten
    const out = [];
    let ax = fx, ay = fy, i = 0;
    while (i < tiles.length) {
      let far = i;
      for (let k = Math.min(tiles.length - 1, i + 12); k > i; k--) {
        const t = tiles[k];
        if (this.lineClear(ax, ay, (t % W) + 0.5, ((t / W) | 0) + 0.5)) { far = k; break; }
      }
      const t = tiles[far];
      ax = (t % W) + 0.5; ay = ((t / W) | 0) + 0.5;
      out.push(ax, ay);
      i = far + 1;
    }
    return out;
  }

  lineClear(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 0.25);
    for (let k = 1; k < n; k++) {
      const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
      if (!this.passableAt(x, y) || !this.passableAt(x + 0.22, y + 0.22) || !this.passableAt(x - 0.22, y - 0.22)
        || !this.passableAt(x + 0.22, y - 0.22) || !this.passableAt(x - 0.22, y + 0.22)) return false;
    }
    return true;
  }

  pathTo(u, x0, y0, x1, y1) {
    if (this.pathBudget <= 0) return false;
    this.pathBudget--;
    u.path = this.findPath(u.x, u.y, x0, y0, x1, y1);
    u.pi = 0;
    return true;
  }

  // ---------- Bewegung ----------
  tryMove(u, nx, ny) {
    nx = clamp(nx, 0.05, this.W - 0.05); ny = clamp(ny, 0.05, this.H - 0.05);
    if (!this.passableAt(u.x, u.y) || this.passableAt(nx, ny)) { u.x = nx; u.y = ny; return true; }
    if (this.passableAt(nx, u.y)) { u.x = nx; return true; }
    if (this.passableAt(u.x, ny)) { u.y = ny; return true; }
    return false;
  }

  stepToward(u, tx, ty, dt) {
    const sp = this.unitSpeed(u) * dt, dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
    u.moving = true;
    if (d <= sp) { this.tryMove(u, tx, ty); u.walk += d * 4; return true; }
    u.dir = Math.atan2(dy, dx);
    u.walk += sp * 4;
    this.tryMove(u, u.x + (dx / d) * sp, u.y + (dy / d) * sp);
    return false;
  }

  goTo(u, x, y, tol) {
    const dx = x - u.x, dy = y - u.y;
    if (dx * dx + dy * dy <= tol * tol) { u.path = null; return true; }
    const tx = clamp(Math.floor(x), 0, this.W - 1), ty = clamp(Math.floor(y), 0, this.H - 1);
    const key = ty * this.W + tx;
    if (!u.path || u.pkey !== key) {
      const e = this.passable(tx, ty) ? 0 : 1;
      if (!this.pathTo(u, tx - e, ty - e, tx + e, ty + e)) return false;
      u.pkey = key;
    }
    if (u.pi < u.path.length) {
      if (this.stepToward(u, u.path[u.pi], u.path[u.pi + 1], SIM_DT)) u.pi += 2;
      return false;
    }
    if (this.passable(tx, ty)) {
      if (this.stepToward(u, x, y, SIM_DT)) { u.path = null; return true; }
      return false;
    }
    u.path = null;
    return true;
  }

  edgeDist(u, e) {
    const ur = UNITS[u.type].r;
    if (e.cls === 'u') return Math.hypot(e.x - u.x, e.y - u.y) - UNITS[e.type].r - ur;
    const dx = Math.max(e.tx - u.x, 0, u.x - (e.tx + e.w)), dy = Math.max(e.ty - u.y, 0, u.y - (e.ty + e.h));
    return Math.hypot(dx, dy) - ur;
  }

  approach(u, e, range) {
    if (this.edgeDist(u, e) <= range) { u.path = null; return true; }
    let key, x0, y0, x1, y1;
    if (e.cls === 'u') {
      const tx = Math.floor(e.x), ty = Math.floor(e.y);
      key = ty * this.W + tx; x0 = x1 = tx; y0 = y1 = ty;
    } else { key = -e.id; x0 = e.tx - 1; y0 = e.ty - 1; x1 = e.tx + e.w; y1 = e.ty + e.h; }
    if (!u.path || (u.pkey !== key && u.repT <= 0)) {
      if (this.pathTo(u, x0, y0, x1, y1)) { u.pkey = key; u.repT = 0.7; }
      else if (!u.path) { this.stepToward(u, e.x, e.y, SIM_DT); return false; }
    }
    if (u.pi < u.path.length) { if (this.stepToward(u, u.path[u.pi], u.path[u.pi + 1], SIM_DT)) u.pi += 2; }
    else this.stepToward(u, e.x, e.y, SIM_DT);
    return false;
  }

  // ---------- Kampf ----------
  isEnemy(a, b) { return b.owner >= 0 && a.owner !== b.owner; }

  canAttack(u, t) {
    if (!t || !this.isEnemy(u, t) || t.cls === 'r') return false;
    if (UNITS[u.type].siege && t.cls !== 'b') return false;
    return true;
  }

  attackRange(u) {
    const d = UNITS[u.type];
    if (!d.range) return 0.3;
    return d.range + (this.players[u.owner].techs.arrows ? 1 : 0);
  }

  calcDamage(att, tgt, pierce) {
    const ad = att.cls === 'u' ? UNITS[att.type] : BUILDINGS[att.type];
    const p = this.players[att.owner];
    let a = ad.atk;
    if (att.cls === 'u') {
      if (!ad.proj && ad.cls !== 'worker' && ad.cls !== 'siege' && p.techs.blades) a += 2;
      if (ad.proj && p.techs.arrows) a += 1;
    } else if (p.techs.arrows) a += 1;
    const tc = tgt.cls === 'u' ? UNITS[tgt.type].cls : 'bld';
    if (ad.bonus && ad.bonus[tc]) a += ad.bonus[tc];
    let arm;
    if (tgt.cls === 'u') {
      const td = UNITS[tgt.type];
      arm = pierce ? td.pa : td.ma;
      if (td.cls !== 'worker' && this.players[tgt.owner].techs.armor) arm += 1;
    } else {
      const td = BUILDINGS[tgt.type];
      arm = pierce ? td.pa ?? 6 : td.ma ?? 2;
    }
    return Math.max(1, a - arm);
  }

  strike(u, t) {
    const d = UNITS[u.type];
    if (d.proj) this.spawnProjectile(u, t);
    else { this.applyDamage(t, this.calcDamage(u, t, false), u.owner, u.id); this.emit({ type: 'hit', x: t.x, y: t.y, owner: u.owner, melee: true }); }
  }

  spawnProjectile(src, tgt) {
    const sy = src.cls === 'b' ? src.y - 1.2 : src.y - 0.2;
    this.projectiles.push({
      x: src.x, y: sy, sx: src.x, sy, tid: tgt.id, dmg: this.calcDamage(src, tgt, true), owner: src.owner, aid: src.id,
      spd: 10, d0: Math.max(0.5, Math.hypot(tgt.x - src.x, tgt.y - sy)),
    });
    if (src.owner === 0 || this.vis[Math.floor(src.y) * this.W + Math.floor(src.x)] === 2) this.emit({ type: 'shoot', x: src.x, y: src.y });
  }

  applyDamage(t, dmg, attOwner, attId) {
    if (t.hp <= 0 || t.dead) return;
    t.hp -= dmg;
    t.hitT = this.time;
    if (t.owner === 0 && attOwner !== 0 && this.time - this.attackAlertT > 12) {
      this.attackAlertT = this.time;
      this.emit({ type: 'attacked', x: t.x, y: t.y });
    }
    if (t.cls === 'u' && t.hp > 0 && attId) {
      const td = UNITS[t.type];
      const a = this.ents.get(attId);
      if (a && td.cls !== 'worker' && (!t.order || t.order.t === 'amove') && this.canAttack(t, a)) {
        t.order = { t: 'attack', id: attId, auto: true, ox: t.x, oy: t.y, back: t.order };
      }
    }
    if (t.cls === 'b' && t.owner > 0) this.players[t.owner].ai.threat = { x: t.x, y: t.y, t: this.time, id: attId };
    if (t.cls === 'u' && t.owner > 0 && attId) this.players[t.owner].ai.threat = { x: t.x, y: t.y, t: this.time, id: attId };
    if (t.hp <= 0) this.kill(t, attOwner);
  }

  kill(e, by) {
    if (e.dead) return;
    e.hp = 0;
    this.removeEnt(e);
    const p = this.players[e.owner];
    if (e.cls === 'u') {
      p.stats.lost++;
      if (by >= 0 && this.players[by]) this.players[by].stats.killed++;
      this.decals.push({ k: 'corpse', x: e.x, y: e.y, t: 0, owner: e.owner, type: e.type });
      this.emit({ type: 'death', x: e.x, y: e.y, owner: e.owner });
    } else if (e.cls === 'b') {
      for (const q of e.queue) if (q.k === 't') delete p.researching[q.key];
      this.decals.push({ k: 'rubble', x: e.tx, y: e.ty, w: e.w, h: e.h, t: 0 });
      this.emit({ type: 'destroyed', x: e.x, y: e.y, owner: e.owner, btype: e.type });
      this.recalcPop();
    }
  }

  // Raster für Nachbarschaftssuche
  near(x, y, r, fn) {
    const c0 = Math.max(0, Math.floor((x - r) / CELL)), c1 = Math.min(this.gw - 1, Math.floor((x + r) / CELL));
    const r0 = Math.max(0, Math.floor((y - r) / CELL)), r1 = Math.min(this.gh - 1, Math.floor((y + r) / CELL));
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const cell = this.grid[cy * this.gw + cx];
      for (let i = 0; i < cell.length; i++) fn(cell[i]);
    }
  }

  findEnemyUnit(owner, x, y, r) {
    let best = null, bd = r * r;
    this.near(x, y, r, v => {
      if (v.owner === owner || v.dead) return;
      const d = (v.x - x) ** 2 + (v.y - y) ** 2;
      if (d < bd) { bd = d; best = v; }
    });
    return best;
  }

  findTarget(u, r) {
    const d = UNITS[u.type];
    if (!d.siege) {
      let best = null, bd = 1e9;
      this.near(u.x, u.y, r, v => {
        if (v.owner === u.owner || v.dead) return;
        let dd = Math.hypot(v.x - u.x, v.y - u.y);
        if (dd > r) return;
        if (v.type === 'worker') dd += 1.5;
        if (dd < bd) { bd = dd; best = v; }
      });
      if (best) return best;
    }
    let best = null, bd = r + 1;
    for (const b of this.blds) {
      if (b.owner === u.owner || b.dead) continue;
      if (Math.abs(b.x - u.x) > r + 4 || Math.abs(b.y - u.y) > r + 4) continue;
      const dd = this.edgeDist(u, b) + (b.type === 'farm' || b.type === 'house' ? 1 : 0);
      if (dd < bd) { bd = dd; best = b; }
    }
    return best;
  }

  // ---------- Ressourcen ----------
  treeReachable(r) {
    for (let k = 0; k < 4; k++) if (this.passable(r.tx + DX[k], r.ty + DY[k])) return true;
    return false;
  }

  farmFree(f, uid) {
    if (!f.farmer || f.farmer === uid) return true;
    const w = this.ents.get(f.farmer);
    return !(w && w.order && w.order.t === 'gather' && w.order.id === f.id);
  }

  findNearestRes(kind, x, y, maxR, owner, uid) {
    const cx = Math.floor(x), cy = Math.floor(y);
    let best = null, bd = 1e9;
    for (let r = 0; r <= maxR; r++) {
      for (let ty = cy - r; ty <= cy + r; ty++) {
        if (ty < 0 || ty >= this.H) continue;
        const full = ty === cy - r || ty === cy + r;
        for (let tx = cx - r; tx <= cx + r; tx += full ? 1 : 2 * r || 1) {
          if (tx < 0 || tx >= this.W) continue;
          const id = this.occ[ty * this.W + tx];
          if (!id) continue;
          const e = this.ents.get(id);
          if (!e) continue;
          let ok = false;
          if (e.cls === 'r') ok = RES_KIND[e.kind] === kind && e.amount > 0 && (e.kind !== 'tree' || this.treeReachable(e));
          else if (kind === 'food' && e.cls === 'b' && e.type === 'farm' && e.owner === owner && e.done) ok = this.farmFree(e, uid);
          if (!ok) continue;
          const d = Math.hypot(e.x - x, e.y - y);
          if (d < bd) { bd = d; best = e; }
        }
      }
      if (best && r >= Math.ceil(bd)) break;
    }
    return best;
  }

  nearestDrop(owner, kind, x, y) {
    let best = null, bd = 1e9;
    for (const b of this.blds) {
      if (b.owner !== owner || !b.done || b.dead) continue;
      const dr = BUILDINGS[b.type].drop;
      if (!dr || !dr.includes(kind)) continue;
      const dx = Math.max(b.tx - x, 0, x - (b.tx + b.w)), dy = Math.max(b.ty - y, 0, y - (b.ty + b.h));
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ---------- Simulationsschritt ----------
  tick() {
    if (this.over) return;
    const dt = SIM_DT;
    this.time += dt;
    this.pathBudget = 16;
    for (const c of this.grid) c.length = 0;
    const units = this.units, blds = this.blds;
    units.length = 0; blds.length = 0;
    for (const p of this.players) p.pop = 0;
    for (const e of this.ents.values()) {
      if (e.cls === 'u') {
        units.push(e);
        this.players[e.owner].pop++;
        const gx = clamp(Math.floor(e.x / CELL), 0, this.gw - 1), gy = clamp(Math.floor(e.y / CELL), 0, this.gh - 1);
        this.grid[gy * this.gw + gx].push(e);
      } else if (e.cls === 'b') { blds.push(e); e.nb = e.nbN; e.nbN = 0; }
    }
    for (const u of units) { u.px = u.x; u.py = u.y; }
    for (const u of units) if (!u.dead) this.updateUnit(u, dt);
    this.separate(units);
    for (const b of blds) if (!b.dead) this.updateBuilding(b, dt);
    this.updateProjectiles(dt);
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i]; d.t += dt;
      if (d.t > (d.k === 'rubble' ? 40 : 20)) this.decals.splice(i, 1);
    }
    this.fogT -= dt;
    if (this.fogT <= 0) { this.fogT = 0.2; this.updateFog(); }
    this.checkT -= dt;
    if (this.checkT <= 0) { this.checkT = 1; this.checkVictory(); }
  }

  updateUnit(u, dt) {
    const d = UNITS[u.type];
    if (u.cool > 0) u.cool -= dt;
    if (u.repT > 0) u.repT -= dt;
    if (u.atkT > 0) u.atkT -= dt;
    u.moving = false; u.work = 0;
    const o = u.order;
    if (!o) this.idle(u, d, dt);
    else if (o.t === 'move') { if (this.goTo(u, o.x, o.y, 0.12)) u.order = null; }
    else if (o.t === 'amove') {
      u.scanT -= dt;
      if (u.scanT <= 0) {
        u.scanT = 0.4;
        const t = this.findTarget(u, d.sight);
        if (t) { u.order = { t: 'attack', id: t.id, back: o }; u.path = null; return; }
      }
      if (this.goTo(u, o.x, o.y, 0.5)) u.order = null;
    } else if (o.t === 'attack') this.doAttack(u, o, d, dt);
    else if (o.t === 'gather') this.doGather(u, o, dt);
    else if (o.t === 'build') this.doBuild(u, o, dt);
    // Steckenbleiben erkennen
    if (u.moving) {
      u.stT += dt;
      if (u.stT >= 1) {
        const m = Math.hypot(u.x - u.stX, u.y - u.stY);
        if (m < 0.25) {
          u.stN++; u.path = null;
          if (u.stN >= 4) {
            u.stN = 0;
            if (u.order && u.order.t !== 'attack') { u.order = u.order.back || null; }
            else if (u.order) u.order = u.order.back || null;
          }
        } else u.stN = 0;
        u.stT = 0; u.stX = u.x; u.stY = u.y;
      }
    } else { u.stT = 0; u.stX = u.x; u.stY = u.y; }
  }

  idle(u, d, dt) {
    if (d.cls === 'worker') return;
    u.scanT -= dt;
    if (u.scanT > 0) return;
    u.scanT = 0.5 + Math.random() * 0.2;
    const t = this.findTarget(u, d.sight);
    if (t) u.order = { t: 'attack', id: t.id, auto: true, ox: u.x, oy: u.y };
  }

  doAttack(u, o, d, dt) {
    const t = this.ents.get(o.id);
    if (!t || t.dead || !this.canAttack(u, t)) { u.order = o.back || null; u.path = null; return; }
    if (o.auto && Math.hypot(u.x - o.ox, u.y - o.oy) > 12 && this.edgeDist(u, t) > this.attackRange(u)) {
      u.order = { t: 'move', x: o.ox, y: o.oy }; u.path = null; return;
    }
    // Beim Angriff auf Gebäude feindliche Einheiten bevorzugen
    if (t.cls === 'b' && (o.back || o.auto) && !d.siege) {
      u.scanT -= dt;
      if (u.scanT <= 0) {
        u.scanT = 1;
        const nt = this.findEnemyUnit(u.owner, u.x, u.y, d.sight);
        if (nt) { o.id = nt.id; u.path = null; return; }
      }
    }
    const r = this.attackRange(u);
    if (this.edgeDist(u, t) <= r) {
      u.path = null;
      u.dir = Math.atan2(t.y - u.y, t.x - u.x);
      if (u.cool <= 0) { this.strike(u, t); u.cool = d.rof; u.atkT = 0.35; }
    } else this.approach(u, t, r);
  }

  doGather(u, o, dt) {
    const p = this.players[u.owner];
    const cap = this.carryCap(p);
    let r = o.id ? this.ents.get(o.id) : null;
    const isValid = e => e && !e.dead && (e.cls === 'r' ? e.amount > 0
      : e.type === 'farm' && e.done && e.owner === u.owner && this.farmFree(e, u.id));
    let valid = isValid(r);
    if (!valid && !o.dropping) {
      const nr = this.findNearestRes(o.kind, u.x, u.y, 9, u.owner, u.id);
      if (nr) { o.id = nr.id; r = nr; valid = true; u.path = null; }
    }
    if (o.dropping || u.carryN >= cap - 1e-6 || (!valid && u.carryN > 0)) {
      o.dropping = true;
      const drop = this.nearestDrop(u.owner, u.carry || o.kind, u.x, u.y);
      if (!drop) { if (!valid || u.carryN >= cap - 1e-6) { o.dropping = false; if (!valid) u.order = null; } return; }
      if (this.approach(u, drop, 0.3)) {
        const n = Math.floor(u.carryN + 1e-6);
        if (u.carry) { p.res[u.carry] += n; p.stats.gathered += n; }
        u.carryN = 0; o.dropping = false; u.path = null;
        if (!valid) u.order = null;
      }
      return;
    }
    if (!valid) { u.order = null; return; }
    const isFarm = r.cls === 'b';
    let there;
    if (isFarm) {
      there = Math.abs(u.x - r.x) < r.w / 2 - 0.2 && Math.abs(u.y - r.y) < r.h / 2 - 0.2;
      if (!there) { this.goTo(u, r.x, r.y, 0.3); }
    } else there = this.approach(u, r, 0.3);
    if (!there) return;
    u.path = null;
    const kind = isFarm ? 'food' : RES_KIND[r.kind];
    if (u.carry !== kind) { u.carry = kind; u.carryN = 0; }
    const rate = this.gatherRate(u.owner, isFarm ? 'farm' : r.kind);
    let amt = Math.min(rate * dt, cap - u.carryN, isFarm ? r.food : r.amount);
    u.carryN += amt;
    u.work = 1;
    if (isFarm) {
      r.farmer = u.id;
      r.food -= amt;
      const ph = this.time * 0.35 + u.id;
      u.dir = Math.cos(ph) > 0 ? 0 : Math.PI;
      this.tryMove(u, u.x + Math.cos(ph) * 0.5 * dt, u.y + Math.sin(ph * 0.5) * 0.2 * dt);
      if (r.food <= 1e-6) this.farmDepleted(r);
    } else {
      u.dir = Math.atan2(r.y - u.y, r.x - u.x);
      r.amount -= amt;
      if (r.amount <= 1e-6) this.removeEnt(r);
    }
  }

  farmDepleted(f) {
    const p = this.players[f.owner];
    if (this.canAfford(p, BUILDINGS.farm.cost)) { this.pay(p, BUILDINGS.farm.cost); f.food = BUILDINGS.farm.food; }
    else { this.removeEnt(f); if (f.owner === 0) this.emit({ type: 'info', text: 'Ein Feld ist erschöpft' }); }
  }

  doBuild(u, o, dt) {
    const b = this.ents.get(o.id);
    if (!b || b.dead || b.owner !== u.owner) { u.order = null; return; }
    if (b.done && b.hp >= b.maxHp) { this.afterBuild(u, b); return; }
    if (!this.approach(u, b, 0.3)) return;
    u.path = null; u.work = 1;
    u.dir = Math.atan2(b.y - u.y, b.x - u.x);
    const d = BUILDINGS[b.type];
    b.nbN++;
    const n = Math.max(1, b.nb);
    if (!b.done) {
      const inc = (dt / d.time) * (3 / (n + 2));
      b.prog = Math.min(1, b.prog + inc);
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * inc);
      if (b.prog >= 1) this.completeBuilding(b);
    } else {
      // Reparatur: kostenlos, aber langsam
      b.hp = Math.min(b.maxHp, b.hp + (b.maxHp / d.time) * dt * 0.5);
    }
  }

  completeBuilding(b) {
    b.done = true; b.prog = 1;
    const d = BUILDINGS[b.type];
    if (d.food) b.food = d.food;
    const p = this.players[b.owner];
    p.stats.built++;
    this.recalcPop();
    this.emit({ type: 'built', owner: b.owner, x: b.x, y: b.y, btype: b.type });
    if (b.type === 'monument') this.emit({ type: 'monument', owner: b.owner });
  }

  afterBuild(u, b) {
    const d = BUILDINGS[b.type];
    if (b.type === 'farm') {
      if (this.farmFree(b, u.id)) { u.order = { t: 'gather', id: b.id, kind: 'food' }; return; }
    }
    if (d.drop && b.type !== 'keep') {
      let best = null;
      for (const k of d.drop) {
        const r = this.findNearestRes(k, b.x, b.y, 8, u.owner, u.id);
        if (r && (!best || Math.hypot(r.x - b.x, r.y - b.y) < Math.hypot(best.x - b.x, best.y - b.y))) best = r;
      }
      if (best) { u.order = { t: 'gather', id: best.id, kind: best.cls === 'r' ? RES_KIND[best.kind] : 'food' }; return; }
    }
    let nb = null, nd = 12;
    for (const o of this.blds) {
      if (o.owner !== u.owner || o.done || o.dead) continue;
      const dd = Math.hypot(o.x - u.x, o.y - u.y);
      if (dd < nd) { nd = dd; nb = o; }
    }
    u.order = nb ? { t: 'build', id: nb.id } : null;
  }

  separate(units) {
    for (const u of units) {
      if (u.dead) continue;
      const ru = UNITS[u.type].r;
      this.near(u.x, u.y, 1.2, v => {
        if (v.id <= u.id || v.dead) return;
        const rv = UNITS[v.type].r, min = (ru + rv) * 0.9;
        let dx = v.x - u.x, dy = v.y - u.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) return;
        let d = Math.sqrt(d2);
        if (d < 1e-4) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = Math.hypot(dx, dy) || 1; }
        const push = (min - d) * 0.5;
        const wu = u.work ? 0.15 : u.moving ? 0.6 : 1, wv = v.work ? 0.15 : v.moving ? 0.6 : 1;
        const tot = wu + wv;
        this.tryMove(u, u.x - (dx / d) * push * (wu / tot) * 2 * 0.5, u.y - (dy / d) * push * (wu / tot) * 2 * 0.5);
        this.tryMove(v, v.x + (dx / d) * push * (wv / tot) * 2 * 0.5, v.y + (dy / d) * push * (wv / tot) * 2 * 0.5);
      });
    }
  }

  updateBuilding(b, dt) {
    if (!b.done) return;
    const d = BUILDINGS[b.type], p = this.players[b.owner];
    if (b.queue.length) {
      const q = b.queue[0];
      if (q.k === 'u') {
        if (p.pop >= p.popCap) {
          if (!q.blocked && b.owner === 0) this.emit({ type: 'info', text: p.popCap >= MAX_POP ? 'Bevölkerungsmaximum erreicht' : 'Mehr Häuser benötigt' });
          q.blocked = true;
        } else {
          q.blocked = false;
          q.t += dt * (p.isAI ? AI_MULT[this.difficulty] || 1 : 1);
          if (q.t >= UNITS[q.key].time) { b.queue.shift(); this.spawnFrom(b, q.key); p.pop++; }
        }
      } else {
        q.t += dt;
        if (q.t >= TECHS[q.key].time) { b.queue.shift(); this.applyTech(p, q.key); }
      }
    }
    if (d.atk) {
      b.cool -= dt;
      if (b.cool <= 0) {
        const r = d.range + (p.techs.arrows ? 1 : 0) + Math.max(b.w, b.h) / 2;
        const t = this.findEnemyUnit(b.owner, b.x, b.y, r);
        if (t) { this.spawnProjectile(b, t); b.cool = d.rof; } else b.cool = 0.4;
      }
    }
    if (b.type === 'monument') {
      b.mt += dt;
      if (b.mt >= MONUMENT_TIME && !this.over) { this.over = true; this.winner = b.owner; this.emit({ type: 'gameover', winner: b.owner, reason: 'monument' }); }
    }
  }

  spawnFrom(b, type) {
    const spot = this.freeSpotNear(b, b.rally);
    const u = this.addUnit(type, b.owner, spot.x, spot.y);
    this.players[b.owner].stats.trained++;
    if (b.rally) {
      const t = b.rally.id ? this.ents.get(b.rally.id) : null;
      if (t && type === 'worker' && (t.cls === 'r' || (t.cls === 'b' && t.type === 'farm' && t.owner === b.owner))) this.issueGather([u.id], t.id);
      else if (t && type === 'worker' && t.cls === 'b' && t.owner === b.owner && !t.done) this.issueBuild([u.id], t.id);
      else u.order = { t: 'move', x: b.rally.x, y: b.rally.y };
    }
    this.emit({ type: 'trained', owner: b.owner, utype: type, x: u.x, y: u.y });
  }

  applyTech(p, key) {
    p.techs[key] = true;
    delete p.researching[key];
    const t = TECHS[key];
    if (t.ageUp) { p.age = t.ageUp; this.emit({ type: 'age', owner: p.id, age: p.age }); }
    else this.emit({ type: 'tech', owner: p.id, key });
    if (key === 'masonry') {
      for (const b of this.ents.values()) if (b.cls === 'b' && b.owner === p.id) {
        const nm = this.bMaxHp(p.id, b.type); b.hp = (b.hp * nm) / b.maxHp; b.maxHp = nm;
      }
    }
  }

  updateProjectiles(dt) {
    const ps = this.projectiles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const pr = ps[i];
      const t = this.ents.get(pr.tid);
      if (!t) { ps.splice(i, 1); continue; }
      const dx = t.x - pr.x, dy = t.y - 0.2 - pr.y, d = Math.hypot(dx, dy), step = pr.spd * dt;
      if (d <= step) { this.applyDamage(t, pr.dmg, pr.owner, this.ents.has(pr.aid) ? pr.aid : 0); ps.splice(i, 1); continue; }
      pr.x += (dx / d) * step; pr.y += (dy / d) * step;
      pr.dir = Math.atan2(dy, dx);
    }
  }

  updateFog() {
    const vis = this.vis, W = this.W;
    if (this.revealAll) { vis.fill(2); }
    else {
      for (let i = 0; i < vis.length; i++) if (vis[i] === 2) vis[i] = 1;
      for (const e of this.ents.values()) {
        if (e.owner !== 0) continue;
        let r;
        if (e.cls === 'u') r = UNITS[e.type].sight;
        else if (e.cls === 'b') r = e.done ? BUILDINGS[e.type].sight || 4 : 2;
        else continue;
        r += e.cls === 'b' ? Math.max(e.w, e.h) / 2 : 0;
        const offs = circleOffsets(Math.round(r));
        const cx = Math.floor(e.x), cy = Math.floor(e.y);
        for (let k = 0; k < offs.length; k += 2) {
          const x = cx + offs[k], y = cy + offs[k + 1];
          if (x >= 0 && y >= 0 && x < W && y < this.H) vis[y * W + x] = 2;
        }
      }
    }
    for (const e of this.ents.values()) {
      if (e.cls === 'b' && e.owner !== 0 && !e.seen) {
        if (vis[e.ty * W + e.tx] === 2 || vis[(e.ty + e.h - 1) * W + e.tx + e.w - 1] === 2 || vis[Math.floor(e.y) * W + Math.floor(e.x)] === 2) e.seen = true;
      }
    }
  }

  isVisible(e) {
    if (e.owner === 0) return true;
    const i = Math.floor(e.y) * this.W + Math.floor(e.x);
    if (e.cls === 'u') return this.vis[i] === 2;
    if (e.cls === 'b') return e.seen;
    return this.vis[e.ty * this.W + e.tx] > 0;
  }

  checkVictory() {
    if (this.over) return;
    const alive = this.players.map(() => false);
    for (const e of this.ents.values()) {
      if (e.cls === 'u' || (e.cls === 'b' && e.type !== 'farm')) alive[e.owner] = true;
    }
    this.players.forEach((p, i) => {
      if (!p.defeated && !alive[i]) { p.defeated = true; this.emit({ type: 'defeated', owner: i }); }
    });
    if (this.players[0].defeated) { this.over = true; this.winner = -1; this.emit({ type: 'gameover', winner: -1 }); }
    else if (this.players.slice(1).every(p => p.defeated)) { this.over = true; this.winner = 0; this.emit({ type: 'gameover', winner: 0 }); }
  }
}
