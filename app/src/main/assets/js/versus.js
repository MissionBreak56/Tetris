'use strict';
/* Versus: dois tabuleiros na mesma tela (humano×IA ou humano×humano). Reaproveita o motor trocando o tabuleiro ativo (withBoard).
   Lixo/ataque: 2 linhas=1, 3=2, Tetris=4, T-Spin 1/2/3=2/4/6, +1 B2B, bônus de combo, Perfect Clear=10. Ataques cancelam lixo recebido. */
const COMBO_BONUS = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
const GARBAGE_COLOR = '#6b7390';
const Versus = {
  active: false, cfg: null, B: [], pend: [0, 0], sent: [0, 0], rng: null, lay: [], cellV: 14, ticks: 0, acc: 0, over: false, result: null, touch: [null, null], MAX_TICKS: 18000,
  layouts() {
    const hw = W / 2, C = Math.max(10, Math.floor(Math.min((hw - 10) / (COLS + 1), (H * 0.78) / (ROWS + 3)))), pad = C * 0.4;
    this.cellV = C;
    this.lay = [0, 1].map((i) => { const bw = COLS * C, bh = ROWS * C, bx = Math.round(i * hw + (hw - bw) / 2), by = Math.round((H - bh) / 2 + C * 1.4);
      return { pad, bw, bh, bx, by, fl: bx - pad, fr: bx + bw + pad, ft: by - pad, fb: by + bh + pad, side: C * 1.7, hudY: by - pad - C * 2.8 }; });
  },
  withBoard(i, fn) {
    const pg = G, pl = Object.assign({}, L), pc = CELL, ps = SIM;
    G = this.B[i]; Object.assign(L, this.lay[i]); CELL = this.cellV; if (G.ai) SIM = true;
    try { return fn(); } finally { G = pg; Object.assign(L, pl); CELL = pc; SIM = ps; }
  },
  humans() { return this.cfg.players.filter((p) => p.kind === 'human').length; },
  /** cfg: { players:[{kind:'human'|'ai',name,level}, ...2], seed?, onEnd?(result), silent? } — humano sempre no índice 0 quando só há um. */
  create(cfg) {
    const seed = cfg.seed != null ? cfg.seed >>> 0 : (Math.random() * 4294967296) >>> 0;
    this.cfg = cfg; this.pend = [0, 0]; this.sent = [0, 0]; this.ticks = 0; this.acc = 0; this.over = false; this.result = null; this.touch = [null, null];
    this.rng = mkRng(seed ^ 0x9e3779b9); this.layouts(); this.B = [];
    const keep = G;
    for (let i = 0; i < 2; i++) {
      newGame(8, { seed, rules: { levelUps: true } });
      const g = G; g.versus = true; g.vi = i; g.rec = null; g.name = cfg.players[i].name; g.note = null; g.opts = { cfg };
      if (cfg.players[i].kind === 'ai') AI.attach(g, cfg.players[i].level || 'medium', seed + i);
      this.B.push(g);
    }
    G = this.B[0]; if (!cfg.keepG) void keep;
    return this;
  },
  start(cfg) {
    try { ac(); } catch (e) {}
    hideAll(); showTutBanner(false); Replay.stop();
    this.create(cfg); this.active = true;
    $('pauseBtn').style.display = 'flex';
    let n = 3; state = 'COUNT'; const cd = $('count'); cd.style.display = 'flex';
    const step = () => { if (n > 0) { cd.textContent = n; restartAnim(cd, 'cpop'); sfx.tick(); n--; setTimeout(step, 650); } else { cd.style.display = 'none'; state = 'VERSUS'; startMusic(); } };
    step();
  },
  stop() { this.active = false; this.touch = [null, null]; },
  attack(info, combo) {
    if (info.perfect) return 10;
    let a = info.tspin ? (info.n === 0 ? 0 : [0, 2, 4, 6][info.n]) : [0, 0, 1, 2, 4][info.n];
    if (info.b2b) a += 1;
    if (info.n > 0) a += COMBO_BONUS[Math.min(combo, COMBO_BONUS.length - 1)];
    return a;
  },
  addGarbage(g, rows) {
    const hole = Math.floor(this.rng() * COLS), overflow = g.grid.slice(0, rows).some((r) => r.some(Boolean));
    g.grid = g.grid.slice(rows).concat(Array.from({ length: rows }, () => Array.from({ length: COLS }, (_, c) => (c === hole ? null : GARBAGE_COLOR))));
    g.rowOff = Array(ROWS).fill(0); g.qBlock = null;
    if (overflow) { g.over = true; gameOver('garbage'); }
  },
  /** Chamado por lockPiece (G = tabuleiro que travou a peça), antes do spawn da próxima. */
  onLock(info) {
    const i = G.vi; let atk = this.attack(info, G.combo);
    if (atk > 0) {
      const c = Math.min(atk, this.pend[i]); this.pend[i] -= c; atk -= c;
      if (atk > 0) { this.pend[1 - i] += atk; this.sent[i] += atk; }
    }
    if (info.n === 0 && this.pend[i] > 0 && !G.overDone) { const rows = Math.min(8, this.pend[i]); this.pend[i] -= rows; this.addGarbage(G, rows); }
  },
  tick() {
    if (this.over) return; this.ticks++;
    const order = this.ticks % 2 ? [1, 0] : [0, 1];          // alterna quem age primeiro (sem vantagem sistemática em ataques simultâneos)
    for (const i of order) { const g = this.B[i]; if (g.ai && !g.overDone) this.withBoard(i, () => AI.step(g)); }
    for (const i of order) { const g = this.B[i]; if (!g.overDone) this.withBoard(i, () => update(STEP)); if (g.note && (g.note.ttl -= STEP) <= 0) g.note = null; }
    if (this.B[0].overDone || this.B[1].overDone || this.ticks >= this.MAX_TICKS) this.finish();
  },
  frame(dt) { this.acc += dt; let n = 0; while (this.acc >= STEP && n < 6 && !this.over && state === 'VERSUS') { this.acc -= STEP; this.tick(); n++; } if (n === 6) this.acc = 0; },
  /** Vencedor: quem sobreviveu; em empate (mesmo tick/tempo esgotado) vale quem enviou mais lixo, depois pontuação. */
  decide() {
    const a = this.B[0], b = this.B[1];
    if (a.overDone !== b.overDone) return { winner: a.overDone ? 1 : 0, tie: false };
    if (this.sent[0] !== this.sent[1]) return { winner: this.sent[0] > this.sent[1] ? 0 : 1, tie: true };
    if (a.score !== b.score) return { winner: a.score > b.score ? 0 : 1, tie: true };
    return { winner: 0, tie: true };
  },
  finish() {
    if (this.over) return; this.over = true;
    const d = this.decide(), B = this.B;
    this.result = { winner: d.winner, tie: d.tie, ticks: this.ticks, sent: this.sent.slice(), score: B.map((g) => Math.round(g.score)), lines: B.map((g) => g.lines), names: this.cfg.players.map((p) => p.name), kinds: this.cfg.players.map((p) => p.kind), level: this.cfg.players.map((p) => p.level || null) };
    if (this.cfg.headless) return;
    state = 'VSOVER'; stopMusic(); sfx.gameover(); $('pauseBtn').style.display = 'none';
    const finishUi = () => { if (state !== 'VSOVER') return; if (this.cfg.onEnd) this.cfg.onEnd(this.result); else this.showEnd(); };
    setTimeout(finishUi, 1200);
  },
  showEnd() {
    const r = this.result, one = this.humans() === 1, win = r.winner === 0;
    const g = this.B[0]; g.won = win; G = g;
    let rec = { tracked: false, isBest: false, prev: 0, best: 0 };
    const res = Results.compile(g, 'versus'); res.mode = 8;
    if (one) { rec = Results.commit(res); }
    const title = one ? (win ? 'VOCÊ VENCEU!' : 'VOCÊ PERDEU') : r.names[r.winner] + ' VENCEU!';
    $('endTitle').textContent = title;
    const box = $('endStats'); clearEl(box);
    box.appendChild(kv('Placar', fmtNum(r.score[0]) + ' × ' + fmtNum(r.score[1])));
    box.appendChild(kv('Linhas', r.lines[0] + ' × ' + r.lines[1])); box.appendChild(kv('Lixo enviado', r.sent[0] + ' × ' + r.sent[1]));
    box.appendChild(kv('Duração', fmtMsP(r.ticks * 1000 / 60)));
    if (r.tie) box.appendChild(h('div', { class: 'hint', text: 'Desempate por lixo enviado/pontuação.' }));
    (res.unlocked || []).forEach((a) => box.appendChild(h('div', { class: 'newrec', text: '🏆 Conquista: ' + a.name })));
    show('endPanel'); void rec;
  },
  /** Simulação sem tela (IA × IA) para torneios. Não toca no estado do app. */
  simulate(cfg) {
    const sv = { G, state, active: this.active, cfg: this.cfg, B: this.B, pend: this.pend, sent: this.sent, rng: this.rng, lay: this.lay, cell: this.cellV, ticks: this.ticks, over: this.over, result: this.result, SIM };
    const sw = typeof W === 'number' ? W : 411, sh = typeof H === 'number' ? H : 890;
    try {
      SIM = true; this.create(Object.assign({}, cfg, { headless: true, onEnd: null })); this.active = false;
      while (!this.over) this.tick();
      return this.result;
    } finally {
      SIM = sv.SIM; G = sv.G; state = sv.state; this.active = sv.active; this.cfg = sv.cfg; this.B = sv.B; this.pend = sv.pend; this.sent = sv.sent; this.rng = sv.rng; this.lay = sv.lay; this.cellV = sv.cell; this.ticks = sv.ticks; this.over = sv.over; this.result = sv.result;
      FX.parts.length = 0; FX.flash.length = 0; FX.lock.length = 0; FX.trail = null; void sw; void sh;
    }
  },
  /* ---------- entrada ---------- */
  input(p, code) { const g = this.B[p]; if (!g || g.overDone || g.ai) return false; return this.withBoard(p, () => act(code, true)); },
  playerAt(x) { return this.humans() >= 2 ? (x < W / 2 ? 0 : 1) : 0; },
  /* ---------- desenho ---------- */
  mini(t, cx, cy, s) {
    if (!t) return; const cs = SHAPES[t].rot[0]; let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    cs.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
    const ox = cx - ((x1 - x0 + 1) * s) / 2, oy = cy - ((y1 - y0 + 1) * s) / 2;
    cs.forEach(([x, y]) => drawBlock(ox + (x - x0) * s, oy + (y - y0) * s, s, COLORS[t], 1));
  },
  hud(i) {
    const g = G, C = CELL, cx = L.bx + L.bw / 2, T = TH();
    txt(g.name || ('J' + (i + 1)), cx, L.hudY + C * 0.5, C * 1.0, '#fff', 'center', '700');
    txt(fmtNum(g.score), cx, L.hudY + C * 1.6, C * 0.8, T[2], 'center', '600');
    ctx.globalAlpha = 0.8; txt('HOLD', L.bx, L.hudY + C * 2.35, C * 0.5, '#a9c6ff', 'left', '600'); txt('NEXT', L.bx + L.bw, L.hudY + C * 2.35, C * 0.5, '#a9c6ff', 'right', '600'); ctx.globalAlpha = 1;
    this.mini(g.held, L.bx + C * 3.0, L.hudY + C * 2.3, C * 0.5); this.mini(g.queue[0], L.bx + L.bw - C * 3.0, L.hudY + C * 2.3, C * 0.5);
    const pe = this.pend[i];
    if (pe > 0) { ctx.fillStyle = '#ff4d4d'; ctx.fillRect(L.fl - C * 0.35, L.fb - Math.min(pe, ROWS) * C, C * 0.25, Math.min(pe, ROWS) * C); }
    if (g.note) { ctx.globalAlpha = Math.min(1, g.note.ttl * 2); txt(g.note.t, cx, L.by + C * 5, C * 0.8, '#ffe066', 'center', '800'); ctx.globalAlpha = 1; }
    if (g.overDone || this.over) {
      const winner = this.result ? this.result.winner === i : !g.overDone;
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(L.bx, L.by, L.bw, L.bh);
      txt(g.overDone ? 'K.O.' : (winner ? 'WIN' : ''), cx, L.by + L.bh / 2, C * 1.8, g.overDone ? '#ff6a6a' : '#7dffa0', 'center', '800');
    }
  },
  render() { this.layouts(); for (let i = 0; i < 2; i++) this.withBoard(i, () => { drawFrame('vs' + i); drawBoard(); this.hud(i); }); },
};
Versus.attachNote = function (t) { if (G && G.versus) { G.note = { t, ttl: 1.2 }; return true; } return false; };

/* ---- teclado e toque (só em VERSUS; o jogo solo usa os manipuladores de input.js) ---- */
addEventListener('keydown', (e) => {
  if (!Versus.active || state !== 'VERSUS') return;
  const k = e.key, I = (c) => Versus.input(0, c);
  if (k === 'ArrowLeft') I(A.LEFT); else if (k === 'ArrowRight') I(A.RIGHT); else if (k === 'ArrowDown') I(A.SOFT_ON);
  else if (k === 'ArrowUp' || k === 'x' || k === 'X') I(A.CW); else if (k === 'z' || k === 'Z') I(A.CCW);
  else if (k === ' ') { e.preventDefault(); I(A.HARD); } else if (k === 'c' || k === 'C' || k === 'Shift') I(A.HOLD);
  else if (k === 'p' || k === 'P' || k === 'Escape') pauseGame();
});
addEventListener('keyup', (e) => { if (Versus.active && e.key === 'ArrowDown') Versus.input(0, A.SOFT_OFF); });
addEventListener('pointerdown', (e) => {
  if (!Versus.active || state !== 'VERSUS' || onUi(e)) return;
  const p = Versus.playerAt(e.clientX); if (Versus.touch[p] || Versus.B[p].ai) return;
  Versus.touch[p] = { id: e.pointerId, x: e.clientX, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false, p };
});
addEventListener('pointermove', (e) => {
  if (!Versus.active || state !== 'VERSUS') return;
  const t = Versus.touch.find((q) => q && q.id === e.pointerId); if (!t) return;
  const C = Versus.cellV, step = C * 0.9 / Controls.cfg.sens, sd = 1 / Controls.cfg.soft, g = Versus.B[t.p]; let dx = e.clientX - t.x, guard = 0;
  while (Math.abs(dx) >= step && guard++ < 6) { const s = dx > 0 ? 1 : -1; Versus.input(t.p, s > 0 ? A.RIGHT : A.LEFT); t.x += s * step; dx = e.clientX - t.x; t.moved = true; }
  if (e.clientY - t.sy > C * 1.2 * sd) { if (!g.soft) Versus.input(t.p, A.SOFT_ON); t.moved = true; } else if (g.soft && e.clientY - t.sy < C * 0.6 * sd) Versus.input(t.p, A.SOFT_OFF);
});
function endVsTouch(e, cancel) {
  const t = Versus.touch.find((q) => q && q.id === e.pointerId); if (!t) return;
  const C = Versus.cellV, dx = e.clientX - t.sx, dy = e.clientY - t.sy, dt = performance.now() - t.t, vy = dy / (dt || 1), g = Versus.B[t.p];
  if (!cancel && state === 'VERSUS') {
    if (!t.moved && dt < 350 && Math.abs(dx) < C * 0.8 && Math.abs(dy) < C * 0.8) Versus.input(t.p, Versus.humans() === 1 && settings.touch && e.clientX < W / 2 ? A.CCW : A.CW);
    else if (vy > 0.6 / Controls.cfg.swipe && dy > C * 1.5 / Controls.cfg.swipe) Versus.input(t.p, A.HARD);
    else if (vy < -0.6 / Controls.cfg.swipe && dy < -C * 1.5 / Controls.cfg.swipe) Versus.input(t.p, A.HOLD);
  }
  if (g.soft) Versus.input(t.p, A.SOFT_OFF);
  Versus.touch[t.p] = null;
}
addEventListener('pointerup', (e) => endVsTouch(e, false));
addEventListener('pointercancel', (e) => endVsTouch(e, true));

function openVersus() {
  Sheet.push('Versus', (b) => {
    b.appendChild(h('div', { class: 'hint', text: 'Dois tabuleiros. Limpar linhas envia lixo ao oponente (2 linhas=1, 3=2, Tetris=4, T-Spin=2/4/6, +1 B2B). Perde quem topar primeiro. Contra a IA os gestos valem na tela toda; com dois jogadores, cada um usa a sua metade.' }));
    const me = () => Profile.cur().name;
    Object.keys(AI.levels).forEach((k) => b.appendChild(btn('Contra IA — ' + AI.levels[k].name, () => Versus.start({ players: [{ kind: 'human', name: me() }, { kind: 'ai', name: 'IA ' + AI.levels[k].name, level: k }] }))));
    b.appendChild(btn('Dois jogadores (mesma tela)', () => Versus.start({ players: [{ kind: 'human', name: 'Jogador 1' }, { kind: 'human', name: 'Jogador 2' }] })));
  });
}
Modes.add(50, 'Versus (IA / 2 jogadores)', openVersus);
