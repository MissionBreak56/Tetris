'use strict';
/* Modo online em REDE LOCAL (Wi-Fi/hotspot). Duas pessoas, dois aparelhos.
   Previsão com correção (rollback): os dois aparelhos simulam os DOIS tabuleiros com a mesma semente e trocam somente as ações.
   Suas ações valem na hora (sem atraso de entrada); se uma ação do oponente chegar atrasada o jogo volta àquele tick e re-simula.
   O motor é determinístico, então os tabuleiros ficam idênticos; um hash do estado confirmado a cada 2 s detecta qualquer divergência.
   Mensagens: JSON em linhas. Versão do protocolo e do motor precisam ser iguais.
   Estabilidade: cada mensagem de ações ('in') tem número de sequência (s) e confirma o que já recebeu (a). Se a conexão cair no meio da partida
   (Wi-Fi oscilando, tela apagada, troca de app) os dois lados RECONECTAM sozinhos por até GRACE_MS: o anfitrião reabre a porta, o cliente tenta de novo,
   ambos trocam 'resume' (mesma sessão) e reenviam só o que o outro não recebeu. Enquanto isso o jogo fica parado (não conta como derrota). */
const Lan = {
  available() { return typeof AndroidBridge !== 'undefined' && typeof AndroidBridge.lanHost === 'function'; },
  host(name, port) { AndroidBridge.lanHost(name, port); },
  listen(port) { if (typeof AndroidBridge.lanListen === 'function') AndroidBridge.lanListen(port); else AndroidBridge.lanHost('', port); },   // reabre a porta sem anunciar (retomada)
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
  PROTO: 4, PORT: 47600, MAX_LINE: 16384, HS_MS: 5000, DEAD_MS: 7000, DEAD_PLAY_MS: 5000, GRACE_MS: 20000, RC_RETRY_MS: 1000, MAX_LOG: 3000, HASH_EVERY: 120,
  T: null, role: null, sentU: -1, st: 'idle', peer: null, hosts: [], ip: '', ips: [], rtts: [], hbN: 0, err: '', lastRx: 0, hsAt: 0, lastSend: 0, lastSentTick: -9, timer: null, onChange: null, name: '', info: '',
  sid: '', txSeq: 0, rxSeq: -1, peerAck: -1, msgLog: [], joinIp: '', joinPort: 0, beatAt: 0, rcAt: 0, rcNext: 0, rcBusy: false, rcTries: 0, rcWhy: '', resumes: 0,
  now() { return Date.now(); },
  tr() { return this.T || Lan; },
  available() { return this.tr().available(); },
  setSt(s, err) { this.st = s; if (err !== undefined) this.err = err; if (this.onChange) this.onChange(); },
  connected() { return ['handshake', 'lobby', 'playing', 'reconnecting', 'ended'].includes(this.st); },
  validIp(ip) { const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip).trim()); return !!m && m.slice(1).every((x) => +x <= 255) && PRIVATE_NET.test(String(ip).trim()); },
  stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },
  reset() { this.stopTimer(); this.sid = ''; this.txSeq = 0; this.rxSeq = -1; this.peerAck = -1; this.msgLog = []; this.rcBusy = false; this.beatAt = 0; this.role = null; this.peer = null; this.hosts = []; this.ip = ''; this.ips = []; this.rtts = []; this.err = ''; this.st = 'idle'; },
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
    this.stopTimer(); this.role = 'client'; this.name = Profile.cur().name; this.joinIp = String(ip).trim(); this.joinPort = p; this.setSt('connecting', '');
    try { this.tr().join(String(ip).trim(), p); } catch (e) { this.setSt('error', 'Falha ao conectar'); return false; }
    return true;
  },
  send(o) { this.sendRaw(JSON.stringify(o)); },
  sendRaw(line) { try { this.tr().send(line); this.lastSend = this.now(); } catch (e) {} },
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
        if (this.st === 'reconnecting') {                                       // nova conexão no meio da partida: confirma a sessão e o que já recebemos
          this.rcLink = true; this.lastRx = this.now(); this.send({ k: 'resume', p: this.PROTO, eng: ENGINE_VERSION, sid: this.sid, a: this.rxSeq }); break;
        }
        this.hsAt = this.now(); this.lastRx = this.now(); this.peer = null; this.rtts = []; this.hbN = 0; this.setSt('handshake', '');
        this.send({ k: 'hello', p: this.PROTO, eng: ENGINE_VERSION, name: this.name || Profile.cur().name });
        this.stopTimer(); this.timer = setInterval(() => this.heartbeat(), 500); break;
      case 'closed': this.onClosed(String(e.why || 'Conexão encerrada')); break;
      case 'error':
        if (this.st === 'reconnecting') { this.rcBusy = false; this.rcLink = false; this.rcNext = this.now() + this.RC_RETRY_MS; break; }      // tentativa falhou: tenta de novo
        this.stopTimer(); this.role = this.role; this.setSt('error', String(e.msg || 'Erro de rede')); break;
    }
  },
  _line(s) {
    if (typeof s !== 'string' || s.length > this.MAX_LINE) return;
    let m; try { m = JSON.parse(s); } catch (e) { return; }
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.k !== 'string') return;
    this.lastRx = this.now();
    if (m.k === 'hello') return this.onHello(m);
    if (m.k === 'nack') { this.disconnectKeep(String(m.why || 'Recusado pelo oponente').slice(0, 80)); return; }
    if (m.k === 'bye') return this.onClosed('O oponente saiu', true);
    if (m.k === 'p') { if (typeof m.t === 'number' && Number.isFinite(m.t)) this.send({ k: 'pong', t: m.t }); return; }
    if (m.k === 'pong') return this.onPong(m);
    if (m.k === 'resume') return this.onResume(m);
    if (!this.peer) return;                                    // nada além de hello é aceito antes do aperto de mão
    if (m.k === 'start') {
      if (this.role !== 'client' || !['lobby', 'ended'].includes(this.st)) return;
      if (!Number.isInteger(m.seed) || m.seed < 0 || m.seed > 4294967295 || typeof m.sid !== 'string' || !/^[0-9a-f]{8,32}$/.test(m.sid)) return;
      this.beginMatch(m.seed, m.sid);
    } else if (m.k === 'again') { if (this.role === 'host' && this.st === 'ended') this.startMatch(); }
    else if (m.k === 'in') { if (this.st === 'playing' && Versus.net) this.onIn(m); }
    else if (m.k === 'rs') { if (this.st === 'playing' && Versus.net && Number.isInteger(m.a)) this.resendFrom(m.a); }
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
    const t = this.now(), gap = this.beatAt ? t - this.beatAt : 0; this.beatAt = t;
    if (this.st === 'reconnecting') { this.rcTick(t); return; }
    if (this.st === 'handshake' && t - this.hsAt > this.HS_MS) { this.disconnectKeep('O oponente não respondeu'); return; }
    if (gap > 3000) this.lastRx = t;                           // o relógio ficou parado (app em segundo plano / tela apagada): dá o benefício da dúvida
    if (this.connected() && t - this.lastRx > (this.st === 'playing' ? this.DEAD_PLAY_MS : this.DEAD_MS)) { this.onClosed('Conexão perdida'); return; }
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
  onClosed(why, final) {
    if (this.st === 'reconnecting') {                                      // a tentativa de reconexão caiu: tenta outra vez (ou encerra se o oponente saiu de propósito)
      if (!final) { this.rcBusy = false; this.rcLink = false; this.rcNext = this.now() + this.RC_RETRY_MS; return; }
      this.stopTimer(); try { this.tr().close(); } catch (e) {} const lo = 1 - Versus.net.local; if (Versus.net && !Versus.over) Versus.netForfeit(lo, why); this.st = 'ended'; this.peer = null; return;
    }
    if (!final && this.st === 'playing' && Versus.active && Versus.net && !Versus.over) { this.beginReconnect(why); return; }   // queda no meio da partida: não é derrota, tenta voltar
    this.stopTimer();
    if (Versus.active && Versus.net && !Versus.over) { try { this.tr().close(); } catch (e) {} const loser = 1 - Versus.net.local; Versus.netForfeit(loser, why); this.st = 'ended'; this.peer = null; return; }
    const wasMatch = this.st === 'playing' || this.st === 'ended';
    try { this.tr().close(); } catch (e) {}
    const r = this.role; this.reset(); this.role = r; this.setSt(wasMatch ? 'idle' : 'error', wasMatch ? '' : why);
  },
  /* ---- partida ---- */
  startMatch() {                                                // só o anfitrião
    if (this.role !== 'host' || !this.peer || !['lobby', 'ended'].includes(this.st)) return false;
    const seed = (Math.random() * 4294967296) >>> 0, sid = this.newSid();
    this.send({ k: 'start', seed, sid }); this.beginMatch(seed, sid); return true;
  },
  newSid() { let x = ''; for (let i = 0; i < 4; i++) x += ((Math.random() * 4294967296) >>> 0).toString(16).padStart(8, '0'); return x; },
  beginMatch(seed, sid) {
    this.sid = sid || this.newSid(); this.txSeq = 0; this.rxSeq = -1; this.peerAck = -1; this.msgLog = []; this.rcBusy = false; this.resumes = 0;
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
      const s = this.txSeq++, line = JSON.stringify({ k: 'in', s, a: this.rxSeq, u: this.sentU, e: v.out });   // s: nº da mensagem; a: última do oponente que recebi; u: "não haverá ação minha antes do tick u+1"
      this.msgLog.push({ s, line }); if (this.msgLog.length > this.MAX_LOG) this.msgLog.shift();
      this.sendRaw(line); v.out = []; this.lastSentTick = t;
    }
  },
  /** Mensagem de ações do oponente: ignora duplicatas (reenvio), pede reenvio se faltar alguma, e só então entrega à simulação. */
  onIn(m) {
    if (!Number.isInteger(m.s) || m.s < 0) return Versus.netAbort('Mensagem inválida do oponente');
    if (Number.isInteger(m.a)) this.ackTo(m.a);
    if (m.s <= this.rxSeq) return;                                       // duplicata
    if (m.s !== this.rxSeq + 1) { this.send({ k: 'rs', a: this.rxSeq }); return; }   // faltou uma: pede de volta (TCP não perde, mas protege contra falha de reconexão)
    this.rxSeq = m.s; Versus.netRecv(m);
  },
  ackTo(a) { if (a > this.peerAck) this.peerAck = Math.min(a, this.txSeq - 1); while (this.msgLog.length && this.msgLog[0].s <= this.peerAck) this.msgLog.shift(); },
  /** Reenvia, na ordem, tudo o que o oponente ainda não confirmou (s > a). */
  resendFrom(a) {
    this.ackTo(a); a = Math.max(a, this.peerAck);                          // o que o oponente já confirmou antes não precisa voltar (pedido antigo/atrasado)
    if (a + 1 < (this.msgLog.length ? this.msgLog[0].s : this.txSeq)) { if (Versus.net) Versus.netAbort('Fora de sincronia (reenvio indisponível)'); return false; }
    for (const e of this.msgLog) this.sendRaw(e.line);
    return true;
  },
  /* ---- reconexão no meio da partida ---- */
  beginReconnect(why) {
    if (this.st === 'reconnecting') return;
    this.st = 'reconnecting'; this.rcAt = this.now(); this.rcNext = 0; this.rcBusy = false; this.rcLink = false; this.rcTries = 0; this.rcWhy = String(why || 'Conexão perdida'); this.rtts = [];
    if (Versus.net) Versus.netLink(false);
    this.rcTick(this.now()); if (this.onChange) this.onChange();
  },
  rcTick(t) {
    if (t - this.rcAt > this.GRACE_MS) return this.rcGiveUp();
    if (this.rcBusy || t < this.rcNext) return;
    this.rcBusy = true; this.rcTries++;
    try {
      const tr = this.tr();
      if (this.role === 'host') { if (typeof tr.listen === 'function') tr.listen(this.PORT); else tr.host(this.name, this.PORT); }   // anfitrião: reabre a porta e espera
      else tr.join(this.joinIp, this.joinPort);                                                                                          // cliente: tenta conectar de novo
    } catch (e) { this.rcBusy = false; this.rcNext = t + this.RC_RETRY_MS; }
  },
  rcGiveUp() {
    const secs = Math.round(this.GRACE_MS / 1000); this.stopTimer(); try { this.tr().close(); } catch (e) {}
    this.st = 'ended'; this.peer = null;
    if (Versus.net && !Versus.over) Versus.netAbort('Conexão perdida e não restabelecida em ' + secs + ' s');
  },
  /** O oponente também voltou: confere a sessão, retoma a partida e reenvia o que ele não recebeu. */
  onResume(m) {
    if (this.st !== 'reconnecting') return;
    const ok = m.p === this.PROTO && m.eng === ENGINE_VERSION && typeof m.sid === 'string' && m.sid === this.sid && Number.isInteger(m.a) && m.a >= -1 && m.a < this.txSeq;
    if (!ok) { this.rcBusy = false; this.rcLink = false; this.rcNext = this.now(); return; }          // conexão de outra sessão/aparelho: ignora e continua esperando
    this.st = 'playing'; this.rcBusy = false; this.lastRx = this.now(); this.lastSentTick = -9; this.resumes++;
    if (!this.resendFrom(m.a)) return;
    if (Versus.net) Versus.netLink(true);
    if (this.onChange) this.onChange();
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
