'use strict';
/* Fantasma: corra contra a sua MELHOR partida do modo (Classic, 2 Minutes, Strategy, Sprint). Uma segunda "cópia" do motor repete as ações gravadas no replay do recorde,
   em silêncio (SIM) e sem efeitos, e aparece como uma miniatura sob o Hold, com a diferença de pontos/linhas ao vivo. O replay do recorde é guardado por perfil ('ghost');
   se ainda não houver, usa o melhor replay já salvo na lista de Replays. Só repete o que o replay gravou: a sua partida nunca é afetada. */
const Ghost = {
  g: null, rep: null, ev: null, i: 0, done: false, MODES: [1, 2, 3, 5],
  all() { const d = Store.getJSON('ghost', {}); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; },
  /** Replay do fantasma do modo: o guardado ou, na falta, o melhor da lista de Replays (maior placar; Sprint = menor tempo concluído). */
  get(mode) {
    const r = this.all()[mode]; if (r && Replays.validate(r).ok && r.mode === mode) return r;
    const l = Replays.load().map((x) => x.rep).filter((x) => x.mode === mode && (mode !== 5 || x.res.lines >= 40));
    if (!l.length) return null; return l.sort((a, b) => (mode === 5 ? a.res.ms - b.res.ms : b.res.score - a.res.score))[0];
  },
  /** Chamado quando uma partida bate o recorde: o replay recém-gravado vira o fantasma do modo. */
  saveBest(id) {
    const x = Replays.load().find((y) => y.id === id); if (!x || !this.MODES.includes(x.rep.mode)) return false;
    const d = this.all(); d[x.rep.mode] = x.rep; return Store.setJSON('ghost', d);
  },
  clear() { this.g = null; this.rep = null; this.ev = null; this.i = 0; this.done = false; },
  /** Início de uma partida solo: cria o tabuleiro-fantasma, se houver replay e a preferência estiver ligada. */
  onGame(g) {
    this.clear();
    if (!settings.ghostRace || !g || SIM || g.replay || !this.MODES.includes(g.mode) || (g.opts && (g.opts.daily || g.opts.custom))) return false;
    const rep = this.get(g.mode); if (!rep) return false;
    try { this.g = this.make(rep); } catch (e) { this.g = null; }
    if (!this.g) return false; this.rep = rep; this.ev = Replays.dec(rep.ev); this.i = 0; this.done = false; return true;
  },
  /** Mesmo caminho de Replay.play/simulate: nova partida com a semente/regras do replay, marcada como replay (nada é gravado nem mostrado). */
  make(rep) {
    const sg = G, ss = SIM, sl = settings.startLevel, st = state, fx = { parts: FX.parts, flash: FX.flash, lock: FX.lock, trail: FX.trail, shake: FX.shake, pulse: FX.pulse, screen: FX.screen };
    SIM = true; settings.startLevel = rep.sl;
    try { newGame(rep.mode, Object.assign({}, rep.opts, { seed: rep.seed, rules: Replays.cleanRules(rep.opts.rules) })); const g = G; g.replay = true; g.rec = null; g.ghost = true; return g; }
    finally { G = sg; SIM = ss; settings.startLevel = sl; state = st; FX.parts = fx.parts; FX.flash = fx.flash; FX.lock = fx.lock; FX.trail = fx.trail; FX.shake = fx.shake; FX.pulse = fx.pulse; FX.screen = fx.screen; }
  },
  /** Acompanha o jogo ao vivo: avança o fantasma até o mesmo tick (chamado a cada tick do jogo). */
  sync() { const gg = this.g; if (!gg || !G || G === gg) return; let n = 0; while (!this.done && gg.tick < G.tick && n++ < 12) this.stepOne(); },
  stepOne() {
    const gg = this.g, c = this, sg = G, ss = SIM, fx = { parts: FX.parts, flash: FX.flash, lock: FX.lock, trail: FX.trail, shake: FX.shake, pulse: FX.pulse, screen: FX.screen };
    G = gg; SIM = true; FX.parts = []; FX.flash = []; FX.lock = []; FX.trail = null;
    try {
      while (c.i < c.ev.length && c.ev[c.i] === gg.tick && !gg.overDone) { act(c.ev[c.i + 1], true); c.i += 2; }
      if (!gg.overDone && gg.tick < c.rep.ticks) update(STEP);
      if (gg.overDone || gg.tick >= c.rep.ticks) c.done = true;
    } finally { G = sg; SIM = ss; FX.parts = fx.parts; FX.flash = fx.flash; FX.lock = fx.lock; FX.trail = fx.trail; FX.shake = fx.shake; FX.pulse = fx.pulse; FX.screen = fx.screen; }
  },
  /** Diferença ao vivo (positivo = você está na frente). */
  delta() { const gg = this.g; if (!gg || !G) return 0; return this.rep.mode === 5 ? G.lines - gg.lines : Math.round(G.score) - Math.round(gg.score); },
  /** Miniatura sob o Hold + diferença. */
  draw() {
    const gg = this.g; if (!gg || !G || G === gg || !L.hold) return;
    const C = CELL, w = L.hold.w, cs = w / COLS, x0 = L.hold.x, y0 = L.hold.y + L.hold.h + C * 1.3, hh = ROWS * cs, d = this.delta();
    txt('👻 Recorde', x0 + w / 2, y0 - C * 0.45, C * 0.4, Theme.ui().dim, 'center', '600');
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x0, y0, w, hh);
    ctx.globalAlpha = 0.8;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const col = gg.grid[r][c]; if (col) { ctx.fillStyle = col; ctx.fillRect(x0 + c * cs, y0 + r * cs, Math.max(1, cs - 0.6), Math.max(1, cs - 0.6)); } }
    if (gg.active && !gg.overDone) { ctx.fillStyle = COLORS[gg.active.t]; cells(gg.active).forEach(([cx, cy]) => { if (cy >= 0) ctx.fillRect(x0 + cx * cs, y0 + cy * cs, Math.max(1, cs - 0.6), Math.max(1, cs - 0.6)); }); }
    ctx.globalAlpha = 1; ctx.strokeStyle = TH()[2]; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, hh - 1);
    if (gg.overDone) txt('FIM', x0 + w / 2, y0 + hh / 2, C * 0.55, '#ff6a6a', 'center', '800');
    const sp = this.rep.mode === 5, fmt = sp ? (v) => Math.abs(v) + ' lin' : (v) => fmtNum(Math.abs(v));
    txt((d >= 0 ? '+' : '−') + fmt(d), x0 + w / 2, y0 + hh + C * 0.7, C * 0.5, d >= 0 ? '#7dffa0' : '#ff8a8a', 'center', '700');
    txt(sp ? gg.lines + ' lin' : fmtNum(gg.score), x0 + w / 2, y0 + hh + C * 1.35, C * 0.4, Theme.ui().dim, 'center', '600');
  },
};
