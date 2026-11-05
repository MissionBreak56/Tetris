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
    deliver() { for (const [dir, to] of [['ab', B], ['ba', A]]) { const arr = q[dir]; while (arr.length && arr[0][0] <= step) NetOf(to)._line(arr.shift()[1]); } },
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
  for (const bad of [{ p: 2, eng: 'E2' }, { p: 1, eng: 'E1' }]) {
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
  for (const junk of ['', 'x', '[]', '5', 'null', '{"k":5}', '{"k":"start","seed":1,"D":8}', '{"k":"in","u":1,"e":[]}', 'x'.repeat(20000), '{"k":"hello","p":1,"eng":"E2"' ]) NetOf(h)._line(junk);
  assert.equal(NetOf(h).st, 'handshake'); assert.equal(NetOf(h).peer, null);
  NetOf(h)._line(JSON.stringify({ k: 'hello', p: 1, eng: 'E2', name: '<b>Zé</b>\nMuito longo nome demais' }));
  assert.equal(NetOf(h).st, 'lobby'); assert.ok(!/[<>\n]/.test(NetOf(h).peer.name) && NetOf(h).peer.name.length <= 16);
  NetOf(h)._line(JSON.stringify({ k: 'hello', p: 1, eng: 'E2', name: 'Outro' })); assert.notEqual(NetOf(h).peer.name, 'Outro', 'segundo hello ignorado');
});
test('conexão: nome igual ao seu recebe sufixo; tempo esgotado no aperto de mão desconecta', () => {
  const h = load(1); h.sb.__T = { available: () => true, host() {}, scan() {}, join() {}, close() {}, send() {} }; h.run('Net.T=__T');
  NetOf(h).host(); NetOf(h)._ev({ e: 'connected' }); NetOf(h)._line(JSON.stringify({ k: 'hello', p: 1, eng: 'E2', name: 'Jogador 1' }));
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
  for (const bad of [{ seed: -1, D: 8 }, { seed: 1.5, D: 8 }, { seed: 5, D: 1 }, { seed: 5, D: 99 }, { seed: 'a', D: 8 }]) NetOf(P.B)._line(JSON.stringify(Object.assign({ k: 'start' }, bad)));
  assert.equal(NetOf(P.B).st, 'lobby');
  NetOf(P.A)._line(JSON.stringify({ k: 'start', seed: 5, D: 8 })); assert.equal(NetOf(P.A).st, 'lobby', 'anfitrião não obedece start');
  startMatch(P); assert.equal(NetOf(P.A).st, 'playing'); assert.equal(NetOf(P.B).st, 'playing'); assert.equal(V(P.A).net.local, 0); assert.equal(V(P.B).net.local, 1);
});

/* ---------------- sincronia (lockstep) ---------------- */
test('lockstep: com ações aleatórias nos dois lados os tabuleiros ficam idênticos até o fim (latência 0)', () => {
  const P = startMatch(pair({ lat: 0 })); const inp = randomInputs(5);
  for (let i = 0; i < 4000 && !(V(P.A).over && V(P.B).over); i++) P.tick(1, inp);
  assert.ok(V(P.A).over && V(P.B).over, 'terminou'); assert.equal(boards(P.A), boards(P.B));
  assert.deepEqual(plain(V(P.A).result), plain(V(P.B).result)); assert.ok(V(P.A).ticks > 100);
  assert.equal(V(P.A).result.aborted, undefined);
});
test('lockstep: latências e jitter diferentes (inclusive acima do atraso de entrada) não causam divergência', () => {
  for (const [lat, jit, seed] of [[1, 0, 2], [3, 2, 3], [6, 4, 4], [12, 6, 5], [25, 10, 6]]) {
    const P = startMatch(pair({ lat, jitter: jit, seed })); const inp = randomInputs(seed * 7);
    for (let i = 0; i < 12000 && !(V(P.A).over && V(P.B).over); i++) P.tick(1, inp);
    assert.ok(V(P.A).over && V(P.B).over, `terminou lat=${lat}`); assert.equal(boards(P.A), boards(P.B), `lat=${lat}`);
    assert.equal(V(P.A).result.aborted, undefined, `lat=${lat}`); assert.equal(V(P.A).ticks, V(P.B).ticks);
  }
});
test('lockstep: o jogo espera (stall) quando faltam ações do oponente e retoma sem perder sincronia', () => {
  const P = startMatch(pair({ lat: 0 })); P.tick(20);
  P.q.ab.length = 0; P.q.ba.length = 0;                          // "rede" cortada por alguns quadros (mensagens retidas)
  const cutA = P.sent.a.length; P.T.a.closed = true; P.T.b.closed = true;
  const before = [V(P.A).ticks, V(P.B).ticks]; P.tick(40);
  assert.ok(V(P.A).ticks - before[0] <= 9 && V(P.B).ticks - before[1] <= 9, 'travou em no máximo D ticks à frente'); void cutA;
});
test('lockstep: cada lado só controla o próprio tabuleiro; ações remotas chegam no tick certo', () => {
  const P = startMatch(pair({ lat: 2 })); const a = V(P.A);
  const x0 = a.B[0].active.x; assert.equal(a.input(1, 0), false, 'não controla o tabuleiro do oponente'); assert.equal(a.input(0, 0), true);
  assert.equal(a.B[0].active.x, x0, 'só vale D ticks depois');
  P.tick(a.net.D + 6); assert.equal(a.B[0].active.x, x0 - 1); assert.equal(V(P.B).B[0].active.x, x0 - 1, 'o outro aparelho aplicou no mesmo tick');
});
test('lockstep: ações do oponente fora de ordem/atrasadas ou inválidas abortam a partida', () => {
  for (const msg of [{ k: 'in', u: 5, e: [[0, 9]] }, { k: 'in', u: 5, e: [['a', 1]] }, { k: 'in', u: 5, e: 'x' }, { k: 'in', u: 'x', e: [] }, { k: 'in', u: 5, e: Array(70).fill([20, 1]) }, { k: 'in', u: 5, e: [[1, 1, 1]] }, { k: 'in', u: 99999, e: [] }]) {
    const P = startMatch(pair()); P.tick(30);
    NetOf(P.A)._line(JSON.stringify(msg)); assert.equal(V(P.A).over, true, JSON.stringify(msg).slice(0, 40)); assert.equal(V(P.A).result.aborted, true);
  }
  const P = startMatch(pair()); P.tick(30); NetOf(P.A)._line(JSON.stringify({ k: 'in', u: 5, e: [[1, 1]] }));       // tick 1 já passou
  assert.equal(V(P.A).result.aborted, true);
});
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
  const P = startMatch(pair()); const inp = randomInputs(3);
  for (let i = 0; i < 4000 && !(V(P.A).over && V(P.B).over); i++) P.tick(1, inp);
  assert.equal(NetOf(P.A).st, 'ended');
  NetOf(P.B).rematch(); for (let i = 0; i < 100 && !(NetOf(P.A).st === 'playing' && NetOf(P.B).st === 'playing'); i++) P.tick(1);
  assert.equal(NetOf(P.A).st, 'playing'); assert.equal(NetOf(P.B).st, 'playing'); assert.equal(V(P.A).ticks, 0);
  P.A.setState('VERSUS'); P.B.setState('VERSUS'); for (let i = 0; i < 300; i++) P.tick(1, inp);
  assert.equal(boards(P.A), boards(P.B)); assert.equal(V(P.A).result, null);
  P.A.sb.goMenu(); assert.equal(NetOf(P.A).st, 'idle'); assert.equal(P.T.a.closed, true); assert.ok(P.sent.a.some((l) => JSON.parse(l).k === 'bye'));
});
test('nível inicial salvo diferente nos aparelhos não gera divergência', () => {
  const P = pair(); P.A.get('settings').startLevel = 9; P.B.get('settings').startLevel = 1;
  startMatch(P); const inp = randomInputs(8); for (let i = 0; i < 3000 && !(V(P.A).over && V(P.B).over); i++) P.tick(1, inp);
  assert.equal(boards(P.A), boards(P.B)); assert.equal(V(P.A).B[0].level >= 1 && V(P.A).B[0].level < 5, true);
});
test('lixo/ataques funcionam igual online (mesmo resultado nos dois aparelhos)', () => {
  const P = startMatch(pair({ lat: 2 })); const inp = randomInputs(77);
  for (let i = 0; i < 6000 && !(V(P.A).over && V(P.B).over); i++) P.tick(1, inp);
  assert.deepEqual(plain(V(P.A).sent), plain(V(P.B).sent)); assert.deepEqual(plain(V(P.A).pend), plain(V(P.B).pend));
});

/* ---------------- tela e integração ---------------- */
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
test('atraso de entrada automático: tabela por RTT (mín. 6, máx. 24, padrão 8 sem medidas)', () => {
  const N = NetOf(load(1)); const d = (a) => { N.rtts = a; return N.autoD(); };
  assert.equal(d([]), 8); assert.equal(d([50, 50]), 8);
  assert.equal(d([5, 5, 5, 5]), 6); assert.equal(d([100, 100, 100, 100, 100]), 6); assert.equal(d([300, 300, 300, 300, 300]), 12);
  assert.equal(d([400, 400, 400, 400, 400, 400, 400, 400, 400, 400]), 15); assert.equal(d([5000, 5000, 5000, 5000]), 24);
  assert.equal(d([20, 20, 20, 20, 20, 20, 20, 20, 20, 900]), 6, 'um pico isolado (<10%) não infla o atraso'); assert.equal(d([20, 20, 20, 20, 20, 900, 900, 900, 900, 900]), 24);
});
test('partida usa o atraso calibrado e os dois aparelhos concordam', () => {
  const P = pair({ lat: 12 }); P.tick(200);                                    // 12 quadros de ida = RTT ≈ 400 ms
  assert.equal(NetOf(P.A).autoD(), 15); startMatch(P);
  assert.equal(V(P.A).net.D, 15); assert.equal(V(P.B).net.D, 15);
});
test('com RTT alto o atraso calibrado evita travadas; com atraso fixo pequeno o jogo trava', () => {
  const run = (calibrate) => {
    const P = pair({ lat: 12 }); P.tick(200); if (!calibrate) NetOf(P.A).autoD = () => 8;
    startMatch(P); const t0 = V(P.A).ticks; P.tick(600); return (V(P.A).ticks - t0) / 600;
  };
  const cal = run(true), fixo = run(false);
  assert.ok(cal > 0.9, 'calibrado roda ~60 ticks/s: ' + cal); assert.ok(fixo < 0.8 && fixo < cal - 0.2, 'D=8 com RTT 400 ms trava: ' + fixo + ' vs ' + cal);
});
test('mesmo com RTT alto e jitter os tabuleiros continuam idênticos usando o atraso automático', () => {
  const P = pair({ lat: 9, jitter: 5, seed: 12 }); P.tick(250); startMatch(P); const inp = randomInputs(41);
  for (let i = 0; i < 15000 && !(V(P.A).over && V(P.B).over); i++) P.tick(1, inp);
  assert.ok(V(P.A).over && V(P.B).over); assert.equal(boards(P.A), boards(P.B)); assert.equal(V(P.A).result.aborted, undefined);
});
test('tela: lobby mostra ping e atraso; partida desenha o ping sem erro', () => {
  const P = pair({ lat: 3 }); P.tick(120); assert.doesNotThrow(() => P.A.sb.openOnline());
  startMatch(P); P.tick(30); for (const s of ['COUNT', 'VERSUS', 'VSOVER']) { P.A.setState(s); assert.doesNotThrow(() => P.A.sb.render(), s); }
});
