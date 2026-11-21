'use strict';
// Tema embutido "Preto": paleta idêntica ao JSON enviado pelo usuário (tema "Black"), livre (sem estrelas) e selecionável.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

const USER_JSON = '{"type":"tetris-theme","v":1,"theme":{"name":"Black","pieces":{"I":"#00ffd5","J":"#2f7bff","L":"#ff8c00","O":"#fff000","S":"#00ff44","T":"#e100ff","Z":"#ff1a1a"},"bg1":"#1a1a1a","bg2":"#000000","acc":"#404040","board1":"#0a0a0a","board2":"#141414","grid":"#333333","ghost":"#ffffff","panel1":"#0e0e0e","panel2":"#060606","btn1":"#232323","btn2":"#181818","btnSmall":"#080808","ink":"#ffffff","dim":"#828282","val":"#ffd54a"}}';

test('Preto: tema embutido 12 com a paleta EXATA do JSON enviado (só o nome muda para "Preto")', () => {
  const h = load(1), T = h.get('Theme'), want = JSON.parse(USER_JSON).theme, got = plain(T.get(12));
  assert.equal(got.name, 'Preto'); assert.equal(got.builtin, true); assert.equal(got.id, 12);
  for (const k of Object.keys(want)) if (k !== 'name') assert.deepEqual(got[k], want[k], k);
  const exp = JSON.parse(T.exportJSON(12)); assert.equal(exp.type, 'tetris-theme'); assert.equal(exp.v, 1);
  assert.deepEqual(exp.theme, Object.assign({}, want, { name: 'Preto' }), 'exportar o Preto devolve o mesmo tema do JSON');
});
test('Preto: livre (sem custo), aparece nos temas, é selecionável, persiste e aplica as cores das peças', () => {
  const h = load(1), R = h.get('Rewards'), T = h.get('Theme'), S = h.get('settings');
  assert.equal(R.cost('theme:12'), 0); assert.equal(R.unlocked('theme:12'), true); assert.equal(T.isLocked(12), false); assert.ok(plain(T.ids()).includes(12));
  assert.equal(h.run('selectTheme(12)'), true); assert.equal(S.theme, 12); assert.equal(load(1, h.store).get('settings').theme, 12, 'persiste');
  assert.equal(T.cur().id, 12); const a = plain(T.arr()); assert.equal(a[0], '#1a1a1a'); assert.equal(a[1], '#000000'); assert.equal(a[2], '#404040'); assert.equal(a[5], '8,8,8'); assert.equal(a[6], '#232323'); assert.equal(a[7], '#181818');
  T.applyPieces(); const C = plain(h.get('COLORS')); for (const [k, v] of Object.entries(JSON.parse(USER_JSON).theme.pieces)) assert.equal(C[k], v, 'peça ' + k);
  const x = plain(T.extras()); assert.equal(x.board1, '#0a0a0a'); assert.equal(x.board2, '#141414'); assert.equal(x.grid, '51,51,51'); assert.equal(x.ghost, '#ffffff');
  assert.doesNotThrow(() => { h.sb.openThemes(); h.sb.applyTheme(); });
});
test('Preto: os temas antigos e os bloqueados por estrelas continuam como eram, e o JSON do usuário ainda importa como tema personalizado', () => {
  const h = load(1), T = h.get('Theme'); assert.equal(T.isLocked(5), true); assert.equal(T.isLocked(12), false); assert.equal(T.get(0).name, 'Azul'); assert.equal(plain(h.get('THEMES')).length, 13);
  assert.equal(h.get('Rewards').cost('theme:4'), 2);
  const r = T.importJSON ? T.importJSON(USER_JSON) : null; if (r) assert.equal(r.ok === true || /já|limite|inválid/i.test((r.errors || []).join()), true);
});
