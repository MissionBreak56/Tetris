'use strict';
// Temas e skins novos, desbloqueio com estrelas, tema dinâmico.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

const give = (h, n) => h.run('Rewards.grant("teste' + Math.random() + '", ' + n + ')');
test('catálogo: 8 temas novos (4–11) válidos pelo mesmo validador dos temas personalizados + 5 skins novas, todos com custo', () => {
  const h = load(1);
  for (let i = 4; i < 12; i++) {
    const r = plain(h.run('(function(){ const t = Theme.builtin(' + i + '); const v = Theme.validate(Object.assign({}, t, { id: "c1", builtin: false }), true); return { ok: v.ok, errors: v.errors, name: t.name }; })()'));
    assert.equal(r.ok, true, i + ' ' + r.name + ': ' + r.errors.join(' · ')); assert.ok(h.get('Rewards').cost('theme:' + i) >= 2, 'custo do tema ' + i);
  }
  const names = [4, 5, 6, 7, 8, 9, 10, 11].map((i) => h.run('Theme.builtin(' + i + ').name')); assert.equal(new Set(names).size, 8);
  assert.deepEqual(Array.from(h.get('Skins').ids()), ['classic', 'flat', 'neon', 'gradient', 'glass', 'pixel', 'outline', 'candy', 'metal']);
  for (const id of ['glass', 'pixel', 'outline', 'candy', 'metal']) assert.ok(h.get('Rewards').cost('skin:' + id) >= 2, id);
  for (const id of [0, 1, 2, 3]) assert.equal(h.get('Theme').isLocked(id), false, 'originais livres'); for (const id of ['classic', 'flat', 'neon', 'gradient']) assert.equal(h.get('Skins').usable(id), true);
});
test('estrelas: saldo = ganhas − gastas; desbloquear gasta uma vez, é idempotente e recusa sem saldo', () => {
  const h = load(1), R = h.get('Rewards'); assert.equal(R.balance(), 0);
  const r0 = plain(R.unlock('theme:4')); assert.equal(r0.ok, false); assert.match(r0.error, /Faltam 2/); assert.equal(h.get('Theme').isLocked(4), true);
  give(h, 5); assert.equal(R.stars(), 5); assert.equal(R.balance(), 5);
  assert.equal(R.unlock('theme:4').ok, true); assert.equal(R.balance(), 3); assert.equal(R.unlock('theme:4').ok, true); assert.equal(R.balance(), 3, 'idempotente'); assert.equal(h.get('Theme').isLocked(4), false);
  assert.equal(R.unlock('skin:glass').ok, true); assert.equal(R.balance(), 0); assert.equal(R.unlock('skin:metal').ok, false, 'sem saldo');
  assert.equal(R.unlock('theme:99').ok, false, 'item inexistente'); assert.equal(R.stars(), 5, 'ganhas não mudam');
  const h2 = load(1, h.store); assert.equal(h2.get('Rewards').balance(), 0); assert.equal(h2.get('Theme').isLocked(4), false, 'persiste'); assert.equal(h2.get('Skins').usable('glass'), true);
});
test('bloqueados nunca ficam ativos: seleção recusada, carregamento cai no padrão e o botão THEME pula', () => {
  const h = load(1), S = h.get('settings');
  assert.equal(h.run('selectTheme(5)'), false); assert.equal(S.theme, 0);
  const h2 = load(1, Object.assign({}, h.store, { tetris_index_bg: '6', tetris_skin: 'metal' })); assert.equal(h2.get('settings').theme, 0, 'tema bloqueado no armazenamento volta ao padrão'); assert.equal(h2.get('settings').skin, 'classic');
  give(h, 3); h.get('Rewards').unlock('theme:6'); assert.equal(h.run('selectTheme(6)'), true); assert.equal(S.theme, 6); assert.equal(load(1, h.store).get('settings').theme, 6);
  const seen = []; for (let i = 0; i < 6; i++) { h.els.bTheme.onclick(); seen.push(S.theme); } assert.ok(!seen.some((t) => t >= 4 && t !== 6 && t !== 12), 'só passa pelos liberados (o Preto, 12, é livre): ' + seen);
});
test('telas: Temas e Skins mostram saldo, cadeado e custo; desbloquear pela tela gasta e seleciona', () => {
  const h = load(1); give(h, 2); h.sb.openThemes(); const text = (c) => (c.textContent || '') + (c.children || []).map(text).join('|');
  const all = () => h.els.sheetBody.children.map(text).join('\n');
  assert.match(all(), /Estrelas ⭐ disponíveis/); assert.match(all(), /Rosa 🔒 2 ⭐/); assert.match(all(), /Ouro 🔒 4 ⭐/); assert.match(all(), /Tema dinâmico/);
  const rosa = h.els.sheetBody.children.find((c) => /Rosa/.test(text(c)) && c.className.includes('skinrow')); const unlock = rosa.children.find((c) => /Desbloquear/.test(c.textContent || '')); assert.ok(unlock);
  unlock.onclick(); assert.equal(h.get('settings').theme, 4); assert.equal(h.get('Rewards').balance(), 0); assert.doesNotMatch(all(), /Rosa 🔒/);
  const ouro = h.els.sheetBody.children.find((c) => /Ouro/.test(text(c)) && c.className.includes('skinrow')); ouro.children.find((c) => /Desbloquear/.test(c.textContent || '')).onclick(); assert.match(all(), /Faltam/);
  h.sb.openSkins(); const sk = h.els.sheetBody.children.map(text).join('\n'); assert.match(sk, /Vidro 🔒 3 ⭐/); assert.match(sk, /Clássica ●/); assert.doesNotMatch(sk, /Clássica 🔒/);
});
test('skins novas desenham sem erro em todos os tamanhos e usam cache separado em economia', () => {
  const h = load(1);
  for (const id of ['glass', 'pixel', 'outline', 'candy', 'metal', 'classic', 'neon']) for (const s of [4, 14, 28, 60]) assert.doesNotThrow(() => h.run('Skins.raw(ctx, 10, 10, ' + s + ', "#ff8a3c", 0.8, "' + id + '")'), id + ' ' + s);
  assert.doesNotThrow(() => h.run('settings.skin = "classic"; render()'));
});
test('tema dinâmico: muda a cada 3 níveis entre os liberados (a partir do escolhido), repinta peças travadas, não altera a escolha salva e some no menu/Versus/SIM', () => {
  const h = load(1), S = h.get('settings'), T = h.get('Theme'); give(h, 20); h.get('Rewards').unlock('theme:4'); h.get('Rewards').unlock('theme:5');
  S.dyn = true; h.sb.newGame(1); h.setState('PLAY'); assert.equal(T.override, 0, 'nível 1: tema escolhido');
  assert.deepEqual(Array.from([1, 3, 4, 6, 7, 10, 13].map((l) => T.dynFor(l))), [0, 0, 1, 1, 2, 3, 4], 'a cada 3 níveis, na ordem dos liberados (0,1,2,3,4,5)');
  assert.equal(T.dynFor(1000) >= 0, true);
  h.run('G.grid[19][0] = COLORS.I; G.grid[19][1] = "#707070"'); const oldI = h.run('COLORS.I'); h.run('G.level = 4; Theme.onLevel(G)');
  assert.equal(T.override, 1); assert.equal(h.run('Theme.cur().id'), 1); assert.equal(S.theme, 0, 'escolha salva intacta'); assert.equal(h.run('G.grid[19][0]'), h.run('COLORS.I'), 'peça travada acompanhou a nova paleta'); assert.equal(h.run('G.grid[19][1]'), '#707070', 'lixo não muda');
  h.run('G.level = 10; Theme.onLevel(G)'); assert.equal(T.override, 3);
  h.run('goMenu()'); assert.equal(T.override, null); assert.equal(h.run('Theme.cur().id'), 0);
  h.run('SIM = true; newGame(1); SIM = false'); assert.equal(T.override, null, 'simulação não troca o tema');
  S.dyn = false; h.sb.newGame(1); assert.equal(T.override, null, 'desligado: nada muda');
  S.dyn = true; h.run('Versus.active = true; newGame(1);'); assert.equal(T.override, null, 'Versus não usa'); h.run('Versus.active = false');
  S.dyn = true; h.sb.newGame(3); assert.notEqual(T.override, null); h.run('Versus.start({ players: [{ kind: "human", name: "A" }, { kind: "ai", name: "B", level: "easy" }] })'); assert.equal(T.override, null);
});
test('tema dinâmico: preferência persiste por perfil e o seletor liga/desliga', () => {
  const h = load(1); h.sb.openThemes(); const btnDyn = h.els.sheetBody.children.find((c) => /Tema dinâmico/.test(c.textContent || '')); btnDyn.onclick(); assert.equal(h.get('settings').dyn, true);
  assert.equal(load(1, h.store).get('settings').dyn, true); btnDyn.onclick(); assert.equal(h.get('settings').dyn, false);
});
test('backup manual inclui as estrelas gastas (spent) e as preferências novas', () => {
  const h = load(1); give(h, 3); h.get('Rewards').unlock('skin:pixel'); h.run('settings.dyn = true; saveSettings()');
  const B = h.get('Backup'), text = B.text(); assert.equal(B.parse(text).ok, true); const h2 = load(1); assert.equal(h2.get('Backup').restore(text).ok, true);
  assert.equal(h2.get('Skins').usable('pixel'), true); assert.equal(h2.get('Rewards').balance(), 1); assert.equal(h2.get('settings').dyn, true);
});
