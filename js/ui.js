// Claycrown: HUD, Auswahlinfo und Befehlsleiste
import { UNITS, BUILDINGS, TECHS, AGES, ECO_BUILD, MIL_BUILD, RES } from './data.js';
import { RES_KIND } from './world.js';
import { costText, fmtTime } from './util.js';

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
        let atk = d.atk + (!d.proj && d.cls !== 'worker' && d.cls !== 'siege' && p.techs.blades ? 2 : 0) + (d.proj && p.techs.arrows ? 1 : 0);
        const arm = d.cls !== 'worker' && p.techs.armor ? 1 : 0;
        html += `<span>⚔ ${atk}</span><span>🛡 ${d.ma + arm}/${d.pa + arm}</span>`;
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
        if (d.pop && e.done) html += `<span>👥 +${d.pop}</span>`;
        if (e.type === 'monument' && e.done) html += `<span>👑 ${fmtTime(Math.max(0, 180 - e.mt))}</span>`;
        const qb = el.querySelectorAll('.queue .qp');
        if (e.queue && qb.length) {
          const q = e.queue[0];
          const tt = q.k === 'u' ? UNITS[q.key].time : TECHS[q.key].time;
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
        const types = this.page === 'eco' ? ECO_BUILD : MIL_BUILD;
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
        list.push({ key: 'page', icon: this.page === 'eco' ? '⚔️' : '🏠', label: this.page === 'eco' ? 'Militär' : 'Wirtschaft', run: () => { this.page = this.page === 'eco' ? 'mil' : 'eco'; this.cmdSig = ''; } });
      }
      if (units.some(u => u.type !== 'worker')) {
        list.push({ key: 'amove', icon: '🗡️', label: 'Angriff', active: app.mode && app.mode.k === 'amove', hint: 'Angriffsbewegung: Ziel antippen. Einheiten kämpfen unterwegs gegen alles.', run: () => app.setMode({ k: 'amove' }) });
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
      const locked = p.age < t.age;
      list.push({
        key: 't:' + k + researching, icon: t.icon, label: researching ? '⏳' : locked ? '🔒 ' + AGES[t.age].short : costText(t.cost),
        locked: locked || researching, poor: !g.canAfford(p, t.cost), hint: `${t.name}: ${t.desc} Kosten ${costText(t.cost)}`,
        run: () => app.researchSel(k),
      });
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
    $('end-text').textContent = win
      ? (reason === 'monument' ? 'Dein Kronenmonument hat die Zeit überdauert. Die Krone gehört dir.' : 'Alle Gegner sind besiegt. Die Krone gehört dir.')
      : (reason === 'monument' ? 'Ein feindliches Monument hat die Zeit überdauert.' : 'Dein Reich ist gefallen.');
    const rows = [['Reich', 'Zeitalter', 'Gesammelt', 'Ausgebildet', 'Getötet', 'Verloren']];
    for (const p of g.players) rows.push([p.name, AGES[p.age].name, p.stats.gathered, p.stats.trained, p.stats.killed, p.stats.lost]);
    $('end-stats').innerHTML = rows.map((r, i) => `<tr>${r.map(c => i ? `<td>${c}</td>` : `<th>${c}</th>`).join('')}</tr>`).join('') + `<tr><td colspan="6">Spielzeit ${fmtTime(g.time)}</td></tr>`;
    $('end').classList.remove('hidden');
  }
}

export { RES_KIND };
