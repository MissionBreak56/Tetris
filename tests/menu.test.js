'use strict';
// Tela inicial e menu: "Nível inicial" na tela inicial (ao lado do botão de ajustes), menu em grupos e sem a opção de análises PPS/APM.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'index.html'), 'utf8');

test('tela inicial: botão engrenagem agora se chama AJUSTES e há um botão LEVEL com o nível inicial ao lado', () => {
  const g = html.slice(html.indexOf('id="bLevel"'), html.indexOf('</button>', html.indexOf('id="bLevel"')));
  assert.match(g, /AJUSTES/); assert.doesNotMatch(g, /LEVEL/); assert.match(g, /aria-label="Ajustes"/);
  const s = html.slice(html.indexOf('id="bStartLvl"'), html.indexOf('</button>', html.indexOf('id="bStartLvl"')));
  assert.match(s, /id="lvNum"/); assert.match(s, /LEVEL/);
});
test('layout: o botão LEVEL fica ao lado (à esquerda) do AJUSTES, na mesma linha e sem sobrepor', () => {
  const h = load(1), a = h.els.bStartLvl.style, b = h.els.bLevel.style;
  const n = (v) => parseFloat(v);
  assert.ok(n(a.left) + n(a.width) <= n(b.left), 'sem sobreposição'); assert.equal(a.top, b.top); assert.equal(a.width, b.width);
  assert.ok(n(b.left) - (n(a.left) + n(a.width)) < n(a.width) * 0.3, 'bem juntos');
});
test('botão LEVEL abre "Nível inicial" com 30 níveis, mostra o nível escolhido e volta à tela inicial', () => {
  const h = load(1); assert.equal(String(h.els.lvNum.textContent), '1');
  h.els.bStartLvl.onclick();
  assert.equal(h.els.sheet.classList.contains('on'), true); assert.equal(h.els.sheetTitle.textContent, 'Nível inicial'); assert.equal(h.get('Sheet').stack.length, 1);
  const grid = h.els.sheetBody.children[0]; assert.equal(grid.children.length, 30);
  grid.children[11].onclick();                                            // nível 12
  assert.equal(h.get('settings').startLevel, 12); assert.equal(String(h.els.lvNum.textContent), '12');
  assert.equal(h.els.sheet.classList.contains('on'), false, 'fechou'); assert.equal(h.els.menu.classList.contains('on'), true);
  assert.equal(String(load(1, h.store).els.lvNum.textContent), '12', 'persiste');
  h.els.bMarathon.onclick(); assert.equal(h.G().level, 12);
});
test('menu (botão AJUSTES): sem "Nível inicial" e sem "Análises (PPS/APM)"; itens organizados em grupos', () => {
  const h = load(1), Hub = h.get('Hub'), labels = Array.from(Hub.items.map((i) => i.label));
  assert.ok(!labels.some((l) => /Nível inicial|Análises|PPS|APM/.test(l)), labels.join(','));
  for (const l of ['Preferências', 'Temas', 'Skins das peças', 'Estatísticas', 'Histórico', 'Ranking local', 'Conquistas', 'Replays', 'Perfis', 'Backup e restauração']) assert.ok(labels.includes(l), l);
  const ids = Array.from(Hub.groups.map((g) => g.id)); for (const it of Hub.items) assert.ok(ids.includes(it.group), it.label);
  h.els.bLevel.onclick(); assert.equal(h.els.sheetTitle.textContent, 'Ajustes');
  const kids = h.els.sheetBody.children, titles = kids.filter((c) => c.className === 'sec').map((c) => c.textContent);
  assert.deepEqual(titles, ['PERSONALIZAR', 'PROGRESSO', 'CONTA E DADOS']);
  const grids = kids.filter((c) => c.className === 'grid2'); assert.equal(grids.length, 3);
  assert.deepEqual(grids.map((g) => g.children.map((b) => b.textContent)), [['Preferências', 'Temas', 'Skins das peças'], ['Estatísticas', 'Histórico', 'Ranking local', 'Conquistas', 'Replays'], ['Perfis', 'Backup e restauração']]);
  grids[0].children[0].onclick(); assert.equal(h.els.sheetTitle.textContent, 'Preferências');
});
test('análises: módulo e script removidos', () => {
  assert.doesNotMatch(html, /analysis\.js/); assert.equal(fs.existsSync(path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'js', 'analysis.js')), false);
});
test('conquistas (com as ex-missões): tela mostra desbloqueadas e estrelas, "em andamento" por progresso e "concluídas" por data', () => {
  const h = load(1, { tetris_stats: JSON.stringify({ all: { lines: 120, games: 3, bestLevel: 4 }, modes: {} }) });
  h.sb.openAchievements();
  const kids = h.els.sheetBody.children, text = (c) => c.textContent || (c.children || []).map(text).join('');
  const heads = kids.filter((c) => c.className === 'sec').map((c) => c.textContent); assert.deepEqual(heads, ['EM ANDAMENTO', 'CONCLUÍDAS']);
  const all = kids.map(text).join('|'); assert.match(all, /Desbloqueadas/); assert.match(all, /Estrelas/);
  assert.match(all, /Faxineiro/); assert.match(all, /recompensa: 2 ⭐/); assert.match(all, /Demolidor/);
  const rows = kids.filter((c) => /achv/.test(c.className)), done = rows.filter((c) => /done/.test(c.className)), todo = rows.filter((c) => !/done/.test(c.className));
  assert.equal(rows.length, h.get('Achv').defs.length); assert.equal(h.get('Achv').defs.length, 30); assert.ok(done.length >= 2 && todo.length > 10); assert.equal(h.get('Rewards').stars(), 1);
});
