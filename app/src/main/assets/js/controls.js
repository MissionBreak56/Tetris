'use strict';
/* Personalização dos controles: botão de pausa (tamanho/posição/opacidade) e sensibilidade dos gestos. */
const Controls = {
  defaults: { size: 1, opacity: 1, pos: 'right', sens: 1, swipe: 1, soft: 1 },
  ranges: { size: [0.6, 1.1], opacity: [0.3, 1], sens: [0.5, 2], swipe: [0.5, 2], soft: [0.5, 2] },
  cfg: null,
  sanitize(d) {
    const o = Object.assign({}, this.defaults);
    if (d && typeof d === 'object') {
      for (const k in this.ranges) { const v = parseFloat(d[k]); if (isFinite(v)) o[k] = Math.min(this.ranges[k][1], Math.max(this.ranges[k][0], v)); }
      if (d.pos === 'left' || d.pos === 'right') o.pos = d.pos;
    }
    return o;
  },
  load() { this.cfg = this.sanitize(Store.getJSON('ctl', {})); return this.cfg; },
  save() { Store.setJSON('ctl', this.cfg); },
  reset() { this.cfg = Object.assign({}, this.defaults); Store.del('ctl'); return this.cfg; },
  /** Retângulo do botão de pausa. Sempre dentro de uma coluna lateral, nunca sobre a moldura/tabuleiro. */
  pauseRect(L, W, cfg) {
    const side = L.side;
    let pb = Math.round(Math.min(side, side * 0.92 * cfg.size));
    let x = cfg.pos === 'left' ? L.fl - 4 - side + (side - pb) / 2 : L.fr + 4 + (side - pb) / 2;
    if (cfg.pos === 'left') { x = Math.max(0, x); pb = Math.min(pb, Math.max(8, Math.floor(L.fl - 4 - x))); }
    else { pb = Math.min(pb, Math.max(8, Math.floor(W - x))); }
    return { x: Math.round(x), y: Math.round(L.fb - pb - L.pad * 0.1), w: pb, h: pb };
  },
};
Controls.load();
