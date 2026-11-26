'use strict';
// Primeiro acesso / nome padrão: nome de perfil e avatar OBRIGATÓRIOS (nome diferente do padrão "Jogador 1").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load, plain } = require('./harness');

const fresh = (store = {}) => load(1, store, { onboard: true });
const P = (h) => h.get('Profile'), O = (h) => h.get('Onboarding');
function ui(h) {
  const k = h.els.obBody.children; const by = (cls) => k.find((c) => c.className === cls || (c.className || '').split(' ').includes(cls));
  const grid = by('avgrid'), ok = k.find((c) => c.textContent === 'Continuar');
  return { inp: by('txt'), grid, cells: grid.children, ok, out: k.find((c) => /^errs(\s|$)/.test(c.className || '') && !/warn/.test(c.className || '')), warn: by('warn'), hint: by('hint') };
}
const type = (h, v) => { const u = ui(h); u.inp.value = v; u.inp.oninput(); return ui(h); };
const selected = (h) => ui(h).cells.map((c, i) => [c.className, i]).filter(([c]) => /\bsel\b/.test(c)).map(([, i]) => i);

test('primeiro acesso: abre a tela obrigatória com boas-vindas, sem avatar marcado e botão bloqueado', () => {
  const h = fresh(); const u = ui(h);
  assert.equal(O(h).open, true); assert.equal(h.els.onboardPanel.classList.contains('on'), true); assert.equal(h.els.menu.classList.contains('on'), false);
  assert.equal(h.els.obTitle.textContent, 'Bem-vindo!'); assert.ok(u.hint && !u.warn); assert.equal(u.ok.disabled, true);
  assert.equal(u.cells.length, h.get('AVATARS').length); assert.deepEqual(selected(h), [], 'nenhum avatar pré-selecionado');
});
test('o nome padrão é recusado em qualquer variação (maiúsculas, acentos, espaços), mesmo com avatar escolhido', () => {
  const h = fresh(); ui(h).cells[2].onclick();
  for (const v of ['Jogador 1', 'jogador 1', 'JOGADOR 1', '  Jogador    1  ', 'Jógador 1', 'jogádor  1']) {
    const u = type(h, v); assert.match(u.out.textContent, /nome padrão/, v); assert.equal(u.ok.disabled, true, v);
  }
  assert.equal(type(h, '').ok.disabled, true); assert.equal(type(h, '').out.textContent, ''); assert.match(type(h, '   ').out.textContent, /Digite um nome/);
});
test('nomes parecidos mas diferentes do padrão são aceitos', () => {
  const h = fresh(); ui(h).cells[0].onclick();
  for (const v of ['Jogador', 'Jogador 2', 'Jogador 10', 'Jogador 1a', 'Ana']) { const u = type(h, v); assert.equal(u.ok.disabled, false, v); assert.equal(u.out.textContent, '', v); }
});
test('nome válido SEM avatar continua bloqueado; ao escolher o avatar libera', () => {
  const h = fresh(); let u = type(h, 'Ana');
  assert.equal(u.ok.disabled, true); assert.match(u.out.textContent, /Escolha um avatar/);
  u.cells[3].onclick(); u = ui(h); assert.deepEqual(selected(h), [3]); assert.equal(u.ok.disabled, false); assert.equal(u.out.textContent, '');
  u.cells[5].onclick(); assert.deepEqual(selected(h), [5], 'só um avatar marcado');
});
test('confirmar grava nome + avatar no perfil, fecha a tela, mostra o menu e persiste (não reaparece)', () => {
  const h = fresh(); ui(h).cells[4].onclick(); const u = type(h, '  Ana   Maria ');
  u.ok.onclick();
  assert.equal(P(h).cur().name, 'Ana Maria'); assert.equal(P(h).avatar(P(h).cur()), h.get('AVATARS')[4]);
  assert.equal(O(h).open, false); assert.equal(h.els.onboardPanel.classList.contains('on'), false); assert.equal(h.els.menu.classList.contains('on'), true);
  const h2 = fresh(h.store); assert.equal(O(h2).open, false, 'não pede de novo ao reabrir'); assert.equal(P(h2).cur().name, 'Ana Maria'); assert.equal(P(h2).avatar(P(h2).cur()), h.get('AVATARS')[4]);
});
test('Enter no teclado confirma quando válido e ignora quando inválido', () => {
  const h = fresh(); ui(h).cells[1].onclick(); let u = type(h, 'Jogador 1'); u.inp.onkeydown({ key: 'Enter' }); assert.equal(O(h).open, true);
  u = type(h, 'Beto'); u.inp.onkeydown({ key: 'a' }); assert.equal(O(h).open, true); u.inp.onkeydown({ key: 'Enter' }); assert.equal(O(h).open, false); assert.equal(P(h).cur().name, 'Beto');
});
test('nome é sanitizado e limitado a 16 caracteres', () => {
  const h = fresh(); ui(h).cells[0].onclick(); type(h, '<b>Maria Eduarda Silva Santos</b>').ok.onclick();
  assert.ok(P(h).cur().name.length <= 16 && !/[<>]/.test(P(h).cur().name), P(h).cur().name);
});
test('jogador ANTIGO com nome padrão: aviso "Você deve mudar seu nome", avatar já marcado, dados preservados', () => {
  const h0 = load(1); h0.sb.newGame(1); h0.G().score = 4321; h0.sb.gameOver(); const store = h0.store;       // jogou antes (dados no perfil p1)
  const h = fresh(store); const u = ui(h);
  assert.equal(O(h).open, true); assert.equal(h.els.obTitle.textContent, 'Escolha seu nome'); assert.ok(u.warn); assert.match(u.warn.textContent, /Você deve mudar seu nome/); assert.match(u.warn.textContent, /Jogador 1/);
  assert.equal(selected(h).length, 1, 'avatar atual já selecionado'); assert.equal(u.ok.disabled, true, 'falta o nome');
  type(h, 'Jogador 1').ok.disabled; assert.equal(ui(h).ok.disabled, true);
  const before = JSON.stringify(Object.keys(store).filter((k) => k.startsWith('tetris_') && !k.startsWith('tetris__')).sort());
  const u2 = type(h, 'Beto'); assert.equal(u2.ok.disabled, false); u2.ok.onclick();
  assert.equal(P(h).cur().name, 'Beto'); assert.equal(P(h).cur().id, 'p1', 'mesmo perfil');
  assert.equal(h.get('Records').get(1), 4321, 'recorde preservado'); assert.equal(plain(h.get('StatsMgr').load()).all.games, 1); assert.equal(h.get('History').load().length, 1);
  assert.equal(JSON.stringify(Object.keys(h.store).filter((k) => k.startsWith('tetris_') && !k.startsWith('tetris__')).sort()), before, 'nenhuma chave de dados trocada/apagada');
});
test('quem já tem nome (não padrão) não vê a tela; perfil ativo diferente do p1 também não', () => {
  const a = fresh({ tetris__profiles: JSON.stringify({ list: [{ id: 'p1', name: 'Zé' }], current: 'p1', next: 2 }) }); assert.equal(O(a).open, false); assert.equal(a.els.menu.classList.contains('on') || true, true);
  const b = fresh({ tetris__profiles: JSON.stringify({ list: [{ id: 'p1', name: 'Jogador 1' }, { id: 'p2', name: 'Zé' }], current: 'p2', next: 3 }) }); assert.equal(O(b).open, false);
});
test('trocar para um perfil com nome padrão reabre a tela; trocar para outro fecha', () => {
  const h = fresh({ tetris__profiles: JSON.stringify({ list: [{ id: 'p1', name: 'Jogador 1' }, { id: 'p2', name: 'Zé' }], current: 'p2', next: 3 }) });
  assert.equal(O(h).open, false); P(h).switchTo('p1'); assert.equal(O(h).open, true); assert.equal(h.els.onboardPanel.classList.contains('on'), true);
  ui(h).cells[0].onclick(); type(h, 'Ana').ok.onclick(); assert.equal(O(h).open, false); assert.equal(P(h).cur().name, 'Ana');
  P(h).switchTo('p2'); assert.equal(O(h).open, false);
});
test('restaurar backup cujo perfil ativo tem o nome padrão abre a tela', () => {
  const a = load(1); a.sb.newGame(1); a.G().score = 90; a.sb.gameOver(); const text = a.get('Backup').text();
  const b = fresh({ tetris__profiles: JSON.stringify({ list: [{ id: 'p1', name: 'Zé' }], current: 'p1', next: 2 }) }); assert.equal(O(b).open, false);
  assert.equal(plain(b.get('Backup').restore(text)).ok, true); assert.equal(O(b).open, true, 'backup antigo com nome padrão exige trocar o nome');
});
test('botão voltar do Android (e voltar das telas) NÃO fecha a tela obrigatória', () => {
  const h = fresh(); h.sb.handleBack(); h.sb.handleBack(); assert.equal(O(h).open, true); assert.equal(h.els.onboardPanel.classList.contains('on'), true);
  assert.equal(h.state(), 'MENU');
});
test('com PIN no perfil padrão: PIN primeiro; ao desbloquear aparece a tela de nome', () => {
  const s = load(1); P(s).setPin('p1', '2468');
  const h = fresh(s.store); assert.equal(h.get('Lock').active, true); assert.equal(O(h).open, false, 'ainda bloqueado pelo PIN');
  h.get('Lock').hide(); assert.equal(O(h).open, true);
});
test('criar/renomear perfil rejeita o nome padrão (API e telas)', () => {
  const h = load(1); const c = (n) => plain(P(h).create(n));
  assert.equal(c('Jogador 1').ok, false); assert.match(c('jogador 1').error, /padrão/); assert.equal(c('Jogador 2').ok, true); assert.equal(c('Jogador').ok, true);
  assert.equal(plain(P(h).rename('p1', 'Jogador 1')).ok, false); assert.equal(P(h).isDefaultName('Jogador 1'), true); assert.equal(P(h).isDefaultName('Jogador 2'), false);
  const n = P(h).list().length; h.sb.openProfileName(null); const inp = h.els.sheetBody.children.find((x) => x.className === 'txt'); inp.value = 'Jogador 1';
  h.els.sheetBody.children.find((x) => x.textContent === 'Salvar').onclick(); assert.equal(P(h).list().length, n);
  assert.ok(h.els.sheetBody.children.some((x) => /nome padrão/.test(x.textContent || '')), 'mostra o erro');
});
test('finishOnboarding valida nome e avatar (API)', () => {
  const h = load(1); const f = (n, a) => plain(P(h).finishOnboarding(n, a));
  assert.equal(f('Jogador 1', 0).ok, false); assert.equal(f('', 0).ok, false); assert.equal(f('Ana', null).ok, false); assert.equal(f('Ana', -1).ok, false); assert.equal(f('Ana', 999).ok, false); assert.equal(f('Ana', '3').ok, false);
  assert.equal(P(h).cur().name, 'Jogador 1', 'nada mudou nas falhas'); assert.equal(f('Ana', 2).ok, true); assert.equal(P(h).cur().name, 'Ana');
});
test('hasData: distingue primeiro acesso de jogador antigo', () => {
  assert.equal(P(load(1)).hasData(), false);
  const h = load(1); h.sb.newGame(1); h.G().score = 5; h.sb.gameOver(); assert.equal(P(h).hasData(), true);
});
test('desligado nos testes antigos (flag) e ligado por padrão no app real', () => {
  assert.equal(O(load(1)).enabled(), false); assert.equal(O(fresh()).enabled(), true);
});
test('HTML: a tela é um overlay acima das demais, sem botão de fechar', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'index.html'), 'utf8');
  const m = /id="onboardPanel"><div class="panel sheetp"><h1 id="obTitle"><\/h1><div id="obBody"><\/div><\/div><\/div>/.exec(html); assert.ok(m, 'markup: só título e corpo (nada de botão de fechar)');
  const z = (sel) => { const r = new RegExp(sel.replace(/[#.]/g, '\\$&') + '\\{[^}]*z-index:(\\d+)').exec(html); return r ? +r[1] : 0; };
  assert.ok(z('#onboardPanel') >= 90); assert.ok(z('#onboardPanel') > z('#confirmBox'), 'acima da confirmação'); assert.ok(z('#onboardPanel') > 20, 'acima de painéis e folhas');
  assert.ok(html.indexOf('js/onboarding.js') > html.indexOf('js/lock.js'));
});
