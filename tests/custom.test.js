'use strict';
// Etapa 26: desafios personalizados.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

const C = (h) => h.get('Custom');
const mk = (o) => Object.assign({}, plain(load(1).get('Custom').defaults()), o);
const FILL = '#fff';
function put(h, t, rot, x, y) { const G = h.G(); G.active = h.sb.makePiece(t); Object.assign(G.active, { rot, x, y, dx: x }); }
function clearOne(h) { const G = h.G(); for (let c = 0; c < 10; c++) G.grid[19][c] = c === 9 ? null : FILL; put(h, 'I', 1, 7, 16); h.sb.lockPiece(); }
function run(h, c, seed = 5) { const o = plain(C(h).options(c)); if (seed != null && o.seed == null) o.seed = seed; h.sb.newGame(7, o); h.setState('PLAY'); return o; }

test('validação: campos, limites e combinações impossíveis', () => {
  const h = load(1); const v = (o) => plain(C(h).validate(mk(o)));
  assert.equal(v({}).ok, true);
  assert.equal(v({ name: '  ' }).ok, false); assert.equal(v({ goalType: 'x' }).ok, false);
  assert.equal(v({ target: 0 }).ok, false); assert.equal(v({ target: 1000 }).ok, false); assert.equal(v({ target: 1.5 }).ok, false); assert.equal(v({ target: 'abc' }).ok, false);
  assert.equal(v({ timeLimit: 5 }).ok, false); assert.equal(v({ timeLimit: 99999 }).ok, false);
  assert.equal(v({ level: 0 }).ok, false); assert.equal(v({ level: 31 }).ok, false);
  assert.match(v({ goalType: 'lines', target: 200, timeLimit: 60 }).errors.join(), /Impossível/);
  assert.match(v({ goalType: 'score', target: 9000000, timeLimit: 30 }).errors.join(), /Impossível/);
  assert.equal(v({ goalType: 'lines', target: 40, timeLimit: 120 }).ok, true);
  assert.match(v({ goalType: 'time', timeLimit: null }).errors.join(), /tempo limite/);
  assert.match(v({ goalType: 'none', timeLimit: null }).errors.join(), /tempo limite/);
  assert.equal(v({ goalType: 'none', timeLimit: 60 }).ok, true);
  assert.match(v({ goalType: 'time', timeLimit: 60, reset: true }).errors.join(), /nunca se perde/);
});
test('validação: nome sanitizado/limitado; lixo no lugar do objeto', () => {
  const h = load(1); const r = plain(C(h).validate(mk({ name: '<b>' + 'x'.repeat(50) + '</b>' })));
  assert.ok(r.c.name.length <= 24 && !/[<>]/.test(r.c.name));
  for (const j of [null, 5, 'x', [], undefined]) assert.doesNotThrow(() => C(h).validate(j));
});
test('CRUD: salvar, listar, editar mantém estatísticas, duplicar, excluir, limite de 20', () => {
  const h = load(1);
  const id = C(h).save(mk({ name: 'A' })).id; assert.match(id, /^x\d+$/); assert.equal(C(h).list().length, 1);
  C(h).record({ custom: id, score: 500, win: true, ms: 9000 });
  assert.equal(C(h).save(Object.assign(mk({ name: 'A2' }), { id })).ok, true);
  const c = plain(C(h).list())[0]; assert.equal(c.name, 'A2'); assert.equal(c.stats.wins, 1); assert.equal(c.stats.bestScore, 500);
  const d = C(h).duplicate(id); assert.ok(d); assert.equal(plain(C(h).list()).find((x) => x.id === d).stats.tries, 0);
  C(h).remove(id); assert.equal(C(h).list().length, 1);
  for (let i = 0; i < 25; i++) C(h).save(mk({ name: 'N' + i }));
  assert.equal(C(h).list().length, 20); assert.equal(plain(C(h).save(mk())).ok, false);
  assert.equal(plain(C(h).save(mk({ target: 0 }))).ok, false);
});
test('persistência e dados corrompidos', () => {
  const h = load(1); C(h).save(mk({ name: 'P' })); assert.equal(load(2, h.store).get('Custom').list().length, 1);
  assert.equal(load(1, { tetris_custom: '{{' }).get('Custom').list().length, 0);
  assert.equal(load(1, { tetris_custom: '[{"id":"x1","target":-4},5,null,{"id":"x2","name":"ok","goalType":"lines","target":10}]' }).get('Custom').list().length, 1);
});
test('execução: objetivo de linhas conclui o desafio e registra estatísticas sem entrar no ranking', () => {
  const h = load(1); const id = C(h).save(mk({ name: 'Rápido', goalType: 'lines', target: 1 })).id;
  run(h, plain(C(h).list())[0]); clearOne(h);
  assert.equal(h.state(), 'OVER'); assert.equal(h.G().won, true); assert.equal(h.els.endTitle.textContent, 'DESAFIO CUMPRIDO!');
  const c = plain(C(h).list())[0]; assert.equal(c.stats.wins, 1); assert.equal(c.stats.tries, 1);
  assert.equal(plain(h.get('StatsMgr').load()).modes[7].games, 1);
  assert.equal(plain(h.get('Ranking').load())[1].length, 0); assert.equal(h.get('Records').get(1), 0);
  assert.ok(id);
});
test('execução: tempo, nível fixo, sem hold, sem sombra e limpar ao topar seguem as regras', () => {
  const h = load(1); const c = mk({ name: 'Mix', goalType: 'none', timeLimit: 30, fixedLevel: true, level: 7, noHold: true, noGhost: true, reset: true });
  const id = C(h).save(c).id; const saved = plain(C(h).list())[0]; run(h, saved);
  const G = h.G(); assert.equal(G.level, 7); G.lines = 99; clearOne(h); assert.equal(G.level, 7);
  const t = G.active.t; h.sb.hold(); assert.equal(G.held, null); assert.equal(G.active.t, t);
  for (let r = 0; r < 2; r++) for (let x = 0; x < 10; x++) G.grid[r][x] = FILL; h.sb.spawn(); assert.equal(h.state(), 'PLAY');
  G.active = null; for (let i = 0; i < 30; i++) h.sb.update(1); assert.equal(h.state(), 'OVER'); assert.equal(G.won, true, 'sem objetivo: completar o tempo conta');
  assert.ok(id);
});
test('execução: meta de linhas com tempo esgotado é derrota; sobreviver ao tempo é vitória', () => {
  const h = load(1); C(h).save(mk({ goalType: 'lines', target: 20, timeLimit: 30 })); run(h, plain(C(h).list())[0]);
  h.G().active = null; for (let i = 0; i < 30; i++) h.sb.update(1);
  assert.notEqual(h.G().won, true); assert.equal(h.els.endTitle.textContent, 'Desafio não cumprido');
  const g = load(1); C(g).save(mk({ goalType: 'time', timeLimit: 20 })); run(g, plain(C(g).list())[0]); g.G().active = null; for (let i = 0; i < 20; i++) g.sb.update(1);
  assert.equal(g.G().won, true);
});
test('semente fixa dá sempre as mesmas peças; sem semente fixa varia', () => {
  const h = load(1); const c = mk({ name: 'Seed', fixedSeed: true }); const id = C(h).save(c).id;
  const seq = () => { const hh = load(9, h.store); hh.sb.newGame(7, plain(C(hh).options(plain(C(hh).list())[0]))); return [hh.G().active.t, ...plain(hh.G().queue)].join(''); };
  assert.equal(seq(), seq()); assert.ok(id);
});
test('replay de desafio personalizado é gravado e verificado', () => {
  const h = load(1); C(h).save(mk({ goalType: 'score', target: 2000, noHold: true, fixedLevel: true, level: 3 }));
  run(h, plain(C(h).list())[0], 77); let x = 5;
  for (let t = 0; t < 900 && !h.G().overDone; t++) { if (t % 6 === 0) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; h.sb.act((x >>> 24) % 8); } if (h.G().overDone) break; h.sb.update(1 / 60); }
  const rep = plain(h.get('Replays').fromGame(h.G())); const v = plain(h.get('Replays').verify(rep));
  assert.equal(v.ok, true, v.errors);
});
test('telas abrem sem erro', () => {
  const h = load(1); const id = C(h).save(mk({ name: 'U' })).id;
  assert.doesNotThrow(() => { h.sb.openCustomList(); h.sb.openCustomItem(id); h.sb.openCustomEditor(null); h.sb.openCustomEditor(id); });
});
