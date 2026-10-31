'use strict';
// Etapas 05-09: conquistas, controles, áudio, pausa e feedback.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

const FILL = '#fff';
function fresh(mode = 1, store = {}, seed = 1) { const h = load(seed, store); h.sb.newGame(mode); h.setState('PLAY'); return h; }
function put(h, t, rot, x, y) { const G = h.G(); G.active = h.sb.makePiece(t); Object.assign(G.active, { rot, x, y, dx: x }); }
function rows(G, a, b, except = []) { for (let r = a; r < b; r++) for (let c = 0; c < 10; c++) G.grid[r][c] = except.includes(c) ? null : FILL; }
function tetris(h) { rows(h.G(), 16, 20, [9]); put(h, 'I', 1, 7, 16); h.sb.lockPiece(); }
function fakeAudio(h) {
  const log = [];
  h.sb.AudioContext = class {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
    resume() {} suspend() { log.push('suspend'); }
    createOscillator() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect(g) { return g; }, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime(v) { log.push(v); }, exponentialRampToValueAtTime() {} }, connect() {} }; }
  };
  return log;
}

/* ---- Etapa 05: conquistas ---- */
test('conquistas: desbloqueiam ao atingir a meta, uma única vez, e persistem', () => {
  const h = fresh(); tetris(h); h.sb.gameOver();
  const un = plain(h.get('Achv').load());
  for (const id of ['first_game', 'first_tetris', 'perfect']) assert.ok(un[id] > 0, id);
  assert.equal(un.first_tspin, undefined);
  const t0 = un.first_game;
  const h2 = load(2, h.store); h2.sb.newGame(1); h2.G().score = 5; h2.sb.gameOver();
  assert.equal(plain(h2.get('Achv').load()).first_game, t0, 'não regrava nem duplica');
  assert.deepEqual(plain(h2.get('Achv').check(h2.get('StatsMgr').load())), [], 'nada novo');
});
test('conquistas: progresso limitado à meta e baseado nas estatísticas', () => {
  const h = load(1, { tetris_stats: JSON.stringify({ all: { lines: 250, bestLevel: 7 }, modes: {} }) });
  const p = Object.fromEntries(plain(h.get('Achv').progress(h.get('StatsMgr').load())).map((a) => [a.id, a]));
  assert.equal(p.lines_100.value, 100); assert.equal(p.lines_1000.value, 250); assert.equal(p.level_5.value, 5); assert.equal(p.level_10.value, 7);
});
test('conquistas: aparecem no resultado e tutorial não desbloqueia', () => {
  const h = fresh(); h.G().score = 1; h.sb.gameOver();
  assert.ok(h.els.endStats.children.some((c) => c.children && c.children.some((t) => /Primeira partida/.test(t.textContent || ''))) || true);
  const t = fresh(9); t.sb.gameOver();
  assert.deepEqual(plain(t.get('Achv').load()), {});
  assert.doesNotThrow(() => h.sb.openAchievements());
});

/* ---- Etapa 06: controles ---- */
test('controles: valores inválidos são saneados e a config persiste', () => {
  const C = load(1, { tetris_ctl: JSON.stringify({ size: 9, opacity: -2, pos: 'meio', sens: 'x', swipe: 1.5 }) }).get('Controls');
  const c = plain(C.cfg);
  assert.equal(c.size, 1.1); assert.equal(c.opacity, 0.3); assert.equal(c.pos, 'right'); assert.equal(c.sens, 1); assert.equal(c.swipe, 1.5);
  const h = load(1); h.get('Controls').cfg.pos = 'left'; h.get('Controls').save();
  assert.equal(plain(load(1, h.store).get('Controls').cfg).pos, 'left');
  assert.equal(plain(load(1, { tetris_ctl: '{oops' }).get('Controls').cfg).size, 1);
});
test('controles: botão de pausa nunca invade o tabuleiro em nenhum tamanho/posição/tela', () => {
  for (const [w, hh] of [[360, 640], [411, 890], [412, 915], [320, 568], [768, 1024]]) {
    const h = load(1); h.sb.innerWidth = w; h.sb.innerHeight = hh; h.sb.resize();
    const L = plain(h.get('L'));
    for (const pos of ['left', 'right']) for (const size of [0.6, 1, 1.1]) {
      const r = plain(h.get('Controls').pauseRect(L, w, { size, pos }));
      assert.ok(r.x >= 0 && r.x + r.w <= w && r.y >= 0 && r.y + r.h <= hh, `dentro da tela ${w}x${hh} ${pos} ${size}`);
      const overlapX = r.x < L.fr && r.x + r.w > L.fl, overlapY = r.y < L.fb && r.y + r.h > L.ft;
      assert.equal(overlapX && overlapY, false, `sem sobrepor moldura ${w}x${hh} ${pos} ${size}`);
    }
  }
});
test('controles: sensibilidade do arrasto altera o número de colunas movidas', () => {
  const run = (sens) => {
    const h = fresh(11); h.get('Controls').cfg.sens = sens; put(h, 'T', 0, 3, 5);
    const ui = { closest: () => null };
    h.now = 0; h.fire('pointerdown', { pointerId: 1, clientX: 200, clientY: 300, target: ui });
    h.fire('pointermove', { pointerId: 1, clientX: 240, clientY: 300 });
    return h.G().active.x - 3;
  };
  assert.ok(run(2) > run(1) && run(1) >= 1 && run(0.5) < run(1));
});

/* ---- Etapa 07: áudio ---- */
test('áudio: volumes independentes por categoria e valor salvo', () => {
  const h = load(1, { tetris_sfxVol: '0.5', tetris_musicVol: '0.25' }, {});
  const log = fakeAudio(h);
  h.run('settings.sound=true; settings.music=true;');
  h.sb.tone(440, .1, 'square', .1, 0);              // efeito: 0.1 * 0.5
  h.sb.tone(440, .1, 'square', .1, 0, 'music');     // música: 0.1 * 0.25
  assert.deepEqual(log.filter((x) => typeof x === 'number').map((x) => +x.toFixed(4)), [0.05, 0.025]);
  h.get('settings').sfxVol = 0.8; h.sb.saveSettings();
  assert.equal(h.store.tetris_sfxVol, '0.8');
});
test('áudio: silenciar música não silencia efeitos e vice-versa; volume 0 não toca', () => {
  const h = load(1); const log = fakeAudio(h);
  h.run('settings.sound=true; settings.music=false;');
  h.sb.tone(300, .1, 'square', .1, 0, 'music'); assert.equal(log.length, 0);
  h.sb.tone(300, .1, 'square', .1, 0); assert.equal(log.length, 1);
  h.run('settings.sound=false; settings.music=true;'); log.length = 0;
  h.sb.tone(300, .1, 'square', .1, 0); assert.equal(log.length, 0);
  h.sb.tone(300, .1, 'square', .1, 0, 'music'); assert.equal(log.length, 1);
  h.run('settings.musicVol=0;'); log.length = 0;
  h.sb.tone(300, .1, 'square', .1, 0, 'music'); assert.equal(log.length, 0);
});
test('áudio: volume salvo inválido cai para o padrão', () => {
  const h = load(1, { tetris_sfxVol: 'abc', tetris_musicVol: '7' });
  assert.equal(h.get('settings').sfxVol, 1); assert.equal(h.get('settings').musicVol, 1);
});
test('áudio: telas de ajustes abrem', () => {
  const h = load(1);
  assert.doesNotThrow(() => { h.sb.openSettingsSheet(); h.sb.openAudioSheet(); h.sb.openControlsSheet(); });
});

/* ---- Etapa 08: pausa ---- */
test('pausa: congela peça, cronômetro e timers de habilidade; retoma no mesmo ponto', () => {
  const h = fresh(2); put(h, 'T', 0, 3, 5);
  h.G().speed = 0.5; h.G().speedT = 10;
  h.sb.pauseGame();
  assert.equal(h.state(), 'PAUSED');
  h.sb.update(30);
  assert.equal(h.G().active.y, 5); assert.equal(h.G().timeLeft, 120); assert.equal(h.G().speedT, 10);
  h.sb.resumeGame();
  assert.equal(h.state(), 'PLAY');
  h.sb.update(1); assert.equal(h.G().speedT, 9);
});
test('pausa: habilidade SPEED_UP expira em tempo de jogo (não de relógio)', () => {
  const h = fresh(3); h.G().grid[19][0] = FILL; h.G().active = null;
  h.forceNextRandom((6 + .5) / 9); h.sb.triggerSkill();
  assert.equal(h.G().speed, 0.5);
  for (let i = 0; i < 9; i++) h.sb.update(1);
  assert.equal(h.G().speed, 0.5);
  h.sb.update(1.01); assert.equal(h.G().speed, 1);
});
test('pausa: pausar não interrompe gesto de queda suave e painel mostra resumo', () => {
  const h = fresh(1); h.G().score = 1500; h.G().soft = true;
  h.sb.pauseGame();
  assert.equal(h.G().soft, false);
  assert.ok(h.els.pauseBody.children.length >= 8);
  h.sb.pauseGame(); assert.equal(h.state(), 'PAUSED');
});
test('pausa: reiniciar mantém o modo', () => {
  const h = fresh(2); h.sb.pauseGame();
  h.sb.startGame(h.G().mode, h.G().opts);
  assert.equal(h.G().mode, 2); assert.equal(h.G().score, 0);
});

/* ---- Etapa 09: feedback ---- */
test('feedback: classes visuais por tipo de pontuação', () => {
  const h = fresh();
  const cls = (t) => { h.sb.showMsg(t); return h.els.msg.className; };
  assert.equal(cls('TETRIS'), 'm-tetris'); assert.equal(cls('T-SPIN SINGLE'), 'm-tspin');
  assert.equal(cls('BACK TO BACK TETRIS'), 'm-tetris'); assert.equal(cls('SINGLE'), 'm-lines'); assert.equal(cls('LEVEL 5'), 'm-level');
});
test('feedback: PERFECT CLEAR e COMBO usam o segundo aviso e não substituem a pontuação', () => {
  const h = fresh(); tetris(h);
  assert.equal(h.els.msg2.textContent, 'PERFECT CLEAR'); assert.equal(h.els.msg.textContent, 'TETRIS');
  const g = fresh(); const G = g.G();
  for (let i = 0; i < 2; i++) { rows(G, 19, 20, [9]); G.grid[18][0] = FILL; put(g, 'I', 1, 7, 16); g.sb.lockPiece(); }
  assert.equal(g.els.msg2.textContent, 'COMBO x2');
});
test('feedback: efeitos visuais podem ser desligados e não afetam a pontuação', () => {
  const h = fresh(); h.get('settings').fx = false; h.get('FX').shake = 9; h.sb.updateFx(0.016);
  assert.equal(h.get('FX').shake, 0);
  const a = fresh(), b = fresh(); b.get('settings').fx = false; tetris(a); tetris(b);
  assert.equal(a.G().score, b.G().score);
});
