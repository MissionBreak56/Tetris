'use strict';
/* Perfis locais. O perfil p1 usa as chaves antigas ('tetris_*'): os dados existentes viram o primeiro perfil sem migração/perda.
   Outros perfis usam 'tetris_<id>_*'. Estatísticas, recordes, conquistas, configurações, temas etc. ficam isolados por perfil. */
const Profile = {
  MAX: 5, state: null, onSwitch: null,
  prefixFor(id) { return id === 'p1' ? 'tetris_' : 'tetris_' + id + '_'; },
  cleanName(n) { return String(n == null ? '' : n).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16); },
  /** Valida/normaliza o estado salvo (puro). Sempre devolve um estado utilizável. */
  parse(d) {
    let list = d && Array.isArray(d.list) ? d.list.filter((p) => p && /^p\d+$/.test(p.id) && this.cleanName(p.name)).map((p) => ({ id: p.id, name: this.cleanName(p.name) })) : [];
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
      const row = h('div', { class: 'skinrow' + (cur ? ' sel' : '') }, h('div', { class: 'kv' }, h('span', { text: p.name + (cur ? ' ● (ativo)' : '') })));
      const r = h('div', { class: 'row wrap' });
      if (!cur) r.appendChild(btn('Usar', () => { Profile.switchTo(p.id); Sheet.refresh(); }));
      r.appendChild(btn('Renomear', () => openProfileName(p.id)));
      if (Profile.list().length > 1) r.appendChild(btn('Excluir', () => Confirm.ask('Excluir o perfil "' + p.name + '" e TODOS os seus dados (estatísticas, recordes, conquistas, temas)? Não pode ser desfeito.', () => { Profile.remove(p.id); Sheet.refresh(); }), 'danger'));
      row.appendChild(r); b.appendChild(row);
    });
    if (Profile.list().length < Profile.MAX) b.appendChild(btn('Novo perfil', () => openProfileName(null)));
  });
}
function openProfileName(id) {
  Sheet.push(id ? 'Renomear perfil' : 'Novo perfil', (b) => {
    const inp = h('input', { type: 'text', maxlength: '16', class: 'txt', placeholder: 'Nome do perfil', value: id ? Profile.state.list.find((p) => p.id === id).name : '' });
    const out = h('div', { class: 'errs' });
    b.appendChild(inp); b.appendChild(out);
    b.appendChild(btn('Salvar', () => {
      const r = id ? Profile.rename(id, inp.value) : Profile.create(inp.value);
      if (r.ok) { if (!id) Profile.switchTo(r.id); Sheet.back(); Sheet.refresh(); } else out.textContent = r.error;
    }));
  });
}
Hub.add(70, 'Perfis', openProfiles);
