'use strict';
// Ajudantes de rede compartilhados pelos testes (gerado a partir de net.test.js: par de aparelhos falsos, latência, jitter, quedas).
// Modo online em rede local (lockstep). Dois aparelhos simulados com uma "rede" falsa em memória.
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

const NetOf = (h) => h.get('Net');
const V = (h) => h.get('Versus');

/** Cria o par anfitrião/cliente já conectado (aperto de mão feito) com latência/jitter configuráveis (em quadros). */
function pair({ lat = 0, jitter = 0, seed = 1, names = ['Ana', 'Beto'], fps = [1, 1] } = {}) {   // fps: a cada quantos passos de 1/60 s cada aparelho desenha um quadro (2 = 30 fps)
  const A = load(11), B = load(22); let step = 0, x = seed >>> 0;
  const rnd = () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0);
  const q = { ab: [], ba: [] }, sent = { a: [], b: [] }, T = {};
  const mk = (dir, log) => ({ closed: false, hosted: null, joined: null, available: () => true, host(n, p) { if (!this.down) this.closed = false; this.hosted = [n, p]; }, listen(p) { if (!this.down) this.closed = false; this.listened = (this.listened || 0) + 1; }, scan() {}, join(ip, p) { if (!this.down) this.closed = false; this.joined = [ip, p]; this.joins = (this.joins || 0) + 1; }, close() { this.closed = true; },
    send(line) { log.push(line); if (this.closed) return; const due = step + lat + (jitter ? rnd() % (jitter + 1) : 0), arr = q[dir], last = arr.length ? arr[arr.length - 1][0] : 0; arr.push([Math.max(due, last), line]); } });
  T.a = mk('ab', sent.a); T.b = mk('ba', sent.b);
  const clock = () => step * 1000 / 60;                                    // relógio da simulação (1 quadro = 16,67 ms)
  A.sb.__now = clock; B.sb.__now = clock; A.run('Net.now = __now'); B.run('Net.now = __now');
  A.sb.__T = T.a; B.sb.__T = T.b; A.run('Net.T = __T'); B.run('Net.T = __T');
  A.run(`Profile.state.list[0].name = ${JSON.stringify(names[0])}`); B.run(`Profile.state.list[0].name = ${JSON.stringify(names[1])}`);
  NetOf(A).host(); NetOf(A)._ev({ e: 'hosting', ip: '192.168.0.5' });
  NetOf(B).join('192.168.0.5', 47600);
  NetOf(A)._ev({ e: 'connected', peer: '192.168.0.6' }); NetOf(B)._ev({ e: 'connected', peer: '192.168.0.5' });
  const P = {
    A, B, T, q, sent, step: () => step,
    hold: false,
    deliver() { if (P.hold) return; for (const [dir, to, k] of [['ab', B, 1], ['ba', A, 0]]) { if (P.frozen && P.frozen[k]) continue; const arr = q[dir]; while (arr.length && arr[0][0] <= step) NetOf(to)._line(arr.shift()[1]); } },
    tick(n = 1, inputs) {
      for (let i = 0; i < n; i++) {
        step++; P.deliver();
        if (step % 30 === 0) [A, B].forEach((h, k) => { if (!(P.frozen && P.frozen[k])) NetOf(h).heartbeat(); });     // timer de 0,5 s (app em segundo plano = tudo parado)
        if (inputs) inputs(P);
        [A, B].forEach((h, k) => { if (h.state() === 'VERSUS' && step % fps[k] === 0 && !(P.frozen && P.frozen[k])) V(h).frame(fps[k] / 60); });
      }
    },
  };
  for (let i = 0; i < 300 && !(NetOf(A).st === 'lobby' && NetOf(B).st === 'lobby'); i++) P.tick(1);
  return P;
}
function startMatch(P) {
  assert.equal(NetOf(P.A).st, 'lobby'); assert.equal(NetOf(P.B).st, 'lobby');
  assert.equal(NetOf(P.A).startMatch(), true);
  for (let i = 0; i < 300 && !(NetOf(P.A).st === 'playing' && NetOf(P.B).st === 'playing' && V(P.B).net); i++) P.tick(1);
  P.A.setState('VERSUS'); P.B.setState('VERSUS');                 // pula a contagem 3-2-1 (setTimeout é simulado)
  return P;
}
const lcg = (s) => { let x = s >>> 0; return () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0); };
function randomInputs(seed) { const r = lcg(seed); return (P) => { for (const h of [P.A, P.B]) { if (h.state() !== 'VERSUS') continue; if (r() % 4 === 0) V(h).input(V(h).me(), (r() >>> 20) % 8); } }; }
const boards = (h) => JSON.stringify(plain(V(h).B.map((g) => [g.grid, Math.round(g.score), g.lines, g.tick, g.active && g.active.t])));


function drop(P, why = 'Conexão perdida') {
  P.q.ab.length = 0; P.q.ba.length = 0; P.T.a.down = P.T.b.down = true; P.T.a.closed = P.T.b.closed = true;
  NetOf(P.A)._ev({ e: 'closed', why }); NetOf(P.B)._ev({ e: 'closed', why });
}

function relink(P) {
  P.T.a.down = P.T.b.down = false; P.T.a.closed = P.T.b.closed = false;
  NetOf(P.A)._ev({ e: 'connected', peer: '192.168.0.6' }); NetOf(P.B)._ev({ e: 'connected', peer: '192.168.0.5' });
}

module.exports = { pair, startMatch, NetOf, V, lcg, randomInputs, boards, drop, relink, plain };
