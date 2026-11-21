'use strict';
/* StorageManager — única porta de acesso ao localStorage.
   Chaves de perfil usam Store.prefix ('tetris_' = perfil padrão, compatível com versões antigas).
   Chaves globais (não pertencem a um perfil) usam Store.g*. */
const Store = {
  prefix: 'tetris_',
  // Detecção de falhas: toda gravação que falha (armazenamento cheio, bloqueado, corrompido) é contada e avisada; nunca finge sucesso.
  errors: 0, lastError: null, onError: null, onWrite: null,
  _fail(e) { this.errors++; this.lastError = String((e && e.name) || e || 'erro'); if (this.onError) { try { this.onError(this.lastError); } catch (x) {} } },
  _wrote() { if (this.onWrite) { try { this.onWrite(); } catch (x) {} } },
  /** Teste real de gravar/ler/apagar (para o app saber se o armazenamento está funcionando). */
  health() {
    try { const k = 'tetris__probe', v = String(Date.now()); localStorage.setItem(k, v); const ok = localStorage.getItem(k) === v; localStorage.removeItem(k); return { ok, errors: this.errors, lastError: this.lastError }; }
    catch (e) { return { ok: false, errors: this.errors, lastError: String((e && e.name) || e) }; }
  },
  /** Grava e CONFERE lendo de volta (true só se o valor lido é igual ao gravado). */
  setVerified(k, v) { return this.set(k, v) && this.get(k) === String(v); },
  gsetVerified(k, v) { return this.gset(k, v) && this.gget(k) === String(v); },
  get(k) { try { return localStorage.getItem(this.prefix + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(this.prefix + k, String(v)); this._wrote(); return true; } catch (e) { this._fail(e); return false; } },
  del(k) { try { localStorage.removeItem(this.prefix + k); this._wrote(); } catch (e) { this._fail(e); } },
  getJSON(k, def) { try { const v = this.get(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
  setJSON(k, v) { try { return this.set(k, JSON.stringify(v)); } catch (e) { return false; } },
  gget(k) { try { return localStorage.getItem('tetris__' + k); } catch (e) { return null; } },
  gset(k, v) { try { localStorage.setItem('tetris__' + k, String(v)); this._wrote(); return true; } catch (e) { this._fail(e); return false; } },
  gdel(k) { try { localStorage.removeItem('tetris__' + k); this._wrote(); } catch (e) { this._fail(e); } },
  ggetJSON(k, def) { try { const v = this.gget(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
  gsetJSON(k, v) { try { return this.gset(k, JSON.stringify(v)); } catch (e) { return false; } },
};
/* Chaves que pertencem a um perfil (usadas para excluir perfil e para backup). Módulos novos registram as suas aqui. */
Store.KEYS = ['isSound', 'isMusic', 'isShowGhost', 'isVabiration', 'isTouchControl', 'index_bg', 'skin', 'musicVol', 'sfxVol', 'isFx', 'oppView', 'startLevel',
  'bestScore', 'bestScore2Minutes', 'bestScoreStrategy', 'bestSprintMs', 'stats', 'history', 'achv', 'rewards', 'daily', 'tut', 'ctl', 'themes', 'zenLevel', 'vibMap', 'isPerf', 'spent', 'dynTheme', 'h2h', 'ghost', 'ghostRace', 'updAuto'];
Store.register = function (...ks) { ks.forEach((k) => { if (!Store.KEYS.includes(k)) Store.KEYS.push(k); }); };
const LS = (k) => Store.get(k);
const SV = (k, v) => { Store.set(k, v); };
const num = (x, d = 0) => (typeof x === 'number' && isFinite(x) ? x : d);
