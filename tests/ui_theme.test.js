'use strict';
// Interface interna (painéis, botões, textos) controlada pelo tema.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load, plain } = require('./harness');

const UI = ['panel1', 'panel2', 'btn1', 'btn2', 'btnSmall', 'ink', 'dim', 'val'];
const T = (h) => h.get('Theme');
const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255].join(','); };
const mk = (h, patch) => Object.assign({}, plain(T(h).blank()), patch || {});
const contrast = (h, a, b) => h.get('contrast')(a, b);

test('temas embutidos: todos têm as 8 cores de interface, legíveis (contraste) e passam na validação', () => {
  const h = load(1);
  for (let i = 0; i < 4; i++) {
    const t = plain(T(h).builtin(i)); for (const k of UI) assert.match(t[k], /^#[0-9a-f]{6}$/i, `${i}.${k}`);
    for (const p of [t.panel1, t.panel2]) { assert.ok(contrast(h, t.ink, p) >= 4.5, `ink/painel ${i}`); assert.ok(contrast(h, t.dim, p) >= 3, `dim ${i}`); assert.ok(contrast(h, t.val, p) >= 3, `val ${i}`); }
    for (const b of [t.btn1, t.btn2]) assert.ok(contrast(h, t.ink, b) >= 3, `botão ${i}`); assert.ok(contrast(h, t.ink, t.btnSmall) >= 4.5, `botão pequeno ${i}`);
    assert.equal(plain(T(h).validate(Object.assign({}, t, { id: 'c1' }), true)).ok, true, 'tema ' + i);
  }
});
test('os 4 temas embutidos têm interfaces DIFERENTES entre si', () => {
  const h = load(1); const sig = [0, 1, 2, 3].map((i) => { const t = plain(T(h).builtin(i)); return [t.panel1, t.btn1, t.dim].join(); });
  assert.equal(new Set(sig).size, 4);
});
test('applyTheme grava as variáveis CSS da interface e elas mudam ao trocar de tema', () => {
  const h = load(1); const seen = [];
  for (let i = 0; i < 4; i++) {
    h.get('settings').theme = i; h.sb.applyTheme(); const u = plain(T(h).ui());
    assert.equal(h.css['--p1'], rgbOf(u.panel1)); assert.equal(h.css['--p2'], rgbOf(u.panel2)); assert.equal(h.css['--btnbg'], rgbOf(u.btnSmall));
    assert.equal(h.css['--b1'], u.btn1); assert.equal(h.css['--b2'], u.btn2); assert.equal(h.css['--ink'], u.ink); assert.equal(h.css['--dim'], u.dim); assert.equal(h.css['--val'], u.val);
    assert.equal(h.css['--acc'], plain(h.get('THEMES'))[i][2]); seen.push(h.css['--p1']);
  }
  assert.equal(new Set(seen).size, 4, 'o painel muda a cada tema');
});
test('botão THEME troca a interface inteira (painel/botões), não só o fundo', () => {
  const h = load(1); h.sb.applyTheme(); const a = h.css['--p1'] + h.css['--b1'];
  h.els.bTheme.onclick(); const b = h.css['--p1'] + h.css['--b1']; assert.notEqual(a, b);
});
test('tema personalizado: cores de interface editáveis, salvas, aplicadas e persistentes', () => {
  const h = load(1);
  const r = T(h).save(mk(h, { name: 'Neon', panel1: '#2b0a3d', panel2: '#12041c', btn1: '#c026d3', btn2: '#7e1a8a', btnSmall: '#1d0630', ink: '#fdf4ff', dim: '#e9b8f5', val: '#fde047' }));
  assert.equal(r.ok, true, JSON.stringify(r.errors)); h.sb.selectTheme(r.id);
  assert.equal(h.css['--p1'], rgbOf('#2b0a3d')); assert.equal(h.css['--b1'], '#c026d3'); assert.equal(h.css['--ink'], '#fdf4ff'); assert.equal(h.css['--val'], '#fde047'); assert.equal(h.css['--btnbg'], rgbOf('#1d0630'));
  assert.equal(plain(T(h).arr())[5], rgbOf('#1d0630')); assert.equal(plain(T(h).arr())[6], '#c026d3');
  const h2 = load(2, h.store); assert.equal(h2.css['--p1'], rgbOf('#2b0a3d'), 'persistiu após reabrir e foi aplicado na inicialização');
});
test('editar o tema ATIVO atualiza a interface na hora (cache invalidado)', () => {
  const h = load(1); const id = T(h).save(mk(h, { name: 'X' })).id; h.sb.selectTheme(id);
  assert.equal(T(h).ui().panel1, plain(T(h).blank()).panel1);
  assert.equal(T(h).save(Object.assign(mk(h, { name: 'X', panel1: '#101030' }), { id })).ok, true);
  assert.equal(T(h).ui().panel1, '#101030'); h.sb.applyTheme(); assert.equal(h.css['--p1'], rgbOf('#101030'));
  T(h).remove(id); assert.equal(h.get('settings').theme, 0); assert.equal(h.css['--p1'], rgbOf(plain(T(h).builtin(0)).panel1));
});
test('tema personalizado ANTIGO (sem cores de interface) continua válido: cores são derivadas do destaque', () => {
  const b = plain(load(1).get('Theme').builtin(0)); const old = { id: 'c1', name: 'Antigo', bg1: b.bg1, bg2: b.bg2, acc: '#ff8844', board1: b.board1, board2: b.board2, grid: b.grid, ghost: b.ghost, pieces: b.pieces };
  const h = load(1, { tetris_themes: JSON.stringify([old]), tetris_index_bg: 'c1' });
  const t = plain(T(h).customs())[0]; assert.ok(t, 'carregou'); for (const k of UI) assert.match(t[k], /^#[0-9a-f]{6}$/i, k);
  h.sb.applyTheme(); assert.equal(h.css['--ink'], '#ffffff'); assert.ok(h.css['--p1'].split(',').length === 3);
  assert.equal(T(h).save(Object.assign({}, t, { name: 'Antigo2' })).ok, true); assert.ok(JSON.parse(h.store.tetris_themes)[0].panel1, 'migrado ao salvar');
});
test('derivação: qualquer cor de destaque gera interface legível e válida', () => {
  const h = load(1); const r = (() => { let x = 7; return () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0); })();
  const accs = ['#ffffff', '#000000', '#ffff00', '#00ff00', '#ff0000', '#0000ff', '#808080', '#ffd54a'];
  for (let i = 0; i < 60; i++) accs.push('#' + (r() >>> 8).toString(16).padStart(6, '0'));
  for (const acc of accs) {
    const u = plain(T(h).deriveUi(acc)); for (const p of [u.panel1, u.panel2]) { assert.ok(contrast(h, u.ink, p) >= 4.5, 'ink ' + acc); assert.ok(contrast(h, u.dim, p) >= 3, 'dim ' + acc); }
    for (const b of [u.btn1, u.btn2]) assert.ok(contrast(h, u.ink, b) >= 3, 'botão ' + acc); assert.ok(contrast(h, u.ink, u.btnSmall) >= 4.5, 'pequeno ' + acc);
  }
});
test('validação da interface: rejeita texto/valores/botões ilegíveis e cores inválidas', () => {
  const h = load(1); const bad = (p) => plain(T(h).save(mk(h, p)));
  assert.match(bad({ ink: '#101030' }).errors.join(), /Texto com pouco contraste com o painel/);
  assert.match(bad({ dim: '#0c1460' }).errors.join(), /secundário/); assert.match(bad({ val: '#0d1558' }).errors.join(), /valores/);
  assert.match(bad({ btn1: '#fafafa', btn2: '#f0f0f0' }).errors.join(), /botões/); assert.match(bad({ btnSmall: '#f0f0f0' }).errors.join(), /botões pequenos/);
  for (const k of UI) { assert.equal(bad({ [k]: 'azul' }).ok, false, k); assert.equal(bad({ [k]: '#12' }).ok, false, k); }
  assert.equal(T(h).customs().length, 0);
});
test('export/import de tema leva as cores de interface', () => {
  const a = load(1); const id = T(a).save(mk(a, { name: 'Out', panel1: '#14083a', btn1: '#5b21b6', val: '#fbbf24' })).id; const json = T(a).exportJSON(id);
  assert.equal(JSON.parse(json).theme.panel1, '#14083a');
  const b = load(2); assert.equal(plain(T(b).importJSON(json)).ok, true); const t = plain(T(b).customs())[0]; assert.equal(t.panel1, '#14083a'); assert.equal(t.btn1, '#5b21b6'); assert.equal(t.val, '#fbbf24');
});
test('editor mostra a interface (linhas de cor + pré-visualização) sem erro', () => {
  const h = load(1); const id = T(h).save(mk(h)).id;
  assert.doesNotThrow(() => { h.sb.openThemeEditor(null); h.sb.openThemeEditor(id); });
  const txtAll = JSON.stringify(plain(h.els.sheetBody.children.map((c) => c.textContent || ''))); assert.ok(h.els.sheetBody.children.length > 20);
  for (const k of ['panel1', 'btn1', 'ink']) assert.doesNotThrow(() => h.sb.drawUiPreview(h.get('canvas'), Object.assign(plain(T(h).blank()), { [k]: '#123456' }))); void txtAll;
});
test('HUD do canvas usa o texto/secundário do tema (inclui custom)', () => {
  const h = load(1); const id = T(h).save(mk(h, { ink: '#ffeecc', dim: '#ccddff' })).id; h.sb.selectTheme(id);
  h.sb.newGame(1, { seed: 1 }); h.setState('PLAY'); const calls = []; h.sb.__c = calls; h.run("(function(){ const o = txt; txt = function (s, x, y, sz, col) { __c.push([String(s), col]); return o.apply(null, arguments); }; })()"); h.sb.render();
  const col = (s) => calls.find(([t]) => t === s)[1]; assert.equal(col('LEVEL 1'), '#ffeecc'); assert.equal(col('Hold'), '#ffeecc'); assert.equal(col('Next'), '#ffeecc');
});
test('desempenho: tema ativo em cache (não relê o armazenamento a cada quadro)', () => {
  const h = load(1); const id = T(h).save(mk(h)).id; h.sb.selectTheme(id);
  h.sb.newGame(1, { seed: 1 }); h.setState('PLAY');
  let reads = 0; const orig = h.sb.localStorage.getItem; h.sb.localStorage.getItem = (k) => { reads++; return orig(k); };
  for (let i = 0; i < 60; i++) { T(h).cur(); T(h).ui(); T(h).arr(); T(h).extras(); h.sb.render(); }
  assert.equal(reads, 0, 'leituras do armazenamento: ' + reads);
});
test('CSS: painéis, botões e textos usam variáveis do tema (sem cores fixas)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'index.html'), 'utf8');
  const rule = (sel) => { let out = '', i = -1; while ((i = html.indexOf(sel + '{', i + 1)) >= 0) out += html.slice(i, html.indexOf('}', i)) + '}'; assert.ok(out, sel); return out; };
  assert.match(rule('.panel'), /rgba\(var\(--p1\)/); assert.match(rule('.panel'), /rgba\(var\(--p2\)/); assert.match(rule('.panel'), /color:var\(--ink\)/);
  assert.match(rule('.btn'), /var\(--b1\)/); assert.match(rule('.btn'), /color:var\(--ink\)/); assert.match(rule('.btn.small'), /rgb\(var\(--btnbg\)\)/);
  assert.match(rule('.kv b'), /var\(--val\)/); assert.match(rule('.sub'), /var\(--dim\)/); assert.match(rule('.hint'), /var\(--dim\)/);
  assert.doesNotMatch(html, /#0c1456ee|#050a35ee/, 'fundo azul fixo do painel removido');
  for (const v of ['--p1:', '--p2:', '--ink:', '--dim:', '--val:']) assert.ok(html.includes(v), v);
});

// ---- Fora da interface (fundo da página, película das janelas, estrelas) não pode ficar azul fixo ----
const isBlueish = (r, g, b) => b >= r + 25 && b >= g + 10;
const rootDir = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
test('fundo da página e película das janelas usam variáveis do tema (sem azul-marinho fixo)', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.match(html, /html,body\{[^}]*background:var\(--bg2\)/, 'body segue o tema');
  assert.match(html, /\.overlay\{[^}]*background:rgba\(var\(--ov\),\.78\)/, 'película das janelas segue o tema');
  assert.doesNotMatch(html, /rgba\(3,5,35/, 'sem a película azul fixa');
  assert.doesNotMatch(html, /background:#05072a/, 'sem o fundo azul fixo');
});
test('applyTheme: --bg1/--bg2/--ov acompanham o tema; tema cinza gera película cinza, não azul', () => {
  const h = load(1);
  for (let i = 0; i < 4; i++) {
    h.get('settings').theme = i; h.sb.applyTheme(); const t = plain(h.get('THEMES'))[i];
    assert.equal(h.css['--bg1'], t[0]); assert.equal(h.css['--bg2'], t[1]); assert.ok(/^\d+,\d+,\d+$/.test(h.css['--ov']), 'ov = r,g,b');
  }
  const gray = Object.assign(mk(h), { name: 'Cinza', bg1: '#3a3a3a', bg2: '#0c0c0c', acc: '#bdbdbd', grid: '#8a8a8a', ghost: '#9a9a9a',
    panel1: '#161616', panel2: '#080808', btn1: '#2c2c2c', btn2: '#161616', btnSmall: '#0b0b0b', dim: '#bdbdbd' });
  const r = plain(T(h).save(gray)); assert.equal(r.ok, true, JSON.stringify(r.errors));
  h.get('settings').theme = r.id; h.sb.applyTheme();
  const [R, G, B] = h.css['--ov'].split(',').map(Number);
  assert.ok(!isBlueish(R, G, B), 'película neutra no tema cinza: ' + h.css['--ov']);
  assert.equal(h.css['--bg2'], '#0c0c0c');
});
test('renderer/versus/janela nativa não têm azul fixo de "cromo" (estrelas, brilho do placar, logo, cinza do game over, lixo)', () => {
  const rd = fs.readFileSync(path.join(rootDir, 'js', 'core', 'renderer.js'), 'utf8');
  for (const c of ['#cfe0ff', '#4f8bff', '#050b3a', '#0a1550', '#030828', '#5a6080']) assert.ok(!rd.includes(c), 'renderer ainda usa ' + c);
  assert.doesNotMatch(fs.readFileSync(path.join(rootDir, 'js', 'versus.js'), 'utf8'), /#6b7390/);
  const j = fs.readFileSync(path.join(rootDir, '..', 'java', 'com', 'missionbreak56', 'tetris', 'MainActivity.java'), 'utf8');
  assert.doesNotMatch(j, /#0b0e17/);
});
test('cor das estrelas deriva do destaque do tema (cinza → estrela cinza-clara, não azulada)', () => {
  const h = load(1); const mix = h.get('mixHex');
  const star = mix('#bdbdbd', '#ffffff', .8); const n = parseInt(star.slice(1), 16);
  assert.ok(!isBlueish(n >> 16, (n >> 8) & 255, n & 255), star);
});
