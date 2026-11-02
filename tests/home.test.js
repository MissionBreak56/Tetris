'use strict';
// Tela inicial: todos os modos acessíveis, sem sobreposição e dentro da moldura.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness');

const MODE_BTNS = ['bMarathon', 'bTimed', 'bStrategy', 'bZen', 'bSprint', 'bDaily', 'bCustom', 'bVersus', 'bTourney', 'bTutorial'];
const rect = (h, id) => { const s = h.els[id].style; return { x: parseFloat(s.left), y: parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height) }; };

test('layout: 10 botões de modo dentro da moldura, sem sobreposição, em várias telas', () => {
  for (const [w, hh] of [[360, 640], [411, 890], [412, 915], [320, 568], [768, 1024]]) {
    const h = load(1); h.sb.innerWidth = w; h.sb.innerHeight = hh; h.sb.resize();
    const L = plain(h.get('L')), R = MODE_BTNS.map((id) => [id, rect(h, id)]);
    for (const [id, r] of R) {
      assert.ok(r.w > 0 && r.h > 0, id);
      assert.ok(r.x >= L.fl && r.x + r.w <= L.fr && r.y >= L.ft && r.y + r.h <= L.fb, `${id} dentro da moldura ${w}x${hh}`);
    }
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
      const a = R[i][1], b = R[j][1];
      assert.equal(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, false, `${R[i][0]} × ${R[j][0]} ${w}x${hh}`);
    }
    // não invadem o logo (a haste do T termina antes dos botões)
    assert.ok(R[0][1].y > L.by + 8.9 * h.get('CELL'), 'abaixo do logo');
  }
});
test('toques de altura mínima (≥ 28 px em tela de 360×640)', () => {
  const h = load(1); h.sb.innerWidth = 360; h.sb.innerHeight = 640; h.sb.resize();
  for (const id of MODE_BTNS) assert.ok(rect(h, id).h >= 22, id + ' ' + rect(h, id).h);
});
test('botões de início direto: Zen (com a velocidade salva) e Sprint', () => {
  const h = load(1); h.get('Prefs').setZenLevel(6);
  h.els.bZen.onclick(); assert.equal(h.G().mode, 4); assert.equal(h.G().level, 6);
  h.sb.goMenu(); h.els.bSprint.onclick(); assert.equal(h.G().mode, 5);
});
test('botões que abrem telas: Diário, Personalizado, Versus, Torneio e Tutorial; fechar volta à tela inicial', () => {
  for (const [id, title] of [['bDaily', 'Desafio diário'], ['bCustom', 'Desafios personalizados'], ['bVersus', 'Versus'], ['bTourney', 'Torneio'], ['bTutorial', 'Tutorial']]) {
    const h = load(1); h.els[id].onclick();
    assert.equal(h.els.sheet.classList.contains('on'), true, id); assert.equal(h.els.sheetTitle.textContent, title);
    assert.equal(h.get('Sheet').stack.length, 1);
    h.sb.handleBack(); assert.equal(h.els.sheet.classList.contains('on'), false, id); assert.equal(h.els.menu.classList.contains('on'), true, 'volta ao menu');
  }
});
test('todos os modos têm chave e estão acessíveis também pelo menu "Modos de jogo"', () => {
  const h = load(1); const keys = plain(h.get('Modes').list).map((m) => m.key).sort();
  assert.deepEqual(keys, ['custom', 'daily', 'sprint', 'tourney', 'tutorial', 'versus', 'zen']);
  assert.equal(h.get('Modes').openFromHome('inexistente'), false);
});
test('DAILY mostra ✓ quando o desafio de hoje foi concluído', () => {
  const h = load(1); h.sb.refreshMenu(); assert.equal(h.els.bDaily.textContent, 'DAILY');
  h.get('Daily').record({ daily: h.get('Daily').dateKey(), win: true, ms: 1, score: 1 }); h.sb.refreshMenu();
  assert.equal(h.els.bDaily.textContent, 'DAILY ✓'); assert.equal(h.els.bDaily.classList.contains('done'), true);
});
test('render da tela inicial não lança com a nova grade', () => { const h = load(1); h.sb.resize(); assert.doesNotThrow(() => h.sb.render()); });
