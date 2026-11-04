// Headless Test: alle Spieler werden von der KI gesteuert
import { Game } from '../js/world.js';
import { AI } from '../js/ai.js';
import { SIM_DT } from '../js/data.js';

const minutes = Number(process.argv[2] || 25);
const diff = process.argv[3] || 'normal';
const g = Game.create({ size: 96, ais: 1, difficulty: diff, seed: Number(process.argv[4] || 12345) });
g.players[0].ai = {};
const ais = g.players.map((p, i) => new AI(g, i));
const t0 = Date.now();
let last = 0;
const steps = Math.round(minutes * 60 / SIM_DT);
for (let s = 0; s < steps && !g.over; s++) {
  g.tick();
  for (const a of ais) a.update(SIM_DT);
  g.events.length = 0;
  if (g.time - last >= 120) {
    last = g.time;
    const line = g.players.map(p => {
      const c = {};
      for (const e of g.ents.values()) if (e.owner === p.id && e.cls !== 'r') c[e.type] = (c[e.type] || 0) + 1;
      return `P${p.id} age${p.age} pop${p.pop}/${p.popCap} res ${Object.entries(p.res).map(([k, v]) => k[0] + Math.floor(v)).join(',')} ${JSON.stringify(c)} k${p.stats.killed} l${p.stats.lost} att${p.ai && p.ai.attacking ? 1 : 0}`;
    }).join('\n   ');
    console.log(`t=${(g.time / 60).toFixed(1)}m\n   ${line}`);
  }
}
console.log('over', g.over, 'winner', g.winner, 'spielzeit', (g.time / 60).toFixed(1) + ' min', 'sim ms', Date.now() - t0, 'ents', g.ents.size);
