'use strict';
/* Camada ÚNICA de ações do jogador (teclado, gestos, replay). Toda ação passa por act():
   conta para APM e é gravada com o tick da simulação (base dos replays). */
const A = { LEFT: 0, RIGHT: 1, CW: 2, CCW: 3, HARD: 4, HOLD: 5, SOFT_ON: 6, SOFT_OFF: 7 };
const STEP = 1 / 60;                       // passo fixo da simulação (determinismo)
function act(code, external) {
  if (!G || G.overDone || G.over) return false;
  if (!external) {
    if (state !== 'PLAY') return false;
    if (code !== A.SOFT_OFF) G.actions++;
    if (G.rec) G.rec.push(G.tick, code);
  }
  switch (code) {
    case A.LEFT: move(-1); break;
    case A.RIGHT: move(1); break;
    case A.CW: rotate(1); break;
    case A.CCW: rotate(-1); break;
    case A.HARD: hardDrop(); break;
    case A.HOLD: hold(); break;
    case A.SOFT_ON: G.soft = true; break;
    case A.SOFT_OFF: G.soft = false; break;
    default: return false;
  }
  return true;
}
