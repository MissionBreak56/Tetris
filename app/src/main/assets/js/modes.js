'use strict';
/* Registro das telas de modo abertas pelos botões da tela inicial (Modes.openFromHome). Zen e Sprint iniciam direto pelos botões. */
const Modes = {
  list: [],
  add(order, label, open, key) { this.list.push({ order, label, open, key }); },
  /** Abre a tela de um modo a partir da tela inicial (a folha volta para a tela inicial ao fechar). */
  openFromHome(key) { const m = this.list.find((x) => x.key === key); if (!m) return false; Sheet.stack = []; hide('menu'); show('sheet'); m.open(); return true; },
};
const Prefs = {
  zenLevel() { return Math.min(15, Math.max(1, Math.round(num(parseFloat(Store.get('zenLevel')), 1)))); },
  setZenLevel(v) { Store.set('zenLevel', Math.min(15, Math.max(1, Math.round(v)))); },
};
