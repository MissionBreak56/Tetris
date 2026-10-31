'use strict';
/* Telas de ajustes: geral, áudio e controles. */
function toggleBtn(label, get, set) {
  const e = h('button', { class: 'btn small' });
  const upd = () => { e.textContent = label + ': ' + (get() ? 'ON' : 'OFF'); };
  e.onclick = () => { try { sfx.click(); } catch (x) {} set(!get()); upd(); };
  upd(); return e;
}
function slider(label, min, max, step, get, set, fmt) {
  fmt = fmt || ((v) => Math.round(v * 100) + '%');
  const out = h('b', { text: fmt(get()) });
  const inp = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(get()) });
  inp.oninput = (ev) => { const v = parseFloat(ev.target.value); if (isFinite(v)) { set(v); out.textContent = fmt(v); } };
  return h('div', { class: 'slrow' }, h('span', { text: label }), inp, out);
}
function openSettingsSheet() {
  Sheet.push('Ajustes', (b) => {
    b.appendChild(toggleBtn('Vibrar', () => settings.vib, (v) => { settings.vib = v; saveSettings(); refreshMenu(); }));
    b.appendChild(toggleBtn('Efeitos visuais', () => settings.fx, (v) => { settings.fx = v; saveSettings(); }));
    b.appendChild(toggleBtn('Controle lateral no toque', () => settings.touch, (v) => { settings.touch = v; saveSettings(); }));
    b.appendChild(btn('Áudio', openAudioSheet));
    b.appendChild(btn('Controles', openControlsSheet));
    b.appendChild(h('div', { class: 'hint' }, 'Gestos valem em qualquer lugar da tela:', h('br'), 'toque = gira (lado escolhe o sentido) · arrasta = move', h('br'), 'arrasta ↓ = queda suave · desliza ↓ = derruba · desliza ↑ = hold'));
  });
}
function openAudioSheet() {
  Sheet.push('Áudio', (b) => {
    b.appendChild(toggleBtn('Música', () => settings.music, (v) => { settings.music = v; saveSettings(); refreshMenu(); if (!v) stopMusic(); }));
    b.appendChild(slider('Volume da música', 0, 1, 0.05, () => settings.musicVol, (v) => { settings.musicVol = v; saveSettings(); }));
    b.appendChild(toggleBtn('Efeitos sonoros', () => settings.sound, (v) => { settings.sound = v; saveSettings(); refreshMenu(); }));
    b.appendChild(slider('Volume dos efeitos', 0, 1, 0.05, () => settings.sfxVol, (v) => { settings.sfxVol = v; saveSettings(); sfx.click(); }));
  });
}
function openControlsSheet() {
  Sheet.push('Controles', (b) => {
    const C = Controls, apply = () => { C.save(); resize(); };
    b.appendChild(h('div', { class: 'hint', text: 'Botão de pausa e gestos. O botão fica sempre nas colunas laterais, fora do tabuleiro.' }));
    b.appendChild(slider('Tamanho do botão', 0.6, 1.1, 0.05, () => C.cfg.size, (v) => { C.cfg.size = v; apply(); }));
    b.appendChild(slider('Opacidade do botão', 0.3, 1, 0.05, () => C.cfg.opacity, (v) => { C.cfg.opacity = v; apply(); }));
    const pos = btn('Posição do botão: ' + (C.cfg.pos === 'left' ? 'esquerda' : 'direita'), () => { C.cfg.pos = C.cfg.pos === 'left' ? 'right' : 'left'; apply(); Sheet.refresh(); });
    b.appendChild(pos);
    const x = (v) => v.toFixed(2) + '×';
    b.appendChild(slider('Sensibilidade do arrasto', 0.5, 2, 0.1, () => C.cfg.sens, (v) => { C.cfg.sens = v; apply(); }, x));
    b.appendChild(slider('Sensibilidade do deslize', 0.5, 2, 0.1, () => C.cfg.swipe, (v) => { C.cfg.swipe = v; apply(); }, x));
    b.appendChild(slider('Sensibilidade da queda suave', 0.5, 2, 0.1, () => C.cfg.soft, (v) => { C.cfg.soft = v; apply(); }, x));
    b.appendChild(btn('Restaurar padrões', () => { C.reset(); resize(); Sheet.refresh(); }, 'danger'));
  });
}
Hub.add(15, 'Ajustes', openSettingsSheet);
