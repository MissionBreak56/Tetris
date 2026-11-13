'use strict';
/* Modo online em REDE LOCAL (Wi-Fi/hotspot). Duas pessoas, dois aparelhos.
   Previsão com correção (rollback): os dois aparelhos simulam os DOIS tabuleiros com a mesma semente e trocam somente as ações.
   Suas ações valem na hora (sem atraso de entrada); se uma ação do oponente chegar atrasada o jogo volta àquele tick e re-simula.
   O motor é determinístico, então os tabuleiros ficam idênticos; um hash do estado confirmado a cada 2 s detecta qualquer divergência.
   Mensagens: JSON em linhas. Versão do protocolo e do motor precisam ser iguais. */
const Lan = {
  available() { return typeof AndroidBridge !== 'undefined' && typeof AndroidBridge.lanHost === 'function'; },
  host(name, port) { AndroidBridge.lanHost(name, port); },
  scan() { AndroidBridge.lanScan(); },
  join(ip, port) { AndroidBridge.lanJoin(ip, port); },
  send(line) { AndroidBridge.lanSend(line); },
  close() { AndroidBridge.lanClose(); },
  ip() { try { return AndroidBridge.lanIp(); } catch (e) { return ''; } },
  ips() { try { return JSON.parse(AndroidBridge.lanIps()); } catch (e) { return []; } },
};
// Faixas aceitas: redes privadas (RFC1918 + link-local) e de VPN (Tailscale/CGNAT 100.64–127.x e Hamachi 25.x).
const PRIVATE_NET = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}|25\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;
const Net = {
  PROTO: 3, PORT: 47600, MAX_LINE: 16384, HS_MS: 5000, DEAD_MS: 7000, HASH_EVERY: 120,
  T: null, role: null, sentU: -1, st: 'idle', peer: null, hosts: [], ip: '', ips: [], rtts: [], hbN: 0, err: '', lastRx: 0, hsAt: 0, lastSend: 0, lastSentTick: -9, timer: null, onChange: null, name: '', info: '',
  now() { return Date.now(); },
  tr() { return this.T || Lan; },
  available() { return this.tr().available(); },
  setSt(s, err) { this.st = s; if (err !== undefined) this.err = err; if (this.onChange) this.onChange(); },
  connected() { return ['handshake', 'lobby', 'playing', 'ended'].includes(this.st); },
  validIp(ip) { const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip).trim()); return !!m && m.slice(1).every((x) => +x <= 255) && PRIVATE_NET.test(String(ip).trim()); },
  stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },
  reset() { this.stopTimer(); this.role = null; this.peer = null; this.hosts = []; this.ip = ''; this.ips = []; this.rtts = []; this.err = ''; this.st = 'idle'; },
  /** Encerra tudo: avisa o outro lado (se conectado) e fecha o socket. */
  disconnect() {
    if (this.connected()) this.send({ k: 'bye' });
    try { this.tr().close(); } catch (e) {}
    this.reset(); if (this.onChange) this.onChange();
  },
  host() {
    this.disconnect(); this.role = 'host'; this.name = Profile.cur().name; this.setSt('hosting', '');
    try { this.tr().host(this.name, this.PORT); } catch (e) { this.setSt('error', 'Não foi possível criar a sala'); }
  },
  scan() { this.disconnect(); this.role = 'client'; this.name = Profile.cur().name; this.hosts = []; this.setSt('scanning', ''); try { this.tr().scan(); } catch (e) { this.setSt('error', 'Falha ao procurar salas'); } },
  join(ip, port) {
    const p = port == null ? this.PORT : Number(port);
    if (!this.validIp(ip)) { this.setSt('error', 'Use um IP de rede local (ex.: 192.168.0.10)'); return false; }
    if (!Number.isInteger(p) || p < 1024 || p > 65535) { this.setSt('error', 'Porta inválida'); return false; }
    this.stopTimer(); this.role = 'client'; this.name = Profile.cur().name; this.setSt('connecting', '');
    try { this.tr().join(String(ip).trim(), p); } catch (e) { this.setSt('error', 'Falha ao conectar'); return false; }
    return true;
  },
  send(o) { try { this.tr().send(JSON.stringify(o)); this.lastSend = this.now(); } catch (e) {} },
  /* ---- eventos vindos da camada nativa ---- */
  _ev(e) {
    if (!e || typeof e !== 'object') return;
    switch (e.e) {
      case 'hosting': if (this.st === 'hosting') {
        this.ip = String(e.ip || '');
        this.ips = (Array.isArray(e.ips) ? e.ips : []).filter((x) => x && typeof x.ip === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(x.ip)).slice(0, 8).map((x) => ({ n: String(x.n || '').slice(0, 16), ip: x.ip }));
        this.setSt('hosting');
      } break;
      case 'found': if (this.st === 'scanning' && this.validIp(e.ip) && this.hosts.length < 20 && !this.hosts.some((h) => h.ip === e.ip && h.port === e.port)) {
        const port = Number(e.port); if (Number.isInteger(port) && port >= 1024 && port <= 65535) { this.hosts.push({ name: Tourney.clean(e.name) || e.ip, ip: String(e.ip), port }); this.setSt('scanning'); } } break;
      case 'scanDone': if (this.st === 'scanning') this.setSt('scanned'); break;
      case 'connected':
        this.hsAt = this.now(); this.lastRx = this.now(); this.peer = null; this.rtts = []; this.hbN = 0; this.setSt('handshake', '');
        this.send({ k: 'hello', p: this.PROTO, eng: ENGINE_VERSION, name: this.name || Profile.cur().name });
        this.stopTimer(); this.timer = setInterval(() => this.heartbeat(), 500); break;
      case 'closed': this.onClosed(String(e.why || 'Conexão encerrada')); break;
      case 'error': this.stopTimer(); this.role = this.role; this.setSt('error', String(e.msg || 'Erro de rede')); break;
    }
  },
  _line(s) {
    if (typeof s !== 'string' || s.length > this.MAX_LINE) return;
    let m; try { m = JSON.parse(s); } catch (e) { return; }
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.k !== 'string') return;
    this.lastRx = this.now();
    if (m.k === 'hello') return this.onHello(m);
    if (m.k === 'nack') { this.disconnectKeep(String(m.why || 'Recusado pelo oponente').slice(0, 80)); return; }
    if (m.k === 'bye') return this.onClosed('O oponente saiu');
    if (m.k === 'p') { if (typeof m.t === 'number' && Number.isFinite(m.t)) this.send({ k: 'pong', t: m.t }); return; }
    if (m.k === 'pong') return this.onPong(m);
    if (!this.peer) return;                                    // nada além de hello é aceito antes do aperto de mão
    if (m.k === 'start') {
      if (this.role !== 'client' || !['lobby', 'ended'].includes(this.st)) return;
      if (!Number.isInteger(m.seed) || m.seed < 0 || m.seed > 4294967295) return;
      this.beginMatch(m.seed);
    } else if (m.k === 'again') { if (this.role === 'host' && this.st === 'ended') this.startMatch(); }
    else if (m.k === 'in') { if (this.st === 'playing' && Versus.net) Versus.netRecv(m); }
    else if (m.k === 'h') { if (this.st === 'playing' && Versus.net) Versus.netRecvHash(m); }
  },
  onHello(m) {
    if (this.st !== 'handshake' || this.peer) return;
    if (m.p !== this.PROTO) { this.send({ k: 'nack', why: 'Versão de protocolo diferente' }); this.disconnectKeep('O oponente usa outra versão do jogo'); return; }
    if (m.eng !== ENGINE_VERSION) { this.send({ k: 'nack', why: 'Versão do motor diferente (' + ENGINE_VERSION + ')' }); this.disconnectKeep('O oponente usa outra versão do jogo (motor ' + String(m.eng).slice(0, 8) + ')'); return; }
    let n = Tourney.clean(m.name) || 'Oponente'; if (n.toLowerCase() === String(this.name).toLowerCase()) n = (n + ' (2)').slice(0, 16);
    this.peer = { name: n }; this.setSt('lobby', '');
  },
  disconnectKeep(msg) { try { this.tr().close(); } catch (e) {} this.stopTimer(); const r = this.role; this.reset(); this.role = r; this.setSt('error', msg); },
  heartbeat() {
    const t = this.now();
    if (this.st === 'handshake' && t - this.hsAt > this.HS_MS) { this.disconnectKeep('O oponente não respondeu'); return; }
    if (this.connected() && t - this.lastRx > this.DEAD_MS) { this.onClosed('Conexão perdida'); return; }
    if (this.connected()) { this.hbN++; if (this.st !== 'playing' || this.hbN % 2 === 0) this.send({ k: 'p', t }); }   // ping: mede a latência (a cada 0,5 s no lobby, ~1 s na partida)
  },
  onPong(m) {
    if (typeof m.t !== 'number' || !Number.isFinite(m.t) || m.t < 0 || m.t > this.now()) return;       // só aceita o carimbo que nós mesmos enviamos
    const r = this.now() - m.t; if (r > 10000) return;
    this.rtts.push(r); if (this.rtts.length > 12) this.rtts.shift();
    if (this.st === 'lobby' && this.onChange) this.onChange();
  },
  /** Ping (mediana das últimas medições, ms) ou null. */
  ping() { if (!this.rtts.length) return null; const s = this.rtts.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; },
  onClosed(why) {
    this.stopTimer();
    if (Versus.active && Versus.net && !Versus.over) { try { this.tr().close(); } catch (e) {} const loser = 1 - Versus.net.local; Versus.netForfeit(loser, why); this.st = 'ended'; this.peer = null; return; }
    const wasMatch = this.st === 'playing' || this.st === 'ended';
    try { this.tr().close(); } catch (e) {}
    const r = this.role; this.reset(); this.role = r; this.setSt(wasMatch ? 'idle' : 'error', wasMatch ? '' : why);
  },
  /* ---- partida ---- */
  startMatch() {                                                // só o anfitrião
    if (this.role !== 'host' || !this.peer || !['lobby', 'ended'].includes(this.st)) return false;
    const seed = (Math.random() * 4294967296) >>> 0;
    this.send({ k: 'start', seed }); this.beginMatch(seed); return true;
  },
  beginMatch(seed) {
    const host = this.role === 'host', me = { kind: 'human', name: this.name || Profile.cur().name }, op = { kind: 'human', name: this.peer.name };
    this.st = 'playing'; this.lastSentTick = -9; this.sentU = -1; Sheet.stack = [];
    Versus.start({ seed, players: host ? [me, op] : [op, me], net: { local: host ? 0 : 1 } });
  },
  rematch() {
    if (!this.connected()) { goMenu(); return; }
    if (this.role === 'host') this.startMatch(); else { this.send({ k: 'again' }); }
  },
  matchEnded() { if (this.st === 'playing') this.st = 'ended'; },
  /** Enviado a cada quadro durante a partida: ações novas + promessa "não haverá ação minha antes do tick u". */
  pump(force) {
    const v = Versus.net; if (!v || this.st !== 'playing') return;
    const t = Versus.ticks;
    if (force || v.out.length || t - this.lastSentTick >= 3 || this.now() - this.lastSend > 250) {
      this.sentU = Math.max(this.sentU, t - 1);                                          // promessa monotônica (nunca recua, mesmo depois de voltar ao tick do fim)
      this.send({ k: 'in', u: this.sentU, e: v.out }); v.out = []; this.lastSentTick = t;   // u: "não haverá ação minha antes do tick u+1"
    }
  },
  forfeitLocal() {
    if (!Versus.net || Versus.over) return;
    this.send({ k: 'bye' }); try { this.tr().close(); } catch (e) {}
    Versus.netForfeit(Versus.net.local, 'Você abandonou a partida'); this.st = 'ended'; this.peer = null; this.stopTimer();
  },
};

function openOnline() {
  Net.onChange = () => { const top = Sheet.stack[Sheet.stack.length - 1]; if (top && top.title === 'Online (rede local)') Sheet.refresh(); };
  Sheet.push('Online (rede local)', (b) => {
    const st = Net.st;
    b.appendChild(h('div', { class: 'hint', text: 'Jogue contra outra pessoa no mesmo Wi-Fi (ou hotspot). Um cria a sala, o outro entra. Os dois precisam ter a mesma versão do app.' }));
    if (!Net.available()) { b.appendChild(h('div', { class: 'errs', text: 'Disponível somente no app Android (precisa de Wi-Fi na mesma rede).' })); return; }
    if (Net.err) b.appendChild(h('div', { class: 'errs', text: Net.err }));
    const back = () => btn('Voltar', () => { Net.disconnect(); });
    if (st === 'idle' || st === 'error') {
      b.appendChild(btn('Criar sala', () => Net.host()));
      b.appendChild(btn('Procurar salas', () => Net.scan()));
      manualJoin(b);
    } else if (st === 'hosting') {
      b.appendChild(h('div', { class: 'stat', text: 'Sala aberta' }));
      const list = Net.ips.length ? Net.ips : [{ n: 'rede', ip: Net.ip || Lan.ip() || '?' }];
      list.forEach((x) => b.appendChild(kv('IP' + (x.n ? ' (' + x.n + ')' : ''), x.ip + ':' + Net.PORT)));
      b.appendChild(h('div', { class: 'hint', text: 'Aguardando o oponente… No mesmo Wi-Fi ele usa "Procurar salas". Por VPN (Tailscale, ZeroTier, Hamachi, WireGuard) passe o IP da interface da VPN (tun/tailscale/ham…) e ele usa "Conectar por IP".' }));
      b.appendChild(btn('Cancelar', () => Net.disconnect()));
    } else if (st === 'scanning' || st === 'scanned') {
      b.appendChild(h('div', { class: 'stat', text: st === 'scanning' ? 'Procurando salas…' : 'Busca concluída' }));
      Net.hosts.forEach((x) => b.appendChild(btn('Entrar: ' + x.name + ' (' + x.ip + ')', () => Net.join(x.ip, x.port))));
      if (st === 'scanned' && !Net.hosts.length) b.appendChild(h('div', { class: 'sub', text: 'Nenhuma sala encontrada. Confira se estão no mesmo Wi-Fi ou digite o IP.' }));
      b.appendChild(btn('Procurar de novo', () => Net.scan())); manualJoin(b); b.appendChild(back());
    } else if (st === 'connecting' || st === 'handshake') {
      b.appendChild(h('div', { class: 'stat', text: 'Conectando…' })); b.appendChild(btn('Cancelar', () => Net.disconnect()));
    } else if (st === 'lobby') {
      b.appendChild(h('div', { class: 'newrec', text: '✔ Conectado com ' + Net.peer.name }));
      { const p = Net.ping(); b.appendChild(kv('Ping', p == null ? 'medindo…' : Math.round(p) + ' ms')); b.appendChild(kv('Atraso dos seus comandos', '≈ 0 ms (previsão com correção)')); }
      if (Net.role === 'host') b.appendChild(btn('▶ Iniciar partida', () => Net.startMatch())); else b.appendChild(h('div', { class: 'stat', text: 'Aguardando o anfitrião iniciar…' }));
      b.appendChild(btn('Desconectar', () => Net.disconnect()));
    }
  });
}
function manualJoin(b) {
  const inp = h('input', { type: 'text', class: 'txt', placeholder: 'IP da sala (ex.: 192.168.0.10)', maxlength: '15', inputmode: 'decimal' });
  b.appendChild(inp); b.appendChild(btn('Conectar por IP', () => Net.join(inp.value)));
}
Modes.add(70, 'Online (rede local)', openOnline, 'online');
