'use strict';
/* Temas: 4 embutidos + temas personalizados (editor com validação de contraste e distinção das peças). */
const HEX = /^#[0-9a-fA-F]{6}$/;
const PIECE_KEYS = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
const DEFAULT_PIECES = { I: '#22b59a', J: '#2f62d6', L: '#e8892a', O: '#d9cc1a', S: '#3aa83a', T: '#b01fc0', Z: '#d93a3a' };
const MAX_CUSTOM_THEMES = 8;
const hexRgb = (hx) => { const n = parseInt(hx.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgbHex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex(x.map((v, i) => v + (y[i] - v) * t)); };
function luminance(hx) { return hexRgb(hx).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); }
function contrast(a, b) { const l1 = luminance(a), l2 = luminance(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
const colorDist = (a, b) => { const x = hexRgb(a), y = hexRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };

const Theme = {
  MIN_CONTRAST: 2.5, MIN_PIECE_DIST: 60,
  builtin(i) {
    const t = THEMES[i];
    return { id: i, name: ['Azul', 'Roxo', 'Verde', 'Laranja'][i] || 'Tema ' + (i + 1), bg1: t[0], bg2: t[1], acc: t[2], board1: '#000000', board2: '#020721', grid: rgbHex(t[3].split(',').map(Number)), ghost: '#2a86d6', pieces: Object.assign({}, DEFAULT_PIECES), builtin: true };
  },
  customs() {
    const d = Store.getJSON('themes', []);
    return (Array.isArray(d) ? d : []).map((t) => this.validate(t, true)).filter((v) => v.ok).map((v) => v.theme).slice(0, MAX_CUSTOM_THEMES);
  },
  saveCustoms(list) { return Store.setJSON('themes', list.slice(0, MAX_CUSTOM_THEMES)); },
  ids() { return THEMES.map((_, i) => i).concat(this.customs().map((c) => c.id)); },
  get(id) { if (typeof id === 'number' && THEMES[id]) return this.builtin(id); return this.customs().find((c) => c.id === id) || null; },
  /** Tema ativo. Se o salvo não existe/está inválido, volta ao padrão (0). */
  cur() { return this.get(settings.theme) || this.builtin(0); },
  parseId(v) { if (v == null || v === '') return 0; if (/^c\d+$/.test(String(v))) return String(v); const n = parseInt(v, 10); return isFinite(n) && n >= 0 && n < THEMES.length ? n : 0; },
  /** Array compatível com TH(): [bg1,bg2,acc,glowRGB,frameRGB,btnRGB,grad1,grad2] */
  arr() {
    const t = this.cur();
    if (t.builtin) return THEMES[t.id];
    const g = hexRgb(t.acc);
    return [t.bg1, t.bg2, t.acc, g.join(','), hexRgb(mixHex(t.acc, '#000000', 0.55)).join(','), hexRgb(mixHex(t.acc, '#000000', 0.88)).join(','), mixHex(t.acc, '#000000', 0.3), mixHex(t.acc, '#000000', 0.55)];
  },
  extras() { const t = this.cur(); return { board1: t.board1, board2: t.board2, grid: hexRgb(t.grid).join(','), ghost: t.ghost }; },
  applyPieces() { Object.assign(COLORS, this.cur().pieces); },
  /** Valida e normaliza. strict=false apenas formata (usado no carregamento); erros listados em PT. */
  validate(t, quiet) {
    const errors = []; const o = { id: t && t.id, name: '', pieces: {} };
    if (!t || typeof t !== 'object') return { ok: false, errors: ['Tema inválido'] };
    o.name = String(t.name == null ? '' : t.name).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
    if (!o.name) errors.push('Dê um nome ao tema');
    for (const k of ['bg1', 'bg2', 'acc', 'board1', 'board2', 'grid', 'ghost']) { if (HEX.test(String(t[k]))) o[k] = String(t[k]).toLowerCase(); else errors.push('Cor inválida: ' + k); }
    const pc = t.pieces && typeof t.pieces === 'object' ? t.pieces : {};
    for (const k of PIECE_KEYS) { if (HEX.test(String(pc[k]))) o.pieces[k] = String(pc[k]).toLowerCase(); else errors.push('Cor inválida da peça ' + k); }
    if (!errors.length) {
      for (const k of PIECE_KEYS) for (const b of [o.board1, o.board2]) if (contrast(o.pieces[k], b) < this.MIN_CONTRAST) { errors.push('Peça ' + k + ' com pouco contraste com o tabuleiro'); break; }
      for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) if (colorDist(o.pieces[PIECE_KEYS[i]], o.pieces[PIECE_KEYS[j]]) < this.MIN_PIECE_DIST) errors.push('Peças ' + PIECE_KEYS[i] + ' e ' + PIECE_KEYS[j] + ' muito parecidas');
      if (contrast(o.ghost, o.board1) < 2) errors.push('Cor da sombra com pouco contraste');
      if (contrast(o.acc, o.bg2) < 2) errors.push('Cor de destaque com pouco contraste com o fundo');
      if (contrast(o.grid, o.board1) < 1.05 && o.grid === o.board1) errors.push('Grade invisível');
    }
    if (typeof o.id === 'string' && /^c\d+$/.test(o.id)) { /* ok */ } else if (!quiet) o.id = null;
    if (quiet && !(typeof o.id === 'string' && /^c\d+$/.test(o.id))) errors.push('Id inválido');
    return { ok: !errors.length, errors, theme: o };
  },
  nextId(list) { return 'c' + (list.reduce((m, t) => Math.max(m, parseInt(String(t.id).slice(1), 10) || 0), 0) + 1); },
  /** Salva (cria se id==null). Retorna {ok, errors, id}. */
  save(t) {
    const list = this.customs();
    const v = this.validate(Object.assign({}, t, { id: t.id || 'c0' }), true);
    if (!v.ok) return { ok: false, errors: v.errors };
    const i = list.findIndex((c) => c.id === t.id);
    if (i >= 0) { v.theme.id = t.id; list[i] = v.theme; }
    else { if (list.length >= MAX_CUSTOM_THEMES) return { ok: false, errors: ['Limite de ' + MAX_CUSTOM_THEMES + ' temas personalizados'] }; v.theme.id = this.nextId(list); list.push(v.theme); }
    this.saveCustoms(list);
    return { ok: true, errors: [], id: v.theme.id };
  },
  remove(id) { const list = this.customs().filter((c) => c.id !== id); this.saveCustoms(list); if (settings.theme === id) { settings.theme = 0; saveSettings(); applyTheme(); } },
  duplicate(id) { const t = this.get(id); if (!t) return null; const r = this.save(Object.assign({}, JSON.parse(JSON.stringify(t)), { id: null, builtin: false, name: (t.name + ' cópia').slice(0, 20) })); return r.ok ? r.id : null; },
  exportJSON(id) { const t = this.get(id); if (!t) return ''; const c = JSON.parse(JSON.stringify(t)); delete c.id; delete c.builtin; return JSON.stringify({ type: 'tetris-theme', v: 1, theme: c }); },
  importJSON(str) {
    let d; try { d = JSON.parse(String(str)); } catch (e) { return { ok: false, errors: ['JSON inválido'] }; }
    if (!d || d.type !== 'tetris-theme' || d.v !== 1 || !d.theme) return { ok: false, errors: ['Arquivo não é um tema do Tetris (versão 1)'] };
    return this.save(Object.assign({}, d.theme, { id: null }));
  },
  blank() { const b = this.builtin(0); return { id: null, name: 'Meu tema', bg1: b.bg1, bg2: b.bg2, acc: b.acc, board1: b.board1, board2: b.board2, grid: b.grid, ghost: b.ghost, pieces: Object.assign({}, DEFAULT_PIECES) }; },
};
function selectTheme(id) { settings.theme = id; saveSettings(); applyTheme(); }
function drawThemePreview(cv, t) {
  const c = cv.getContext('2d'), W = 220, H = 120;
  let g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, t.bg1); g.addColorStop(1, t.bg2); c.fillStyle = g; c.fillRect(0, 0, W, H);
  g = c.createLinearGradient(0, 8, 0, H - 8); g.addColorStop(0, t.board1); g.addColorStop(1, t.board2); c.fillStyle = g; c.fillRect(60, 6, 100, 108);
  c.strokeStyle = t.grid; c.globalAlpha = 0.35; c.lineWidth = 1; for (let i = 1; i < 10; i++) { c.beginPath(); c.moveTo(60 + i * 10, 6); c.lineTo(60 + i * 10, 114); c.stroke(); } c.globalAlpha = 1;
  c.strokeStyle = t.acc; c.lineWidth = 3; c.strokeRect(60, 6, 100, 108);
  const put = (k, cells) => cells.forEach(([x, y]) => Skins.draw(c, 60 + x * 10, 6 + y * 10, 10, t.pieces[k], 1));
  put('I', [[0, 10], [1, 10], [2, 10], [3, 10]]); put('O', [[4, 9], [5, 9], [4, 10], [5, 10]]); put('T', [[6, 10], [7, 10], [8, 10], [7, 9]]);
  put('S', [[0, 9], [1, 9], [1, 8], [2, 8]]); put('Z', [[3, 8], [4, 8], [4, 7], [5, 7]]); put('L', [[8, 9], [9, 9], [9, 10], [9, 8]]); put('J', [[6, 9], [6, 8], [7, 8], [8, 8]]);
  c.strokeStyle = t.ghost; c.lineWidth = 1.5; [[3, 1], [4, 1], [5, 1], [4, 2]].forEach(([x, y]) => c.strokeRect(60 + x * 10 + 1, 6 + y * 10 + 1, 8, 8));
}
function openThemes() {
  Sheet.push('Temas', (b) => {
    Theme.ids().forEach((id) => {
      const t = Theme.get(id), sel = settings.theme === id;
      const chips = h('div', { class: 'chips' }, [t.bg1, t.acc, t.pieces.I, t.pieces.J, t.pieces.L, t.pieces.O, t.pieces.S, t.pieces.T, t.pieces.Z].map((c) => h('i', { style: 'background:' + c })));
      const row = h('div', { class: 'skinrow' + (sel ? ' sel' : '') }, h('div', { class: 'kv', onclick: () => { sfx.click(); selectTheme(id); Sheet.refresh(); } }, h('span', { text: t.name + (sel ? ' ●' : '') + (t.builtin ? '' : ' (personalizado)') })), chips);
      if (!t.builtin) {
        const r = h('div', { class: 'row' });
        r.appendChild(btn('Editar', () => openThemeEditor(id))); r.appendChild(btn('Duplicar', () => { Theme.duplicate(id); Sheet.refresh(); }));
        r.appendChild(btn('Exportar', () => openThemeExport(id)));
        r.appendChild(btn('Excluir', () => Confirm.ask('Excluir o tema "' + t.name + '"?', () => { Theme.remove(id); Sheet.refresh(); }), 'danger'));
        row.appendChild(r);
      } else row.appendChild(btn('Duplicar para editar', () => { const n = Theme.duplicate(id); Sheet.refresh(); if (n) openThemeEditor(n); }));
      b.appendChild(row);
    });
    b.appendChild(btn('Novo tema', () => openThemeEditor(null), ''));
    b.appendChild(btn('Importar tema (JSON)', openThemeImport));
  });
}
function openThemeEditor(id) {
  const draft = id ? JSON.parse(JSON.stringify(Theme.get(id))) : Theme.blank();
  Sheet.push(id ? 'Editar tema' : 'Novo tema', (b) => {
    const cv = h('canvas', { width: '220', height: '120', class: 'prev' });
    const msg = h('div', { class: 'errs' });
    const refresh = () => {
      const v = Theme.validate(Object.assign({}, draft, { id: draft.id || 'c0' }), true);
      msg.textContent = v.ok ? '✓ Tema válido' : v.errors.join(' · '); msg.className = 'errs' + (v.ok ? ' ok' : '');
      drawThemePreview(cv, v.theme.pieces && v.theme.board1 ? Object.assign({}, draft, v.theme, { pieces: Object.assign({}, draft.pieces) }) : draft);
      saveB.disabled = !v.ok;
    };
    const color = (label, get, set) => h('div', { class: 'slrow' }, h('span', { text: label }), h('input', { type: 'color', value: get(), oninput: (e) => { set(e.target.value); refresh(); } }), h('b', { text: '' }));
    const nameIn = h('input', { type: 'text', maxlength: '20', value: draft.name, class: 'txt' }); nameIn.oninput = (e) => { draft.name = e.target.value; refresh(); };
    b.appendChild(nameIn); b.appendChild(cv); b.appendChild(msg);
    [['Fundo (topo)', 'bg1'], ['Fundo (base)', 'bg2'], ['Destaque', 'acc'], ['Tabuleiro (topo)', 'board1'], ['Tabuleiro (base)', 'board2'], ['Grade', 'grid'], ['Sombra', 'ghost']]
      .forEach(([l, k]) => b.appendChild(color(l, () => draft[k], (v) => { draft[k] = v; })));
    PIECE_KEYS.forEach((k) => b.appendChild(color('Peça ' + k, () => draft.pieces[k], (v) => { draft.pieces[k] = v; })));
    const saveB = btn('Salvar e usar', () => { const r = Theme.save(draft); if (r.ok) { selectTheme(r.id); Sheet.back(); Sheet.refresh(); } else { msg.textContent = r.errors.join(' · '); msg.className = 'errs'; } });
    b.appendChild(saveB); refresh();
  });
}
function openThemeExport(id) {
  Sheet.push('Exportar tema', (b) => {
    const json = Theme.exportJSON(id);
    const ta = h('textarea', { class: 'txt', rows: '6', readonly: 'readonly' }); ta.value = json; b.appendChild(ta);
    b.appendChild(h('div', { class: 'hint', text: 'Copie o texto acima para compartilhar este tema.' }));
    if (typeof Native !== 'undefined' && Native.available()) b.appendChild(btn('Compartilhar', () => Native.share('Tema do Tetris', json)));
  });
}
function openThemeImport() {
  Sheet.push('Importar tema', (b) => {
    const ta = h('textarea', { class: 'txt', rows: '6', placeholder: 'Cole aqui o JSON do tema' }); const out = h('div', { class: 'errs' });
    b.appendChild(ta); b.appendChild(out);
    b.appendChild(btn('Importar', () => { const r = Theme.importJSON(ta.value); if (r.ok) { out.textContent = '✓ Tema importado'; out.className = 'errs ok'; } else { out.textContent = r.errors.join(' · '); out.className = 'errs'; } }));
  });
}
Hub.add(52, 'Temas', openThemes);
