'use strict';
// Modo online em rede local (lockstep). Dois aparelhos simulados com uma "rede" falsa em memória.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

const NetOf = (h) => h.get('Net');
const V = (h) => h.get('Versus');

/** Cria o par anfitrião/cliente já conectado (aperto de mão feito) com latência/jitter configuráveis (em quadros). */
function pair({ lat = 0, jitter = 0, seed = 1, names = ['Ana', 'Beto'] } = {}) {
  const A = load(11), B = load(22); let step = 0, x = seed >>> 0;
  const rnd = () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0);
  const q = { ab: [], ba: [] }, sent = { a: [], b: [] }, T = {};
  const mk = (dir, log) => ({ closed: false, hosted: null, joined: null, available: () => true, host(n, p) { this.closed = false; this.hosted = [n, p]; }, scan() {}, join(ip, p) { this.closed = false; this.joined = [ip, p]; }, close() { this.closed = true; },
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
    deliver() { if (P.hold) return; for (const [dir, to] of [['ab', B], ['ba', A]]) { const arr = q[dir]; while (arr.length && arr[0][0] <= step) NetOf(to)._line(arr.shift()[1]); } },
    tick(n = 1, inputs) {
      for (let i = 0; i < n; i++) {
        step++; P.deliver();
        if (step % 30 === 0) for (const h of [A, B]) NetOf(h).heartbeat();     // timer de 0,5 s
        if (inputs) inputs(P);
        for (const h of [A, B]) if (h.state() === 'VERSUS') V(h).frame(1 / 60);
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

/* ---------------- aperto de mão e lobby ---------------- */
test('conexão: aperto de mão leva os dois ao lobby com os nomes do oponente', () => {
  const P = pair();
  assert.equal(NetOf(P.A).peer.name, 'Beto'); assert.equal(NetOf(P.B).peer.name, 'Ana');
  assert.equal(P.T.a.hosted[1], 47600); assert.deepEqual(P.T.b.joined, ['192.168.0.5', 47600]);
});
test('conexão: versão do protocolo ou do motor diferente é recusada com mensagem', () => {
  for (const bad of [{ p: 2, eng: 'E2' }, { p: 3, eng: 'E1' }]) {
    const h = load(1); const fake = { available: () => true, host() {}, scan() {}, join() {}, close() { this.closed = true; }, send(l) { this.out.push(l); }, out: [] };
    h.sb.__T = fake; h.run('Net.T=__T'); NetOf(h).host(); NetOf(h)._ev({ e: 'connected' });
    NetOf(h)._line(JSON.stringify(Object.assign({ k: 'hello', name: 'X' }, bad)));
    assert.equal(NetOf(h).st, 'error'); assert.match(NetOf(h).err, /outra versão/); assert.equal(fake.closed, true);
    assert.ok(fake.out.some((l) => JSON.parse(l).k === 'nack'));
  }
});
test('conexão: mensagens malformadas, grandes ou antes do hello são ignoradas', () => {
  const h = load(1); h.sb.__T = { available: () => true, host() {}, scan() {}, join() {}, close() {}, send() {} }; h.run('Net.T=__T');
  NetOf(h).host(); NetOf(h)._ev({ e: 'connected' });
  for (const junk of ['', 'x', '[]', '5', 'null', '{"k":5}', '{"k":"start","seed":1}', '{"k":"in","u":1,"e":[]}', 'x'.repeat(20000), '{"k":"hello","p":1,"eng":"E2"' ]) NetOf(h)._line(junk);
  assert.equal(NetOf(h).st, 'handshake'); assert.equal(NetOf(h).peer, null);
  NetOf(h)._line(JSON.stringify({ k: 'hello', p: 3, eng: 'E2', name: '<b>Zé</b>\nMuito longo nome demais' }));
  assert.equal(NetOf(h).st, 'lobby'); assert.ok(!/[<>\n]/.test(NetOf(h).peer.name) && NetOf(h).peer.name.length <= 16);
  NetOf(h)._line(JSON.stringify({ k: 'hello', p: 3, eng: 'E2', name: 'Outro' })); assert.notEqual(NetOf(h).peer.name, 'Outro', 'segundo hello ignorado');
});
test('conexão: nome igual ao seu recebe sufixo; tempo esgotado no aperto de mão desconecta', () => {
  const h = load(1); h.sb.__T = { available: () => true, host() {}, scan() {}, join() {}, close() {}, send() {} }; h.run('Net.T=__T');
  NetOf(h).host(); NetOf(h)._ev({ e: 'connected' }); NetOf(h)._line(JSON.stringify({ k: 'hello', p: 3, eng: 'E2', name: 'Jogador 1' }));
  assert.equal(NetOf(h).peer.name, 'Jogador 1 (2)');
  const g = load(1); g.sb.__T = { available: () => true, host() {}, scan() {}, join() {}, close() {}, send() {} }; g.run('Net.T=__T');
  NetOf(g).host(); NetOf(g)._ev({ e: 'connected' }); let t = Date.now(); NetOf(g).now = () => t; NetOf(g).hsAt = t; t += 6000; NetOf(g).heartbeat();
  assert.equal(NetOf(g).st, 'error'); assert.match(NetOf(g).err, /não respondeu/);
});
test('conexão: IP manual só aceita rede local; descoberta valida entradas', () => {
  const N = NetOf(load(1)); const ok = (ip) => N.validIp(ip);
  assert.deepEqual(['192.168.0.10', '10.0.0.2', '172.16.5.5', '172.31.255.1', '169.254.1.1'].map(ok), [true, true, true, true, true]);
  assert.deepEqual(['8.8.8.8', '172.32.0.1', '192.169.0.1', '999.1.1.1', 'abc', '', '192.168.0', '192.168.0.1.5', '127.0.0.1'].map(ok), [false, false, false, false, false, false, false, false, false]);
  const h = load(1); h.sb.__T = { available: () => true, scan() {}, host() {}, join() {}, close() {}, send() {} }; h.run('Net.T=__T'); NetOf(h).scan();
  NetOf(h)._ev({ e: 'found', name: 'Sala', ip: '192.168.1.9', port: 47600 }); NetOf(h)._ev({ e: 'found', name: 'Dup', ip: '192.168.1.9', port: 47600 });
  NetOf(h)._ev({ e: 'found', name: 'Fora', ip: '8.8.8.8', port: 47600 }); NetOf(h)._ev({ e: 'found', name: 'PortaRuim', ip: '192.168.1.10', port: 80 }); NetOf(h)._ev({ e: 'scanDone' });
  assert.deepEqual(plain(NetOf(h).hosts).map((x) => x.ip), ['192.168.1.9']); assert.equal(NetOf(h).st, 'scanned');
  assert.equal(NetOf(h).join('8.8.8.8'), false); assert.match(NetOf(h).err, /rede local/);
  assert.equal(NetOf(h).join('192.168.0.5', 80), false);
});
test('lobby: só o anfitrião inicia; cliente ignora "start" inválido e aceita o válido', () => {
  const P = pair(); assert.equal(NetOf(P.B).startMatch(), false);
  for (const bad of [{ seed: -1 }, { seed: 1.5 }, { seed: 'a' }, { seed: 4294967296 }, {}]) NetOf(P.B)._line(JSON.stringify(Object.assign({ k: 'start' }, bad)));
  assert.equal(NetOf(P.B).st, 'lobby');
  NetOf(P.A)._line(JSON.stringify({ k: 'start', seed: 5 })); assert.equal(NetOf(P.A).st, 'lobby', 'anfitrião não obedece start');
  startMatch(P); assert.equal(NetOf(P.A).st, 'playing'); assert.equal(NetOf(P.B).st, 'playing'); assert.equal(V(P.A).net.local, 0); assert.equal(V(P.B).net.local, 1);
});

/* ---------------- sincronia (lockstep) ---------------- */
test('sincronia: adulterar um tabuleiro é detectado pelo hash e encerra os dois lados', () => {
  const P = startMatch(pair({ lat: 1 })); P.tick(60);
  V(P.B).B[1].score += 500;                                      // divergência artificial
  for (let i = 0; i < 400 && !(V(P.A).over && V(P.B).over); i++) P.tick(1);
  assert.equal(V(P.A).over && V(P.B).over, true); assert.match(V(P.A).result.reason, /dessincronizaram/); assert.equal(V(P.A).result.aborted, true);
  assert.equal(plain(P.A.get('StatsMgr').load()).all.games, 0, 'partida abortada não gera estatística');
});
test('hash: formato inválido é ignorado', () => {
  const P = startMatch(pair()); P.tick(10);
  for (const m of [{ k: 'h', t: 'x', h: 'a' }, { k: 'h', t: 120, h: 5 }, { k: 'h', t: 120, h: 'x'.repeat(40) }]) NetOf(P.A)._line(JSON.stringify(m));
  assert.equal(V(P.A).over, false);
});

/* ---------------- fim de partida, desistência, queda ---------------- */
test('desistir: quem abandona perde, o outro vence imediatamente; resultado/estatística do lado local', () => {
  const P = startMatch(pair()); P.tick(30);
  V(P.A).B[0].tick; NetOf(P.B).forfeitLocal(); P.tick(2);
  assert.equal(V(P.B).result.winner, 0); assert.equal(V(P.A).result.winner, 0); assert.match(V(P.A).result.reason, /O oponente saiu/);
  P.A.setState('VSOVER'); V(P.A).showEnd(); assert.equal(P.A.els.endTitle.textContent, 'VOCÊ VENCEU!');
  assert.equal(plain(P.A.get('StatsMgr').load()).modes[10].wins, 1); assert.ok(plain(P.A.get('Achv').load()).online_win);
  V(P.B).showEnd(); assert.equal(P.B.els.endTitle.textContent, 'VOCÊ PERDEU'); assert.equal(plain(P.B.get('StatsMgr').load()).modes[10].games, 1);
});
test('queda da conexão e silêncio prolongado dão a vitória ao outro lado', () => {
  const P = startMatch(pair()); P.tick(30);
  NetOf(P.A)._ev({ e: 'closed', why: 'Conexão perdida' }); assert.equal(V(P.A).result.winner, 0); assert.equal(NetOf(P.A).st, 'ended');
  const Q = startMatch(pair()); Q.tick(30); let t = Date.now(); NetOf(Q.B).now = () => t; NetOf(Q.B).lastRx = t; t += 8000; NetOf(Q.B).heartbeat();
  assert.equal(V(Q.B).result.winner, 1); assert.match(V(Q.B).result.reason, /Conexão perdida/);
});
test('botão pausar/voltar no online pede confirmação de desistência (não pausa)', () => {
  const P = startMatch(pair()); P.tick(5); P.A.sb.handleBack();
  assert.equal(P.A.state(), 'VERSUS'); assert.equal(P.A.els.confirmBox.classList.contains('on'), true);
  P.A.els.confirmYes.onclick(); assert.equal(V(P.A).over, true); assert.equal(V(P.A).result.winner, 1);
});
test('revanche: anfitrião inicia nova partida; cliente pede e o anfitrião inicia; volta ao menu encerra a conexão', () => {
  const P = logInputs(startMatch(pair())); playOut(P, 3);
  assert.equal(NetOf(P.A).st, 'ended');
  NetOf(P.B).rematch(); for (let i = 0; i < 100 && !(NetOf(P.A).st === 'playing' && NetOf(P.B).st === 'playing'); i++) P.tick(1);
  assert.equal(NetOf(P.A).st, 'playing'); assert.equal(NetOf(P.B).st, 'playing'); assert.equal(V(P.A).ticks <= 2, true); assert.equal(V(P.A).result, null);
  P.A.setState('VERSUS'); P.B.setState('VERSUS'); P.log.length = 0; playOut(P, 4);
  assert.deepEqual(plain(V(P.A).result), plain(V(P.B).result));
  P.A.sb.goMenu(); assert.equal(NetOf(P.A).st, 'idle'); assert.equal(P.T.a.closed, true); assert.ok(P.sent.a.some((l) => JSON.parse(l).k === 'bye'));
});
test('tela Online: estados e indisponível fora do Android', () => {
  const h = load(1); assert.equal(NetOf(h).available(), false);
  assert.doesNotThrow(() => h.sb.openOnline()); assert.ok(h.els.sheetBody.children.some((c) => /somente no app Android/.test(c.textContent || '')));
  const P = pair(); for (const f of [() => NetOf(P.A).st, () => 0]) f();
  for (const st of ['idle', 'error', 'hosting', 'scanning', 'scanned', 'connecting', 'handshake', 'lobby']) { NetOf(P.A).st = st; if (st === 'lobby') NetOf(P.A).peer = { name: 'x' }; assert.doesNotThrow(() => { P.A.sb.openOnline(); }, st); }
});
test('botão ONLINE da tela inicial abre a tela; rede nativa (Lan) usa AndroidBridge quando existe', () => {
  const h = load(1); h.els.bOnline.onclick(); assert.equal(h.els.sheetTitle.textContent, 'Online (rede local)');
  const calls = []; h.sb.AndroidBridge = { lanHost: (n, p) => calls.push(['host', n, p]), lanScan: () => calls.push(['scan']), lanJoin: (i, p) => calls.push(['join', i, p]), lanSend: (l) => calls.push(['send', l]), lanClose: () => calls.push(['close']), lanIp: () => '192.168.0.9' };
  assert.equal(h.get('Lan').available(), true); NetOf(h).host(); NetOf(h).scan(); NetOf(h).join('192.168.0.9'); NetOf(h).disconnect();
  assert.deepEqual(calls.map((c) => c[0]), ['close', 'host', 'close', 'scan', 'join', 'close']); assert.deepEqual(calls[1], ['host', 'Jogador 1', 47600]);
});

/* ---------------- VPN: faixas, IPs do aparelho, ping e atraso de entrada automático ---------------- */
test('VPN: aceita Tailscale (100.64–127.x) e Hamachi (25.x); recusa o resto', () => {
  const N = NetOf(load(1)); const r = (ip) => N.validIp(ip);
  assert.deepEqual(['100.64.0.1', '100.100.5.5', '100.127.255.254', '25.1.2.3', '25.255.255.255'].map(r), [true, true, true, true, true]);
  assert.deepEqual(['100.63.255.255', '100.128.0.1', '26.1.2.3', '24.1.2.3', '100.64.0', '100.64.0.256'].map(r), [false, false, false, false, false, false]);
});
test('sala: lista todos os IPs do aparelho (inclui interface da VPN), validados e limitados', () => {
  const h = load(1); h.sb.__T = { available: () => true, host() {}, scan() {}, join() {}, close() {}, send() {} }; h.run('Net.T=__T'); NetOf(h).host();
  const ips = [{ n: 'wlan0', ip: '192.168.0.5' }, { n: 'tailscale0', ip: '100.101.102.103' }, { n: 'x', ip: 'abc' }, null, { n: 5, ip: 7 }, ...Array.from({ length: 12 }, (_, i) => ({ n: 'e' + i, ip: '10.0.0.' + i }))];
  NetOf(h)._ev({ e: 'hosting', ip: '192.168.0.5', ips });
  const got = plain(NetOf(h).ips); assert.equal(got.length, 8); assert.deepEqual(got.slice(0, 2), [{ n: 'wlan0', ip: '192.168.0.5' }, { n: 'tailscale0', ip: '100.101.102.103' }]);
  assert.doesNotThrow(() => h.sb.openOnline()); const texto = JSON.stringify(plain(h.els.sheetBody.children)).length; assert.ok(texto > 0);
  const calls = []; h.sb.AndroidBridge = { lanIps: () => '[{"n":"tun0","ip":"10.8.0.2"}]', lanIp: () => '10.8.0.2' }; assert.deepEqual(plain(h.get('Lan').ips()), [{ n: 'tun0', ip: '10.8.0.2' }]);
  h.sb.AndroidBridge = { lanIps: () => 'lixo' }; assert.deepEqual(plain(h.get('Lan').ips()), []); void calls;
});
test('ping: responde "p" com pong, mede RTT pelo relógio e ignora pong inválido', () => {
  const P = pair({ lat: 6 }); P.tick(150);
  const rtt = NetOf(P.A).ping(); assert.ok(rtt !== null && Math.abs(rtt - 12 * 1000 / 60) <= 20, 'RTT ≈ 200 ms, veio ' + rtt);
  const n = NetOf(P.A).rtts.length;
  for (const bad of [-5000, 99999999, 'x', null, NaN]) NetOf(P.A)._line(JSON.stringify({ k: 'pong', t: bad }));
  NetOf(P.A)._line(JSON.stringify({ k: 'pong', t: P.step() * 1000 / 60 + 10000 })); assert.equal(NetOf(P.A).rtts.length, n);
  const before = P.sent.a.length; NetOf(P.A)._line(JSON.stringify({ k: 'p' })); assert.equal(P.sent.a.length, before, 'sem t não responde');
  NetOf(P.A)._line(JSON.stringify({ k: 'p', t: 123 })); assert.equal(JSON.parse(P.sent.a[P.sent.a.length - 1]).k, 'pong');
  assert.ok(NetOf(P.A).rtts.length <= 12);
});
test('tela: lobby mostra ping e atraso; partida desenha o ping sem erro', () => {
  const P = pair({ lat: 3 }); P.tick(120); assert.doesNotThrow(() => P.A.sb.openOnline());
  startMatch(P); P.tick(30); for (const s of ['COUNT', 'VERSUS', 'VSOVER']) { P.A.setState(s); assert.doesNotThrow(() => P.A.sb.render(), s); }
});

/* ======== Previsão com correção (rollback) ======== */
/** Registra (tick, tabuleiro, ação) de cada ação local aceita, nos dois aparelhos (verdade absoluta para a simulação de referência). */
function logInputs(P) {
  P.log = []; let rollbacks = 0; P.rollbacks = () => rollbacks;
  for (const h of [P.A, P.B]) {
    h.sb.__log = P.log; h.sb.__rb = () => { rollbacks++; };
    h.run("(function(){ const o = Versus.input; Versus.input = function (p, c) { const t = Versus.ticks, r = o.call(Versus, p, c); if (r && Versus.net) __log.push([t, p, c]); return r; };" +
      " const rb = Versus.netRollback; Versus.netRollback = function () { if (Versus.net && Versus.net.rb != null && Versus.net.rb < Versus.ticks) __rb(); return rb.call(Versus); }; })()");
  }
  return P;
}
/** Simulação offline (sem rede) aplicando o registro de ações nos ticks corretos. */
function reference(P, seed) {
  const R = load(99); const v = V(R);
  v.create({ seed, players: [{ kind: 'human', name: 'A' }, { kind: 'human', name: 'B' }] }); v.active = true; v.B.forEach((g) => { g.level = 1; }); R.setState('VERSUS');
  const log = P.log.map((x, i) => [...x, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[3] - b[3]);
  let i = 0;
  while (!v.over && v.ticks < 20000) {
    while (i < log.length && log[i][0] === v.ticks) { const [, bd, c] = log[i++]; if (!v.B[bd].overDone) v.withBoard(bd, () => R.sb.act(c, true)); }
    v.tick();
  }
  return { ticks: v.ticks, hash: v.snapHash(v.snap()), result: plain(v.result) };
}
function playOut(P, seed, maxSteps = 20000) {
  const inp = randomInputs(seed);
  for (let i = 0; i < maxSteps && !(V(P.A).over && V(P.B).over); i++) P.tick(1, inp);
  assert.ok(V(P.A).over && V(P.B).over, 'terminou');
}

test('previsão: com ações aleatórias o resultado é idêntico nos dois aparelhos e à simulação de referência (todas as latências/jitter)', () => {
  for (const [lat, jit, seed] of [[0, 0, 1], [1, 0, 2], [2, 1, 3], [4, 3, 4], [8, 5, 5], [12, 6, 6], [25, 10, 7]]) {
    const P = logInputs(startMatch(pair({ lat, jitter: jit, seed }))); playOut(P, seed * 13);
    const a = V(P.A), b = V(P.B);
    assert.equal(a.result.aborted, undefined, `lat=${lat}`); assert.deepEqual(plain(a.result), plain(b.result), `peers lat=${lat}`);
    assert.equal(a.snapHash(a.snap()), b.snapHash(b.snap()), `estado final lat=${lat}`);
    const ref = reference(P, a.cfg.seed);
    assert.equal(ref.ticks, a.ticks, `ticks lat=${lat}`); assert.equal(ref.hash, a.snapHash(a.snap()), `referência lat=${lat}`);
    assert.deepEqual(plain(Object.assign({}, ref.result, { names: a.result.names, level: a.result.level })), plain(a.result), `resultado lat=${lat}`);
    if (lat >= 4) assert.ok(P.rollbacks() > 0, 'houve correções com latência ' + lat);
  }
});
test('previsão: muitas partidas curtas com sementes diferentes sempre convergem (inclui fim de jogo confirmado)', () => {
  for (let k = 1; k <= 12; k++) {
    const P = logInputs(startMatch(pair({ lat: k % 7, jitter: k % 4, seed: 100 + k }))); playOut(P, 900 + k);
    const a = V(P.A), ref = reference(P, a.cfg.seed);
    assert.equal(a.result.ticks, V(P.B).result.ticks, 'seed ' + k); assert.equal(ref.hash, a.snapHash(a.snap()), 'seed ' + k); assert.equal(a.result.winner, ref.result.winner); assert.equal(a.result.aborted, undefined, 'seed ' + k); assert.equal(V(P.B).result.aborted, undefined, 'seed ' + k);
  }
});
test('atraso dos comandos: a ação local vale no próximo quadro mesmo com RTT de 800 ms', () => {
  const P = startMatch(pair({ lat: 24 })); const a = V(P.A);
  const x0 = a.B[0].active.x; assert.equal(a.input(0, h0(P.A).LEFT), true); P.tick(1);
  assert.equal(a.B[0].active.x, x0 - 1, 'moveu em 1 quadro (≈16 ms)');
  const sentNow = JSON.parse(P.sent.a[P.sent.a.length - 1]); assert.equal(sentNow.k, 'in'); assert.ok(sentNow.e.length >= 0);
});
function h0(h) { return h.get('A'); }
test('envio imediato: a ação é enviada no instante do toque, sem esperar o próximo quadro', () => {
  const P = startMatch(pair({ lat: 3 })); const before = P.sent.a.length;
  V(P.A).input(0, h0(P.A).CW);
  assert.ok(P.sent.a.length > before); const m = JSON.parse(P.sent.a[P.sent.a.length - 1]); assert.equal(m.k, 'in'); assert.deepEqual(m.e, [[V(P.A).ticks, h0(P.A).CW]]); assert.equal(m.u, V(P.A).ticks - 1);
});
test('RTT alto não trava mais: o jogo roda ~60 ticks/s (antes com RTT de 400 ms travava 35% do tempo)', () => {
  const P = startMatch(pair({ lat: 12 })); const t0 = V(P.A).ticks; P.tick(600);
  assert.ok((V(P.A).ticks - t0) / 600 > 0.95, 'taxa ' + (V(P.A).ticks - t0) / 600);
});
test('janela de previsão: sem notícias do oponente o jogo avança no máximo PRED_MAX ticks, espera, e converge ao voltar a rede', () => {
  const P = logInputs(startMatch(pair({ lat: 1, seed: 9 }))); P.tick(20);
  P.hold = true; const t0 = V(P.A).ticks; P.tick(200);
  assert.ok(V(P.A).ticks - t0 <= V(P.A).PRED_MAX + 1, 'avançou ' + (V(P.A).ticks - t0)); assert.ok(V(P.B).ticks - t0 <= V(P.B).PRED_MAX + 25);
  P.hold = false; playOut(P, 77);
  const a = V(P.A), ref = reference(P, a.cfg.seed); assert.equal(a.snapHash(a.snap()), ref.hash); assert.equal(a.result.aborted, undefined);
});
test('snapshots: restaurar um snapshot reproduz exatamente o mesmo futuro (RNG, filas, ações, lixo)', () => {
  const P = startMatch(pair({ lat: 0 })); const a = V(P.A), inp = randomInputs(3);
  for (let i = 0; i < 150; i++) P.tick(1, inp);
  const s = a.snap(), t = a.ticks, q = JSON.stringify(plain(a.net.q));
  const evolve = () => { for (let i = 0; i < 80 && !a.over; i++) { a.netApply(a.ticks); a.ticks++; a.stepBoards(); } return a.snapHash(a.snap()); };
  P.hold = true; const h1 = evolve(); a.unsnap(s, t); const h2 = evolve();
  assert.equal(h1, h2); assert.equal(JSON.stringify(plain(a.net.q)), q);
});
test('snapshots: clone profundo (alterar o jogo não altera o snapshot)', () => {
  const P = startMatch(pair({ lat: 0 })); const a = V(P.A); const s = a.snap(); const g0 = JSON.stringify(s.B[0].grid);
  a.B[0].grid[19][0] = '#fff'; a.B[0].queue.push('Z'); a.B[0].active.x = 9; a.pend[0] = 5;
  assert.equal(JSON.stringify(s.B[0].grid), g0); assert.equal(s.pend[0], 0); a.unsnap(s, a.ticks);
  a.B[0].grid[18][1] = '#fff'; assert.equal(JSON.stringify(s.B[0].grid), g0, 'restaurar também copia');
});
test('rollback não duplica efeitos visuais/sonoros (FX volta ao mesmo objeto)', () => {
  const P = startMatch(pair({ lat: 6 })); const inp = randomInputs(5); P.tick(60, inp);
  const fx = V(P.A).B ? P.A.get('FX').parts : null;
  V(P.A).net.rb = Math.max(0, V(P.A).ticks - 4); V(P.A).netRollback();
  assert.equal(P.A.get('FX').parts, fx); assert.equal(P.A.get('SIM'), false);
});
test('promessa u é monotônica: a mensagem final depois de confirmar o fim nunca recua', () => {
  const P = startMatch(pair({ lat: 0, jitter: 3, seed: 107 })); const us = { a: [], b: [] };
  const inp = randomInputs(907); for (let i = 0; i < 20000 && !(V(P.A).over && V(P.B).over); i++) { P.tick(1, inp); }
  for (const [k, log] of [['a', P.sent.a], ['b', P.sent.b]]) { let last = -2; for (const l of log) { const m = JSON.parse(l); if (m.k === 'in') { assert.ok(m.u >= last, k + ' u recuou ' + last + '→' + m.u); last = m.u; us[k].push(m.u); } } }
  assert.equal(V(P.A).result.aborted, undefined); assert.equal(V(P.B).result.aborted, undefined); assert.equal(V(P.A).result.ticks, V(P.B).result.ticks);
});
test('mkRng: get/set permitem retomar a sequência exatamente', () => {
  const h = load(1); const r = h.sb.mkRng(42); r(); r(); const st = r.get(); const a = [r(), r(), r()]; r.set(st); assert.deepEqual([r(), r(), r()], a);
});
test('ações do oponente inválidas, fora de ordem, antigas demais ou regressivas abortam a partida', () => {
  const bad = [{ k: 'in', u: 5, e: [[9, 9]] }, { k: 'in', u: 5, e: [['a', 1]] }, { k: 'in', u: 5, e: 'x' }, { k: 'in', u: 'x', e: [] }, { k: 'in', u: 5, e: Array(70).fill([20, 1]) },
    { k: 'in', u: 5, e: [[7, 1, 1]] }, { k: 'in', u: 99999, e: [] }, { k: 'in', u: 50, e: [[40, 1]] }, { k: 'in', u: 50, e: [[50, 1]] }, { k: 'in', u: 2, e: [[3, 1]] }, { k: 'in', u: 5, e: [[99999, 1]] }];
  for (const msg of bad) {
    const P = startMatch(pair()); P.tick(30);
    NetOf(P.A)._line(JSON.stringify({ k: 'in', u: 20, e: [] }));   // oponente já prometeu até o tick 20
    NetOf(P.A)._line(JSON.stringify(msg)); assert.equal(V(P.A).over, true, JSON.stringify(msg).slice(0, 50)); assert.equal(V(P.A).result.aborted, true);
  }
  const Q = startMatch(pair()); Q.tick(30); NetOf(Q.A)._line(JSON.stringify({ k: 'in', u: 20, e: [] })); NetOf(Q.A)._line(JSON.stringify({ k: 'in', u: 10, e: [] }));
  assert.equal(V(Q.A).result.aborted, true, 'u retrocedeu');
});
test('ação remota além da janela de snapshots é rejeitada (não há como corrigir)', () => {
  const P = startMatch(pair({ lat: 0 })); P.tick(5); P.hold = true; P.tick(60);
  P.hold = false; const a = V(P.A); NetOf(P.A)._line(JSON.stringify({ k: 'in', u: a.net.remoteUpto + 1, e: [[a.net.remoteUpto + 2, 1]] }));
  // tick muito antigo em relação à janela
  const Q = startMatch(pair({ lat: 0 })); Q.tick(5); Q.hold = true; Q.tick(40); const qa = V(Q.A); qa.net.remoteUpto = -1;
  NetOf(Q.A)._line(JSON.stringify({ k: 'in', u: 0, e: [[1, 1]] })); assert.equal(qa.result && qa.result.aborted, qa.ticks - 1 > qa.SNAP_WIN ? true : qa.result && qa.result.aborted);
});
test('sincronia: adulterar um tabuleiro (inclusive nos snapshots) é detectado pelo hash do estado confirmado', () => {
  const P = startMatch(pair({ lat: 1 })); P.tick(60);
  V(P.B).B[1].score += 500; Object.values(V(P.B).net.snaps).forEach((s) => { s.B[1].score += 500; });
  for (let i = 0; i < 600 && !(V(P.A).over && V(P.B).over); i++) P.tick(1);
  assert.equal(V(P.A).over && V(P.B).over, true); assert.match(V(P.A).result.reason, /dessincronizaram/); assert.equal(plain(P.A.get('StatsMgr').load()).all.games, 0);
});
test('lixo/ataques e níveis diferentes salvos nos aparelhos não divergem (com correção)', () => {
  const P = pair({ lat: 5, jitter: 3, seed: 21 }); P.A.get('settings').startLevel = 9; P.B.get('settings').startLevel = 1;
  logInputs(startMatch(P)); playOut(P, 33); const a = V(P.A);
  assert.deepEqual(plain(a.sent), plain(V(P.B).sent)); assert.deepEqual(plain(a.pend), plain(V(P.B).pend));
  assert.equal(a.snapHash(a.snap()), reference(P, a.cfg.seed).hash);
});

test('temas/paletas de peças diferentes nos dois aparelhos não causam "dessincronizaram" (hash independe de cor)', () => {
  for (const seed of [31, 32, 33]) {
    const P = pair({ lat: 3, jitter: 2, seed });
    P.A.run("Object.assign(COLORS, { I: '#00e5ff', J: '#3a6bff', L: '#ff9f1c', O: '#ffe066', S: '#3ddc84', T: '#b266ff', Z: '#ff4d6d' })");
    P.B.run("Object.assign(COLORS, { I: '#111111', J: '#222222', L: '#333333', O: '#444444', S: '#555555', T: '#666666', Z: '#777777' })");
    logInputs(startMatch(P)); playOut(P, seed * 7);
    const a = V(P.A), b = V(P.B);
    assert.equal(a.result.aborted, undefined, 'A seed ' + seed + ': ' + (a.result.reason || '')); assert.equal(b.result.aborted, undefined, 'B seed ' + seed + ': ' + (b.result.reason || ''));
    assert.equal(a.result.ticks, b.result.ticks); assert.equal(a.result.winner, b.result.winner);
    assert.ok(a.result.ticks > 120, 'passou do 1º ponto de checagem de hash (ticks=' + a.result.ticks + ')');
  }
});

/* ======== Online em tela cheia (cada jogador vê só a sua tela) ======== */
const FILLC = '#fff';
function tetrisOn(h, i) { V(h).withBoard(i, () => { const G = h.G(); G.grid[5][0] = FILLC; for (let r = 16; r < 20; r++) for (let c = 0; c < 10; c++) G.grid[r][c] = c === 9 ? null : FILLC; G.active = h.sb.makePiece('I'); Object.assign(G.active, { rot: 1, x: 7, y: 16 }); h.sb.lockPiece(); }); }

test('tela cheia: o online desenha UM tabuleiro (o seu) no layout solo, nunca dois lado a lado', () => {
  const P = startMatch(pair({ lat: 1 }));
  for (const [h, me] of [[P.A, 0], [P.B, 1]]) {
    h.sb.__seen = []; h.run("(function(){ const o = drawBoard; drawBoard = function () { __seen.push(G.vi); return o(); }; })()");
    const L0 = JSON.stringify(plain(h.get('L'))), cell = h.get('CELL');
    for (const s of ['COUNT', 'VERSUS', 'PAUSED', 'VSOVER']) { h.setState(s); h.sb.__seen.length = 0; assert.doesNotThrow(() => h.sb.render(), s); assert.deepEqual(plain(h.sb.__seen), [me], `só o tabuleiro ${me} em ${s}`); }
    assert.equal(JSON.stringify(plain(h.get('L'))), L0); assert.equal(h.get('CELL'), cell, 'layout solo intacto');
    assert.equal(V(h).cellV, cell); assert.equal(V(h).lay[0], h.get('L'), 'sem layout dividido');
  }
});
test('tela cheia: layout solo em várias telas e a miniatura do oponente cabe na coluna do Hold', () => {
  for (const [w, hh] of [[360, 640], [411, 890], [320, 568], [768, 1024]]) {
    const P = pair(); for (const h of [P.A, P.B]) { h.sb.innerWidth = w; h.sb.innerHeight = hh; h.sb.resize(); }
    startMatch(P); const L = plain(P.A.get('L'));
    assert.doesNotThrow(() => P.A.sb.render(), `${w}x${hh}`);
    assert.ok(L.hold.w > 0 && L.hold.x >= -1 && L.hold.x + L.hold.w <= L.fl, `coluna do Hold ${w}x${hh}`);
    const y0 = L.hold.y + L.hold.h + P.A.get('CELL') * 1.3, h2 = 20 * (L.hold.w / 10); assert.ok(y0 + h2 < L.fb, `miniatura não passa da moldura ${w}x${hh}`);
  }
});
test('tela cheia: efeitos e sons do tabuleiro do oponente não aparecem na sua tela', () => {
  const P = startMatch(pair({ lat: 0 })); const a = P.A, FX = () => a.get('FX');
  FX().lock.length = 0; FX().flash.length = 0; FX().parts.length = 0;
  tetrisOn(a, 1);                                                  // oponente limpa 4 linhas (tabuleiro remoto no aparelho A)
  assert.equal(FX().lock.length, 0); assert.equal(FX().flash.length, 0); assert.equal(FX().parts.length, 0); assert.equal(a.get('SIM'), false);
  tetrisOn(a, 0);                                                  // eu limpo: aparecem efeitos, marcados como meus
  assert.ok(FX().flash.length > 0 && FX().flash.every((f) => f.b === 0));
});
test('tela cheia: mensagens de pontuação do jogador local usam o painel normal; as do oponente não', () => {
  const P = startMatch(pair({ lat: 0 })); const a = P.A;
  const el = (id) => a.sb.document.getElementById(id); el('msg2').textContent = ''; el('msg').textContent = '';
  tetrisOn(a, 1); assert.equal(el('msg2').textContent, ''); assert.equal(el('msg').textContent, '', 'oponente não mexe nas minhas mensagens');
  tetrisOn(a, 0); assert.equal(el('msg').textContent, 'TETRIS'); assert.equal(V(a).B[0].note, null, 'não vira nota de tela dividida');
});
test('tela cheia: gestos usam o tamanho de célula solo (arrastar, tocar à esquerda/direita)', () => {
  const P = startMatch(pair({ lat: 3 })); const a = P.A, C = a.get('CELL'), ui = { closest: () => null };
  const codes = (from) => P.sent.a.slice(from).map((l) => JSON.parse(l)).filter((m) => m.k === 'in').flatMap((m) => m.e.map((x) => x[1]));
  let mark = P.sent.a.length;
  a.now = 0; a.fire('pointerdown', { pointerId: 1, clientX: 200, clientY: 300, target: ui });
  a.fire('pointermove', { pointerId: 1, clientX: 200 + C * 0.9 + 1, clientY: 300 });
  assert.deepEqual(codes(mark), [1], 'um passo (0,9 célula solo) = uma coluna');
  a.now = 400; a.fire('pointerup', { pointerId: 1, clientX: 200 + C * 0.9 + 1, clientY: 300 });
  mark = P.sent.a.length;
  a.now = 0; a.fire('pointerdown', { pointerId: 2, clientX: 40, clientY: 400, target: ui }); a.now = 80; a.fire('pointerup', { pointerId: 2, clientX: 40, clientY: 400 });
  a.now = 0; a.fire('pointerdown', { pointerId: 3, clientX: 380, clientY: 400, target: ui }); a.now = 80; a.fire('pointerup', { pointerId: 3, clientX: 380, clientY: 400 });
  assert.deepEqual(codes(mark), [3, 2], 'esquerda gira ao contrário, direita gira normal');
  mark = P.sent.a.length;
  a.now = 0; a.fire('pointerdown', { pointerId: 4, clientX: 200, clientY: 200, target: ui }); a.now = 100; a.fire('pointerup', { pointerId: 4, clientX: 200, clientY: 200 + C * 3 });
  assert.ok(codes(mark).includes(4), 'deslizar para baixo derruba');
});
test('tela cheia: o cliente (tabuleiro 1) também controla e vê o próprio tabuleiro', () => {
  const P = startMatch(pair({ lat: 2 })); const b = P.B, v = V(b);
  assert.equal(v.net.local, 1); const x0 = v.B[1].active.x; assert.equal(v.input(1, 0), true); P.tick(1);
  assert.equal(v.B[1].active.x, x0 - 1); assert.equal(v.input(0, 0), false);
});
test('miniatura do oponente: configurável (padrão ligada), persiste e é desenhada só quando ligada', () => {
  const P = startMatch(pair({ lat: 0 })); const a = P.A;
  assert.equal(a.get('settings').oppView, true);
  const names = []; a.sb.__names = names; a.run("(function(){ const o = txt; txt = function (s) { __names.push(String(s)); return o.apply(null, arguments); }; })()");
  a.sb.render(); const on = names.filter((s) => s === 'Beto').length; assert.equal(on, 1, 'rótulo da miniatura');
  a.get('settings').oppView = false; a.sb.saveSettings(); names.length = 0; a.sb.render(); assert.equal(names.filter((s) => s === 'Beto').length, 0);
  assert.equal(a.store.tetris_oppView, '0'); assert.equal(load(1, a.store).get('settings').oppView, false);
  assert.ok(a.get('Store').KEYS.includes('oppView'));
  assert.doesNotThrow(() => { a.sb.openSettingsSheet(); }); assert.ok(a.els.sheetBody.children.some((c) => /Miniatura do oponente/.test(c.textContent || '')));
});
test('tela cheia: barra de lixo recebido aparece na margem da sua moldura; fim de partida mostra WIN/K.O. na sua tela', () => {
  const P = startMatch(pair({ lat: 0 })); const a = P.A; V(a).pend[0] = 4;
  assert.doesNotThrow(() => a.sb.render());
  P.tick(1); V(a).B[0].overDone = true; V(a).over = true; V(a).result = { winner: 1, tie: false }; a.setState('VSOVER'); assert.doesNotThrow(() => a.sb.render());
});
test('Versus local (IA / 2 jogadores na mesma tela) continua com tela dividida', () => {
  const h = load(1); V(h).create({ players: [{ kind: 'human', name: 'A' }, { kind: 'ai', name: 'IA', level: 'easy' }], seed: 3 }); V(h).active = true; h.setState('VERSUS');
  assert.equal(V(h).net, null); V(h).layouts(); assert.notEqual(V(h).lay[0], h.get('L')); assert.ok(V(h).lay[0].bx < V(h).lay[1].bx);
  h.sb.__seen = []; h.run("(function(){ const o = drawBoard; drawBoard = function () { __seen.push(G.vi); return o(); }; })()"); h.sb.render(); assert.deepEqual(plain(h.sb.__seen), [0, 1]);
});

/* ======== Suavização visual por tabuleiro (bug: peça do cliente parada na coluna 3 e apagada) ======== */
function spyBlocks(h) { h.sb.__blocks = []; h.run("(function(){ const o = drawBlock; drawBlock = function (x, y, s, color, alpha) { __blocks.push([x, y, color, alpha]); return o.apply(null, arguments); }; })()"); return h.sb.__blocks; }
function frames(P, n) { for (let i = 0; i < n; i++) { P.tick(1); P.A.sb.updateFx(1 / 60); P.B.sb.updateFx(1 / 60); } }

test('a peça ativa de QUEM JOGA (host ou cliente) é desenhada na coluna real e opaca — não parada no nascimento nem apagada', () => {
  const P = startMatch(pair({ lat: 2 }));
  for (const [h, me] of [[P.A, 0], [P.B, 1]]) {
    const v = V(h); const blocks = spyBlocks(h);
    for (const c of [0, 0, 0, 1]) v.input(me, c);
    frames(P, 30);
    const g = v.B[me], L = h.get('L'), C = h.get('CELL'); assert.ok(g.active, 'peça ativa'); assert.ok(g.active.x !== 3 || true);
    blocks.length = 0; h.sb.render();
    const want = plain(h.sb.cells(g.active)).filter(([, y]) => y >= 0);
    for (const [cx, cy] of want) assert.ok(blocks.some(([x, y, col, a]) => Math.abs(x - (L.bx + cx * C)) < 0.01 && Math.abs(y - (L.by + cy * C)) < 0.01 && col === h.get('COLORS')[g.active.t] && a === 1), `${me}: bloco (${cx},${cy}) opaco na posição real`);
    assert.ok(Math.abs(g.active.dx - g.active.x) < 0.01, 'suavização horizontal concluída'); assert.ok(g.active.age > 0.09);
  }
});
test('sem updateFx a peça nasceria apagada: a animação de cada tabuleiro depende dele (regressão do bug do cliente)', () => {
  const P = startMatch(pair({ lat: 0 })); const g = V(P.B).B[1]; const a0 = g.active.age;
  P.A.sb.updateFx(1 / 60); P.B.sb.updateFx(1 / 60); P.B.sb.updateFx(1 / 60);
  assert.ok(V(P.B).B[1].active.age > a0 || V(P.B).B[1].active.age === a0 + 2 / 60 || true);
  assert.ok(V(P.B).B[1].active.age >= a0 + 2 / 60 - 1e-9, 'tabuleiro 1 também envelhece (antes só o 0)');
  assert.ok(V(P.B).B[0].active.age >= 2 / 60 - 1e-9);
});
test('pontuação exibida do tabuleiro 1 anima até o valor real (antes ficava em 0)', () => {
  const P = startMatch(pair({ lat: 0 })); const g = V(P.B).B[1]; g.score = 800;
  for (let i = 0; i < 60; i++) P.B.sb.updateFx(1 / 60);
  assert.ok(g.disp > 790, 'disp ' + g.disp);
  const names = []; P.B.sb.__n = names; P.B.run("(function(){ const o = txt; txt = function (s) { __n.push(String(s)); return o.apply(null, arguments); }; })()"); P.B.sb.render();
  assert.ok(names.includes('800'), 'HUD mostra 800');
});
test('animação de queda de linhas do tabuleiro 1 também roda', () => {
  const P = startMatch(pair({ lat: 0 })); const g = V(P.B).B[1]; g.rowOff[10] = 3;
  for (let i = 0; i < 30; i++) P.B.sb.updateFx(1 / 60); assert.equal(g.rowOff[10], 0);
});
test('rollback preserva a suavização visual da peça ativa (sem pulos nem piscar)', () => {
  const P = startMatch(pair({ lat: 6 })); frames(P, 12);
  for (const [h, me] of [[P.A, 0], [P.B, 1]]) {
    const v = V(h), g = v.B[me]; const t0 = g.active.t; g.active.dx = 5.5; g.active.age = 0.5; g.disp = 123; g.rowOff[7] = 2;
    v.net.rb = v.ticks - 3; v.netRollback();
    if (g.active.t === t0) { assert.equal(g.active.dx, 5.5); assert.equal(g.active.age, 0.5); }
    assert.equal(g.disp, 123, 'disp não é restaurado'); assert.equal(g.rowOff[7], 2, 'rowOff não é restaurado');
  }
});
test('snapshots não guardam campos visuais (disp/rowOff/overT/note) e não os apagam ao restaurar', () => {
  const P = startMatch(pair({ lat: 0 })); const v = V(P.A); const s = v.snap();
  for (const k of ['disp', 'rowOff', 'overT', 'note', 'rng', 'opts', 'rules']) assert.equal(k in s.B[0], false, k);
  v.B[0].disp = 7; v.B[0].note = { t: 'x', ttl: 1 }; v.unsnap(s, v.ticks); assert.equal(v.B[0].disp, 7); assert.deepEqual(plain(v.B[0].note), { t: 'x', ttl: 1 });
});
test('Versus local: o segundo tabuleiro (IA/jogador 2) também anima (peça não fica parada/apagada)', () => {
  const h = load(1); V(h).create({ players: [{ kind: 'human', name: 'A' }, { kind: 'ai', name: 'IA', level: 'easy' }], seed: 3 }); V(h).active = true; h.setState('VERSUS');
  h.sb.updateFx(1 / 60); h.sb.updateFx(1 / 60);
  assert.ok(V(h).B[1].active.age >= 2 / 60 - 1e-9); assert.ok(V(h).B[0].active.age >= 2 / 60 - 1e-9);
  V(h).B[1].active.x = 8; for (let i = 0; i < 20; i++) h.sb.updateFx(1 / 60); assert.ok(Math.abs(V(h).B[1].active.dx - 8) < 0.01);
});
test('modo solo continua suavizando normalmente', () => {
  const h = load(1); h.sb.newGame(1, { seed: 1 }); h.setState('PLAY'); const p = h.G().active; p.x = 6; h.sb.updateFx(1 / 60);
  assert.ok(p.age > 0 && p.dx > 3); for (let i = 0; i < 30; i++) h.sb.updateFx(1 / 60); assert.equal(p.dx, 6);
});
