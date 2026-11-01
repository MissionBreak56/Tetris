'use strict';
/* IA do oponente. Usa somente informação visível ao jogador: tabuleiro, peça ativa, hold e as 3 próximas peças.
   Toda ação sai por act(código, true) — as mesmas regras e a mesma entrada de um humano. Determinística (RNG próprio com semente). */
const AI = {
  levels: {
    easy:   { name: 'Fácil',   delay: 14, noise: 5,   mistake: 0.20, look: 0, hold: false },
    medium: { name: 'Médio',   delay: 6,  noise: 1.0, mistake: 0.04, look: 0, hold: true },
    hard:   { name: 'Difícil', delay: 3,  noise: 0,   mistake: 0,    look: 1, hold: true },
  },
  VISIBLE_NEXT: 3,
  evaluate(grid) {                      // El-Tetris: alturas, buracos e irregularidade
    const hs = Array(COLS).fill(0); let holes = 0;
    for (let c = 0; c < COLS; c++) { let seen = false; for (let r = 0; r < ROWS; r++) { if (grid[r][c]) { if (!seen) { hs[c] = ROWS - r; seen = true; } } else if (seen) holes++; } }
    let agg = 0, bump = 0; for (let c = 0; c < COLS; c++) { agg += hs[c]; if (c) bump += Math.abs(hs[c] - hs[c - 1]); }
    return -0.510066 * agg - 0.35663 * holes - 0.184483 * bump + 0.2 * (ROWS - Math.max(...hs)) / ROWS;
  },
  /** Todas as colocações alcançáveis (rotação/coluna) da peça sobre `grid`, com tabuleiro resultante e nota. */
  enumerate(grid, t) {
    const out = [], seen = new Set();
    for (let rot = 0; rot < 4; rot++) for (let x = -2; x <= COLS; x++) {
      if (collides(cells(t, rot, x, -2), grid)) continue;
      let y = -2; while (!collides(cells(t, rot, x, y + 1), grid)) y++;
      const cs = cells(t, rot, x, y); if (cs.some(([, yy]) => yy < 0)) continue;
      const key = cs.map((c) => c.join(',')).sort().join(';'); if (seen.has(key)) continue; seen.add(key);
      const g2 = grid.map((r) => r.slice()); cs.forEach(([cx, cy]) => { g2[cy][cx] = '#'; });
      const full = []; for (let r = 0; r < ROWS; r++) if (g2[r].every(Boolean)) full.push(r);
      const g3 = full.length ? g2.filter((_, r) => !full.includes(r)) : g2;
      while (g3.length < ROWS) g3.unshift(Array(COLS).fill(null));
      out.push({ rot, x, y, lines: full.length, grid: g3, score: this.evaluate(g3) + 0.760666 * full.length });
    }
    return out;
  },
  best(grid, t) { let b = null; this.enumerate(grid, t).forEach((m) => { if (!b || m.score > b.score) b = m; }); return b; },
  /** Decide a jogada para a peça ativa do tabuleiro g. Retorna {hold, rot, x}. */
  think(g) {
    const lv = this.levels[g.ai.level] || this.levels.medium, r = g.ai.rng, p = g.active;
    const nxt = g.queue.slice(0, this.VISIBLE_NEXT);
    const rate = (t) => {
      const moves = this.enumerate(g.grid, t); if (!moves.length) return null;
      moves.forEach((m) => { m.total = m.score + (r() - 0.5) * 2 * lv.noise; });
      let list = moves;
      if (lv.look && nxt[0]) {                      // lookahead: só os 6 melhores são reavaliados e COMPARADOS ENTRE SI (mesma escala)
        list = moves.sort((a, b) => b.score - a.score).slice(0, 6);
        list.forEach((m) => { const b2 = this.best(m.grid, nxt[0]); m.total = m.score + (b2 ? b2.score * 0.8 : -50); });
      }
      list.sort((a, b) => b.total - a.total);
      let pick = list[0];
      if (lv.mistake && r() < lv.mistake) pick = list[Math.min(list.length - 1, 1 + ((r() * 4) | 0))];
      return pick;
    };
    const main = rate(p.t);
    if (lv.hold && g.canHold) {
      const alt = g.held || nxt[0];
      if (alt) { const a = rate(alt); if (a && (!main || a.total > main.total + 0.5)) return { hold: true, rot: 0, x: 3 }; }
    }
    return main ? { hold: false, rot: main.rot, x: main.x } : { hold: false, rot: p.rot, x: p.x };
  },
  /** Chamado a cada tick com G == tabuleiro da IA. Executa 1 ação a cada `delay` ticks. */
  step(g) {
    const ai = g.ai, lv = this.levels[ai.level] || this.levels.medium, p = g.active;
    if (!p || g.overDone) return;
    if (--ai.cool > 0) return; ai.cool = lv.delay;
    if (!ai.plan || ai.plan.ref !== p) {
      ai.plan = this.think(g); ai.plan.ref = p; ai.stuck = 0;
      if (ai.plan.hold) { act(A.HOLD, true); ai.plan = null; return; }
    }
    const t = ai.plan, before = p.rot + ',' + p.x + ',' + p.y;
    if (ai.stuck > 3) { act(A.HARD, true); return; }
    if (p.rot !== t.rot) act(((t.rot - p.rot + 4) % 4) === 3 ? A.CCW : A.CW, true);
    else if (p.x < t.x) act(A.RIGHT, true);
    else if (p.x > t.x) act(A.LEFT, true);
    else { act(A.HARD, true); return; }
    if (g.active === p && before === p.rot + ',' + p.x + ',' + p.y) ai.stuck++;
  },
  attach(g, level, seed) { g.ai = { level, cool: 1, plan: null, stuck: 0, rng: mkRng((seed >>> 0) ^ 0xa5a5a5a5) }; },
};
