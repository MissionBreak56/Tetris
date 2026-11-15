'use strict';
/* Ponte com o Android (compartilhar, salvar e abrir arquivos). Fora do app (navegador) usa alternativas simples. */
const Native = {
  _saved: null, _picked: null,
  available() { return typeof AndroidBridge !== 'undefined'; },
  /** { level 0-100, charging, saver } ou null fora do app (navegador). */
  battery() {
    try { if (this.available() && typeof AndroidBridge.battery === 'function') { const s = AndroidBridge.battery(); if (s) { const o = JSON.parse(s); return { level: num(o.level, 100), charging: !!o.charging, saver: !!o.saver }; } } } catch (e) {}
    return null;
  },
  share(title, text) { if (this.available()) { AndroidBridge.share(title, text); return true; } return false; },
  saveFile(name, mime, text, cb) {
    this._saved = cb || null;
    if (this.available()) { AndroidBridge.saveFile(name, mime, text); return; }
    try { const a = document.createElement('a'); a.href = 'data:' + mime + ';charset=utf-8,' + encodeURIComponent(text); a.download = name; a.click(); if (cb) cb(true); } catch (e) { if (cb) cb(false); }
  },
  pickFile(cb) {
    this._picked = cb;
    if (this.available()) { AndroidBridge.pickFile(); return; }
    const i = document.createElement('input'); i.type = 'file';
    i.onchange = () => { const f = i.files && i.files[0]; if (!f) { cb(null, 'Nenhum arquivo'); return; } if (f.size > 8000000) { cb(null, 'Arquivo muito grande'); return; } const r = new FileReader(); r.onload = () => cb(String(r.result), null); r.onerror = () => cb(null, 'Falha ao ler'); r.readAsText(f); };
    i.click();
  },
  /* chamados pelo Java */
  _onSaved(ok) { const f = this._saved; this._saved = null; if (f) f(!!ok); },
  _onPicked(text, err) { const f = this._picked; this._picked = null; if (f) f(text, err); },
};
