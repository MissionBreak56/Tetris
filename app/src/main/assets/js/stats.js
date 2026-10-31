'use strict';
/* StatisticsManager — estatísticas acumuladas por perfil, no total e por modalidade. */
const MODE_NAMES = { 1: 'Classic', 2: '2 Minutes', 3: 'Strategy', 4: 'Zen', 5: 'Sprint 40', 6: 'Desafio diário', 7: 'Desafio personalizado', 8: 'Versus', 9: 'Tutorial' };
const StatsMgr = {
  blank() { return { games: 0, wins: 0, lines: 0, bestScore: 0, bestLevel: 0, bestCombo: 0, tetrises: 0, tspins: 0, perfect: 0, pieces: 0, playMs: 0 }; },
  load() {
    const d = Store.getJSON('stats', null);
    const s = d && typeof d === 'object' ? d : {};
    const base = this.blank();
    s.all = Object.assign({}, base, s.all || {});
    s.modes = s.modes && typeof s.modes === 'object' ? s.modes : {};
    return s;
  },
  _add(t, r) {
    t.games++; if (r.win) t.wins++;
    t.lines += num(r.lines); t.tetrises += num(r.tetrises); t.tspins += num(r.tspins);
    t.perfect += num(r.perfect); t.pieces += num(r.pieces); t.playMs += num(r.ms);
    t.bestScore = Math.max(t.bestScore, num(r.score)); t.bestLevel = Math.max(t.bestLevel, num(r.level));
    t.bestCombo = Math.max(t.bestCombo, num(r.maxCombo));
  },
  record(r) {
    const s = this.load();
    this._add(s.all, r);
    const m = Object.assign(this.blank(), s.modes[r.mode] || {});
    this._add(m, r); s.modes[r.mode] = m;
    Store.setJSON('stats', s);
    return s;
  },
  reset() { Store.del('stats'); },
};
function statsRows(t) {
  return [kv('Partidas', t.games), kv('Linhas eliminadas', fmtNum(t.lines)), kv('Maior pontuação', fmtNum(t.bestScore)),
    kv('Maior nível', t.bestLevel), kv('Maior combo', t.bestCombo), kv('Tetrises', t.tetrises), kv('T-Spins', t.tspins),
    kv('Perfect Clears', t.perfect), kv('Tempo total jogado', fmtMs(t.playMs))];
}
function openStats(sel) {
  Sheet.push('Estatísticas', (b) => {
    const s = StatsMgr.load(); sel = sel || 'all';
    const row = h('div', { class: 'row wrap' });
    [['all', 'Todos']].concat(Object.keys(MODE_NAMES).filter((m) => m !== '9').map((m) => [m, MODE_NAMES[m]])).forEach(([k, n]) =>
      row.appendChild(btn(n + (sel === k ? ' ●' : ''), () => { Sheet.back(); openStats(k); })));
    b.appendChild(row);
    b.appendChild(sec(sel === 'all' ? 'TOTAL' : MODE_NAMES[sel].toUpperCase()));
    statsRows(sel === 'all' ? s.all : Object.assign(StatsMgr.blank(), s.modes[sel] || {})).forEach((r) => b.appendChild(r));
  });
}
Hub.add(20, 'Estatísticas', () => openStats());
