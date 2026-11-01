'use strict';
// Etapa 20: ranking local.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');
const R = (h) => h.get('Ranking');
const res = (o) => Object.assign({ mode: 1, score: 100, level: 1, lines: 1, ms: 1000, win: false, t: 1 }, o);

test('ranking: ordena por pontuação, mantém só 10 e informa a posição', () => {
  const h = load(1);
  for (let i = 1; i <= 12; i++) R(h).submit(res({ score: i * 100, t: i }));
  const l = plain(R(h).load())[1]; assert.equal(l.length, 10); assert.equal(l[0].v, 1200); assert.equal(l[9].v, 300);
  assert.equal(R(h).submit(res({ score: 50, t: 99 })), 0);
  assert.equal(R(h).submit(res({ score: 750, t: 100 })), 6);
});
test('ranking: empate mantém o mais antigo acima', () => {
  const h = load(1); R(h).submit(res({ score: 500, t: 5 })); R(h).submit(res({ score: 500, t: 9 }));
  assert.deepEqual(plain(R(h).load())[1].map((e) => e.t), [5, 9]);
});
test('ranking: Sprint ordena por menor tempo e só aceita concluídos', () => {
  const h = load(1);
  assert.equal(R(h).submit(res({ mode: 5, win: false, ms: 1 })), 0);
  R(h).submit(res({ mode: 5, win: true, ms: 70000, t: 1 })); R(h).submit(res({ mode: 5, win: true, ms: 50000, t: 2 }));
  assert.deepEqual(plain(R(h).load())[5].map((e) => e.v), [50000, 70000]);
});
test('ranking: modos não oficiais (Zen, diário, personalizado, versus, tutorial) nunca entram', () => {
  const h = load(1);
  for (const m of [4, 6, 7, 8, 9]) assert.equal(R(h).submit(res({ mode: m, score: 99999 })), 0);
  assert.deepEqual(Object.values(plain(R(h).load())).map((a) => a.length), [0, 0, 0, 0]);
});
test('ranking: sem duplicidade (mesma partida enviada duas vezes) e gameOver repetido não duplica', () => {
  const h = load(1); const r = res({ score: 400, t: 5 });
  assert.equal(R(h).submit(r), 1); assert.equal(R(h).submit(r), 0); assert.equal(plain(R(h).load())[1].length, 1);
  h.sb.newGame(1); h.G().score = 123; h.sb.gameOver(); h.sb.gameOver();
  assert.equal(plain(R(h).load())[1].length, 2);
});
test('ranking: compartilhado entre perfis, usa o nome atual e some ao excluir o perfil', () => {
  const h = load(1); R(h).submit(res({ score: 300, t: 1 }));
  const id = h.get('Profile').create('Zé').id; h.get('Profile').switchTo(id); R(h).submit(res({ score: 900, t: 2 }));
  assert.deepEqual(plain(R(h).load())[1].map((e) => R(h).nameOf(e)), ['Zé', 'Jogador 1']);
  h.get('Profile').rename(id, 'José'); assert.equal(R(h).nameOf(plain(R(h).load())[1][0]), 'José');
  h.get('Profile').remove(id); assert.equal(plain(R(h).load())[1].length, 1);
});
test('ranking: dados corrompidos não quebram; posição aparece no resultado; tela abre', () => {
  assert.equal(plain(load(1, { tetris__ranking: '{x' }).get('Ranking').load())[1].length, 0);
  assert.equal(plain(load(1, { tetris__ranking: '{"1":[{"v":"a"},{"v":5,"t":1,"pid":"p1"}]}' }).get('Ranking').load())[1].length, 1);
  const h = load(1); h.sb.newGame(1); h.G().score = 77; h.sb.gameOver();
  assert.ok(h.els.endStats.children.some((c) => /1º lugar/.test(c.textContent || '')));
  assert.doesNotThrow(() => { h.sb.openRanking(); h.sb.openRanking(5); });
});
