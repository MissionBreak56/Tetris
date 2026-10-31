'use strict';
/* Histórico de partidas (limite fixo) + recordes por modalidade + tela de resultados. */
const History = {
  MAX: 100,
  valid(e) { return e && typeof e === 'object' && isFinite(e.s) && isFinite(e.t) && isFinite(e.m); },
  load() { const a = Store.getJSON('history', []); return Array.isArray(a) ? a.filter((e) => this.valid(e)) : []; },
  add(e) { const a = this.load(); a.push(e); while (a.length > this.MAX) a.shift(); Store.setJSON('history', a); return a; },
  clear() { Store.del('history'); },
  sorted(list, key, dir) { const k = { date: 't', score: 's', level: 'lv', lines: 'li', time: 'ms' }[key] || 't'; return list.slice().sort((a, b) => dir * (num(a[k]) - num(b[k]))); },
};
const Records = {
  spec: { 1: { k: 'bestScore', dir: 1 }, 2: { k: 'bestScore2Minutes', dir: 1 }, 3: { k: 'bestScoreStrategy', dir: 1 }, 5: { k: 'bestSprintMs', dir: -1 } },
  get(mode) { const sp = this.spec[mode]; return sp ? +(Store.get(sp.k) || 0) : 0; },
  update(res) {
    const sp = this.spec[res.mode]; if (!sp) return { tracked: false, isBest: false, prev: 0, best: 0 };
    const prev = this.get(res.mode);
    if (res.mode === 5 && !res.win) return { tracked: true, isBest: false, prev, best: prev };
    const val = res.mode === 5 ? res.ms : res.score;
    const isBest = sp.dir > 0 ? val > prev : (prev === 0 || val < prev);
    if (isBest) Store.set(sp.k, val);
    return { tracked: true, isBest, prev, best: isBest ? val : prev };
  },
};
const Results = {
  compile(g, reason) {
    return { mode: g.mode, score: Math.round(g.score), level: g.level, lines: g.lines, ms: Math.round(g.ms || 0),
      maxCombo: g.maxCombo || 0, tetrises: g.tetrises || 0, tspins: g.tspins || 0, perfect: g.perfect || 0,
      pieces: g.pieces || 0, actions: g.actions || 0, win: !!g.won, reason: reason || 'over', t: Date.now(), daily: (g.opts && g.opts.daily) || null };
  },
  entry(r) { return { m: r.mode, s: r.score, lv: r.level, li: r.lines, ms: r.ms, t: r.t, pc: r.pieces, ac: r.actions, ts: r.tspins, tt: r.tetrises, cb: r.maxCombo, pf: r.perfect, w: r.win ? 1 : 0 }; },
  /** Grava estatísticas, histórico e recorde. Chamado UMA vez por partida (gameOver tem trava overDone). */
  commit(r) {
    if (r.mode === 9) return { tracked: false, isBest: false, prev: 0, best: 0 };   // tutorial não grava nada
    const before = Missions.doneIds(StatsMgr.load());
    const st = StatsMgr.record(r);
    if (r.mode === 6) r.dailyRec = Daily.record(r);
    r.unlocked = Achv.check(st);
    r.missions = Missions.doneIds(StatsMgr.load()).filter((id) => !before.includes(id)).map((id) => Missions.nameOf(id));
    History.add(this.entry(r));
    const rec = Records.update(r);
    return rec;
  },
  render(r, rec) {
    const sprint = r.mode === 5;
    let title = 'Game Over';
    if (sprint) title = r.win ? (rec.isBest ? 'NEW RECORD!' : 'COMPLETE!') : 'Game Over';
    else if (rec.isBest) title = 'NEW HIGH SCORE!';
    else if (r.mode === 4) title = 'Zen';
    if (r.mode === 6) title = r.win ? 'DESAFIO CUMPRIDO!' : 'Desafio não cumprido';
    $('endTitle').textContent = title;
    const box = $('endStats'); clearEl(box);
    box.appendChild(kv('Score', fmtNum(r.score)));
    box.appendChild(kv('Nível', r.level));
    box.appendChild(kv('Linhas', r.lines));
    box.appendChild(kv('Duração', fmtMsP(r.ms)));
    if (rec.tracked) box.appendChild(kv(sprint ? 'Melhor tempo' : 'Best Score', sprint ? (rec.best ? fmtMsP(rec.best) : '—') : fmtNum(rec.best)));
    if (r.dailyRec && r.dailyRec.first) box.appendChild(h('div', { class: 'newrec', text: '📅 Desafio diário concluído! +1 ⭐' }));
    (r.missions || []).forEach((n) => box.appendChild(h('div', { class: 'newrec', text: '🎯 Missão concluída: ' + n })));
    (r.unlocked || []).forEach((a) => box.appendChild(h('div', { class: 'newrec', text: '🏆 Conquista: ' + a.name })));
    if (rec.isBest) box.appendChild(h('div', { class: 'newrec', text: '★ Novo recorde' + (rec.prev ? ' (anterior: ' + (sprint ? fmtMsP(rec.prev) : fmtNum(rec.prev)) + ')' : '') }));
  },
};
function openHistory(key, dir) {
  key = key || 'date'; dir = dir || -1;
  Sheet.push('Histórico', (b) => {
    const list = History.sorted(History.load(), key, dir);
    const row = h('div', { class: 'row wrap' });
    [['date', 'Data'], ['score', 'Score'], ['level', 'Nível'], ['lines', 'Linhas'], ['time', 'Duração']].forEach(([k, n]) =>
      row.appendChild(btn(n + (key === k ? (dir < 0 ? ' ↓' : ' ↑') : ''), () => { Sheet.back(); openHistory(k, key === k ? -dir : -1); })));
    b.appendChild(row);
    if (!list.length) b.appendChild(h('div', { class: 'sub', text: 'Nenhuma partida registrada.' }));
    list.forEach((e) => b.appendChild(btn((MODE_NAMES[e.m] || '?') + ' · ' + fmtNum(e.s) + ' · ' + fmtDate(e.t), () => openHistoryDetail(e))));
    if (list.length) b.appendChild(btn('Apagar histórico', () => Confirm.ask('Apagar todo o histórico de partidas? Esta ação não pode ser desfeita.', () => { History.clear(); Sheet.refresh(); }), 'danger'));
  });
}
function openHistoryDetail(e) {
  Sheet.push('Detalhes da partida', (b) => {
    [kv('Modo', MODE_NAMES[e.m] || '?'), kv('Data', fmtDate(e.t)), kv('Pontuação', fmtNum(e.s)), kv('Nível', e.lv), kv('Linhas', e.li),
      kv('Duração', fmtMsP(e.ms)), kv('Peças', e.pc == null ? '—' : e.pc), kv('Tetrises', e.tt == null ? '—' : e.tt), kv('T-Spins', e.ts == null ? '—' : e.ts),
      kv('Maior combo', e.cb == null ? '—' : e.cb), kv('Resultado', e.w ? 'Objetivo cumprido' : '—')].forEach((r) => b.appendChild(r));
  });
}
Hub.add(30, 'Histórico', () => openHistory());
