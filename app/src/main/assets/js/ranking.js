'use strict';
/* Ranking local: UM POR PERFIL. Cada perfil tem o seu próprio top 10 por modalidade (os resultados de um perfil não ocupam as vagas de outro).
   A tela mostra o ranking do perfil atual e, a pedido, o melhor resultado de cada perfil do aparelho ("Todos os perfis").
   Só modalidades OFICIAIS: Classic, 2 Minutes, Strategy e Sprint (concluído). Zen, tutorial, diário, personalizado e versus nunca entram.
   Armazenamento (mesma chave global de sempre): { modo: [entradas de todos os perfis] }, cada entrada com o id do perfil (pid), limitada a 10 por perfil e modo. */
const Ranking = {
  MAX: 10, MODES: [1, 2, 3, 5],
  official(r) { return this.MODES.includes(r.mode) && !(r.mode === 5 && !r.win); },
  better(m, a, b) { return m === 5 ? a.v < b.v || (a.v === b.v && a.t < b.t) : a.v > b.v || (a.v === b.v && a.t < b.t); },
  /** Ordena pelo critério da modalidade e mantém só as MAX melhores de CADA perfil. */
  trim(m, list) {
    const s = list.slice().sort((a, b) => (this.better(m, a, b) ? -1 : this.better(m, b, a) ? 1 : 0)), n = {};
    return s.filter((e) => (n[e.pid] = (n[e.pid] || 0) + 1) <= this.MAX);
  },
  /** Todas as entradas (de todos os perfis) por modalidade. */
  load() {
    const d = Store.ggetJSON('ranking', {}); const o = {};
    for (const m of this.MODES) {
      const a = d && Array.isArray(d[m]) ? d[m] : [];
      o[m] = this.trim(m, a.filter((e) => e && isFinite(e.v) && isFinite(e.t) && typeof e.pid === 'string'));
    }
    return o;
  },
  /** Ranking (top 10) de UM perfil na modalidade. */
  of(pid, m) { return this.load()[m].filter((e) => e.pid === pid); },
  /** Melhor resultado de cada perfil na modalidade (um por perfil), do melhor para o pior. */
  best(m) { const seen = {}; return this.load()[m].filter((e) => (seen[e.pid] ? false : (seen[e.pid] = true))); },
  /** Insere o resultado no ranking do perfil atual se for oficial e entrar no top 10 DELE. Devolve a posição (1..10) ou 0. Idempotente por (perfil, instante, modo). */
  submit(r) {
    if (!this.official(r)) return 0;
    const all = this.load(), pid = Profile.cur().id;
    if (all[r.mode].some((e) => e.pid === pid && e.t === r.t)) return 0;
    const e = { v: r.mode === 5 ? r.ms : r.score, t: r.t, pid, n: Profile.cur().name, lv: r.level, li: r.lines, ms: r.ms };
    all[r.mode] = this.trim(r.mode, all[r.mode].concat([e]));
    Store.gsetJSON('ranking', all);
    const pos = all[r.mode].filter((x) => x.pid === pid).indexOf(e); return pos >= 0 ? pos + 1 : 0;
  },
  removeProfile(pid) { const all = this.load(); for (const m of this.MODES) all[m] = all[m].filter((e) => e.pid !== pid); Store.gsetJSON('ranking', all); },
  /** Zera só o ranking de um perfil (os demais ficam). */
  clearProfile(pid) { this.removeProfile(pid); },
  clear() { Store.gset('ranking', '{}'); },
  nameOf(e) { const p = Profile.list().find((x) => x.id === e.pid); return p ? p.name : e.n; },
};
/** sel: modalidade; all: true = "Todos os perfis" (melhor de cada); false = só o perfil atual. */
function openRanking(sel, all) {
  Sheet.push('Ranking local', (b) => {
    sel = sel || 1; const me = Profile.cur();
    const row = h('div', { class: 'row wrap' });
    Ranking.MODES.forEach((m) => row.appendChild(btn(MODE_NAMES[m] + (sel === m ? ' ●' : ''), () => { Sheet.back(); openRanking(m, all); })));
    b.appendChild(row);
    b.appendChild(h('div', { class: 'hint', text: all ? 'Melhor resultado de cada perfil deste aparelho' : 'Ranking do perfil: ' + me.name }));
    const list = all ? Ranking.best(sel) : Ranking.of(me.id, sel);
    if (!list.length) b.appendChild(h('div', { class: 'sub', text: all ? 'Ainda sem resultados nesta modalidade.' : 'Ainda sem resultados deste perfil nesta modalidade.' }));
    list.forEach((e, i) => b.appendChild(h('div', { class: 'kv' }, h('span', { text: (i + 1) + 'º  ' + Ranking.nameOf(e) + '  ·  ' + fmtDate(e.t) }), h('b', { text: sel === 5 ? fmtMsP(e.v) : fmtNum(e.v) }))));
    b.appendChild(btn(all ? 'Ver só o meu perfil' : 'Ver todos os perfis', () => { Sheet.back(); openRanking(sel, !all); }));
    if (!all && list.length) b.appendChild(btn('Limpar ranking', () => Confirm.ask('Apagar o ranking do perfil ' + me.name + '? (os outros perfis não são afetados)', () => { Ranking.clearProfile(me.id); Sheet.refresh(); }), 'danger'));
  });
}
Hub.add(35, 'Ranking local', () => openRanking());
