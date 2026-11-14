'use strict';
/* Recompensas (estrelas), idempotentes por id: conquistas (js/achv.js), desafio diário e torneio concedem; nada gasta. */
const Rewards = {
  load() { const d = Store.getJSON('rewards', {}); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; },
  /** Concede n estrelas pela razão `id`. Só concede uma vez por id. Retorna true se concedeu agora. */
  grant(id, n) { const d = this.load(); if (d[id]) return false; d[id] = { n: Math.max(0, Math.round(num(n))), t: Date.now() }; Store.setJSON('rewards', d); return true; },
  has(id) { return !!this.load()[id]; },
  stars() { const d = this.load(); return Object.keys(d).reduce((a, k) => a + num(d[k] && d[k].n), 0); },
};
