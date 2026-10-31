'use strict';
/* UI helpers: criação de DOM segura (sem innerHTML), folhas de navegação (Sheet), confirmação e menu (Hub). */
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const k in props || {}) {
    if (k === 'class') e.className = props[k];
    else if (k.slice(0, 2) === 'on') e[k] = props[k];
    else if (k === 'text') e.textContent = props[k];
    else e.setAttribute(k, props[k]);
  }
  kids.flat().forEach((c) => { if (c != null && c !== false) e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
  return e;
}
function clearEl(e) { e.textContent = ''; if (Array.isArray(e.children)) e.children.length = 0; }
const pad2 = (n) => String(n).padStart(2, '0');
function fmtMs(ms) { const s = Math.floor(num(ms) / 1000); return Math.floor(s / 60) + ':' + pad2(s % 60); }
function fmtMsP(ms) { ms = Math.max(0, num(ms)); const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + pad2(s % 60) + '.' + pad2(Math.floor((ms % 1000) / 10)); }
function fmtDate(t) { const d = new Date(num(t)); return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
const fmtNum = (n) => String(Math.round(num(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const kv = (k, v) => h('div', { class: 'kv' }, h('span', { text: k }), h('b', { text: String(v) }));
const sec = (t) => h('div', { class: 'sec', text: t });
const btn = (label, fn, cls) => h('button', { class: 'btn small ' + (cls || ''), onclick: () => { try { sfx.click(); } catch (e) {} fn(); }, text: label });

const Sheet = {
  stack: [],
  open(title, build) { this.stack = [{ title, build }]; this.render(); hide('menu'); show('sheet'); },
  push(title, build) { this.stack.push({ title, build }); this.render(); },
  back() { this.stack.pop(); if (!this.stack.length) this.close(); else this.render(); },
  close() { this.stack = []; hide('sheet'); show('menu'); },
  refresh() { if (this.stack.length) this.render(); },
  render() {
    const t = this.stack[this.stack.length - 1];
    $('sheetTitle').textContent = t.title;
    const b = $('sheetBody'); clearEl(b); t.build(b);
    $('sheet').scrollTop = 0;
  },
};
const Confirm = {
  ask(text, onYes) {
    $('confirmText').textContent = text;
    $('confirmYes').onclick = () => { hide('confirmBox'); onYes(); };
    $('confirmNo').onclick = () => hide('confirmBox');
    show('confirmBox');
  },
};
const Hub = {
  items: [],
  add(order, label, open) { this.items.push({ order, label, open }); },
  open() {
    Sheet.open('Menu', (b) => {
      this.items.slice().sort((a, c) => a.order - c.order).forEach((it) => b.appendChild(btn(it.label, it.open)));
    });
  },
};
