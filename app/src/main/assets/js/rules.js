'use strict';
/* Regras por modalidade + gerador pseudoaleatório com semente (determinístico: base de replays, desafio diário e Versus). */
function mkRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Regras efetivas de uma partida. `o.rules` sobrepõe (desafio diário/personalizado). */
function rulesFor(mode, o) {
  o = o || {};
  const r = { timeLimit: null, goal: null, levelUps: true, fixedLevel: null, topout: 'over', noHold: false, noGhost: false,
    skills: mode === 3, noGravity: false, recordOnExit: false, tutorial: false };
  if (mode === 2) r.timeLimit = 120;                                   // "2 MINUTES" é o modo Ultra (contagem regressiva, maior pontuação)
  if (mode === 4) { r.levelUps = false; r.topout = 'reset'; r.fixedLevel = o.zenLevel || 1; r.recordOnExit = true; }
  if (mode === 5) { r.goal = { type: 'lines', target: 40 }; r.levelUps = false; r.fixedLevel = o.sprintLevel || 1; }
  if (mode === 9) { r.levelUps = false; r.topout = 'reset'; r.noGravity = true; r.tutorial = true; r.fixedLevel = 1; }
  if (o.rules && typeof o.rules === 'object') Object.assign(r, o.rules);
  return r;
}
