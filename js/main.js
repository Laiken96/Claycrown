// Claycrown 2.0: Start, Spielschleife und Steuerung
import { SIM_DT, UNITS, BUILDINGS, AGES, VERSION } from './data.js?v=201';
import { Game } from './world.js?v=201';
import { AI } from './ai.js?v=201';
import { Renderer, BUILD_TOP } from './render.js?v=201';
import { Input } from './input.js?v=201';
import { UI } from './ui.js?v=201';
import { Sound } from './audio.js?v=201';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'claycrown.save.v2';
const SET_KEY = 'claycrown.settings.v2';

class App {
  constructor() {
    this.r = new Renderer($('view'), $('minimap'));
    this.sound = new Sound();
    this.sel = new Set();
    this.mode = null;
    this.box = null;
    this.paused = true;
    this.speed = 1;
    this.acc = 0;
    this.hint = ''; this.hintT = 0;
    this.edgeScroll = false;
    this.opts = { ais: 1, difficulty: 'normal', size: 96 };
    this.gfx = { quality: this.defaultQuality(), dayNight: true };
    this.loadSettings();
    this.r.dayNight = this.gfx.dayNight;
    this.r.setQuality(this.gfx.quality);
    this.input = new Input($('view'), $('minimap'), this);
    this.bindMenus();
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.autoSave(true); });
    window.addEventListener('pagehide', () => this.autoSave(true));
    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
    this.showMenu();
  }

  // ---------- Einstellungen und Speicherstand ----------
  loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SET_KEY) || '{}');
      Object.assign(this.opts, s.opts || {});
      if (s.sound === false) this.sound.on = false;
      if (s.speed) this.speed = s.speed;
      if (s.gfx) Object.assign(this.gfx, s.gfx);
    } catch (e) { /* ignorieren */ }
  }
  saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify({ opts: this.opts, sound: this.sound.on, speed: this.speed, gfx: this.gfx })); } catch (e) { /* ignorieren */ } }
  // Ältere oder schwache Geräte starten mit mittlerer Qualität
  defaultQuality() {
    const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
    return cores <= 4 || mem <= 2 ? 'mid' : 'high';
  }
  applyGfx() {
    this.r.dayNight = this.gfx.dayNight;
    if (this.r.qName !== this.gfx.quality) this.r.setQuality(this.gfx.quality);
    this.onResize();
    document.querySelectorAll('.seg[data-gfx]').forEach(seg => {
      const k = seg.dataset.gfx;
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(this.gfx[k]) === b.dataset.v));
    });
  }
  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  autoSave(silent) {
    if (!this.g || this.g.over) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ game: this.g.toJSON(), cam: this.r.cam }));
      if (!silent) this.ui.toast('Spiel gespeichert');
    } catch (e) { if (!silent) this.ui.toast('Speichern fehlgeschlagen', 'warn'); }
  }
  clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignorieren */ } }

  // ---------- Menüs ----------
  bindMenus() {
    document.querySelectorAll('.seg[data-opt]').forEach(seg => {
      const opt = seg.dataset.opt;
      seg.querySelectorAll('button').forEach(b => {
        b.classList.toggle('on', String(this.opts[opt]) === b.dataset.v);
        b.addEventListener('click', () => {
          seg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          this.opts[opt] = opt === 'difficulty' ? b.dataset.v : Number(b.dataset.v);
          this.saveSettings();
        });
      });
    });
    document.querySelectorAll('.seg[data-gfx]').forEach(seg => {
      const k = seg.dataset.gfx;
      seg.querySelectorAll('button').forEach(b => {
        b.addEventListener('click', () => {
          this.gfx[k] = k === 'dayNight' ? b.dataset.v === 'true' : b.dataset.v;
          this.saveSettings(); this.applyGfx();
        });
      });
    });
    this.applyGfx();
    $('version').textContent = 'Version ' + VERSION;
    const sp = $('speed-seg');
    sp.querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', Number(b.dataset.v) === this.speed);
      b.addEventListener('click', () => {
        sp.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        b.classList.add('on'); this.speed = Number(b.dataset.v); this.saveSettings();
      });
    });
    $('btn-new').addEventListener('click', () => { this.sound.unlock(); this.newGame(); });
    $('btn-continue').addEventListener('click', () => { this.sound.unlock(); this.continueGame(); });
    const openHelp = () => $('help').classList.remove('hidden');
    $('btn-help').addEventListener('click', openHelp);
    $('btn-help2').addEventListener('click', openHelp);
    $('btn-help-close').addEventListener('click', () => $('help').classList.add('hidden'));
    $('btn-menu').addEventListener('click', () => this.pause(true));
    $('btn-resume').addEventListener('click', () => this.pause(false));
    $('btn-sound').addEventListener('click', () => { this.sound.on = !this.sound.on; this.updateSoundBtn(); this.saveSettings(); });
    $('btn-save-quit').addEventListener('click', () => { this.autoSave(false); this.g = null; this.showMenu(); });
    $('btn-surrender').addEventListener('click', () => {
      if (!confirm('Wirklich aufgeben?')) return;
      this.g.over = true; this.g.winner = -1; this.clearSave();
      $('pause').classList.add('hidden'); this.ui.endScreen(false); this.sound.play('lose');
    });
    $('btn-end-menu').addEventListener('click', () => { $('end').classList.add('hidden'); this.g = null; this.showMenu(); });
    $('btn-idle').addEventListener('click', () => this.selectIdle());
    $('btn-army').addEventListener('click', () => this.selectArmy());
    $('btn-home').addEventListener('click', () => this.goHome());
    $('mode-cancel').addEventListener('click', () => this.setMode(null));
    $('mode-ok').addEventListener('click', () => this.confirmPlace());
    this.updateSoundBtn();
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches;
    if (!standalone) {
      const h = $('install-hint');
      if (!ios) h.textContent = 'Tipp: Über das Browsermenü „Zum Startbildschirm hinzufügen“ wählen. So läuft Claycrown im Vollbild und offline.';
      h.classList.remove('hidden');
    }
  }
  updateSoundBtn() { $('btn-sound').textContent = this.sound.on ? '🔊 Ton an' : '🔇 Ton aus'; }

  showMenu() {
    this.paused = true;
    $('game').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('menu').classList.remove('hidden');
    $('btn-continue').classList.toggle('hidden', !this.hasSave());
  }

  pause(on) {
    if (!this.g || this.g.over) return;
    this.paused = on;
    $('pause').classList.toggle('hidden', !on);
    if (on) this.autoSave(true);
  }

  newGame() {
    this.clearSave();
    this.start(Game.create({ size: this.opts.size, ais: this.opts.ais, difficulty: this.opts.difficulty }));
    const keep = [...this.g.ents.values()].find(e => e.cls === 'b' && e.owner === 0 && e.type === 'keep');
    if (keep) this.r.centerOn(keep.x, keep.y + 1.5);
    this.ui.toast('Willkommen in Claycrown! Wähle deine Arbeiter und sammle Rohstoffe.', 'good');
    if (window.innerHeight > window.innerWidth) {
      const h = $('rotate-hint'); h.classList.remove('hidden'); setTimeout(() => h.classList.add('hidden'), 3500);
    }
  }

  continueGame() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      this.start(Game.load(d.game));
      if (d.cam) { Object.assign(this.r.cam, d.cam); this.r.clampCam(); }
      this.ui.toast('Spielstand geladen', 'good');
    } catch (e) {
      console.error(e);
      this.clearSave(); alert('Der Spielstand konnte nicht geladen werden.'); this.showMenu();
    }
  }

  start(g) {
    this.g = g;
    this.ais = g.players.filter(p => p.isAI).map(p => new AI(g, p.id));
    this.r.setGame(g);
    this.r.cam.zoom = Math.min(window.innerWidth, window.innerHeight) < 500 ? 0.8 : 1.05;
    this.ui = this.ui || new UI(this);
    this.ui.cmdSig = ''; this.ui.selSig = ''; this.ui.last = {};
    this.sel.clear(); this.mode = null; this.box = null; this.acc = 0;
    $('menu').classList.add('hidden'); $('end').classList.add('hidden'); $('pause').classList.add('hidden');
    $('game').classList.remove('hidden');
    $('modebar').classList.add('hidden');
    this.onResize();
    this.paused = false;
    this.saveT = 60;
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.r.resize(w, h, dpr);
    const tb = $('topbar').getBoundingClientRect().height, bb = $('bottombar').getBoundingClientRect().height;
    this.r.inset = { top: tb || 34, bottom: bb || 120 };
    if (this.g) this.r.clampCam();
  }

  // ---------- Schleife ----------
  frame(t) {
    requestAnimationFrame(tt => this.frame(tt));
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    if (!this.g) return;
    this.input.update(dt);
    if (!this.paused && !this.g.over) {
      this.acc += dt * this.speed;
      let n = 0;
      while (this.acc >= SIM_DT && n < 8) {
        this.g.tick();
        for (const a of this.ais) a.update(SIM_DT);
        this.acc -= SIM_DT; n++;
      }
      if (n >= 8) this.acc = 0;
      this.saveT -= dt;
      if (this.saveT <= 0) { this.saveT = 60; this.autoSave(true); }
    }
    this.handleEvents();
    for (const id of this.sel) if (!this.g.ents.has(id)) this.sel.delete(id);
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) this.hint = ''; }
    const ghost = this.mode && this.mode.k === 'place' ? { type: this.mode.type, tx: this.mode.tx, ty: this.mode.ty, touch: !this.mode.mouse } : null;
    const rallyOf = [...this.sel].map(id => this.g.ents.get(id)).find(e => e && e.cls === 'b' && e.owner === 0 && e.rally);
    this.r.draw(this.paused ? 1 : Math.min(1, this.acc / SIM_DT), { selSet: this.sel, ghost, box: this.box, rallyOf: rallyOf && rallyOf.id }, this.paused || this.g.over ? 0 : dt * this.speed);
    this.r.drawMinimap();
    this.ui.update(dt);
  }

  handleEvents() {
    const g = this.g, ev = g.events;
    if (!ev.length) return;
    for (const e of ev) {
      this.r.onEvent(e);
      switch (e.type) {
        case 'attacked':
          this.sound.play('alarm'); this.ui.toast('⚠ Du wirst angegriffen!', 'warn');
          this.r.ping = { x: e.x, y: e.y, t: performance.now() }; break;
        case 'built':
          if (e.owner === 0) { this.sound.play('built'); this.ui.toast(`${BUILDINGS[e.btype].name} fertiggestellt`); }
          break;
        case 'trained': if (e.owner === 0) this.sound.play('trained'); break;
        case 'age':
          if (e.owner === 0) { this.sound.play('age'); this.ui.toast(`Willkommen in der ${AGES[e.age].name}!`, 'good'); this.ui.cmdSig = ''; }
          else this.ui.toast(`${g.players[e.owner].name} erreicht die ${AGES[e.age].name}`);
          break;
        case 'tech': if (e.owner === 0) { this.sound.play('tech'); this.ui.toast('Forschung abgeschlossen'); } break;
        case 'hit': case 'shoot':
          if (this.r.inView(e.x, e.y, 0) && g.vis[Math.floor(e.y) * g.W + Math.floor(e.x)] === 2) this.sound.play(e.type);
          break;
        case 'death': if (this.r.inView(e.x, e.y, 0) && (e.owner === 0 || g.vis[Math.floor(e.y) * g.W + Math.floor(e.x)] === 2)) this.sound.play('death'); break;
        case 'destroyed':
          if (e.owner === 0) { this.sound.play('destroyed'); this.ui.toast(`${BUILDINGS[e.btype].name} zerstört`, 'warn'); }
          else if (this.r.inView(e.x, e.y, 0)) this.sound.play('destroyed');
          break;
        case 'monument':
          this.ui.toast(e.owner === 0 ? '👑 Monument errichtet! Halte es 3 Minuten.' : `👑 ${g.players[e.owner].name} hat ein Monument errichtet!`, e.owner === 0 ? 'good' : 'warn');
          break;
        case 'defeated': if (e.owner > 0) this.ui.toast(`${g.players[e.owner].name} wurde besiegt`, 'good'); break;
        case 'info': this.ui.toast(e.text); break;
        case 'gameover': {
          const win = e.winner === 0;
          this.sound.play(win ? 'win' : 'lose');
          this.clearSave();
          setTimeout(() => this.ui.endScreen(win, e.reason), 900);
          break;
        }
      }
    }
    ev.length = 0;
  }

  // ---------- Auswahl ----------
  selEnts() { const out = []; for (const id of this.sel) { const e = this.g.ents.get(id); if (e) out.push(e); } return out; }
  myUnitsSel() { return this.selEnts().filter(e => e.cls === 'u' && e.owner === 0); }
  clearSel() { this.sel.clear(); this.setMode(null); this.ui.page = 'eco'; }
  setSel(ids) { this.sel = new Set(ids); this.ui.page = 'eco'; if (this.mode && this.mode.k !== 'place') this.setMode(null); if (this.mode && this.mode.k === 'place' && !this.myUnitsSel().some(u => u.type === 'worker')) this.setMode(null); }
  narrowSel(type) { this.setSel(this.selEnts().filter(e => e.type === type).map(e => e.id)); this.sound.play('select'); }
  setHint(h) { this.hint = h; this.hintT = 4; }

  pick(sx, sy, touch) {
    const g = this.g, [wx, wy] = this.r.toWorld(sx, sy), s = this.r.scale;
    const tol = (touch ? 16 : 5) / s;
    const unitAt = extra => {
      let best = null, bd = 1e9;
      for (const e of g.ents.values()) {
        if (e.cls !== 'u') continue;
        if (Math.abs(e.x - wx) > 2 || Math.abs(e.y - wy) > 2) continue;
        if (!g.isVisible(e)) continue;
        const r = UNITS[e.type].r;
        const d = Math.min(Math.hypot(e.x - wx, e.y - r - wy), Math.hypot(e.x - wx, e.y - wy));
        if (d < r + extra && d < bd) { bd = d; best = e; }
      }
      return best;
    };
    // 1. Einheit genau getroffen
    let u = unitAt(0.08);
    if (u) return u;
    // 2. Gebäude über die ganze sichtbare Fläche samt Dach, das vorderste gewinnt
    let bb = null;
    for (const e of g.ents.values()) {
      if (e.cls !== 'b' || !g.isVisible(e)) continue;
      const top = (e.done || e.prog > 0.3 ? BUILD_TOP[e.type] || 0 : 0.3) * 0.95;
      if (wx >= e.tx - tol * 0.6 && wx <= e.tx + e.w + tol * 0.6 && wy >= e.ty - top - tol * 0.6 && wy <= e.ty + e.h + tol * 0.6) {
        if (!bb || e.ty + e.h > bb.ty + bb.h) bb = e;
      }
    }
    if (bb) return bb;
    // 3. Einheit mit Toleranz
    u = unitAt(0.15 + tol);
    if (u) return u;
    const tx = Math.floor(wx), ty = Math.floor(wy);
    for (const [ox, oy] of [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const e = g.entAt(tx + ox, ty + oy);
      if (e && e.cls === 'r' && g.isVisible(e)) {
        const tree = e.kind === 'tree';
        if (wx >= e.tx - tol && wx <= e.tx + 1 + tol && wy >= e.ty - (tree ? 0.9 : 0.3) - tol && wy <= e.ty + 1 + tol) return e;
      }
    }
    return null;
  }

  selectEnt(e, dbl, add) {
    if (dbl && e.owner === 0 && e.cls === 'u') {
      const ids = [];
      for (const u of this.g.ents.values()) if (u.cls === 'u' && u.owner === 0 && u.type === e.type && this.r.inView(u.x, u.y, -0.5)) ids.push(u.id);
      this.setSel(ids);
    } else if (dbl && e.owner === 0 && e.cls === 'b') {
      const ids = [];
      for (const b of this.g.ents.values()) if (b.cls === 'b' && b.owner === 0 && b.type === e.type && b.done === e.done && this.r.inView(b.x, b.y, 0)) ids.push(b.id);
      this.setSel(ids);
    } else if (add && e.owner === 0 && e.cls === 'u') {
      const s = new Set(this.sel); if (s.has(e.id)) s.delete(e.id); else s.add(e.id);
      this.setSel([...s].filter(id => { const x = this.g.ents.get(id); return x && x.cls === 'u' && x.owner === 0; }));
    } else this.setSel([e.id]);
    this.sound.play('select');
  }

  command(t, wx, wy) {
    const ids = this.myUnitsSel().map(u => u.id);
    if (!ids.length) return;
    const res = this.g.smartCommand(ids, wx, wy, t);
    const col = res === 'attack' ? '#ff5a4a' : res === 'gather' || res === 'build' ? '#ffe680' : '#7dff7d';
    this.r.addMarker(t ? t.x : wx, t ? t.y : wy, col);
    this.sound.play('command');
  }

  // Touch Tippen
  tap(sx, sy, { dbl }) {
    if (!this.g) return;
    const [wx, wy] = this.r.toWorld(sx, sy);
    if (this.mode && this.mode.k === 'place') { this.moveGhost(sx, sy, true); return; }
    if (this.modeAction(wx, wy, sx, sy)) return;
    const t = this.pick(sx, sy, true);
    const mine = this.myUnitsSel();
    if (t && t.owner === 0) {
      const workers = mine.some(u => u.type === 'worker');
      if (mine.length && t.cls === 'b' && !this.sel.has(t.id) && workers && !t.done) {
        this.command(t, wx, wy); return;
      }
      this.selectEnt(t, dbl, false);
      return;
    }
    if (mine.length) { this.command(t, wx, wy); return; }
    if (t) { this.setSel([t.id]); this.sound.play('select'); }
    else this.clearSel();
  }

  // Maus Linksklick
  click(sx, sy, { dbl, shift }) {
    if (!this.g) return;
    const [wx, wy] = this.r.toWorld(sx, sy);
    if (this.mode && this.mode.k === 'place') { this.moveGhost(sx, sy, true); this.confirmPlace(shift); return; }
    if (this.modeAction(wx, wy, sx, sy)) return;
    const t = this.pick(sx, sy, false);
    if (t) this.selectEnt(t, dbl, shift);
    else if (!shift) this.clearSel();
  }

  rightClick(sx, sy) {
    if (!this.g) return;
    if (this.mode) { this.setMode(null); return; }
    const [wx, wy] = this.r.toWorld(sx, sy);
    const t = this.pick(sx, sy, false);
    if (this.myUnitsSel().length) { this.command(t, wx, wy); return; }
    const bs = this.selEnts().filter(e => e.cls === 'b' && e.owner === 0 && BUILDINGS[e.type].trains);
    if (bs.length) { for (const b of bs) this.g.setRally(b.id, wx, wy, t && t.id); this.sound.play('command'); this.r.addMarker(wx, wy, '#ffffff'); }
  }

  modeAction(wx, wy, sx, sy) {
    const m = this.mode;
    if (!m) return false;
    if (m.k === 'rally') {
      const t = this.pick(sx, sy, true);
      for (const b of this.selEnts()) if (b.cls === 'b' && b.owner === 0) this.g.setRally(b.id, wx, wy, t && t.id);
      this.r.addMarker(wx, wy, '#ffffff'); this.sound.play('command'); this.setMode(null); return true;
    }
    if (m.k === 'repair') {
      const t = this.pick(sx, sy, true);
      const ids = this.myUnitsSel().filter(u => u.type === 'worker').map(u => u.id);
      if (t && t.cls === 'b' && t.owner === 0 && (!t.done || t.hp < t.maxHp)) {
        this.g.issueBuild(ids, t.id); this.r.addMarker(t.x, t.y, '#ffe680'); this.sound.play('command');
      } else { this.ui.toast('Kein beschädigtes eigenes Gebäude', 'warn'); this.sound.play('error'); }
      this.setMode(null); return true;
    }
    if (m.k === 'amove') {
      const t = this.pick(sx, sy, true);
      const ids = this.myUnitsSel().filter(u => u.type !== 'worker').map(u => u.id);
      if (t && t.owner > 0) this.g.issueAttack(ids, t.id); else this.g.issueMove(ids, wx, wy, true);
      this.r.addMarker(wx, wy, '#ff5a4a'); this.sound.play('command'); this.setMode(null); return true;
    }
    return false;
  }

  boxSelect(x0, y0, x1, y1, add) {
    const g = this.g;
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
    if (bx - ax < 6 && by - ay < 6) return;
    const ids = [];
    for (const u of g.ents.values()) {
      if (u.cls !== 'u' || u.owner !== 0) continue;
      const [sx, sy] = this.r.toScreen(u.x, u.y - 0.25);
      if (sx >= ax && sx <= bx && sy >= ay && sy <= by) ids.push(u.id);
    }
    if (!ids.length) {
      for (const b of g.ents.values()) {
        if (b.cls !== 'b' || b.owner !== 0) continue;
        const [sx, sy] = this.r.toScreen(b.x, b.y);
        if (sx >= ax && sx <= bx && sy >= ay && sy <= by) { ids.push(b.id); break; }
      }
    }
    if (add) for (const id of this.sel) { const e = g.ents.get(id); if (e && e.cls === 'u' && e.owner === 0) ids.push(id); }
    if (ids.length) { this.setSel(ids); this.sound.play('select'); }
  }

  setBox(b) { this.box = b; }
  pan(dx, dy) { if (!this.g) return; const s = this.r.scale; this.r.cam.x -= dx / s; this.r.cam.y -= dy / s; this.r.clampCam(); }

  minimapJump(fx, fy, right) {
    if (!this.g) return;
    const x = fx * this.g.W, y = fy * this.g.H;
    if (right && this.myUnitsSel().length) { this.command(null, x, y); return; }
    this.r.centerOn(x, y);
  }

  // ---------- Bauen ----------
  placing() { return this.mode && this.mode.k === 'place'; }

  startPlace(type) {
    const err = this.g.buildError(0, type);
    if (err) { this.sound.play('error'); this.ui.toast(err, 'warn'); if (err.startsWith('Nicht genug')) this.ui.flashRes(err.slice(12)); return; }
    const d = BUILDINGS[type];
    const mouse = this.input.lastType === 'mouse';
    let wx, wy;
    if (mouse && this.input.mouse) [wx, wy] = this.r.toWorld(this.input.mouse.x, this.input.mouse.y);
    else [wx, wy] = this.r.toWorld(this.r.w / 2, this.r.h * 0.45);
    const m = { k: 'place', type, tx: Math.round(wx - d.w / 2), ty: Math.round(wy - d.h / 2), mouse };
    // Startposition: nächste gültige Stelle in der Nähe
    if (!this.g.canPlace(type, m.tx, m.ty, 0)) {
      outer: for (let r = 1; r < 8; r++) for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        if (Math.abs(x) !== r && Math.abs(y) !== r) continue;
        if (this.g.canPlace(type, m.tx + x, m.ty + y, 0)) { m.tx += x; m.ty += y; break outer; }
      }
    }
    this.setMode(m);
  }

  ghostHit(sx, sy) {
    if (!this.placing()) return false;
    const d = BUILDINGS[this.mode.type];
    const [x0, y0] = this.r.toScreen(this.mode.tx, this.mode.ty), s = this.r.scale;
    const pad = 24;
    return sx >= x0 - pad && sx <= x0 + d.w * s + pad && sy >= y0 - pad && sy <= y0 + d.h * s + pad;
  }
  ghostOffset(sx, sy) {
    const d = BUILDINGS[this.mode.type];
    const [x0, y0] = this.r.toScreen(this.mode.tx + d.w / 2, this.mode.ty + d.h / 2);
    return { x: sx - x0, y: sy - y0 };
  }
  moveGhost(sx, sy) {
    if (!this.placing()) return;
    const d = BUILDINGS[this.mode.type];
    const [wx, wy] = this.r.toWorld(sx, sy);
    this.mode.tx = Math.round(wx - d.w / 2); this.mode.ty = Math.round(wy - d.h / 2);
  }
  hover(sx, sy) {
    if (this.placing() && this.mode.mouse) this.moveGhost(sx, sy);
  }

  confirmPlace(keep) {
    if (!this.placing()) return;
    const m = this.mode;
    const ids = this.myUnitsSel().filter(u => u.type === 'worker').map(u => u.id);
    if (!ids.length) { this.setMode(null); return; }
    const r = this.g.placeBuilding(0, m.type, m.tx, m.ty, ids);
    if (typeof r === 'string') { this.sound.play('error'); this.ui.toast(r, 'warn'); if (r.startsWith('Nicht genug')) this.ui.flashRes(r.slice(12)); return; }
    this.sound.play('place');
    if (navigator.vibrate) navigator.vibrate(10);
    if (m.type === 'wall' && !this.g.buildError(0, m.type)) {
      // nächstes Mauerstück in derselben Richtung vorschlagen
      const dx = m.last ? Math.sign(m.tx - m.last.tx) : 1, dy = m.last ? Math.sign(m.ty - m.last.ty) : 0;
      m.last = { tx: m.tx, ty: m.ty };
      if (!m.mouse) { m.tx += dx || (dy ? 0 : 1); m.ty += dy; }
      return;
    }
    if (keep && !this.g.buildError(0, m.type)) return;
    this.setMode(null);
  }

  setMode(m) {
    this.mode = m;
    const bar = $('modebar');
    if (!m) { bar.classList.add('hidden'); if (this.ui) this.ui.t = 0; return; }
    bar.classList.remove('hidden');
    $('mode-ok').classList.toggle('hidden', m.k !== 'place');
    let label = '';
    if (m.k === 'place') label = `${BUILDINGS[m.type].icon} ${BUILDINGS[m.type].name}: ${m.mouse ? (m.type === 'wall' ? 'Klicken setzt Mauerstücke, Rechtsklick beendet' : 'Klicken zum Bauen') : (m.type === 'wall' ? 'Stück setzen mit ✓, beenden mit ✕' : 'Vorschau ziehen oder tippen, dann ✓')}`;
    else if (m.k === 'rally') label = '🚩 Sammelpunkt antippen';
    else if (m.k === 'amove') label = '🗡️ Angriffsziel antippen';
    else if (m.k === 'repair') label = '🔧 Beschädigtes Gebäude antippen';
    $('mode-label').textContent = label;
    if (this.ui) this.ui.t = 0;
  }

  // ---------- Gebäudebefehle ----------
  selBuildings() { return this.selEnts().filter(e => e.cls === 'b' && e.owner === 0 && e.done); }

  trainSel(key) {
    const bs = this.selBuildings().filter(b => (BUILDINGS[b.type].trains || []).includes(key));
    if (!bs.length) return;
    bs.sort((a, b) => a.queue.length - b.queue.length);
    const r = this.g.train(bs[0].id, key);
    if (r !== true) { this.sound.play('error'); this.ui.toast(r, 'warn'); if (r.startsWith('Nicht genug')) this.ui.flashRes(r.slice(12)); }
    else { this.sound.play('select'); this.ui.selSig = ''; }
  }

  trade(kind, buy) {
    const r = this.g.trade(0, kind, buy);
    if (r !== true) { this.sound.play('error'); this.ui.toast(r, 'warn'); if (r.startsWith('Nicht genug')) this.ui.flashRes(r.slice(12)); }
    else { this.sound.play('trade'); this.ui.cmdSig = ''; }
  }

  researchSel(key) {
    const b = this.selBuildings()[0];
    if (!b) return;
    const r = this.g.research(b.id, key);
    if (r !== true) { this.sound.play('error'); this.ui.toast(r, 'warn'); if (r.startsWith('Nicht genug')) this.ui.flashRes(r.slice(12)); }
    else { this.sound.play('select'); this.ui.selSig = ''; this.ui.cmdSig = ''; }
  }

  demolishSel(unfinished) {
    const bs = this.selEnts().filter(e => e.cls === 'b' && e.owner === 0);
    if (!bs.length) return;
    if (!unfinished && !confirm(bs.length > 1 ? `${bs.length} Gebäude abreißen?` : `${BUILDINGS[bs[0].type].name} abreißen?`)) return;
    for (const b of bs) this.g.demolish(b.id);
    this.clearSel();
  }

  // ---------- Schnellwahl ----------
  selectIdle() {
    const idle = [...this.g.ents.values()].filter(e => e.cls === 'u' && e.owner === 0 && e.type === 'worker' && !e.order);
    if (!idle.length) { this.ui.toast('Keine untätigen Arbeiter'); return; }
    this.idleIdx = ((this.idleIdx || 0) + 1) % idle.length;
    const u = idle[this.idleIdx];
    this.setSel([u.id]); this.r.centerOn(u.x, u.y); this.sound.play('select');
  }
  selectArmy() {
    const ids = [...this.g.ents.values()].filter(e => e.cls === 'u' && e.owner === 0 && e.type !== 'worker').map(e => e.id);
    if (!ids.length) { this.ui.toast('Keine Militäreinheiten'); return; }
    this.setSel(ids); this.sound.play('select');
  }
  goHome() {
    const ks = [...this.g.ents.values()].filter(e => e.cls === 'b' && e.owner === 0 && e.type === 'keep');
    if (!ks.length) return;
    this.homeIdx = ((this.homeIdx || 0) + 1) % ks.length;
    const k = ks[this.homeIdx];
    this.r.centerOn(k.x, k.y + 1); this.setSel([k.id]); this.sound.play('select');
  }

  hotkey(k, e) {
    if (!this.g) return;
    if (k === ' ' || k === 'p') { e.preventDefault(); this.pause(!this.paused); return; }
    if (k === 'escape') { if (this.mode) this.setMode(null); else if (this.sel.size) this.clearSel(); else this.pause(!this.paused); return; }
    if (this.paused) return;
    if (k === '.') this.selectIdle();
    else if (k === ',') this.selectArmy();
    else if (k === 'h') this.goHome();
    else if (k === 'delete') this.demolishSel(false);
    else if (k === '+' || k === '=') this.r.zoomAt(1.15, this.r.w / 2, this.r.h / 2);
    else if (k === '-') this.r.zoomAt(1 / 1.15, this.r.w / 2, this.r.h / 2);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.claycrown = new App();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
