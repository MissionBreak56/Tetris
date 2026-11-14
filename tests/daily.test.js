'use strict';
// Etapas 14-15: desafio diário, missões e recompensas.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

const FILL = '#fff';
function put(h, t, rot, x, y) { const G = h.G(); G.active = h.sb.makePiece(t); Object.assign(G.active, { rot, x, y, dx: x }); }
function rows(G, a, b, except = []) { for (let r = a; r < b; r++) for (let c = 0; c < 10; c++) G.grid[r][c] = except.includes(c) ? null : FILL; }
function clearOne(h) { rows(h.G(), 19, 20, [9]); put(h, 'I', 1, 7, 16); h.sb.lockPiece(); }
function dailyGame(h, key, patch) { const o = plain(h.get('Daily').options(key)); if (patch) patch(o); h.sb.newGame(6, o); h.setState('PLAY'); return o; }
const D = (h) => h.get('Daily');

test('diário: dateKey usa data local AAAA-MM-DD', () => {
  const h = load(1);
  assert.equal(h.run('Daily.dateKey(new Date(2026,0,5))'), '2026-01-05');
  assert.equal(h.run('Daily.dateKey(new Date(2026,11,31,23,59))'), '2026-12-31');
});
test('diário: determinístico por data e válido em um ano inteiro; todos os tipos aparecem', () => {
  const a = load(1), b = load(99), types = new Set();
  for (let d = 0; d < 366; d++) {
    const key = a.run(`Daily.dateKey(new Date(2026,0,1+${d}))`);
    const x = plain(D(a).forDate(key)), y = plain(D(b).forDate(key));
    assert.deepEqual(x, y, key);
    types.add(x.type);
    const r = x.rules;
    if (r.goal && r.goal.target !== undefined) assert.ok(r.goal.target > 0 && Number.isInteger(r.goal.target), key);
    if (r.timeLimit) assert.ok(r.timeLimit >= 60 && r.timeLimit <= 120);
    if (r.fixedLevel) assert.ok(r.fixedLevel >= 1 && r.fixedLevel <= 15);
    assert.ok(x.text.length > 5);
  }
  assert.equal(types.size, 5);
  assert.notDeepEqual(plain(D(a).forDate('2026-03-01')), plain(D(a).forDate('2026-03-02')));
});
test('diário: mesma data => mesmas peças; datas diferentes => sequências diferentes', () => {
  const seq = (key) => { const h = load(1); dailyGame(h, key); return [h.G().active.t, ...plain(h.G().queue)].join(''); };
  assert.equal(seq('2026-05-05'), seq('2026-05-05'));
  assert.notEqual(seq('2026-05-05'), seq('2026-05-06'));
});
test('diário: concluir registra data, tentativa e concede a estrela uma única vez (e a conquista "Desafiante")', () => {
  const h = load(1);
  dailyGame(h, '2026-05-05', (o) => { o.rules = { goal: { type: 'lines', target: 1 } }; });
  clearOne(h);
  assert.equal(h.state(), 'OVER'); assert.equal(h.G().won, true);
  let d = plain(D(h).load())['2026-05-05'];
  assert.equal(d.done, true); assert.equal(d.tries, 1); assert.equal(D(h).count(), 1);
  assert.equal(h.get('Rewards').stars(), 2, '1 ⭐ do diário + 1 ⭐ da conquista "Desafiante"');
  dailyGame(h, '2026-05-05', (o) => { o.rules = { goal: { type: 'lines', target: 1 } }; });
  clearOne(h);
  d = plain(D(h).load())['2026-05-05'];
  assert.equal(d.tries, 2); assert.equal(D(h).count(), 1); assert.equal(h.get('Rewards').stars(), 2, 'sem recompensa duplicada');
});
test('diário: o desafio fica congelado no início (virar o dia não troca a data registrada)', () => {
  const h = load(1);
  dailyGame(h, '2026-05-05', (o) => { o.rules = { goal: { type: 'lines', target: 1 } }; });
  h.run('Date = class extends Date { constructor(...a){ super(...(a.length?a:[2030,0,1])); } }');   // "relógio" muda no meio da partida
  clearOne(h);
  assert.ok(plain(D(h).load())['2026-05-05'].done); assert.equal(plain(D(h).load())['2030-01-01'], undefined);
});
test('diário: tempo esgotado em desafio de linhas é derrota; sobreviver ao tempo é vitória', () => {
  const lost = load(1); dailyGame(lost, '2026-05-05', (o) => { o.rules = { timeLimit: 30, goal: { type: 'lines', target: 50 } }; });
  lost.G().active = null; for (let i = 0; i < 30; i++) lost.sb.update(1);
  assert.equal(lost.state(), 'OVER'); assert.notEqual(lost.G().won, true); assert.equal(D(lost).count(), 0);
  assert.equal(lost.els.endTitle.textContent, 'Desafio não cumprido');
  const won = load(1); dailyGame(won, '2026-05-06', (o) => { o.rules = { timeLimit: 30, goal: { type: 'time' }, levelUps: false, fixedLevel: 8 }; });
  won.G().active = null; for (let i = 0; i < 30; i++) won.sb.update(1);
  assert.equal(won.G().won, true); assert.equal(D(won).count(), 1);
});
test('diário: restrições de regras são aplicadas (sem hold)', () => {
  const h = load(1); dailyGame(h, '2026-05-05', (o) => { o.rules = { noHold: true }; });
  const t = h.G().active.t; h.sb.hold(); assert.equal(h.G().held, null); assert.equal(h.G().active.t, t);
});
test('diário: armazenamento corrompido e histórico limitado a 60 dias', () => {
  assert.equal(D(load(1, { tetris_daily: '{bad' })).count(), 0);
  const h = load(1);
  for (let d = 1; d <= 90; d++) D(h).record({ daily: '2026-' + String(1 + Math.floor((d - 1) / 28)).padStart(2, '0') + '-' + String(1 + ((d - 1) % 28)).padStart(2, '0'), win: true, ms: 1, score: 1 });
  assert.equal(Object.keys(plain(D(h).load())).length, 60);
  assert.equal(D(h).record({ daily: 'hack', win: true }), null);
});

/* ---- Etapa 15: recompensas e conquistas (missões mescladas) ---- */
test('recompensas: concedidas uma única vez por id e somadas', () => {
  const R = load(1).get('Rewards');
  assert.equal(R.grant('x', 2), true); assert.equal(R.grant('x', 2), false); assert.equal(R.grant('y', 3), true);
  assert.equal(R.stars(), 5);
});
test('conquistas com recompensa (ex-missões): estrelas concedidas sozinhas ao desbloquear, uma única vez', () => {
  const h = load(1, { tetris_stats: JSON.stringify({ all: { lines: 120, games: 3 }, modes: {} }) });
  const A = h.get('Achv'), S = h.get('StatsMgr');
  const p = Object.fromEntries(plain(A.progress(S.load())).map((a) => [a.id, a]));
  assert.equal(p.lines_100.value, 100); assert.equal(p.lines_100.reward, 1); assert.equal(p.lines_500.value, 120); assert.equal(p.lines_500.reward, 2);
  const f = plain(A.check(S.load())); assert.deepEqual(f.map((x) => [x.id, x.reward]).sort(), [['first_game', 0], ['lines_100', 1]]);
  assert.equal(h.get('Rewards').stars(), 1); assert.deepEqual(plain(A.check(S.load())), [], 'nada novo'); assert.equal(h.get('Rewards').stars(), 1, 'sem estrelas duplicadas');
});
test('conquistas com recompensa: quem já resgatou a missão antiga não ganha as estrelas de novo; recompensa pendente de conquista antiga é acertada', () => {
  const stats = JSON.stringify({ all: { lines: 600, games: 12, bestLevel: 11 }, modes: {} });
  const h = load(1, { tetris_stats: stats, tetris_rewards: JSON.stringify({ m_lines_100: { n: 1, t: 5 } }), tetris_achv: JSON.stringify({ level_10: 7 }) });
  const A = h.get('Achv'), S = h.get('StatsMgr'), R = h.get('Rewards');
  const f = Object.fromEntries(plain(A.check(S.load())).map((x) => [x.id, x.reward]));
  assert.equal(f.lines_100, 0, 'já resgatada como missão: sem estrelas novas'); assert.equal(f.lines_500, 2); assert.equal(f.games_10, 1);
  assert.equal(R.has('m_level_10'), true, 'conquista já desbloqueada antes: recompensa pendente concedida'); assert.equal(R.stars(), 1 + 2 + 1 + 2);   // m_lines_100 + lines_500 + games_10 + level_10
  assert.equal(plain(A.load()).level_10, 7, 'instante antigo preservado');
});
test('conquistas: concluir durante a partida aparece no resultado com as estrelas', () => {
  const h = load(1); h.sb.newGame(1); h.setState('PLAY');
  rows(h.G(), 16, 20, [9]); put(h, 'I', 1, 7, 16); h.sb.lockPiece();   // tetris + perfect clear
  h.sb.gameOver();
  assert.ok(h.els.endStats.children.some((c) => /Conquista: Perfect Clear · \+3 ⭐/.test(c.textContent || '')));
  assert.ok(Object.keys(plain(h.get('Achv').load())).length > 0); assert.equal(h.get('Rewards').has('m_perfect_1'), true);
  assert.ok(!h.els.endStats.children.some((c) => /Missão/.test(c.textContent || '')), 'não existe mais "Missão concluída"');
});
test('conquistas e diário: telas abrem sem erro; missões não existem mais', () => {
  const h = load(1);
  assert.doesNotThrow(() => { h.sb.openAchievements(); h.get('Modes').list.find((m) => m.label === 'Desafio diário').open(); });
  assert.equal(typeof h.sb.openMissions, 'undefined'); assert.equal(Array.from(h.get('Hub').items.map((x) => x.label)).includes('Missões'), false);
});
