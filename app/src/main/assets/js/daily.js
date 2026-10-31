'use strict';
/* Desafio diário: gerado de forma determinística a partir da data local (mesmo desafio e mesmas peças para todos). */
const Daily = {
  dateKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); },
  hash(str) { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; },
  /** Desafio da data (string AAAA-MM-DD). Puro: mesma data => mesmo resultado. */
  forDate(key) {
    const seed = this.hash('tetris-daily-' + key), r = mkRng(seed), pick = (a, b) => a + Math.floor(r() * (b - a + 1));
    const type = Math.floor(r() * 5);
    let rules, text;
    if (type === 0) { const n = pick(3, 6) * 5; rules = { timeLimit: 120, goal: { type: 'lines', target: n } }; text = 'Elimine ' + n + ' linhas em 2 minutos'; }
    else if (type === 1) { const n = pick(2, 8) * 1000; rules = { goal: { type: 'score', target: n } }; text = 'Faça ' + fmtNum(n) + ' pontos sem perder'; }
    else if (type === 2) { const n = pick(2, 4) * 10; rules = { goal: { type: 'lines', target: n }, levelUps: false, fixedLevel: pick(2, 6) }; text = 'Elimine ' + n + ' linhas no nível ' + rules.fixedLevel + ' (nível fixo)'; }
    else if (type === 3) { const lv = pick(6, 12), t = pick(6, 12) * 10; rules = { timeLimit: t, goal: { type: 'time' }, levelUps: false, fixedLevel: lv }; text = 'Sobreviva ' + t + ' s no nível ' + lv; }
    else { const n = pick(2, 6) * 1000; rules = { goal: { type: 'score', target: n }, noHold: true }; text = 'Faça ' + fmtNum(n) + ' pontos sem usar o Hold'; }
    return { date: key, seed, type, text, rules };
  },
  /** Opções para startGame(6, opts). Congela a data no início: virar o dia no meio da partida não troca o desafio. */
  options(key) { const c = this.forDate(key); return { seed: c.seed, rules: c.rules, daily: key, text: c.text }; },
  load() { const d = Store.getJSON('daily', {}); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; },
  count() { const d = this.load(); return Object.keys(d).filter((k) => d[k] && d[k].done).length; },
  /** Registra uma tentativa; só uma conclusão por data (recompensa idempotente). */
  record(res) {
    const key = res.daily; if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    const d = this.load(); const e = d[key] || { tries: 0, done: false, bestScore: 0, bestMs: 0 };
    e.tries++; e.bestScore = Math.max(e.bestScore, num(res.score));
    let first = false;
    if (res.win) { if (!e.done) { e.done = true; first = true; e.bestMs = res.ms; } else if (!e.bestMs || res.ms < e.bestMs) e.bestMs = res.ms; }
    d[key] = e;
    const keys = Object.keys(d).sort(); while (keys.length > 60) delete d[keys.shift()];
    Store.setJSON('daily', d);
    if (first) Rewards.grant('daily:' + key, 1);
    return { first, entry: e };
  },
};
Modes.add(30, 'Desafio diário', () => {
  const key = Daily.dateKey(), c = Daily.forDate(key), e = Daily.load()[key];
  Sheet.push('Desafio diário', (b) => {
    b.appendChild(kv('Data', key)); b.appendChild(sec('OBJETIVO')); b.appendChild(h('div', { class: 'stat', text: c.text }));
    b.appendChild(kv('Situação', e && e.done ? 'Concluído ✓' : 'Pendente')); b.appendChild(kv('Tentativas', e ? e.tries : 0));
    if (e && e.done) b.appendChild(kv('Melhor tempo', fmtMsP(e.bestMs)));
    b.appendChild(kv('Concluídos no total', Daily.count()));
    b.appendChild(btn(e && e.done ? 'Jogar novamente' : 'Jogar', () => startGame(6, Daily.options(key))));
  });
});
