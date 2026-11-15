'use strict';
/* Social online: placar contra cada oponente (por perfil), revanche com "pronto" dos dois lados e emotes rápidos. */
const EMOTES = ['👍', '😂', '😮', '🔥', '🤝', '😅', '💪', 'GG'];
/** Placar de vitórias × derrotas contra cada oponente (chave = nome em minúsculas). Guardado por perfil. Partidas interrompidas não contam. */
const H2H = {
  MAX: 30,
  key(name) { return String(name == null ? '' : name).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 16); },
  load() { const d = Store.getJSON('h2h', {}); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; },
  get(name) { const d = this.load()[this.key(name)]; return d ? { w: num(d.w), l: num(d.l), t: num(d.t) } : { w: 0, l: 0, t: 0 }; },
  /** Registra o resultado ('w' | 'l' | 't') e devolve o placar atualizado. `sid` evita contar duas vezes a mesma partida (a tela final pode redesenhar). */
  record(name, outcome, sid) {
    const k = this.key(name); if (!k || !['w', 'l', 't'].includes(outcome)) return this.get(name);
    const d = this.load(), e = d[k] || { n: String(name).slice(0, 16), w: 0, l: 0, t: 0, s: '' };
    if (sid && e.s === sid) return { w: e.w, l: e.l, t: e.t };
    e[outcome] = num(e[outcome]) + 1; e.s = sid || ''; e.at = Date.now(); d[k] = e;
    const keys = Object.keys(d); if (keys.length > this.MAX) keys.sort((a, b) => num(d[a].at) - num(d[b].at)).slice(0, keys.length - this.MAX).forEach((x) => { delete d[x]; });
    Store.setJSON('h2h', d); return { w: e.w, l: e.l, t: e.t };
  },
  clear() { Store.setJSON('h2h', {}); },
};
const Social = {
  lastSent: -1e9, lastRecv: -1e9, hintEl: null, palOpen: false, tm: null, SEND_MS: 1200, RECV_MS: 800, SHOW_MS: 2500,
  online() { return !!(Net.connected() && Net.peer && Versus.cfg && Versus.cfg.net); },
  sendEmote(i) {
    if (!this.online() || !Number.isInteger(i) || i < 0 || i >= EMOTES.length) return false;
    const t = Net.now(); if (t - this.lastSent < this.SEND_MS) return false; this.lastSent = t;
    Net.send({ k: 'emote', i }); this.show(i, 'Você'); return true;
  },
  onEmote(m) {
    if (!this.online() || !Number.isInteger(m.i) || m.i < 0 || m.i >= EMOTES.length) return;
    const t = Net.now(); if (t - this.lastRecv < this.RECV_MS) return; this.lastRecv = t;
    this.show(m.i, Net.peer ? Net.peer.name : 'Oponente'); try { sfx.skill(); } catch (e) {}
  },
  show(i, who) { const el = $('emoteShow'); el.textContent = String(who).slice(0, 16) + ': ' + EMOTES[i]; el.classList.add('on'); clearTimeout(this.tm); this.tm = setTimeout(() => el.classList.remove('on'), this.SHOW_MS); },
  /** Botão 💬 e paleta só aparecem numa partida online (jogando ou na tela final). */
  syncUi() {
    const on = this.online() && (state === 'VERSUS' || state === 'VSOVER');
    $('bEmote').style.display = on ? 'flex' : 'none'; if (!on) this.closePal();
  },
  togglePal() { if (this.palOpen) this.closePal(); else this.openPal(); },
  openPal() { const p = $('emotePal'); clearEl(p); EMOTES.forEach((e, i) => p.appendChild(h('button', { class: 'btn small', text: e, onclick: () => { this.sendEmote(i); this.closePal(); } }))); p.classList.add('on'); this.palOpen = true; },
  closePal() { $('emotePal').classList.remove('on'); this.palOpen = false; },
  /** Tela final online: botão "Revanche" com estado dos dois lados. */
  setupEnd(box) {
    this.hintEl = h('div', { class: 'newrec' }); box.appendChild(this.hintEl); this.refreshEnd();
  },
  refreshEnd() {
    if (!(Versus.cfg && Versus.cfg.net) || state !== 'VSOVER') return;
    const b = $('bRetry'); b.textContent = !Net.peer ? 'Voltar ao menu' : Net.ready ? 'Aguardando o oponente…' : 'Revanche'; b.disabled = !!Net.ready && !!Net.peer;
    if (this.hintEl) this.hintEl.textContent = Net.peerReady && !Net.ready ? ((Net.peer ? Net.peer.name : 'O oponente') + ' quer revanche!') : '';
  },
};
