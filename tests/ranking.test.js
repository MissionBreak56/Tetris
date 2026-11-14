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
test('ranking: guardado junto, mas cada perfil tem o seu; usa o nome atual e some ao excluir o perfil', () => {
  const h = load(1); R(h).submit(res({ score: 300, t: 1 }));
  const id = h.get('Profile').create('Zé').id; h.get('Profile').switchTo(id); R(h).submit(res({ score: 900, t: 2 }));
  assert.deepEqual(plain(R(h).load())[1].map((e) => R(h).nameOf(e)), ['Zé', 'Jogador 1']);
  h.get('Profile').rename(id, 'José'); assert.equal(R(h).nameOf(plain(R(h).load())[1][0]), 'José');
  h.get('Profile').remove(id); assert.equal(plain(R(h).load())[1].length, 1);
});
test('ranking por perfil: o top 10 é de cada perfil (um perfil não ocupa as vagas do outro) e a posição é no ranking do próprio perfil', () => {
  const h = load(1), P = h.get('Profile'), a = P.cur().id;
  for (let i = 1; i <= 12; i++) R(h).submit(res({ score: 1000 + i * 100, t: i }));            // perfil A: 12 resultados altos (fica com 10)
  const b = P.create('Zé').id; P.switchTo(b);
  assert.equal(R(h).submit(res({ score: 50, t: 100 })), 1, 'o 1º resultado do Zé é o 1º dele, mesmo muito abaixo dos do A');
  assert.equal(R(h).submit(res({ score: 70, t: 101 })), 1); assert.equal(R(h).submit(res({ score: 60, t: 102 })), 2);
  assert.equal(plain(R(h).of(a, 1)).length, 10); assert.equal(plain(R(h).of(b, 1)).length, 3);
  assert.deepEqual(plain(R(h).of(b, 1)).map((e) => e.v), [70, 60, 50]);
  for (let i = 1; i <= 12; i++) R(h).submit(res({ score: 2000 + i, t: 200 + i }));              // Zé também só mantém 10
  assert.equal(plain(R(h).of(b, 1)).length, 10); assert.equal(plain(R(h).of(a, 1)).length, 10);
});
test('ranking por perfil: "todos os perfis" mostra só o melhor de cada perfil; limpar apaga só o do perfil atual', () => {
  const h = load(1), P = h.get('Profile'), a = P.cur().id;
  R(h).submit(res({ score: 500, t: 1 })); R(h).submit(res({ score: 800, t: 2 })); R(h).submit(res({ score: 300, t: 3 }));
  const b = P.create('Zé').id; P.switchTo(b); R(h).submit(res({ score: 600, t: 4 })); R(h).submit(res({ score: 100, t: 5 }));
  const best = plain(R(h).best(1)); assert.deepEqual(best.map((e) => [e.pid, e.v]), [[a, 800], [b, 600]]);
  R(h).clearProfile(b); assert.equal(plain(R(h).of(b, 1)).length, 0); assert.equal(plain(R(h).of(a, 1)).length, 3, 'o outro perfil fica intacto');
  const l5 = plain(R(h).best(5)); assert.equal(l5.length, 0);
  R(h).submit(res({ mode: 5, win: true, ms: 60000, t: 7 })); P.switchTo(a); R(h).submit(res({ mode: 5, win: true, ms: 40000, t: 8 })); R(h).submit(res({ mode: 5, win: true, ms: 90000, t: 9 }));
  assert.deepEqual(plain(R(h).best(5)).map((e) => e.v), [40000, 60000]); assert.deepEqual(plain(R(h).of(a, 5)).map((e) => e.v), [40000, 90000]);
});
test('ranking por perfil: tela mostra o ranking do perfil atual, alterna para "todos os perfis" e limpar só afeta o perfil atual', () => {
  const h = load(1), P = h.get('Profile');
  R(h).submit(res({ score: 500, t: 1 })); R(h).submit(res({ score: 300, t: 2 }));
  const id = P.create('Zé').id; P.switchTo(id); R(h).submit(res({ score: 900, t: 3 }));
  const rows = () => h.els.sheetBody.children.filter((c) => c.className === 'kv').map((c) => c.children[0].textContent);
  const texts = () => h.els.sheetBody.children.map((c) => c.textContent || '').join('|');
  h.sb.openRanking(1); assert.equal(rows().length, 1); assert.match(rows()[0], /Zé/); assert.match(texts(), /Ranking do perfil: Zé/);
  P.switchTo(P.list()[0].id); Sheet_close(h); h.sb.openRanking(1); assert.equal(rows().length, 2); assert.ok(rows().every((r) => /Jogador 1/.test(r)));
  Sheet_close(h); h.sb.openRanking(1, true); assert.equal(rows().length, 2); assert.ok(rows().some((r) => /Zé/.test(r)) && rows().some((r) => /Jogador 1/.test(r)), 'um de cada perfil');
  R(h).clearProfile(P.cur().id); assert.equal(plain(R(h).of(id, 1)).length, 1, 'perfil do Zé intacto');
});
function Sheet_close(h) { h.run('Sheet.stack = []; (function(){ const s = $("sheet"); if (s) s.classList.remove("on"); })()'); }
test('ranking: dados corrompidos não quebram; posição aparece no resultado; tela abre', () => {
  assert.equal(plain(load(1, { tetris__ranking: '{x' }).get('Ranking').load())[1].length, 0);
  assert.equal(plain(load(1, { tetris__ranking: '{"1":[{"v":"a"},{"v":5,"t":1,"pid":"p1"}]}' }).get('Ranking').load())[1].length, 1);
  const h = load(1); h.sb.newGame(1); h.G().score = 77; h.sb.gameOver();
  assert.ok(h.els.endStats.children.some((c) => /1º lugar/.test(c.textContent || '')));
  assert.doesNotThrow(() => { h.sb.openRanking(); h.sb.openRanking(5); });
});
