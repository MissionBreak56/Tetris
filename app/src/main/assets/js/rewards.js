'use strict';
/* Recompensas (estrelas), idempotentes por id: conquistas (js/achv.js), desafio diário e torneio concedem.
   As estrelas são GASTAS para desbloquear temas e skins novos (COSTS). Saldo = ganhas − gastas. Os itens originais (4 temas, 4 skins) são sempre livres. */
const Rewards = {
  /** Custo em estrelas dos itens que precisam ser desbloqueados ("theme:<id>" / "skin:<id>"). */
  COSTS: {
    'theme:4': 2, 'theme:5': 2, 'theme:6': 2, 'theme:7': 4, 'theme:8': 3, 'theme:9': 3, 'theme:10': 3, 'theme:11': 3,
    'skin:glass': 3, 'skin:pixel': 2, 'skin:outline': 2, 'skin:candy': 3, 'skin:metal': 4,
  },
  load() { const d = Store.getJSON('rewards', {}); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; },
  /** Concede n estrelas pela razão `id`. Só concede uma vez por id. Retorna true se concedeu agora. */
  grant(id, n) { const d = this.load(); if (d[id]) return false; d[id] = { n: Math.max(0, Math.round(num(n))), t: Date.now() }; Store.setJSON('rewards', d); return true; },
  has(id) { return !!this.load()[id]; },
  /** Estrelas ganhas (total). */
  stars() { const d = this.load(); return Object.keys(d).reduce((a, k) => a + num(d[k] && d[k].n), 0); },
  /** Itens desbloqueados com estrelas: { "theme:4": instante }. */
  owned() { const d = Store.getJSON('spent', {}); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; },
  spentTotal() { const o = this.owned(); return Object.keys(o).reduce((a, k) => a + (this.COSTS[k] || 0), 0); },
  /** Estrelas disponíveis para gastar. */
  balance() { return Math.max(0, this.stars() - this.spentTotal()); },
  cost(key) { return this.COSTS[key] || 0; },
  unlocked(key) { return !this.COSTS[key] || !!this.owned()[key]; },
  /** Desbloqueia gastando estrelas. Devolve { ok, error? }. Idempotente (já desbloqueado = ok sem gastar). */
  unlock(key) {
    if (!this.COSTS[key]) return { ok: false, error: 'Item inexistente' };
    if (this.unlocked(key)) return { ok: true };
    const c = this.COSTS[key], b = this.balance(); if (b < c) return { ok: false, error: 'Faltam ' + (c - b) + ' ⭐' };
    const o = this.owned(); o[key] = Date.now(); if (!Store.setJSON('spent', o)) return { ok: false, error: 'Não foi possível salvar' };
    return { ok: true };
  },
};
