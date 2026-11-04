// Claycrown: Computergegner
import { UNITS, BUILDINGS, TECHS, MAX_POP } from './data.js';
import { RES_KIND } from './world.js';

const DIFF = {
  easy: { workers: 16, firstAttack: 900, wave: 4, waveGrow: 1, armyRatio: 0.5, think: 1.6, towers: 0, monument: false, ageWorkers: [14, 18, 22], milStart: 16, gangUp: false },
  normal: { workers: 28, firstAttack: 660, wave: 6, waveGrow: 1, armyRatio: 0.8, think: 1.0, towers: 1, monument: false, ageWorkers: [13, 20, 24], milStart: 14, gangUp: false },
  hard: { workers: 40, firstAttack: 360, wave: 9, waveGrow: 2, armyRatio: 1.5, think: 0.6, towers: 2, monument: true, ageWorkers: [12, 20, 26], milStart: 10, gangUp: true },
};

const RATIOS = [
  { food: 0.52, wood: 0.45, gold: 0.0, clay: 0.03 },
  { food: 0.4, wood: 0.4, gold: 0.16, clay: 0.04 },
  { food: 0.36, wood: 0.33, gold: 0.27, clay: 0.04 },
  { food: 0.34, wood: 0.29, gold: 0.30, clay: 0.07 },
];

export class AI {
  constructor(g, pid) {
    this.g = g; this.pid = pid; this.p = g.players[pid];
    if (!this.p.ai) this.p.ai = {};
    this.s = this.p.ai;
    Object.assign(this.s, { t: Math.random(), waves: 0, attacking: false, waveStart: 0, rebalT: 0, ...this.s });
    this.cfg = DIFF[g.difficulty] || DIFF.normal;
  }

  update(dt) {
    this.s.t -= dt;
    if (this.s.t > 0) return;
    this.s.t = this.cfg.think;
    if (!this.p.defeated) this.think();
  }

  think() {
    const g = this.g, p = this.p, c = this.cfg, pid = this.pid;
    const workers = [], army = [], blds = [], by = {};
    for (const e of g.ents.values()) {
      if (e.owner !== pid) continue;
      if (e.cls === 'u') (e.type === 'worker' ? workers : army).push(e);
      else if (e.cls === 'b') { blds.push(e); (by[e.type] ||= []).push(e); }
    }
    this.by = by;
    if (this.s.scoutId && !this.s.scoutDone) {
      const i = army.findIndex(u => u.id === this.s.scoutId);
      if (i >= 0) army.splice(i, 1);
    }
    this.armySize = army.length; this.workers = workers.length;
    const keep = (by.keep || []).find(b => b.done) || (by.keep || [])[0];
    const anchor = keep || blds[0] || workers[0] || army[0];
    if (!anchor) return;
    this.home = { x: anchor.x, y: anchor.y };
    this.keep = keep;
    const count = t => (by[t] || []).length;
    const W = workers.length;
    const nextKey = p.age < 3 ? 'age' + (p.age + 1) : null;
    const aging = nextKey && p.researching[nextKey];
    // Rücklage für das nächste Zeitalter
    this.reserve = {};
    if (nextKey && !aging && W >= c.ageWorkers[p.age] - 3) this.reserve = { ...TECHS[nextKey].cost };

    this.scout(army);
    this.defend(army);

    // Arbeiter ausbilden
    const wq = blds.reduce((n, b) => n + b.queue.filter(q => q.key === 'worker').length, 0);
    if (keep && keep.done && W + wq < c.workers && keep.queue.length < 2 && !aging) {
      if (g.canAfford(p, UNITS.worker.cost)) g.train(keep.id, 'worker');
    }

    // Häuser
    const queuedUnits = blds.reduce((n, b) => n + b.queue.filter(q => q.k === 'u').length, 0);
    const housesPending = (by.house || []).filter(b => !b.done).length;
    const prod = count('barracks') + count('range') + count('stable') + count('workshop');
    if (p.popCap < MAX_POP && p.pop + queuedUnits + 1 + prod >= p.popCap && housesPending < (prod > 1 ? 2 : 1)) {
      this.build('house', workers, false);
    }

    // Bauliste
    const want = [];
    if (W >= 4 && count('lumber') < 1) want.push('lumber');
    if (W >= 7 && count('mill') < 1) want.push('mill');
    if (W >= 10 && count('mine') < 1) want.push('mine');
    if (W >= c.milStart && count('barracks') < 1) want.push('barracks');
    if (p.age >= 1) {
      if (count('forge') < 1) want.push('forge');
      if (count('range') < 1) want.push('range');
      if (count('stable') < 1 && W >= 16) want.push('stable');
      if (W >= 18 && count('lumber') < 2) want.push('lumber');
      if (W >= 16 && count('mine') < 2) want.push('mine');
      if (count('tower') < c.towers) want.push('tower');
      if (W >= 20 && count('temple') < 1) want.push('temple');
    }
    if (p.age >= 2) {
      if (count('workshop') < 1) want.push('workshop');
      if (count('barracks') < 2 && W >= 24) want.push('barracks');
      if (count('range') < 2 && this.cfg === DIFF.hard) want.push('range');
    }
    if (p.age >= 3 && c.monument && count('monument') < 1) want.push('monument');
    const pending = blds.filter(b => !b.done && b.type !== 'farm' && b.type !== 'house').length;
    if (pending < 2) for (const t of want) { this.build(t, workers, true); break; }

    // Zeitalter
    if (nextKey && keep && keep.done && !aging && W >= c.ageWorkers[p.age] && keep.queue.length === 0) {
      if (g.canAfford(p, TECHS[nextKey].cost)) g.research(keep.id, nextKey);
    }

    this.manageFarms(workers);
    this.assignWorkers(workers);
    if (W >= c.milStart - 2 || this.s.threatNow) this.trainArmy(blds);
    if (W >= 12) this.researchTechs(blds);
    this.manageAttack(army);
    if (!keep && p.age >= 1 && W > 0) this.build('keep', workers, true);
  }

  affordR(cost) {
    const p = this.p;
    for (const k in cost) if (p.res[k] - (this.reserve[k] || 0) < cost[k]) return false;
    return true;
  }

  // ---------- Bauen ----------
  build(type, workers, useReserve) {
    const g = this.g, d = BUILDINGS[type];
    if (g.buildError(this.pid, type)) return false;
    if (useReserve && type !== 'house' && !this.affordR(d.cost)) return false;
    const spot = this.findSpot(type);
    if (!spot) return false;
    const builder = this.pickBuilder(workers, spot);
    if (!builder) return false;
    const ids = [builder.id];
    if (type === 'keep' || type === 'monument' || type === 'barracks') {
      const extra = this.pickBuilder(workers.filter(w => w !== builder), spot);
      if (extra) ids.push(extra.id);
    }
    const r = g.placeBuilding(this.pid, type, spot.x, spot.y, ids);
    return typeof r === 'object';
  }

  pickBuilder(workers, spot) {
    let best = null, bd = 1e9;
    for (const w of workers) {
      const o = w.order;
      if (o && o.t === 'build') continue;
      let d = Math.hypot(w.x - spot.x, w.y - spot.y);
      if (o && o.t === 'gather' && (o.kind === 'gold' || o.kind === 'clay')) d += 15;
      if (o && o.t === 'gather') d += 4;
      if (d < bd) { bd = d; best = w; }
    }
    return best;
  }

  findSpot(type) {
    const g = this.g, h = this.home, d = BUILDINGS[type];
    if (type === 'lumber') {
      const t = this.findForest();
      return t ? this.spotNear(type, t.x, t.y, 1, 5, 0, h) : null;
    }
    if (type === 'mine') {
      const hasGoldCamp = (this.by.mine || []).some(m => g.findNearestRes('gold', m.x, m.y, 5, this.pid));
      const kind = hasGoldCamp ? 'clay' : 'gold';
      const r = g.findNearestRes(kind, h.x, h.y, 26, this.pid) || g.findNearestRes(kind === 'gold' ? 'clay' : 'gold', h.x, h.y, 26, this.pid);
      return r ? this.spotNear(type, r.x, r.y, 1, 5, 0, h) : null;
    }
    if (type === 'mill') {
      const r = g.findNearestRes('food', h.x, h.y, 14, this.pid);
      if (r && r.cls === 'r') return this.spotNear(type, r.x, r.y, 1, 5, 0, h);
      return this.spotNear(type, h.x, h.y, 4, 12, 1);
    }
    if (type === 'farm') {
      const base = (this.by.mill || []).find(m => m.done && Math.hypot(m.x - h.x, m.y - h.y) < 12) || this.keep || (this.by.mill || [])[0];
      if (!base) return null;
      return this.spotNear(type, base.x, base.y, 2, 9, 0) || this.spotNear(type, h.x, h.y, 3, 12, 0);
    }
    if (type === 'tower') {
      const e = this.enemyHome();
      const a = e ? Math.atan2(e.y - h.y, e.x - h.x) + (Math.random() - 0.5) : Math.random() * 6.28;
      return this.spotNear(type, h.x + Math.cos(a) * 7, h.y + Math.sin(a) * 7, 0, 5, 1);
    }
    return this.spotNear(type, h.x, h.y, Math.max(d.w, d.h) + 3, 16, 1);
  }

  spotNear(type, cx, cy, rmin, rmax, margin, prefer) {
    const g = this.g, d = BUILDINGS[type];
    let best = null, bd = 1e9;
    for (let r = rmin; r <= rmax; r++) {
      for (let y = Math.floor(cy) - r; y <= Math.floor(cy) + r; y++) for (let x = Math.floor(cx) - r; x <= Math.floor(cx) + r; x++) {
        if (Math.abs(x - Math.floor(cx)) !== r && Math.abs(y - Math.floor(cy)) !== r) continue;
        const tx = x - Math.floor(d.w / 2), ty = y - Math.floor(d.h / 2);
        if (!g.canPlace(type, tx, ty, this.pid)) continue;
        if (!this.marginFree(tx, ty, d.w, d.h, margin)) continue;
        let score = Math.hypot(tx + d.w / 2 - cx, ty + d.h / 2 - cy) + Math.random() * 0.8;
        if (prefer) score += Math.hypot(tx - prefer.x, ty - prefer.y) * 0.15;
        if (score < bd) { bd = score; best = { x: tx, y: ty }; }
      }
      if (best) return best;
    }
    return null;
  }

  marginFree(tx, ty, w, h, m) {
    const g = this.g;
    if (tx < 2 || ty < 2 || tx + w > g.W - 2 || ty + h > g.H - 2) return false;
    let free = 0;
    for (let y = ty - 1; y <= ty + h; y++) for (let x = tx - 1; x <= tx + w; x++) {
      if (x >= tx && x < tx + w && y >= ty && y < ty + h) continue;
      if (g.passable(x, y)) free++;
      else if (m > 0) {
        const e = g.entAt(x, y);
        if (!e || e.cls !== 'r') return false;
        if (e.kind !== 'tree') return false;
      }
    }
    return free >= 3;
  }

  findForest() {
    const g = this.g, h = this.home;
    const camps = this.by.lumber || [];
    let best = null, bd = 1e9;
    for (let r = 4; r <= 26; r++) {
      for (let y = Math.floor(h.y) - r; y <= Math.floor(h.y) + r; y++) for (let x = Math.floor(h.x) - r; x <= Math.floor(h.x) + r; x++) {
        if (Math.abs(x - Math.floor(h.x)) !== r && Math.abs(y - Math.floor(h.y)) !== r) continue;
        if (!g.inb(x, y) || !g.explored(this.pid, x, y)) continue;
        const e = g.entAt(x, y);
        if (!e || e.cls !== 'r' || e.kind !== 'tree' || !g.treeReachable(e)) continue;
        if (camps.some(c => Math.hypot(c.x - e.x, c.y - e.y) < 9)) continue;
        let n = 0;
        for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 3; xx <= x + 3; xx++) { const t = g.entAt(xx, yy); if (t && t.cls === 'r' && t.kind === 'tree') n++; }
        if (n < 8) continue;
        const d = Math.hypot(e.x - h.x, e.y - h.y) - n * 0.15;
        if (d < bd) { bd = d; best = e; }
      }
      if (best && r > bd + 2) break;
    }
    return best;
  }

  enemyHome() {
    let best = null, bd = 1e9;
    for (const s of this.guessSpawns()) {
      const d = Math.hypot(s.x - this.home.x, s.y - this.home.y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // Die Startplätze liegen symmetrisch um die Kartenmitte. Aus dem eigenen Startplatz
  // und der Spielerzahl lassen sich die anderen ableiten, ohne sie zu kennen.
  guessSpawns() {
    if (this._guess) return this._guess;
    const g = this.g, own = g.spawns[this.pid], n = g.players.length;
    const cx = g.W / 2, cy = g.H / 2, R = Math.hypot(own.x - cx, own.y - cy), a0 = Math.atan2(own.y - cy, own.x - cx);
    this._guess = [];
    for (let i = 1; i < n; i++) this._guess.push({ x: cx + Math.cos(a0 + (i * 2 * Math.PI) / n) * R, y: cy + Math.sin(a0 + (i * 2 * Math.PI) / n) * R });
    return this._guess;
  }

  // Ein Späher erkundet zu Beginn die Umgebung und die vermuteten Gegnerbasen
  scout(army) {
    const g = this.g, s = this.s;
    if (!g.fogOf(this.pid) || s.scoutDone) return;
    let u = s.scoutId ? g.ents.get(s.scoutId) : null;
    if (!u) {
      if (s.scoutId) { s.scoutId = 0; s.scoutRetry = g.time + 60; return; }
      if (g.time < (s.scoutRetry || 0)) return;
      u = army.find(a => a.type === 'rider') || army.find(a => a.type !== 'ram');
      if (!u) return;
      s.scoutId = u.id;
      u.passive = true;
      const i = army.indexOf(u); if (i >= 0) army.splice(i, 1);
    }
    u.passive = true;
    if (u.order && u.order.t !== 'move') u.order = null;
    if (u.order) return;
    const h = this.home, pts = [];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; pts.push({ x: h.x + Math.cos(a) * 13, y: h.y + Math.sin(a) * 13 }); }
    pts.push({ x: g.W / 2, y: g.H / 2 });
    for (const sp of this.guessSpawns()) pts.push(sp);
    pts.push({ x: h.x, y: h.y });
    s.wp = s.wp || 0;
    if (s.wp >= pts.length) { s.scoutDone = true; u.passive = false; return; }
    const p = pts[s.wp++];
    g.issueMove([u.id], Math.max(2, Math.min(g.W - 3, p.x)), Math.max(2, Math.min(g.H - 3, p.y)));
  }

  // ---------- Wirtschaft ----------
  manageFarms(workers) {
    const g = this.g, p = this.p, h = this.home;
    if (!g.hasDone(this.pid, 'mill')) return;
    const berries = g.findNearestRes('food', h.x, h.y, 16, -99);
    if (berries) return;
    const farms = (this.by.farm || []).length;
    const target = Math.min(16, Math.round(workers.length * RATIOS[Math.min(p.age, 3)].food) + 1);
    const pendingFarms = (this.by.farm || []).filter(f => !f.done).length;
    if (farms < target && pendingFarms < 2 && g.canAfford(p, BUILDINGS.farm.cost)) {
      // bevorzugt untätige Nahrungssammler
      const idleFood = workers.filter(w => !w.order || (w.order.t === 'gather' && w.order.kind === 'food' && !g.ents.get(w.order.id)));
      const spot = this.findSpot('farm');
      if (!spot) return;
      const b = idleFood[0] || this.pickBuilder(workers, spot);
      if (b) g.placeBuilding(this.pid, 'farm', spot.x, spot.y, [b.id]);
    }
  }

  assignWorkers(workers) {
    const g = this.g, p = this.p, W = workers.length;
    const ratios = RATIOS[Math.min(p.age, 3)];
    const counts = { food: 0, wood: 0, gold: 0, clay: 0 };
    const idle = [];
    for (const w of workers) {
      const o = w.order;
      if (!o) idle.push(w);
      else if (o.t === 'gather') counts[o.kind]++;
    }
    // Umverteilung
    this.s.rebalT -= this.cfg.think;
    if (this.s.rebalT <= 0) {
      this.s.rebalT = 12;
      let over = null, under = null, om = 0, um = 0;
      for (const k in counts) {
        const diff = counts[k] - ratios[k] * W;
        if (diff > om) { om = diff; over = k; }
        if (-diff > um) { um = -diff; under = k; }
      }
      if (over && under && om >= 2.5 && um >= 2.5) {
        let moved = 0;
        for (const w of workers) {
          if (moved >= 2) break;
          if (w.order && w.order.t === 'gather' && w.order.kind === over && w.carryN < 3) {
            const r = this.findRes(under, w);
            if (r) { g.issueGather([w.id], r.id); counts[over]--; counts[under]++; moved++; }
          }
        }
      }
    }
    for (const w of idle) {
      const kinds = Object.keys(counts).sort((a, b) => (counts[a] - ratios[a] * W) - (counts[b] - ratios[b] * W));
      for (const k of kinds) {
        if (ratios[k] === 0 && counts[k] > 0) continue;
        const r = this.findRes(k, w);
        if (r) { g.issueGather([w.id], r.id); counts[k]++; break; }
      }
    }
  }

  findRes(kind, w) {
    const g = this.g, h = this.home;
    let r = g.findNearestRes(kind, w.x, w.y, 10, this.pid, w.id);
    if (r && Math.hypot(r.x - h.x, r.y - h.y) < 30) return r;
    r = g.findNearestRes(kind, h.x, h.y, 28, this.pid, w.id);
    return r;
  }

  // ---------- Militär ----------
  trainArmy(blds) {
    const g = this.g, p = this.p;
    const rams = [...g.ents.values()].filter(e => e.cls === 'u' && e.owner === this.pid && UNITS[e.type].siege).length;
    for (const b of blds) {
      if (!b.done || b.queue.length >= 2) continue;
      const trains = (BUILDINGS[b.type].trains || []).filter(k => k !== 'worker' && UNITS[k].age <= p.age);
      if (!trains.length) continue;
      let pick;
      if (b.type === 'barracks') {
        if (p.age >= 3 && Math.random() < 0.35) pick = 'golem';
        else if (p.age >= 1 && Math.random() < 0.6) pick = 'sword';
        else pick = 'spear';
        if (!trains.includes(pick)) pick = trains[0];
      } else pick = trains[Math.floor(Math.random() * trains.length)];
      if (UNITS[pick].siege && rams >= 4) continue;
      if (pick === 'priest' && [...g.ents.values()].filter(e => e.cls === 'u' && e.owner === this.pid && e.type === 'priest').length >= 3) continue;
      if (!this.s.threatNow && this.armySize >= Math.max(6, this.workers * this.cfg.armyRatio)) return;
      if (p.pop >= p.popCap) return;
      const cost = UNITS[pick].cost;
      if (this.affordR(cost) || (this.s.threatNow && g.canAfford(p, cost))) g.train(b.id, pick);
    }
  }

  researchTechs(blds) {
    const g = this.g, p = this.p;
    for (const b of blds) {
      if (!b.done || b.queue.length) continue;
      for (const k of BUILDINGS[b.type].techs || []) {
        const t = TECHS[k];
        if (t.ageUp || p.techs[k] || p.researching[k] || p.age < t.age) continue;
        const cost = t.cost;
        const surplus = {};
        for (const r in cost) surplus[r] = cost[r] + 60;
        if (this.affordR(surplus)) { g.research(b.id, k); break; }
      }
    }
  }

  defend(army) {
    const g = this.g, h = this.home, s = this.s;
    const threats = [];
    for (const e of g.units) {
      if (e.dead || e.owner === this.pid) continue;
      if (Math.abs(e.x - h.x) > 20 || Math.abs(e.y - h.y) > 20) continue;
      if (!g.seesTile(this.pid, Math.floor(e.x), Math.floor(e.y))) continue;
      if (Math.hypot(e.x - h.x, e.y - h.y) < 18) threats.push(e);
    }
    s.threatNow = threats.length > 0;
    if (!threats.length) return;
    for (const u of army) {
      if (s.attacking && Math.hypot(u.x - h.x, u.y - h.y) > 25) continue;
      if (u.order && u.order.t === 'attack' && !u.order.auto) continue;
      let best = null, bd = 1e9;
      for (const t of threats) {
        if (!g.canAttack(u, t)) continue;
        const d = Math.hypot(t.x - u.x, t.y - u.y);
        if (d < bd) { bd = d; best = t; }
      }
      if (best) { u.order = { t: 'attack', id: best.id }; u.path = null; }
    }
  }

  manageAttack(army) {
    const g = this.g, s = this.s, c = this.cfg;
    const wave = Math.min(30, c.wave + s.waves * c.waveGrow);
    if (!s.attacking) {
      if (g.time >= c.firstAttack && army.length >= wave && !s.threatNow && g.time >= (s.nextAttack || 0)) {
        const tp = this.pickTargetPlayer();
        if (tp < 0) { s.nextAttack = g.time + 30; return; }
        s.attacking = true; s.waveStart = army.length; s.targetPlayer = tp;
        const t = this.attackTarget(null, tp);
        if (t) g.issueMove(army.map(u => u.id), t.x, t.y, true);
      }
      return;
    }
    if (army.length < Math.max(2, s.waveStart * 0.3)) {
      s.attacking = false; s.waves++; s.nextAttack = g.time + (c.gangUp ? 30 : 90);
      g.issueMove(army.map(u => u.id), this.home.x + 3, this.home.y + 3, false);
      return;
    }
    const idle = army.filter(u => !u.order);
    if (idle.length) {
      const t = this.attackTarget(idle[0], s.targetPlayer);
      if (t) g.issueMove(idle.map(u => u.id), t.x, t.y, true);
      else { s.attacking = false; s.waves++; s.nextAttack = g.time + 60; }
    }
  }

  // Zielspieler wählen: auf Leicht und Normal greifen KIs dich nie gleichzeitig an
  pickTargetPlayer() {
    const g = this.g, c = this.cfg;
    const humanBusy = g.players.some(p => p.id !== this.pid && p.isAI && !p.defeated && p.ai && p.ai.attacking && p.ai.targetPlayer === 0);
    const opts = [];
    for (const p of g.players) {
      if (p.id === this.pid || p.defeated) continue;
      if (p.id === 0 && humanBusy && !c.gangUp) continue;
      let d = 60;
      for (const b of g.blds) if (b.owner === p.id && !b.dead && g.knowsBuilding(this.pid, b)) d = Math.min(d, Math.hypot(b.x - this.home.x, b.y - this.home.y));
      opts.push({ id: p.id, w: 1 / (d + 10) });
    }
    if (!opts.length) return -1;
    let r = Math.random() * opts.reduce((n, o) => n + o.w, 0);
    for (const o of opts) { r -= o.w; if (r <= 0) return o.id; }
    return opts[opts.length - 1].id;
  }

  attackTarget(from, tp) {
    const g = this.g;
    const o = from || this.home;
    if (tp == null || !g.players[tp] || g.players[tp].defeated) tp = -1;
    // Ziel: nächstes Gebäude des Zielspielers, sonst irgendein Gegner
    let best = null, bd = 1e9;
    for (const b of g.blds) {
      if (b.dead || b.owner === this.pid || g.players[b.owner].defeated) continue;
      if (tp >= 0 && b.owner !== tp) continue;
      if (!g.knowsBuilding(this.pid, b)) continue;
      let d = Math.hypot(b.x - o.x, b.y - o.y);
      if (b.type === 'farm') d += 6;
      if (d < bd) { bd = d; best = b; }
    }
    if (best) return { x: best.x, y: best.y + best.h / 2 + 0.5 };
    if (tp >= 0) return this.attackTarget(from, -1);
    if (!g.fogOf(this.pid)) { for (const u of g.units) if (!u.dead && u.owner !== this.pid) return { x: u.x, y: u.y }; return null; }
    // Nichts bekannt: zur nächsten noch nicht gesehenen vermuteten Basis, sonst unerkundete Gebiete
    let gs = null, gd = 1e9;
    for (const sp of this.guessSpawns()) {
      if (g.seesTile(this.pid, Math.floor(sp.x), Math.floor(sp.y))) continue;
      const d = Math.hypot(sp.x - o.x, sp.y - o.y);
      if (d < gd) { gd = d; gs = sp; }
    }
    if (gs) return gs;
    for (let k = 0; k < 60; k++) {
      const x = 3 + Math.floor(Math.random() * (g.W - 6)), y = 3 + Math.floor(Math.random() * (g.H - 6));
      if (!g.explored(this.pid, x, y) && g.passable(x, y)) return { x: x + 0.5, y: y + 0.5 };
    }
    return null;
  }
}
