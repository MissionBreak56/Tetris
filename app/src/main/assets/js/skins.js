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
  list: [['classic', 'Clássica'], ['flat', 'Plana'], ['neon', 'Neon'], ['gradient', 'Gradiente'], ['glass', 'Vidro'], ['pixel', 'Pixel'], ['outline', 'Contorno'], ['candy', 'Doce'], ['metal', 'Metal']],
  ids() { return this.list.map((x) => x[0]); },
  valid(id) { return this.ids().includes(id); },
  /** Skin liberada? (as 4 originais sempre; as novas com estrelas) */
  usable(id) { return this.valid(id) && Rewards.unlocked('skin:' + id); },
  cur() { return typeof settings !== 'undefined' && this.valid(settings.skin) ? settings.skin : 'classic'; },
  _poly(c, pts) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fill(); },
  _rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); },
  _sprites: new Map(),
  /** Bloco pré-renderizado (uma única drawImage por bloco no Canvas principal). Margem para o brilho do neon. */
  sprite(color, s, id) {
    const key = id + '|' + color + '|' + Math.round(s * 100) + (typeof Perf !== 'undefined' && Perf.save() ? 's' : '');
    let sp = this._sprites.get(key); if (sp) return sp;
    const d = typeof dpr === 'number' ? dpr : 1, m = Math.ceil(s * 0.3), w = s + 2 * m;
    const cv = document.createElement('canvas'); cv.width = cv.height = Math.max(1, Math.ceil(w * d));
    const c = cv.getContext('2d'); c.scale(d, d); this.raw(c, m, m, s, color, 1, id);
    if (this._sprites.size > 400) this._sprites.clear();
    sp = { cv, m, w: cv.width / d }; this._sprites.set(key, sp); return sp;
  },
  draw(c, x, y, s, color, alpha, id) {
    const k = id || this.cur();
    if (c.canvas && c.canvas.id === 'cv' && s >= 4) {              // canvas principal: usa sprite em cache
      const sp = this.sprite(color, s, k);
      c.globalAlpha = alpha == null ? 1 : alpha; c.drawImage(sp.cv, x - sp.m, y - sp.m, sp.w, sp.w); c.globalAlpha = 1; return;
    }
    this.raw(c, x, y, s, color, alpha, k);
  },
  raw(c, x, y, s, color, alpha, k) {
    c.globalAlpha = alpha == null ? 1 : alpha;
    if (k === 'flat') {
      const lw = Math.max(1, s * 0.07);
      c.fillStyle = color; c.fillRect(x, y, s, s);
      c.fillStyle = shade(color, 0.3); c.fillRect(x, y, s, Math.max(1, s * 0.16));
      c.strokeStyle = shade(color, -0.45); c.lineWidth = lw; c.strokeRect(x + lw / 2, y + lw / 2, s - lw, s - lw);
    } else if (k === 'neon') {
      const lw = Math.max(1.5, s * 0.12);
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(x, y, s, s);
      c.save(); c.shadowColor = color; c.shadowBlur = typeof Perf !== 'undefined' && Perf.save() ? 0 : s * 0.3;
      c.strokeStyle = color; c.lineWidth = lw; c.strokeRect(x + lw, y + lw, s - 2 * lw, s - 2 * lw); c.restore();
      c.globalAlpha = (alpha == null ? 1 : alpha) * 0.3; c.fillStyle = color; c.fillRect(x + lw, y + lw, s - 2 * lw, s - 2 * lw);
    } else if (k === 'glass') {
      const g = c.createLinearGradient(0, y, 0, y + s); g.addColorStop(0, shade(color, 0.55)); g.addColorStop(0.5, color); g.addColorStop(1, shade(color, -0.2));
      c.globalAlpha = (alpha == null ? 1 : alpha) * 0.62; c.fillStyle = g; this._rr(c, x + 0.5, y + 0.5, s - 1, s - 1, s * 0.16); c.fill();
      c.globalAlpha = alpha == null ? 1 : alpha; c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = Math.max(1, s * 0.07); this._rr(c, x + 0.5, y + 0.5, s - 1, s - 1, s * 0.16); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.35)'; this._rr(c, x + s * 0.14, y + s * 0.12, s * 0.72, s * 0.2, s * 0.08); c.fill();
    } else if (k === 'pixel') {
      const p = s / 3, e = Math.max(1, s * 0.06);
      c.fillStyle = shade(color, -0.55); c.fillRect(x, y, s, s);
      c.fillStyle = color; c.fillRect(x + e, y + e, s - 2 * e, s - 2 * e);
      c.fillStyle = shade(color, 0.45); c.fillRect(x + e, y + e, p, p); c.fillRect(x + e + p, y + e, p - e, p * 0.5); c.fillRect(x + e, y + e + p, p * 0.5, p - e);
      c.fillStyle = shade(color, -0.35); c.fillRect(x + s - e - p, y + s - e - p, p, p); c.fillRect(x + s - e - p * 2, y + s - e - p * 0.5, p, p * 0.5);
    } else if (k === 'outline') {
      const lw = Math.max(2, s * 0.15);
      c.fillStyle = shade(color, -0.78); c.fillRect(x, y, s, s);
      c.strokeStyle = color; c.lineWidth = lw; c.strokeRect(x + lw / 2, y + lw / 2, s - lw, s - lw);
      c.fillStyle = shade(color, -0.45); c.fillRect(x + lw * 1.6, y + lw * 1.6, s - lw * 3.2, s - lw * 3.2);
    } else if (k === 'candy') {
      const g = c.createRadialGradient(x + s * 0.35, y + s * 0.3, s * 0.05, x + s * 0.5, y + s * 0.5, s * 0.75); g.addColorStop(0, shade(color, 0.7)); g.addColorStop(0.45, color); g.addColorStop(1, shade(color, -0.45));
      c.fillStyle = g; this._rr(c, x + 0.5, y + 0.5, s - 1, s - 1, s * 0.38); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; c.stroke();
      c.fillStyle = 'rgba(255,255,255,.65)'; c.beginPath(); c.ellipse ? c.ellipse(x + s * 0.32, y + s * 0.27, s * 0.14, s * 0.08, -0.5, 0, 6.3) : c.arc(x + s * 0.32, y + s * 0.27, s * 0.1, 0, 6.3); c.fill();
    } else if (k === 'metal') {
      const g = c.createLinearGradient(0, y, 0, y + s); g.addColorStop(0, shade(color, 0.55)); g.addColorStop(0.35, color); g.addColorStop(0.5, shade(color, -0.35)); g.addColorStop(0.62, color); g.addColorStop(1, shade(color, -0.5));
      c.fillStyle = g; c.fillRect(x, y, s, s);
      c.fillStyle = 'rgba(255,255,255,.28)'; c.fillRect(x, y, s, Math.max(1, s * 0.08)); c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(x, y + s - Math.max(1, s * 0.08), s, Math.max(1, s * 0.08));
      const r = Math.max(1, s * 0.07); c.fillStyle = 'rgba(0,0,0,.45)'; [[0.16, 0.16], [0.84, 0.16], [0.16, 0.84], [0.84, 0.84]].forEach(([px, py]) => { c.beginPath(); c.arc(x + s * px, y + s * py, r, 0, 6.3); c.fill(); });
      c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
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
    b.appendChild(h('div', { class: 'hint', text: 'Muda só a aparência dos blocos. As regras e as cores do tema não mudam. As skins com 🔒 se desbloqueiam com estrelas.' }));
    b.appendChild(kv('Estrelas ⭐ disponíveis', Rewards.balance()));
    const msg = h('div', { class: 'errs' });
    Skins.list.forEach(([id, name]) => {
      const locked = !Skins.usable(id), cost = Rewards.cost('skin:' + id);
      const cv = h('canvas', { width: '196', height: '28' });
      const c = cv.getContext('2d');
      'IJLOSTZ'.split('').forEach((t, i) => Skins.draw(c, 4 + i * 27, 2, 24, COLORS[t], 1, id));
      const row = h('div', { class: 'skinrow' + (settings.skin === id ? ' sel' : ''), onclick: () => { sfx.click(); if (locked) { msg.textContent = 'Desbloqueie esta skin com ' + cost + ' ⭐'; return; } settings.skin = id; saveSettings(); Sheet.refresh(); } },
        h('div', { class: 'kv' }, h('span', { text: name + (settings.skin === id ? ' ●' : '') + (locked ? ' 🔒 ' + cost + ' ⭐' : '') })), cv);
      if (locked) row.appendChild(btn('Desbloquear (' + cost + ' ⭐)', (ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); const r = Rewards.unlock('skin:' + id); if (r.ok) { settings.skin = id; saveSettings(); Sheet.refresh(); } else msg.textContent = r.error; }));
      b.appendChild(row);
    });
    b.appendChild(msg);
  });
}
Hub.add(55, 'Skins das peças', openSkins, 'custom');
