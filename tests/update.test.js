'use strict';
// Atualização dentro do app (procurar, avisar, baixar, instalar) e versão + créditos na tela inicial.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, plain } = require('./harness');
const ROOT = path.join(__dirname, '..', 'app', 'src', 'main');

/** Aparelho com "Android" falso: guarda as chamadas nativas e deixa o teste responder com eventos. */
function device(version = '1.7.0') {
  const h = load(1); h.run('globalThis.__calls = []; globalThis.AndroidBridge = { version: () => ' + JSON.stringify(version) + ', updateCheck: () => __calls.push(["check"]), updateDownload: (t) => __calls.push(["download", t]), updateInstall: () => __calls.push(["install"]), updateCancel: () => __calls.push(["cancel"]) };');
  h.setState('MENU'); h.calls = () => plain(h.run('globalThis.__calls.splice(0)')); h.ev = (o) => h.run('Updater._ev(' + JSON.stringify(o) + ')'); return h;
}
const API = (extra) => JSON.stringify(Object.assign({ tag_name: 'v1.7.1', body: 'Novidades:\n- coisa A\n- coisa B', assets: [{ name: 'Tetris-v1.7.1.apk', size: 138550 }] }, extra || {}));
const text = (c) => (c.textContent || '') + (c.children || []).map(text).join('|');
const dlg = (h) => text(h.els.updBody) + '|' + h.els.updTitle.textContent;

test('versões: comparação numérica (1.10.0 > 1.9.9), só vX.Y.Z vale e o rótulo vem do APK', () => {
  const h = device('1.7.0'), U = h.get('Updater');
  assert.ok(U.cmp('1.7.1', '1.7.0') > 0); assert.ok(U.cmp('1.10.0', '1.9.9') > 0); assert.ok(U.cmp('2.0.0', '1.99.99') > 0); assert.equal(U.cmp('1.7.0', '1.7.0'), 0); assert.ok(U.cmp('1.6.13', '1.7.0') < 0);
  assert.equal(U.label(), 'v1.7.0'); assert.equal(load(1).get('Updater').label(), '', 'fora do Android: sem versão');
  h.ev({ e: 'checked', tag: '1.7.1', api: '' }); assert.equal(h.get('Updater').st, 'error'); h.ev({ e: 'checked', tag: 'v1.7.1; rm -rf', api: '' }); assert.equal(h.get('Updater').st, 'error');
});
test('procurar (manual): consulta o Android e, se houver versão nova, mostra "Baixar agora" / "Depois" com notas e tamanho', () => {
  const h = device(), U = h.get('Updater'); assert.equal(U.check(true), true); assert.deepEqual(h.calls(), [['check']]); assert.equal(U.st, 'checking'); assert.equal(U.check(true), false, 'não duplica enquanto procura');
  h.ev({ e: 'checked', tag: 'v1.7.1', api: API() }); assert.equal(U.st, 'available'); assert.ok(h.els.updPanel.classList.contains('on'));
  const d = dlg(h); assert.match(d, /Atualização disponível/); assert.match(d, /v1\.7\.0/); assert.match(d, /v1\.7\.1/); assert.match(d, /135,3 KB|136 KB|135 KB/); assert.match(d, /coisa A/);
  const buttons = h.els.updBody.children.filter((c) => c.className.includes('btn')).map((c) => c.textContent); assert.deepEqual(buttons, ['Baixar agora', 'Depois']);
  h.els.updBody.children.find((c) => c.textContent === 'Depois').onclick(); assert.equal(h.els.updPanel.classList.contains('on'), false); assert.equal(U.st, 'available', 'continua disponível (aparece de novo ao abrir o app)'); assert.equal(U.newer(), true);
});
test('baixar agora: baixa dentro do app com barra de progresso, pode cancelar, instala sozinho ao terminar', () => {
  const h = device(), U = h.get('Updater'); U.check(true); h.calls(); h.ev({ e: 'checked', tag: 'v1.7.1', api: API() });
  h.els.updBody.children.find((c) => c.textContent === 'Baixar agora').onclick(); assert.deepEqual(h.calls(), [['download', 'v1.7.1']]); assert.equal(U.st, 'downloading'); assert.match(dlg(h), /Baixando v1\.7\.1/); assert.match(dlg(h), /0%/);
  h.ev({ e: 'progress', done: 69275, total: 138550 }); assert.match(dlg(h), /50% · 67,6 KB|50% · 68 KB|50% · 67 KB/); assert.ok(h.els.updBody.children.some((c) => c.className === 'bar'), 'barra de progresso');
  h.els.updBody.children.find((c) => c.textContent === 'Cancelar').onclick(); assert.deepEqual(h.calls(), [['cancel']]); h.ev({ e: 'cancelled' }); assert.equal(U.st, 'available'); assert.match(dlg(h), /Download cancelado/);
  h.els.updBody.children.find((c) => c.textContent === 'Baixar agora').onclick(); h.calls(); h.ev({ e: 'progress', done: 138550, total: 138550 }); h.ev({ e: 'downloaded', file: '/x/Tetris-v1.7.1.apk', size: 138550 });
  assert.deepEqual(h.calls(), [['install']], 'terminou: pede a instalação ao Android'); assert.equal(U.st, 'installing'); assert.match(dlg(h), /Instalando/);
  h.ev({ e: 'confirm' }); assert.match(dlg(h), /Confirme a instalação na tela do Android/); h.ev({ e: 'installed' }); assert.match(dlg(h), /instalada/);
});
test('instalar sem a permissão "apps desconhecidos": explica, e "Instalar" tenta de novo; falhas mostram o erro e permitem tentar de novo', () => {
  const h = device(), U = h.get('Updater'); U.check(true); h.ev({ e: 'checked', tag: 'v1.7.1', api: API() }); U.download(); h.calls();
  h.ev({ e: 'needPermission' }); assert.equal(U.st, 'needPermission'); assert.match(dlg(h), /Instalar apps desconhecidos/); h.els.updBody.children.find((c) => c.textContent === 'Instalar').onclick(); assert.deepEqual(h.calls(), [['install']]);
  h.ev({ e: 'error', msg: 'Sem conexão com o GitHub' }); assert.equal(U.st, 'error'); assert.match(dlg(h), /Não foi possível atualizar/); assert.match(dlg(h), /Sem conexão/);
  h.els.updBody.children.find((c) => c.textContent === 'Tentar de novo').onclick(); assert.deepEqual(h.calls(), [['download', 'v1.7.1']]); assert.equal(U.st, 'downloading');
  h.ev({ e: 'error', msg: 'x'.repeat(500) }); assert.ok(h.get('Updater').msg.length <= 200);
});
test('já está na última versão: aviso só no manual (automático fica quieto); versão igual/menor nunca oferece', () => {
  const h = device('1.7.1'), U = h.get('Updater'); U.check(true); h.calls(); h.ev({ e: 'checked', tag: 'v1.7.1', api: API() });
  assert.equal(U.st, 'uptodate'); assert.match(dlg(h), /Tudo atualizado/); assert.match(dlg(h), /v1\.7\.1/); assert.equal(U.newer(), false);
  h.els.updBody.children.find((c) => c.textContent === 'OK').onclick(); assert.equal(h.els.updPanel.classList.contains('on'), false);
  const q = device('1.7.1'); q.get('Updater').manual = false; q.run('Updater.st = "checking"; Updater.manual = false'); q.ev({ e: 'checked', tag: 'v1.7.1', api: '' }); assert.equal(q.els.updPanel.classList.contains('on'), false, 'automático e atualizado: silêncio');
  const o = device('1.8.0'); o.run('Updater.manual = true'); o.ev({ e: 'checked', tag: 'v1.7.9', api: '' }); assert.equal(o.get('Updater').st, 'uptodate', 'publicada mais antiga que a instalada');
});
test('automático ao abrir: respeita a preferência e o intervalo de 1 h; durante uma partida o aviso espera o menu', () => {
  const h = device(), U = h.get('Updater'); assert.equal(h.get('settings').updAuto, true);
  assert.equal(U.autoCheck(), true); assert.deepEqual(h.calls(), [['check']]); h.ev({ e: 'error', msg: 'x' }); assert.equal(U.autoCheck(), false, 'no máximo 1 vez por hora'); assert.deepEqual(h.calls(), []);
  h.run('Store.gset("updLast", Date.now() - 3700000)'); h.run('Updater.st = "idle"'); assert.equal(U.autoCheck(), true); h.calls();
  h.run('settings.updAuto = false'); h.run('Store.gset("updLast", 0); Updater.st = "idle"'); assert.equal(U.autoCheck(), false, 'preferência desligada');
  assert.equal(load(1).get('Updater').autoCheck(), false, 'fora do Android nunca procura');
  h.run('settings.updAuto = true; Store.gset("updLast", 0); Updater.st = "idle"; Updater.manual = false'); U.autoCheck(); h.calls(); h.run("state = 'PLAY'"); h.ev({ e: 'checked', tag: 'v1.7.1', api: API() });
  assert.equal(h.els.updPanel.classList.contains('on'), false, 'não interrompe a partida'); assert.equal(U.pendingShow, true); h.run("state = 'PLAY'; G = null; goMenu()"); assert.ok(h.els.updPanel.classList.contains('on'), 'ao voltar ao menu o aviso aparece');
});
test('tela "Atualizações" (Menu › Conta e dados): versão, procurar, última versão publicada e preferência', () => {
  const h = device(); h.els.bLevel.onclick(); h.els.sheetBody.children.find((c) => c.className === 'grid2' && /Atualizações/.test(text(c))).children.find((b) => b.textContent === 'Atualizações').onclick(); assert.equal(h.els.sheetTitle.textContent, 'Atualizações'); const t = () => h.els.sheetBody.children.map(text).join('\n');
  assert.match(t(), /Versão instalada/); assert.match(t(), /v1\.7\.0/); assert.match(t(), /Procurar atualização/); assert.match(t(), /Procurar ao abrir o app/);
  h.els.sheetBody.children.find((c) => c.textContent === 'Procurar atualização').onclick(); assert.deepEqual(h.calls(), [['check']]); assert.match(t(), /Procurando/);
  h.ev({ e: 'checked', tag: 'v1.7.1', api: API() }); assert.match(t(), /Última versão publicada/); assert.match(t(), /v1\.7\.1 \(nova\)/); assert.ok(h.els.sheetBody.children.some((c) => /Baixar a versão v1\.7\.1/.test(c.textContent || '')));
  const tg = h.els.sheetBody.children.find((c) => /Procurar ao abrir o app/.test(c.textContent || '')); tg.onclick(); assert.equal(h.get('settings').updAuto, false); assert.equal(load(1, h.store).get('settings').updAuto, false, 'persiste');
  const web = load(1); web.sb.openUpdates(); assert.match(web.els.sheetBody.children.map(text).join('\n'), /só funciona no Android/); web.els.sheetBody.children.find((c) => c.textContent === 'Procurar atualização').onclick(); assert.match(web.els.updTitle.textContent, /Não foi possível/);
});
test('tela inicial: mostra a versão instalada junto de "Developed by T. Marques" (e avisa quando há atualização)', () => {
  const h = device(); h.run('globalThis.__t = []; const o = txt; txt = function (s) { globalThis.__t.push(String(s)); return o.apply(null, arguments); };'); h.setState('MENU'); h.sb.render();
  const all = () => plain(h.run('globalThis.__t.splice(0)')); let t = all(); assert.ok(t.includes('v1.7.0  ·  Developed by T. Marques'), t.join('|'));
  h.ev({ e: 'checked', tag: 'v1.7.1', api: '' }); h.setState('MENU'); h.sb.render(); t = all(); assert.ok(t.includes('⬆ v1.7.0  ·  Developed by T. Marques')); assert.ok(t.includes('Atualização v1.7.1 disponível'));
  const web = load(1); web.run('globalThis.__t = []; const o = txt; txt = function (s) { globalThis.__t.push(String(s)); return o.apply(null, arguments); };'); web.setState('MENU'); web.sb.render(); assert.ok(plain(web.run('globalThis.__t')).includes('Developed by T. Marques'), 'sem versão (navegador): só os créditos');
});
test('Android: permissão de instalação, métodos nativos e passos do CI presentes', () => {
  const man = fs.readFileSync(path.join(ROOT, 'AndroidManifest.xml'), 'utf8'); assert.match(man, /REQUEST_INSTALL_PACKAGES/); assert.match(man, /android\.permission\.INTERNET/);
  const J = (f) => fs.readFileSync(path.join(ROOT, 'java/com/missionbreak56/tetris', f), 'utf8');
  const j = ['MainActivity.java', 'core/GameBridge.java', 'updates/UpdateInstaller.java'].map(J).join('\n');   // a ponte e o instalador foram separados da MainActivity
  for (const s of ['public String version()', 'public void updateCheck()', 'public void updateDownload(String tag)', 'public void updateCancel()', 'public void updateInstall()', 'PackageInstaller', 'canRequestPackageInstalls', 'ACTION_MANAGE_UNKNOWN_APP_SOURCES', 'RECEIVER_NOT_EXPORTED', 'STATUS_PENDING_USER_ACTION']) assert.ok(j.includes(s), s);
  assert.ok(fs.existsSync(path.join(ROOT, 'java/com/missionbreak56/tetris/updates/AppUpdate.java'))); assert.ok(fs.existsSync(path.join(__dirname, 'java', 'AppUpdateTest.java')));
  const wf = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8'); assert.match(wf, /AppUpdateTest/);
  const up = fs.readFileSync(path.join(ROOT, 'java/com/missionbreak56/tetris/updates/AppUpdate.java'), 'utf8'); assert.match(up, /releases\/latest/); assert.match(up, /\^v\\\\d\+\\\\\.\\\\d\+\\\\\.\\\\d\+\$/);
});
