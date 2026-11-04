// Claycrown: Spieldaten (Einheiten, Gebäude, Technologien, Zeitalter)

export const SIM_DT = 0.05;          // feste Simulationsschrittweite in Sekunden
export const MAX_POP = 125;
export const MONUMENT_TIME = 180;    // Sekunden bis zum Monumentsieg
export const RES = ['food', 'wood', 'gold', 'clay'];

export const RES_INFO = {
  food: { name: 'Nahrung', icon: '🌾' },
  wood: { name: 'Holz', icon: '🪵' },
  gold: { name: 'Gold', icon: '🪙' },
  clay: { name: 'Lehm', icon: '🧱' },
};

export const PLAYER_COLORS = ['#3b82f6', '#e5483b', '#e8b923', '#a259e0'];
export const PLAYER_NAMES = ['Du', 'Haus Rotfels', 'Haus Sonnenkorn', 'Haus Veilchengrund'];

export const AGES = [
  { name: 'Lehmzeit', short: 'I' },
  { name: 'Brennofenzeit', short: 'II' },
  { name: 'Bronzezeit', short: 'III' },
  { name: 'Kronenzeit', short: 'IV' },
];

// cls: worker | inf | arch | cav | siege
export const UNITS = {
  worker: {
    name: 'Arbeiter', icon: '👷', hp: 25, atk: 3, range: 0, rof: 1.5, speed: 2.1, sight: 5,
    ma: 0, pa: 0, cls: 'worker', r: 0.28, cost: { food: 50 }, time: 10, age: 0,
    desc: 'Sammelt Rohstoffe und errichtet Gebäude.',
  },
  spear: {
    name: 'Speerträger', icon: '🔱', hp: 50, atk: 4, range: 0, rof: 1.6, speed: 2.0, sight: 5,
    ma: 0, pa: 0, cls: 'inf', r: 0.3, bonus: { cav: 9, siege: 4 }, cost: { food: 35, wood: 25 }, time: 11, age: 0,
    desc: 'Günstige Infanterie. Stark gegen Reiter.',
  },
  sword: {
    name: 'Schwertkämpfer', icon: '⚔️', hp: 75, atk: 9, range: 0, rof: 1.8, speed: 1.8, sight: 5,
    ma: 1, pa: 1, cls: 'inf', r: 0.3, bonus: { bld: 2 }, cost: { food: 60, gold: 20 }, time: 13, age: 1,
    desc: 'Robuste Nahkampfinfanterie.',
  },
  archer: {
    name: 'Bogenschütze', icon: '🏹', hp: 35, atk: 4, range: 5, rof: 2.0, speed: 1.9, sight: 7,
    ma: 0, pa: 0, cls: 'arch', r: 0.28, proj: true, bonus: { inf: 2 }, cost: { wood: 25, gold: 40 }, time: 13, age: 1,
    desc: 'Fernkampf. Stark gegen Infanterie.',
  },
  rider: {
    name: 'Reiter', icon: '🐎', hp: 110, atk: 7, range: 0, rof: 1.9, speed: 3.2, sight: 6,
    ma: 1, pa: 2, cls: 'cav', r: 0.42, bonus: { arch: 6, siege: 8 }, cost: { food: 70, gold: 70 }, time: 17, age: 1,
    desc: 'Schnell. Stark gegen Bogenschützen und Belagerung.',
  },
  ram: {
    name: 'Rammbock', icon: '🐏', hp: 220, atk: 2, range: 0, rof: 3.0, speed: 1.1, sight: 4,
    ma: 0, pa: 20, cls: 'siege', r: 0.55, siege: true, bonus: { bld: 50 }, cost: { wood: 160, gold: 75 }, time: 25, age: 2,
    desc: 'Zerstört Gebäude. Greift keine Einheiten an.',
  },
  treb: {
    name: 'Tribok', icon: '☄️', hp: 150, atk: 2, range: 11, rof: 6.0, speed: 0.8, sight: 9,
    ma: 0, pa: 8, cls: 'siege', r: 0.6, siege: true, proj: true, stone: true, bonus: { bld: 95 }, cost: { wood: 200, gold: 200 }, time: 35, age: 2,
    desc: 'Schleudert Steine auf Gebäude aus großer Entfernung. Wehrlos gegen Einheiten.',
  },
  priest: {
    name: 'Priester', icon: '🙏', hp: 30, atk: 0, range: 0, rof: 1, speed: 1.7, sight: 7,
    ma: 0, pa: 0, cls: 'priest', r: 0.28, heal: 2.5, healRange: 4, cost: { gold: 100 }, time: 25, age: 1,
    desc: 'Heilt verletzte eigene Einheiten und Arbeiter in der Nähe. Kämpft nicht.',
  },
  golem: {
    name: 'Tonkoloss', icon: '🗿', hp: 320, atk: 16, range: 0, rof: 2.2, speed: 1.5, sight: 6,
    ma: 3, pa: 4, cls: 'inf', r: 0.5, bonus: { bld: 10 }, cost: { food: 120, gold: 100, clay: 100 }, time: 28, age: 3,
    desc: 'Gebrannter Riese aus Lehm. Die Elite der Kronenzeit.',
  },
};

export const BUILDINGS = {
  keep: {
    name: 'Burg', icon: '🏰', w: 4, h: 4, hp: 2000, ma: 3, pa: 8, cost: { wood: 275, clay: 100 }, time: 90, age: 1,
    pop: 5, drop: ['food', 'wood', 'gold', 'clay'], trains: ['worker'],
    techs: ['age1', 'age2', 'age3', 'wheelbarrow', 'masonry'], atk: 5, range: 6, rof: 2, sight: 8, cat: 'eco',
    desc: 'Herz deines Reiches. Bildet Arbeiter aus und führt in neue Zeitalter.',
  },
  house: {
    name: 'Haus', icon: '🏠', w: 2, h: 2, hp: 550, cost: { wood: 30 }, time: 18, age: 0, pop: 5, sight: 3, cat: 'eco',
    desc: 'Plus 5 Bevölkerung.',
  },
  farm: {
    name: 'Feld', icon: '🌱', w: 3, h: 3, hp: 200, cost: { wood: 60 }, time: 14, age: 0, walk: true, food: 300,
    req: 'mill', sight: 2, cat: 'eco', ma: 0, pa: 0,
    desc: 'Liefert 300 Nahrung. Wird automatisch neu gesät, wenn Holz vorhanden ist.',
  },
  mill: {
    name: 'Mühle', icon: '🥖', w: 2, h: 2, hp: 600, cost: { wood: 100 }, time: 24, age: 0, drop: ['food'],
    techs: ['plow'], sight: 4, cat: 'eco', desc: 'Abgabeort für Nahrung. Ermöglicht Felder.',
  },
  lumber: {
    name: 'Holzlager', icon: '🪓', w: 2, h: 2, hp: 600, cost: { wood: 100 }, time: 24, age: 0, drop: ['wood'],
    techs: ['axe'], sight: 4, cat: 'eco', desc: 'Abgabeort für Holz.',
  },
  mine: {
    name: 'Grubenlager', icon: '⛏️', w: 2, h: 2, hp: 600, cost: { wood: 100 }, time: 24, age: 0, drop: ['gold', 'clay'],
    techs: ['pick'], sight: 4, cat: 'eco', desc: 'Abgabeort für Gold und Lehm.',
  },
  barracks: {
    name: 'Kaserne', icon: '🛡️', w: 3, h: 3, hp: 1200, cost: { wood: 150 }, time: 40, age: 0,
    trains: ['spear', 'sword', 'golem'], sight: 4, cat: 'mil', desc: 'Bildet Infanterie aus.',
  },
  range: {
    name: 'Schießstand', icon: '🎯', w: 3, h: 3, hp: 1100, cost: { wood: 175 }, time: 40, age: 1, req: 'barracks',
    trains: ['archer'], sight: 4, cat: 'mil', desc: 'Bildet Bogenschützen aus.',
  },
  stable: {
    name: 'Stall', icon: '🐴', w: 3, h: 3, hp: 1100, cost: { wood: 175 }, time: 40, age: 1, req: 'barracks',
    trains: ['rider'], sight: 4, cat: 'mil', desc: 'Bildet Reiter aus.',
  },
  forge: {
    name: 'Schmiede', icon: '🔨', w: 3, h: 3, hp: 1000, cost: { wood: 150 }, time: 40, age: 1,
    techs: ['blades', 'arrows', 'armor'], sight: 4, cat: 'mil', desc: 'Erforscht Waffen und Rüstungen.',
  },
  temple: {
    name: 'Tempel', icon: '⛪', w: 3, h: 3, hp: 1200, cost: { wood: 175, clay: 75 }, time: 45, age: 1,
    trains: ['priest'], techs: ['herbs'], sight: 5, cat: 'mil', desc: 'Bildet Priester aus, die verletzte Einheiten heilen.',
  },
  tower: {
    name: 'Wachturm', icon: '🗼', w: 2, h: 2, hp: 1000, ma: 2, pa: 8, cost: { wood: 25, clay: 125 }, time: 45, age: 1,
    atk: 6, range: 7, rof: 2, sight: 9, cat: 'mil', desc: 'Beschießt Feinde in Reichweite.',
  },
  workshop: {
    name: 'Werkstatt', icon: '🛠️', w: 3, h: 3, hp: 1100, cost: { wood: 200 }, time: 45, age: 2, req: 'forge',
    trains: ['ram', 'treb'], sight: 4, cat: 'mil', desc: 'Baut Rammböcke und Triboks.',
  },
  monument: {
    name: 'Kronenmonument', icon: '👑', w: 5, h: 5, hp: 4000, ma: 3, pa: 10,
    cost: { wood: 1000, gold: 1000, clay: 1000 }, time: 240, age: 3, sight: 6, cat: 'eco',
    desc: 'Steht es 3 Minuten fertig, gewinnt sein Erbauer das Spiel.',
  },
};

export const ECO_BUILD = ['house', 'farm', 'mill', 'lumber', 'mine', 'keep', 'monument'];
export const MIL_BUILD = ['barracks', 'range', 'stable', 'forge', 'temple', 'tower', 'workshop'];

export const TECHS = {
  age1: { name: 'Brennofenzeit', icon: '🏺', cost: { food: 500 }, time: 45, age: 0, ageUp: 1, desc: 'Zweites Zeitalter: Bogenschützen, Reiter, Schmiede, Türme.' },
  age2: { name: 'Bronzezeit', icon: '🔔', cost: { food: 800, gold: 200 }, time: 60, age: 1, ageUp: 2, desc: 'Drittes Zeitalter: Rammböcke, Triboks und Ziegelbau.' },
  age3: { name: 'Kronenzeit', icon: '👑', cost: { food: 1000, gold: 600, clay: 200 }, time: 75, age: 2, ageUp: 3, desc: 'Viertes Zeitalter: Tonkoloss und Kronenmonument.' },
  wheelbarrow: { name: 'Schubkarre', icon: '🛒', cost: { food: 150, wood: 50 }, time: 30, age: 1, desc: 'Arbeiter tragen 5 mehr und laufen 10 % schneller.' },
  axe: { name: 'Doppelaxt', icon: '🪓', cost: { food: 100, wood: 50 }, time: 25, age: 0, desc: 'Holzfällen 20 % schneller.' },
  plow: { name: 'Schwerer Pflug', icon: '🐂', cost: { food: 125, wood: 100 }, time: 30, age: 1, desc: 'Feldarbeit 20 % schneller.' },
  pick: { name: 'Spitzhacke', icon: '⛏️', cost: { food: 100, wood: 75 }, time: 25, age: 0, desc: 'Gold und Lehm 20 % schneller.' },
  blades: { name: 'Gehärtete Klingen', icon: '🗡️', cost: { food: 150, gold: 60 }, time: 35, age: 1, desc: 'Nahkampfeinheiten plus 2 Angriff.' },
  arrows: { name: 'Befiederte Pfeile', icon: '🪶', cost: { food: 100, gold: 60 }, time: 35, age: 1, desc: 'Bogenschützen, Türme und Burgen plus 1 Angriff und plus 1 Reichweite.' },
  armor: { name: 'Gebrannte Rüstung', icon: '🥋', cost: { food: 150, clay: 80 }, time: 35, age: 1, desc: 'Militär plus 1 Nahkampf und plus 1 Fernkampfrüstung.' },
  herbs: { name: 'Heilkräuter', icon: '🌿', cost: { food: 100, gold: 120 }, time: 30, age: 1, desc: 'Priester heilen 50 % schneller und mit plus 2 Reichweite.' },
  masonry: { name: 'Ziegelbau', icon: '🧱', cost: { wood: 150, clay: 150 }, time: 40, age: 2, desc: 'Alle Gebäude plus 30 % Trefferpunkte.' },
};
