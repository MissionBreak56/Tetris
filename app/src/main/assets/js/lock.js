'use strict';
/* Teclado numérico de PIN (4 dígitos), pedido de PIN em folhas e tela de bloqueio ao abrir o app (perfil protegido). */
/** Monta display + teclado dentro de `parent`. onComplete(pin) devolve texto de erro (mostra e limpa) ou algo falso (ok). */
function buildPinPad(parent, onComplete) {
  let val = '';
  const dots = h('div', { class: 'pindots', text: '○○○○' }), err = h('div', { class: 'errs' });
  const upd = () => { dots.textContent = '●'.repeat(val.length) + '○'.repeat(4 - val.length); };
  const press = (d) => {
    if (val.length >= 4) return; val += d; upd();
    if (val.length === 4) { const v = val; val = ''; const e = onComplete(v); err.textContent = e ? String(e) : ''; upd(); }
  };
  const grid = h('div', { class: 'pad' });
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].forEach((k) => grid.appendChild(h('button', { class: 'btn small', text: k, onclick: () => { try { sfx.click(); } catch (x) {} if (k === 'C') { val = ''; upd(); } else if (k === '⌫') { val = val.slice(0, -1); upd(); } else press(k); } })));
  parent.appendChild(dots); parent.appendChild(grid); parent.appendChild(err);
  return { press, get value() { return val; }, error(m) { err.textContent = m; } };
}
/** Folha pedindo um PIN. verify(pin) devolve null se ok ou o texto do erro; ao acertar volta uma folha e chama done(pin). */
function askPin(title, verify, done) {
  Sheet.push(title, (b) => {
    b.appendChild(h('div', { class: 'hint', text: 'Digite os 4 dígitos.' }));
    buildPinPad(b, (pin) => { const e = verify(pin); if (e) return e; Sheet.back(); done(pin); return null; });
  });
}
/** Bloqueio ao abrir o app quando o perfil ativo tem PIN (nada abaixo é tocável até desbloquear). */
const Lock = {
  active: false, view: 'pad',
  show() { const p = Profile.cur(); if (!Profile.hasPin(p)) { this.hide(); return false; } this.active = true; this.view = 'pad'; this.render(); show('lockPanel'); return true; },
  hide() { this.active = false; hide('lockPanel'); },
  render() {
    const p = Profile.cur(), t = $('lockTitle'), b = $('lockBody'); clearEl(b);
    if (this.view === 'forgot') {
      t.textContent = 'Esqueci o PIN';
      b.appendChild(h('div', { class: 'errs', text: 'Isto APAGA todos os dados do perfil ' + p.name + ' (recordes, conquistas, estatísticas, temas) e remove o PIN. Não pode ser desfeito.' }));
      b.appendChild(btn('Apagar dados e remover o PIN', () => { Profile.resetProfile(p.id); this.hide(); }, 'danger'));
      b.appendChild(btn('Voltar', () => { this.view = 'pad'; this.render(); }));
    } else if (this.view === 'others') {
      t.textContent = 'Usar outro perfil';
      Profile.list().filter((x) => x.id !== p.id).forEach((x) => b.appendChild(btn(Profile.avatar(x) + ' ' + x.name + (Profile.hasPin(x) ? ' 🔒' : ''), () => {
        if (!Profile.hasPin(x)) { Profile.switchTo(x.id); this.hide(); return; }
        this.view = 'pad:' + x.id; this.render();
      })));
      b.appendChild(btn('Voltar', () => { this.view = 'pad'; this.render(); }));
    } else {
      const target = this.view.indexOf('pad:') === 0 ? Profile.list().find((x) => x.id === this.view.slice(4)) || p : p;
      t.textContent = '🔒 ' + Profile.avatar(target) + ' ' + target.name;
      buildPinPad(b, (pin) => { const r = Profile.tryPin(target.id, pin); if (!r.ok) return r.error; if (target.id !== Profile.state.current) Profile.switchTo(target.id); this.hide(); return null; });
      b.appendChild(btn('Esqueci o PIN', () => { this.view = 'forgot'; this.render(); }));
      if (Profile.list().length > 1) b.appendChild(btn('Usar outro perfil', () => { this.view = 'others'; this.render(); }));
    }
  },
};
