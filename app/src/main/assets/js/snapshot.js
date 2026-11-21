'use strict';
/* SnapshotManager — cópias consistentes dos dados do jogo FORA do localStorage.
   No Android o armazenamento é a ponte nativa (arquivos atômicos, 2 slots, SHA-256, cifrados com o Android Keystore).
   Serve para: (1) recuperar os dados se o localStorage da WebView for limpo/corrompido, (2) desfazer uma restauração ou migração
   interrompida. Sem a ponte (navegador/testes) só funciona se um backend for injetado em SnapshotManager.backend. */
const SnapshotManager = {
  FORMAT: 'tetris-snapshot', V: 1, DEBOUNCE_MS: 20000, MIN_GAP_MS: 30000,
  backend: null, dirty: false, timer: null, lastOk: 0, lastError: null, installed: false,
  native: {
    ok() { return typeof AndroidBridge !== 'undefined' && !!AndroidBridge && typeof AndroidBridge.snapshotSave === 'function' && typeof AndroidBridge.snapshotLoad === 'function'; },
    save(t) { try { AndroidBridge.snapshotSave(t); return true; } catch (e) { return false; } },
    /** Espera a gravação terminar (ponte nova). Ponte antiga sem essa função: grava assíncrono e diz false (não é garantia). */
    saveNow(t) { try { if (typeof AndroidBridge.snapshotSaveNow === 'function') return !!AndroidBridge.snapshotSaveNow(t); AndroidBridge.snapshotSave(t); return false; } catch (e) { return false; } },
    load() { try { const t = AndroidBridge.snapshotLoad(); return t ? String(t) : null; } catch (e) { return null; } },
  },
  getBackend() { return this.backend || (this.native.ok() ? this.native : null); },
  available() { return !!this.getBackend(); },
  /** Texto do snapshot: cabeçalho + dados + soma de verificação. (A integridade criptográfica vem da camada nativa.) */
  build(reason, data) {
    data = data || Backup.collect();
    return JSON.stringify({ type: this.FORMAT, v: this.V, app: 'tetris', engine: ENGINE_VERSION, created: Date.now(), reason: String(reason || '').slice(0, 40), sum: fnv(JSON.stringify(data)), data });
  },
  /** { ok, snap } ou { ok:false, errors } — valida tipo, versão, forma dos dados e soma. */
  verify(text) {
    const E = (m) => ({ ok: false, errors: [m] });
    if (typeof text !== 'string' || !text) return E('Snapshot vazio');
    let o; try { o = JSON.parse(text); } catch (e) { return E('Snapshot ilegível'); }
    if (!o || o.type !== this.FORMAT || o.app !== 'tetris') return E('Não é um snapshot do Tetris');
    if (o.v !== this.V) return E('Versão de snapshot não suportada');
    if (!o.data || typeof o.data !== 'object' || !o.data.global || !o.data.profiles) return E('Snapshot incompleto');
    if (o.sum !== fnv(JSON.stringify(o.data))) return E('Snapshot corrompido');
    return { ok: true, snap: o };
  },
  createFrom(data, reason, sync) {
    const b = this.getBackend(); if (!b) return { ok: false, error: 'Sem armazenamento de snapshot' };
    try {
      const t = this.build(reason, data), ok = sync ? b.saveNow(t) : b.save(t);
      if (!ok) { this.lastError = 'gravação recusada'; return { ok: false, error: this.lastError }; }
      this.lastOk = Date.now(); this.lastError = null; if (!sync || ok) this.dirty = false;
      return { ok: true, size: t.length };
    } catch (e) { this.lastError = String(e && e.message || e); return { ok: false, error: this.lastError }; }
  },
  create(reason, sync) { return this.createFrom(null, reason, sync); },
  /** Protege o estado atual antes de uma operação arriscada. durable=true só se a gravação foi confirmada. */
  protect(reason, data) { const r = this.createFrom(data, reason, true); return { durable: !!r.ok, error: r.error }; },
  loadLatest() {
    const b = this.getBackend(); if (!b) return { ok: false, errors: ['Sem armazenamento de snapshot'] };
    let t; try { t = b.load(); } catch (e) { t = null; }
    if (!t) return { ok: false, errors: ['Nenhum snapshot guardado'] };
    const v = this.verify(t); return v.ok ? { ok: true, snap: v.snap, text: t } : v;
  },
  /** Snapshot -> texto de backup v1 (aceito por Backup.parse/restore). */
  toBackupText(snap) { return JSON.stringify({ type: 'tetris-backup', v: 1, app: 'tetris', engine: snap.engine, created: snap.created, sum: fnv(JSON.stringify(snap.data)), data: snap.data }); },
  /** O localStorage está sem dados de jogo (instalação nova ou dados da WebView apagados)? */
  storageEmpty() {
    try {
      for (const k of ['bestScore', 'stats', 'history', 'achv', 'themes']) if (localStorage.getItem('tetris_' + k) != null) return false;
      if (localStorage.getItem('tetris__ranking') != null) return false;
      const pl = Store.ggetJSON('profiles', null); if (pl && Array.isArray(pl.list) && pl.list.length > 1) return false;
      return true;
    } catch (e) { return false; }
  },
  /** No começo: se os dados sumiram mas existe snapshot válido, restaura. */
  recoverIfEmpty() {
    if (!this.available() || !this.storageEmpty()) return { recovered: false };
    const l = this.loadLatest(); if (!l.ok) return { recovered: false };
    const r = Backup.restore(this.toBackupText(l.snap), { recovery: true });
    return { recovered: !!r.ok, errors: r.errors, created: l.snap.created };
  },
  markDirty() {
    if (!this.available()) return;
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null; if (!this.dirty) return;
      if (Date.now() - this.lastOk < this.MIN_GAP_MS) { this.markDirty(); return; }
      this.create('auto', false);
    }, this.DEBOUNCE_MS);
  },
  flush(reason) { if (this.dirty && this.available()) return this.create(reason || 'flush', false); return null; },
  /** Liga: snapshot automático depois de gravações (com atraso) e ao ir para segundo plano. */
  install() {
    if (this.installed) return; this.installed = true;
    Store.onWrite = () => this.markDirty();
    try { document.addEventListener('visibilitychange', () => { if (document.hidden) this.flush('background'); }); } catch (e) {}
    try { window.addEventListener('pagehide', () => this.flush('pagehide')); } catch (e) {}
  },
};
