'use strict';
/* Versus: dois tabuleiros na mesma tela (humano×IA ou humano×humano). Reaproveita o motor trocando o tabuleiro ativo (withBoard).
   Lixo/ataque: 2 linhas=1, 3=2, Tetris=4, T-Spin 1/2/3=2/4/6, +1 B2B, bônus de combo, Perfect Clear=10. Ataques cancelam lixo recebido. */
const COMBO_BONUS = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
const GARBAGE_COLOR = '#707070';
const Versus = {
  PRED_MAX: 45, SNAP_WIN: 70,
  active: false, net: null, cfg: null, B: [], pend: [0, 0], sent: [0, 0], rng: null, lay: [], cellV: 14, ticks: 0, acc: 0, over: false, result: null, touch: [null, null], MAX_TICKS: 18000,
  layouts() {
    if (this.net) { this.cellV = CELL; this.lay = [L, L]; return; }          // online: cada um vê SÓ a sua tela (layout solo); gestos usam o tamanho de célula solo
    const hw = W / 2, C = Math.max(10, Math.floor(Math.min((hw - 10) / (COLS + 1), (H * 0.78) / (ROWS + 3)))), pad = C * 0.4;
    this.cellV = C;
    this.lay = [0, 1].map((i) => { const bw = COLS * C, bh = ROWS * C, bx = Math.round(i * hw + (hw - bw) / 2), by = Math.round((H - bh) / 2 + C * 1.4);
      return { pad, bw, bh, bx, by, fl: bx - pad, fr: bx + bw + pad, ft: by - pad, fb: by + bh + pad, side: C * 1.7, hudY: by - pad - C * 2.8 }; });
  },
  withBoard(i, fn) {
    const pg = G, ps = SIM, net = this.net, remote = !!(net && i !== net.local);
    if (net) {                                                       // online: mesmo layout solo; o tabuleiro do oponente roda em silêncio e sem efeitos na SUA tela
      let fx = null; G = this.B[i]; if (remote) { SIM = true; fx = { parts: FX.parts, flash: FX.flash, lock: FX.lock, trail: FX.trail, shake: FX.shake, pulse: FX.pulse, screen: FX.screen }; FX.parts = []; FX.flash = []; FX.lock = []; FX.trail = null; }
      try { return fn(); } finally { G = pg; SIM = ps; if (fx) { FX.parts = fx.parts; FX.flash = fx.flash; FX.lock = fx.lock; FX.trail = fx.trail; FX.shake = fx.shake; FX.pulse = fx.pulse; FX.screen = fx.screen; } }
    }
    const pl = Object.assign({}, L), pc = CELL;
    G = this.B[i]; Object.assign(L, this.lay[i]); CELL = this.cellV; if (G.ai) SIM = true;
    try { return fn(); } finally { G = pg; Object.assign(L, pl); CELL = pc; SIM = ps; }
  },
  humans() { return this.cfg.players.filter((p) => p.kind === 'human').length; },
  /** cfg: { players:[{kind:'human'|'ai',name,level}, ...2], seed?, onEnd?(result), silent? } — humano sempre no índice 0 quando só há um. */
  create(cfg) {
    const seed = cfg.seed != null ? cfg.seed >>> 0 : (Math.random() * 4294967296) >>> 0;
    this.cfg = cfg; this.pend = [0, 0]; this.sent = [0, 0]; this.ticks = 0; this.acc = 0; this.over = false; this.result = null; this.touch = [null, null];
    this.rng = mkRng(seed ^ 0x9e3779b9); this.B = [];
    this.net = cfg.net ? { local: cfg.net.local, link: true, soft: [false, false], q: [{}, {}], remoteUpto: -1, out: [], snaps: {}, rb: null, endTick: null, nextH: Net.HASH_EVERY, hashes: {}, remoteHashes: {} } : null;
    this.layouts();
    const keep = G;
    for (let i = 0; i < 2; i++) {
      newGame(8, { seed, rules: { levelUps: true } });
      const g = G; g.versus = true; g.vi = i; g.rec = null; g.name = cfg.players[i].name; g.note = null; g.opts = { cfg };
      if (this.net) g.level = 1;                                  // igual nos dois aparelhos (não depende do nível inicial salvo)
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
    const step = () => { if (n > 0) { cd.textContent = n; restartAnim(cd, 'cpop'); sfx.tick(); n--; setTimeout(step, 650); } else { cd.style.display = 'none'; state = 'VERSUS'; startMusic(true); } };
    step();
  },
  stop() { this.active = false; this.touch = [null, null]; if (this.net) { this.net = null; Net.disconnect(); } },
  me() { return this.net ? this.net.local : 0; },
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
  /** Atualiza os dois tabuleiros por 1 tick (ticks já incrementado). Compartilhado entre jogo local e online. */
  stepBoards() {
    const order = this.ticks % 2 ? [1, 0] : [0, 1];          // alterna quem age primeiro (sem vantagem sistemática em ataques simultâneos)
    for (const i of order) { const g = this.B[i]; if (g.ai && !g.overDone) this.withBoard(i, () => AI.step(g)); }
    for (const i of order) { const g = this.B[i]; if (!g.overDone) this.withBoard(i, () => update(STEP)); if (g.note && (g.note.ttl -= STEP) <= 0) g.note = null; }
  },
  tick() {
    if (this.over) return;
    if (this.net) { this.netTick(); return; }
    this.ticks++;
    this.stepBoards();
    if (this.B[0].overDone || this.B[1].overDone || this.ticks >= this.MAX_TICKS) this.finish();
  },
  frame(dt) {
    this.acc += dt; let n = 0;
    if (this.net) {                                                   // previsão + correção: avança sem esperar o oponente (até PRED_MAX ticks)
      Net.pump(); this.netRollback();
      if (!this.net.link) { this.acc = 0; this.netCheck(); return; }          // conexão caída (reconectando): jogo parado para os dois, sem acumular tempo
      while (this.acc >= STEP && n < 6 && !this.over && state === 'VERSUS' && this.net && this.ticks - (this.net.remoteUpto + 1) < this.PRED_MAX) { this.acc -= STEP; this.netTick(); n++; }
      if (this.acc > STEP * 6) this.acc = STEP * 6;
      if (this.net) { this.netCheck(); Net.pump(); }
      return;
    } while (this.acc >= STEP && n < 6 && !this.over && state === 'VERSUS') { this.acc -= STEP; this.tick(); n++; } if (n === 6) this.acc = 0; },
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
    if (this.net) { Net.pump(true); Net.matchEnded(); }      // última confirmação: o oponente precisa do nosso "u" para também encerrar
    state = 'VSOVER'; stopMusic(); sfx.gameover(); $('pauseBtn').style.display = 'none';
    const finishUi = () => { if (state !== 'VSOVER') return; if (this.cfg.onEnd) this.cfg.onEnd(this.result); else this.showEnd(); };
    setTimeout(finishUi, 1200);
  },
  showEnd() {
    const r = this.result, net = !!this.net || !!(this.cfg && this.cfg.net), one = this.humans() === 1 || net, me = net ? this.cfg.net.local : 0, win = r.winner === me;
    const g = this.B[me]; g.won = win; G = g;
    let rec = { tracked: false, isBest: false, prev: 0, best: 0 };
    const res = Results.compile(g, 'versus'); res.mode = net ? 10 : 8;
    if (one) { rec = Results.commit(res); }
    const title = r.aborted ? 'PARTIDA INTERROMPIDA' : one ? (win ? 'VOCÊ VENCEU!' : 'VOCÊ PERDEU') : r.names[r.winner] + ' VENCEU!';
    $('endTitle').textContent = title;
    const box = $('endStats'); clearEl(box);
    box.appendChild(kv('Placar', fmtNum(r.score[0]) + ' × ' + fmtNum(r.score[1])));
    box.appendChild(kv('Linhas', r.lines[0] + ' × ' + r.lines[1])); box.appendChild(kv('Lixo enviado', r.sent[0] + ' × ' + r.sent[1]));
    box.appendChild(kv('Duração', fmtMsP(r.ticks * 1000 / 60)));
    if (r.tie && !r.reason) box.appendChild(h('div', { class: 'hint', text: 'Desempate por lixo enviado/pontuação.' }));
    if (r.reason) box.appendChild(h('div', { class: 'errs', text: r.reason }));
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
  input(p, code) {
    if (this.net) {                                                   // ação local: vale já no próximo tick (sem atraso) e é enviada na hora
      const g = this.B[p]; if (p !== this.net.local || !g || g.overDone || this.over || state !== 'VERSUS') return false;
      if (!this.net.link && code !== A.SOFT_OFF) return false;
      const sf = this.net.soft;                                       // queda suave: segue a INTENÇÃO (g.soft só muda no próximo tick; soltar o dedo no mesmo quadro perdia o SOFT_OFF e a peça caía sem parar)
      if (code === A.SOFT_ON) { if (sf[p]) return false; sf[p] = true; } else if (code === A.SOFT_OFF) { if (!sf[p]) return false; sf[p] = false; }
      const t = this.ticks; (this.net.q[p][t] = this.net.q[p][t] || []).push(code); this.net.out.push([t, code]); Net.pump(true); return true;
    }
    const g = this.B[p]; if (!g || g.overDone || g.ai) return false; return this.withBoard(p, () => act(code, true)); },
  /** Queda suave pedida pelo jogador p (online: a intenção já enviada; local: o estado do tabuleiro, que muda na hora). */
  softOn(p) { return this.net ? !!this.net.soft[p] : !!this.B[p].soft; },
  playerAt(x) { if (this.net) return this.net.local; return this.humans() >= 2 ? (x < W / 2 ? 0 : 1) : 0; },
  /* ---------- desenho ---------- */
  mini(t, cx, cy, s) {
    if (!t) return; const cs = SHAPES[t].rot[0]; let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    cs.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
    const ox = cx - ((x1 - x0 + 1) * s) / 2, oy = cy - ((y1 - y0 + 1) * s) / 2;
    cs.forEach(([x, y]) => drawBlock(ox + (x - x0) * s, oy + (y - y0) * s, s, COLORS[t], 1));
  },
  hud(i) {
    const g = G, C = CELL, cx = L.bx + L.bw / 2, T = TH();
    txt(g.name || ('J' + (i + 1)), cx, L.hudY + C * 0.5, C * 1.0, Theme.ui().ink, 'center', '700');
    txt(fmtNum(g.score), cx, L.hudY + C * 1.6, C * 0.8, T[2], 'center', '600');
    ctx.globalAlpha = 0.8; txt('HOLD', L.bx, L.hudY + C * 2.35, C * 0.5, Theme.ui().dim, 'left', '600'); txt('NEXT', L.bx + L.bw, L.hudY + C * 2.35, C * 0.5, Theme.ui().dim, 'right', '600'); ctx.globalAlpha = 1;
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
  render() {
    if (this.net) { this.renderNet(); return; }
    this.layouts(); for (let i = 0; i < 2; i++) this.withBoard(i, () => { drawFrame('vs' + i); drawBoard(); this.hud(i); });
    if (this.net && Net.ping() != null) txt(Math.round(Net.ping()) + ' ms', W / 2, 14, 12, 'rgba(255,255,255,.6)', 'center', '500');
  },
};
/* ---- online: previsão com correção (rollback) ----
   Cada aparelho simula os DOIS tabuleiros e aplica suas próprias ações na hora. Ações do oponente que chegam atrasadas (tick já simulado)
   fazem o jogo voltar ao snapshot daquele tick e re-simular até o presente. Fim de partida só vale quando confirmado (todas as ações anteriores conhecidas). */
const VISUAL_ONLY = ['note', 'disp', 'rowOff', 'overT'];            // animações: não fazem parte da simulação nem do snapshot
const NOT_STATE = ['rng', 'opts', 'rules', 'ai'].concat(VISUAL_ONLY);
function cloneBoard(g) {
  const o = {};
  for (const k in g) {
    if (NOT_STATE.includes(k)) continue;
    const v = g[k];
    o[k] = Array.isArray(v) ? (k === 'grid' ? v.map((r) => r.slice()) : v.slice()) : (v && typeof v === 'object' ? Object.assign({}, v) : v);
  }
  o.__rng = g.rng.get(); return o;
}
function restoreBoard(g, s) {
  for (const k in s) {
    if (k === '__rng') { g.rng.set(s.__rng); continue; }
    const v = s[k]; g[k] = Array.isArray(v) ? (k === 'grid' ? v.map((r) => r.slice()) : v.slice()) : (v && typeof v === 'object' ? Object.assign({}, v) : v);
  }
  for (const k of Object.keys(g)) if (!(k in s) && !NOT_STATE.includes(k)) delete g[k];
}
Versus.snap = function () { return { B: this.B.map(cloneBoard), pend: this.pend.slice(), sent: this.sent.slice(), vr: this.rng.get() }; };
Versus.unsnap = function (s, tick) {
  s.B.forEach((b, i) => restoreBoard(this.B[i], b)); this.pend = s.pend.slice(); this.sent = s.sent.slice(); this.rng.set(s.vr); this.ticks = tick;
};
/** Conexão caiu (false) ou voltou (true): com a conexão caída o jogo para dos dois lados (o oponente para sozinho ao esgotar a previsão). */
Versus.netLink = function (ok) { if (!this.net) return; this.net.link = !!ok; if (!ok) this.acc = 0; };
Versus.netApply = function (t) {
  for (let i = 0; i < 2; i++) {
    const ev = this.net.q[i][t]; if (!ev) continue;
    ev.forEach((c) => { const g = this.B[i]; if (!g.overDone) this.withBoard(i, () => act(c, true)); });
  }
};
/** 1 tick online: guarda snapshot (estado antes do tick), aplica ações do tick, simula. */
Versus.netTick = function () {
  const n = this.net; n.snaps[this.ticks] = this.snap();
  this.netApply(this.ticks); this.ticks++; this.stepBoards();
  if (n.endTick == null && (this.B[0].overDone || this.B[1].overDone || this.ticks >= this.MAX_TICKS)) n.endTick = this.ticks;
  const low = Math.min(this.ticks - this.SNAP_WIN, n.nextH);
  for (const k of Object.keys(n.snaps)) if (+k < low) delete n.snaps[k];
  for (let i = 0; i < 2; i++) for (const k of Object.keys(n.q[i])) if (+k < low) delete n.q[i][k];
};
/** Volta ao tick mais antigo afetado por ações remotas recebidas e re-simula (em silêncio) até o presente. */
Versus.netRollback = function () {
  const n = this.net; if (!n || n.rb == null) return;
  const rt = n.rb; n.rb = null; if (rt >= this.ticks) return;
  const snap = n.snaps[rt]; if (!snap) return this.netAbort('Fora de sincronia (janela de correção excedida)');
  const target = this.ticks, fx = { parts: FX.parts, flash: FX.flash, lock: FX.lock, trail: FX.trail, shake: FX.shake, pulse: FX.pulse }, sim = SIM;
  if (n.endTick != null && n.endTick > rt) n.endTick = null;
  const vis = this.B.map((g) => g.active && { t: g.active.t, dx: g.active.dx, age: g.active.age });     // suavização visual da peça ativa
  this.unsnap(snap, rt); SIM = true; FX.parts = []; FX.flash = []; FX.lock = []; FX.trail = null;
  try { while (this.ticks < target) this.netTick(); }
  finally {
    this.B.forEach((g, i) => { if (g.active && vis[i] && vis[i].t === g.active.t) { g.active.dx = vis[i].dx; g.active.age = vis[i].age; } });   // sem "pulos" a cada correção
    SIM = sim; FX.parts = fx.parts; FX.flash = fx.flash; FX.lock = fx.lock; FX.trail = fx.trail; FX.shake = fx.shake; FX.pulse = fx.pulse; }
};
/** Checagens sobre o estado CONFIRMADO: hash de sincronia periódico e fim de partida. */
Versus.netCheck = function () {
  const n = this.net; if (!n || this.over) return;
  while (n.nextH <= this.ticks && n.remoteUpto >= n.nextH - 1 && n.snaps[n.nextH]) {
    const t = n.nextH, h = this.snapHash(n.snaps[t]); n.hashes[t] = h; Net.send({ k: 'h', t, h });
    if (n.remoteHashes[t] !== undefined) this.netCompare(t);
    n.nextH += Net.HASH_EVERY; if (this.over) return;
  }
  if (n.endTick != null && n.remoteUpto >= n.endTick - 1) {
    if (this.ticks !== n.endTick) { const s = n.snaps[n.endTick]; if (!s) return this.netAbort('Fora de sincronia'); this.unsnap(s, n.endTick); }
    this.finish();
  }
};
Versus.netRecv = function (m) {
  const n = this.net, r = 1 - n.local;
  if (!Number.isInteger(m.u) || m.u < -1 || m.u > this.ticks + 600 || m.u < n.remoteUpto || !Array.isArray(m.e) || m.e.length > 64) return this.netAbort('Mensagem inválida do oponente');
  let minT = Infinity;
  for (const x of m.e) {
    if (!Array.isArray(x) || x.length !== 2 || !Number.isInteger(x[0]) || !Number.isInteger(x[1]) || x[1] < 0 || x[1] > 7) return this.netAbort('Ação inválida do oponente');
    if (x[0] <= m.u || x[0] <= n.remoteUpto) return this.netAbort('Ação fora de ordem');
    if (x[0] < this.ticks - this.SNAP_WIN + 2 || x[0] > this.ticks + 600) return this.netAbort('Ação fora de sincronia');
    (n.q[r][x[0]] = n.q[r][x[0]] || []).push(x[1]); if (x[0] < minT) minT = x[0];
  }
  if (minT < this.ticks) n.rb = n.rb == null ? minT : Math.min(n.rb, minT);       // ação do passado: corrigir no início do próximo quadro
  n.remoteUpto = m.u;
};
/** Hash de sincronia: o grid entra só como OCUPAÇÃO (0/1). As cores das células vêm do tema/paleta de cada aparelho e podem ser diferentes entre os dois
    jogadores — não fazem parte da simulação (antes, temas diferentes causavam "dessincronizaram" já no 1º hash, tick 120). */
Versus.gridKey = function (grid) { return grid.map((r) => r.map((c) => (c ? 1 : 0)).join('')); };
Versus.snapHash = function (s) {
  return fnv(JSON.stringify([s.B.map((b) => [this.gridKey(b.grid), Math.round(b.score), b.lines, b.level, b.tick, b.active && b.active.t, b.active && b.active.x, b.active && b.active.y, b.held, b.queue.slice(0, 3)]), s.pend, s.sent]));
};
Versus.netRecvHash = function (m) {
  const n = this.net; if (!Number.isInteger(m.t) || typeof m.h !== 'string' || m.h.length > 16) return;
  n.remoteHashes[m.t] = m.h; if (n.hashes[m.t] !== undefined) this.netCompare(m.t);
};
Versus.netCompare = function (t) {
  const n = this.net, a = n.hashes[t], b = n.remoteHashes[t]; delete n.hashes[t]; delete n.remoteHashes[t];
  if (a !== b) this.netAbort('Os jogos dessincronizaram (tick ' + t + ')');
};
/** Encerra sem vencedor (dessincronia, mensagem inválida). */
Versus.netAbort = function (why) {
  if (this.over) return; this.over = true; const B = this.B;
  this.result = { winner: -1, tie: false, aborted: true, reason: why, ticks: this.ticks, sent: this.sent.slice(), score: B.map((g) => Math.round(g.score)), lines: B.map((g) => g.lines), names: this.cfg.players.map((p) => p.name), kinds: ['human', 'human'] };
  Net.send({ k: 'bye' }); try { Net.tr().close(); } catch (e) {}
  state = 'VSOVER'; stopMusic(); $('pauseBtn').style.display = 'none'; Net.st = 'ended'; Net.peer = null; Net.stopTimer();
  setTimeout(() => { if (state === 'VSOVER') this.showEnd(); }, 600);
};
/** Um dos lados saiu/caiu: o outro vence. */
Versus.netForfeit = function (loser, why) {
  if (this.over) return; this.B[loser].overDone = true; this.finish();
  if (this.result) this.result.reason = why;
};
/* ---- online: tela cheia do jogador local (igual ao solo) + miniatura opcional do oponente ---- */
Versus.renderNet = function () {
  const me = this.net.local, g = this.B[me], op = this.B[1 - me], sv = G;
  this.layouts(); G = g;
  try {
    drawFrame(); drawBoard(); drawHUD();
    this.netHud(g, op, me);
  } finally { G = sv; }
};
Versus.netHud = function (g, op, me) {
  const C = CELL, T = TH();
  const p = Net.ping(), nm = (this.cfg.players[1 - me].name || 'Oponente').slice(0, 14);
  txt('vs ' + nm + (p != null ? '  ·  ' + Math.round(p) + ' ms' : ''), W / 2, L.hudY + C * 0.95, C * 0.5, 'rgba(255,255,255,.7)', 'center', '600');
  const pe = this.pend[me];                                           // lixo a caminho: barra vermelha na margem esquerda da moldura
  if (pe > 0) { const hh = Math.min(pe, ROWS) * C; ctx.fillStyle = '#ff4d4d'; ctx.fillRect(L.bx - L.pad * 0.42, L.by + L.bh - hh, L.pad * 0.3, hh); }
  this.netBanner(C);
  if (settings.oppView) {                                             // miniatura do oponente (coluna esquerda, abaixo do Hold)
    const w = L.hold.w, cs = w / COLS, x0 = L.hold.x, y0 = L.hold.y + L.hold.h + C * 1.3, hh = ROWS * cs;
    txt(nm.slice(0, 8), x0 + w / 2, y0 - C * 0.45, C * 0.4, Theme.ui().dim, 'center', '600');
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x0, y0, w, hh);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const col = op.grid[r][c]; if (col) { ctx.fillStyle = col; ctx.fillRect(x0 + c * cs, y0 + r * cs, Math.max(1, cs - 0.6), Math.max(1, cs - 0.6)); } }
    if (op.active && !op.overDone) { ctx.globalAlpha = 0.85; ctx.fillStyle = COLORS[op.active.t]; cells(op.active).forEach(([cx, cy]) => { if (cy >= 0) ctx.fillRect(x0 + cx * cs, y0 + cy * cs, Math.max(1, cs - 0.6), Math.max(1, cs - 0.6)); }); ctx.globalAlpha = 1; }
    ctx.strokeStyle = T[2]; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, hh - 1);
    const po = this.pend[1 - me]; if (po > 0) { ctx.fillStyle = '#ff4d4d'; ctx.fillRect(x0 + w + 1, y0 + hh - Math.min(po, ROWS) * cs, 2, Math.min(po, ROWS) * cs); }
    if (op.overDone) txt('K.O.', x0 + w / 2, y0 + hh / 2, C * 0.6, '#ff6a6a', 'center', '800');
  }
  if (g.overDone || this.over) {
    const win = this.result ? this.result.winner === me : !g.overDone;
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(L.bx, L.by, L.bw, L.bh);
    txt(g.overDone ? 'K.O.' : (win ? 'WIN' : ''), L.bx + L.bw / 2, L.by + L.bh / 2, C * 2.2, g.overDone ? '#ff6a6a' : '#7dffa0', 'center', '800');
  }
};
/** Aviso na tela: reconectando (com contagem) ou aguardando o oponente (previsão esgotada / sem sinal). */
Versus.netBanner = function (C) {
  const n = this.net; let msg = '', sub = '';
  if (Net.st === 'reconnecting') { msg = 'Reconectando…'; sub = 'Partida parada · ' + Math.max(0, Math.ceil((Net.GRACE_MS - (Net.now() - Net.rcAt)) / 1000)) + ' s'; }
  else if (!this.over && this.ticks - (n.remoteUpto + 1) >= this.PRED_MAX - 3) { msg = 'Aguardando o oponente…'; }
  if (!msg) return;
  const y = L.by + L.bh * 0.42, w = Math.min(L.bw, C * 9);
  ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(L.bx + (L.bw - w) / 2, y - C * 1.1, w, sub ? C * 2.6 : C * 1.7);
  txt(msg, L.bx + L.bw / 2, y, C * 0.7, '#ffd166', 'center', '700'); if (sub) txt(sub, L.bx + L.bw / 2, y + C * 0.95, C * 0.5, 'rgba(255,255,255,.8)', 'center', '600');
};
Versus.attachNote = function (t) { if (G && G.versus && !Versus.net) { G.note = { t, ttl: 1.2 }; return true; } return false; };

/* ---- teclado e toque (só em VERSUS; o jogo solo usa os manipuladores de input.js) ---- */
addEventListener('keydown', (e) => {
  if (!Versus.active || state !== 'VERSUS') return;
  const k = e.key, I = (c) => Versus.input(Versus.me(), c);
  if (k === 'ArrowLeft') I(A.LEFT); else if (k === 'ArrowRight') I(A.RIGHT); else if (k === 'ArrowDown') I(A.SOFT_ON);
  else if (k === 'ArrowUp' || k === 'x' || k === 'X') I(A.CW); else if (k === 'z' || k === 'Z') I(A.CCW);
  else if (k === ' ') { e.preventDefault(); I(A.HARD); } else if (k === 'c' || k === 'C' || k === 'Shift') I(A.HOLD);
  else if (k === 'p' || k === 'P' || k === 'Escape') pauseGame();
});
addEventListener('keyup', (e) => { if (Versus.active && e.key === 'ArrowDown') Versus.input(Versus.me(), A.SOFT_OFF); });
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
  if (e.clientY - t.sy > C * 1.2 * sd) { if (!Versus.softOn(t.p)) Versus.input(t.p, A.SOFT_ON); t.moved = true; } else if (Versus.softOn(t.p) && e.clientY - t.sy < C * 0.6 * sd) Versus.input(t.p, A.SOFT_OFF);
});
function endVsTouch(e, cancel) {
  const t = Versus.touch.find((q) => q && q.id === e.pointerId); if (!t) return;
  const C = Versus.cellV, dx = e.clientX - t.sx, dy = e.clientY - t.sy, dt = performance.now() - t.t, vy = dy / (dt || 1), g = Versus.B[t.p];
  if (!cancel && state === 'VERSUS') {
    if (!t.moved && dt < 350 && Math.abs(dx) < C * 0.8 && Math.abs(dy) < C * 0.8) Versus.input(t.p, (Versus.net || Versus.humans() === 1) && settings.touch && e.clientX < W / 2 ? A.CCW : A.CW);
    else if (vy > 0.6 / Controls.cfg.swipe && dy > C * 1.5 / Controls.cfg.swipe) Versus.input(t.p, A.HARD);
    else if (vy < -0.6 / Controls.cfg.swipe && dy < -C * 1.5 / Controls.cfg.swipe) Versus.input(t.p, A.HOLD);
  }
  if (Versus.softOn(t.p)) Versus.input(t.p, A.SOFT_OFF);
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
Modes.add(50, 'Versus (IA / 2 jogadores)', openVersus, 'versus');
