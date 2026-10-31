'use strict';
// Etapas 10-13: tutorial, Zen, Sprint 40 e auditoria do modo Ultra (2 Minutes).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

const FILL = '#fff';
function fresh(mode = 1, store = {}, opts, seed = 1) { const h = load(seed, store); h.sb.newGame(mode, opts); h.setState('PLAY'); return h; }
function put(h, t, rot, x, y) { const G = h.G(); G.active = h.sb.makePiece(t); Object.assign(G.active, { rot, x, y, dx: x }); }
function rows(G, a, b, except = []) { for (let r = a; r < b; r++) for (let c = 0; c < 10; c++) G.grid[r][c] = except.includes(c) ? null : FILL; }
function clearOne(h) { rows(h.G(), 19, 20, [9]); put(h, 'I', 1, 7, 16); h.sb.lockPiece(); }

test('regras por modalidade', () => {
  const h = load(1); const R = (m, o) => plain(h.sb.rulesFor(m, o));
  assert.deepEqual([R(1).timeLimit, R(1).goal, R(1).levelUps, R(1).topout, R(1).skills], [null, null, true, 'over', false]);
  assert.equal(R(2).timeLimit, 120); assert.equal(R(3).skills, true);
  assert.deepEqual([R(4).topout, R(4).levelUps, R(4).fixedLevel, R(4).recordOnExit], ['reset', false, 1, true]);
  assert.deepEqual(R(5).goal, { type: 'lines', target: 40 }); assert.equal(R(5).levelUps, false);
  assert.equal(R(9).noGravity, true);
  assert.equal(R(4, { zenLevel: 7 }).fixedLevel, 7);
  assert.equal(R(1, { rules: { noHold: true } }).noHold, true);
});
test('semente: mesma semente reproduz peças e sorteios de jogo', () => {
  const seq = (sd) => { const h = fresh(1, {}, { seed: sd }); return [h.G().active.t, ...plain(h.G().queue)].join(''); };
  assert.equal(seq(123), seq(123)); assert.notEqual(seq(123), seq(124));
  const a = load(1).sb.mkRng(5), b = load(1).sb.mkRng(5);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
});

/* ---- Etapa 11: Zen ---- */
test('Zen: topo cheio limpa o tabuleiro em vez de game over e a pontuação continua', () => {
  const h = fresh(4); const G = h.G();
  G.score = 500; rows(G, 0, 2);
  h.sb.spawn();
  assert.equal(h.state(), 'PLAY'); assert.equal(G.over, false);
  assert.equal(G.grid.flat().filter(Boolean).length, 0); assert.equal(G.score, 500);
  put(h, 'I', 1, 3, -3); h.sb.lockPiece();                       // lock out também reseta
  assert.equal(h.state(), 'PLAY');
});
test('Zen: velocidade fixa, sem subir de nível e com nível configurável', () => {
  const h = fresh(4, {}, { zenLevel: 6 }); const G = h.G();
  assert.equal(G.level, 6);
  G.lines = 9; clearOne(h); assert.equal(G.level, 6);
  assert.equal(h.sb.gravFrames(G.level), 23);
});
test('Zen: sessão salva ao sair (estatísticas/histórico) mas sem recorde de modo oficial; sem tempo mínimo não salva', () => {
  const h = fresh(4); h.G().score = 4000; h.G().ms = 20000; h.sb.leaveGame();
  assert.equal(h.state(), 'MENU');
  assert.equal(plain(h.get('StatsMgr').load()).modes[4].games, 1);
  assert.equal(h.get('History').load()[0].m, 4);
  for (const k of ['tetris_bestScore', 'tetris_bestScore2Minutes', 'tetris_bestScoreStrategy', 'tetris_bestSprintMs']) assert.equal(h.store[k], undefined);
  const g = fresh(4); g.G().ms = 1000; g.sb.leaveGame();
  assert.equal(g.get('History').load().length, 0);
});
test('Zen: preferência de velocidade persiste e é limitada a 1..15', () => {
  const h = load(1); h.get('Prefs').setZenLevel(99); assert.equal(load(1, h.store).get('Prefs').zenLevel(), 15);
  h.get('Prefs').setZenLevel(-3); assert.equal(h.get('Prefs').zenLevel(), 1);
});

/* ---- Etapa 12: Sprint 40 ---- */
test('Sprint: termina ao atingir 40 linhas, marca vitória e salva o tempo como recorde', () => {
  const h = fresh(5); const G = h.G(); G.lines = 39; G.ms = 61234;
  clearOne(h);
  assert.equal(G.lines, 40); assert.equal(G.won, true); assert.equal(h.state(), 'OVER');
  assert.equal(h.store.tetris_bestSprintMs, '61234');
  assert.equal(h.els.endTitle.textContent, 'NEW RECORD!');
  assert.equal(plain(h.get('StatsMgr').load()).modes[5].wins, 1);
  assert.ok(plain(h.get('Achv').load()).sprint);
});
test('Sprint: tempo maior não substitui recorde; topout não conta; nível fixo', () => {
  const h = fresh(5, { tetris_bestSprintMs: '50000' }); const G = h.G(); G.lines = 39; G.ms = 70000; clearOne(h);
  assert.equal(h.store.tetris_bestSprintMs, '50000'); assert.equal(h.els.endTitle.textContent, 'COMPLETE!');
  const g = fresh(5); g.G().ms = 1000; g.G().lines = 12; g.sb.gameOver();
  assert.equal(g.store.tetris_bestSprintMs, undefined); assert.equal(g.G().won, undefined);
  const f = fresh(5); f.G().lines = 29; clearOne(f); assert.equal(f.G().level, 1);
});
test('Sprint: o relógio só avança em PLAY (pausa não conta)', () => {
  const h = fresh(5); put(h, 'T', 0, 3, 5); h.sb.update(1); h.setState('PAUSED'); h.sb.update(10);
  assert.equal(Math.round(h.G().ms), 1000);
});

/* ---- Etapa 13: Ultra (auditoria: "2 MINUTES" já é o Ultra) ---- */
test('Ultra: 2 Minutes tem contagem regressiva de 120 s, termina com objetivo cumprido e grava maior pontuação', () => {
  const h = fresh(2); h.G().active = null; h.G().score = 4321;
  for (let i = 0; i < 120; i++) h.sb.update(1);
  assert.equal(h.state(), 'OVER'); assert.equal(h.G().won, true);
  assert.equal(h.store.tetris_bestScore2Minutes, '4321');
  assert.equal(h.get('History').load()[0].m, 2);
});
test('Ultra: não há modo duplicado (um único modo cronometrado oficial)', () => {
  const h = load(1); const names = Object.values(plain(h.get('MODE_NAMES')));
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.filter((n) => /minut/i.test(n)).length, 1);
});

/* ---- Etapa 10: Tutorial ---- */
test('tutorial: percorre todos os passos com o motor real e volta ao menu sem gravar nada', () => {
  const h = load(1); h.sb.startTutorial(0); h.setState('PLAY');
  const G = () => h.G(), step = () => h.get('Tut').step, tick = () => h.sb.update(0.016);
  assert.equal(step(), 0);
  put(h, 'T', 0, 3, 5);
  h.sb.move(1); h.sb.move(-1); h.sb.move(1); tick(); assert.equal(step(), 1);
  h.sb.rotate(1); h.sb.rotate(1); tick(); assert.equal(step(), 2);
  tick(); assert.equal(step(), 2, 'passo manual espera "Entendi"');
  h.get('Tut').event('ok'); tick(); assert.equal(step(), 3);
  G().soft = true; tick(); tick(); tick(); tick(); G().soft = false; assert.equal(step(), 4);
  const y0 = G().active.y; tick(); assert.equal(G().active.y, y0, 'sem gravidade no tutorial');
  h.sb.hardDrop(); tick(); assert.equal(step(), 5);
  h.sb.hold(); tick(); assert.equal(step(), 6);
  tick();                                                          // prepara a linha quase completa
  assert.equal(G().active.t, 'I'); assert.equal(G().grid[19].filter(Boolean).length, 6);
  put(h, 'I', 0, 3, 18); h.sb.hardDrop(); tick();
  assert.equal(h.state(), 'MENU');
  assert.equal(h.get('Tut').saved().done, true);
  assert.equal(plain(h.get('StatsMgr').load()).all.games, 0); assert.equal(h.get('History').load().length, 0);
  assert.deepEqual(plain(h.get('Achv').load()), {});
});
test('tutorial: pular marca como concluído; progresso parcial é lembrado e topo cheio não é game over', () => {
  const h = load(1); h.sb.startTutorial(0); h.setState('PLAY');
  h.get('Tut').step = 3; h.get('Tut').save(false);
  assert.equal(load(1, h.store).get('Tut').saved().step, 3);
  rows(h.G(), 0, 2); h.sb.spawn(); assert.equal(h.state(), 'PLAY');
  h.get('Tut').skip(); assert.equal(h.state(), 'MENU'); assert.equal(h.get('Tut').saved().done, true);
});
test('tutorial: dados salvos corrompidos não quebram', () => {
  assert.doesNotThrow(() => load(1, { tetris_tut: 'xx' }).get('Tut').saved());
  assert.equal(load(1, { tetris_tut: '{"step":99}' }).get('Tut').saved().step, 6);
});
test('menu de modos abre sem erro', () => {
  const h = load(1); assert.doesNotThrow(() => { h.sb.openModesSheet(); });
});
