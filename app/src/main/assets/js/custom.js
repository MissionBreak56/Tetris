'use strict';
/* Desafios personalizados (modo 7): regras configuráveis, validadas, com melhor resultado por desafio. Nunca entram no ranking oficial. */
const Custom = {
  MAX: 20,
  defaults() { return { id: null, name: 'Meu desafio', goalType: 'lines', target: 40, timeLimit: null, level: 1, fixedLevel: false, noHold: false, noGhost: false, reset: false, fixedSeed: false, stats: { tries: 0, wins: 0, bestScore: 0, bestMs: 0 } }; },
  /** Valida e normaliza. Retorna {ok, errors, c}. Bloqueia combinações impossíveis ou sem objetivo. */
  validate(d) {
    const e = [], c = Object.assign(this.defaults(), d && typeof d === 'object' ? d : {});
    const int = (v) => Number.isInteger(Number(v)) ? Number(v) : NaN;
    c.name = String(c.name == null ? '' : c.name).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);
    if (!c.name) e.push('Dê um nome ao desafio');
    if (!['lines', 'score', 'time', 'none'].includes(c.goalType)) { e.push('Objetivo inválido'); c.goalType = 'lines'; }
    c.timeLimit = c.timeLimit === null || c.timeLimit === '' || c.timeLimit === undefined ? null : int(c.timeLimit);
    if (c.timeLimit !== null && !(c.timeLimit >= 10 && c.timeLimit <= 3600)) e.push('Tempo deve ficar entre 10 e 3600 s');
    c.level = int(c.level); if (!(c.level >= 1 && c.level <= 30)) { e.push('Nível deve ficar entre 1 e 30'); c.level = 1; }
    c.fixedLevel = !!c.fixedLevel; c.noHold = !!c.noHold; c.noGhost = !!c.noGhost; c.reset = !!c.reset; c.fixedSeed = !!c.fixedSeed;
    if (c.goalType === 'lines' || c.goalType === 'score') {
      c.target = int(c.target);
      const max = c.goalType === 'lines' ? 999 : 10000000;
      if (!(c.target >= 1 && c.target <= max)) e.push('Meta deve ficar entre 1 e ' + fmtNum(max));
      else if (c.goalType === 'lines' && c.timeLimit !== null && c.target > c.timeLimit * 2) e.push('Impossível: ' + c.target + ' linhas em ' + c.timeLimit + ' s (máx. ≈ 2 linhas por segundo)');
      else if (c.goalType === 'score' && c.timeLimit !== null && c.target > c.timeLimit * 8000) e.push('Impossível: meta de pontos alta demais para ' + c.timeLimit + ' s');
    } else c.target = 0;
    if (c.goalType === 'time' && c.timeLimit === null) e.push('"Sobreviver" exige um tempo limite');
    if (c.goalType === 'none' && c.timeLimit === null) e.push('Sem objetivo é preciso definir um tempo limite');
    if (c.reset && c.goalType === 'time') e.push('Sobreviver não combina com limpar o tabuleiro ao topar (nunca se perde)');
    const s = c.stats && typeof c.stats === 'object' ? c.stats : {};
    c.stats = { tries: Math.max(0, num(s.tries)), wins: Math.max(0, num(s.wins)), bestScore: Math.max(0, num(s.bestScore)), bestMs: Math.max(0, num(s.bestMs)) };
    return { ok: !e.length, errors: e, c };
  },
  list() { const d = Store.getJSON('custom', []); return (Array.isArray(d) ? d : []).filter((x) => x && typeof x.id === 'string').map((x) => this.validate(x)).filter((v) => v.ok).map((v) => v.c).slice(0, this.MAX); },
  save(c) {
    const v = this.validate(c); if (!v.ok) return { ok: false, errors: v.errors };
    const l = this.list(); const i = l.findIndex((x) => x.id === c.id);
    if (i >= 0) { v.c.id = c.id; v.c.stats = l[i].stats; l[i] = v.c; }
    else { if (l.length >= this.MAX) return { ok: false, errors: ['Limite de ' + this.MAX + ' desafios'] }; v.c.id = 'x' + (l.reduce((m, x) => Math.max(m, parseInt(x.id.slice(1), 10) || 0), 0) + 1); l.push(v.c); }
    Store.setJSON('custom', l); return { ok: true, errors: [], id: v.c.id };
  },
  remove(id) { Store.setJSON('custom', this.list().filter((x) => x.id !== id)); },
  duplicate(id) { const c = this.list().find((x) => x.id === id); if (!c) return null; const r = this.save(Object.assign({}, c, { id: null, name: (c.name + ' cópia').slice(0, 24), stats: undefined })); return r.ok ? r.id : null; },
  /** Regras de motor equivalentes ao desafio. */
  toRules(c) {
    const r = { timeLimit: c.timeLimit, goal: c.goalType === 'none' ? null : c.goalType === 'time' ? { type: 'time' } : { type: c.goalType, target: c.target },
      levelUps: !c.fixedLevel, fixedLevel: c.fixedLevel ? c.level : null, noHold: c.noHold, noGhost: c.noGhost, topout: c.reset ? 'reset' : 'over' };
    return r;
  },
  options(c) { const o = { rules: this.toRules(c), custom: c.id, text: c.name }; if (c.fixedSeed) o.seed = Daily.hash('custom-' + c.id + '-' + c.name); return o; },
  record(res) {
    if (!res.custom) return;
    const l = this.list(), c = l.find((x) => x.id === res.custom); if (!c) return;
    c.stats.tries++; c.stats.bestScore = Math.max(c.stats.bestScore, num(res.score));
    if (res.win) { c.stats.wins++; if (!c.stats.bestMs || res.ms < c.stats.bestMs) c.stats.bestMs = res.ms; }
    Store.setJSON('custom', l);
  },
};
function describeCustom(c) {
  const g = c.goalType === 'lines' ? c.target + ' linhas' : c.goalType === 'score' ? fmtNum(c.target) + ' pontos' : c.goalType === 'time' ? 'sobreviver' : 'maior pontuação';
  return g + (c.timeLimit ? ' em ' + c.timeLimit + ' s' : '') + (c.fixedLevel ? ' · nível ' + c.level : '') + (c.noHold ? ' · sem hold' : '') + (c.noGhost ? ' · sem sombra' : '') + (c.reset ? ' · sem game over' : '');
}
function openCustomList() {
  Sheet.push('Desafios personalizados', (b) => {
    const l = Custom.list();
    b.appendChild(h('div', { class: 'hint', text: 'Crie suas regras. Estes desafios não entram no ranking oficial, mas contam nas estatísticas.' }));
    if (!l.length) b.appendChild(h('div', { class: 'sub', text: 'Nenhum desafio criado.' }));
    l.forEach((c) => b.appendChild(btn(c.name + ' — ' + describeCustom(c), () => openCustomItem(c.id))));
    b.appendChild(btn('Novo desafio', () => openCustomEditor(null)));
  });
}
function openCustomItem(id) {
  const c = Custom.list().find((x) => x.id === id); if (!c) { Sheet.back(); return; }
  Sheet.push(c.name, (b) => {
    b.appendChild(h('div', { class: 'stat', text: describeCustom(c) }));
    [kv('Tentativas', c.stats.tries), kv('Vitórias', c.stats.wins), kv('Melhor pontuação', fmtNum(c.stats.bestScore)), kv('Melhor tempo', c.stats.bestMs ? fmtMsP(c.stats.bestMs) : '—')].forEach((r) => b.appendChild(r));
    b.appendChild(btn('Jogar', () => startGame(7, Custom.options(c))));
    b.appendChild(btn('Editar', () => openCustomEditor(id)));
    b.appendChild(btn('Duplicar', () => { Custom.duplicate(id); Sheet.back(); Sheet.refresh(); }));
    b.appendChild(btn('Excluir', () => Confirm.ask('Excluir o desafio "' + c.name + '"?', () => { Custom.remove(id); Sheet.back(); Sheet.refresh(); }), 'danger'));
  });
}
function openCustomEditor(id) {
  const draft = id ? JSON.parse(JSON.stringify(Custom.list().find((x) => x.id === id) || Custom.defaults())) : Custom.defaults();
  Sheet.push(id ? 'Editar desafio' : 'Novo desafio', (b) => {
    const msg = h('div', { class: 'errs' }), saveB = h('button', { class: 'btn small', text: 'Salvar' });
    const refresh = () => { const v = Custom.validate(draft); msg.textContent = v.ok ? '✓ Desafio válido' : v.errors.join(' · '); msg.className = 'errs' + (v.ok ? ' ok' : ''); saveB.disabled = !v.ok; };
    const field = (label, key, type, extra) => { const i = h('input', Object.assign({ type, class: 'txt', value: draft[key] == null ? '' : String(draft[key]) }, extra || {})); i.oninput = (ev) => { draft[key] = type === 'number' ? (ev.target.value === '' ? (key === 'timeLimit' ? null : NaN) : Number(ev.target.value)) : ev.target.value; refresh(); }; return h('div', {}, h('div', { class: 'sec', text: label }), i); };
    const choice = (label, key, opts) => { const wrap = h('div', {}, h('div', { class: 'sec', text: label })); const row = h('div', { class: 'row wrap' }); const paint = () => { clearEl(row); opts.forEach(([v, n]) => row.appendChild(btn(n + (draft[key] === v ? ' ●' : ''), () => { draft[key] = v; paint(); refresh(); }))); }; paint(); wrap.appendChild(row); return wrap; };
    const tog = (label, key) => toggleBtn(label, () => draft[key], (v) => { draft[key] = v; refresh(); });
    b.appendChild(field('Nome', 'name', 'text', { maxlength: '24' }));
    b.appendChild(choice('Objetivo', 'goalType', [['lines', 'Linhas'], ['score', 'Pontos'], ['time', 'Sobreviver'], ['none', 'Sem objetivo']]));
    b.appendChild(field('Meta (linhas ou pontos)', 'target', 'number', { min: '1' }));
    b.appendChild(field('Tempo limite em segundos (vazio = sem)', 'timeLimit', 'number', { min: '10', max: '3600' }));
    b.appendChild(field('Nível', 'level', 'number', { min: '1', max: '30' }));
    b.appendChild(tog('Nível fixo (sem subir)', 'fixedLevel')); b.appendChild(tog('Sem Hold', 'noHold')); b.appendChild(tog('Sem sombra (ghost)', 'noGhost'));
    b.appendChild(tog('Limpar tabuleiro ao topar (sem game over)', 'reset')); b.appendChild(tog('Mesmas peças sempre (semente fixa)', 'fixedSeed'));
    b.appendChild(msg); b.appendChild(saveB);
    saveB.onclick = () => { const r = Custom.save(draft); if (r.ok) { Sheet.back(); Sheet.refresh(); } else { msg.textContent = r.errors.join(' · '); msg.className = 'errs'; } };
    refresh();
  });
}
Modes.add(40, 'Desafio personalizado', openCustomList, 'custom');
Store.register('custom');
