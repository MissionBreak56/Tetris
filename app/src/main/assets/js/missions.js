'use strict';
/* Recompensas (estrelas, idempotentes por id) e missões progressivas derivadas das estatísticas. */
const Rewards = {
  load() { const d = Store.getJSON('rewards', {}); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; },
  /** Concede n estrelas pela razão `id`. Só concede uma vez por id. Retorna true se concedeu agora. */
  grant(id, n) { const d = this.load(); if (d[id]) return false; d[id] = { n: Math.max(0, Math.round(num(n))), t: Date.now() }; Store.setJSON('rewards', d); return true; },
  has(id) { return !!this.load()[id]; },
  stars() { const d = this.load(); return Object.keys(d).reduce((a, k) => a + num(d[k] && d[k].n), 0); },
};
const Missions = {
  defs: [
    { id: 'm_lines_100', name: 'Aprendiz das linhas', desc: 'Elimine 100 linhas', goal: 100, reward: 1, val: (s) => s.all.lines },
    { id: 'm_lines_500', name: 'Faxineiro', desc: 'Elimine 500 linhas', goal: 500, reward: 2, val: (s) => s.all.lines },
    { id: 'm_lines_2000', name: 'Demolidor', desc: 'Elimine 2.000 linhas', goal: 2000, reward: 3, val: (s) => s.all.lines },
    { id: 'm_tetris_5', name: 'Caça-Tetris', desc: 'Faça 5 Tetrises', goal: 5, reward: 1, val: (s) => s.all.tetrises },
    { id: 'm_tetris_25', name: 'Mestre Tetris', desc: 'Faça 25 Tetrises', goal: 25, reward: 2, val: (s) => s.all.tetrises },
    { id: 'm_tspin_5', name: 'Giro certeiro', desc: 'Faça 5 T-Spins', goal: 5, reward: 1, val: (s) => s.all.tspins },
    { id: 'm_tspin_25', name: 'Giro mestre', desc: 'Faça 25 T-Spins', goal: 25, reward: 2, val: (s) => s.all.tspins },
    { id: 'm_games_10', name: 'Pegando o ritmo', desc: 'Jogue 10 partidas', goal: 10, reward: 1, val: (s) => s.all.games },
    { id: 'm_games_50', name: 'Veterano', desc: 'Jogue 50 partidas', goal: 50, reward: 2, val: (s) => s.all.games },
    { id: 'm_level_10', name: 'Velocidade 10', desc: 'Alcance o nível 10', goal: 10, reward: 2, val: (s) => s.all.bestLevel },
    { id: 'm_combo_5', name: 'Sequência', desc: 'Faça um combo de 5', goal: 5, reward: 1, val: (s) => s.all.bestCombo },
    { id: 'm_perfect_1', name: 'Tabuleiro limpo', desc: 'Faça um Perfect Clear', goal: 1, reward: 3, val: (s) => s.all.perfect },
    { id: 'm_time_1h', name: 'Uma hora de jogo', desc: 'Jogue por 1 hora no total', goal: 3600000, reward: 2, val: (s) => s.all.playMs, fmt: fmtMs },
    { id: 'm_sprint_1', name: 'Corredor', desc: 'Conclua um Sprint 40', goal: 1, reward: 2, val: (s) => (s.modes[5] ? s.modes[5].wins : 0) },
    { id: 'm_daily_1', name: 'Desafiante', desc: 'Conclua um desafio diário', goal: 1, reward: 1, val: () => Daily.count() },
    { id: 'm_daily_7', name: 'Semana de desafios', desc: 'Conclua 7 desafios diários', goal: 7, reward: 3, val: () => Daily.count() },
  ],
  progress(stats) {
    return this.defs.map((d) => { const v = Math.min(d.goal, Math.max(0, num(d.val(stats)))); return { id: d.id, name: d.name, desc: d.desc, goal: d.goal, value: v, done: v >= d.goal, claimed: Rewards.has(d.id), reward: d.reward, fmt: d.fmt }; });
  },
  doneIds(stats) { return this.progress(stats).filter((m) => m.done).map((m) => m.id); },
  nameOf(id) { const d = this.defs.find((x) => x.id === id); return d ? d.name : id; },
  claim(id) { const m = this.progress(StatsMgr.load()).find((x) => x.id === id); return !!(m && m.done && Rewards.grant(id, m.reward)); },
};
function openMissions() {
  Sheet.push('Missões', (b) => {
    const list = Missions.progress(StatsMgr.load());
    b.appendChild(kv('Estrelas ⭐', Rewards.stars()));
    list.forEach((m) => {
      const f = m.fmt || fmtNum;
      const row = h('div', { class: 'achv' + (m.done ? ' done' : '') },
        h('div', { class: 'kv' }, h('span', { text: (m.claimed ? '✅ ' : m.done ? '🎯 ' : '⬜ ') + m.name }), h('b', { text: f(m.value) + ' / ' + f(m.goal) })),
        h('div', { class: 'hint', text: m.desc + ' · recompensa: ' + m.reward + ' ⭐' }),
        h('div', { class: 'bar' }, h('i', { style: 'width:' + Math.round(100 * m.value / m.goal) + '%' })));
      if (m.done && !m.claimed) row.appendChild(btn('Resgatar ' + m.reward + ' ⭐', () => { Missions.claim(m.id); Sheet.refresh(); }));
      b.appendChild(row);
    });
  });
}
Hub.add(50, 'Missões', openMissions);
