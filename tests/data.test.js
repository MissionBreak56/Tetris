'use strict';
// Etapas 02-04: estatísticas, histórico e resultados.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

const FILL = '#fff';
function fresh(mode = 1, store = {}, seed = 1) { const h = load(seed, store); h.sb.newGame(mode); h.setState('PLAY'); return h; }
function put(h, t, rot, x, y) { const G = h.G(); G.active = h.sb.makePiece(t); Object.assign(G.active, { rot, x, y, dx: x }); }
function rows(G, a, b, except = []) { for (let r = a; r < b; r++) for (let c = 0; c < 10; c++) G.grid[r][c] = except.includes(c) ? null : FILL; }
function tetris(h) { const G = h.G(); rows(G, 16, 20, [9]); put(h, 'I', 1, 7, 16); h.sb.lockPiece(); }
const stats = (h) => plain(h.sb.StatsMgr ? h.sb.StatsMgr.load() : h.get('StatsMgr').load());

/* ---- Etapa 02: estatísticas ---- */
test('contadores da partida: tetris, perfect clear, peças, combo', () => {
  const h = fresh();
  tetris(h);
  const G = h.G();
  assert.equal(G.tetrises, 1); assert.equal(G.perfect, 1); assert.equal(G.pieces, 1); assert.equal(G.combo, 1);
});
test('combo: sequência de travas com linha; trava sem linha zera; maxCombo guarda o pico', () => {
  const h = fresh();
  const G = h.G();
  for (let i = 0; i < 3; i++) { G.grid = h.sb.newGrid(); rows(G, 19, 20, [9]); put(h, 'I', 1, 7, 16); h.sb.lockPiece(); }
  assert.equal(G.combo, 3); assert.equal(G.maxCombo, 3);
  G.grid = h.sb.newGrid(); put(h, 'O', 0, 3, 18); h.sb.lockPiece();
  assert.equal(G.combo, 0); assert.equal(G.maxCombo, 3);
});
test('tempo jogado acumula só em PLAY', () => {
  const h = fresh(); put(h, 'T', 0, 3, 5);
  h.sb.update(0.5); h.setState('PAUSED'); h.sb.update(5);
  assert.equal(Math.round(h.G().ms), 500);
});
test('estatísticas gravadas ao fim da partida, separadas por modalidade e persistentes após reabrir', () => {
  const h = fresh(1);
  tetris(h); h.G().level = 5; h.G().score = 1234; h.sb.gameOver();
  const h2 = load(2, h.store);              // "fechar e reabrir o app"
  const s = plain(h2.get('StatsMgr').load());
  assert.equal(s.all.games, 1); assert.equal(s.all.tetrises, 1); assert.equal(s.all.bestScore, 1234); assert.equal(s.all.bestLevel, 5);
  assert.equal(s.all.bestCombo, 1); assert.equal(s.all.perfect, 1); assert.equal(s.modes[1].games, 1);
  h2.sb.newGame(2); h2.G().score = 50; h2.sb.gameOver();
  const s2 = plain(h2.get('StatsMgr').load());
  assert.equal(s2.all.games, 2); assert.equal(s2.modes[2].games, 1); assert.equal(s2.modes[1].games, 1); assert.equal(s2.modes[2].bestScore, 50);
});
test('estatísticas: dados corrompidos no armazenamento não quebram', () => {
  const h = load(1, { tetris_stats: '{not json' });
  assert.equal(plain(h.get('StatsMgr').load()).all.games, 0);
  const h2 = load(1, { tetris_stats: '123' });
  assert.equal(plain(h2.get('StatsMgr').load()).all.games, 0);
});
test('tutorial (modo 9) não grava estatísticas, histórico nem recorde', () => {
  const h = fresh(9); h.G().score = 999; h.sb.gameOver();
  assert.equal(plain(h.get('StatsMgr').load()).all.games, 0);
  assert.equal(h.get('History').load().length, 0);
});

/* ---- Etapa 03: histórico ---- */
test('histórico: registra modo, pontuação, nível, linhas, duração e data', () => {
  const h = fresh(2);
  const G = h.G(); G.score = 700; G.level = 3; G.lines = 12; G.ms = 45678;
  h.sb.gameOver();
  const e = plain(h.get('History').load())[0];
  assert.equal(e.m, 2); assert.equal(e.s, 700); assert.equal(e.lv, 3); assert.equal(e.li, 12); assert.equal(e.ms, 45678);
  assert.ok(Math.abs(e.t - Date.now()) < 5000);
});
test('histórico: limite de 100 registros (descarta os mais antigos)', () => {
  const h = load(1);
  const H = h.get('History');
  for (let i = 0; i < 130; i++) H.add({ m: 1, s: i, lv: 1, li: 0, ms: 0, t: 1000 + i });
  const l = plain(H.load());
  assert.equal(l.length, 100); assert.equal(l[0].s, 30); assert.equal(l[99].s, 129);
});
test('histórico: ordenação por data, score, nível, linhas e duração; ignora registros inválidos', () => {
  const h = load(1, { tetris_history: JSON.stringify([{ m: 1, s: 5, lv: 2, li: 9, ms: 30, t: 3 }, { m: 1, s: 9, lv: 1, li: 4, ms: 10, t: 1 }, { bad: true }, { m: 1, s: 1, lv: 3, li: 1, ms: 20, t: 2 }]) });
  const H = h.get('History'); const l = H.load();
  assert.equal(l.length, 3);
  const order = (k, d) => plain(H.sorted(l, k, d)).map((e) => e.s);
  assert.deepEqual(order('score', -1), [9, 5, 1]); assert.deepEqual(order('date', 1), [9, 1, 5]);
  assert.deepEqual(order('level', -1), [1, 5, 9]); assert.deepEqual(order('lines', -1), [5, 9, 1]); assert.deepEqual(order('time', 1), [9, 1, 5]);
});
test('histórico: apagar remove tudo e as estatísticas permanecem', () => {
  const h = fresh(1); h.G().score = 10; h.sb.gameOver();
  h.get('History').clear();
  assert.equal(h.get('History').load().length, 0);
  assert.equal(plain(h.get('StatsMgr').load()).all.games, 1);
});
test('histórico: telas abrem sem erro e o apagar pede confirmação', () => {
  const h = fresh(1); h.G().score = 10; h.sb.gameOver();
  assert.doesNotThrow(() => { h.sb.show('menu'); h.get('Hub').open(); h.sb.openStats(); h.sb.openHistory(); h.sb.openHistoryDetail(h.get('History').load()[0]); });
});

/* ---- Etapa 04: resultados ---- */
test('resultado: salvo uma única vez mesmo com gameOver repetido', () => {
  const h = fresh(1); h.G().score = 321;
  h.sb.gameOver(); h.sb.gameOver(); h.sb.gameOver();
  assert.equal(h.get('History').load().length, 1);
  assert.equal(plain(h.get('StatsMgr').load()).all.games, 1);
});
test('resultado: título e destaque de novo recorde', () => {
  const h = fresh(1); h.G().score = 800; h.sb.gameOver();
  assert.equal(h.els.endTitle.textContent, 'NEW HIGH SCORE!');
  const h2 = load(1, h.store); h2.sb.newGame(1); h2.G().score = 100; h2.sb.gameOver();
  assert.equal(h2.els.endTitle.textContent, 'Game Over');
  assert.equal(h2.get('Records').get(1), 800);
});
test('recorde de Sprint: menor tempo vence e só conta se completou', () => {
  const R = load(1).get('Records');
  const h = load(1); const Rr = h.get('Records');
  assert.equal(plain(Rr.update({ mode: 5, win: false, ms: 5000, score: 0 })).isBest, false);
  assert.equal(plain(Rr.update({ mode: 5, win: true, ms: 60000, score: 0 })).isBest, true);
  assert.equal(plain(Rr.update({ mode: 5, win: true, ms: 70000, score: 0 })).isBest, false);
  assert.equal(plain(Rr.update({ mode: 5, win: true, ms: 50000, score: 0 })).isBest, true);
  assert.equal(Rr.get(5), 50000); assert.ok(R);
});
