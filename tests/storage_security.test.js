'use strict';
// Segurança e armazenamento: criptografia, PIN, migração, snapshots, backup .tmb e restauração.
const test = require('node:test');
const assert = require('node:assert/strict');
const nc = require('node:crypto');
const { load, plain } = require('./harness');

const mem = () => `(function(){ var s = { text: null, sync: 0, async: 0 }; window.__snap = s;
  SnapshotManager.backend = { save: function (t) { s.text = t; s.async++; return true; }, saveNow: function (t) { s.text = t; s.sync++; return true; }, load: function () { return s.text; } }; })();`;
const snapText = (h) => h.run('window.__snap.text');
const userKeys = (h) => Object.keys(h.store).filter((k) => /^tetris_/.test(k) && !/^tetris__(schema|probe|restoring|pinlock)$/.test(k)).sort();

/* ---------------- CryptoManager ---------------- */
test('CryptoManager: SHA-256, HMAC e PBKDF2 (síncrono) conferem com o Node, inclusive vetores RFC', () => {
  const h = load(1), C = h.get('CryptoManager'), hex = (u) => C.hex(u);
  for (const n of [0, 1, 55, 56, 63, 64, 65, 120, 1000, 5000]) { const m = nc.randomBytes(n); assert.equal(hex(C.sha256(m)), nc.createHash('sha256').update(m).digest('hex'), 'sha256 ' + n); }
  for (const n of [0, 5, 64, 65, 200]) { const k = nc.randomBytes(n), m = nc.randomBytes(77); assert.equal(hex(C.hmacSha256(k, m)), nc.createHmac('sha256', k).update(m).digest('hex'), 'hmac chave ' + n); }
  assert.equal(hex(C.pbkdf2Sync(C.utf8('password'), C.utf8('salt'), 1, 32)), '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
  assert.equal(hex(C.pbkdf2Sync(C.utf8('password'), C.utf8('salt'), 2, 32)), 'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43');
  assert.equal(hex(C.pbkdf2Sync(C.utf8('password'), C.utf8('salt'), 4096, 32)), 'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a');
  for (const [pw, salt, it, len] of [['1234', 'abcdefgh', 1000, 32], ['x', 'y', 3, 100], ['senha com acentuação ç', 'sal', 50, 64]]) assert.equal(hex(C.pbkdf2Sync(C.utf8(pw), C.utf8(salt), it, len)), nc.pbkdf2Sync(pw, salt, it, len, 'sha256').toString('hex'));
});
test('CryptoManager: base64/UTF-8/hex estritos, comparação em tempo constante, aleatório seguro', () => {
  const h = load(1), C = h.get('CryptoManager');
  const s = 'olá 🎮 mundo ñ ü ç'; assert.equal(C.unutf8(C.b64d(C.b64e(C.utf8(s)))), s); assert.equal(Buffer.from(C.utf8(s)).toString('utf8'), s);
  for (const n of [0, 1, 2, 3, 4, 31, 32, 33]) { const b = nc.randomBytes(n); assert.equal(C.b64e(b), b.toString('base64')); assert.equal(Buffer.from(C.b64d(b.toString('base64'))).equals(b), true); }
  for (const bad of ['abc', 'ab=c', '@@@@', 'AAAA=', 'AA=A', null, 5]) assert.equal(C.b64d(bad), null, 'base64 inválido: ' + bad);
  assert.equal(C.unhex('zz'), null); assert.equal(C.unhex('abc'), null); assert.equal(C.hex(C.unhex('00ff10')), '00ff10');
  assert.equal(C.ctEqual('abc', 'abc'), true); assert.equal(C.ctEqual('abc', 'abd'), false); assert.equal(C.ctEqual('abc', 'abcd'), false); assert.equal(C.ctEqual(C.utf8('x'), 'x'), true);
  const a = C.hex(C.randomBytes(16)), b = C.hex(C.randomBytes(16)); assert.notEqual(a, b); assert.equal(a.length, 32);
  assert.equal(C.unutf8(Uint8Array.from([0xff, 0x41, 0xc0])).includes('A'), true, 'UTF-8 inválido não lança');
});
test('CryptoManager: AES-256-GCM cifra, autentica e recusa chave/dados/cabeçalho errados', async () => {
  const h = load(1), C = h.get('CryptoManager'), key = nc.randomBytes(32), iv = nc.randomBytes(12), plainB = Buffer.from('segredo do jogo'), aad = Buffer.from('cab');
  const ct = await C.encrypt(key, iv, plainB, aad); assert.equal(ct.length, plainB.length + 16);
  assert.equal(Buffer.from(await C.decrypt(key, iv, ct, aad)).toString(), 'segredo do jogo');
  const ref = nc.createCipheriv('aes-256-gcm', key, iv); ref.setAAD(aad); const refCt = Buffer.concat([ref.update(plainB), ref.final(), ref.getAuthTag()]); assert.equal(Buffer.from(ct).equals(refCt), true, 'compatível com o AES-GCM padrão');
  const bad = Buffer.from(ct); bad[0] ^= 1;
  await assert.rejects(() => C.decrypt(key, iv, bad, aad)); await assert.rejects(() => C.decrypt(nc.randomBytes(32), iv, ct, aad)); await assert.rejects(() => C.decrypt(key, iv, ct, Buffer.from('outro')));
  await assert.rejects(() => C.decrypt(key, nc.randomBytes(12), ct, aad)); await assert.rejects(() => C.decrypt(key, iv, ct.slice(0, ct.length - 1), aad));
  const k1 = await C.deriveKey('senha', nc.randomBytes(16), 1000), k2 = await C.deriveKey('senha', nc.randomBytes(16), 1000); assert.notEqual(C.hex(k1), C.hex(k2), 'sal diferente => chave diferente');
  const salt = nc.randomBytes(16); assert.equal(C.hex(await C.deriveKey('senha', salt, 1000)), nc.pbkdf2Sync('senha', salt, 1000, 32, 'sha256').toString('hex'));
});

/* ---------------- PIN ---------------- */
test('PIN novo: PBKDF2 com sal próprio por PIN, nunca em texto, e confere em qualquer instância', () => {
  const h = load(1), P = h.get('Profile'), id = P.list()[0].id;
  assert.equal(P.setPin(id, '4321').ok, true); const rec = P.cur().pin; assert.match(rec, /^v2\$50000\$[A-Za-z0-9+/]{22}==\$[0-9a-f]{64}$/);
  const raw = JSON.stringify(h.store); assert.equal(raw.includes('4321'), false); assert.equal(raw.includes(P.hashPin(id, '4321')), false, 'sem hash FNV');
  P.setPin(id, '4321'); assert.notEqual(P.cur().pin, rec, 'sal novo a cada vez: mesmo PIN, registro diferente');
  const P2 = load(1, h.store).get('Profile'); assert.equal(P2.tryPin(id, '4321').ok, true); assert.equal(P2.tryPin(id, '4320').ok, false);
  assert.equal(P.checkPinRecord('v2$50000$AAAA$zz', id, '1').ok, false, 'registro malformado nunca confere'); assert.equal(P.checkPinRecord('v2$5$' + 'A'.repeat(22) + '==$' + '0'.repeat(64), id, '1').ok, false, 'iterações fora da faixa');
  assert.equal(P.checkPinRecord(undefined, id, '1').ok, false);
  const t0 = Date.now(); P.tryPin(id, '0000'); assert.ok(Date.now() - t0 < 2000, 'conferir o PIN é rápido');
});
test('PIN antigo (FNV) continua valendo e é migrado em silêncio no primeiro acerto; erro não migra', () => {
  const h = load(1), P = h.get('Profile'), id = P.list()[0].id; let t = 1e6; P.now = () => t;
  const old = P.hashPin(id, '1234'); assert.match(old, /^[0-9a-f]{1,8}$/); P.cur().pin = old; P.save();
  assert.equal(P.hasPin(P.cur()), true); assert.equal(P.tryPin(id, '9999').ok, false); assert.equal(P.cur().pin, old, 'erro não mexe no registro');
  assert.equal(P.tryPin(id, '1234').ok, true); assert.match(P.cur().pin, /^v2\$/, 'migrou para o formato novo'); assert.notEqual(P.cur().pin, old);
  assert.equal(JSON.parse(h.store['tetris__profiles']).list[0].pin, P.cur().pin, 'e foi gravado');
  assert.equal(P.tryPin(id, '1234').ok, true); assert.equal(P.tryPin(id, '1111').ok, false, 'depois de migrar, só o PIN certo');
  const h2 = load(1, h.store), P2 = h2.get('Profile'); assert.equal(P2.tryPin(id, '1234').ok, true, 'o perfil continua acessível depois de recarregar');
});
test('PIN: perfil antigo restaurado de backup v1 com PIN FNV não perde o acesso', () => {
  const a = load(1), PA = a.get('Profile'), id = PA.list()[0].id; PA.cur().pin = PA.hashPin(id, '2468'); PA.save();
  const txt = a.get('Backup').text(), b = load(1), r = b.get('Backup').restore(txt); assert.equal(r.ok, true);
  assert.equal(b.get('Profile').tryPin(id, '2468').ok, true); assert.match(b.get('Profile').cur().pin, /^v2\$/);
});
test('PIN: tentativas e bloqueio são PERSISTENTES (fechar e abrir o app não zera), com tempo crescente e teto', () => {
  const h = load(1), P = h.get('Profile'), id = P.list()[0].id; let t = 5e6; P.now = () => t; P.setPin(id, '1357');
  for (let i = 0; i < 3; i++) P.tryPin(id, '0000');
  const h2 = load(1, h.store), P2 = h2.get('Profile'); P2.now = () => t;                                  // "fecha e abre o app"
  assert.match(P2.tryPin(id, '0000').error, /\(1 tentativas/, 'as 3 erros anteriores continuam contando'); const r = P2.tryPin(id, '0000');
  assert.equal(r.wait, true); assert.match(r.error, /Aguarde 30 s/);
  const h3 = load(1, h2.store), P3 = h3.get('Profile'); P3.now = () => t; const lk = P3.tryPin(id, '1357');
  assert.equal(lk.ok, false); assert.equal(lk.wait, true, 'bloqueado mesmo com o PIN certo depois de reabrir o app'); assert.match(lk.error, /Aguarde \d+ s/);
  t += 31000; for (let i = 0; i < 4; i++) P3.tryPin(id, '0000'); const r2 = P3.tryPin(id, '0000'); assert.match(r2.error, /Aguarde 60 s/, 'segundo bloqueio seguido dura o dobro');
  for (let k = 0; k < 8; k++) { t += 1e6; for (let i = 0; i < 5; i++) P3.tryPin(id, '0000'); } const rx = P3.tryPin(id, '1357'); assert.match(rx.error, /Aguarde (\d+) s/); assert.ok(+/Aguarde (\d+) s/.exec(rx.error)[1] <= 900, 'teto de 15 minutos');
  t += 1e6; assert.equal(P3.tryPin(id, '1357').ok, true); assert.equal(JSON.parse(h3.store['tetris__pinlock'] || '{}')[id], undefined, 'acertar zera o contador gravado');
  P3.tryPin(id, '0000'); assert.ok(JSON.parse(h3.store['tetris__pinlock'])[id]); P3.setPin(id, null); assert.equal(JSON.parse(h3.store['tetris__pinlock'] || '{}')[id], undefined, 'remover o PIN limpa o estado');
});
test('PIN: relógio adiantado/mexido nunca bloqueia além do teto; chaves de bloqueio malformadas são ignoradas', () => {
  const h = load(1), P = h.get('Profile'), id = P.list()[0].id; let t = 1e7; P.now = () => t; P.setPin(id, '1357');
  h.store['tetris__pinlock'] = JSON.stringify({ [id]: { f: 0, u: t + 1e12, l: 3 } }); const r = P.tryPin(id, '1357'); assert.equal(r.wait, true); assert.ok(+/Aguarde (\d+) s/.exec(r.error)[1] <= 900);
  h.store['tetris__pinlock'] = 'isso não é json'; assert.equal(P.tryPin(id, '1357').ok, true); h.store['tetris__pinlock'] = '[1,2]'; assert.equal(P.tryPin(id, '1357').ok, true);
});

/* ---------------- Store ---------------- */
test('Store: gravação que falha NÃO é tratada como sucesso, é contada e avisada; setVerified confere', () => {
  const h = load(1), S = h.get('Store'); let seen = 0; h.run('Store.onError = function(){ window.__err = (window.__err||0) + 1; }');
  assert.equal(S.set('x1', 'a'), true); assert.equal(S.setVerified('x1', 'b'), true); assert.equal(S.get('x1'), 'b'); assert.equal(S.health().ok, true);
  h.run("localStorage.setItem = function(){ throw new Error('QuotaExceededError'); }");
  assert.equal(S.set('x1', 'c'), false); assert.equal(S.gset('g', 'c'), false); assert.equal(S.setVerified('x1', 'c'), false); assert.equal(S.gsetVerified('g', 'c'), false);
  assert.ok(S.errors >= 4); assert.equal(S.health().ok, false); assert.equal(h.run('window.__err') >= 4, true); assert.equal(S.get('x1'), 'b', 'valor antigo preservado');
});

/* ---------------- Migração ---------------- */
const legacyStore = () => ({ tetris_bestScore: '12345', tetris_stats: JSON.stringify({ all: { games: 7, bestScore: 12345 } }), tetris_history: '[]', tetris_isSound: 'true', tetris_themes: '[]' });
test('Migração: instalação antiga é marcada na versão 2 sem alterar nem apagar NENHUM dado (perfil p1 / chaves tetris_*)', () => {
  const h = load(1, legacyStore()); const before = Object.assign({}, legacyStore());
  const out = h.get('MigrationManager').lastBoot; assert.deepEqual(plain(out.migration.ran), ['baseline-1', 'profiles-2']); assert.equal(out.migration.ok, true);
  for (const k of Object.keys(before)) assert.equal(h.store[k], before[k], 'intacto: ' + k);
  const s = JSON.parse(h.store['tetris__schema']); assert.equal(s.v, 2); assert.equal(s.pending, null); assert.equal(s.log.length, 2); assert.equal(h.get('Profile').list()[0].id, 'p1'); assert.equal(h.get('Profile').prefixFor('p1'), 'tetris_');
});
test('Migração: não duplica (rodar de novo não faz nada) e preserva prefixos de vários perfis', () => {
  const st = Object.assign(legacyStore(), { tetris__profiles: JSON.stringify({ list: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p5', name: 'C' }], current: 'p2', next: 3 }), tetris_p2_bestScore: '777', tetris_p5_stats: '{"all":{"games":1}}' });
  const h = load(1, st), M = h.get('MigrationManager'); const keysAfter = userKeys(h);
  for (const k of Object.keys(st)) if (k !== 'tetris__profiles') assert.equal(h.store[k], st[k]);
  assert.equal(JSON.parse(h.store['tetris__profiles']).next, 6, 'next passa a ser maior que todo id existente'); assert.equal(JSON.parse(h.store['tetris__profiles']).current, 'p2');
  const again = M.run(); assert.deepEqual(plain(again.ran), []); assert.equal(JSON.stringify(userKeys(h)), JSON.stringify(keysAfter)); assert.equal(JSON.parse(h.store['tetris__schema']).log.length, 2);
  const h2 = load(1, h.store); assert.deepEqual(plain(h2.get('MigrationManager').lastBoot.migration.ran), [], 'reabrir o app não migra de novo');
});
test('Migração: instalação nova não perde nada e já nasce na versão atual', () => {
  const h = load(1); assert.equal(JSON.parse(h.store['tetris__schema']).v, 2); assert.equal(h.get('Profile').list().length, 1);
});
test('Migração interrompida (app fechado no meio) é refeita; depois de 3 falhas para e o app segue com os dados', () => {
  const st = Object.assign(legacyStore(), { tetris__schema: JSON.stringify({ v: 1, log: [], tries: 1, pending: 'profiles-2' }) });
  const h = load(1, st); assert.equal(h.get('MigrationManager').lastBoot.migration.interrupted, 'profiles-2'); assert.equal(JSON.parse(h.store['tetris__schema']).v, 2); assert.equal(h.store.tetris_bestScore, '12345');
  const st2 = Object.assign(legacyStore(), { tetris__schema: JSON.stringify({ v: 1, log: [], tries: 3, pending: 'profiles-2' }) });
  const g = load(1, st2), r = g.get('MigrationManager').lastBoot.migration; assert.equal(r.ok, false); assert.match(r.errors[0], /falhou 3 vezes/); assert.equal(g.store.tetris_bestScore, '12345', 'dados intactos');
});
test('Migração que falha desfaz TUDO: os dados voltam exatamente ao que eram', () => {
  const h = load(1, legacyStore()), M = h.get('MigrationManager'), mine = () => JSON.stringify(Object.keys(h.store).filter((k) => !/^tetris__/.test(k)).sort().map((k) => [k, h.store[k]]));
  const before = mine();
  h.run("localStorage.setItem('tetris__schema', JSON.stringify({v:1,log:[],tries:0,pending:null})); MigrationManager.steps[1].run = function(){ localStorage.setItem('tetris_bestScore','CORROMPIDO'); localStorage.removeItem('tetris_stats'); throw new Error('boom'); };");
  const r = M.run(); assert.equal(r.ok, false); assert.equal(r.rolledBack, true); assert.match(r.errors[0], /desfeita/);
  assert.equal(mine(), before, 'dados idênticos aos de antes'); assert.equal(JSON.parse(h.store['tetris__schema']).v, 1); assert.equal(JSON.parse(h.store['tetris__schema']).pending, null);
});
test('Migração que perde dado é recusada pelo verify e desfeita', () => {
  const h = load(1, legacyStore()), M = h.get('MigrationManager');
  h.run("localStorage.setItem('tetris__schema', JSON.stringify({v:1,log:[],tries:0,pending:null})); MigrationManager.steps[1].run = function(){ localStorage.removeItem('tetris_history'); };");
  const r = M.run(); assert.equal(r.ok, false); assert.equal(r.rolledBack, true); assert.equal(h.store.tetris_history, '[]', 'a chave apagada voltou');
});
