'use strict';
// Etapa 19: ações/APM/PPS, análises e passo fixo da simulação.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

function fresh(mode = 1, seed = 1) { const h = load(seed); h.sb.newGame(mode, { seed: 7 }); h.setState('PLAY'); return h; }

test('ações: contam por toque/tecla, soft-off não conta, e são gravadas com o tick', () => {
  const h = fresh();
  h.key('ArrowLeft'); h.key('ArrowRight'); h.key('ArrowUp'); h.key('ArrowDown'); h.keyUp('ArrowDown');
  assert.equal(h.G().actions, 4);
  assert.deepEqual(plain(h.G().rec), [0, 0, 0, 1, 0, 2, 0, 6, 0, 7]);
  h.sb.update(1 / 60); h.key('c');
  assert.deepEqual(plain(h.G().rec).slice(-2), [1, 5]);
});
test('ações: ignoradas fora de PLAY e depois do fim da partida', () => {
  const h = fresh(); h.setState('PAUSED'); assert.equal(h.sb.act(h.get('A').LEFT), false);
  h.setState('PLAY'); h.sb.gameOver(); assert.equal(h.sb.act(h.get('A').LEFT), false);
});
test('ações de replay (external) não contam nem regravam', () => {
  const h = fresh(); h.sb.act(h.get('A').CW, true);
  assert.equal(h.G().actions, 0); assert.equal(h.G().rec.length, 0);
});
test('pausar durante queda suave grava SOFT_OFF (mantém replay consistente)', () => {
  const h = fresh(); h.key('ArrowDown'); h.sb.pauseGame();
  assert.deepEqual(plain(h.G().rec).slice(-2), [0, 7]); assert.equal(h.G().soft, false);
});
test('loop: passo fixo de 1/60 s independente da taxa de quadros', () => {
  const h = fresh(); h.sb.loop(1000 / 60 + 0.01); assert.equal(h.G().tick, 1);
  const h2 = fresh(); h2.sb.loop(100); assert.equal(h2.G().tick, 6, 'máximo 6 passos por quadro');
  const h3 = fresh(); for (let i = 1; i <= 120; i++) h3.sb.loop(i * (1000 / 120)); assert.ok(Math.abs(h3.G().tick - 60) <= 1);
});
test('tutorial não grava ações para replay', () => { const h = load(1); h.sb.newGame(9); assert.equal(h.G().rec, null); });

test('análises: médias, PPS, APM e tendência', () => {
  const h = load(1); const A = h.get('Analysis');
  const mk = (s, pc, ac, ms) => ({ m: 1, s, lv: 1, li: 10, ms, t: 1, pc, ac });
  const r = plain(A.compute([mk(100, 60, 120, 60000), mk(300, 120, 240, 60000)]));
  assert.equal(r.n, 2); assert.equal(r.avgScore, 200); assert.equal(r.pps, 1.5); assert.equal(r.apm, 180); assert.equal(r.bestScore, 300); assert.equal(r.worstScore, 100); assert.equal(r.trend, null);
  const list = []; for (let i = 0; i < 20; i++) list.push(mk(i < 10 ? 100 : 200, 10, 10, 10000));
  assert.equal(plain(A.compute(list)).trend.delta, 100);
});
test('análises: sem dados, registros antigos (sem pc/ac) e duração zero não geram NaN/Infinity', () => {
  const A = load(1).get('Analysis');
  const empty = plain(A.compute([])); assert.equal(empty.n, 0); assert.equal(empty.avgScore, null); assert.equal(empty.bestScore, null);
  const old = plain(A.compute([{ m: 1, s: 50, lv: 1, li: 1, ms: 5000, t: 1 }])); assert.equal(old.pps, null); assert.equal(old.apm, null);
  const zero = plain(A.compute([{ m: 1, s: 50, lv: 1, li: 1, ms: 0, t: 1, pc: 3, ac: 3 }])); assert.equal(zero.pps, null);
  assert.doesNotThrow(() => { load(1).sb.openAnalysis(); });
});
test('partida real alimenta peças e ações no histórico', () => {
  const h = fresh(); h.key('ArrowLeft'); h.key(' '); h.key(' '); h.sb.gameOver();
  const e = plain(h.get('History').load())[0]; assert.equal(e.pc, 2); assert.equal(e.ac, 3);
});
