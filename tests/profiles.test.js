'use strict';
// Etapa 18: perfis locais com dados isolados e migração sem perda.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

const P = (h) => h.get('Profile');
function playGame(h, score) { h.sb.newGame(1); h.G().score = score; h.sb.gameOver(); }

test('perfil padrão usa as chaves antigas: dados existentes viram o primeiro perfil sem perda', () => {
  const h = load(1, { tetris_bestScore: '500', tetris_isMusic: '0', tetris_index_bg: '2', tetris_stats: JSON.stringify({ all: { games: 7 }, modes: {} }) });
  assert.equal(P(h).cur().id, 'p1'); assert.equal(h.get('Store').prefix, 'tetris_');
  assert.equal(h.get('Records').get(1), 500); assert.equal(h.get('settings').music, false); assert.equal(h.get('settings').theme, 2);
  assert.equal(plain(h.get('StatsMgr').load()).all.games, 7);
});
test('novo perfil começa vazio e os dados de cada perfil ficam isolados', () => {
  const h = load(1); playGame(h, 900);
  const r = P(h).create('Maria'); assert.equal(r.ok, true); P(h).switchTo(r.id);
  assert.equal(h.get('Records').get(1), 0); assert.equal(plain(h.get('StatsMgr').load()).all.games, 0); assert.equal(h.get('History').load().length, 0);
  playGame(h, 100);
  assert.equal(h.store['tetris_' + r.id + '_bestScore'], '100'); assert.equal(h.store.tetris_bestScore, '900');
  P(h).switchTo('p1');
  assert.equal(h.get('Records').get(1), 900); assert.equal(plain(h.get('StatsMgr').load()).all.games, 1);
});
test('configurações, tema, nível inicial e controles são por perfil', () => {
  const h = load(1); const S = h.get('settings');
  S.theme = 3; S.music = false; S.startLevel = 5; h.sb.saveSettings(); h.get('Controls').cfg.size = 0.7; h.get('Controls').save();
  const id = P(h).create('Ana').id; P(h).switchTo(id);
  assert.equal(S.theme, 0); assert.equal(S.music, true); assert.equal(S.startLevel, 1); assert.equal(h.get('Controls').cfg.size, 1);
  S.theme = 1; S.startLevel = 9; h.sb.saveSettings();
  P(h).switchTo('p1');
  assert.equal(S.theme, 3); assert.equal(S.music, false); assert.equal(S.startLevel, 5); assert.equal(h.get('Controls').cfg.size, 0.7);
  P(h).switchTo(id); assert.equal(S.theme, 1); assert.equal(S.startLevel, 9);
});
test('temas personalizados e conquistas também são isolados', () => {
  const h = load(1); const T = h.get('Theme');
  T.save(Object.assign({}, plain(T.blank()), { name: 'Meu' }));
  const id = P(h).create('Bia').id; P(h).switchTo(id);
  assert.equal(T.customs().length, 0); assert.deepEqual(plain(h.get('Achv').load()), {});
  P(h).switchTo('p1'); assert.equal(T.customs().length, 1);
});
test('perfil ativo persiste ao reabrir o app', () => {
  const h = load(1); const id = P(h).create('Caio').id; P(h).switchTo(id); playGame(h, 42);
  const h2 = load(2, h.store);
  assert.equal(P(h2).cur().name, 'Caio'); assert.equal(h2.get('Store').prefix, 'tetris_' + id + '_'); assert.equal(h2.get('Records').get(1), 42);
});
test('nomes: obrigatório, único (sem diferenciar maiúsculas), sanitizado e limitado a 16', () => {
  const h = load(1);
  assert.equal(P(h).create('   ').ok, false);
  assert.equal(P(h).create('jogador 1').ok, false);
  assert.equal(P(h).create('Ana').ok, true); assert.equal(P(h).create('ANA').ok, false);
  const id = P(h).create('<b>Nome   muito    comprido demais</b>').id;
  const n = P(h).list().find((p) => p.id === id).name; assert.ok(n.length <= 16 && !/[<>]/.test(n) && !/ {2}/.test(n));
  assert.equal(P(h).rename(id, 'Ana').ok, false); assert.equal(P(h).rename(id, 'Novo').ok, true); assert.equal(P(h).rename('p99', 'x').ok, false);
  assert.equal(P(h).rename('p1', 'Jogador 1').ok, true, 'manter o próprio nome é permitido');
});
test('limite de 5 perfis', () => {
  const h = load(1); for (let i = 0; i < 4; i++) assert.equal(P(h).create('P' + i).ok, true);
  assert.equal(P(h).create('Extra').ok, false); assert.equal(P(h).list().length, 5);
});
test('excluir perfil apaga todos os seus dados e preserva os outros; ids não são reutilizados', () => {
  const h = load(1); playGame(h, 700);
  const a = P(h).create('A').id; P(h).switchTo(a); playGame(h, 50); h.sb.saveSettings();
  assert.ok(Object.keys(h.store).some((k) => k.startsWith('tetris_' + a + '_')));
  assert.equal(P(h).remove(a), true);
  assert.equal(Object.keys(h.store).filter((k) => k.startsWith('tetris_' + a + '_')).length, 0);
  assert.equal(P(h).cur().id, 'p1'); assert.equal(h.get('Records').get(1), 700);
  assert.equal(P(h).create('B').id, 'p3');
});
test('não permite excluir o último perfil; excluir o p1 apaga os dados legados e mantém outro ativo', () => {
  const h = load(1); playGame(h, 10);
  assert.equal(P(h).remove('p1'), false);
  const b = P(h).create('B').id; assert.equal(P(h).remove('p1'), true);
  assert.equal(P(h).cur().id, b); assert.equal(h.store.tetris_bestScore, undefined); assert.equal(h.store.tetris_stats, undefined);
  assert.equal(P(h).remove(b), false);
});
test('lista de perfis corrompida volta ao padrão sem perder os dados do p1', () => {
  for (const bad of ['{{', '{"list":[]}', '{"list":[{"id":"x","name":"a"}],"current":"zz"}', '123']) {
    const h = load(1, { tetris__profiles: bad, tetris_bestScore: '33' });
    assert.equal(P(h).cur().id, 'p1', bad); assert.equal(h.get('Records').get(1), 33);
  }
});
test('telas de perfis abrem e a tela inicial mostra o nome', () => {
  const h = load(1); P(h).create('Dani');
  assert.doesNotThrow(() => { h.sb.openProfiles(); h.sb.openProfileName(null); h.sb.openProfileName('p1'); h.sb.render(); });
});
