'use strict';
/* Skins de peças (apenas visual — nunca afeta regras) + utilitários de cor com cache. */
const _shadeCache = new Map();
function shade(hex, f) {
  const key = hex + '|' + f;
  let v = _shadeCache.get(key);
  if (v !== undefined) return v;
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  v = 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  if (_shadeCache.size > 2000) _shadeCache.clear();
  _shadeCache.set(key, v);
  return v;
}
const Skins = {
  list: [['classic', 'Clássica'], ['flat', 'Plana'], ['neon', 'Neon'], ['gradient', 'Gradiente']],
  ids() { return this.list.map((x) => x[0]); },
  valid(id) { return this.ids().includes(id); },
  cur() { return typeof settings !== 'undefined' && this.valid(settings.skin) ? settings.skin : 'classic'; },
  _poly(c, pts) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fill(); },
  _rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); },
  draw(c, x, y, s, color, alpha, id) {
    c.globalAlpha = alpha == null ? 1 : alpha;
    const k = id || this.cur();
    if (k === 'flat') {
      const lw = Math.max(1, s * 0.07);
      c.fillStyle = color; c.fillRect(x, y, s, s);
      c.fillStyle = shade(color, 0.3); c.fillRect(x, y, s, Math.max(1, s * 0.16));
      c.strokeStyle = shade(color, -0.45); c.lineWidth = lw; c.strokeRect(x + lw / 2, y + lw / 2, s - lw, s - lw);
    } else if (k === 'neon') {
      const lw = Math.max(1.5, s * 0.12);
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(x, y, s, s);
      c.save(); c.shadowColor = color; c.shadowBlur = s * 0.3;
      c.strokeStyle = color; c.lineWidth = lw; c.strokeRect(x + lw, y + lw, s - 2 * lw, s - 2 * lw); c.restore();
      c.globalAlpha = (alpha == null ? 1 : alpha) * 0.3; c.fillStyle = color; c.fillRect(x + lw, y + lw, s - 2 * lw, s - 2 * lw);
    } else if (k === 'gradient') {
      const g = c.createLinearGradient(0, y, 0, y + s); g.addColorStop(0, shade(color, 0.4)); g.addColorStop(1, shade(color, -0.3));
      c.fillStyle = g; this._rr(c, x + 0.5, y + 0.5, s - 1, s - 1, s * 0.2); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 1; c.stroke();
    } else {                                           // classic (aparência original)
      const b = Math.max(2, s * 0.15);
      c.fillStyle = color; c.fillRect(x, y, s, s);
      c.fillStyle = shade(color, .5); this._poly(c, [x, y, x + s, y, x + s - b, y + b, x + b, y + b]);
      c.fillStyle = shade(color, .25); this._poly(c, [x, y, x + b, y + b, x + b, y + s - b, x, y + s]);
      c.fillStyle = shade(color, -.28); this._poly(c, [x + s, y, x + s, y + s, x + s - b, y + s - b, x + s - b, y + b]);
      c.fillStyle = shade(color, -.5); this._poly(c, [x, y + s, x + b, y + s - b, x + s - b, y + s - b, x + s, y + s]);
      c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 1; c.strokeRect(x + .5, y + .5, s - 1, s - 1);
    }
    c.globalAlpha = 1;
  },
};
function openSkins() {
  Sheet.push('Skins das peças', (b) => {
    b.appendChild(h('div', { class: 'hint', text: 'Muda só a aparência dos blocos. As regras e as cores do tema não mudam.' }));
    Skins.list.forEach(([id, name]) => {
      const cv = h('canvas', { width: '196', height: '28' });
      const c = cv.getContext('2d');
      'IJLOSTZ'.split('').forEach((t, i) => Skins.draw(c, 4 + i * 27, 2, 24, COLORS[t], 1, id));
      b.appendChild(h('div', { class: 'skinrow' + (settings.skin === id ? ' sel' : ''), onclick: () => { sfx.click(); settings.skin = id; saveSettings(); Sheet.refresh(); } },
        h('div', { class: 'kv' }, h('span', { text: name + (settings.skin === id ? ' ●' : '') })), cv));
    });
  });
}
Hub.add(55, 'Skins das peças', openSkins);
