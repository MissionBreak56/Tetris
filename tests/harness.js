'use strict';
// Carrega o <script> de app/src/main/assets/index.html em um contexto Node (vm)
// com um DOM mínimo simulado. Não altera o jogo: testa o código real.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'index.html');

// Devolve os scripts na ordem em que o navegador os executa (src externos + inline).
function extractScripts() {
  const html = fs.readFileSync(HTML, 'utf8');
  const out = [];
  const re = /<script(?:\s+src="([^"]+)")?\s*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) out.push({ name: m[1], code: fs.readFileSync(path.join(path.dirname(HTML), m[1]), 'utf8') });
    else out.push({ name: 'index.html', code: m[2] });
  }
  if (!out.length) throw new Error('<script> não encontrado em index.html');
  return out;
}

function makeCtx() {
  const fn = new Proxy(function () {}, {
    get: (t, k) => (k === 'width' ? 10 : fn),
    apply: () => fn,
    set: () => true,
  });
  return fn;
}

function makeEl(id) {
  const cls = new Set();
  const el = {
    id, style: { setProperty() {}, removeProperty() {} }, textContent: '', children: [],
    classList: {
      add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c),
      toggle: (c, f) => { const on = f === undefined ? !cls.has(c) : !!f; if (on) cls.add(c); else cls.delete(c); return on; },
    },
    appendChild(c) { el.children.push(c); return c; },
    addEventListener() {}, setAttribute() {}, closest() { return null; },
    getContext() { return makeCtx(); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 411, height: 890 }; },
    offsetWidth: 0,
  };
  return el;
}

function seedSource(seed) {
  return `(function(){var a=${seed >>> 0};Math.random=function(){a|=0;a=a+0x6D2B79F5|0;` +
    `var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};})()`;
}

/**
 * @param {number} seed   semente do Math.random dentro do jogo
 * @param {object} store  localStorage pré-carregado (chaves já com prefixo tetris_)
 * @param {object} opts   { mute:false } mantém o som como configurado
 */
function load(seed = 1, store = {}, opts = {}) {
  const els = {};
  const listeners = {};
  const h = { now: 0, store: Object.assign({}, store), els, listeners };
  const sandbox = {
    console,
    document: {
      getElementById: (id) => els[id] || (els[id] = makeEl(id)),
      createElement: () => makeEl(),
      createTextNode: (x) => ({ nodeType: 3, textContent: x }),
      addEventListener: (t, f) => { (listeners['doc:' + t] = listeners['doc:' + t] || []).push(f); },
      documentElement: { style: { setProperty() {} } },
      hidden: false,
    },
    localStorage: {
      getItem: (k) => (k in h.store ? h.store[k] : null),
      setItem: (k, v) => { h.store[k] = String(v); },
      removeItem: (k) => { delete h.store[k]; },
    },
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    requestAnimationFrame: () => 0,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    performance: { now: () => h.now },
    navigator: {},
    innerWidth: 411, innerHeight: 890, devicePixelRatio: 1,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(seedSource(seed), sandbox);
  extractScripts().forEach((sc) => vm.runInContext(sc.code, sandbox, { filename: sc.name }));
  // som desligado nos testes (tone() retorna cedo)
  if (opts.mute !== false) vm.runInContext('settings.sound=false;', sandbox);

  h.sb = sandbox;                       // funções (function declarations) ficam no global
  h.run = (code) => vm.runInContext(code, sandbox);
  // faz só a PRÓXIMA chamada de Math.random devolver v; as seguintes seguem a sequência semeada
  h.forceNextRandom = (v) => vm.runInContext(`(function(){var o=Math.random,f=true;Math.random=function(){if(f){f=false;return ${v};}return o();};})()`, sandbox);
  h.get = (name) => vm.runInContext(name, sandbox); // const/let do script
  h.seed = (s) => vm.runInContext(seedSource(s), sandbox);
  h.G = () => vm.runInContext('G', sandbox);
  h.state = () => vm.runInContext('state', sandbox);
  h.setState = (s) => vm.runInContext(`state=${JSON.stringify(s)}`, sandbox);
  h.fire = (type, ev) => (listeners[type] || []).forEach((f) => f(Object.assign({ preventDefault() {} }, ev)));
  h.key = (k) => h.fire('keydown', { key: k });
  h.keyUp = (k) => h.fire('keyup', { key: k });
  return h;
}

// objetos criados no contexto têm outro Object.prototype: normaliza para comparar
const plain = (x) => JSON.parse(JSON.stringify(x));

module.exports = { load, plain };
