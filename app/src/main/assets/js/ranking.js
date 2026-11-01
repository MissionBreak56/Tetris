'use strict';
/* Ranking local do aparelho (compartilhado entre perfis). Só modalidades OFICIAIS: Classic, 2 Minutes, Strategy e Sprint (concluído).
   Zen, tutorial, diário, personalizado e versus nunca entram. Top 10 por modalidade. */
const Ranking = {
  MAX: 10, MODES: [1, 2, 3, 5],
  official(r) { return this.MODES.includes(r.mode) && !(r.mode === 5 && !r.win); },
  load() {
    const d = Store.ggetJSON('ranking', {}); const o = {};
    for (const m of this.MODES) {
      const a = d && Array.isArray(d[m]) ? d[m] : [];
      o[m] = a.filter((e) => e && isFinite(e.v) && isFinite(e.t) && typeof e.pid === 'string').slice(0, this.MAX);
    }
    return o;
  },
  better(m, a, b) { return m === 5 ? a.v < b.v || (a.v === b.v && a.t < b.t) : a.v > b.v || (a.v === b.v && a.t < b.t); },
  /** Insere o resultado se for oficial e entrar no top 10. Devolve a posição (1..10) ou 0. Idempotente por (perfil, instante, modo). */
  submit(r) {
    if (!this.official(r)) return 0;
    const all = this.load(), list = all[r.mode], pid = Profile.cur().id;
    if (list.some((e) => e.pid === pid && e.t === r.t)) return 0;
    const e = { v: r.mode === 5 ? r.ms : r.score, t: r.t, pid, n: Profile.cur().name, lv: r.level, li: r.lines, ms: r.ms };
    list.push(e);
    list.sort((a, b) => (this.better(r.mode, a, b) ? -1 : this.better(r.mode, b, a) ? 1 : 0));
    all[r.mode] = list.slice(0, this.MAX);
    Store.gsetJSON('ranking', all);
    const pos = all[r.mode].indexOf(e); return pos >= 0 ? pos + 1 : 0;
  },
  removeProfile(pid) { const all = this.load(); for (const m of this.MODES) all[m] = all[m].filter((e) => e.pid !== pid); Store.gsetJSON('ranking', all); },
  clear() { Store.gset('ranking', '{}'); },
  nameOf(e) { const p = Profile.list().find((x) => x.id === e.pid); return p ? p.name : e.n; },
};
function openRanking(sel) {
  Sheet.push('Ranking local', (b) => {
    sel = sel || 1;
    const row = h('div', { class: 'row wrap' });
    Ranking.MODES.forEach((m) => row.appendChild(btn(MODE_NAMES[m] + (sel === m ? ' ●' : ''), () => { Sheet.back(); openRanking(m); })));
    b.appendChild(row);
    const list = Ranking.load()[sel];
    if (!list.length) b.appendChild(h('div', { class: 'sub', text: 'Ainda sem resultados nesta modalidade.' }));
    list.forEach((e, i) => b.appendChild(h('div', { class: 'kv' }, h('span', { text: (i + 1) + 'º  ' + Ranking.nameOf(e) + '  ·  ' + fmtDate(e.t) }), h('b', { text: sel === 5 ? fmtMsP(e.v) : fmtNum(e.v) }))));
    if (list.length) b.appendChild(btn('Limpar ranking', () => Confirm.ask('Apagar o ranking de TODOS os perfis deste aparelho?', () => { Ranking.clear(); Sheet.refresh(); }), 'danger'));
  });
}
Hub.add(35, 'Ranking local', () => openRanking());
