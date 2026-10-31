'use strict';
/* Lista de modos extras (além dos 3 botões da tela inicial). Cada módulo registra suas entradas com Modes.add. */
const Modes = { list: [], add(order, label, open) { this.list.push({ order, label, open }); } };
function openModesSheet() {
  Sheet.push('Modos', (b) => {
    Modes.list.slice().sort((a, c) => a.order - c.order).forEach((m) => b.appendChild(btn(typeof m.label === 'function' ? m.label() : m.label, m.open)));
  });
}
Hub.add(5, 'Modos de jogo', openModesSheet);
const Prefs = {
  zenLevel() { return Math.min(15, Math.max(1, Math.round(num(parseFloat(Store.get('zenLevel')), 1)))); },
  setZenLevel(v) { Store.set('zenLevel', Math.min(15, Math.max(1, Math.round(v)))); },
};
Modes.add(10, 'Zen — sem game over', () => {
  Sheet.push('Zen', (b) => {
    b.appendChild(h('div', { class: 'hint', text: 'Sem fim de jogo: se a pilha chegar ao topo, o tabuleiro é limpo e você continua. Velocidade fixa. Não entra nos recordes de modos oficiais; a sessão é salva ao sair.' }));
    b.appendChild(slider('Velocidade (nível)', 1, 15, 1, () => Prefs.zenLevel(), (v) => Prefs.setZenLevel(v), (v) => String(Math.round(v))));
    b.appendChild(btn('Jogar Zen', () => startGame(4, { zenLevel: Prefs.zenLevel() })));
  });
});
Modes.add(20, () => 'Sprint 40 — melhor: ' + (Records.get(5) ? fmtMsP(Records.get(5)) : '—'), () => startGame(5));
