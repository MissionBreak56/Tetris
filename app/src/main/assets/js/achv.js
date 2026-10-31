'use strict';
/* Conquistas — progresso derivado das estatísticas (sem duplicar dados); só o instante de desbloqueio é guardado. */
const Achv = {
  defs: [
    { id: 'first_game', name: 'Primeira partida', desc: 'Termine uma partida', goal: 1, val: (s) => s.all.games },
    { id: 'first_tetris', name: 'Primeiro Tetris', desc: 'Limpe 4 linhas de uma vez', goal: 1, val: (s) => s.all.tetrises },
    { id: 'first_tspin', name: 'Primeiro T-Spin', desc: 'Faça um T-Spin', goal: 1, val: (s) => s.all.tspins },
    { id: 'lines_100', name: '100 linhas', desc: 'Elimine 100 linhas no total', goal: 100, val: (s) => s.all.lines },
    { id: 'lines_1000', name: '1.000 linhas', desc: 'Elimine 1.000 linhas no total', goal: 1000, val: (s) => s.all.lines },
    { id: 'lines_5000', name: '5.000 linhas', desc: 'Elimine 5.000 linhas no total', goal: 5000, val: (s) => s.all.lines },
    { id: 'level_5', name: 'Nível 5', desc: 'Alcance o nível 5', goal: 5, val: (s) => s.all.bestLevel },
    { id: 'level_10', name: 'Nível 10', desc: 'Alcance o nível 10', goal: 10, val: (s) => s.all.bestLevel },
    { id: 'level_20', name: 'Nível 20', desc: 'Alcance o nível 20', goal: 20, val: (s) => s.all.bestLevel },
    { id: 'combo_4', name: 'Combo 4', desc: 'Limpe linhas em 4 peças seguidas', goal: 4, val: (s) => s.all.bestCombo },
    { id: 'combo_8', name: 'Combo 8', desc: 'Limpe linhas em 8 peças seguidas', goal: 8, val: (s) => s.all.bestCombo },
    { id: 'perfect', name: 'Perfect Clear', desc: 'Esvazie o tabuleiro inteiro', goal: 1, val: (s) => s.all.perfect },
    { id: 'score_10k', name: '10.000 pontos', desc: 'Faça 10.000 pontos em uma partida', goal: 10000, val: (s) => s.all.bestScore },
    { id: 'score_100k', name: '100.000 pontos', desc: 'Faça 100.000 pontos em uma partida', goal: 100000, val: (s) => s.all.bestScore },
    { id: 'sprint', name: 'Sprint concluído', desc: 'Complete um Sprint de 40 linhas', goal: 1, val: (s) => (s.modes[5] ? s.modes[5].wins : 0) },
  ],
  load() { const d = Store.getJSON('achv', {}); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; },
  progress(stats) {
    const un = this.load();
    return this.defs.map((d) => ({ id: d.id, name: d.name, desc: d.desc, goal: d.goal, value: Math.min(d.goal, Math.max(0, num(d.val(stats)))), at: un[d.id] || 0 }));
  },
  /** Desbloqueia o que atingiu a meta e ainda não estava salvo. Devolve só os recém-desbloqueados. */
  check(stats) {
    const un = this.load(); const fresh = [];
    this.defs.forEach((d) => {
      if (!un[d.id] && num(d.val(stats)) >= d.goal) { un[d.id] = Date.now(); fresh.push({ id: d.id, name: d.name }); }
    });
    if (fresh.length) Store.setJSON('achv', un);
    return fresh;
  },
};
function openAchievements() {
  Sheet.push('Conquistas', (b) => {
    const list = Achv.progress(StatsMgr.load());
    b.appendChild(kv('Desbloqueadas', list.filter((a) => a.at).length + ' / ' + list.length));
    list.forEach((a) => {
      b.appendChild(h('div', { class: 'achv' + (a.at ? ' done' : '') },
        h('div', { class: 'kv' }, h('span', { text: (a.at ? '🏆 ' : '🔒 ') + a.name }), h('b', { text: a.at ? fmtDate(a.at) : fmtNum(a.value) + ' / ' + fmtNum(a.goal) })),
        h('div', { class: 'hint', text: a.desc }),
        h('div', { class: 'bar' }, h('i', { style: 'width:' + Math.round(100 * a.value / a.goal) + '%' }))));
    });
  });
}
Hub.add(40, 'Conquistas', openAchievements);
