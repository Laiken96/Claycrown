// Claycrown: Eingabe für Touch, Maus und Tastatur
export class Input {
  constructor(canvas, minimap, app) {
    this.cv = canvas; this.mm = minimap; this.app = app;
    this.ptrs = new Map();
    this.mode = null; // pan | box | pinch | ghost | mbox
    this.keys = new Set();
    this.lastTap = { t: 0, x: 0, y: 0 };
    this.mouse = null;
    this.vel = { x: 0, y: 0 };
    this.lastType = 'touch';
    window.addEventListener('pointerdown', e => { this.lastType = e.pointerType; }, true);
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup', e => this.up(e));
    canvas.addEventListener('pointercancel', e => this.cancel(e));
    canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') this.mouse = null; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.app.r.zoomAt(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY); }, { passive: false });
    const mmHandler = e => {
      e.preventDefault();
      const r = minimap.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      if (e.type === 'pointerdown') minimap.setPointerCapture(e.pointerId);
      if (e.type === 'pointerdown' || e.buttons) this.app.minimapJump(fx, fy, e.button === 2);
    };
    minimap.addEventListener('pointerdown', mmHandler);
    minimap.addEventListener('pointermove', mmHandler);
    minimap.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => this.key(e, true));
    window.addEventListener('keyup', e => this.key(e, false));
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('gesturechange', e => e.preventDefault());
    document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  }

  pos(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  down(e) {
    e.preventDefault();
    this.app.sound.unlock();
    this.cv.setPointerCapture(e.pointerId);
    const p = this.pos(e);
    const isMouse = e.pointerType === 'mouse';
    this.ptrs.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), btn: e.button, mouse: isMouse });
    this.vel.x = this.vel.y = 0;
    clearTimeout(this.lpTimer);
    if (this.ptrs.size === 2) {
      const [a, b] = [...this.ptrs.values()];
      this.mode = 'pinch';
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      this.app.setBox(null);
      return;
    }
    if (this.ptrs.size > 2) return;
    this.mode = null;
    if (isMouse) {
      if (e.button === 1) this.mode = 'pan';
      return;
    }
    // Touch: Bauvorschau verschieben, wenn auf ihr gestartet
    if (this.app.ghostHit(p.x, p.y)) { this.mode = 'ghost'; this.ghostOff = this.app.ghostOffset(p.x, p.y); return; }
    this.lpTimer = setTimeout(() => {
      const pt = this.ptrs.get(e.pointerId);
      if (pt && !this.mode && Math.hypot(pt.x - pt.sx, pt.y - pt.sy) < 12) {
        this.mode = 'box';
        if (navigator.vibrate) navigator.vibrate(15);
        this.app.setBox({ x0: pt.sx, y0: pt.sy, x1: pt.x, y1: pt.y });
      }
    }, 380);
  }

  move(e) {
    const p = this.pos(e);
    if (e.pointerType === 'mouse') this.mouse = p;
    const pt = this.ptrs.get(e.pointerId);
    if (!pt) { if (e.pointerType === 'mouse') this.app.hover(p.x, p.y); return; }
    e.preventDefault();
    const dx = p.x - pt.x, dy = p.y - pt.y;
    pt.x = p.x; pt.y = p.y;
    const moved = Math.hypot(pt.x - pt.sx, pt.y - pt.sy);
    if (this.mode === 'pinch' && this.ptrs.size >= 2) {
      const [a, b] = [...this.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const r = this.app.r, s = r.scale;
      r.cam.x -= (cx - this.pinch.cx) / s; r.cam.y -= (cy - this.pinch.cy) / s;
      if (this.pinch.d > 10) r.zoomAt(d / this.pinch.d, cx, cy);
      r.clampCam();
      this.pinch = { d, cx, cy };
      return;
    }
    if (pt.mouse) {
      if (this.mode === 'pan') { this.app.pan(dx, dy); return; }
      if (pt.btn === 0 && moved > 6 && !this.app.placing()) { this.mode = 'mbox'; this.app.setBox({ x0: pt.sx, y0: pt.sy, x1: pt.x, y1: pt.y }); }
      if (this.mode === 'mbox') this.app.setBox({ x0: pt.sx, y0: pt.sy, x1: pt.x, y1: pt.y });
      this.app.hover(p.x, p.y);
      return;
    }
    if (this.mode === 'ghost') { this.app.moveGhost(p.x - this.ghostOff.x, p.y - this.ghostOff.y); return; }
    if (this.mode === 'box') { this.app.setBox({ x0: pt.sx, y0: pt.sy, x1: pt.x, y1: pt.y }); return; }
    if (!this.mode && moved > 10) { this.mode = 'pan'; clearTimeout(this.lpTimer); }
    if (this.mode === 'pan') {
      this.app.pan(dx, dy);
      const now = performance.now(), dtm = Math.max(1, now - (pt.lt || now - 16));
      pt.lt = now;
      this.vel.x = this.vel.x * 0.6 + (dx / dtm) * 16 * 0.4; this.vel.y = this.vel.y * 0.6 + (dy / dtm) * 16 * 0.4;
    }
  }

  up(e) {
    const pt = this.ptrs.get(e.pointerId);
    if (!pt) return;
    e.preventDefault();
    clearTimeout(this.lpTimer);
    this.ptrs.delete(e.pointerId);
    const p = this.pos(e);
    if (this.mode === 'pinch') { if (this.ptrs.size === 0) this.mode = null; else { const rest = [...this.ptrs.values()][0]; rest.sx = rest.x; rest.sy = rest.y; this.mode = 'pinchrest'; } return; }
    if (this.mode === 'pinchrest') { this.mode = null; return; }
    if (this.mode === 'box' || this.mode === 'mbox') {
      this.app.boxSelect(pt.sx, pt.sy, p.x, p.y, e.shiftKey);
      this.app.setBox(null); this.mode = null; return;
    }
    if (this.mode === 'pan') { this.mode = null; if (!pt.mouse) this.inertia = true; return; }
    if (this.mode === 'ghost') { this.mode = null; return; }
    this.mode = null;
    // Tippen oder Klicken
    if (pt.mouse) {
      if (pt.btn === 2) this.app.rightClick(p.x, p.y, e.shiftKey);
      else if (pt.btn === 0) {
        const now = performance.now();
        const dbl = now - this.lastTap.t < 320 && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < 20;
        this.lastTap = { t: dbl ? 0 : now, x: p.x, y: p.y };
        this.app.click(p.x, p.y, { dbl, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
      }
      return;
    }
    const now = performance.now();
    const dbl = now - this.lastTap.t < 330 && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < 30;
    this.lastTap = { t: dbl ? 0 : now, x: p.x, y: p.y };
    this.app.tap(p.x, p.y, { dbl });
  }

  cancel(e) { clearTimeout(this.lpTimer); this.ptrs.delete(e.pointerId); this.mode = null; this.app.setBox(null); }

  key(e, down) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (down) this.keys.add(k); else this.keys.delete(k);
    if (!down) return;
    this.app.hotkey(k, e);
  }

  update(dt) {
    const r = this.app.r;
    let dx = 0, dy = 0;
    const k = this.keys, sp = 900 * dt;
    if (k.has('a') || k.has('arrowleft')) dx += sp;
    if (k.has('d') || k.has('arrowright')) dx -= sp;
    if (k.has('w') || k.has('arrowup')) dy += sp;
    if (k.has('s') || k.has('arrowdown')) dy -= sp;
    if (this.mouse && document.hasFocus() && this.app.edgeScroll) {
      const m = 8;
      if (this.mouse.x < m) dx += sp; else if (this.mouse.x > r.w - m) dx -= sp;
      if (this.mouse.y < m) dy += sp; else if (this.mouse.y > r.h - m) dy -= sp;
    }
    if (dx || dy) this.app.pan(dx, dy);
    if (this.inertia && this.ptrs.size === 0) {
      this.app.pan(this.vel.x, this.vel.y);
      this.vel.x *= 0.9; this.vel.y *= 0.9;
      if (Math.abs(this.vel.x) < 0.3 && Math.abs(this.vel.y) < 0.3) this.inertia = false;
    }
  }
}
