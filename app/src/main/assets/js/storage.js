'use strict';
/* StorageManager — única porta de acesso ao localStorage.
   Chaves de perfil usam Store.prefix ('tetris_' = perfil padrão, compatível com versões antigas).
   Chaves globais (não pertencem a um perfil) usam Store.g*. */
const Store = {
  prefix: 'tetris_',
  get(k) { try { return localStorage.getItem(this.prefix + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(this.prefix + k, String(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(this.prefix + k); } catch (e) {} },
  getJSON(k, def) { try { const v = this.get(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
  setJSON(k, v) { try { return this.set(k, JSON.stringify(v)); } catch (e) { return false; } },
  gget(k) { try { return localStorage.getItem('tetris__' + k); } catch (e) { return null; } },
  gset(k, v) { try { localStorage.setItem('tetris__' + k, String(v)); return true; } catch (e) { return false; } },
  ggetJSON(k, def) { try { const v = this.gget(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
  gsetJSON(k, v) { try { return this.gset(k, JSON.stringify(v)); } catch (e) { return false; } },
};
const LS = (k) => Store.get(k);
const SV = (k, v) => { Store.set(k, v); };
const num = (x, d = 0) => (typeof x === 'number' && isFinite(x) ? x : d);
