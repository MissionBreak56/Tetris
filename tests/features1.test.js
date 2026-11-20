'use strict';
// Música no Versus, vibração por ação, modo economia/automático, níveis da IA, backup do Android.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, plain } = require('./harness');
const ROOT = path.join(__dirname, '..', 'app', 'src', 'main');

test('música de fundo também toca no Versus/online (andamento pelo nível do jogador local) e só no estado de jogo', () => {
  const h = load(1); h.run("settings.music = true; Versus.active = true; Versus.net = null; Versus.B = [{ level: 7 }, { level: 1 }]; state = 'VERSUS'; startMusic(true);");
  const m = h.get('Music'); assert.ok(m.cur); assert.equal(h.run('musicLevel()'), 7);
  h.run('musicTick(); musicTick();'); assert.equal(m.pos, 2, 'avançou no Versus');
  h.run("state = 'VSOVER'; musicTick();"); assert.equal(m.pos, 2, 'não toca depois do fim'); h.run("state = 'COUNT'; musicTick();"); assert.equal(m.pos, 2, 'nem na contagem');
  h.run("state = 'PLAY'; G = { level: 3 }; Versus.active = false; musicTick();"); assert.equal(m.pos, 3, 'solo continua igual'); assert.equal(h.run('musicLevel()'), 3);
});
test('vibração por ação: intensidades 0–3 escalam a duração; padrão só nas ações principais; simulação nunca vibra', () => {
  const h = load(1), calls = []; h.run('navigator.vibrate = (v) => { __calls.push(v); return true; };'.replace('__calls', 'globalThis.__calls')); h.run('globalThis.__calls = [];');
  const get = () => plain(h.run('globalThis.__calls.splice(0)'));
  h.run('settings.vib = true;'); assert.deepEqual(plain(h.run('vibMapParse(null)')), { hard: 2, clear: 2, skill: 2, over: 2, lock: 0, rotate: 0, move: 0 });
  h.run("vib(30, 'hard');"); assert.deepEqual(get(), [30]);
  h.run("settings.vibMap.hard = 1; vib(30, 'hard');"); assert.deepEqual(get(), [15]); h.run("settings.vibMap.hard = 3; vib(30, 'hard');"); assert.deepEqual(get(), [54]);
  h.run("settings.vibMap.hard = 0; vib(30, 'hard');"); assert.deepEqual(get(), []);
  h.run("settings.vibMap.skill = 3; vib([40, 60, 40], 'skill');"); assert.deepEqual(get(), [[72, 60, 72]], 'só as pausas ficam iguais');
  h.run("vib(5, 'move'); vib(8, 'rotate'); vib(14, 'lock');"); assert.deepEqual(get(), [], 'mover/girar/travar vêm desligados');
  h.run("settings.vibMap.move = 2; vib(5, 'move');"); assert.deepEqual(get(), [5]);
  h.run("SIM = true; vib(30, 'hard');"); assert.deepEqual(get(), [], 'simulação (oponente online/replay) não vibra'); h.run('SIM = false; settings.vib = false; vib(30, "hard");'); assert.deepEqual(get(), [], 'vibração geral desligada');
  assert.deepEqual(plain(h.run("vibMapParse({ hard: 9, clear: -1, move: 1, lixo: 3 })")), { hard: 2, clear: 2, skill: 2, over: 2, lock: 0, rotate: 0, move: 1 }, 'valores inválidos voltam ao padrão');
});
test('vibração por ação: o jogo chama vib com o tipo certo (queda rápida, linhas, travar, girar, mover) e persiste/restaura por perfil', () => {
  const h = load(1); h.run('settings.vib = true; globalThis.__k = []; navigator.vibrate = () => true;'); h.run("const o = vib; globalThis.vib = function (ms, kind) { globalThis.__k.push(kind); return o(ms, kind); }; ");
  h.sb.newGame(1); h.setState('PLAY'); h.run('act(A.LEFT, true); act(A.CW, true); act(A.HARD, true);');
  const kinds = plain(h.run('globalThis.__k')); for (const k of ['move', 'rotate', 'hard', 'lock']) assert.ok(kinds.includes(k), k + ' em ' + kinds.join(','));
  h.run("settings.vibMap.hard = 3; settings.vibMap.move = 1; saveSettings();"); const h2 = load(1, h.store); assert.equal(h2.get('settings').vibMap.hard, 3); assert.equal(h2.get('settings').vibMap.move, 1);
});
test('desempenho: Normal / Economia / Automático (bateria ≤ 20% sem carregar ou economia do Android); pula quadros só em economia', () => {
  const h = load(1); assert.equal(h.get('settings').perf, 2, 'padrão: automático');
  const P = h.get('Perf'); assert.equal(P.save(), false, 'sem bateria disponível: normal');
  const bat = (o) => h.run('globalThis.AndroidBridge = { battery: () => ' + JSON.stringify(JSON.stringify(o)) + ' }; Perf.lastCheck = -1e9; Perf.check(1e6); Perf.save()');
  assert.equal(bat({ level: 15, charging: false, saver: false }), true, 'bateria baixa'); assert.equal(bat({ level: 15, charging: true, saver: false }), false, 'carregando'); assert.equal(bat({ level: 80, charging: false, saver: false }), false);
  assert.equal(bat({ level: 80, charging: false, saver: true }), true, 'economia de bateria do Android'); assert.equal(bat({ level: 21, charging: false, saver: false }), false);
  h.run('settings.perf = 0;'); assert.equal(bat({ level: 5, charging: false, saver: true }), false, 'Normal ignora a bateria');
  h.run('settings.perf = 1;'); assert.equal(h.run('Perf.save()'), true, 'Economia sempre liga'); let skipped = 0; for (let i = 0; i < 10; i++) if (h.run('Perf.skipFrame()')) skipped++; assert.equal(skipped, 5, 'metade dos quadros');
  h.run('settings.perf = 0;'); skipped = 0; for (let i = 0; i < 10; i++) if (h.run('Perf.skipFrame()')) skipped++; assert.equal(skipped, 0);
  h.run('settings.perf = 2; globalThis.AndroidBridge = { battery: () => "" }; Perf.lastCheck = -1e9; Perf.check(2e6);'); assert.equal(h.run('Perf.save()'), false, 'sem leitura volta ao normal');
});
test('desempenho: em economia o laço pula quadros, partículas/tremor somem, fundo fica parado e o neon perde o brilho', () => {
  const h = load(1); h.run('settings.perf = 1; settings.fx = true;'); h.run('FX.shake = 5; FX.pulse = 1; FX.parts.push({ x: 1, y: 1, vx: 0, vy: 0, life: 1, max: 1, size: 2, color: "#fff" }); const y0 = BG.stars.length ? BG.stars[0].y : 0; globalThis.__y0 = y0; updateFx(0.1);');
  assert.equal(h.run('FX.shake'), 0); assert.equal(h.run('FX.parts.length'), 0); assert.equal(h.run('BG.stars.length ? BG.stars[0].y : 0'), h.run('globalThis.__y0'), 'estrelas paradas');
  h.run('settings.perf = 0;'); h.run('FX.t = 0; updateFx(0.1);'); if (h.run('BG.stars.length')) assert.notEqual(h.run('BG.stars[0].y'), h.run('globalThis.__y0'), 'em normal o fundo anda');
  assert.doesNotThrow(() => h.sb.render());
  const skins = fs.readFileSync(path.join(ROOT, 'assets/js/skins.js'), 'utf8'); assert.match(skins, /Perf\.save\(\) \? 0 : s \* 0\.3/);
});
test('configurações: telas de vibração por ação e desempenho abrem e alternam', () => {
  const h = load(1); h.sb.openSettingsSheet(); const texts = () => h.els.sheetBody.children.map((c) => c.textContent || '');
  assert.ok(texts().some((t) => /Desempenho: Automático/.test(t))); assert.ok(texts().some((t) => /Vibração por ação/.test(t)));
  const perfBtn = h.els.sheetBody.children.find((c) => /Desempenho:/.test(c.textContent || '')); perfBtn.onclick(); assert.equal(h.get('settings').perf, 0); assert.ok(texts().some((t) => /Desempenho: Normal/.test(t)));
  h.run("openVibSheet()"); const rows = h.els.sheetBody.children.filter((c) => /: (Desligada|Leve|Normal|Forte)$/.test(c.textContent || ''));
  assert.equal(rows.length, 7); const hard = rows.find((c) => /Queda rápida/.test(c.textContent)); hard.onclick(); assert.equal(h.get('settings').vibMap.hard, 3); assert.match(hard.textContent, /Forte/);
  const back = rows.find((c) => /Mover/.test(c.textContent)); for (let i = 0; i < 4; i++) back.onclick(); assert.equal(h.get('settings').vibMap.move, 0);
});
test('IA: 6 níveis (Iniciante … Mestre) aparecem no menu do Versus/torneio, ficam mais fortes e terminam partidas sem erro', () => {
  const h = load(1), AI = h.get('AI'), keys = Object.keys(AI.levels); assert.deepEqual(Array.from(keys), ['beginner', 'easy', 'medium', 'hard', 'expert', 'master']);
  const delays = keys.map((k) => AI.levels[k].delay); for (let i = 1; i < delays.length; i++) assert.ok(delays[i] <= delays[i - 1], 'mais rápida a cada nível');
  const Vs = h.get('Versus'); Vs.MAX_TICKS = 2400;                          // partidas curtas (IAs fortes sobrevivem até o limite de tempo)
  const run = (a, b, seed) => plain(Vs.simulate({ players: [{ kind: 'ai', name: 'A', level: a }, { kind: 'ai', name: 'B', level: b }], seed }));
  for (const lv of keys) { const r = run(lv, 'easy', 17); assert.ok(r && r.ticks > 0, lv); }
  let m = 0, e = 0; for (const seed of [1, 2, 3]) { if (run('master', 'beginner', seed).winner === 0) m++; if (run('expert', 'beginner', seed + 10).winner === 0) e++; }
  assert.ok(m >= 2 && e >= 2, 'níveis altos vencem o Iniciante (' + m + ',' + e + ')');
  Vs.MAX_TICKS = 900; const a = run('expert', 'hard', 5), b = run('expert', 'hard', 5); assert.deepEqual(a, b, 'determinística');
});
test('IA: Mestre/Especialista decidem em tempo razoável (lookahead de 2 peças)', () => {
  const h = load(1); h.run("newGame(8, { seed: 5, rules: { levelUps: true } }); AI.attach(G, 'master', 7);");
  const t0 = Date.now(); for (let i = 0; i < 12; i++) h.run("AI.think(G)"); const ms = (Date.now() - t0) / 12; assert.ok(ms < 150, 'master pensa em ' + ms.toFixed(1) + ' ms');
});
test('Android: backup automático (Google) ligado com regras que incluem só os dados do jogo (localStorage da WebView)', () => {
  const man = fs.readFileSync(path.join(ROOT, 'AndroidManifest.xml'), 'utf8');
  assert.match(man, /android:allowBackup="true"/); assert.match(man, /android:fullBackupContent="@xml\/backup_rules"/); assert.match(man, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
  for (const f of ['backup_rules.xml', 'data_extraction_rules.xml']) { const x = fs.readFileSync(path.join(ROOT, 'res/xml', f), 'utf8'); assert.match(x, /app_webview\/Default\/Local Storage/); assert.doesNotMatch(x.replace(/<!--[\s\S]*?-->/g, ''), /cache/i); }
  const bk = fs.readFileSync(path.join(ROOT, 'assets/js/backup.js'), 'utf8'); assert.match(bk, /Backup automático do Android/);
  const j = fs.readFileSync(path.join(ROOT, 'java/com/missionbreak56/tetris/core/GameBridge.java'), 'utf8'); assert.match(j, /public String battery\(\)/);
});
test('backup manual aceita as novas preferências (vibMap, isPerf) e restaura', () => {
  const h = load(1); h.run("settings.vibMap.hard = 3; settings.perf = 1; saveSettings();"); const B = h.get('Backup'), text = B.text();
  const p = B.parse(text); assert.equal(p.ok, true, (p.errors || []).join()); const h2 = load(1); const r = h2.get('Backup').restore(text); assert.equal(r.ok, true, (r.errors || []).join());
  assert.equal(h2.get('settings').vibMap.hard, 3); assert.equal(h2.get('settings').perf, 1);
});
