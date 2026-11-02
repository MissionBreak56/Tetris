'use strict';
/* Torneio eliminatório (2 a 8 participantes: perfis humanos na mesma tela + IAs). Partidas só com IA são simuladas na hora;
   partidas com humano usam o Versus. O estado é salvo após cada partida: fechar o app nunca perde o torneio. */
const Tourney = {
  MIN: 2, MAX: 8,
  clean(n) { return String(n == null ? '' : n).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16); },
  load() {
    const d = Store.getJSON('tourney', null); if (!d || typeof d !== 'object') return null;
    try {
      if (d.v !== 1 || !Array.isArray(d.parts) || !Array.isArray(d.rounds) || ![2, 4, 8].includes(d.size)) return null;
      if (d.parts.length < this.MIN || d.parts.length > this.MAX || d.rounds.length !== Math.log2(d.size)) return null;
      const ids = new Set(d.parts.map((p) => p && p.id)); if (ids.size !== d.parts.length) return null;
      for (const p of d.parts) if (!p || typeof p.id !== 'string' || !this.clean(p.name) || !['human', 'ai'].includes(p.kind)) return null;
      d.rounds.forEach((r, k) => { if (!Array.isArray(r) || r.length !== d.size / Math.pow(2, k + 1)) throw 0; r.forEach((m) => { for (const s of ['a', 'b', 'w']) if (m[s] != null && !ids.has(m[s])) throw 0; }); });
      return d;
    } catch (e) { return null; }
  },
  save(t) { Store.setJSON('tourney', t); },
  clear() { Store.del('tourney'); },
  /** parts: [{name, kind:'human'|'ai', level?}] . Retorna {ok, errors, t}. */
  create(name, parts, seed) {
    const e = [], nm = this.clean(name) || 'Torneio';
    if (!Array.isArray(parts) || parts.length < this.MIN || parts.length > this.MAX) e.push('Use de ' + this.MIN + ' a ' + this.MAX + ' participantes');
    const P = (Array.isArray(parts) ? parts : []).map((p, i) => ({ id: 'a' + i, name: this.clean(p && p.name), kind: p && p.kind === 'human' ? 'human' : 'ai', level: p && AI.levels[p.level] ? p.level : 'medium', out: false }));
    if (P.some((p) => !p.name)) e.push('Todos os participantes precisam de nome');
    if (new Set(P.map((p) => p.name.toLowerCase())).size !== P.length) e.push('Nomes de participantes devem ser únicos');
    if (!P.some((p) => p.kind === 'human')) e.push('Inclua pelo menos um jogador humano');
    if (e.length) return { ok: false, errors: e };
    const sd = seed != null ? seed >>> 0 : (Math.random() * 4294967296) >>> 0, r = mkRng(sd), order = P.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    let size = 2; while (size < order.length) size *= 2;
    const slots = order.map((p) => p.id).concat(Array(size - order.length).fill(null));
    const r0 = []; for (let i = 0; i < size / 2; i++) r0.push({ a: slots[i], b: slots[size - 1 - i], w: null });
    const rounds = [r0]; for (let s = size / 4; s >= 1; s /= 2) rounds.push(Array.from({ length: s }, () => ({ a: null, b: null, w: null })));
    const t = { v: 1, id: 't' + sd.toString(36), name: nm, seed: sd, size, parts: P, rounds, done: false, champion: null, live: null, created: Date.now() };
    this.settle(t); this.save(t); return { ok: true, errors: [], t };
  },
  part(t, id) { return t.parts.find((p) => p.id === id); },
  /** Resolve byes e desistências e propaga vencedores; marca término. Não joga partidas. */
  settle(t) {
    let changed = true;
    while (changed) {
      changed = false;
      t.rounds.forEach((round, r) => round.forEach((m, i) => {
        if (m.w) return;
        const a = m.a && this.part(t, m.a), b = m.b && this.part(t, m.b);
        let w = null;
        if (m.a && !m.b && r === 0) { w = m.a; m.bye = true; }
        else if (m.b && !m.a && r === 0) { w = m.b; m.bye = true; }
        else if (a && b && (a.out || b.out)) { w = a.out && !b.out ? b.id : b.out && !a.out ? a.id : a.id; m.forfeit = true; }
        if (w) { this.setWinner(t, r, i, w); changed = true; }
      }));
    }
    const fin = t.rounds[t.rounds.length - 1][0];
    if (fin.w) { t.done = true; t.champion = fin.w; }
  },
  setWinner(t, r, i, w) {
    const m = t.rounds[r][i]; m.w = w;
    if (r + 1 < t.rounds.length) { const nx = t.rounds[r + 1][i >> 1]; if (i % 2 === 0) nx.a = w; else nx.b = w; }
  },
  /** Próxima partida a jogar (ambos definidos, sem vencedor). */
  next(t) {
    for (let r = 0; r < t.rounds.length; r++) for (let i = 0; i < t.rounds[r].length; i++) { const m = t.rounds[r][i]; if (!m.w && m.a && m.b) return { r, i, m }; }
    return null;
  },
  matchSeed(t, r, i) { return Daily.hash(t.id + '-' + r + '-' + i); },
  /** Simula todas as partidas só de IA já definidas (humanos jogam as suas ao vivo). */
  autoPlay(t) {
    for (let guard = 0; guard < 40; guard++) {
      this.settle(t); let found = null;
      t.rounds.forEach((round, r) => round.forEach((m, i) => { if (found || m.w || !m.a || !m.b) return; const a = this.part(t, m.a), b = this.part(t, m.b); if (a.kind === 'ai' && b.kind === 'ai') found = { r, i, m, a, b }; }));
      if (!found) break;
      const { r, i, m, a, b } = found;
      const res = Versus.simulate({ seed: this.matchSeed(t, r, i), players: [{ kind: 'ai', name: a.name, level: a.level }, { kind: 'ai', name: b.name, level: b.level }] });
      m.res = { s: res.score, l: res.lines, tie: res.tie };
      this.setWinner(t, r, i, res.winner === 0 ? a.id : b.id);
    }
    this.settle(t); this.save(t); return t;
  },
  record(t, r, i, winnerId, res) {
    const m = t.rounds[r][i]; if (m.w || ![m.a, m.b].includes(winnerId)) return false;
    m.res = res ? { s: res.score, l: res.lines, tie: res.tie } : null; this.setWinner(t, r, i, winnerId); t.live = null;
    this.autoPlay(t);
    if (t.done) this.onDone(t);
    return true;
  },
  onDone(t) { const c = this.part(t, t.champion); if (c && c.kind === 'human') { Rewards.grant('tourney:' + t.id, 3); const w = Store.getJSON('tourneyWins', 0); if (!Rewards.has('tw:' + t.id)) { Rewards.grant('tw:' + t.id, 0); Store.set('tourneyWins', num(w) + 1); } } },
  wins() { return num(Store.getJSON('tourneyWins', 0)); },
  /** Desistência: o participante perde todas as partidas restantes. */
  withdraw(t, pid) { const p = this.part(t, pid); if (!p || p.out || t.done) return false; p.out = true; t.live = null; this.autoPlay(t); if (t.done) this.onDone(t); return true; },
  /** Inicia a partida ao vivo (Versus). Humano sempre no índice 0 quando só há um. */
  play(t) {
    const n = this.next(t); if (!n) return false;
    const a = this.part(t, n.m.a), b = this.part(t, n.m.b), swap = a.kind !== 'human' && b.kind === 'human', pair = swap ? [b, a] : [a, b];
    t.live = { r: n.r, i: n.i }; this.save(t);
    Versus.start({ seed: this.matchSeed(t, n.r, n.i), players: pair.map((p) => ({ kind: p.kind, name: p.name, level: p.level })),
      onEnd: (res) => { const winnerId = pair[res.winner].id; this.record(t, n.r, n.i, winnerId, res); goMenu(); openTournament(true); } });
    return true;
  },
  rankName(t, id) { const p = id && this.part(t, id); return p ? (p.kind === 'human' ? '👤 ' : '🤖 ') + p.name : '—'; },
  roundTitle(t, r) { const left = t.rounds.length - r; return left === 1 ? 'Final' : left === 2 ? 'Semifinal' : 'Quartas de final'; },
};
function openTournament(fresh) {
  const build = (b) => {
    const t = Tourney.load();
    if (!t) { buildTourneySetup(b); return; }
    b.appendChild(kv('Torneio', t.name));
    t.rounds.forEach((round, r) => {
      b.appendChild(sec(Tourney.roundTitle(t, r).toUpperCase()));
      round.forEach((m) => {
        const w = m.w;
        b.appendChild(h('div', { class: 'kv' }, h('span', { text: Tourney.rankName(t, m.a) + '  ×  ' + (m.bye ? '(folga)' : Tourney.rankName(t, m.b)) }), h('b', { text: w ? '→ ' + Tourney.part(t, w).name + (m.forfeit ? ' (W.O.)' : '') : (m.a && m.b ? 'pendente' : '—') })));
      });
    });
    if (t.done) {
      const c = Tourney.part(t, t.champion);
      b.appendChild(h('div', { class: 'newrec', text: '🏆 Campeão: ' + c.name }));
      b.appendChild(btn('Novo torneio', () => { Tourney.clear(); Sheet.refresh(); }));
      return;
    }
    if (t.live) b.appendChild(h('div', { class: 'hint', text: 'Uma partida foi interrompida. Ao continuar ela recomeça do zero.' }));
    const n = Tourney.next(t);
    if (n) { const a = Tourney.part(t, n.m.a), c = Tourney.part(t, n.m.b); b.appendChild(btn('▶ Jogar: ' + a.name + ' × ' + c.name, () => Tourney.play(t))); }
    const hum = t.parts.filter((p) => p.kind === 'human' && !p.out);
    hum.forEach((p) => b.appendChild(btn('Desistir: ' + p.name, () => Confirm.ask(p.name + ' desiste do torneio? As partidas restantes serão perdidas por W.O.', () => { Tourney.withdraw(t, p.id); Sheet.refresh(); }), 'danger')));
    b.appendChild(btn('Abandonar torneio', () => Confirm.ask('Apagar este torneio?', () => { Tourney.clear(); Sheet.refresh(); }), 'danger'));
  };
  if (fresh) Sheet.open('Torneio', build); else Sheet.push('Torneio', build);
}
function buildTourneySetup(b) {
  const parts = [], sel = new Set(), ais = [];
  b.appendChild(h('div', { class: 'hint', text: 'Eliminatória de 2 a 8 participantes. Perfis marcados jogam na mesma tela; IAs completam a chave. Partidas só de IA são simuladas na hora.' }));
  const nameIn = h('input', { type: 'text', maxlength: '16', class: 'txt', value: 'Torneio' });
  b.appendChild(nameIn); b.appendChild(sec('JOGADORES (perfis)'));
  const out = h('div', { class: 'errs' }), list = h('div', { class: 'hint' });
  const refresh = () => { list.textContent = 'Participantes (' + (sel.size + ais.length) + '): ' + Profile.list().filter((p) => sel.has(p.id)).map((p) => '👤' + p.name).concat(ais.map((a) => '🤖' + a.name)).join(', '); };
  const row = h('div', { class: 'row wrap' });
  Profile.list().forEach((p) => { const bt = btn(p.name, () => { if (sel.has(p.id)) sel.delete(p.id); else sel.add(p.id); bt.textContent = (sel.has(p.id) ? '✔ ' : '') + p.name; refresh(); }); row.appendChild(bt); });
  b.appendChild(row); b.appendChild(sec('IAS'));
  const arow = h('div', { class: 'row wrap' });
  Object.keys(AI.levels).forEach((k) => arow.appendChild(btn('+ IA ' + AI.levels[k].name, () => { if (sel.size + ais.length < Tourney.MAX) { ais.push({ name: 'IA ' + AI.levels[k].name + ' ' + (ais.length + 1), kind: 'ai', level: k }); refresh(); } })));
  arow.appendChild(btn('− Remover IA', () => { ais.pop(); refresh(); }));
  b.appendChild(arow); b.appendChild(list); b.appendChild(out);
  b.appendChild(btn('Criar torneio', () => {
    const humans = Profile.list().filter((p) => sel.has(p.id)).map((p) => ({ name: p.name, kind: 'human' }));
    const r = Tourney.create(nameIn.value, humans.concat(ais));
    if (!r.ok) { out.textContent = r.errors.join(' · '); return; }
    Tourney.autoPlay(r.t); Sheet.refresh();
  }));
  refresh();
}
Modes.add(60, 'Torneio', () => openTournament(false), 'tourney');
Store.register('tourney', 'tourneyWins');
