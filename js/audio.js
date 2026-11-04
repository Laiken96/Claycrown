// Claycrown: synthetische Klänge über WebAudio (keine Audiodateien nötig)
export class Sound {
  constructor() { this.ctx = null; this.on = true; this.last = {}; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.35; this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    // iOS: stummer Puffer schaltet Audio frei
    const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource();
    s.buffer = b; s.connect(this.master); s.start(0);
  }

  tone(freq, dur, type = 'sine', vol = 0.5, slide = 0, delay = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur, vol = 0.3, freq = 1200) {
    if (!this.on || !this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * dur), b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
  }

  play(name) {
    const now = performance.now();
    const gap = { hit: 90, shoot: 120, death: 150 }[name] || 40;
    if (this.last[name] && now - this.last[name] < gap) return;
    this.last[name] = now;
    switch (name) {
      case 'select': this.tone(660, 0.07, 'triangle', 0.25); break;
      case 'command': this.tone(520, 0.06, 'square', 0.12); this.tone(780, 0.07, 'square', 0.1, 0, 0.05); break;
      case 'error': this.tone(180, 0.18, 'sawtooth', 0.15, 0.7); break;
      case 'place': this.noise(0.12, 0.4, 400); this.tone(220, 0.12, 'triangle', 0.3); break;
      case 'built': [523, 659, 784].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.25, 0, i * 0.09)); break;
      case 'trained': this.tone(440, 0.08, 'triangle', 0.2); this.tone(660, 0.1, 'triangle', 0.2, 0, 0.07); break;
      case 'hit': this.noise(0.06, 0.25, 2400); break;
      case 'shoot': this.noise(0.08, 0.15, 3800); break;
      case 'death': this.tone(300, 0.25, 'sawtooth', 0.12, 0.4); break;
      case 'alarm': [0, 0.22, 0.44].forEach(d => this.tone(880, 0.16, 'square', 0.18, 0.8, d)); break;
      case 'age': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.28, 0, i * 0.12)); break;
      case 'tech': this.tone(700, 0.12, 'sine', 0.3); this.tone(1050, 0.18, 'sine', 0.25, 0, 0.1); break;
      case 'win': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.3, 0, i * 0.15)); break;
      case 'lose': [440, 392, 330, 262].forEach((f, i) => this.tone(f, 0.5, 'sawtooth', 0.15, 0, i * 0.22)); break;
      case 'destroyed': this.noise(0.5, 0.5, 300); break;
      case 'trade': this.tone(1200, 0.06, 'triangle', 0.2); this.tone(1600, 0.09, 'triangle', 0.18, 0, 0.06); break;
    }
  }
}
