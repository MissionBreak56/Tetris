'use strict';
/* Conquistas — progresso derivado das estatísticas (sem duplicar dados); só o instante de desbloqueio é guardado.
   As antigas "missões" foram mescladas aqui: algumas conquistas dão estrelas (reward), concedidas sozinhas ao desbloquear (idempotente por rid).
   rid = id usado em Rewards; nas que vieram das missões é o id antigo (m_*), então estrelas já resgatadas nunca são concedidas de novo. */
const Achv = {
  defs: [
    { id: 'first_game', name: 'Primeira partida', desc: 'Termine uma partida', goal: 1, val: (s) => s.all.games },
    { id: 'games_10', name: 'Pegando o ritmo', desc: 'Jogue 10 partidas', goal: 10, reward: 1, rid: 'm_games_10', val: (s) => s.all.games },
    { id: 'games_50', name: 'Veterano', desc: 'Jogue 50 partidas', goal: 50, reward: 2, rid: 'm_games_50', val: (s) => s.all.games },
    { id: 'time_1h', name: 'Uma hora de jogo', desc: 'Jogue por 1 hora no total', goal: 3600000, reward: 2, rid: 'm_time_1h', val: (s) => s.all.playMs, fmt: fmtMs },
    { id: 'first_tetris', name: 'Primeiro Tetris', desc: 'Limpe 4 linhas de uma vez', goal: 1, val: (s) => s.all.tetrises },
    { id: 'tetris_5', name: 'Caça-Tetris', desc: 'Faça 5 Tetrises', goal: 5, reward: 1, rid: 'm_tetris_5', val: (s) => s.all.tetrises },
    { id: 'tetris_25', name: 'Mestre Tetris', desc: 'Faça 25 Tetrises', goal: 25, reward: 2, rid: 'm_tetris_25', val: (s) => s.all.tetrises },
    { id: 'first_tspin', name: 'Primeiro T-Spin', desc: 'Faça um T-Spin', goal: 1, val: (s) => s.all.tspins },
    { id: 'tspin_5', name: 'Giro certeiro', desc: 'Faça 5 T-Spins', goal: 5, reward: 1, rid: 'm_tspin_5', val: (s) => s.all.tspins },
    { id: 'tspin_25', name: 'Giro mestre', desc: 'Faça 25 T-Spins', goal: 25, reward: 2, rid: 'm_tspin_25', val: (s) => s.all.tspins },
    { id: 'lines_100', name: '100 linhas', desc: 'Elimine 100 linhas no total', goal: 100, reward: 1, rid: 'm_lines_100', val: (s) => s.all.lines },
    { id: 'lines_500', name: 'Faxineiro', desc: 'Elimine 500 linhas no total', goal: 500, reward: 2, rid: 'm_lines_500', val: (s) => s.all.lines },
    { id: 'lines_1000', name: '1.000 linhas', desc: 'Elimine 1.000 linhas no total', goal: 1000, val: (s) => s.all.lines },
    { id: 'lines_2000', name: 'Demolidor', desc: 'Elimine 2.000 linhas no total', goal: 2000, reward: 3, rid: 'm_lines_2000', val: (s) => s.all.lines },
    { id: 'lines_5000', name: '5.000 linhas', desc: 'Elimine 5.000 linhas no total', goal: 5000, val: (s) => s.all.lines },
    { id: 'level_5', name: 'Nível 5', desc: 'Alcance o nível 5', goal: 5, val: (s) => s.all.bestLevel },
    { id: 'level_10', name: 'Nível 10', desc: 'Alcance o nível 10', goal: 10, reward: 2, rid: 'm_level_10', val: (s) => s.all.bestLevel },
    { id: 'level_20', name: 'Nível 20', desc: 'Alcance o nível 20', goal: 20, val: (s) => s.all.bestLevel },
    { id: 'combo_4', name: 'Combo 4', desc: 'Limpe linhas em 4 peças seguidas', goal: 4, val: (s) => s.all.bestCombo },
    { id: 'combo_5', name: 'Sequência', desc: 'Faça um combo de 5', goal: 5, reward: 1, rid: 'm_combo_5', val: (s) => s.all.bestCombo },
    { id: 'combo_8', name: 'Combo 8', desc: 'Limpe linhas em 8 peças seguidas', goal: 8, val: (s) => s.all.bestCombo },
    { id: 'perfect', name: 'Perfect Clear', desc: 'Esvazie o tabuleiro inteiro', goal: 1, reward: 3, rid: 'm_perfect_1', val: (s) => s.all.perfect },
    { id: 'score_10k', name: '10.000 pontos', desc: 'Faça 10.000 pontos em uma partida', goal: 10000, val: (s) => s.all.bestScore },
    { id: 'score_100k', name: '100.000 pontos', desc: 'Faça 100.000 pontos em uma partida', goal: 100000, val: (s) => s.all.bestScore },
    { id: 'sprint', name: 'Sprint concluído', desc: 'Complete um Sprint de 40 linhas', goal: 1, reward: 2, rid: 'm_sprint_1', val: (s) => (s.modes[5] ? s.modes[5].wins : 0) },
    { id: 'daily_1', name: 'Desafiante', desc: 'Conclua um desafio diário', goal: 1, reward: 1, rid: 'm_daily_1', val: () => Daily.count() },
    { id: 'daily_7', name: 'Semana de desafios', desc: 'Conclua 7 desafios diários', goal: 7, reward: 3, rid: 'm_daily_7', val: () => Daily.count() },
    { id: 'versus_win', name: 'Vencedor do Versus', desc: 'Vença uma partida Versus contra a IA', goal: 1, val: (s) => (s.modes[8] ? s.modes[8].wins : 0) },
    { id: 'tourney_win', name: 'Campeão de torneio', desc: 'Vença um torneio como jogador humano', goal: 1, val: () => Tourney.wins() },
    { id: 'online_win', name: 'Vencedor online', desc: 'Vença uma partida online em rede local', goal: 1, val: (s) => (s.modes[10] ? s.modes[10].wins : 0) },
  ],
  load() { const d = Store.getJSON('achv', {}); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; },
  progress(stats) {
    const un = this.load();
    return this.defs.map((d) => ({ id: d.id, name: d.name, desc: d.desc, goal: d.goal, value: Math.min(d.goal, Math.max(0, num(d.val(stats)))), at: un[d.id] || 0, reward: d.reward || 0, fmt: d.fmt }));
  },
  /** Desbloqueia o que atingiu a meta e ainda não estava salvo e concede as estrelas (uma vez por rid; também acerta recompensas pendentes de conquistas já desbloqueadas).
      Devolve só os recém-desbloqueados, com `reward` = estrelas concedidas agora (0 se já tinham sido resgatadas antes). */
  check(stats) {
    const un = this.load(); const fresh = []; let changed = false;
    this.defs.forEach((d) => {
      const rid = d.rid || 'a:' + d.id;
      if (!un[d.id] && num(d.val(stats)) >= d.goal) { un[d.id] = Date.now(); changed = true; fresh.push({ id: d.id, name: d.name, reward: d.reward && Rewards.grant(rid, d.reward) ? d.reward : 0 }); }
      else if (un[d.id] && d.reward) Rewards.grant(rid, d.reward);
    });
    if (changed) Store.setJSON('achv', un);
    return fresh;
  },
};
function openAchievements() {
  Sheet.push('Conquistas', (b) => {
    const st = StatsMgr.load(); Achv.check(st);
    const list = Achv.progress(st), done = list.filter((a) => a.at), todo = list.filter((a) => !a.at);
    b.appendChild(kv('Desbloqueadas', done.length + ' / ' + list.length));
    b.appendChild(kv('Estrelas ⭐', Rewards.stars()));
    const row = (a) => {
      const f = a.fmt || fmtNum, extra = a.reward ? (a.at ? ' · +' : ' · recompensa: ') + a.reward + ' ⭐' : '';
      return h('div', { class: 'achv' + (a.at ? ' done' : '') },
        h('div', { class: 'kv' }, h('span', { text: (a.at ? '🏆 ' : '🔒 ') + a.name }), h('b', { text: a.at ? fmtDate(a.at) : f(a.value) + ' / ' + f(a.goal) })),
        h('div', { class: 'hint', text: a.desc + extra }),
        h('div', { class: 'bar' }, h('i', { style: 'width:' + Math.round(100 * a.value / a.goal) + '%' })));
    };
    if (todo.length) { b.appendChild(sec('EM ANDAMENTO')); todo.sort((x, y) => y.value / y.goal - x.value / x.goal).forEach((a) => b.appendChild(row(a))); }
    if (done.length) { b.appendChild(sec('CONCLUÍDAS')); done.sort((x, y) => y.at - x.at).forEach((a) => b.appendChild(row(a))); }
  });
}
Hub.add(40, 'Conquistas', openAchievements, 'progress');
