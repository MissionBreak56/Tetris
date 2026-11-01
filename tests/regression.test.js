'use strict';
// Etapa 01 — testes de regressão essenciais.
// Registram o COMPORTAMENTO ATUAL do jogo (index.html). Não alteram regras.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

const PIECES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
const FILL = '#ffffff';

function fresh(seed = 1, mode = 1) {
  const h = load(seed);
  h.sb.newGame(mode);
  h.setState('PLAY');
  return h;
}
function put(h, t, rot, x, y) {
  const G = h.G();
  G.active = h.sb.makePiece(t);
  Object.assign(G.active, { rot, x, y, dx: x });
  return G.active;
}
function fillRow(G, r, except = []) {
  for (let c = 0; c < 10; c++) G.grid[r][c] = except.includes(c) ? null : FILL;
}
function filledCount(G) {
  return G.grid.reduce((n, row) => n + row.filter(Boolean).length, 0);
}
function cellsOf(h, p) { return plain(h.sb.cells(p.t, p.rot, p.x, p.y)); }

/* ---------------- Colisões ---------------- */
test('colisão: peça livre no centro não colide', () => {
  const h = fresh();
  assert.equal(h.sb.collides(h.sb.cells('T', 0, 3, 5), h.G().grid), false);
});
test('colisão: paredes esquerda/direita e chão', () => {
  const h = fresh();
  const g = h.G().grid;
  assert.equal(h.sb.collides(h.sb.cells('O', 0, -2, 5), g), true, 'esquerda');   // O ocupa cols x+1..x+2
  assert.equal(h.sb.collides(h.sb.cells('O', 0, 8, 5), g), true, 'direita');
  assert.equal(h.sb.collides(h.sb.cells('O', 0, 3, 19), g), true, 'chão');
  assert.equal(h.sb.collides(h.sb.cells('O', 0, 3, 18), g), false, 'encosta no chão sem colidir');
});
test('colisão: células ocupadas colidem; acima do topo (y<0) é permitido', () => {
  const h = fresh();
  const G = h.G();
  G.grid[10][4] = FILL;
  assert.equal(h.sb.collides([[4, 10]], G.grid), true);
  assert.equal(h.sb.collides([[4, 9]], G.grid), false);
  assert.equal(h.sb.collides([[4, -1], [5, -2]], G.grid), false);
});

/* ---------------- Movimentação ---------------- */
test('movimento: anda 1 coluna e para nas paredes', () => {
  const h = fresh();
  put(h, 'I', 0, 0, 5);
  assert.equal(h.sb.move(-1), false);
  assert.equal(h.G().active.x, 0);
  assert.equal(h.sb.move(1), true);
  assert.equal(h.G().active.x, 1);
  put(h, 'I', 0, 6, 5);
  assert.equal(h.sb.move(1), false);
  assert.equal(h.G().active.x, 6);
});
test('movimento: bloqueado por peça fixa', () => {
  const h = fresh();
  const G = h.G();
  put(h, 'O', 0, 3, 5);              // O ocupa cols 4..5
  G.grid[5][6] = FILL;
  assert.equal(h.sb.move(1), false);
  assert.equal(G.active.x, 3);
});
test('movimento: reinicia o atraso de trava (lockT) ao mover', () => {
  const h = fresh();
  put(h, 'T', 0, 3, 5);
  h.G().lockT = 0.4;
  h.sb.move(1);
  assert.equal(h.G().lockT, 0);
});

/* ---------------- Rotação ---------------- */
test('rotação: 4 giros horários voltam ao início (todas as peças)', () => {
  for (const t of PIECES) {
    const h = fresh();
    put(h, t, 0, 3, 5);
    const before = cellsOf(h, h.G().active);
    for (let i = 0; i < 4; i++) assert.equal(h.sb.rotate(1), true, `${t} giro ${i}`);
    assert.equal(h.G().active.rot, 0, t);
    assert.deepEqual(cellsOf(h, h.G().active), before, t);
  }
});
test('rotação: anti-horário vai de 0 para 3', () => {
  const h = fresh();
  put(h, 'T', 0, 3, 5);
  h.sb.rotate(-1);
  assert.equal(h.G().active.rot, 3);
});
test('rotação: O não muda de forma', () => {
  const h = fresh();
  put(h, 'O', 0, 3, 5);
  const before = cellsOf(h, h.G().active);
  h.sb.rotate(1);
  assert.deepEqual(cellsOf(h, h.G().active), before);
});
test('rotação: wall kick empurra a peça para dentro do campo (I vertical na parede esquerda)', () => {
  const h = fresh();
  put(h, 'I', 1, -2, 5);               // vertical na coluna 0
  assert.equal(h.sb.rotate(1), true);
  const p = h.G().active;
  assert.equal(p.rot, 2);
  assert.equal(h.sb.collides(h.sb.cells(p.t, p.rot, p.x, p.y), h.G().grid), false);
  assert.equal(p.x, 0, 'comportamento atual: kick [2,0]');
});
test('rotação: sem espaço nenhum retorna false e não altera a peça', () => {
  const h = fresh();
  const G = h.G();
  put(h, 'I', 0, 3, 8);                // horizontal na linha 9
  // preenche tudo em volta, deixando só a linha 9 (cols 3..6) livre
  for (let r = 4; r < 16; r++) for (let c = 0; c < 10; c++) if (!(r === 9 && c >= 3 && c <= 6)) G.grid[r][c] = FILL;
  const before = plain(G.active);
  assert.equal(h.sb.rotate(1), false);
  assert.deepEqual(plain(G.active), before);
});
test('CARACTERIZAÇÃO: lastRot fica true após girar e NÃO é limpo ao mover (possível T-Spin falso — ver relatório)', () => {
  const h = fresh();
  put(h, 'T', 0, 3, 5);
  h.sb.rotate(1);
  assert.equal(h.G().lastRot, true);
  h.sb.move(1);
  assert.equal(h.G().lastRot, true);
});

/* ---------------- 7-Bag ---------------- */
test('7-bag: refill adiciona sempre as 7 peças distintas', () => {
  const h = fresh(7);
  for (let i = 0; i < 100; i++) {
    const q = [];
    h.sb.refill(q);
    assert.deepEqual([...q].sort(), PIECES);
  }
});
test('7-bag: cada bloco de 7 peças sorteadas é uma permutação (140 peças)', () => {
  const h = fresh(42);
  const seq = [h.G().active.t];
  for (let i = 0; i < 139; i++) { h.G().grid = h.sb.newGrid(); h.sb.spawn(); seq.push(h.G().active.t); }
  for (let i = 0; i < seq.length; i += 7) assert.deepEqual(seq.slice(i, i + 7).sort(), PIECES, `bloco ${i / 7}`);
});
test('7-bag: fila nunca fica abaixo de 7 e começa com 14 (menos a ativa)', () => {
  const h = fresh(3);
  assert.equal(h.G().queue.length, 13);
  for (let i = 0; i < 50; i++) { h.G().grid = h.sb.newGrid(); h.sb.spawn(); assert.ok(h.G().queue.length >= 7); }
});
test('7-bag: determinístico com a mesma semente e diferente com outra', () => {
  const seqOf = (seed) => { const h = fresh(seed); return [h.G().active.t, ...plain(h.G().queue)].join(''); };
  assert.equal(seqOf(5), seqOf(5));
  assert.notEqual(seqOf(5), seqOf(6));
});

/* ---------------- Hold ---------------- */
test('hold: primeira vez guarda a peça e traz a próxima da fila', () => {
  const h = fresh(11);
  const G = h.G();
  const cur = G.active.t, next = G.queue[0];
  h.sb.hold();
  assert.equal(G.held, cur);
  assert.equal(G.active.t, next);
  assert.equal(G.canHold, false);
});
test('hold: segunda tentativa na mesma peça é ignorada', () => {
  const h = fresh(11);
  const G = h.G();
  h.sb.hold();
  const held = G.held, act = G.active.t;
  h.sb.hold();
  assert.equal(G.held, held);
  assert.equal(G.active.t, act);
});
test('hold: após travar a peça o hold volta a estar disponível e troca com a guardada', () => {
  const h = fresh(11);
  const G = h.G();
  h.sb.hold();
  const held = G.held;
  h.sb.hardDrop();                      // trava e spawna a próxima
  assert.equal(G.canHold, true);
  const act = G.active.t;
  h.sb.hold();
  assert.equal(G.active.t, held);
  assert.equal(G.held, act);
  assert.equal(G.active.rot, 0);
  assert.equal(G.active.x, 3);
});

/* ---------------- Ghost piece ---------------- */
test('ghost: no tabuleiro vazio pousa no chão', () => {
  const h = fresh();
  put(h, 'O', 0, 3, 0);
  assert.equal(h.sb.ghostY(), 18);
  put(h, 'I', 1, 3, 0);                 // vertical: células y..y+3
  assert.equal(h.sb.ghostY(), 16);
});
test('ghost: pousa sobre obstáculo', () => {
  const h = fresh();
  fillRow(h.G(), 15, [3, 4, 5]);        // cols 0-2 e 6-9 ocupadas na linha 15
  put(h, 'O', 0, 1, 0);                 // O ocupa cols 2..3 → col 2 bate na linha 15
  assert.equal(h.sb.ghostY(), 13);
});
test('ghost: posição prevista == onde a peça realmente trava (todas as peças/rotações)', () => {
  const h = fresh(99);
  for (const t of PIECES) for (let rot = 0; rot < 4; rot++) for (const x of [0, 3, 5]) {
    const G = h.G();
    G.grid = h.sb.newGrid();
    G.score = 0;
    G.grid[12][1] = FILL; G.grid[14][7] = FILL; G.grid[16][4] = FILL; // lixo esparso (sem linha completa)
    const p = put(h, t, rot, x, 0);
    if (h.sb.collides(h.sb.cells(t, rot, x, 0), G.grid)) continue;
    const gy = h.sb.ghostY();
    const expected = plain(h.sb.cells(t, rot, x, gy));
    h.sb.hardDrop();
    for (const [cx, cy] of expected) assert.ok(G.grid[cy][cx], `${t} rot${rot} x${x}: (${cx},${cy})`);
  }
});

/* ---------------- Limpeza de linhas e pontuação ---------------- */
// Cenário: linhas 20-n..19 cheias nas colunas 0..8; I vertical na coluna 9 (y=16) completa n linhas.
function clearScenario(n, level = 1) {
  const h = fresh(1);
  const G = h.G();
  G.level = level;
  for (let r = 20 - n; r < 20; r++) fillRow(G, r, [9]);
  put(h, 'I', 1, 7, 16);
  h.sb.lockPiece();
  return { h, G };
}
test('linhas: single/double/triple/tetris contam linhas e pontuam 100/300/500/800 × nível', () => {
  const table = { 1: 100, 2: 300, 3: 500, 4: 800 };
  for (const n of [1, 2, 3, 4]) {
    for (const level of [1, 3]) {
      const { G } = clearScenario(n, level);
      assert.equal(G.lines, n, `n=${n}`);
      assert.equal(G.score, table[n] * level, `n=${n} nível=${level}`);
    }
  }
});
test('linhas: resto do tabuleiro desce e linhas eliminadas somem', () => {
  const one = clearScenario(1);
  assert.equal(filledCount(one.G), 3, 'sobram 3 células do I');
  for (const r of [17, 18, 19]) assert.ok(one.G.grid[r][9], `linha ${r}`);
  const four = clearScenario(4);
  assert.equal(filledCount(four.G), 0, 'tetris limpa tudo');
});
test('linhas: peça travada sem completar linha não pontua nem conta linhas', () => {
  const h = fresh();
  put(h, 'O', 0, 3, 18);
  h.sb.lockPiece();
  assert.equal(h.G().score, 0);
  assert.equal(h.G().lines, 0);
  assert.equal(filledCount(h.G()), 4);
});
test('nível: sobe a cada 10 × nível linhas; pontua com o nível anterior ao incremento', () => {
  const h = fresh();
  const G = h.G();
  G.lines = 9;
  fillRow(G, 19, [9]);
  put(h, 'I', 1, 7, 16);
  h.sb.lockPiece();
  assert.equal(G.lines, 10);
  assert.equal(G.level, 2);
  assert.equal(G.score, 100);
});
test('nível: limitado a 30', () => {
  const h = fresh();
  const G = h.G();
  G.level = 30; G.lines = 299;
  fillRow(G, 19, [9]);
  put(h, 'I', 1, 7, 16);
  h.sb.lockPiece();
  assert.equal(G.level, 30);
});
test('gravidade: tabela de quadros por nível', () => {
  const h = fresh();
  const exp = { 1: 48, 2: 43, 3: 38, 4: 33, 5: 28, 6: 23, 7: 18, 8: 13, 9: 8, 10: 6, 11: 5, 13: 5, 14: 4, 16: 4, 17: 3, 19: 3, 20: 2, 29: 2, 30: 1 };
  for (const [lv, f] of Object.entries(exp)) assert.equal(h.sb.gravFrames(+lv), f, `nível ${lv}`);
});

/* ---------------- Queda, soft drop, hard drop, trava ---------------- */
test('hard drop: pontua 2 por célula × nível e trava no chão', () => {
  for (const level of [1, 2]) {
    const h = fresh();
    h.G().level = level;
    put(h, 'I', 0, 3, -1);              // I horizontal no spawn
    h.sb.hardDrop();
    assert.equal(h.G().score, 19 * 2 * level);
    for (const c of [3, 4, 5, 6]) assert.ok(h.G().grid[19][c]);
  }
});
test('soft drop: 1 linha por atualização, +1 ponto × nível', () => {
  const h = fresh();
  const G = h.G();
  G.level = 2;
  put(h, 'T', 0, 3, 5);
  G.soft = true;
  h.sb.update(0.016);
  assert.equal(G.active.y, 6);
  assert.equal(G.score, 2);
});
test('gravidade: nível 1 desce 1 linha a cada 0,8 s (48 quadros)', () => {
  const h = fresh();
  put(h, 'T', 0, 3, 5);
  h.sb.update(0.5);
  assert.equal(h.G().active.y, 5);
  h.sb.update(0.31);
  assert.equal(h.G().active.y, 6);
});
test('trava: peça no chão trava depois de 0,5 s', () => {
  const h = fresh();
  put(h, 'O', 0, 3, 18);
  h.sb.update(0.3);
  assert.equal(filledCount(h.G()), 0);
  h.sb.update(0.3);
  assert.equal(filledCount(h.G()), 4);
});
test('pausa: update não move peça nem cronômetro fora do estado PLAY', () => {
  const h = fresh(1, 2);
  h.setState('PLAY');
  put(h, 'T', 0, 3, 5);
  h.setState('PAUSED');
  h.sb.update(10);
  assert.equal(h.G().active.y, 5);
  assert.equal(h.G().timeLeft, 120);
});

/* ---------------- T-Spin e Back-to-Back ---------------- */
function tspinSetup(withLine) {
  const h = fresh();
  const G = h.G();
  G.grid[19][4] = FILL; G.grid[19][6] = FILL; G.grid[17][4] = FILL;  // 3 cantos do T
  if (withLine) fillRow(G, 18, [4, 5, 6]);
  put(h, 'T', 0, 4, 17);              // T ocupa (5,17) (4,18) (5,18) (6,18)
  return { h, G };
}
test('T-Spin: isTSpin exige peça T, giro recente e 3 cantos', () => {
  const { h, G } = tspinSetup(false);
  G.lastRot = true;
  assert.equal(h.sb.isTSpin(G.active, G.grid), true);
  G.lastRot = false;
  assert.equal(h.sb.isTSpin(G.active, G.grid), false);
  G.lastRot = true;
  put(h, 'L', 0, 4, 17);
  assert.equal(h.sb.isTSpin(G.active, G.grid), false, 'só T conta');
  G.grid[19][4] = null;               // agora só 2 cantos
  put(h, 'T', 0, 4, 17);
  assert.equal(h.sb.isTSpin(G.active, G.grid), false);
});
test('T-Spin sem linhas vale 400 × nível e liga o Back-to-Back', () => {
  const { h, G } = tspinSetup(false);
  G.lastRot = true;
  h.sb.lockPiece();
  assert.equal(G.score, 400);
  assert.equal(G.b2b, true);
  assert.equal(h.els.msg.textContent, 'T-SPIN');
});
test('T-Spin Single vale 800 e conta a linha', () => {
  const { h, G } = tspinSetup(true);
  G.lastRot = true;
  h.sb.lockPiece();
  assert.equal(G.lines, 1);
  assert.equal(G.score, 800);
  assert.equal(h.els.msg.textContent, 'T-SPIN SINGLE');
});
test('T sem giro recente não é T-Spin (vale single comum)', () => {
  const { h, G } = tspinSetup(true);
  G.lastRot = false;
  h.sb.lockPiece();
  assert.equal(G.score, 100);
  assert.equal(G.b2b, false);
});
test('Back-to-Back: Tetris após Tetris vale ×1,5; single comum zera o B2B', () => {
  const h = fresh();
  const G = h.G();
  const tetris = () => { for (let r = 16; r < 20; r++) fillRow(G, r, [9]); put(h, 'I', 1, 7, 16); h.sb.lockPiece(); };
  tetris();
  assert.equal(G.score, 800);
  assert.equal(G.b2b, true);
  tetris();
  assert.equal(G.score, 800 + 1200);
  assert.equal(h.els.msg.textContent, 'BACK TO BACK TETRIS');
  G.grid = h.sb.newGrid();
  fillRow(G, 19, [9]); put(h, 'I', 1, 7, 16); h.sb.lockPiece();
  assert.equal(G.b2b, false);
});
test('Back-to-Back: T-Spin Single após Tetris recebe ×1,5', () => {
  const h = fresh();
  const G = h.G();
  for (let r = 16; r < 20; r++) fillRow(G, r, [9]);
  put(h, 'I', 1, 7, 16); h.sb.lockPiece();
  G.grid = h.sb.newGrid();
  G.grid[19][4] = FILL; G.grid[19][6] = FILL; G.grid[17][4] = FILL;
  fillRow(G, 18, [4, 5, 6]);
  put(h, 'T', 0, 4, 17);
  G.lastRot = true;
  const before = G.score;
  h.sb.lockPiece();
  assert.equal(G.score - before, 1200);
});

/* ---------------- Fim de jogo, recordes e modos ---------------- */
test('game over: spawn bloqueado encerra a partida', () => {
  const h = fresh();
  fillRow(h.G(), 0); fillRow(h.G(), 1);
  h.sb.spawn();
  assert.equal(h.state(), 'OVER');
});
test('game over: travar acima do topo encerra (lock out)', () => {
  const h = fresh();
  put(h, 'I', 1, 3, -3);
  h.sb.lockPiece();
  assert.equal(h.state(), 'OVER');
});
test('recorde: salvo por modo em localStorage e só quando supera o anterior; salva uma única vez', () => {
  const keys = { 1: 'tetris_bestScore', 2: 'tetris_bestScore2Minutes', 3: 'tetris_bestScoreStrategy' };
  for (const mode of [1, 2, 3]) {
    const h = fresh(1, mode);
    h.G().score = 500;
    h.sb.gameOver();
    assert.equal(h.store[keys[mode]], '500', `modo ${mode}`);
    h.G().score = 900;
    h.sb.gameOver();                    // segunda chamada é ignorada
    assert.equal(h.store[keys[mode]], '500');
  }
  const h = load(1, { tetris_bestScore: '1000' });
  h.sb.newGame(1); h.G().score = 400; h.sb.gameOver();
  assert.equal(h.store.tetris_bestScore, '1000');
});
test('2 Minutos: contagem regressiva de 120 s e game over em 0', () => {
  const h = fresh(1, 2);
  const G = h.G();
  G.active = null;                      // evita que as peças empilhem durante o teste
  for (let i = 0; i < 119; i++) h.sb.update(1);
  assert.equal(G.timeLeft, 1);
  assert.equal(h.state(), 'PLAY');
  h.sb.update(1);
  assert.equal(G.timeLeft, 0);
  assert.equal(h.state(), 'OVER');
});
test('Maratona: sem cronômetro', () => {
  const h = fresh(1, 1);
  h.G().active = null;
  for (let i = 0; i < 200; i++) h.sb.update(1);
  assert.equal(h.G().timeLeft, 120);
  assert.equal(h.state(), 'PLAY');
});
test('Estratégia: bloco-pergunta nasce numa coluna ocupada, no topo dela', () => {
  const h = fresh(5, 3);
  const G = h.G();
  fillRow(G, 19, [9]);
  h.sb.placeQuestion();
  assert.ok(G.qBlock);
  assert.equal(G.qBlock.r, 19);
  assert.ok(G.qBlock.c >= 0 && G.qBlock.c <= 8);
  assert.equal(G.qCounter, 0);
});
test('Estratégia: as 9 habilidades executam, somam 0,5 ao multiplicador e baixam o limiar para 5', () => {
  const skills = h0().get('SKILLS');
  assert.equal(skills.length, 9);
  for (let k = 0; k < 9; k++) {
    const h = fresh(5, 3);
    const G = h.G();
    fillRow(G, 19, [9]);
    h.forceNextRandom((k + 0.5) / 9);
    h.sb.triggerSkill();
    assert.equal(G.mult, 1.5, skills[k]);
    assert.equal(G.qThreshold, 5, skills[k]);
  }
});
function h0() { return load(1); }
test('Estratégia: efeitos determinísticos de TURN, TWIST, SPEED_UP, EROSION e INVASION', () => {
  const run = (idx, setup) => {
    const h = fresh(5, 3);
    const G = h.G();
    setup(G);
    h.forceNextRandom((idx + 0.5) / 9);
    h.sb.triggerSkill();
    return { h, G };
  };
  const idx = (n) => h0().get('SKILLS').indexOf(n);
  let r = run(idx('TURN'), (G) => { G.grid[19][0] = FILL; });
  assert.ok(r.G.grid[0][9] && !r.G.grid[19][0], 'TURN gira 180°');
  r = run(idx('TWIST'), (G) => { G.grid[19][0] = FILL; });
  assert.ok(r.G.grid[19][9] && !r.G.grid[19][0], 'TWIST espelha');
  r = run(idx('SPEED_UP'), () => {});
  assert.equal(r.G.speed, 0.5);
  r = run(idx('EROSION'), (G) => { for (let c = 0; c < 10; c++) { G.grid[19][c] = FILL; G.grid[18][c] = FILL; } });
  assert.equal(filledCount(r.G), 12, 'remove 8 células');
  r = run(idx('INVASION'), () => {});
  assert.equal(filledCount(r.G), 6, 'insere 6 células');
});
test('Estratégia: limpar a linha do bloco-pergunta dispara a habilidade', () => {
  const h = fresh(5, 3);
  const G = h.G();
  fillRow(G, 19, [0, 1, 2, 3]);
  G.qBlock = { r: 19, c: 5 };
  h.forceRng((6 + 0.5) / 9); // SPEED_UP (constante)
  put(h, 'I', 0, 0, 18);
  h.sb.lockPiece();
  assert.equal(G.qBlock, null);
  assert.equal(G.mult, 1.5);
  assert.equal(G.speed, 0.5);
});

/* ---------------- Persistência e configurações ---------------- */
test('config: padrões quando o localStorage está vazio', () => {
  const h = load(1, {}, { mute: false });
  const s = h.get('settings');
  assert.equal(s.sound, true); assert.equal(s.music, true); assert.equal(s.ghost, true);
  assert.equal(s.vib, false); assert.equal(s.touch, true); assert.equal(s.theme, 0); assert.equal(s.startLevel, 1);
});
test('config: lê valores salvos e grava com as mesmas chaves', () => {
  const h = load(1, { tetris_isSound: '0', tetris_isMusic: '0', tetris_isShowGhost: '0', tetris_isVabiration: '1', tetris_isTouchControl: '0', tetris_index_bg: '2' }, { mute: false });
  const s = h.get('settings');
  assert.deepEqual([s.sound, s.music, s.ghost, s.vib, s.touch, s.theme], [false, false, false, true, false, 2]);
  s.theme = 3; s.ghost = true; h.sb.saveSettings();
  assert.equal(h.store.tetris_index_bg, '3');
  assert.equal(h.store.tetris_isShowGhost, '1');
  assert.equal(h.store.tetris_isVabiration, '1');
});
test('temas: os 4 temas existentes continuam presentes e válidos', () => {
  const h = load(1);
  const T = plain(h.get('THEMES'));
  assert.equal(T.length, 4);
  assert.deepEqual(T.map((t) => [t[0], t[1]]), [['#2433b8', '#04051f'], ['#5a1fa8', '#12041f'], ['#12805a', '#031a14'], ['#b8601c', '#1f0d04']]);
  T.forEach((t) => t.slice(0, 3).forEach((c) => assert.match(c, /^#[0-9a-f]{6}$/i)));
});
test('localStorage indisponível não derruba o jogo', () => {
  const h = load(1);
  h.sb.localStorage.getItem = () => { throw new Error('x'); };
  h.sb.localStorage.setItem = () => { throw new Error('x'); };
  assert.doesNotThrow(() => { h.sb.saveSettings(); h.sb.newGame(1); h.G().score = 10; h.sb.gameOver(); });
});

/* ---------------- Controles por teclado e toque ---------------- */
test('teclado: setas movem/giram, Z gira ao contrário, espaço derruba, C guarda, P pausa/retoma', () => {
  const h = fresh(11);
  const G = h.G();
  put(h, 'T', 0, 3, 5);
  h.key('ArrowLeft');  assert.equal(G.active.x, 2);
  h.key('ArrowRight'); assert.equal(G.active.x, 3);
  h.key('ArrowUp');    assert.equal(G.active.rot, 1);
  h.key('x');          assert.equal(G.active.rot, 2);
  h.key('z');          assert.equal(G.active.rot, 1);
  h.key('ArrowDown');  assert.equal(G.soft, true);
  h.keyUp('ArrowDown'); assert.equal(G.soft, false);
  h.key('c');          assert.equal(G.held, 'T');
  h.key('p');          assert.equal(h.state(), 'PAUSED');
  h.key('p');          assert.equal(h.state(), 'PLAY');
  const filled = filledCount(G);
  h.key(' ');          assert.ok(filledCount(G) > filled);
});
test('teclado: não age fora do estado PLAY', () => {
  const h = fresh();
  put(h, 'T', 0, 3, 5);
  h.setState('PAUSED');
  h.key('ArrowLeft');
  assert.equal(h.G().active.x, 3);
});
test('toque: tap gira (esquerda anti-horário, direita horário; sem controle lateral sempre horário)', () => {
  const h = fresh();
  const G = h.G();
  const tap = (x) => {
    h.now = 0; h.fire('pointerdown', { pointerId: 1, clientX: x, clientY: 400, target: { closest: () => null } });
    h.now = 100; h.fire('pointerup', { pointerId: 1, clientX: x, clientY: 400 });
  };
  put(h, 'T', 0, 3, 5); tap(300); assert.equal(G.active.rot, 1);
  put(h, 'T', 0, 3, 5); tap(50);  assert.equal(G.active.rot, 3);
  h.get('settings').touch = false;
  put(h, 'T', 0, 3, 5); tap(50);  assert.equal(G.active.rot, 1);
});
test('toque: arrastar move; deslizar rápido para baixo derruba; para cima guarda', () => {
  const h = fresh(11);
  const G = h.G();
  const ui = { closest: () => null };
  put(h, 'T', 0, 3, 5);
  h.now = 0; h.fire('pointerdown', { pointerId: 1, clientX: 200, clientY: 300, target: ui });
  h.fire('pointermove', { pointerId: 1, clientX: 260, clientY: 300 });
  h.now = 400; h.fire('pointerup', { pointerId: 1, clientX: 260, clientY: 300 });
  assert.equal(G.active.x, 5, 'arrasto de 60px = 2 colunas');
  const held = G.held;
  h.now = 0; h.fire('pointerdown', { pointerId: 2, clientX: 200, clientY: 300, target: ui });
  h.now = 100; h.fire('pointerup', { pointerId: 2, clientX: 200, clientY: 200 });
  assert.notEqual(G.held, held, 'deslizar para cima = hold');
  const filled = filledCount(G);
  h.now = 0; h.fire('pointerdown', { pointerId: 3, clientX: 200, clientY: 200, target: ui });
  h.now = 100; h.fire('pointerup', { pointerId: 3, clientX: 200, clientY: 330 });
  assert.ok(filledCount(G) > filled, 'deslizar para baixo = hard drop');
});
test('toque: gestos sobre botões/overlays são ignorados', () => {
  const h = fresh();
  put(h, 'T', 0, 3, 5);
  h.now = 0; h.fire('pointerdown', { pointerId: 1, clientX: 300, clientY: 400, target: { closest: () => ({}) } });
  h.now = 50; h.fire('pointerup', { pointerId: 1, clientX: 300, clientY: 400 });
  assert.equal(h.G().active.rot, 0);
});

/* ---------------- Geometria das rotações (corrige defeito: S em rotação 2 virava Z) ---------------- */
test('geometria: as 4 rotações de cada peça são a MESMA forma girada 90° (nenhuma peça muda de formato)', () => {
  const h = load(1); const SH = plain(h.get('SHAPES'));
  const norm = (cs) => { const mx = Math.min(...cs.map((c) => c[0])), my = Math.min(...cs.map((c) => c[1])); return cs.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).join(';'); };
  const rot90 = (cs) => cs.map(([x, y]) => [-y, x]);
  for (const t of PIECES) {
    let cur = SH[t].rot[0];
    for (let k = 1; k < 4; k++) { cur = rot90(cur); assert.equal(norm(SH[t].rot[k]), norm(cur), `${t} rotação ${k}`); }
    assert.equal(SH[t].rot.length, 4);
  }
});
