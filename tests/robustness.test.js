'use strict';
// Etapa 24: robustez — fuzz de entradas, invariantes do motor, entradas inválidas e chaves de armazenamento.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

function invariants(h, label) {
  const G = h.G(); if (!G) return;
  assert.equal(G.grid.length, 20, label); assert.ok(G.grid.every((r) => r.length === 10), label);
  assert.ok(G.queue.length >= 7, label + ' fila');
  assert.ok(G.level >= 1 && G.level <= 30, label + ' nível');
  assert.ok(Number.isFinite(G.score) && G.score >= 0, label + ' score');
  assert.ok(G.lines >= 0 && G.combo >= 0 && G.maxCombo >= G.combo, label);
  if (G.active && !G.overDone) assert.equal(h.sb.collides(h.sb.cells(G.active), G.grid), false, label + ' peça ativa sobreposta');
}
function lcg(seed) { let x = seed >>> 0; return () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0); }

test('fuzz: ações aleatórias em todos os modos nunca lançam e mantêm invariantes', () => {
  for (const mode of [1, 2, 3, 4, 5, 9]) for (let seed = 1; seed <= 6; seed++) {
    const h = load(seed); h.sb.newGame(mode, { seed: seed * 977 }); h.setState('PLAY');
    const r = lcg(seed * 31 + mode); let score = 0;
    for (let t = 0; t < 2500 && !h.G().overDone && h.G(); t++) {
      const n = r() % 5; for (let i = 0; i < n; i++) { if (!h.G()) break; h.sb.act(r() % 8); }
      if (!h.G() || h.G().overDone) break;
      h.sb.update(1 / 60);
      if (h.G()) { invariants(h, `modo ${mode} seed ${seed} tick ${t}`); assert.ok(h.G().score >= score, 'pontuação nunca diminui'); score = h.G().score; }
    }
  }
});
test('fuzz: dt irregular (quadros lentos/rápidos) não quebra nem pula a trava', () => {
  const h = load(3); h.sb.newGame(1, { seed: 3 }); h.setState('PLAY'); const r = lcg(5);
  for (let i = 0; i < 4000 && !h.G().overDone; i++) { h.sb.update([0, 0.001, 0.016, 0.05, 0.2, 1][r() % 6]); invariants(h, 'dt ' + i); }
});
test('fuzz: importar lixo em replay/tema/backup nunca lança', () => {
  const h = load(1); const r = lcg(9);
  const junk = () => { const k = r() % 6; if (k === 0) return String.fromCharCode(...Array.from({ length: 20 }, () => 32 + (r() % 90))); if (k === 1) return JSON.stringify({ type: 'tetris-replay', v: 1, sum: 'x', data: { ev: [r(), r()], ticks: r() } }); if (k === 2) return JSON.stringify({ type: 'tetris-theme', v: 1, theme: { name: r(), pieces: [r()] } }); if (k === 3) return '{"a":'.repeat(r() % 50); if (k === 4) return ''; return String(r()); };
  for (let i = 0; i < 300; i++) { const j = junk(); assert.doesNotThrow(() => { h.get('Replays').importText(j); h.get('Theme').importJSON(j); }, j); }
  assert.equal(h.get('Replays').load().length, 0); assert.equal(h.get('Theme').customs().length, 0);
});
test('armazenamento corrompido em TODAS as chaves não impede o app de iniciar', () => {
  const store = {}; for (const k of load(1).get('Store').KEYS) store['tetris_' + k] = '{{corrompido';
  store.tetris__profiles = '{{'; store.tetris__ranking = '{{';
  const h = load(1, store);
  assert.doesNotThrow(() => { h.sb.render(); h.sb.newGame(1); h.sb.gameOver(); h.get('Hub').open(); });
});
test('toda chave de perfil escrita pelo app está registrada (exclusão de perfil e backup completos)', () => {
  const h = load(1);
  // exercita o máximo de recursos
  h.get('settings').theme = 1; h.get('settings').skin = 'neon'; h.get('settings').startLevel = 3; h.sb.saveSettings();
  h.get('Controls').cfg.size = 0.8; h.get('Controls').save(); h.get('Prefs').setZenLevel(4);
  h.get('Theme').save(Object.assign({}, plain(h.get('Theme').blank()), { name: 'x' }));
  h.get('Tut').step = 2; h.get('Tut').save(false);
  for (const mode of [1, 2, 3, 4, 5]) { h.sb.newGame(mode, { seed: mode }); h.setState('PLAY'); h.G().ms = 20000; h.G().tick = 700; h.G().score = 50; h.sb.gameOver(); }
  h.sb.newGame(6, h.get('Daily').options('2026-01-01')); h.G().tick = 700; h.sb.gameOver();
  h.get('Rewards').grant('a', 1);
  const keys = h.get('Store').KEYS;
  const written = Object.keys(h.store).filter((k) => k.startsWith('tetris_') && !k.startsWith('tetris__')).map((k) => k.slice(7));
  const missing = written.filter((k) => !keys.includes(k)); assert.deepEqual(missing, [], 'chaves não registradas: ' + missing);
});
test('valores extremos de configuração são saneados', () => {
  const h = load(1, { tetris_startLevel: '9999', tetris_zenLevel: 'abc', tetris_sfxVol: '-4', tetris_ctl: '{"size":1e9,"sens":-3}' });
  assert.equal(h.get('settings').startLevel, 15); assert.equal(h.get('Prefs').zenLevel(), 1); assert.equal(h.get('settings').sfxVol, 0);
  assert.equal(h.get('Controls').cfg.size, 1.1); assert.equal(h.get('Controls').cfg.sens, 0.5);
});
test('cenários de borda do motor: peça no topo, rotação sem espaço, hard drop com tabuleiro cheio', () => {
  const h = load(1); h.sb.newGame(1, { seed: 1 }); h.setState('PLAY'); const G = h.G();
  for (let r = 2; r < 20; r++) for (let c = 0; c < 10; c++) if (c !== 4) G.grid[r][c] = '#fff';
  assert.doesNotThrow(() => { for (let i = 0; i < 10; i++) { h.sb.act(i % 4); h.sb.act(4); if (!h.G() || h.G().overDone) break; } });
  assert.ok(h.state() === 'OVER' || h.G().grid.length === 20);
});
test('modos que dependem de G nulo não quebram (menu, pausa sem jogo, ações sem jogo)', () => {
  const h = load(1);
  assert.doesNotThrow(() => { h.sb.act(0); h.sb.pauseGame(); h.sb.resumeGame(); h.sb.update(1); h.sb.handleBack(); h.sb.leaveGame(); h.sb.gameOver(); });
});
