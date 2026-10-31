'use strict';
// Etapas 16-17: skins e temas + garantia de que o desenho (Canvas) executa sem erros.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

function renderAll(h) {
  h.sb.render();
  h.sb.newGame(3); h.setState('PLAY'); h.sb.render();
  h.setState('PAUSED'); h.sb.render();
  h.setState('OVER'); h.sb.render();
  h.setState('MENU'); h.sb.render();
}
test('render: todos os estados desenham sem erro para cada skin e cada tema embutido', () => {
  for (const skin of ['classic', 'flat', 'neon', 'gradient']) for (let th = 0; th < 4; th++) {
    const h = load(3); h.get('settings').skin = skin; h.get('settings').theme = th; h.sb.applyTheme();
    assert.doesNotThrow(() => renderAll(h), `${skin}/${th}`);
  }
});
test('skins: id inválido salvo cai para a clássica; escolha persiste', () => {
  assert.equal(load(1, { tetris_skin: 'xx' }).get('settings').skin, 'classic');
  const h = load(1); h.get('settings').skin = 'neon'; h.sb.saveSettings();
  assert.equal(load(1, h.store).get('settings').skin, 'neon');
});
test('skins: a skin não altera regras (mesma pontuação/estado)', () => {
  const run = (skin) => { const h = load(7); h.get('settings').skin = skin; h.sb.newGame(1, { seed: 5 }); h.setState('PLAY'); for (let i = 0; i < 6; i++) h.sb.hardDrop(); return JSON.stringify(plain(h.G().grid)) + h.G().score; };
  assert.equal(run('classic'), run('neon')); assert.equal(run('flat'), run('gradient'));
});
test('skins: cada skin desenha todas as peças', () => {
  const h = load(1);
  for (const [id] of plain(h.get('Skins').list)) for (const t of 'IJLOSTZ') assert.doesNotThrow(() => h.get('Skins').draw(h.get('canvas').getContext('2d'), 0, 0, 20, h.get('COLORS')[t], 0.5, id));
  assert.doesNotThrow(() => h.sb.openSkins());
});
test('cores padrão: contraste mínimo com o tabuleiro e peças distinguíveis', () => {
  const h = load(1); const T = h.get('Theme'); const th = plain(T.builtin(0));
  assert.equal(T.validate(Object.assign({}, th, { id: 'c1' }), true).ok, true, JSON.stringify(T.validate(Object.assign({}, th, { id: 'c1' }), true).errors));
  for (let i = 0; i < 4; i++) assert.equal(T.validate(Object.assign({}, plain(T.builtin(i)), { id: 'c1' }), true).ok, true, 'tema ' + i);
});

/* ---- Tema personalizado ---- */
const mk = (h, patch) => Object.assign({}, plain(h.get('Theme').blank()), patch || {});
test('tema: criar, usar, persistir e aplicar cores das peças', () => {
  const h = load(1); const T = h.get('Theme');
  const r = T.save(mk(h, { name: 'Sunset', acc: '#ff8844', pieces: Object.assign(plain(T.blank()).pieces, { I: '#00ffff' }) }));
  assert.equal(r.ok, true); assert.match(r.id, /^c\d+$/);
  h.sb.selectTheme(r.id);
  assert.equal(h.get('COLORS').I, '#00ffff'); assert.equal(h.get('settings').theme, r.id);
  assert.equal(h.store.tetris_index_bg, r.id);
  const h2 = load(2, h.store);
  assert.equal(h2.get('settings').theme, r.id); assert.equal(h2.get('COLORS').I, '#00ffff'); assert.equal(plain(h2.get('Theme').arr())[2], '#ff8844');
  assert.doesNotThrow(() => renderAll(h2));
});
test('tema: validação rejeita cor inválida, nome vazio, baixo contraste e peças parecidas', () => {
  const h = load(1); const T = h.get('Theme');
  const err = (p) => plain(T.save(mk(h, p)));
  assert.equal(err({ acc: 'red' }).ok, false);
  assert.equal(err({ name: '   ' }).ok, false);
  assert.match(err({ pieces: Object.assign(plain(T.blank()).pieces, { I: '#010101' }) }).errors.join(), /contraste/);
  assert.match(err({ pieces: Object.assign(plain(T.blank()).pieces, { J: '#22b59b' }) }).errors.join(), /parecidas/);
  assert.equal(T.customs().length, 0);
});
test('tema: nome é sanitizado e limitado; limite de 8 temas', () => {
  const h = load(1); const T = h.get('Theme');
  T.save(mk(h, { name: '<b>Muito longo nome de tema demais</b>' }));
  const n = plain(T.customs())[0].name; assert.ok(n.length <= 20 && !/[<>]/.test(n));
  for (let i = 0; i < 12; i++) T.save(mk(h, { name: 'T' + i }));
  assert.equal(T.customs().length, 8);
  assert.equal(plain(T.save(mk(h))).ok, false);
});
test('tema: tema salvo inexistente/corrompido volta ao padrão; excluir tema ativo volta ao padrão', () => {
  assert.equal(load(1, { tetris_index_bg: 'c99' }).get('Theme').cur().id, 0);
  assert.equal(load(1, { tetris_themes: '{{' }).get('Theme').customs().length, 0);
  const h = load(1); const id = h.get('Theme').save(mk(h)).id; h.sb.selectTheme(id); h.get('Theme').remove(id);
  assert.equal(h.get('settings').theme, 0); assert.equal(h.get('Theme').cur().id, 0);
});
test('tema: duplicar tema embutido e editar; exportar/importar com validação', () => {
  const h = load(1); const T = h.get('Theme');
  const d = T.duplicate(2); assert.ok(d); assert.equal(plain(T.get(d)).bg1, plain(T.builtin(2)).bg1);
  const json = T.exportJSON(d); assert.equal(JSON.parse(json).type, 'tetris-theme'); assert.equal(JSON.parse(json).theme.id, undefined);
  const h2 = load(1); assert.equal(plain(h2.get('Theme').importJSON(json)).ok, true); assert.equal(h2.get('Theme').customs().length, 1);
  for (const bad of ['', 'lixo', '{"type":"x"}', '{"type":"tetris-theme","v":2,"theme":{}}', '{"type":"tetris-theme","v":1,"theme":{"name":"x","bg1":"#zzz"}}'])
    assert.equal(plain(h2.get('Theme').importJSON(bad)).ok, false, bad);
  assert.equal(h2.get('Theme').customs().length, 1);
});
test('tema: botão THEME percorre embutidos e personalizados', () => {
  const h = load(1); const id = h.get('Theme').save(mk(h)).id;
  const seen = []; for (let i = 0; i < 6; i++) { h.els.bTheme.onclick(); seen.push(h.get('settings').theme); }
  assert.deepEqual(seen, [1, 2, 3, id, 0, 1]);
});
test('tema: telas de temas abrem', () => {
  const h = load(1); const id = h.get('Theme').save(mk(h)).id;
  assert.doesNotThrow(() => { h.sb.openThemes(); h.sb.openThemeEditor(null); h.sb.openThemeEditor(id); h.sb.openThemeExport(id); h.sb.openThemeImport(); });
});
