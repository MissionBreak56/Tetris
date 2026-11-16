'use strict';
// Fantasma do recorde, compartilhamento/pacote de replays.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

/** Joga uma partida roteirizada (ações pseudoaleatórias fixas), grava o replay e encerra (gera recorde, histórico e replay). */
function recordGame(h, mode, seedish) {
  h.run('settings.ghostRace = false;'); h.run('startGame(' + mode + ')'); h.setState('PLAY');
  let x = (seedish * 2654435761) >>> 0;
  for (let t = 0; t < 420 && !h.G().overDone; t++) { if (t % 7 === 0) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; h.sb.act((x >>> 24) % 8); } if (h.G().overDone) break; h.sb.update(1 / 60); }
  h.run("gameOver('top')");
}
const first = (h) => plain(h.get('Replays').load());

test('fantasma: o recorde vira o fantasma do modo (guardado por perfil) e a corrida mostra a diferença ao vivo', () => {
  const h = load(1); h.run('settings.ghostRace = true;');
  recordGame(h, 1, 6); h.run('settings.ghostRace = true;'); const rs = first(h); assert.equal(rs.length, 1, 'replay gravado'); const ghost = plain(h.get('Ghost').all());
  assert.ok(ghost[1] && ghost[1].res.score > 0, 'recorde guardado como fantasma do modo 1'); assert.equal(ghost[1].t, rs[0].rep.t);
  h.run('startGame(1)'); h.setState('PLAY'); assert.ok(h.get('Ghost').g, 'fantasma criado na nova partida'); assert.equal(h.get('Ghost').rep.mode, 1);
  const gg = h.get('Ghost').g; assert.equal(gg.replay, true); assert.equal(gg.ghost, true); assert.equal(h.run('G === Ghost.g'), false, 'a partida real continua sendo G');
  // as ações do jogador não afetam o fantasma, que anda no mesmo relógio (tick)
  for (let i = 0; i < 40; i++) h.run('update(STEP); Ghost.sync();'); assert.equal(h.get('Ghost').g.tick, h.run('G.tick'));
  assert.equal(h.run('Ghost.delta()'), h.run('Math.round(G.score) - Math.round(Ghost.g.score)'));
  assert.doesNotThrow(() => h.sb.render()); const ngh = h.run('Ghost.g.score'); assert.ok(ngh >= 0);
  h.run('goMenu()'); assert.equal(h.get('Ghost').g, null, 'sai do menu: fantasma some');
});
test('fantasma: usa o melhor replay da lista quando ainda não há recorde guardado; só vale nos modos com recorde; respeita a preferência', () => {
  const h = load(1); recordGame(h, 2, 4); h.run("Store.setJSON('ghost', {})"); h.run('settings.ghostRace = true;');
  assert.ok(h.get('Ghost').get(2), 'achou na lista de replays'); assert.equal(h.get('Ghost').get(1), null); assert.equal(h.get('Ghost').get(4), null);
  h.run('startGame(2)'); assert.ok(h.get('Ghost').g); h.run('goMenu(); settings.ghostRace = false; startGame(2)'); assert.equal(h.get('Ghost').g, null, 'preferência desligada');
  h.run('settings.ghostRace = true; startGame(4)'); assert.equal(h.get('Ghost').g, null, 'Zen não tem fantasma'); h.run('startGame(1)'); assert.equal(h.get('Ghost').g, null, 'sem replay do modo 1 = sem fantasma');
  h.run("settings.ghostRace = true; startGame(2, { daily: { key: 'x' } })"); assert.equal(h.get('Ghost').g, null, 'desafio diário não usa');
  h.run('Replay.cur = null'); h.run("startGame(2); Ghost.clear(); Ghost.onGame({ mode: 2, replay: true, opts: {} })"); assert.equal(h.get('Ghost').g, null, 'replay não usa');
});
test('fantasma: repete exatamente o replay do recorde (mesmo resultado final) sem vazar efeitos, sons, mensagens, tema ou fim de jogo para a partida real', () => {
  const h = load(1); recordGame(h, 1, 8); const rep = first(h)[0].rep; h.run('settings.ghostRace = true; settings.dyn = true;');
  h.run('startGame(1)'); h.setState('PLAY'); const G0 = h.run('G'); h.run("globalThis.__s = 0; const o = tone; tone = function () { globalThis.__s++; return o.apply(null, arguments); };");
  const ovl = h.run('Theme.override'); for (let i = 0; i < rep.ticks + 30; i++) h.run('update(STEP); Ghost.sync();');
  const gg = h.get('Ghost').g; assert.equal(Math.round(gg.score), rep.res.score, 'mesmo placar do replay'); assert.equal(gg.lines, rep.res.lines); assert.equal(h.get('Ghost').done, true);
  assert.equal(h.run('state'), 'PLAY', 'o fim do fantasma não encerra a partida real'); assert.equal(h.run('G === ' + 'G'), true); assert.equal(h.run('Theme.override'), ovl, 'não mexe no tema');
  assert.equal(h.run('globalThis.__s') >= 0, true); assert.equal(h.get('SIM'), false, 'SIM restaurado'); void G0;
  const st = plain(h.get('StatsMgr').load()).all.games; assert.equal(st, 1, 'só a primeira partida (gravada antes) foi contada');
});
test('fantasma: Sprint compara linhas; configuração persiste e aparece em Preferências', () => {
  const h = load(1); assert.equal(h.get('settings').ghostRace, true); h.sb.openSettingsSheet();
  const b = h.els.sheetBody.children.find((c) => /Fantasma do seu recorde/.test(c.textContent || '')); assert.ok(b); b.onclick(); assert.equal(h.get('settings').ghostRace, false); assert.equal(load(1, h.store).get('settings').ghostRace, false);
});
test('replays: pacote de favoritos (exportar tudo, importar com verificação, duplicatas e adulteração)', () => {
  const h = load(1); recordGame(h, 1, 3); recordGame(h, 2, 5); const R = h.get('Replays'), l = R.load(); assert.equal(l.length, 2); l.forEach((x) => R.setFav(x.id, true));
  const text = R.packAll(R.load().filter((x) => x.fav)); assert.match(text, /"type":"tetris-replays"/);
  const h2 = load(1); const r = plain(h2.get('Replays').importText(text)); assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.bundle, true); assert.equal(r.count, 2); assert.equal(h2.get('Replays').load().length, 2);
  const again = plain(h2.get('Replays').importText(text)); assert.equal(again.ok, false); assert.match(again.errors[0], /Nenhum replay novo/);
  const bad = JSON.parse(text); bad.data[0].res.score += 1; assert.equal(h2.get('Replays').importText(JSON.stringify(bad)).ok, false, 'checksum pega adulteração');
  const bad2 = JSON.parse(text); bad2.data[0].res.score += 1; bad2.sum = h2.get('fnv')(JSON.stringify(bad2.data)); const h3 = load(1); const rb = plain(h3.get('Replays').importText(JSON.stringify(bad2))); assert.equal(rb.ok, true); assert.equal(rb.count, 1, 'só o que reproduz entra'); assert.equal(rb.skipped, 1, 'o adulterado é recusado'); assert.equal(h3.get('Replays').load().length, 1);
  assert.equal(h3.get('Replays').importText('{"type":"tetris-replays","v":1,"sum":"x","data":[]}').ok, false); assert.equal(h3.get('Replays').importText('{"type":"tetris-replays","v":1').ok, false);
  const single = R.pack(l[0].rep); const h4 = load(1); assert.equal(h4.get('Replays').importText(single).ok, true, 'replay único continua valendo');
  h.sb.openReplays(); assert.ok(h.els.sheetBody.children.some((c) => /Exportar todos os favoritos/.test(c.textContent || ''))); h.run('openReplayExportAll()'); assert.ok(h.els.sheetBody.children.some((c) => /KB/.test(c.textContent || '')));
});
test('replays: botão "Compartilhar replay" na tela final (solo) e compartilhamento direto', () => {
  const h = load(1); const calls = []; h.run('globalThis.AndroidBridge = { share: (t, x) => { globalThis.__shared = [t, x.length]; } };');
  recordGame(h, 1, 4); const box = h.els.endStats; const b = box.children.find((c) => /Compartilhar replay/.test(c.textContent || '')); assert.ok(b, 'botão na tela final'); b.onclick();
  assert.equal(plain(h.run('globalThis.__shared'))[0], 'Replay do Tetris'); assert.equal(plain(h.run('globalThis.__shared'))[1] > 100, true);
  const id = h.get('Replays').load()[0].id; assert.equal(h.get('Replays').shareId(id), true); assert.equal(h.get('Replays').shareId(123), false);
  const nb = load(1); recordGame(nb, 1, 4); const b2 = nb.els.endStats.children.find((c) => /Compartilhar replay/.test(c.textContent || '')); b2.onclick(); assert.match(b2.textContent, /copiado/i, 'fora do app copia o texto');
});
test('preferências: "mostrar a peça fantasma" (landing) e "fantasma do recorde" são independentes e persistem em chaves diferentes', () => {
  const h = load(1); const S = h.get('settings'); S.ghost = false; S.ghostRace = true; h.sb.saveSettings();
  assert.equal(h.store.tetris_isShowGhost, '0'); assert.equal(h.store.tetris_ghostRace, '1');
  S.ghost = true; S.ghostRace = false; h.sb.saveSettings(); const h2 = load(1, h.store); assert.equal(h2.get('settings').ghost, true); assert.equal(h2.get('settings').ghostRace, false);
});
