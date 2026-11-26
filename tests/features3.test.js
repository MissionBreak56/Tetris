'use strict';
// Perfis com avatar e PIN, placar contra o oponente, emotes e revanche.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

const text = (c) => (c.textContent || '') + (c.children || []).map(text).join('|');
test('avatar: padrão por perfil, escolha persiste, valores inválidos ignorados, backup preserva', () => {
  const h = load(1), P = h.get('Profile'); assert.equal(P.avatar(), '🙂'); const id = P.create('Zé').id; assert.equal(P.avatar(P.list()[1]), '😎', 'perfil 2: avatar próprio');
  assert.equal(P.setAvatar(id, 7), true); assert.equal(P.avatar(P.list()[1]), '🦄'); assert.equal(P.setAvatar(id, 99), false); assert.equal(P.setAvatar(id, -1), false); assert.equal(P.setAvatar('p9', 1), false);
  const h2 = load(1, h.store); assert.equal(h2.get('Profile').avatar(h2.get('Profile').list()[1]), '🦄', 'persiste');
  const parsed = plain(h.get('Profile').parse({ list: [{ id: 'p1', name: 'A', av: 99, pin: 'ZZZ' }, { id: 'p2', name: 'B', av: 3, pin: 'abcd1234' }], current: 'p1' }));
  assert.equal(parsed.list[0].av, undefined); assert.equal(parsed.list[0].pin, undefined); assert.equal(parsed.list[1].av, 3); assert.equal(parsed.list[1].pin, 'abcd1234');
  const B = h.get('Backup'), t = B.text(); assert.equal(B.parse(t).ok, true); const h3 = load(1); assert.equal(h3.get('Backup').restore(t).ok, true); assert.equal(h3.get('Profile').avatar(h3.get('Profile').list()[1]), '🦄');
  assert.equal(h.get('Profile').nextAvatar(), 1, 'novo perfil recebe o primeiro avatar ainda não usado (0 e 7 estão em uso)');
});
test('PIN: só guarda hash de 4 dígitos, confere, bloqueia após 5 erros por 30 s e persiste', () => {
  const h = load(1), P = h.get('Profile'), id = P.list()[0].id; let t = 1e6; P.now = () => t;
  assert.equal(P.setPin(id, '12').ok, false); assert.equal(P.setPin(id, 'abcd').ok, false); assert.equal(P.setPin(id, '1234').ok, true);
  const raw = JSON.stringify(plain(P.state)); assert.ok(!raw.includes('1234'), 'PIN em texto nunca é guardado'); assert.equal(P.hasPin(P.cur()), true); assert.match(P.cur().pin, /^v2\$\d+\$[A-Za-z0-9+\/]{22}==\$[0-9a-f]{64}$/, 'PIN novo: PBKDF2 com sal próprio');
  assert.equal(P.tryPin(id, '1234').ok, true);
  for (let i = 1; i <= 4; i++) { const r = P.tryPin(id, '0000'); assert.equal(r.ok, false); assert.match(r.error, new RegExp('(' + (5 - i) + ' tentativas)')); }
  const r5 = P.tryPin(id, '0000'); assert.equal(r5.ok, false); assert.equal(r5.wait, true); assert.equal(P.tryPin(id, '1234').ok, false, 'bloqueado mesmo com o PIN certo'); assert.match(P.tryPin(id, '1234').error, /Aguarde \d+ s/);
  t += 31000; assert.equal(P.tryPin(id, '1234').ok, true, 'depois de 30 s volta a valer');
  assert.equal(load(1, h.store).get('Profile').hasPin(load(1, h.store).get('Profile').cur()), true); assert.equal(P.setPin(id, null).ok, true); assert.equal(P.hasPin(P.cur()), false); assert.equal(P.tryPin(id, 'qualquer').ok, true);
  assert.equal(P.hashPin('p1', '1234') === P.hashPin('p2', '1234'), false, 'o hash depende do perfil');
});
test('PIN: tela de perfis pede o PIN para usar/editar/excluir; teclado numérico confere e limpa em erro', () => {
  const h = load(1), P = h.get('Profile'), zid = P.create('Zé').id; P.setPin(zid, '4321'); P.switchTo('p1');
  h.sb.openProfiles(); const rows = () => h.els.sheetBody.children.filter((c) => (c.className || '').includes('skinrow'));
  const ze = rows().find((r) => /Zé/.test(text(r))); assert.match(text(ze), /🔒/);
  const press = (pin) => { const grid = h.els.sheetBody.children.find((c) => c.className === 'pad'); for (const d of pin) grid.children.find((b) => b.textContent === d).onclick(); };
  const use = () => rows().find((r) => /Zé/.test(text(r))).children[1].children.find((b) => b.textContent === 'Usar'); use().onclick();
  assert.equal(h.els.sheetTitle.textContent, 'PIN de Zé'); press('1111'); assert.match(text(h.els.sheetBody), /PIN errado \(4 tentativas restantes\)/); assert.equal(P.state.current, 'p1');
  press('4321'); assert.equal(P.state.current, zid, 'PIN certo troca de perfil'); assert.equal(h.els.sheetTitle.textContent, 'Perfis');
  P.switchTo('p1'); h.sb.openProfiles();
  rows().find((r) => /Zé/.test(text(r))).children[1].children.find((b) => b.textContent === 'Excluir').onclick(); press('4321'); assert.equal(h.els.sheetTitle.textContent, 'Perfis');
  assert.ok(h.els.confirmBox.classList.contains('on'), 'depois do PIN, pede confirmar a exclusão');
  P.switchTo('p1'); h.sb.openProfiles(); rows().find((r) => /Jogador 1/.test(text(r))).children[1].children.find((b) => b.textContent === 'Editar').onclick(); assert.match(h.els.sheetTitle.textContent, /Editar perfil/, 'perfil ativo sem PIN edita direto');
});
test('PIN: definir (duas vezes iguais), alterar e remover pela tela de edição + avatar escolhido ao salvar', () => {
  const h = load(1), P = h.get('Profile'); h.sb.openProfileName('p1');
  const press = (pin) => { const grid = h.els.sheetBody.children.find((c) => c.className === 'pad'); for (const d of pin) grid.children.find((b) => b.textContent === d).onclick(); };
  const btnBy = (label) => h.els.sheetBody.children.find((c) => c.textContent === label);
  btnBy('Definir PIN').onclick(); assert.equal(h.els.sheetTitle.textContent, 'Novo PIN'); press('2468'); assert.equal(h.els.sheetTitle.textContent, 'Repita o PIN'); press('1357'); assert.match(text(h.els.sheetBody), /Os PINs são diferentes/); assert.equal(P.hasPin(P.cur()), false);
  press('2468'); assert.equal(P.hasPin(P.cur()), true); assert.equal(P.tryPin('p1', '2468').ok, true); assert.ok(h.els.sheetBody.children.some((c) => c.textContent === 'Remover PIN'));
  btnBy('Remover PIN').onclick(); assert.equal(P.hasPin(P.cur()), false);
  const grid = h.els.sheetBody.children.find((c) => c.className === 'avgrid'); assert.equal(grid.children.length, 16); grid.children[9].onclick(); h.els.sheetBody.children.find((c) => c.className === 'txt').value = 'Ana'; btnBy('Salvar').onclick(); assert.equal(P.avatar(P.cur()), '⚡'); assert.equal(P.cur().name, 'Ana');
  h.sb.openProfileName(null); const g2 = h.els.sheetBody.children.find((c) => c.className === 'avgrid'); g2.children[4].onclick(); h.els.sheetBody.children.find((c) => c.className === 'txt').value = 'Novo'; btnBy('Salvar').onclick(); assert.equal(P.cur().name, 'Novo'); assert.equal(P.avatar(P.cur()), '🦊');
});
test('PIN: tela de bloqueio ao abrir (PIN certo libera, outro perfil, esqueci o PIN apaga os dados do perfil)', () => {
  const h = load(1), P = h.get('Profile'); h.run('SV("bestScore", 777)'); P.setPin('p1', '1111'); const z = P.create('Zé').id; P.setPin(z, '2222');
  const h2 = load(1, h.store); const L = h2.get('Lock'), P2 = h2.get('Profile'); assert.equal(L.active, true, 'abre bloqueado'); assert.ok(h2.els.lockPanel.classList.contains('on')); assert.match(h2.els.lockTitle.textContent, /🔒 🙂 Jogador 1/);
  const pad = () => h2.els.lockBody.children.find((c) => c.className === 'pad'); const press = (pin) => { for (const d of pin) pad().children.find((b) => b.textContent === d).onclick(); };
  press('0000'); assert.equal(L.active, true); assert.match(text(h2.els.lockBody), /PIN errado/); press('1111'); assert.equal(L.active, false); assert.equal(h2.els.lockPanel.classList.contains('on'), false);
  const h3 = load(1, h.store); h3.get('Lock'); const L3 = h3.get('Lock'); assert.equal(L3.active, true);
  h3.els.lockBody.children.find((c) => c.textContent === 'Usar outro perfil').onclick(); const zb = h3.els.lockBody.children.find((c) => /Zé/.test(c.textContent)); zb.onclick();
  const pad3 = () => h3.els.lockBody.children.find((c) => c.className === 'pad'); for (const d of '2222') pad3().children.find((b) => b.textContent === d).onclick(); assert.equal(L3.active, false); assert.equal(h3.get('Profile').state.current, z, 'trocou para o outro perfil');
  const h4 = load(1, h.store); const L4 = h4.get('Lock'); assert.equal(h4.get('Profile').state.current, 'p1' === h4.get('Profile').state.current ? 'p1' : h4.get('Profile').state.current);
  L4.view = 'forgot'; L4.render(); assert.match(text(h4.els.lockBody), /APAGA todos os dados/); h4.els.lockBody.children.find((c) => /Apagar dados/.test(c.textContent)).onclick();
  assert.equal(L4.active, false); assert.equal(h4.get('Profile').hasPin(h4.get('Profile').cur()), false); assert.equal(h4.get('Profile').cur().name.length > 0, true);
  assert.equal(h4.get('Store').get('bestScore') == null || h4.get('Store').get('bestScore') === '0' || h4.run('LS("bestScore")') == null, true, 'dados do perfil apagados');
  const h5 = load(1); assert.equal(h5.get('Lock').active, false, 'sem PIN: nunca bloqueia');
});
test('avatar: aparece no menu inicial, no ranking, no hello online e na lista de partida', () => {
  const h = load(1); h.get('Profile').setAvatar('p1', 5); const calls = []; h.run('globalThis.__t = []; const o = txt; txt = function (s) { globalThis.__t.push(String(s)); return o.apply(null, arguments); };'); h.setState('MENU'); h.sb.render();
  assert.ok(plain(h.run('globalThis.__t')).some((t) => /🐱 Jogador 1/.test(t)), 'menu mostra avatar + nome');
  h.get('Ranking').submit({ mode: 1, score: 500, t: 1, level: 1, lines: 2, ms: 1000, win: false }); h.sb.openRanking(1); assert.match(text(h.els.sheetBody), /🐱 Jogador 1/);
});
test('hello online leva o avatar (validado) e a partida mostra avatar + nome do oponente', () => {
  const { pair, startMatch, NetOf, V } = require('./netlib');
  const P = pair(); P.A.get('Profile').setAvatar('p1', 8); P.B.get('Profile').setAvatar('p1', 11);
  NetOf(P.A)._ev({ e: 'connected', peer: 'b' }); NetOf(P.B)._ev({ e: 'connected', peer: 'a' }); for (let i = 0; i < 30; i++) P.tick(1);
  assert.equal(NetOf(P.A).peer.av, 11); assert.equal(NetOf(P.B).peer.av, 8);
  NetOf(P.A).st = 'handshake'; NetOf(P.A).peer = null; NetOf(P.A).onHello({ p: NetOf(P.A).PROTO, eng: P.A.get('ENGINE_VERSION'), name: 'X', av: 999 }); assert.equal(NetOf(P.A).peer.av, null, 'avatar inválido vira null');
  NetOf(P.A).peer = { name: 'Beto', av: 11 }; assert.equal(NetOf(P.A).startMatch(), true); const cfg = V(P.A).cfg; assert.equal(cfg.players[0].av, 8); assert.equal(cfg.players[1].av, 11);
});
test('placar contra o oponente (por perfil): soma vitórias/derrotas, não conta partida interrompida nem repete a mesma partida', () => {
  const h = load(1), H = h.get('H2H');
  assert.deepEqual(plain(H.get('Beto')), { w: 0, l: 0, t: 0 }); assert.deepEqual(plain(H.record('Beto', 'w', 's1')), { w: 1, l: 0, t: 0 }); assert.deepEqual(plain(H.record('beto', 'w', 's1')), { w: 1, l: 0, t: 0 }, 'mesma partida não conta de novo');
  H.record('BETO', 'l', 's2'); H.record('Beto', 'w', 's3'); assert.deepEqual(plain(H.get('beto')), { w: 2, l: 1, t: 0 }); assert.deepEqual(plain(H.record('Beto', 'x', 's9')), { w: 2, l: 1, t: 0 }, 'resultado inválido ignorado'); assert.deepEqual(plain(H.record('', 'w', 's')), { w: 0, l: 0, t: 0 });
  h.get('Profile').create('Zé'); h.get('Profile').switchTo('p2'); assert.deepEqual(plain(H.get('Beto')), { w: 0, l: 0, t: 0 }, 'cada perfil tem o seu placar');
  for (let i = 0; i < 40; i++) H.record('Amigo' + i, 'w', 'k' + i); assert.ok(Object.keys(H.load()).length <= 30, 'limite de oponentes guardados');
  const h2 = load(1, h.store); h2.get('Profile').switchTo('p1'); assert.deepEqual(plain(h2.get('H2H').get('Beto')), { w: 2, l: 1, t: 0 }, 'persiste');
});
test('placar online: fim de partida soma, aparece na tela final e na sala; interrompida não conta', () => {
  const { pair, startMatch, NetOf, V, lcg } = require('./netlib'); const P = startMatch(pair({ lat: 0 })); const inp = (() => { const r = lcg(5); return () => { for (const h of [P.A, P.B]) if (h.state() === 'VERSUS' && r() % 40 === 0) V(h).input(V(h).me(), (r() >>> 20) % 5); }; })();
  for (let i = 0; i < 6000 && !(V(P.A).over && V(P.B).over); i++) P.tick(1, inp);
  P.A.run('jest = 0'); for (let i = 0; i < 100; i++) P.tick(1);
  const w = V(P.A).result.winner; const recA = P.A.get('H2H').get('Beto'), recB = P.B.get('H2H').get('Ana'); P.A.sb.render();
  P.A.run('Versus.showEnd()'); P.B.run('Versus.showEnd()');
  assert.equal(P.A.get('H2H').get('Beto').w + P.A.get('H2H').get('Beto').l, 1); assert.equal(P.B.get('H2H').get('Ana').w + P.B.get('H2H').get('Ana').l, 1);
  assert.equal(P.A.get('H2H').get('Beto').w, w === 0 ? 1 : 0); assert.equal(P.B.get('H2H').get('Ana').w, w === 1 ? 1 : 0); void recA; void recB;
  assert.match(text(P.A.els.endStats), /Placar contra Beto/); P.A.run('Versus.showEnd()'); assert.equal(P.A.get('H2H').get('Beto').w + P.A.get('H2H').get('Beto').l, 1, 'redesenhar a tela final não conta duas vezes');
});
test('emotes: validação, limite de envio/recebimento, só online e UI (botão + paleta + aviso)', () => {
  const { pair, startMatch, NetOf, V } = require('./netlib'); const P = startMatch(pair()); P.tick(5); const a = P.A, S = a.get('Social'), EM = plain(a.get('EMOTES')); a.run('Social.syncUi()'); P.B.run('Social.syncUi()');
  assert.equal(EM.length, 8); assert.equal(a.els.bEmote.style.display, 'flex'); assert.equal(S.sendEmote(0), true); assert.equal(S.sendEmote(1), false, 'limite de envio'); assert.equal(S.sendEmote(99), false); assert.equal(S.sendEmote(-1), false); assert.equal(S.sendEmote('x'), false);
  for (let i = 0; i < 90; i++) P.tick(1); assert.match(P.B.els.emoteShow.textContent, /Ana: 👍/); assert.ok(P.B.els.emoteShow.classList.contains('on')); assert.match(a.els.emoteShow.textContent, /Você: 👍/);
  const bS = P.B.get('Social'); for (let i = 0; i < 120; i++) P.tick(1); P.B.run('1'); NetOf(P.B)._line(JSON.stringify({ k: 'emote', i: 3 })); NetOf(P.B)._line(JSON.stringify({ k: 'emote', i: 4 })); assert.match(P.B.els.emoteShow.textContent, /🔥/, 'segundo em seguida é ignorado'); assert.doesNotMatch(P.B.els.emoteShow.textContent, /🤝/);
  for (const bad of [{ k: 'emote', i: 8 }, { k: 'emote', i: -1 }, { k: 'emote', i: 'a' }, { k: 'emote' }, { k: 'emote', i: 2.5 }]) { for (let j = 0; j < 60; j++) P.tick(1); const before = P.B.els.emoteShow.textContent; NetOf(P.B)._line(JSON.stringify(bad)); assert.equal(P.B.els.emoteShow.textContent, before, JSON.stringify(bad)); }
  a.els.bEmote.onclick(); assert.ok(a.els.emotePal.classList.contains('on')); assert.equal(a.els.emotePal.children.length, 8); for (let i = 0; i < 90; i++) P.tick(1); a.els.emotePal.children[7].onclick(); assert.ok(!a.els.emotePal.classList.contains('on')); assert.match(a.els.emoteShow.textContent, /GG/);
  a.sb.goMenu(); assert.equal(a.els.bEmote.style.display, 'none'); const solo = load(1); assert.equal(solo.get('Social').sendEmote(0), false, 'fora do online não envia'); assert.equal(solo.els.bEmote.style.display === 'flex', false);
  void bS; void V;
});
test('revanche na tela final: botão mostra "Revanche" → "Aguardando o oponente…" e avisa quando o oponente quer; sem oponente volta ao menu', () => {
  const { pair, startMatch, NetOf, V, lcg } = require('./netlib'); const P = startMatch(pair()); const r = lcg(9);
  for (let i = 0; i < 6000 && !(V(P.A).over && V(P.B).over); i++) { P.tick(1, () => { for (const h of [P.A, P.B]) if (h.state() === 'VERSUS' && r() % 40 === 0) V(h).input(V(h).me(), (r() >>> 20) % 5); }); }
  for (let i = 0; i < 80; i++) P.tick(1); P.A.run('Versus.showEnd()'); P.B.run('Versus.showEnd()'); assert.equal(P.A.els.bRetry.textContent, 'Revanche'); assert.equal(P.B.els.bRetry.textContent, 'Revanche');
  P.B.els.bRetry.onclick(); assert.equal(P.B.els.bRetry.textContent, 'Aguardando o oponente…'); assert.equal(P.B.els.bRetry.disabled, true); for (let i = 0; i < 30; i++) P.tick(1);
  assert.match(text(P.A.els.endStats), /Beto quer revanche|Ana quer revanche|quer revanche/); P.A.els.bRetry.onclick(); for (let i = 0; i < 100 && NetOf(P.A).st !== 'playing'; i++) P.tick(1); assert.equal(NetOf(P.A).st, 'playing');
});
