// Claycrown 2.0: HUD, Auswahlinfo und Befehlsleiste
import { UNITS, BUILDINGS, TECHS, AGES, ECO_BUILD, MIL_BUILD, DEF_BUILD, RES, RES_INFO } from './data.js?v=201';
import { RES_KIND } from './world.js?v=201';
import { costText, fmtTime } from './util.js?v=201';

const $ = id => document.getElementById(id);
const RES_NAME = { tree: 'Baum', gold: 'Goldvorkommen', clay: 'Lehmgrube', berry: 'Beerenstrauch' };
const RES_ICON = { tree: '🌳', gold: '🪙', clay: '🧱', berry: '🫐' };

export class UI {
  constructor(app) {
    this.app = app;
    this.resEls = {};
    for (const k of RES) this.resEls[k] = $('r-' + k).querySelector('b');
    this.popEl = $('r-pop').querySelector('b');
    this.ageEl = $('age-label'); this.clockEl = $('clock');
    this.idleEl = $('idle-count');
    this.sel = $('selinfo'); this.cmds = $('cmds');
    this.cmdSig = ''; this.selSig = '';
    this.cmdBtns = [];
    this.last = {};
    this.t = 0;
    this.page = 'eco';
  }

  toast(text, cls = '') {
    const box = $('toasts');
    for (const c of box.children) if (c.textContent === text) return;
    while (box.children.length > 3) box.firstChild.remove();
    const d = document.createElement('div');
    d.className = 'toast ' + cls; d.textContent = text;
    box.appendChild(d);
    setTimeout(() => d.remove(), 3000);
  }

  flashRes(name) {
    const k = { Nahrung: 'food', Holz: 'wood', Gold: 'gold', Lehm: 'clay' }[name];
    if (!k) return;
    const el = $('r-' + k); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  update(dt, force) {
    const g = this.app.g, p = g.players[0];
    for (const k of RES) {
      const v = Math.floor(p.res[k]);
      if (this.last[k] !== v) { this.last[k] = v; this.resEls[k].textContent = v; }
    }
    const pop = `${p.pop}/${p.popCap}`;
    if (this.last.pop !== pop) { this.last.pop = pop; this.popEl.textContent = pop; this.popEl.style.color = p.pop >= p.popCap ? '#ff8b7f' : ''; }
    if (this.last.age !== p.age) { this.last.age = p.age; this.ageEl.textContent = AGES[p.age].name; }
    const clk = fmtTime(g.time);
    if (this.last.clk !== clk) { this.last.clk = clk; this.clockEl.textContent = clk; }
    this.t -= dt;
    if (this.t > 0 && !force) return;
    this.t = 0.2;
    let idle = 0;
    for (const e of g.ents.values()) if (e.cls === 'u' && e.owner === 0 && e.type === 'worker' && !e.order) idle++;
    if (this.last.idle !== idle) { this.last.idle = idle; this.idleEl.textContent = idle; this.idleEl.classList.toggle('zero', idle === 0); }
    this.updateSel();
    this.updateCmds();
    this.updateMonument();
  }

  updateMonument() {
    const g = this.app.g, el = $('monument-banner');
    let txt = '';
    for (const b of g.blds) {
      if (b.type !== 'monument' || !b.done || b.dead) continue;
      if (b.owner !== 0 && !b.seen) { txt = `👑 ${g.players[b.owner].name} baut ein Monument`; continue; }
      const rest = Math.max(0, 180 - b.mt);
      txt = `👑 ${b.owner === 0 ? 'Dein Monument' : g.players[b.owner].name}: Sieg in ${fmtTime(rest)}`;
      break;
    }
    el.classList.toggle('hidden', !txt);
    if (txt) el.textContent = txt;
  }

  // ---------- Auswahlinfo ----------
  updateSel() {
    const app = this.app, g = app.g;
    const ents = app.selEnts();
    let sig;
    if (!ents.length) sig = 'none';
    else if (ents.length === 1) { const e = ents[0]; sig = `1:${e.id}:${e.done}:${(e.queue || []).map(q => q.key).join(',')}`; }
    else { const c = {}; for (const e of ents) c[e.type] = (c[e.type] || 0) + 1; sig = 'm:' + JSON.stringify(c); }
    if (sig !== this.selSig) { this.selSig = sig; this.buildSel(ents); }
    this.refreshSel(ents);
  }

  buildSel(ents) {
    const el = this.sel, g = this.app.g;
    el.innerHTML = '';
    if (!ents.length) {
      el.innerHTML = `<div class="si-sub">Tippe auf eine Einheit oder ein Gebäude. Gedrückt halten und ziehen für einen Auswahlrahmen.</div>`;
      return;
    }
    const x = document.createElement('button'); x.className = 'si-x'; x.textContent = '✕';
    x.addEventListener('click', () => this.app.clearSel());
    if (ents.length > 1) {
      const counts = new Map();
      for (const e of ents) counts.set(e.type, (counts.get(e.type) || 0) + 1);
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div class="si-name">${ents.length} ausgewählt</div>`;
      const m = document.createElement('div'); m.className = 'multi';
      for (const [t, n] of counts) {
        const b = document.createElement('button');
        const d = UNITS[t] || BUILDINGS[t];
        b.innerHTML = `${d.icon}<b>${n}</b>`;
        b.title = d.name;
        b.addEventListener('click', () => this.app.narrowSel(t));
        m.appendChild(b);
      }
      wrap.appendChild(m);
      el.appendChild(wrap); el.appendChild(x);
      return;
    }
    const e = ents[0];
    let icon, name, sub = '';
    if (e.cls === 'u') { const d = UNITS[e.type]; icon = d.icon; name = d.name; }
    else if (e.cls === 'b') { const d = BUILDINGS[e.type]; icon = d.icon; name = d.name; }
    else { icon = RES_ICON[e.kind]; name = RES_NAME[e.kind]; }
    if (e.owner >= 0) sub = g.players[e.owner].name === 'Du' ? 'Eigenes Reich' : g.players[e.owner].name;
    el.innerHTML = `<div class="si-head"><div class="si-icon">${icon}</div><div><div class="si-name">${name}</div><div class="si-sub">${sub}</div></div></div>
      <div class="hpbar"><div></div></div><div class="si-stats"></div><div class="queue"></div><div class="si-desc"></div>`;
    el.appendChild(x);
    if (e.cls === 'b' && e.owner === 0 && e.done && e.queue.length) {
      const qEl = el.querySelector('.queue');
      e.queue.forEach((q, i) => {
        const b = document.createElement('button');
        b.textContent = q.k === 'u' ? UNITS[q.key].icon : TECHS[q.key].icon;
        b.title = 'Abbrechen';
        b.innerHTML += '<div class="qp"></div>';
        b.addEventListener('click', () => { g.cancelQueue(e.id, i); this.app.sound.play('select'); this.selSig = ''; });
        qEl.appendChild(b);
      });
    }
  }

  refreshSel(ents) {
    if (ents.length !== 1) return;
    const e = ents[0], g = this.app.g, el = this.sel;
    const bar = el.querySelector('.hpbar'), st = el.querySelector('.si-stats'), desc = el.querySelector('.si-desc');
    if (!bar) return;
    let html = '', d;
    if (e.cls === 'r') {
      bar.firstChild.style.width = (100 * e.amount / e.max) + '%';
      bar.firstChild.style.background = '#e8c23a';
      html = `<span>${Math.ceil(e.amount)} ${{ tree: 'Holz', gold: 'Gold', clay: 'Lehm', berry: 'Nahrung' }[e.kind]}</span>`;
    } else {
      bar.firstChild.style.width = Math.max(0, 100 * e.hp / e.maxHp) + '%';
      bar.firstChild.style.background = e.owner === 0 ? '' : '#e5574a';
      html = `<span>❤ ${Math.ceil(e.hp)}/${e.maxHp}</span>`;
      if (e.cls === 'u') {
        d = UNITS[e.type];
        const p = g.players[e.owner];
        const melee = !d.proj && d.cls !== 'worker' && d.cls !== 'siege' && d.cls !== 'priest';
        const atk = d.atk + (melee ? (p.techs.blades ? 2 : 0) + (p.techs.steel ? 2 : 0) : 0) + (d.bow && p.techs.arrows ? 1 : 0);
        const armed = d.cls !== 'worker' && d.cls !== 'siege';
        const am = armed ? (p.techs.armor ? 1 : 0) + (p.techs.plate ? 1 : 0) : 0, ap = armed ? (p.techs.armor ? 1 : 0) + (p.techs.plate ? 2 : 0) : 0;
        if (d.atk) html += `<span>⚔ ${atk}</span>`;
        html += `<span>🛡 ${d.ma + am}/${d.pa + ap}</span>`;
        if (d.bonus) html += `<span>✚ ${Object.keys(d.bonus).map(k => ({ cav: '🐎', arch: '🏹', inf: '⚔️', siege: '🐏', bld: '🏠', worker: '👷' })[k]).join('')}</span>`;
        if (d.range) html += `<span>🎯 ${g.attackRange(e)}</span>`;
        if (e.type === 'worker' && e.owner === 0) {
          const o = e.order;
          const act = !o ? 'Untätig' : o.t === 'gather' ? 'Sammelt ' + ({ food: 'Nahrung', wood: 'Holz', gold: 'Gold', clay: 'Lehm' }[o.kind]) : o.t === 'build' ? 'Baut' : o.t === 'attack' ? 'Kämpft' : 'Unterwegs';
          html += `<span>${act}</span>`;
          if (e.carryN >= 1) html += `<span>Trägt ${Math.floor(e.carryN)} ${{ food: '🌾', wood: '🪵', gold: '🪙', clay: '🧱' }[e.carry]}</span>`;
        }
      } else {
        d = BUILDINGS[e.type];
        if (!e.done) html += `<span>Bau ${Math.floor(e.prog * 100)} %</span>`;
        if (e.type === 'farm' && e.done) html += `<span>🌾 ${Math.ceil(e.food)}</span>`;
        if (d.pop && e.done) html += `<span>👥 +${d.pop + (e.type === 'house' && g.players[e.owner].techs.pottery ? 2 : 0)}</span>`;
        if (d.atk && e.done) html += `<span>⚔ ${d.atk}${d.shots ? '×' + d.shots : ''}</span><span>🎯 ${d.range}</span>`;
        if (d.market && e.done && e.owner === 0) { const p = g.players[0]; html += `<span>Kurse 🌾${Math.round(p.market.food)} 🪵${Math.round(p.market.wood)} 🧱${Math.round(p.market.clay)}</span>`; }
        if (e.type === 'monument' && e.done) html += `<span>👑 ${fmtTime(Math.max(0, 180 - e.mt))}</span>`;
        const qb = el.querySelectorAll('.queue .qp');
        if (e.queue && qb.length) {
          const q = e.queue[0];
          const tt = q.k === 'u' ? g.trainTime(e.owner, q.key) : TECHS[q.key].time;
          qb[0].style.width = Math.min(100, 100 * q.t / tt) + '%';
          if (q.blocked) html += `<span style="color:#ff8b7f">Häuser fehlen</span>`;
        }
      }
    }
    if (st.innerHTML !== html) st.innerHTML = html;
    const ds = this.app.hint || (d && e.owner === 0 ? d.desc || '' : '');
    if (desc.textContent !== ds) desc.textContent = ds;
  }

  // ---------- Befehle ----------
  commandList() {
    const app = this.app, g = app.g, p = g.players[0];
    const ents = app.selEnts().filter(e => e.owner === 0);
    const list = [];
    if (!ents.length) return list;
    const units = ents.filter(e => e.cls === 'u');
    if (units.length) {
      const workers = units.some(u => u.type === 'worker');
      if (workers) {
        const types = this.page === 'eco' ? ECO_BUILD : this.page === 'mil' ? MIL_BUILD : DEF_BUILD;
        for (const t of types) {
          const d = BUILDINGS[t];
          const locked = p.age < d.age || (d.req && !g.hasDone(0, d.req));
          list.push({
            key: 'b:' + t, icon: d.icon, label: locked ? '🔒 ' + (p.age < d.age ? AGES[d.age].short : BUILDINGS[d.req].name) : costText(d.cost),
            locked, poor: !g.canAfford(p, d.cost), active: app.mode && app.mode.k === 'place' && app.mode.type === t,
            hint: `${d.name}: ${d.desc} Kosten ${costText(d.cost)}`,
            run: () => app.startPlace(t),
          });
        }
        const next = { eco: 'mil', mil: 'def', def: 'eco' }[this.page] || 'eco';
        list.push({ key: 'page', icon: { mil: '⚔️', def: '🏯', eco: '🏠' }[next], label: { mil: 'Militär', def: 'Verteidigung', eco: 'Wirtschaft' }[next], hint: 'Bauseite wechseln: Wirtschaft, Militär, Verteidigung.', run: () => { this.page = next; this.cmdSig = ''; } });
      }
      if (units.some(u => u.type !== 'worker')) {
        list.push({ key: 'amove', icon: '🗡️', label: 'Angriff', active: app.mode && app.mode.k === 'amove', hint: 'Angriffsbewegung: Ziel antippen. Einheiten kämpfen unterwegs gegen alles.', run: () => app.setMode({ k: 'amove' }) });
      }
      if (workers) {
        const ws = units.filter(u => u.type === 'worker');
        list.push({ key: 'drop', icon: '📦', label: 'Abliefern', hint: 'Abliefern: Arbeiter bringen ihre Last zum nächsten Lager und arbeiten danach weiter.', run: () => {
          let n = 0;
          for (const w of ws) {
            if (w.carryN < 1) continue;
            n++;
            if (w.order && w.order.t === 'gather') w.order.dropping = true;
            else w.order = { t: 'gather', id: 0, kind: w.carry, dropping: true };
            w.path = null;
          }
          if (n) app.sound.play('command'); else this.toast('Niemand trägt etwas');
        } });
        list.push({ key: 'repair', icon: '🔧', label: 'Reparieren', active: app.mode && app.mode.k === 'repair', hint: 'Reparieren: Danach ein beschädigtes eigenes Gebäude antippen.', run: () => app.setMode({ k: 'repair' }) });
      }
      list.push({ key: 'stop', icon: '✋', label: 'Halt', run: () => { g.issueStop(units.map(u => u.id)); app.sound.play('command'); } });
      return list;
    }
    // Gebäude (gleicher Typ)
    const b = ents[0], d = BUILDINGS[b.type];
    if (!b.done) {
      list.push({ key: 'cancelb', icon: '✕', label: 'Abbrechen', run: () => app.demolishSel(true) });
      return list;
    }
    for (const k of d.trains || []) {
      const u = UNITS[k];
      if (u.age > p.age + 1) continue;
      const locked = p.age < u.age;
      list.push({
        key: 'u:' + k, icon: u.icon, label: locked ? '🔒 ' + AGES[u.age].short : costText(u.cost), locked, poor: !g.canAfford(p, u.cost),
        badge: ents.reduce((n, e) => n + e.queue.filter(q => q.key === k).length, 0) || '',
        hint: `${u.name}: ${u.desc} Kosten ${costText(u.cost)}`,
        run: () => app.trainSel(k),
      });
    }
    for (const k of d.techs || []) {
      const t = TECHS[k];
      if (p.techs[k]) continue;
      if (t.ageUp && t.ageUp !== p.age + 1) continue;
      const researching = !!p.researching[k];
      const needT = t.req && !p.techs[t.req];
      const locked = p.age < t.age || needT;
      list.push({
        key: 't:' + k + researching + needT, icon: t.icon, label: researching ? '⏳' : p.age < t.age ? '🔒 ' + AGES[t.age].short : needT ? '🔒 ' + TECHS[t.req].name : costText(t.cost),
        locked: locked || researching, poor: !g.canAfford(p, t.cost), hint: `${t.name}: ${t.desc} Kosten ${costText(t.cost)}`,
        run: () => app.researchSel(k),
      });
    }
    if (d.market) {
      for (const k of ['food', 'wood', 'clay']) {
        const ic = RES_INFO[k].icon;
        list.push({ key: 'sell:' + k, icon: `${ic}→🪙`, label: `+${g.tradeQuote(0, k, false)}`, poor: p.res[k] < 100,
          hint: `100 ${RES_INFO[k].name} verkaufen für ${g.tradeQuote(0, k, false)} Gold.`, run: () => app.trade(k, false) });
      }
      for (const k of ['food', 'wood', 'clay']) {
        const ic = RES_INFO[k].icon;
        list.push({ key: 'buy:' + k, icon: `🪙→${ic}`, label: `−${g.tradeQuote(0, k, true)}`, poor: p.res.gold < g.tradeQuote(0, k, true),
          hint: `100 ${RES_INFO[k].name} kaufen für ${g.tradeQuote(0, k, true)} Gold.`, run: () => app.trade(k, true) });
      }
    }
    if (d.trains) list.push({ key: 'rally', icon: '🚩', label: 'Sammelpunkt', active: app.mode && app.mode.k === 'rally', hint: 'Sammelpunkt: Ort antippen, an dem neue Einheiten warten.', run: () => app.setMode({ k: 'rally' }) });
    list.push({ key: 'del', icon: '🗑️', label: 'Abreißen', run: () => app.demolishSel(false) });
    return list;
  }

  updateCmds() {
    const list = this.commandList();
    const sig = list.map(c => c.key).join('|');
    if (sig !== this.cmdSig) {
      this.cmdSig = sig;
      this.cmds.innerHTML = '';
      this.cmdBtns = list.map(c => {
        const b = document.createElement('button');
        b.className = 'cmd';
        b.innerHTML = `<span class="ic">${c.icon}</span><span class="lb"></span><span class="badge"></span>`;
        if ([...c.icon].length > 2) b.classList.add('wide');
        b.addEventListener('click', () => {
          const cur = this.current.find(x => x.key === c.key);
          if (!cur) return;
          this.app.sound.unlock();
          if (cur.hint) this.app.setHint(cur.hint);
          if (cur.locked) { this.app.sound.play('error'); this.toast(cur.label.replace('🔒 ', 'Gesperrt: '), 'warn'); return; }
          cur.run();
          this.t = 0;
        });
        this.cmds.appendChild(b);
        return b;
      });
    }
    this.current = list;
    list.forEach((c, i) => {
      const b = this.cmdBtns[i];
      if (!b) return;
      const lb = b.children[1], bd = b.children[2];
      if (lb.textContent !== c.label) lb.textContent = c.label;
      const badge = String(c.badge || '');
      if (bd.textContent !== badge) bd.textContent = badge;
      b.classList.toggle('locked', !!c.locked);
      b.classList.toggle('poor', !!c.poor && !c.locked);
      b.classList.toggle('active', !!c.active);
    });
  }

  endScreen(win, reason) {
    const g = this.app.g;
    $('end-title').textContent = win ? '👑 Sieg' : '💀 Niederlage';
    $('end-text').textContent = (win
      ? (reason === 'monument' ? 'Dein Kronenmonument hat die Zeit überdauert. Die Krone gehört dir.' : 'Alle Gegner sind besiegt. Die Krone gehört dir.')
      : (reason === 'monument' ? 'Ein feindliches Monument hat die Zeit überdauert.' : 'Dein Reich ist gefallen.')) + ` Spielzeit ${fmtTime(g.time)}.`;
    const ps = g.players, st = p => p.stats;
    const ageAt = (p, a) => (st(p).ageT && st(p).ageT[a] ? fmtTime(st(p).ageT[a]) : 'nie');
    const rows = [
      ['Zeitalter', p => AGES[p.age].name],
      ['Brennofenzeit', p => ageAt(p, 1)], ['Bronzezeit', p => ageAt(p, 2)], ['Kronenzeit', p => ageAt(p, 3)],
      ['🌾 Nahrung', p => (st(p).res || {}).food || 0], ['🪵 Holz', p => (st(p).res || {}).wood || 0],
      ['🪙 Gold', p => (st(p).res || {}).gold || 0], ['🧱 Lehm', p => (st(p).res || {}).clay || 0],
      ['Gesammelt gesamt', p => st(p).gathered],
      ['Höchste Bevölkerung', p => st(p).peakPop || 0],
      ['Einheiten ausgebildet', p => st(p).trained], ['Gegner getötet', p => st(p).killed], ['Einheiten verloren', p => st(p).lost],
      ['Gebäude errichtet', p => st(p).built], ['Gebäude zerstört', p => st(p).bKilled || 0], ['Gebäude verloren', p => st(p).bLost || 0],
      ['Forschungen', p => st(p).techs || 0], ['Geheilt (Lebenspunkte)', p => Math.round(st(p).healed || 0)],
    ];
    const head = `<tr><th></th>${ps.map(p => `<th style="color:${p.color}">${p.name}</th>`).join('')}</tr>`;
    rows.push(['Handelsgeschäfte', p => st(p).traded || 0]);
    $('end-stats').innerHTML = head + rows.map(([n, f]) => `<tr><td class="lbl">${n}</td>${ps.map(p => `<td>${f(p)}</td>`).join('')}</tr>`).join('');
    this.endTab = this.endTab || 0;
    const tabs = $('end-tabs');
    tabs.querySelectorAll('button').forEach((b, i) => {
      b.classList.toggle('on', i === this.endTab);
      b.onclick = () => { this.endTab = i; tabs.querySelectorAll('button').forEach((x, j) => x.classList.toggle('on', j === i)); this.drawChart(); };
    });
    $('end').classList.remove('hidden');
    this.drawChart();
  }

  // Verlaufsgrafik: Bevölkerung, Armeewert oder gesammelte Rohstoffe über die Zeit
  drawChart() {
    const g = this.app.g, cv = $('end-chart'), h = g.history || [];
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth || 320, H = cv.clientHeight || 160;
    cv.width = W * dpr; cv.height = H * dpr;
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const k = this.endTab || 0;
    const army = g.players.map(() => 0);
    for (const e of g.ents.values()) if (e.cls === 'u' && e.type !== 'worker') army[e.owner] += Object.values(UNITS[e.type].cost).reduce((x, y) => x + y, 0);
    const pts = h.concat([{ t: Math.round(g.time), p: g.players.map((p, i) => [p.pop, army[i], p.stats.gathered]) }]);
    let max = 1;
    for (const s of pts) for (const v of s.p) max = Math.max(max, v[k]);
    const T = Math.max(60, pts[pts.length - 1].t), L = 38, B = 18, R = 8, Tp = 8;
    c.strokeStyle = 'rgba(255,255,255,0.12)'; c.fillStyle = 'rgba(246,234,214,0.6)'; c.font = '10px sans-serif'; c.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = Tp + (H - Tp - B) * (1 - i / 4);
      c.beginPath(); c.moveTo(L, y); c.lineTo(W - R, y); c.stroke();
      c.textAlign = 'right'; c.fillText(String(Math.round(max * i / 4)), L - 4, y + 3);
    }
    c.textAlign = 'center';
    const step = T > 2400 ? 600 : T > 900 ? 300 : 120;
    for (let t = 0; t <= T; t += step) c.fillText(`${Math.round(t / 60)}m`, L + (W - L - R) * t / T, H - 4);
    g.players.forEach((p, i) => {
      c.strokeStyle = p.color; c.lineWidth = i === 0 ? 2.5 : 1.8; c.beginPath();
      pts.forEach((s, j) => {
        const x = L + (W - L - R) * s.t / T, y = Tp + (H - Tp - B) * (1 - (s.p[i] ? s.p[i][k] : 0) / max);
        if (j) c.lineTo(x, y); else c.moveTo(x, y);
      });
      c.stroke();
    });
  }
}

export { RES_KIND };
