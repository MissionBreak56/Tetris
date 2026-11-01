'use strict';
// Etapas 21-22: replays determinísticos, validação, exportação/importação.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

/** Joga uma partida "roteirizada" (ações pseudoaleatórias fixas) e devolve o replay gravado. */
function scripted(h, mode, seed, ticks = 1500, opts = {}) {
  h.sb.newGame(mode, Object.assign({ seed }, opts)); h.setState('PLAY');
  let x = (seed * 2654435761) >>> 0;
  for (let t = 0; t < ticks && !h.G().overDone; t++) {
    if (t % 7 === 0) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; h.sb.act((x >>> 24) % 8); }
    if (h.G().overDone) break;
    h.sb.update(1 / 60);
  }
  return plain(h.get('Replays').fromGame(h.G()));
}
const R = (h) => h.get('Replays');

test('replay: reproduzir a partida gravada dá exatamente o mesmo resultado (todos os modos)', () => {
  for (const [mode, opts] of [[1, {}], [2, {}], [3, {}], [4, { zenLevel: 5 }], [5, {}], [7, { rules: { goal: { type: 'score', target: 800 }, noHold: true } }]]) {
    const h = load(mode * 11);
    const rep = scripted(h, mode, 1000 + mode, 1800, opts);
    const v = plain(R(h).verify(rep));
    assert.equal(v.ok, true, `modo ${mode}: ${v.errors}`);
    assert.equal(v.result.score, rep.res.score);
  }
});
test('replay: resultado independe do Math.random visual e de execuções repetidas', () => {
  const a = load(1), b = load(999);
  const rep = scripted(a, 3, 4242, 2500);
  const r1 = plain(R(a).simulate(rep)), r2 = plain(R(b).simulate(rep)), r3 = plain(R(a).simulate(rep));
  assert.deepEqual(r1, r2); assert.deepEqual(r1, r3);
});
test('replay: simular não altera o estado atual do app nem grava nada', () => {
  const h = load(1); const rep = scripted(h, 1, 5, 600); h.sb.newGame(1); h.setState('PLAY'); const g = h.G(), s = g.score;
  const hist = h.get('History').load().length, games = plain(h.get('StatsMgr').load()).all.games;
  R(h).simulate(rep);
  assert.equal(h.G(), g); assert.equal(h.G().score, s); assert.equal(h.state(), 'PLAY');
  assert.equal(h.get('History').load().length, hist); assert.equal(plain(h.get('StatsMgr').load()).all.games, games);
});
test('replay GOLDEN: resultado fixo da versão do motor (se falhar, aumente ENGINE_VERSION)', () => {
  const h = load(1); const rep = scripted(h, 1, 177, 2400);
  assert.equal(h.get('ENGINE_VERSION'), 'E2');
  assert.deepEqual(rep.res, { score: GOLD.score, lines: GOLD.lines, level: GOLD.level, ms: GOLD.ms });
  assert.equal(rep.ticks, GOLD.ticks);
});
const GOLD = { score: 353, lines: 1, level: 1, ms: 10500, ticks: 630 };

test('replay: validação estrutural rejeita dados inválidos', () => {
  const h = load(1); const ok = scripted(h, 1, 9, 400); assert.equal(plain(R(h).validate(ok)).ok, true);
  const bad = (patch) => plain(R(h).validate(Object.assign({}, ok, patch)));
  assert.equal(bad({ eng: 'E0' }).ok, false); assert.equal(bad({ v: 2 }).ok, false); assert.equal(bad({ mode: 8 }).ok, false); assert.equal(bad({ mode: 0 }).ok, false);
  assert.equal(bad({ seed: -1 }).ok, false); assert.equal(bad({ seed: 1.5 }).ok, false); assert.equal(bad({ sl: 99 }).ok, false);
  assert.equal(bad({ ticks: 999999999 }).ok, false); assert.equal(bad({ ev: [1, 2, 3] }).ok, false); assert.equal(bad({ ev: [0, 9] }).ok, false);
  assert.equal(bad({ ev: [-1, 2] }).ok, false); assert.equal(bad({ ev: [0, 'x'] }).ok, false); assert.equal(bad({ ev: [500, 1] , ticks: 10 }).ok, false);
  assert.equal(bad({ opts: { rules: { hack: 1 } } }).ok, false); assert.equal(bad({ opts: { rules: { timeLimit: -5 } } }).ok, false);
  assert.equal(bad({ opts: { rules: { goal: { type: 'lines', target: 0 } } } }).ok, false); assert.equal(bad({ res: { score: -1, lines: 0, level: 1, ms: 0 } }).ok, false);
  for (const junk of [null, 5, 'x', [], {}]) assert.equal(plain(R(h).validate(junk)).ok, false);
});
test('replay: resultado adulterado ou eventos alterados não passam na verificação', () => {
  const h = load(1); const rep = scripted(h, 1, 77, 1500);
  assert.equal(plain(R(h).verify(Object.assign({}, rep, { res: Object.assign({}, rep.res, { score: rep.res.score + 100 }) }))).ok, false);
  assert.equal(plain(R(h).verify(Object.assign({}, rep, { seed: rep.seed + 1 }))).ok, false);
  assert.equal(plain(R(h).verify(Object.assign({}, rep, { ticks: rep.ticks - 100 }))).ok, false);
  const ev = rep.ev.slice(); ev.splice(0, 4);   // remove as duas primeiras ações
  assert.equal(plain(R(h).verify(Object.assign({}, rep, { ev }))).ok, false);
});
test('replay: codificação delta é reversível', () => {
  const R0 = load(1).get('Replays'); const ev = [0, 1, 0, 2, 5, 3, 130, 4];
  assert.deepEqual(plain(R0.dec(R0.enc(ev))), ev);
});

/* ---- armazenamento ---- */
function finish(h, mode = 1, seed = 3, ticks = 400) { scripted(h, mode, seed, ticks); h.sb.gameOver(); }
test('replay: partida terminada é gravada; só as 10 mais recentes (não favoritas) ficam', () => {
  const h = load(1);
  for (let i = 0; i < 13; i++) { finish(h, 1, 100 + i); }
  const l = plain(R(h).load()); assert.equal(l.length, 10);
  assert.ok(l.every((x) => R(h).verify(x.rep).ok));
});
test('replay: favoritos são preservados, limitados a 10, e podem ser removidos', () => {
  const h = load(1);
  finish(h, 1, 1); const id = plain(R(h).load())[0].id; assert.equal(R(h).setFav(id, true), true);
  for (let i = 0; i < 12; i++) finish(h, 1, 50 + i);
  assert.ok(plain(R(h).load()).some((x) => x.id === id && x.fav));
  R(h).remove(id); assert.ok(!plain(R(h).load()).some((x) => x.id === id));
  assert.equal(R(h).setFav(123456, true), false);
});
test('replay: tutorial, partidas curtas e dados corrompidos não entram na lista', () => {
  const h = load(1); h.sb.newGame(9); h.setState('PLAY'); for (let i = 0; i < 100; i++) h.sb.update(1 / 60); h.sb.gameOver();
  assert.equal(R(h).load().length, 0);
  h.sb.newGame(1); h.sb.gameOver(); assert.equal(R(h).load().length, 0, 'menos de 1 s');
  const g = load(1, { tetris_replays: '[{"id":1,"rep":{"v":9}},"x",null]' }); assert.equal(R(g).load().length, 0);
  assert.equal(load(1, { tetris_replays: '{{' }).get('Replays').load().length, 0);
});
test('replay: gravar não interfere nos recordes/estatísticas (apenas o fluxo normal grava)', () => {
  const h = load(1); finish(h, 1, 8);
  assert.equal(plain(h.get('StatsMgr').load()).all.games, 1);
  const rep = plain(R(h).load())[0].rep; R(h).simulate(rep);
  assert.equal(plain(h.get('StatsMgr').load()).all.games, 1);
});

/* ---- reprodução ---- */
test('reprodução: chega ao mesmo resultado, respeita pausa/velocidade e não grava estatísticas', () => {
  const h = load(1); const rep = scripted(h, 1, 31, 900);
  const games0 = plain(h.get('StatsMgr').load()).all.games, hist0 = h.get('History').load().length;
  assert.equal(plain(h.get('Replay').play(rep)).ok, true); assert.equal(h.state(), 'REPLAY');
  const c = h.get('Replay').cur;
  h.get('Replay').toggle(); const t0 = h.G().tick; h.get('Replay').frame(1); assert.equal(h.G().tick, t0, 'pausado');
  h.get('Replay').toggle(); h.get('Replay').speed(); assert.equal(c.speed, 2);
  for (let i = 0; i < 2000 && !c.done; i++) h.get('Replay').frame(1 / 60);
  assert.equal(c.done, true); assert.equal(Math.round(h.G().score), rep.res.score); assert.equal(h.G().lines, rep.res.lines);
  assert.equal(plain(h.get('StatsMgr').load()).all.games, games0); assert.equal(h.get('History').load().length, hist0);
  h.get('Replay').toggle(); assert.equal(h.get('Replay').cur.done, false, 'reiniciar');
  h.sb.goMenu(); assert.equal(h.get('Replay').cur, null);
});
test('reprodução: replay inválido não inicia', () => {
  const h = load(1); const rep = scripted(h, 1, 31, 300);
  const r = plain(h.get('Replay').play(Object.assign({}, rep, { eng: 'X' }))); assert.equal(r.ok, false); assert.notEqual(h.state(), 'REPLAY');
});
test('botão voltar: fecha confirmação > folha > pausa/retoma > sai do replay', () => {
  const h = load(1); h.get('Hub').open(); assert.equal(h.els.sheet.classList.contains('on'), true);
  h.sb.handleBack(); assert.equal(h.els.sheet.classList.contains('on'), false);
  h.sb.newGame(1); h.setState('PLAY'); h.sb.handleBack(); assert.equal(h.state(), 'PAUSED'); h.sb.handleBack(); assert.equal(h.state(), 'PLAY');
  const rep = scripted(h, 1, 3, 300); h.get('Replay').play(rep); h.sb.handleBack(); assert.equal(h.state(), 'MENU');
});

/* ---- Etapa 22: exportar / importar ---- */
test('exportar/importar: ida e volta em outro perfil/aparelho', () => {
  const a = load(1); finish(a, 1, 61, 500);
  const rep = plain(R(a).load())[0].rep; const text = R(a).pack(rep);
  const b = load(2); const r = plain(R(b).importText(text));
  assert.equal(r.ok, true, r.errors); assert.equal(plain(R(b).load()).length, 1);
  assert.deepEqual(plain(R(b).load())[0].rep, rep);
  assert.equal(plain(R(b).importText(text)).ok, false, 'duplicado');
});
test('importar: rejeita lixo, checksum errado, versão errada, adulteração e tamanho excessivo', () => {
  const a = load(1); finish(a, 1, 62, 500); const rep = plain(R(a).load())[0].rep; const text = R(a).pack(rep);
  const b = load(2); const imp = (t) => plain(R(b).importText(t));
  for (const bad of ['', '   ', 'abc', '{}', '{"type":"x"}', null, 42]) assert.equal(imp(bad).ok, false, String(bad));
  const o = JSON.parse(text);
  assert.equal(imp(JSON.stringify(Object.assign({}, o, { sum: '0' }))).ok, false);
  assert.equal(imp(JSON.stringify(Object.assign({}, o, { v: 2 }))).ok, false);
  const tam = JSON.parse(text); tam.data.res.score += 5; assert.match(imp(JSON.stringify(tam)).errors.join(), /Checksum/);
  const fix = JSON.parse(text); fix.data.res.score += 5; fix.sum = h0(fix.data); assert.match(imp(JSON.stringify(fix)).errors.join(), /não reproduz/);
  assert.equal(imp('x'.repeat(2000000)).ok, false);
  assert.equal(R(b).load().length, 0);
});
function h0(d) { return load(1).get('fnv')(JSON.stringify(d)); }
test('telas de replay abrem sem erro; Native sem Android usa alternativas', () => {
  const h = load(1); finish(h, 1, 70, 400); const id = plain(R(h).load())[0].id;
  assert.doesNotThrow(() => { h.sb.openReplays(); h.sb.openReplayItem(id); h.sb.openReplayExport(id); h.sb.openReplayImport(); });
  assert.equal(h.get('Native').available(), false);
  let ok; h.get('Native').saveFile('a.json', 'application/json', '{}', (r) => { ok = r; }); assert.equal(typeof ok, 'boolean');
});
