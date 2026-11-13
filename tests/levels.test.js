'use strict';
// Nível inicial: todos os níveis do motor (1–30) estão disponíveis, não só 1–15.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('folha "Nível inicial" oferece os 30 níveis e escolher um alto persiste', () => {
  const h = load(1); h.sb.openLevelSheet();
  const grid = h.els.sheetBody.children[0];
  assert.equal(grid.children.length, 30);
  assert.deepEqual(grid.children.map((b) => b.textContent), Array.from({ length: 30 }, (_, i) => String(i + 1)));
  grid.children[24].onclick();                                            // nível 25
  assert.equal(h.get('settings').startLevel, 25);
  assert.equal(load(1, h.store).get('settings').startLevel, 25, 'persiste');
});
test('nível inicial 30 vale na partida (gravidade máxima) e valores acima de 30 são limitados', () => {
  const h = load(1); h.get('settings').startLevel = 30; h.sb.newGame(1);
  assert.equal(h.G().level, 30); assert.equal(h.sb.gravFrames(30), 1); assert.ok(h.sb.gravFrames(20) > h.sb.gravFrames(30));
  assert.equal(load(1, { tetris_startLevel: '31' }).get('settings').startLevel, 30);
  assert.equal(load(1, { tetris_startLevel: '16' }).get('settings').startLevel, 16);
  assert.equal(load(1, { tetris_startLevel: '0' }).get('settings').startLevel, 1);
});
test('Zen: velocidade vai até o nível 30 e replay com nível inicial 16–30 é aceito (31 continua recusado)', () => {
  const h = load(1); h.get('Prefs').setZenLevel(22); assert.equal(h.get('Prefs').zenLevel(), 22);
  const R = h.get('Replays'), base = { v: 1, eng: h.get('ENGINE_VERSION'), mode: 1, seed: 7, sl: 20, opts: {}, ticks: 0, ev: [], res: { score: 0, lines: 0, level: 20, ms: 0 }, t: 0 };
  assert.ok(!R.validate(base).errors || !R.validate(base).errors.some((e) => /Nível inicial/.test(e)), 'nível 20 aceito');
  assert.ok(R.validate(Object.assign({}, base, { sl: 30 })).errors === undefined || !R.validate(Object.assign({}, base, { sl: 30 })).errors.some((e) => /Nível inicial/.test(e)));
  assert.ok(R.validate(Object.assign({}, base, { sl: 31 })).errors.some((e) => /Nível inicial/.test(e)), 'nível 31 recusado');
});
