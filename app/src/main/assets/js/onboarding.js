'use strict';
/* Primeiro acesso / nome padrão: pede nome de perfil e avatar. É OBRIGATÓRIO (não dá para fechar nem voltar) e o nome não pode ser o padrão.
   - Primeiro acesso: boas-vindas, nome + avatar (nenhum avatar vem marcado: é preciso escolher).
   - Jogador que já tem o nome padrão: aviso "Você deve mudar seu nome"; dados, recordes e conquistas continuam no mesmo perfil. */
const Onboarding = {
  open: false,
  enabled() { return !(typeof NO_ONBOARDING !== 'undefined' && NO_ONBOARDING); },
  /** Mostra a tela se o perfil ativo ainda tem o nome padrão; esconde caso contrário. Retorna true se está aberta. */
  check() {
    if (!this.enabled()) return false;
    if (Profile.needsName() && !(typeof Lock !== 'undefined' && Lock.active)) { this.show(); return true; }
    this.close(); return false;
  },
  close() { this.open = false; hide('onboardPanel'); },
  show() {
    const cur = Profile.cur(), legacy = Profile.hasData(cur);
    this.open = true; hide('menu'); hide('sheet'); hide('confirmBox');
    $('obTitle').textContent = legacy ? 'Escolha seu nome' : 'Bem-vindo!';
    const b = $('obBody'); clearEl(b);
    b.appendChild(legacy
      ? h('div', { class: 'errs warn', text: 'Você deve mudar seu nome. O nome padrão (' + DEFAULT_PROFILE_NAME + ') não pode mais ser usado. Seus dados, recordes e conquistas continuam todos aqui.' })
      : h('div', { class: 'hint', text: 'Escolha o nome do seu perfil e um avatar para começar a jogar.' }));
    let av = legacy ? Profile.avatarIdx(cur) : null;
    const inp = h('input', { type: 'text', maxlength: '16', class: 'txt', placeholder: 'Seu nome', autocomplete: 'off', value: '' });
    const out = h('div', { class: 'errs' }), ok = h('button', { class: 'btn', text: 'Continuar' });
    const grid = h('div', { class: 'avgrid' }), cells = [];
    AVATARS.forEach((a, i) => { const c = btn(a, () => { av = i; paint(); refresh(); }); cells.push(c); grid.appendChild(c); });
    const paint = () => cells.forEach((c, i) => { c.className = 'btn small' + (i === av ? ' sel' : ''); });
    const state = () => {
      const raw = String(inp.value == null ? '' : inp.value), name = Profile.cleanName(raw);
      if (!name) return { ok: false, msg: raw.length ? 'Digite um nome' : '' };
      const c = Profile.checkName(name, cur.id); if (!c.ok) return { ok: false, msg: c.error };
      if (av == null) return { ok: false, msg: 'Escolha um avatar' };
      return { ok: true, msg: '' };
    };
    const refresh = () => { const s = state(); out.textContent = s.msg; ok.disabled = !s.ok; };
    const submit = () => {
      const r = Profile.finishOnboarding(inp.value, av);
      if (!r.ok) { out.textContent = r.error; ok.disabled = true; return; }
      try { sfx.click(); } catch (e) {}
      this.close(); refreshMenu(); show('menu');
    };
    inp.oninput = refresh; inp.onkeydown = (e) => { if (e.key === 'Enter' && !ok.disabled) submit(); };
    ok.onclick = submit;
    b.appendChild(inp); b.appendChild(sec('AVATAR')); b.appendChild(grid); b.appendChild(out); b.appendChild(ok);
    paint(); refresh(); show('onboardPanel');
  },
};
