'use strict';
// Partida do app: a interface não pode "piscar" (botões empilhados no mesmo ponto, na cor padrão, sobre fundo azul) antes do layout/tema.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
const html = fs.readFileSync(path.join(A, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(A, 'js', 'core', 'app.js'), 'utf8');

test('partida: <html> nasce com a classe "boot", que esconde o menu e usa fundo preto (nada de azul padrão)', () => {
  assert.match(html, /<html[^>]*class="boot"/);
  assert.match(html, /html\.boot,html\.boot body\{background:#000\}/);
  assert.match(html, /html\.boot #menu,html\.boot #menu\.on\{display:none\}/);
});
test('partida: a classe "boot" só sai depois da inicialização (tema, layout e 1º quadro), com fallback no <head>', () => {
  const init = app.indexOf('applyTheme(); initBG(); resize();'), loop = app.indexOf('requestAnimationFrame(loop)'), reveal = app.indexOf("classList.remove('boot')");
  assert.ok(init >= 0 && loop > init && reveal > loop, 'revelar vem depois de tema/layout e depois de registrar o loop (que desenha antes, no mesmo quadro)');
  assert.match(html, /<head>[\s\S]*setTimeout\(function\(\)\{document\.documentElement\.classList\.remove\('boot'\)\},\d+\)[\s\S]*<\/head>/);
});
test('partida: os botões do menu continuam sendo posicionados por layoutMenu (resize) antes de revelar', () => {
  const r = fs.readFileSync(path.join(A, 'js', 'core', 'renderer.js'), 'utf8');
  assert.match(r, /function resize\(\)\{[\s\S]*layoutMenu\(\);\s*\}/);
});
