// Erzeugt die App Icons per Canvas in Chromium
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [name, size, pad] of [['icon-180', 180, 0], ['icon-192', 192, 0], ['icon-512', 512, 0], ['icon-maskable-512', 512, 0.12]]) {
    const data = await p.evaluate(([size, pad]) => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(size * 0.5, size * 0.35, size * 0.05, size * 0.5, size * 0.5, size * 0.75);
      g.addColorStop(0, '#d9884a'); g.addColorStop(0.6, '#9a5328'); g.addColorStop(1, '#4a2410');
      x.fillStyle = g; x.fillRect(0, 0, size, size);
      x.save(); x.translate(size / 2, size / 2); const k = size * (1 - pad * 2) / 512; x.scale(k, k); x.translate(-256, -256);
      // Lehmhügel
      x.fillStyle = '#6b3a1c'; x.beginPath(); x.ellipse(256, 430, 210, 60, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#b8683a'; x.beginPath(); x.ellipse(256, 418, 190, 46, 0, 0, Math.PI * 2); x.fill();
      // Krone
      x.fillStyle = '#f5c518'; x.strokeStyle = '#7a5208'; x.lineWidth = 14; x.lineJoin = 'round';
      x.beginPath();
      x.moveTo(110, 360); x.lineTo(90, 170); x.lineTo(180, 260); x.lineTo(256, 120); x.lineTo(332, 260); x.lineTo(422, 170); x.lineTo(402, 360); x.closePath();
      x.fill(); x.stroke();
      x.fillStyle = '#e0a810'; x.fillRect(110, 330, 292, 40); x.strokeRect(110, 330, 292, 40);
      for (const [cx, cy, col] of [[256, 300, '#d43c2c'], [180, 305, '#3b82f6'], [332, 305, '#3b82f6']]) { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, 20, 0, 7); x.fill(); x.stroke(); }
      for (const [cx, cy] of [[90, 170], [256, 120], [422, 170]]) { x.fillStyle = '#fff3b0'; x.beginPath(); x.arc(cx, cy, 16, 0, 7); x.fill(); x.stroke(); }
      x.restore();
      return c.toDataURL('image/png');
    }, [size, pad]);
    fs.writeFileSync(path.join(__dirname, '..', 'icons', name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
  }
  await b.close();
})();
