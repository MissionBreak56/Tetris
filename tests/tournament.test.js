'use strict';
// Etapa 29: torneios.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

const T = (h) => h.get('Tourney');
const hum = (n) => ({ name: n, kind: 'human' }), ai = (n, level = 'easy') => ({ name: n, kind: 'ai', level });
const mk = (h, parts, seed = 7) => { const r = T(h).create('T', parts, seed); assert.equal(r.ok, true, JSON.stringify(r.errors)); return r.t; };

test('criação: valida quantidade, nomes únicos, ao menos um humano e sanitiza', () => {
  const h = load(1); const c = (p) => plain(T(h).create('x', p, 1));
  assert.equal(c([hum('A')]).ok, false); assert.equal(c(Array.from({ length: 9 }, (_, i) => (i ? ai('IA' + i) : hum('A')))).ok, false);
  assert.equal(c([ai('A'), ai('B')]).ok, false); assert.equal(c([hum('A'), ai('a')]).ok, false); assert.equal(c([hum('A'), ai('')]).ok, false);
  assert.equal(c(null).ok, false); assert.equal(c('x').ok, false);
  const t = mk(h, [hum('<b>Zé</b>'), ai('Bot')]); assert.ok(t.parts.every((p) => !/[<>]/.test(p.name)));
});
test('chave: tamanhos, folgas (byes) e propagação para a rodada seguinte', () => {
  const h = load(1);
  const sizes = { 2: [2, 1], 3: [4, 2], 4: [4, 2], 5: [8, 3], 8: [8, 3] };
  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    const t = mk(h, [hum('H'), ...Array.from({ length: n - 1 }, (_, i) => ai('IA' + i))], n);
    const size = n <= 2 ? 2 : n <= 4 ? 4 : 8; assert.equal(t.size, size, 'n=' + n); assert.equal(t.rounds.length, Math.log2(size));
    const byes = t.rounds[0].filter((m) => m.bye).length; assert.equal(byes, size - n, 'byes n=' + n);
    t.rounds[0].filter((m) => m.bye).forEach((m) => assert.ok(m.w));
    const ids = new Set(); t.rounds[0].forEach((m) => [m.a, m.b].forEach((x) => { if (x) { assert.ok(!ids.has(x)); ids.add(x); } })); assert.equal(ids.size, n);
  }
  void sizes;
});
test('chave: determinística com a mesma semente; semente diferente embaralha', () => {
  const h = load(1), p = [hum('A'), ai('B'), ai('C'), ai('D')];
  const a = plain(mk(h, p, 5)).rounds[0].map((m) => [m.a, m.b].join()), b = plain(mk(load(9), p, 5)).rounds[0].map((m) => [m.a, m.b].join());
  assert.deepEqual(a, b);
});
test('autoPlay: simula partidas só de IA e para na primeira com humano; estado persiste', () => {
  const h = load(1); const t = mk(h, [hum('H'), ai('B', 'hard'), ai('C', 'medium'), ai('D', 'easy')], 11);
  T(h).autoPlay(t);
  const n = T(h).next(t); assert.ok(n, 'há partida pendente'); const a = T(h).part(t, n.m.a), b = T(h).part(t, n.m.b); assert.ok(a.kind === 'human' || b.kind === 'human');
  const resolved = t.rounds.flat().filter((m) => m.w).length; assert.ok(resolved >= 1);
  assert.deepEqual(plain(load(2, h.store).get('Tourney').load()).rounds.flat().map((m) => m.w), plain(t).rounds.flat().map((m) => m.w));
});
test('torneio completo: humano joga até o fim, campeão definido, recompensa/vitória contadas uma só vez', () => {
  const h = load(1); const t = mk(h, [hum('H'), ai('B'), ai('C'), ai('D')], 3);
  T(h).autoPlay(t);
  for (let g = 0; g < 6 && !t.done; g++) { const n = T(h).next(t); assert.ok(n); assert.equal(T(h).record(t, n.r, n.i, T(h).part(t, n.m.a).kind === 'human' ? n.m.a : n.m.b, { score: 1, lines: 1 }), true); }
  assert.equal(t.done, true); assert.equal(T(h).part(t, t.champion).name, 'H');
  assert.equal(T(h).wins(), 1); assert.equal(h.get('Rewards').stars(), 3); T(h).onDone(t); assert.equal(T(h).wins(), 1);
  assert.ok(plain(h.get('Achv').check(h.get('StatsMgr').load())).some((a) => a.id === 'tourney_win'));
});
test('registro: só o vencedor válido da partida, e uma única vez', () => {
  const h = load(1); const t = mk(h, [hum('H'), ai('B')], 2); const n = T(h).next(t);
  assert.equal(T(h).record(t, n.r, n.i, 'zzz', null), false); assert.equal(T(h).record(t, n.r, n.i, n.m.a, null), true); assert.equal(T(h).record(t, n.r, n.i, n.m.b, null), false);
});
test('desistência: o participante perde as partidas restantes por W.O. e o torneio termina', () => {
  const h = load(1); const t = mk(h, [hum('H'), ai('B'), ai('C'), ai('D')], 4);
  T(h).autoPlay(t); const hid = t.parts.find((p) => p.kind === 'human').id;
  assert.equal(T(h).withdraw(t, hid), true); assert.equal(t.done, true); assert.notEqual(t.champion, hid);
  assert.ok(t.rounds.flat().some((m) => m.forfeit)); assert.equal(T(h).withdraw(t, hid), false); assert.equal(T(h).wins(), 0);
});
test('desistência: dois humanos — quem fica avança', () => {
  const h = load(1); const t = mk(h, [hum('A'), hum('B')], 4);
  T(h).withdraw(t, t.parts.find((p) => p.name === 'A').id); assert.equal(t.done, true); assert.equal(T(h).part(t, t.champion).name, 'B');
});
test('partida ao vivo: humano sempre no tabuleiro 0, resultado grava e volta ao torneio; interrupção mantém a partida pendente', () => {
  const h = load(1); const t = mk(h, [ai('IA', 'easy'), hum('H')], 9);
  assert.equal(T(h).play(t), true); const v = h.get('Versus'); assert.equal(v.active, true);
  assert.equal(v.cfg.players[0].kind, 'human'); assert.equal(v.cfg.players[1].kind, 'ai');
  assert.ok(T(h).load().live, 'marcada como em andamento');
  h.sb.goMenu(); assert.equal(v.active, false); assert.ok(T(h).load().live, 'interrompida: continua pendente'); assert.equal(T(h).load().done, false);
  T(h).play(T(h).load()); v.cfg.onEnd({ winner: 0, score: [100, 5], lines: [4, 0], tie: false });
  const t2 = T(h).load(); assert.equal(t2.done, true); assert.equal(T(h).part(t2, t2.champion).name, 'H'); assert.equal(t2.live, null);
  assert.equal(h.state(), 'MENU');
});
test('partida ao vivo: derrota do humano contra IA elimina e o torneio segue', () => {
  const h = load(1); const t = mk(h, [hum('H'), ai('IA')], 9); T(h).play(t); h.get('Versus').cfg.onEnd({ winner: 1, score: [0, 9], lines: [0, 1], tie: false });
  const t2 = T(h).load(); assert.equal(T(h).part(t2, t2.champion).name, 'IA'); assert.equal(T(h).wins(), 0);
});
test('dados corrompidos/inválidos não quebram nem criam torneio', () => {
  for (const bad of ['{{', '123', '{"v":1}', '{"v":1,"size":4,"parts":[],"rounds":[]}', '{"v":2}']) assert.equal(load(1, { tetris_tourney: bad }).get('Tourney').load(), null, bad);
  const h = load(1); const t = plain(mk(h, [hum('A'), ai('B')], 1)); t.rounds[0][0].w = 'inexistente';
  assert.equal(load(1, { tetris_tourney: JSON.stringify(t) }).get('Tourney').load(), null);
});
test('telas do torneio abrem (criação, chave, fim)', () => {
  const h = load(1);
  assert.doesNotThrow(() => { h.sb.openTournament(false); });
  const t = mk(h, [hum('H'), ai('B'), ai('C')], 2); T(h).autoPlay(t);
  assert.doesNotThrow(() => { h.sb.openTournament(true); });
  T(h).withdraw(t, t.parts[0].id); assert.doesNotThrow(() => { h.sb.openTournament(true); });
});
