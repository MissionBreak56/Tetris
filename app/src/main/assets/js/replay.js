'use strict';
/* Replays determinísticos: grava só as AÇÕES do jogador (com o tick da simulação) + semente + regras.
   Reproduzir = recriar a partida e reaplicar as ações. Validar = simular sem tela e comparar o resultado. */
const ENGINE_VERSION = 'E1';      // aumente SEMPRE que qualquer regra do motor mudar (replays antigos deixam de ser válidos)
let SIM = false;                  // true durante simulação silenciosa (sem som/vibração/mensagens)
const fnv = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(16); };

const Replays = {
  MAX_RECENT: 10, MAX_FAV: 10, MAX_EV: 60000, MAX_TICKS: 216000, MAX_TEXT: 1000000,
  enc(ev) { const o = []; let p = 0; for (let i = 0; i < ev.length; i += 2) { o.push(ev[i] - p, ev[i + 1]); p = ev[i]; } return o; },
  dec(d) { const o = []; let p = 0; for (let i = 0; i < d.length; i += 2) { p += d[i]; o.push(p, d[i + 1]); } return o; },
  cleanRules(r) {
    if (r == null) return {};
    if (typeof r !== 'object' || Array.isArray(r)) return null;
    const o = {}, int = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
    for (const k of Object.keys(r)) {
      const v = r[k];
      if (k === 'timeLimit') { if (v === null || int(v, 1, 3600)) o[k] = v; else return null; }
      else if (k === 'fixedLevel') { if (v === null || int(v, 1, 30)) o[k] = v; else return null; }
      else if (k === 'goal') { if (v === null) o.goal = null; else if (v && ['lines', 'score', 'time'].includes(v.type) && (v.type === 'time' || int(v.target, 1, 10000000))) o.goal = v.type === 'time' ? { type: 'time' } : { type: v.type, target: v.target }; else return null; }
      else if (['levelUps', 'noHold', 'noGhost', 'skills', 'noGravity'].includes(k)) { if (typeof v === 'boolean') o[k] = v; else return null; }
      else if (k === 'topout') { if (v === 'over' || v === 'reset') o[k] = v; else return null; }
      else return null;
    }
    return o;
  },
  fromGame(g) {
    const o = { rules: this.cleanRules(g.opts && g.opts.rules) || {} };
    if (g.opts) { for (const k of ['zenLevel', 'sprintLevel']) if (Number.isInteger(g.opts[k])) o[k] = g.opts[k]; if (typeof g.opts.daily === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.opts.daily)) o.daily = g.opts.daily; }
    return { v: 1, eng: ENGINE_VERSION, mode: g.mode, seed: g.seed >>> 0, sl: g.sl, opts: o, ticks: g.tick, ev: this.enc(g.rec),
      res: { score: Math.round(g.score), lines: g.lines, level: g.level, ms: Math.round(g.ms) }, t: Date.now() };
  },
  /** Estrutura + limites. Não executa a partida. */
  validate(r) {
    const e = [];
    if (!r || typeof r !== 'object') return { ok: false, errors: ['Replay inválido'] };
    if (r.v !== 1) e.push('Versão de formato não suportada');
    if (r.eng !== ENGINE_VERSION) e.push('Replay de outra versão do motor (' + r.eng + ')');
    if (!Number.isInteger(r.mode) || r.mode < 1 || r.mode > 7) e.push('Modo inválido');
    if (!Number.isInteger(r.seed) || r.seed < 0 || r.seed > 4294967295) e.push('Semente inválida');
    if (!Number.isInteger(r.sl) || r.sl < 1 || r.sl > 15) e.push('Nível inicial inválido');
    if (!Number.isInteger(r.ticks) || r.ticks < 0 || r.ticks > this.MAX_TICKS) e.push('Duração inválida');
    if (!Array.isArray(r.ev) || r.ev.length % 2 || r.ev.length > this.MAX_EV * 2) e.push('Eventos inválidos');
    else {
      let p = 0;
      for (let i = 0; i < r.ev.length; i += 2) { const d = r.ev[i], c = r.ev[i + 1]; if (!Number.isInteger(d) || d < 0 || !Number.isInteger(c) || c < 0 || c > 7) { e.push('Evento corrompido'); break; } p += d; }
      if (p > r.ticks && !e.length) e.push('Evento depois do fim da partida');
    }
    if (!r.opts || typeof r.opts !== 'object' || this.cleanRules(r.opts.rules) === null) e.push('Regras inválidas');
    if (!r.res || !['score', 'lines', 'level', 'ms'].every((k) => Number.isInteger(r.res[k]) && r.res[k] >= 0)) e.push('Resultado inválido');
    if (!Number.isInteger(r.t)) e.push('Data inválida');
    return { ok: !e.length, errors: e };
  },
  /** Roda a partida inteira em silêncio e devolve o resultado. Restaura o estado do app ao final. */
  simulate(r) {
    const sv = { G, state, sl: settings.startLevel, last: tS }; const fx = { shake: FX.shake, pulse: FX.pulse };
    SIM = true; settings.startLevel = r.sl;
    try {
      const o = Object.assign({}, r.opts, { seed: r.seed, rules: this.cleanRules(r.opts.rules) });
      newGame(r.mode, o); G.replay = true; G.rec = null; state = 'REPLAY';
      const ev = this.dec(r.ev); let i = 0;
      while (G.tick < r.ticks && !G.overDone) {
        while (i < ev.length && ev[i] === G.tick && !G.overDone) { act(ev[i + 1], true); i += 2; }
        if (G.overDone) break;
        update(STEP);
      }
      while (i < ev.length && ev[i] === G.tick && !G.overDone) { act(ev[i + 1], true); i += 2; }
      return { score: Math.round(G.score), lines: G.lines, level: G.level, ms: Math.round(G.ms), ticks: G.tick };
    } finally {
      SIM = false; settings.startLevel = sv.sl; G = sv.G; state = sv.state; FX.parts.length = 0; FX.flash.length = 0; FX.lock.length = 0; FX.trail = null; FX.shake = fx.shake; FX.pulse = fx.pulse; FX.screen = null;
    }
  },
  /** validate + simulate + comparar com o resultado gravado. */
  verify(r) {
    const v = this.validate(r); if (!v.ok) return v;
    let s; try { s = this.simulate(r); } catch (e) { return { ok: false, errors: ['Falha ao simular o replay'] }; }
    if (s.score !== r.res.score || s.lines !== r.res.lines || s.level !== r.res.level || s.ms !== r.res.ms) return { ok: false, errors: ['O replay não reproduz o resultado gravado (corrompido ou adulterado)'] };
    return { ok: true, errors: [], result: s };
  },
  /* ---------- armazenamento ---------- */
  load() { const d = Store.getJSON('replays', []); return (Array.isArray(d) ? d : []).filter((x) => x && x.rep && Number.isInteger(x.id) && this.validate(x.rep).ok); },
  store(list) {
    const rec = list.filter((x) => !x.fav).sort((a, b) => b.id - a.id).slice(0, this.MAX_RECENT), fav = list.filter((x) => x.fav).sort((a, b) => b.id - a.id).slice(0, this.MAX_FAV);
    let out = rec.concat(fav).sort((a, b) => b.id - a.id);
    while (!Store.setJSON('replays', out) && out.length) { const idx = out.map((x, i) => [x, i]).filter(([x]) => !x.fav).pop(); out.splice(idx ? idx[1] : out.length - 1, 1); }
    return out;
  },
  add(rep, fav) {
    const list = this.load(); let id = rep.t; while (list.some((x) => x.id === id)) id++;
    list.push({ id, fav: fav ? 1 : 0, rep }); this.store(list); return id;
  },
  /** Chamado ao final da partida (Results.commit). Ignora tutorial, replay e partidas sem ações/ticks. */
  capture(g) {
    if (!g || !g.rec || g.replay || !g.rules || g.rules.tutorial || g.mode > 7 || g.tick < 60) return null;
    const rep = this.fromGame(g);
    if (!this.validate(rep).ok) return null;
    return this.add(rep, false);
  },
  setFav(id, f) { const l = this.load(); const x = l.find((y) => y.id === id); if (!x) return false; if (f && l.filter((y) => y.fav).length >= this.MAX_FAV) return false; x.fav = f ? 1 : 0; this.store(l); return true; },
  remove(id) { this.store(this.load().filter((x) => x.id !== id)); },
  /* ---------- exportar / importar ---------- */
  pack(rep) { const data = JSON.stringify(rep); return JSON.stringify({ type: 'tetris-replay', v: 1, sum: fnv(data), data: rep }); },
  unpack(text) {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, errors: ['Nada para importar'] };
    if (text.length > this.MAX_TEXT) return { ok: false, errors: ['Arquivo grande demais'] };
    let d; try { d = JSON.parse(text); } catch (e) { return { ok: false, errors: ['Texto não é um JSON válido'] }; }
    if (!d || d.type !== 'tetris-replay' || d.v !== 1 || !d.data) return { ok: false, errors: ['Não é um replay do Tetris'] };
    if (d.sum !== fnv(JSON.stringify(d.data))) return { ok: false, errors: ['Checksum não confere (arquivo alterado ou incompleto)'] };
    const v = this.verify(d.data); if (!v.ok) return v;
    return { ok: true, errors: [], rep: d.data };
  },
  importText(text) {
    const u = this.unpack(text); if (!u.ok) return u;
    const dup = this.load().find((x) => x.rep.t === u.rep.t && x.rep.seed === u.rep.seed && x.rep.ticks === u.rep.ticks);
    if (dup) return { ok: false, errors: ['Este replay já está na sua lista'] };
    return { ok: true, errors: [], id: this.add(u.rep, false) };
  },
  title(x) { const r = x.rep; return (MODE_NAMES[r.mode] || '?') + ' · ' + fmtNum(r.res.score) + ' · ' + fmtDate(r.t); },
};

/* ---------- reprodução ---------- */
const Replay = {
  cur: null,
  play(rep) {
    const v = Replays.verify(rep); if (!v.ok) return v;
    stopMusic(); hideAll(); showTutBanner(false); const sl = settings.startLevel;
    settings.startLevel = rep.sl;
    try { newGame(rep.mode, Object.assign({}, rep.opts, { seed: rep.seed, rules: Replays.cleanRules(rep.opts.rules) })); } finally { settings.startLevel = sl; }
    G.replay = true; G.rec = null; state = 'REPLAY';
    this.cur = { rep, ev: Replays.dec(rep.ev), i: 0, speed: 1, paused: false, acc: 0, done: false };
    $('rpBar').style.display = 'flex'; $('pauseBtn').style.display = 'none'; this.paint();
    return { ok: true, errors: [] };
  },
  paint() { const c = this.cur; if (!c) return; $('rpPlay').textContent = c.done ? '↺' : c.paused ? '▶' : '❚❚'; $('rpSpeed').textContent = '×' + c.speed; },
  tickOnce(c) {
    while (c.i < c.ev.length && c.ev[c.i] === G.tick && !G.overDone) { act(c.ev[c.i + 1], true); c.i += 2; }
    if (!G.overDone && G.tick < c.rep.ticks) update(STEP);
    if (G.overDone || G.tick >= c.rep.ticks) { while (c.i < c.ev.length && c.ev[c.i] === G.tick && !G.overDone) { act(c.ev[c.i + 1], true); c.i += 2; } c.done = true; this.paint(); }
  },
  frame(dt) {
    const c = this.cur; if (!c || c.paused || c.done || !G) return;
    c.acc += dt * c.speed; let n = 0;
    while (c.acc >= STEP && n < 32 && !c.done) { c.acc -= STEP; this.tickOnce(c); n++; }
    if (n === 32) c.acc = 0;
  },
  toggle() { const c = this.cur; if (!c) return; if (c.done) this.play(c.rep); else { c.paused = !c.paused; this.paint(); } },
  speed() { const c = this.cur; if (!c) return; c.speed = c.speed === 1 ? 2 : c.speed === 2 ? 4 : 1; this.paint(); },
  stop() { this.cur = null; $('rpBar').style.display = 'none'; },
};

function openReplays() {
  Sheet.push('Replays', (b) => {
    b.appendChild(h('div', { class: 'hint', text: 'Guardamos as 10 últimas partidas e até 10 favoritas. Tutorial e Versus não são gravados.' }));
    const l = Replays.load();
    if (!l.length) b.appendChild(h('div', { class: 'sub', text: 'Nenhum replay ainda. Termine uma partida para gravar.' }));
    l.forEach((x) => b.appendChild(btn((x.fav ? '★ ' : '') + Replays.title(x), () => openReplayItem(x.id))));
    b.appendChild(btn('Importar replay', openReplayImport));
  });
}
function openReplayItem(id) {
  const x = Replays.load().find((y) => y.id === id); if (!x) { Sheet.back(); return; }
  Sheet.push('Replay', (b) => {
    const r = x.rep;
    [kv('Modo', MODE_NAMES[r.mode]), kv('Data', fmtDate(r.t)), kv('Score', fmtNum(r.res.score)), kv('Linhas', r.res.lines), kv('Nível', r.res.level), kv('Duração', fmtMsP(r.res.ms)), kv('Ações gravadas', r.ev.length / 2)].forEach((e) => b.appendChild(e));
    const out = h('div', { class: 'errs' });
    b.appendChild(btn('▶ Assistir', () => { const v = Replay.play(r); if (!v.ok) { out.textContent = v.errors.join(' · '); } }));
    b.appendChild(btn(x.fav ? 'Remover dos favoritos' : '★ Favoritar', () => { if (!Replays.setFav(id, !x.fav)) out.textContent = 'Limite de favoritos atingido'; else { Sheet.back(); Sheet.refresh(); } }));
    b.appendChild(btn('Exportar / compartilhar', () => openReplayExport(id)));
    b.appendChild(btn('Excluir', () => Confirm.ask('Excluir este replay?', () => { Replays.remove(id); Sheet.back(); Sheet.refresh(); }), 'danger'));
    b.appendChild(out);
  });
}
function openReplayExport(id) {
  const x = Replays.load().find((y) => y.id === id); if (!x) return;
  Sheet.push('Exportar replay', (b) => {
    const text = Replays.pack(x.rep), name = 'tetris-replay-' + x.rep.t + '.json';
    const ta = h('textarea', { class: 'txt', rows: '5', readonly: 'readonly' }); ta.value = text; b.appendChild(ta);
    b.appendChild(h('div', { class: 'hint', text: 'Tamanho: ' + Math.ceil(text.length / 1024) + ' KB. O texto contém um checksum; ao importar, o jogo reproduz a partida para conferir.' }));
    if (Native.available()) b.appendChild(btn('Compartilhar', () => Native.share('Replay do Tetris', text)));
    const out = h('div', { class: 'errs' }); b.appendChild(btn('Salvar arquivo', () => Native.saveFile(name, 'application/json', text, (ok) => { out.textContent = ok ? '✓ Arquivo salvo' : 'Não foi possível salvar'; out.className = 'errs' + (ok ? ' ok' : ''); }))); b.appendChild(out);
  });
}
function openReplayImport() {
  Sheet.push('Importar replay', (b) => {
    const ta = h('textarea', { class: 'txt', rows: '5', placeholder: 'Cole aqui o texto do replay' }); const out = h('div', { class: 'errs' });
    const run = (t) => { const r = Replays.importText(t); if (r.ok) { out.textContent = '✓ Replay importado e verificado'; out.className = 'errs ok'; } else { out.textContent = r.errors.join(' · '); out.className = 'errs'; } };
    b.appendChild(ta); b.appendChild(out); b.appendChild(btn('Importar texto', () => run(ta.value)));
    b.appendChild(btn('Escolher arquivo…', () => Native.pickFile((t, err) => { if (err || t == null) { out.textContent = err || 'Falha ao abrir'; out.className = 'errs'; } else run(t); })));
  });
}
Hub.add(45, 'Replays', openReplays);
Store.register('replays');
