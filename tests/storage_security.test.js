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

/* ---------------- Snapshots ---------------- */
test('Snapshot: cria, valida (soma) e recusa snapshot alterado/inválido', () => {
  const h = load(1, legacyStore()); h.run(mem()); const S = h.get('SnapshotManager');
  assert.equal(S.available(), true); assert.equal(S.create('teste', false).ok, true); assert.equal(h.run('window.__snap.async'), 1);
  const t = snapText(h), v = S.verify(t); assert.equal(v.ok, true); assert.equal(v.snap.reason, 'teste'); assert.equal(v.snap.data.global.profiles.includes('p1'), true);
  const o = JSON.parse(t); o.data.profiles.p1.bestScore = '999999'; assert.equal(S.verify(JSON.stringify(o)).ok, false, 'dados alterados: soma não confere');
  for (const bad of ['', 'x', '{}', JSON.stringify({ type: 'outro' }), JSON.stringify({ type: 'tetris-snapshot', v: 9, app: 'tetris' }), null]) assert.equal(S.verify(bad).ok, false);
  assert.equal(S.protect('pre-x').durable, true); assert.equal(h.run('window.__snap.sync'), 1, 'protect usa gravação confirmada (síncrona)');
  h.run('SnapshotManager.backend.saveNow = function(){ return false; }'); assert.equal(S.protect('pre-y').durable, false, 'gravação recusada não vira "durável"');
});
test('Snapshot: sem ponte nativa nem backend o app funciona normalmente (sem snapshot)', () => {
  const h = load(1, legacyStore()), S = h.get('SnapshotManager'); assert.equal(S.available(), false); assert.equal(S.create('x').ok, false); assert.equal(S.recoverIfEmpty().recovered, false); assert.equal(S.protect('x').durable, false);
  assert.equal(h.get('Backup').restore(h.get('Backup').text()).ok, true, 'restaurar continua funcionando sem snapshot');
});
test('Snapshot: dados sumiram (localStorage limpo) => recupera do snapshot; com dados presentes NÃO mexe', () => {
  const h = load(1, legacyStore()); h.run(mem()); h.get('SnapshotManager').create('antes', true);
  const snap = snapText(h);
  const present = load(1, legacyStore()); present.run(mem()); present.run('window.__snap.text = ' + JSON.stringify(snap)); present.store.tetris_bestScore = '1'; present.run("localStorage.setItem('tetris_stats','{\"all\":{\"games\":99}}')");
  assert.equal(present.get('SnapshotManager').recoverIfEmpty().recovered, false, 'há dados: não sobrescreve'); assert.equal(present.store.tetris_bestScore, '1');
  const wiped = load(1); wiped.run(mem()); wiped.run('window.__snap.text = ' + JSON.stringify(snap));
  assert.equal(wiped.get('SnapshotManager').storageEmpty(), true); const r = wiped.get('SnapshotManager').recoverIfEmpty(); assert.equal(r.recovered, true);
  assert.equal(wiped.store.tetris_bestScore, '12345'); assert.equal(wiped.store.tetris_stats, legacyStore().tetris_stats); assert.equal(wiped.get('Profile').list()[0].id, 'p1');
  const bad = load(1); bad.run(mem()); bad.run("window.__snap.text = '{\"type\":\"tetris-snapshot\"}'"); assert.equal(bad.get('SnapshotManager').recoverIfEmpty().recovered, false, 'snapshot inválido não restaura lixo');
});
test('Restauração: antes de tocar em nada o estado atual vira snapshot DURÁVEL e a marca "restaurando" é removida no fim', () => {
  const a = load(1, legacyStore()), txt = a.get('Backup').text();
  const h = load(1); h.run(mem()); h.store.tetris_bestScore = '555'; const r = h.get('Backup').restore(txt); assert.equal(r.ok, true);
  assert.equal(h.run('window.__snap.sync'), 1); const v = h.get('SnapshotManager').verify(snapText(h)); assert.equal(v.snap.reason, 'pre-restore'); assert.equal(v.snap.data.profiles.p1.bestScore, '555', 'o snapshot guarda o estado de ANTES');
  assert.equal(h.store['tetris__restoring'], undefined, 'marca removida'); assert.equal(h.store.tetris_bestScore, '12345');
});
test('Restauração interrompida (app morreu no meio): na próxima abertura volta ao estado de antes', () => {
  const orig = Object.assign(legacyStore(), { tetris_bestScore: '4242' }), a = load(1, orig); a.run(mem()); a.get('SnapshotManager').protect('pre-restore');   // snapshot durável do estado bom
  const snap = snapText(a);
  const b = load(1); b.run(mem()); b.run('window.__snap.text = ' + JSON.stringify(snap));
  b.store.tetris_bestScore = 'METADE'; delete b.store.tetris_stats; b.store['tetris__restoring'] = JSON.stringify({ at: 1 }); b.store['tetris__profiles'] = '{"list":[';   // meio da gravação
  const r = b.get('Backup').recoverInterrupted(); assert.equal(r.interrupted, true); assert.equal(r.recovered, true);
  assert.equal(b.store.tetris_bestScore, '4242'); assert.equal(b.store.tetris_stats, orig.tetris_stats); assert.equal(b.store['tetris__restoring'], undefined); assert.equal(b.get('Profile').list()[0].id, 'p1');
  assert.equal(b.get('Backup').recoverInterrupted().interrupted, false, 'só uma vez');
  const c = load(1); c.run(mem()); c.run('window.__snap.text = ' + JSON.stringify(a.get('SnapshotManager').build('outro', null))); c.store['tetris__restoring'] = '{"at":1}'; c.store.tetris_bestScore = 'X';
  const r2 = c.get('Backup').recoverInterrupted(); assert.equal(r2.recovered, false, 'snapshot de outro motivo não é usado'); assert.equal(c.store.tetris_bestScore, 'X'); assert.equal(c.store['tetris__restoring'], undefined, 'marca limpa (sem laço)');
});
test('Restauração: se a gravação falha no meio, os dados anteriores voltam (rollback) e nada fica marcado', () => {
  const src = load(1, Object.assign(legacyStore(), { tetris_bestScore: '7777' })), txt = src.get('Backup').text();
  const h = load(1, Object.assign(legacyStore(), { tetris_bestScore: '1111' })); h.run(mem()); const before = h.store.tetris_bestScore;
  h.run("(function(){ var real = localStorage.setItem, n = 0; localStorage.setItem = function(k, v){ if (k === 'tetris_bestScore' && String(v) === '7777') throw new Error('QuotaExceededError'); return real(k, v); }; })()");
  const r = h.get('Backup').restore(txt); assert.equal(r.ok, false); assert.match(r.errors[0], /dados anteriores foram mantidos/); assert.equal(h.store.tetris_bestScore, before); assert.equal(h.store['tetris__restoring'], undefined);
});

/* ---------------- Backup .tmb ---------------- */
const slow = { iter: 100000 };
test('TMB sem senha: ida e volta, checksum, e o arquivo NÃO é sigiloso (documentado)', async () => {
  const h = load(1, legacyStore()), B = h.get('BackupManager'), R = h.get('RestoreManager');
  const r = await B.create({}); assert.equal(r.ok, true); assert.equal(r.encrypted, false); const o = JSON.parse(r.text);
  assert.equal(o.format, 'TMB'); assert.equal(o.fv, 2); assert.equal(o.app, 'tetris'); assert.equal(o.scope, 'all'); assert.equal(o.enc, null); assert.match(o.sha256, /^[0-9a-f]{64}$/); assert.equal(typeof o.created, 'number'); assert.equal(typeof o.engine, 'string');
  assert.equal(Buffer.from(o.body, 'base64').toString().includes('12345'), true, 'sem senha o conteúdo é legível');
  assert.equal(B.isTmb(r.text), true); assert.equal(B.isTmb('{"type":"tetris-backup"}'), false);
  const p = await R.parse(r.text); assert.equal(p.ok, true); assert.equal(p.summary.tmb.encrypted, false); assert.equal(p.summary.profiles[0].games, 7);
  const h2 = load(1), res = await h2.get('RestoreManager').restore(r.text); assert.equal(res.ok, true); assert.equal(h2.store.tetris_bestScore, '12345'); assert.equal(h2.store.tetris_stats, legacyStore().tetris_stats);
});
test('TMB com senha: AES-256-GCM/PBKDF2, restaura em OUTRO aparelho só com a senha certa', async () => {
  const h = load(1, legacyStore()), B = h.get('BackupManager'), R = h.get('RestoreManager');
  const r = await B.create(Object.assign({ password: 'senha forte 123' }, slow)); assert.equal(r.ok, true); assert.equal(r.encrypted, true); const o = JSON.parse(r.text);
  assert.deepEqual({ a: o.enc.alg, k: o.enc.kdf, i: o.enc.iter }, { a: 'AES-256-GCM', k: 'PBKDF2-HMAC-SHA256', i: 100000 }); assert.equal(Buffer.from(o.enc.salt, 'base64').length, 16); assert.equal(Buffer.from(o.enc.iv, 'base64').length, 12);
  assert.equal(r.text.includes('12345'), false); assert.equal(Buffer.from(o.body, 'base64').toString('latin1').includes('bestScore'), false, 'conteúdo cifrado');
  assert.equal(r.text.includes('senha forte'), false, 'a senha nunca vai no arquivo');
  const noPw = await R.parse(r.text); assert.equal(noPw.ok, false); assert.equal(noPw.needsPassword, true);
  for (const wrong of ['senha forte 124', 'x', 'SENHA FORTE 123', ' senha forte 123']) { const w = await R.parse(r.text, wrong); assert.equal(w.ok, false); assert.equal(w.wrongPassword, true, wrong); }
  const ok = await R.parse(r.text, 'senha forte 123'); assert.equal(ok.ok, true); assert.equal(ok.summary.tmb.encrypted, true);
  const other = load(1, { tetris_bestScore: '1' }); const res = await other.get('RestoreManager').restore(r.text, 'senha forte 123'); assert.equal(res.ok, true);
  assert.equal(other.store.tetris_bestScore, '12345', 'outro aparelho restaurou'); const bad = load(1, { tetris_bestScore: '1' }); const rb = await bad.get('RestoreManager').restore(r.text, 'errada!!'); assert.equal(rb.ok, false); assert.equal(bad.store.tetris_bestScore, '1', 'senha errada não toca em nada');
});
test('TMB: nonce/sal novos a cada backup (nunca reutiliza) e senha curta/longa é recusada', async () => {
  const h = load(1, legacyStore()), B = h.get('BackupManager'); const seen = new Set();
  for (let i = 0; i < 6; i++) { const o = JSON.parse((await B.create(Object.assign({ password: 'mesma senha 1' }, slow))).text); seen.add(o.enc.iv); seen.add(o.enc.salt); seen.add(o.body); }
  assert.equal(seen.size, 18, 'iv, salt e texto cifrado diferentes em todos');
  assert.equal((await B.create({ password: 'curta' })).ok, false); assert.equal((await B.create({ password: 'x'.repeat(129) })).ok, false); assert.equal((await B.create({ password: '12345678' })).ok, true);
  const cc = JSON.parse((await B.create({ password: 'senha com acentuação ç' })).text); assert.equal(cc.enc.iter, 600000, 'padrão: 600.000 iterações');
});
test('TMB: arquivo corrompido, truncado, adulterado ou com parâmetros perigosos é recusado', async () => {
  const h = load(1, legacyStore()), B = h.get('BackupManager'), R = h.get('RestoreManager');
  const enc = JSON.parse((await B.create(Object.assign({ password: 'senha forte 123' }, slow))).text), pl = JSON.parse((await B.create({})).text);
  const sha = (o, h2) => nc.createHash('sha256').update(Buffer.concat([Buffer.from(aad(o)), Buffer.from(o.body, 'base64')])).digest('hex');
  const aad = (o) => ['TMB', o.fv, o.app, o.appVersion, o.engine, o.created, o.scope, o.enc ? [o.enc.alg, o.enc.kdf, o.enc.iter, o.enc.salt, o.enc.iv].join(':') : '-'].join('|');
  const bad = async (o, re, pw) => { const r = await R.parse(typeof o === 'string' ? o : JSON.stringify(o), pw); assert.equal(r.ok, false, String(re)); assert.match(r.errors[0], re); return r; };
  await bad('', /Nada/); await bad('lixo', /JSON/); await bad('{"a":1}', /\.tmb/); await bad(JSON.stringify(pl).slice(0, 200), /JSON/); await bad(JSON.stringify(pl).slice(0, -5), /JSON/);
  await bad(Object.assign({}, pl, { body: pl.body.slice(0, -8) + 'AAAAAAAA' }), /checksum/); await bad(Object.assign({}, pl, { body: pl.body.slice(4) }), /checksum|inválido/); await bad(Object.assign({}, pl, { created: pl.created + 1 }), /checksum/);
  await bad(Object.assign({}, pl, { fv: 3 }), /mais nova/); await bad(Object.assign({}, pl, { fv: 0 }), /inválida/); await bad(Object.assign({}, pl, { app: 'outro' }), /Tetris/); await bad(Object.assign({}, pl, { scope: 'tudo' }), /inválido/); await bad(Object.assign({}, pl, { sha256: 'zz' }), /checksum|incompleto/);
  await bad(Object.assign({}, pl, { appVersion: 'a b<script>' }), /inválido/); await bad(Object.assign({}, pl, { body: 5 }), /incompleto/);
  for (const iter of [10, 99999, 3000001, 1e12, 2.5, '600000']) { const e = JSON.parse(JSON.stringify(enc)); e.enc.iter = iter; e.sha256 = sha(e); await bad(e, /criptografia inválidos/, 'senha forte 123'); }
  for (const patch of [{ alg: 'AES-128-CBC' }, { kdf: 'PBKDF2-HMAC-SHA1' }, { salt: 'AAAA' }, { iv: 'AAAA' }, { salt: '@@@' }]) { const e = JSON.parse(JSON.stringify(enc)); Object.assign(e.enc, patch); e.sha256 = sha(e); await bad(e, /criptografia inválidos/, 'senha forte 123'); }
  // atacante troca o cabeçalho E recalcula o checksum: o GCM (cabeçalho autenticado) ainda recusa
  const e2 = JSON.parse(JSON.stringify(enc)); e2.created += 5; e2.sha256 = sha(e2); await bad(e2, /Senha incorreta ou arquivo alterado/, 'senha forte 123');
  const e3 = JSON.parse(JSON.stringify(enc)); e3.scope = 'profile'; e3.sha256 = sha(e3); await bad(e3, /Senha incorreta ou arquivo alterado/, 'senha forte 123');
  const e4 = JSON.parse(JSON.stringify(enc)); const raw = Buffer.from(e4.body, 'base64'); raw[3] ^= 1; e4.body = raw.toString('base64'); e4.sha256 = sha(e4); await bad(e4, /Senha incorreta ou arquivo alterado/, 'senha forte 123');
  const big = JSON.stringify(Object.assign({}, pl, { body: 'A'.repeat(9100000) })); await bad(big, /grande/);
});
test('TMB sem senha com conteúdo adulterado mas checksum recalculado ainda passa pelo validador dos dados', async () => {
  const h = load(1, legacyStore()), B = h.get('BackupManager'), R = h.get('RestoreManager'), pl = JSON.parse((await B.create({})).text);
  const body = JSON.parse(Buffer.from(pl.body, 'base64').toString()); body.data.profiles.p1.bestScore = 'drop table; --';
  const nb = Buffer.from(JSON.stringify(body)); const o = Object.assign({}, pl, { body: nb.toString('base64') });
  const aad = ['TMB', o.fv, o.app, o.appVersion, o.engine, o.created, o.scope, '-'].join('|'); o.sha256 = nc.createHash('sha256').update(Buffer.concat([Buffer.from(aad), nb])).digest('hex');
  const r = await R.parse(JSON.stringify(o)); assert.equal(r.ok, false); assert.match(r.errors[0], /Valor inválido|Checksum|inválido/);
});
test('Backup antigo (v1 .json) continua funcionando e a interface reconhece os dois formatos', async () => {
  const a = load(1, legacyStore()), old = a.get('Backup').text(); assert.equal(a.get('BackupManager').isTmb(old), false);
  const b = load(1); assert.equal(b.get('Backup').restore(old).ok, true); assert.equal(b.store.tetris_bestScore, '12345');
  const tmb = (await a.get('BackupManager').create({})).text; assert.equal((await b.get('RestoreManager').restore(tmb)).ok, true);
  assert.equal(b.get('Backup').parse(tmb).ok, false, 'o parser antigo recusa .tmb com mensagem clara (não corrompe nada)');
});
test('TMB de um perfil: exporta só ele (sem PIN/ranking) e importa como perfil NOVO com nome único', async () => {
  const h = load(1, legacyStore()), P = h.get('Profile'); const z = P.create('Zé').id; P.setPin(z, '4321'); h.run(`localStorage.setItem('tetris_${z}_bestScore','888'); localStorage.setItem('tetris_${z}_stats','{"all":{"games":3}}'); localStorage.setItem('tetris__ranking','{"x":1}')`);
  const B = h.get('BackupManager'), r = await B.create({ profileId: z, password: 'senha forte 123', iter: 100000 }); assert.equal(r.ok, true); assert.equal(r.scope, 'profile');
  const p = await h.get('RestoreManager').parse(r.text, 'senha forte 123'); assert.equal(p.ok, true); assert.equal(p.summary.profiles.length, 1); assert.equal(p.backup.data.global.ranking, undefined, 'sem ranking global'); assert.equal(p.r === undefined, true);
  assert.equal(JSON.parse(p.backup.data.global.profiles).list[0].pin, undefined, 'PIN não é exportado');
  const h2 = load(1, legacyStore()), P2 = h2.get('Profile'); P2.create('Zé'); const before = JSON.stringify(Object.keys(h2.store).filter((k) => /^tetris_p?1?_?/.test(k)).sort());
  const res = await h2.get('RestoreManager').restore(r.text, 'senha forte 123'); assert.equal(res.ok, true); assert.equal(res.name, 'Zé (2)', 'nome já existia'); assert.equal(res.id, 'p3');
  assert.equal(h2.store['tetris_p3_bestScore'], '888'); assert.equal(h2.store.tetris_bestScore, '12345', 'perfil existente intacto'); assert.equal(P2.list().length, 3); assert.equal(P2.list()[2].pin, undefined);
  assert.equal(load(1, h2.store).get('Profile').list().length, 3, 'persistiu');
  const lim = load(1); const PL = lim.get('Profile'); while (PL.list().length < PL.MAX) PL.create('P' + PL.list().length); const rl = await lim.get('RestoreManager').restore(r.text, 'senha forte 123'); assert.equal(rl.ok, false); assert.match(rl.errors[0], /Limite/);
});
test('TMB de perfil: falha ao gravar não deixa NADA para trás (nem perfil pela metade)', async () => {
  const h = load(1, legacyStore()), P = h.get('Profile'); const z = P.create('Zé').id; h.run(`localStorage.setItem('tetris_${z}_bestScore','888'); localStorage.setItem('tetris_${z}_history','[]')`);
  const r = await h.get('BackupManager').create({ profileId: z }); const t = load(1, legacyStore()); const keys0 = JSON.stringify(Object.keys(t.store).sort()), prof0 = t.store.tetris__profiles;
  t.run("(function(){ var real = localStorage.setItem; localStorage.setItem = function(k, v){ if (/^tetris_p2_history$/.test(k)) throw new Error('QuotaExceededError'); return real(k, v); }; })()");
  const res = await t.get('RestoreManager').restore(r.text); assert.equal(res.ok, false); assert.match(res.errors[0], /Nada foi alterado/);
  assert.equal(JSON.stringify(Object.keys(t.store).sort()), keys0); assert.equal(t.store.tetris__profiles, prof0); assert.equal(t.get('Profile').list().length, 1);
});
test('Interface: tela de backup protegido e importação de .tmb pedem senha, mostram prévia e restauram', async () => {
  const a = load(1, legacyStore()), r = await a.get('BackupManager').create({ password: 'senha forte 123', iter: 100000 });
  const h = load(1); h.sb.openBackupImport();
  const find = (n, f) => { const o = []; (function w(c) { if (f(c)) o.push(c); (c.children || []).forEach(w); })(n); return o; };
  const body = h.els.sheetBody, ta = find(body, (c) => c.className === 'txt')[0], verify = find(body, (c) => c.textContent === 'Verificar texto')[0];
  ta.value = r.text; verify.onclick(); await new Promise((res) => setTimeout(res, 50)); await new Promise((res) => setImmediate(res));
  const pw = find(body, (c) => c.className === 'txt' && c !== ta)[0]; assert.ok(pw, 'pediu a senha'); pw.value = 'senha forte 123'; find(body, (c) => c.textContent === 'Abrir backup')[0].onclick();
  await new Promise((res) => setTimeout(res, 100)); await new Promise((res) => setImmediate(res));
  const rest = find(body, (c) => c.textContent === 'Restaurar (substitui tudo)')[0]; assert.ok(rest, 'mostrou a prévia e o botão de restaurar'); h.sb.openBackup(); assert.ok(find(h.els.sheetBody, (c) => /Backup protegido por senha/.test(c.textContent || '')).length >= 1, 'botão do backup protegido na tela de backup');
});

test('Interface: botão "Recuperar do snapshot" só aparece com snapshot disponível e restaura de verdade', () => {
  const a = load(1, legacyStore()); a.run(mem()); a.get('SnapshotManager').create('manual', true); const snap = snapText(a);
  const find = (n, f) => { const o = []; (function w(c) { if (f(c)) o.push(c); (c.children || []).forEach(w); })(n); return o; };
  const none = load(1, legacyStore()); none.sb.openBackup(); assert.equal(find(none.els.sheetBody, (c) => /Recuperar do snapshot/.test(c.textContent || '')).length, 0, 'sem snapshot: sem botão');
  const h = load(1); h.run(mem()); h.run('window.__snap.text = ' + JSON.stringify(snap)); h.sb.openBackup();
  const bt = find(h.els.sheetBody, (c) => /Recuperar do snapshot/.test(c.textContent || ''))[0]; assert.ok(bt); bt.onclick();
  const go = find(h.els.sheetBody, (c) => c.textContent === 'Restaurar este snapshot')[0]; assert.ok(go, 'mostra a tela do snapshot'); go.onclick(); h.els.confirmYes.onclick();
  assert.equal(h.store.tetris_bestScore, '12345'); assert.equal(h.store.tetris_stats, legacyStore().tetris_stats);
});
