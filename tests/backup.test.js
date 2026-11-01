'use strict';
// Etapa 30: backup e restauração.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

const B = (h) => h.get('Backup');
const FILL = '#fff';
function play(h, mode, score, seed) { h.sb.newGame(mode, { seed }); h.setState('PLAY'); h.G().tick = 800; h.G().ms = 30000; h.G().score = score; h.G().lines = 5; h.sb.gameOver(); }
/** Cria dados variados em 2 perfis + chaves globais. */
function rich(h) {
  const P = h.get('Profile'); play(h, 1, 1234, 1); play(h, 2, 500, 2);
  h.get('Theme').save(Object.assign({}, plain(h.get('Theme').blank()), { name: 'Meu' })); h.get('settings').theme = 2; h.get('settings').skin = 'neon'; h.get('settings').startLevel = 4; h.sb.saveSettings();
  h.get('Custom').save(Object.assign(plain(h.get('Custom').defaults()), { name: 'Desafio X' }));
  const id = P.create('Ana').id; P.switchTo(id); play(h, 1, 777, 3); h.get('Rewards').grant('x', 2); h.get('Controls').cfg.size = 0.8; h.get('Controls').save();
  h.get('Tourney').create('T', [{ name: 'Ana', kind: 'human' }, { name: 'IA', kind: 'ai', level: 'easy' }], 5);
  P.switchTo('p1'); return id;
}
const snapshot = (h) => JSON.stringify(Object.keys(h.store).filter((k) => k !== 'tetris__profiles').sort().map((k) => [k, h.store[k]]));   // a lista de perfis é derivada (estado padrão ≡ ausente)
const withSum = (b) => { const o = JSON.parse(JSON.stringify(b)); o.sum = load(1).get('fnv')(JSON.stringify(o.data)); return JSON.stringify(o); };

test('backup: cobre todos os perfis e todas as chaves registradas; tem checksum e versão', () => {
  const h = load(1); const id = rich(h); const b = plain(B(h).create());
  assert.equal(b.type, 'tetris-backup'); assert.equal(b.v, 1); assert.match(b.sum, /^[0-9a-f]+$/);
  assert.deepEqual(Object.keys(b.data.profiles).sort(), ['p1', id].sort());
  for (const k of ['stats', 'history', 'achv', 'themes', 'custom', 'index_bg', 'skin', 'startLevel']) assert.ok(b.data.profiles.p1[k] !== undefined, k);
  assert.ok(b.data.profiles[id].rewards && b.data.profiles[id].tourney && b.data.profiles[id].ctl);
  assert.ok(b.data.global.profiles && b.data.global.ranking);
});
test('ida e volta: restaurar em outro aparelho reproduz exatamente os mesmos dados e a app funciona', () => {
  const a = load(1); const id = rich(a); const text = B(a).text();
  const b = load(2, { tetris_bestScore: '99999', tetris_p9_stats: '{}' }); b.get('Profile').create('Lixo');
  const r = plain(B(b).restore(text)); assert.equal(r.ok, true, r.errors);
  assert.equal(JSON.stringify(plain(B(b).collect())), JSON.stringify(plain(B(a).collect())));
  assert.equal(b.get('Profile').list().length, 2); assert.equal(b.get('Profile').list().some((p) => p.name === 'Lixo'), false);
  assert.equal(b.get('Records').get(1), 1234); assert.equal(b.get('settings').skin, 'neon'); assert.equal(b.get('settings').startLevel, 4); assert.equal(b.get('Theme').customs().length, 1);
  b.get('Profile').switchTo(id); assert.equal(b.get('Records').get(1), 777); assert.equal(b.get('Rewards').stars(), 2); assert.equal(b.get('Tourney').load().name, 'T');
  assert.doesNotThrow(() => { b.sb.render(); b.sb.newGame(1); b.sb.gameOver(); });
});
test('restaurar substitui tudo: perfis/dados que não estão no backup somem; restaurar duas vezes dá o mesmo resultado', () => {
  const a = load(1); play(a, 1, 50, 1); const text = B(a).text();
  const b = load(2); play(b, 1, 9000, 1); const pid = b.get('Profile').create('Extra').id; b.get('Profile').switchTo(pid); play(b, 1, 5, 1);
  assert.equal(plain(B(b).restore(text)).ok, true); const once = snapshot(b);
  assert.equal(b.get('Profile').list().length, 1); assert.equal(b.get('Records').get(1), 50);
  assert.equal(Object.keys(b.store).some((k) => k.startsWith('tetris_' + pid + '_')), false);
  assert.equal(plain(B(b).restore(text)).ok, true);
  assert.equal(JSON.stringify(plain(B(b).collect())), JSON.stringify(plain(B(a).collect()))); void once;
});
test('resumo antes de restaurar: perfis, partidas, conquistas, temas e histórico', () => {
  const h = load(1); rich(h); const p = plain(B(h).parse(B(h).text()));
  assert.equal(p.ok, true); assert.equal(p.summary.profiles.length, 2);
  const r1 = p.summary.profiles.find((r) => r.id === 'p1'); assert.equal(r1.games, 2); assert.equal(r1.best, 1234); assert.equal(r1.themes, 1); assert.equal(r1.history, 2); assert.ok(r1.achv >= 1);
});
test('arquivo inválido: nada é alterado em nenhum dos casos', () => {
  const h = load(1); rich(h); const good = JSON.parse(B(h).text()); const before = snapshot(h);
  const clone = () => JSON.parse(JSON.stringify(good)); const bads = [];
  bads.push('', '   ', 'lixo', '{}', '[]', '{"type":"tetris-backup"}', 'x'.repeat(7000000));
  let o = clone(); o.type = 'outro'; bads.push(JSON.stringify(o));
  o = clone(); o.v = 2; bads.push(JSON.stringify(o));
  o = clone(); o.sum = '0'; bads.push(JSON.stringify(o));
  o = clone(); o.data.profiles.p1.bestScore = '1'; bads.push(JSON.stringify(o));                // adulterado sem refazer checksum
  o = clone(); o.data.profiles.p1.chaveNova = '1'; bads.push(withSum(o));                         // chave desconhecida
  o = clone(); o.data.profiles.p99 = { stats: '{}' }; bads.push(withSum(o));                      // perfil inexistente na lista
  o = clone(); o.data.profiles.p1.stats = '{{'; bads.push(withSum(o));                            // JSON quebrado
  o = clone(); o.data.profiles.p1.bestScore = 'a b c'; bads.push(withSum(o));                     // escalar inválido
  o = clone(); o.data.profiles.p1.history = 5; bads.push(withSum(o));                             // não é string
  o = clone(); o.data.profiles.p1.history = '"' + 'x'.repeat(3000000) + '"'; bads.push(withSum(o)); // grande demais
  o = clone(); o.data.global.extra = '1'; bads.push(withSum(o));
  o = clone(); o.data.global.profiles = '{"list":[]}'; bads.push(withSum(o));
  o = clone(); o.data.global.profiles = JSON.stringify({ list: Array.from({ length: 6 }, (_, i) => ({ id: 'p' + (i + 1), name: 'N' + i })), current: 'p1' }); bads.push(withSum(o));
  o = clone(); delete o.data.global; bads.push(withSum(o));
  for (const t of bads) { const r = plain(B(h).restore(t)); assert.equal(r.ok, false, t.slice(0, 60)); assert.equal(snapshot(h), before, 'alterou dados com: ' + t.slice(0, 60)); }
});
test('transacional: falha de gravação em qualquer ponto restaura o estado anterior (nada se perde)', () => {
  const src = load(1); rich(src); const text = B(src).text();
  const total = Object.keys(JSON.parse(text).data.profiles).reduce((n, p) => n + Object.keys(JSON.parse(text).data.profiles[p]).length, 0) + 2;
  for (const failAt of [1, 2, 5, Math.floor(total / 2), total - 1]) {
    const h = load(3); play(h, 1, 321, 4); h.get('Theme').save(Object.assign({}, plain(h.get('Theme').blank()), { name: 'Antigo' })); const before = snapshot(h);
    const orig = h.sb.localStorage.setItem; let n = 0, armed = true;
    h.sb.localStorage.setItem = (k, v) => { if (armed && ++n === failAt) throw new Error('cota excedida'); return orig(k, v); };
    const r = plain(B(h).restore(text)); armed = false;
    assert.equal(r.ok, false, 'falha em ' + failAt); assert.match(r.errors.join(), /anteriores foram mantidos/); assert.equal(snapshot(h), before, 'estado igual após falha em ' + failAt);
    assert.equal(h.get('Records').get(1), 321); assert.equal(h.get('Theme').customs().length, 1);
  }
});
test('recuperação: guarda o estado anterior e permite voltar', () => {
  const a = load(1); play(a, 1, 10, 1); const text = B(a).text();
  const b = load(2); play(b, 1, 888, 2); assert.equal(B(b).hasPrev(), false);
  assert.equal(plain(B(b).restore(text)).ok, true); assert.equal(b.get('Records').get(1), 10); assert.equal(B(b).hasPrev(), true);
  assert.equal(plain(B(b).restorePrev()).ok, true); assert.equal(b.get('Records').get(1), 888);
  assert.equal(plain(load(1).get('Backup').restorePrev()).ok, false);
});
test('backup vazio (app nova) exporta e restaura sem erro', () => {
  const a = load(1); const t = B(a).text(); const b = load(2); play(b, 1, 5, 1);
  assert.equal(plain(B(b).restore(t)).ok, true); assert.equal(b.get('Records').get(1), 0); assert.equal(b.get('Profile').cur().id, 'p1');
});
test('telas de backup abrem e exportar via Native funciona fora do Android', () => {
  const h = load(1); rich(h);
  assert.doesNotThrow(() => { h.sb.openBackup(); h.sb.openBackupImport(); });
  let ok = null; h.get('Native').saveFile('b.json', 'application/json', B(h).text(), (r) => { ok = r; }); assert.equal(typeof ok, 'boolean');
});
