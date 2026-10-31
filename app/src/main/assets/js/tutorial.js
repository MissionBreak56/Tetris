'use strict';
/* Tutorial interativo: usa o motor real (modo 9). Não grava estatísticas, histórico, recordes nem conquistas. */
const Tut = {
  steps: [
    { id: 'move', text: 'Arraste o dedo para os lados (ou use ← →) para MOVER a peça.', need: 3, ev: 'move' },
    { id: 'rotate', text: 'Toque na tela (ou ↑ / Z / X) para GIRAR. O lado tocado escolhe o sentido.', need: 2, ev: 'rotate' },
    { id: 'ghost', text: 'A sombra mostra onde a peça vai cair. Toque em "Entendi" para continuar.', need: 1, ev: 'ok', manual: true },
    { id: 'soft', text: 'Arraste para BAIXO (ou ↓) para descer mais rápido.', need: 3, ev: 'soft' },
    { id: 'hard', text: 'Deslize rápido para baixo (ou Espaço) para DERRUBAR a peça de uma vez.', need: 1, ev: 'hard' },
    { id: 'hold', text: 'Deslize para CIMA (ou C) para GUARDAR a peça no Hold e trocar depois.', need: 1, ev: 'hold' },
    { id: 'line', text: 'Complete a linha de baixo com a peça I!', need: 1, ev: 'line' },
  ],
  step: 0, count: 0, pending: null,
  saved() { const d = Store.getJSON('tut', {}); return { done: !!(d && d.done), step: Math.max(0, Math.min(this.steps.length - 1, num(d && d.step))) }; },
  save(done) { Store.setJSON('tut', { done: !!done, step: this.step }); },
  start(from) { this.step = from || 0; this.count = 0; this.pending = null; this.enter(); },
  enter() { this.count = 0; const s = this.steps[this.step]; if (s && s.id === 'line') this.pending = 'line'; this.paint(); },
  event(t) { const s = this.steps[this.step]; if (s && s.ev === t) this.count++; },
  /** Chamado a cada atualização em modo tutorial. Avança de passo e prepara cenários. */
  tick() {
    const s = this.steps[this.step]; if (!s) return;
    if (this.pending === 'line' && G) {
      for (let c = 0; c < COLS; c++) G.grid[ROWS - 1][c] = (c >= 3 && c <= 6) ? null : '#7a7a7a';
      G.active = makePiece('I'); G.held = null; G.pending = null; this.pending = null;
    }
    if (this.count >= s.need) {
      this.step++; this.save(false);
      if (this.step >= this.steps.length) { this.finish(); return; }
      this.enter();
    }
  },
  finish() { this.save(true); showTutBanner(false); if (typeof goMenu === 'function') { goMenu(); } },
  skip() { this.save(true); showTutBanner(false); goMenu(); },
  paint() { const s = this.steps[this.step]; if (!s) return; showTutBanner(true, s.text, (this.step + 1) + '/' + this.steps.length, !!s.manual); },
};
function showTutBanner(on, text, prog, manual) {
  const b = $('tut'); b.style.display = on ? 'block' : 'none';
  if (!on) return;
  $('tutText').textContent = text; $('tutProg').textContent = prog;
  $('tutOk').style.display = manual ? 'inline-block' : 'none';
}
function tutEv(t) { if (G && G.rules && G.rules.tutorial) Tut.event(t); }
function startTutorial(from) { startGame(9); Tut.start(from); }
Modes.add(90, 'Tutorial', () => {
  const sv = Tut.saved();
  Sheet.push('Tutorial', (b) => {
    b.appendChild(h('div', { class: 'hint', text: 'Aprenda mover, girar, descer, derrubar, usar o Hold e completar linhas. Nada do tutorial é registrado em estatísticas ou recordes.' }));
    b.appendChild(btn(sv.done ? 'Repetir tutorial' : 'Começar', () => startTutorial(0)));
    if (!sv.done && sv.step > 0) b.appendChild(btn('Continuar do passo ' + (sv.step + 1), () => startTutorial(sv.step)));
  });
});
