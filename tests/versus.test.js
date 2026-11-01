'use strict';
// Etapas 27-28: IA e Versus local.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

const FILL = '#fff';
const V = (h) => h.get('Versus');
const AI = (h) => h.get('AI');
const humanAi = (lv = 'medium') => ({ players: [{ kind: 'human', name: 'Eu' }, { kind: 'ai', name: 'Bot', level: lv }], seed: 4 });
function vs(h, cfg) { V(h).create(cfg || humanAi()); V(h).active = true; h.setState('VERSUS'); return V(h); }
function emptyGrid(h) { return h.sb.newGrid(); }

/* ---------------- IA ---------------- */
test('IA: número de colocações por peça em tabuleiro vazio (O=9, I=17, S/Z=17, T/J/L=34) — também valida a geometria de S', () => {
  const h = load(1); const g = emptyGrid(h);
  const cnt = (t) => AI(h).enumerate(g, t).length;
  assert.deepEqual(['O', 'I', 'S', 'Z', 'T', 'J', 'L'].map(cnt), [9, 17, 17, 17, 34, 34, 34]);
});
test('IA: toda colocação enumerada é válida (apoiada, sem sobreposição, dentro do campo)', () => {
  const h = load(2); const g = emptyGrid(h);
  for (let r = 14; r < 20; r++) for (let c = 0; c < 10; c++) if ((r * 7 + c * 3) % 5) g[r][c] = FILL;
  for (const t of 'IJLOSTZ') for (const m of AI(h).enumerate(g, t)) {
    const cs = h.sb.cells(t, m.rot, m.x, m.y);
    assert.equal(h.sb.collides(cs, g), false); assert.equal(h.sb.collides(h.sb.cells(t, m.rot, m.x, m.y + 1), g), true, 'apoiada');
  }
});
test('IA: avaliação prefere tabuleiro plano a buracos e escolhe completar linha', () => {
  const h = load(1); const flat = emptyGrid(h), holey = emptyGrid(h);
  for (let c = 0; c < 9; c++) { flat[19][c] = FILL; holey[18][c] = FILL; }
  assert.ok(AI(h).evaluate(flat) > AI(h).evaluate(holey));
  const g2 = emptyGrid(h); for (let c = 4; c < 10; c++) g2[19][c] = FILL; assert.equal(AI(h).best(g2, 'I').lines, 1);
});
test('IA: só enxerga as 3 próximas peças (acessar além delas falha)', () => {
  const h = load(1); const g = V(h).create(humanAi('hard')).B[1];
  g.queue = new Proxy(['I', 'O', 'T', 'S', 'Z', 'L', 'J'], { get(t, k) { if (typeof k === 'string' && /^\d+$/.test(k) && +k >= 3) throw new Error('acesso a peça futura ' + k); return Reflect.get(t, k); } });
  assert.doesNotThrow(() => { for (let i = 0; i < 20; i++) AI(h).think(g); });
});
test('IA: age somente por act() (sem pontuação/ações extras, mesma entrada do humano)', () => {
  const h = load(1); const v = V(h).create(humanAi('medium')); const g = v.B[1];
  for (let i = 0; i < 300 && !g.overDone; i++) { v.withBoard(1, () => { AI(h).step(g); h.sb.update(1 / 60); }); }
  assert.ok(g.pieces > 0); assert.equal(g.actions, 0, 'ações da IA não contam como do jogador');
});
test('IA: níveis distintos — Difícil vence Fácil na maioria das partidas simuladas e o resultado é determinístico', () => {
  const h = load(1); let hardWins = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const r = plain(V(h).simulate({ seed, players: [{ kind: 'ai', name: 'D', level: 'hard' }, { kind: 'ai', name: 'F', level: 'easy' }] }));
    if (r.winner === 0) hardWins++;
  }
  assert.ok(hardWins >= 5, 'Difícil venceu ' + hardWins + '/6');
  const cfg = { seed: 9, players: [{ kind: 'ai', name: 'A', level: 'medium' }, { kind: 'ai', name: 'B', level: 'medium' }] };
  assert.deepEqual(plain(V(h).simulate(cfg)), plain(load(77).get('Versus').simulate(cfg)));
});
test('IA: simulação headless não altera o app (estado, jogo atual, som)', () => {
  const h = load(1); h.sb.newGame(1); h.setState('PLAY'); const g = h.G();
  V(h).simulate({ seed: 3, players: [{ kind: 'ai', name: 'A', level: 'easy' }, { kind: 'ai', name: 'B', level: 'easy' }] });
  assert.equal(h.G(), g); assert.equal(h.state(), 'PLAY'); assert.equal(V(h).active, false); assert.equal(h.get('SIM'), false);
  assert.equal(plain(h.get('StatsMgr').load()).all.games, 0);
});

/* ---------------- Versus ---------------- */
test('ataque: tabela de linhas, T-Spin, B2B, combo e Perfect Clear', () => {
  const h = load(1); const a = (n, o = {}, combo = 1) => V(h).attack(Object.assign({ n, tspin: false, b2b: false, perfect: false }, o), combo);
  assert.deepEqual([0, 1, 2, 3, 4].map((n) => a(n)), [0, 0, 1, 2, 4]);
  assert.deepEqual([1, 2, 3].map((n) => a(n, { tspin: true })), [2, 4, 6]); assert.equal(a(0, { tspin: true }), 0);
  assert.equal(a(4, { b2b: true }), 5); assert.equal(a(2, {}, 4), 1 + 2); assert.equal(a(1, { perfect: true }), 10);
  assert.equal(a(1, {}, 50), 5, 'combo limitado pela tabela');
});
test('criação: dois tabuleiros independentes com as mesmas peças e filas', () => {
  const h = load(1); const v = V(h).create(humanAi());
  assert.equal(v.B.length, 2); assert.notEqual(v.B[0].grid, v.B[1].grid);
  assert.equal([v.B[0].active.t, ...v.B[0].queue].join(''), [v.B[1].active.t, ...v.B[1].queue].join(''));
  assert.equal(v.B[0].vi, 0); assert.equal(v.B[1].vi, 1); assert.ok(v.B[1].ai && !v.B[0].ai); assert.equal(h.G(), v.B[0]);
  assert.equal(v.B.every((g) => g.rec === null && g.versus), true);
});
test('trocar de tabuleiro restaura G/L/CELL/SIM mesmo se ocorrer erro', () => {
  const h = load(1); const v = vs(h); const g0 = h.G(), cell = h.get('CELL'), bx = h.get('L').bx;
  assert.throws(() => v.withBoard(1, () => { assert.equal(h.G(), v.B[1]); throw new Error('x'); }));
  assert.equal(h.G(), g0); assert.equal(h.get('CELL'), cell); assert.equal(h.get('L').bx, bx); assert.equal(h.get('SIM'), false);
});
test('linhas limpas enviam lixo ao oponente; lixo cancela o recebido primeiro', () => {
  const h = load(1); const v = vs(h, { players: [{ kind: 'human', name: 'A' }, { kind: 'human', name: 'B' }], seed: 1 });
  const tetris = (i) => v.withBoard(i, () => { const G = h.G(); G.grid[5][0] = FILL; for (let r = 16; r < 20; r++) for (let c = 0; c < 10; c++) G.grid[r][c] = c === 9 ? null : FILL; G.active = h.sb.makePiece('I'); Object.assign(G.active, { rot: 1, x: 7, y: 16 }); h.sb.lockPiece(); });
  tetris(0); assert.deepEqual(plain(v.pend), [0, 4]); assert.deepEqual(plain(v.sent), [4, 0]);
  v.pend[0] = 3; tetris(0);
  assert.deepEqual(plain(v.pend), [0, 4 + 3], 'segundo Tetris (4 + B2B 1 + combo 1 = 6) cancela 3 e envia 3'); assert.equal(v.sent[0], 4 + 3);
});
test('lixo: entra só quando a peça trava sem limpar linha; máx. 8 linhas; um buraco por lote', () => {
  const h = load(1); const v = vs(h, { players: [{ kind: 'human', name: 'A' }, { kind: 'human', name: 'B' }], seed: 1 });
  v.pend[0] = 12;
  v.withBoard(0, () => { const G = h.G(); G.active = h.sb.makePiece('O'); Object.assign(G.active, { x: 3, y: 18 }); h.sb.lockPiece(); });
  const g = v.B[0]; assert.equal(v.pend[0], 4);
  const gar = g.grid.filter((r) => r.filter((c) => c === h.get('GARBAGE_COLOR')).length === 9);
  assert.equal(gar.length, 8);
  const holes = new Set(gar.map((r) => r.findIndex((c) => !c))); assert.equal(holes.size, 1);
});
test('lixo: não entra quando a mesma jogada limpa linhas', () => {
  const h = load(1); const v = vs(h, { players: [{ kind: 'human', name: 'A' }, { kind: 'human', name: 'B' }], seed: 1 });
  v.pend[0] = 2;
  v.withBoard(0, () => { const G = h.G(); for (let c = 0; c < 10; c++) G.grid[19][c] = c === 9 ? null : FILL; G.active = h.sb.makePiece('I'); Object.assign(G.active, { rot: 1, x: 7, y: 16 }); h.sb.lockPiece(); });
  assert.equal(v.pend[0], 2); assert.equal(v.B[0].grid[19].filter(Boolean).length, 1);
});
test('lixo: transbordar o topo encerra a partida de quem recebeu', () => {
  const h = load(1); const v = vs(h, { players: [{ kind: 'human', name: 'A' }, { kind: 'human', name: 'B' }], seed: 1 });
  v.withBoard(0, () => { for (let r = 0; r < 20; r++) h.G().grid[r][0] = FILL; v.addGarbage(h.G(), 2); });
  assert.equal(v.B[0].overDone, true);
});
test('fim: quem topa perde; empate decide por lixo enviado, depois pontuação', () => {
  const h = load(1); const v = vs(h);
  v.B[1].overDone = true; assert.deepEqual(plain(v.decide()), { winner: 0, tie: false });
  v.B[1].overDone = false; v.B[0].overDone = true; assert.equal(v.decide().winner, 1);
  v.B[1].overDone = true; v.sent = [1, 5]; assert.deepEqual(plain(v.decide()), { winner: 1, tie: true });
  v.sent = [2, 2]; v.B[0].score = 10; v.B[1].score = 3; assert.equal(v.decide().winner, 0);
});
test('partida: IA joga sozinha, tick avança as duas, termina com resultado e estado VSOVER', () => {
  const h = load(1); const v = vs(h, humanAi('hard'));
  for (let i = 0; i < 3000 && !v.over; i++) v.tick();
  assert.equal(v.over, true); assert.ok(v.result && [0, 1].includes(v.result.winner)); assert.equal(h.state(), 'VSOVER');
  assert.ok(v.B[1].pieces > 5, 'a IA jogou');
});
test('entrada: só o tabuleiro escolhido reage; IA ignora entrada do humano; toque escolhe o jogador pela metade da tela', () => {
  const h = load(1); const v = vs(h, { players: [{ kind: 'human', name: 'A' }, { kind: 'human', name: 'B' }], seed: 1 });
  const x0 = v.B[0].active.x, x1 = v.B[1].active.x;
  v.input(1, h.get('A').LEFT); assert.equal(v.B[0].active.x, x0); assert.equal(v.B[1].active.x, x1 - 1);
  assert.deepEqual([v.playerAt(10), v.playerAt(400)], [0, 1]);
  const w = load(1); const ai = vs(w); assert.equal(ai.input(1, w.get('A').LEFT), false); assert.equal(ai.playerAt(400), 0);
});
test('toque em VERSUS: arrastar move, deslizar derruba, e dois jogadores simultâneos', () => {
  const h = load(1); const v = vs(h, { players: [{ kind: 'human', name: 'A' }, { kind: 'human', name: 'B' }], seed: 1 });
  const ui = { closest: () => null }; h.now = 0;
  h.fire('pointerdown', { pointerId: 1, clientX: 50, clientY: 300, target: ui }); h.fire('pointerdown', { pointerId: 2, clientX: 350, clientY: 300, target: ui });
  const a0 = v.B[0].active.x, b0 = v.B[1].active.x;
  h.fire('pointermove', { pointerId: 1, clientX: 90, clientY: 300 }); h.fire('pointermove', { pointerId: 2, clientX: 310, clientY: 300 });
  assert.ok(v.B[0].active.x > a0 && v.B[1].active.x < b0);
  h.now = 100; const p0 = v.B[0].pieces; h.fire('pointerup', { pointerId: 1, clientX: 90, clientY: 420 });
  assert.equal(v.B[0].pieces, p0 + 1, 'deslize para baixo = hard drop só do jogador 1');
  assert.equal(v.B[1].pieces, 0);
});
test('efeitos visuais são marcados por tabuleiro (flash/trail não vazam para o outro lado)', () => {
  const h = load(1); const v = vs(h);
  v.withBoard(1, () => { h.sb.hardDrop(); });
  assert.ok(h.get('FX').lock.length > 0 && h.get('FX').lock.every((l) => l.b === 1));
});
test('layout: dois tabuleiros dentro da tela, sem sobreposição, e render não lança em todos os estados', () => {
  for (const [w, hh] of [[360, 640], [411, 890], [320, 568], [768, 1024]]) {
    const h = load(1); h.sb.innerWidth = w; h.sb.innerHeight = hh; h.sb.resize(); const v = vs(h); v.layouts();
    const [a, b] = plain(v.lay);
    assert.ok(a.fl >= 0 && b.fr <= w && a.fr <= b.fl, `${w}x${hh}`); assert.ok(a.ft >= 0 && a.fb <= hh, `${w}x${hh}`);
    const L0 = plain(h.get('L'));
    for (const s of ['COUNT', 'VERSUS', 'PAUSED', 'VSOVER']) { h.setState(s); assert.doesNotThrow(() => h.sb.render(), s); }
    assert.deepEqual(plain(h.get('L')), L0, 'layout solo restaurado');
  }
});
test('pausa e voltar no Versus retomam em VERSUS; botão Home encerra', () => {
  const h = load(1); vs(h); h.sb.handleBack(); assert.equal(h.state(), 'PAUSED'); h.sb.handleBack(); assert.equal(h.state(), 'VERSUS');
  h.sb.pauseGame(); h.sb.update(5); assert.equal(V(h).B[0].tick, 0, 'pausado não avança');
  h.sb.goMenu(); assert.equal(V(h).active, false);
});
test('resultado: contra IA grava estatísticas do modo 8 (sem ranking/recorde/replay); 2 humanos não grava', () => {
  const h = load(1); const v = vs(h); v.finish(); v.B[1].overDone = true; v.result = Object.assign(plain(v.result), { winner: 0 }); v.showEnd();
  assert.equal(plain(h.get('StatsMgr').load()).modes[8].wins, 1);
  assert.equal(plain(h.get('Ranking').load())[1].length, 0); assert.equal(h.get('Replays').load().length, 0);
  assert.equal(h.els.endTitle.textContent, 'VOCÊ VENCEU!'); assert.ok(plain(h.get('Achv').load()).versus_win);
  const g = load(1); const w = vs(g, { players: [{ kind: 'human', name: 'A' }, { kind: 'human', name: 'B' }], seed: 1 }); w.finish(); w.showEnd();
  assert.equal(plain(g.get('StatsMgr').load()).all.games, 0); assert.match(g.els.endTitle.textContent, /VENCEU/);
});
test('menu do Versus abre', () => { const h = load(1); assert.doesNotThrow(() => h.sb.openVersus()); });
