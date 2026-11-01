'use strict';
// Etapa 25: caches do Canvas e economia de quadros (não mudam o visual nem as regras).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

function fakeMain(counter) { return { canvas: { id: 'cv' }, globalAlpha: 1, drawImage() { counter.n++; } }; }

test('sprite: bloco do canvas principal é pré-renderizado uma vez por (skin,cor,tamanho) e reutilizado', () => {
  const h = load(1); const S = h.get('Skins'); const cnt = { n: 0 }; const c = fakeMain(cnt);
  for (let i = 0; i < 50; i++) S.draw(c, i, i, 24, '#22b59a', 1, 'classic');
  assert.equal(cnt.n, 50); assert.equal(S._sprites.size, 1);
  S.draw(c, 0, 0, 24, '#22b59a', 1, 'neon'); S.draw(c, 0, 0, 30, '#22b59a', 1, 'classic'); S.draw(c, 0, 0, 24, '#d93a3a', 1, 'classic');
  assert.equal(S._sprites.size, 4);
});
test('sprite: cache tem limite e canvases de pré-visualização não usam cache', () => {
  const h = load(1); const S = h.get('Skins'); const cnt = { n: 0 }; const c = fakeMain(cnt);
  for (let i = 0; i < 500; i++) S.draw(c, 0, 0, 10 + i * 0.5, '#22b59a', 1, 'flat');
  assert.ok(S._sprites.size <= 401);
  const before = S._sprites.size, other = h.get('canvas').getContext('2d');
  assert.doesNotThrow(() => S.draw(other, 0, 0, 20, '#22b59a', 1, 'classic'));
  assert.equal(S._sprites.size, before);
});
test('shade: resultado em cache é idêntico e estável', () => {
  const h = load(1); assert.equal(h.sb.shade('#22b59a', 0.5), h.sb.shade('#22b59a', 0.5)); assert.equal(h.sb.shade('#000000', -0.3), 'rgb(0,0,0)'); assert.equal(h.sb.shade('#ffffff', 0.5), 'rgb(255,255,255)');
});
test('camadas estáticas: refeitas só quando a chave muda (tema/tamanho)', () => {
  const h = load(1); let paints = 0;
  const l = h.sb.layer; const key = (k) => l('t', k, 100, 100, () => { paints++; });
  key('a'); key('a'); key('a'); assert.equal(paints, 1); key('b'); assert.equal(paints, 2);
});
test('renderizar muitos quadros no mesmo tema pinta o fundo/moldura uma única vez', () => {
  const h = load(1); h.sb.newGame(1); h.setState('PLAY');
  for (let i = 0; i < 30; i++) { h.sb.updateFx(0.016); h.sb.render(); }
  const l1 = h.get('LC').bg.cv, f1 = h.get('LC').frame.cv;
  h.get('settings').theme = 2; h.sb.applyTheme(); h.sb.render();
  assert.ok(h.get('LC').bg.key !== undefined && h.get('LC').frame.key !== undefined);
  assert.equal(h.get('LC').bg.cv, l1, 'reaproveita o mesmo canvas ao repintar');
  assert.equal(f1, h.get('LC').frame.cv);
});
test('DPR limitado e quadros ociosos são pulados (pausa/folha) sem afetar o jogo', () => {
  const h = load(1); assert.equal(h.get('DPR_MAX'), 2);
  h.sb.innerWidth = 411; h.sb.devicePixelRatio = 3; h.sb.resize(); assert.equal(h.get('dpr'), 2);
  h.sb.newGame(1); h.setState('PAUSED'); let skipped = 0; for (let i = 0; i < 8; i++) if (h.sb.idleSkip()) skipped++;
  assert.equal(skipped, 6);
  h.setState('PLAY'); for (let i = 0; i < 8; i++) assert.equal(h.sb.idleSkip(), false);
});
test('otimizações visuais não mudam as regras (mesmo estado final com qualquer skin)', () => {
  const run = (skin) => { const h = load(5); h.get('settings').skin = skin; h.sb.newGame(1, { seed: 9 }); h.setState('PLAY'); for (let i = 0; i < 400; i++) { if (i % 9 === 0) h.sb.act(i % 8); if (h.G().overDone) break; h.sb.update(1 / 60); h.sb.render(); } return JSON.stringify(plain(h.G().grid)) + h.G().score + h.G().tick; };
  assert.equal(run('classic'), run('neon'));
});
