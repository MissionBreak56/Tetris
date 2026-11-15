'use strict';
/* Perfis locais. O perfil p1 usa as chaves antigas ('tetris_*'): os dados existentes viram o primeiro perfil sem migração/perda.
   Outros perfis usam 'tetris_<id>_*'. Estatísticas, recordes, conquistas, configurações, temas etc. ficam isolados por perfil. */
/** Avatares (emoji) dos perfis. */
const AVATARS = ['🙂', '😎', '🤖', '👾', '🦊', '🐱', '🐼', '🦄', '🚀', '⚡', '🔥', '🌟', '🎮', '🧩', '🐲', '🍕'];
const Profile = {
  MAX: 5, state: null, onSwitch: null,
  /* PIN opcional (4 dígitos), guardado só como hash (fnv de id+PIN). 5 erros = espera de 30 s. Proteção local simples (não é criptografia). */
  fails: {}, lockUntil: {}, now: () => Date.now(), MAX_FAILS: 5, LOCK_MS: 30000,
  prefixFor(id) { return id === 'p1' ? 'tetris_' : 'tetris_' + id + '_'; },
  cleanName(n) { return String(n == null ? '' : n).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16); },
  /** Valida/normaliza o estado salvo (puro). Sempre devolve um estado utilizável. */
  parse(d) {
    let list = d && Array.isArray(d.list) ? d.list.filter((p) => p && /^p\d+$/.test(p.id) && this.cleanName(p.name)).map((p) => { const o = { id: p.id, name: this.cleanName(p.name) }; if (Number.isInteger(p.av) && p.av >= 0 && p.av < AVATARS.length) o.av = p.av; if (typeof p.pin === 'string' && /^[0-9a-f]{1,8}$/.test(p.pin)) o.pin = p.pin; return o; }) : [];
    const seen = new Set(); list = list.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))).slice(0, this.MAX);
    if (!list.length) list = [{ id: 'p1', name: 'Jogador 1' }];
    const maxId = list.reduce((m, p) => Math.max(m, parseInt(p.id.slice(1), 10)), 0);
    return { list, current: d && list.some((p) => p.id === d.current) ? d.current : list[0].id, next: Math.max(num(d && d.next, 0), maxId + 1) };
  },
  load() {
    this.state = this.parse(Store.ggetJSON('profiles', null));
    Store.prefix = this.prefixFor(this.state.current);
    return this.state;
  },
  save() { Store.gsetJSON('profiles', this.state); },
  avatarIdx(p) { return Number.isInteger(p.av) ? p.av : (parseInt(String(p.id).slice(1), 10) - 1 + AVATARS.length) % AVATARS.length; },
  avatar(p) { return AVATARS[this.avatarIdx(p || this.cur())]; },
  /** Próximo avatar ainda não usado (para perfil novo). */
  nextAvatar() { const used = new Set(this.state.list.map((p) => this.avatarIdx(p))); for (let i = 0; i < AVATARS.length; i++) if (!used.has(i)) return i; return 0; },
  setAvatar(id, i) { const p = this.state.list.find((x) => x.id === id); if (!p || !Number.isInteger(i) || i < 0 || i >= AVATARS.length) return false; p.av = i; this.save(); return true; },
  hasPin(p) { return !!(p && p.pin); },
  validPin(pin) { return /^\d{4}$/.test(String(pin)); },
  hashPin(id, pin) { return fnv('pin|' + id + '|' + pin); },
  setPin(id, pin) {
    const p = this.state.list.find((x) => x.id === id); if (!p) return { ok: false, error: 'Perfil não encontrado' };
    if (pin == null) delete p.pin; else { if (!this.validPin(pin)) return { ok: false, error: 'O PIN tem 4 dígitos' }; p.pin = this.hashPin(id, String(pin)); }
    this.fails[id] = 0; delete this.lockUntil[id]; this.save(); return { ok: true };
  },
  /** Confere o PIN (perfil sem PIN: sempre ok). Depois de MAX_FAILS erros seguidos bloqueia por LOCK_MS. */
  tryPin(id, pin) {
    const p = this.state.list.find((x) => x.id === id); if (!p || !p.pin) return { ok: true };
    const t = this.now(); if ((this.lockUntil[id] || 0) > t) return { ok: false, wait: true, error: 'Muitas tentativas. Aguarde ' + Math.ceil((this.lockUntil[id] - t) / 1000) + ' s' };
    if (this.hashPin(id, String(pin)) === p.pin) { this.fails[id] = 0; return { ok: true }; }
    this.fails[id] = (this.fails[id] || 0) + 1;
    if (this.fails[id] >= this.MAX_FAILS) { this.fails[id] = 0; this.lockUntil[id] = t + this.LOCK_MS; return { ok: false, wait: true, error: 'PIN errado. Aguarde ' + Math.round(this.LOCK_MS / 1000) + ' s' }; }
    return { ok: false, error: 'PIN errado (' + (this.MAX_FAILS - this.fails[id]) + ' tentativas restantes)' };
  },
  /** "Esqueci o PIN": apaga TODOS os dados do perfil (recordes, conquistas, temas…) e remove o PIN; mantém nome e avatar. */
  resetProfile(id) {
    const p = this.state.list.find((x) => x.id === id); if (!p) return false;
    const pre = this.prefixFor(id); if (typeof Ranking !== 'undefined') Ranking.removeProfile(id);
    Store.KEYS.forEach((k) => { try { localStorage.removeItem(pre + k); } catch (e) {} });
    delete p.pin; this.fails[id] = 0; delete this.lockUntil[id]; this.save(); if (id === this.state.current && this.onSwitch) this.onSwitch(); return true;
  },
  list() { return this.state.list; },
  cur() { return this.state.list.find((p) => p.id === this.state.current); },
  checkName(n, exceptId) {
    const name = this.cleanName(n);
    if (!name) return { ok: false, error: 'Digite um nome' };
    if (this.state.list.some((p) => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: 'Já existe um perfil com esse nome' };
    return { ok: true, name };
  },
  create(n) {
    if (this.state.list.length >= this.MAX) return { ok: false, error: 'Limite de ' + this.MAX + ' perfis' };
    const c = this.checkName(n); if (!c.ok) return c;
    const id = 'p' + this.state.next++; this.state.list.push({ id, name: c.name }); this.save();
    return { ok: true, id };
  },
  rename(id, n) { const c = this.checkName(n, id); if (!c.ok) return c; const p = this.state.list.find((x) => x.id === id); if (!p) return { ok: false, error: 'Perfil não encontrado' }; p.name = c.name; this.save(); return { ok: true }; },
  switchTo(id) {
    if (!this.state.list.some((p) => p.id === id)) return false;
    this.state.current = id; Store.prefix = this.prefixFor(id); this.save();
    if (this.onSwitch) this.onSwitch();
    return true;
  },
  /** Exclui o perfil e TODOS os seus dados. Não permite excluir o último perfil. */
  remove(id) {
    if (this.state.list.length <= 1 || !this.state.list.some((p) => p.id === id)) return false;
    const pre = this.prefixFor(id);
    if (typeof Ranking !== 'undefined') Ranking.removeProfile(id);
    Store.KEYS.forEach((k) => { try { localStorage.removeItem(pre + k); } catch (e) {} });
    this.state.list = this.state.list.filter((p) => p.id !== id);
    if (this.state.current === id) { this.state.current = this.state.list[0].id; Store.prefix = this.prefixFor(this.state.current); this.save(); if (this.onSwitch) this.onSwitch(); } else this.save();
    return true;
  },
};
Profile.load();
function openProfiles() {
  Sheet.push('Perfis', (b) => {
    Profile.list().forEach((p) => {
      const cur = p.id === Profile.state.current;
      const row = h('div', { class: 'skinrow' + (cur ? ' sel' : '') }, h('div', { class: 'kv' }, h('span', { text: Profile.avatar(p) + ' ' + p.name + (cur ? ' ● (ativo)' : '') + (Profile.hasPin(p) ? ' 🔒' : '') })));
      const r = h('div', { class: 'row wrap' });
      // perfil com PIN: trocar/editar/excluir pedem o PIN (o perfil ativo já está desbloqueado, só excluir/editar o PIN pede de novo)
      const gate = (fn) => () => { if (Profile.hasPin(p)) askPin('PIN de ' + p.name, (pin) => { const t = Profile.tryPin(p.id, pin); return t.ok ? null : t.error; }, fn); else fn(); };
      if (!cur) r.appendChild(btn('Usar', gate(() => { Profile.switchTo(p.id); Sheet.refresh(); })));
      r.appendChild(btn('Editar', cur && !Profile.hasPin(p) ? () => openProfileName(p.id) : gate(() => openProfileName(p.id))));
      if (Profile.list().length > 1) r.appendChild(btn('Excluir', gate(() => Confirm.ask('Excluir o perfil "' + p.name + '" e TODOS os seus dados (estatísticas, recordes, conquistas, temas)? Não pode ser desfeito.', () => { Profile.remove(p.id); Sheet.refresh(); }))));
      row.appendChild(r); b.appendChild(row);
    });
    if (Profile.list().length < Profile.MAX) b.appendChild(btn('Novo perfil', () => openProfileName(null)));
  });
}
/** Novo perfil / editar: nome, avatar e PIN opcional. */
function openProfileName(id) {
  Sheet.push(id ? 'Editar perfil' : 'Novo perfil', (b) => {
    const p = id ? Profile.state.list.find((x) => x.id === id) : null;
    let av = p ? Profile.avatarIdx(p) : Profile.nextAvatar();
    const inp = h('input', { type: 'text', maxlength: '16', class: 'txt', placeholder: 'Nome do perfil', value: p ? p.name : '' });
    const out = h('div', { class: 'errs' });
    b.appendChild(inp); b.appendChild(sec('AVATAR'));
    const grid = h('div', { class: 'avgrid' });
    const mark = () => grid.children.forEach((e, i) => { e.className = 'btn small' + (i === av ? ' sel' : ''); });
    AVATARS.forEach((a, i) => grid.appendChild(h('button', { class: 'btn small' + (i === av ? ' sel' : ''), text: a, onclick: () => { av = i; mark(); } })));
    b.appendChild(grid); b.appendChild(out);
    if (p) {
      b.appendChild(sec('PIN (opcional, 4 dígitos)'));
      const setPin = () => askPin('Novo PIN', () => null, (p1) => askPin('Repita o PIN', (p2) => (p2 === p1 ? null : 'Os PINs são diferentes'), () => { Profile.setPin(id, p1); Sheet.refresh(); }));
      if (Profile.hasPin(p)) { b.appendChild(btn('Alterar PIN', setPin)); b.appendChild(btn('Remover PIN', () => { Profile.setPin(id, null); Sheet.refresh(); }, 'danger')); }
      else b.appendChild(btn('Definir PIN', setPin));
      b.appendChild(h('div', { class: 'hint', text: 'O PIN protege trocar, editar e excluir este perfil e é pedido ao abrir o app. É uma proteção local simples, não uma criptografia.' }));
    }
    b.appendChild(btn('Salvar', () => {
      const r = id ? Profile.rename(id, inp.value) : Profile.create(inp.value);
      if (r.ok) { Profile.setAvatar(id || r.id, av); if (!id) Profile.switchTo(r.id); Sheet.back(); Sheet.refresh(); } else out.textContent = r.error;
    }));
  });
}
Hub.add(70, 'Perfis', openProfiles, 'data');
