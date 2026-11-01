'use strict';
/* Backup e restauração de TODOS os dados locais (perfis, estatísticas, histórico, recordes, conquistas, temas, configurações, replays, ranking...).
   Arquivo JSON com checksum. Restauração: valida tudo antes, faz cópia de segurança, grava e confere; se algo falhar, volta ao estado anterior. */
const Backup = {
  MAX_TEXT: 6000000, MAX_VALUE: 2500000,
  JSON_KEYS: ['stats', 'history', 'achv', 'rewards', 'daily', 'tut', 'ctl', 'themes', 'replays', 'custom', 'tourney', 'tourneyWins'],
  /** Lê os dados atuais (strings brutas) de todos os perfis + chaves globais. */
  collect() {
    const data = { global: {}, profiles: {} };
    data.global.profiles = JSON.stringify(Profile.state);                 // sempre presente, mesmo que o app nunca tenha salvo a lista
    { const v = Store.gget('ranking'); if (v != null) data.global.ranking = v; }
    Profile.list().forEach((p) => {
      const o = {}, pre = Profile.prefixFor(p.id);
      Store.KEYS.forEach((k) => { let v = null; try { v = localStorage.getItem(pre + k); } catch (e) {} if (v != null) o[k] = v; });
      data.profiles[p.id] = o;
    });
    return data;
  },
  create() { const data = this.collect(); return { type: 'tetris-backup', v: 1, app: 'tetris', engine: ENGINE_VERSION, created: Date.now(), sum: fnv(JSON.stringify(data)), data }; },
  text() { return JSON.stringify(this.create()); },
  /** Valida sem tocar em nada. Retorna {ok, errors, backup, summary}. */
  parse(text) {
    const E = (m) => ({ ok: false, errors: [m] });
    if (typeof text !== 'string' || !text.trim()) return E('Nada para importar');
    if (text.length > this.MAX_TEXT) return E('Arquivo grande demais');
    let b; try { b = JSON.parse(text); } catch (e) { return E('Arquivo não é um JSON válido'); }
    if (!b || b.type !== 'tetris-backup' || b.app !== 'tetris') return E('Não é um backup do Tetris');
    if (b.v !== 1) return E('Versão de backup não suportada (' + b.v + ')');
    if (!b.data || typeof b.data !== 'object' || !b.data.global || !b.data.profiles) return E('Backup incompleto');
    if (b.sum !== fnv(JSON.stringify(b.data))) return E('Checksum não confere (arquivo alterado ou incompleto)');
    const g = b.data.global, ps = b.data.profiles;
    let pst; try { pst = JSON.parse(g.profiles); } catch (e) { return E('Lista de perfis inválida'); }
    if (!pst || !Array.isArray(pst.list) || !pst.list.length || pst.list.length > Profile.MAX) return E('Lista de perfis inválida');
    const clean = Profile.parse(pst);
    if (clean.list.length !== pst.list.length) return E('Perfis inválidos no backup');
    if (g.ranking != null) { try { JSON.parse(g.ranking); } catch (e) { return E('Ranking inválido'); } }
    for (const k of Object.keys(g)) if (!['profiles', 'ranking'].includes(k)) return E('Chave global desconhecida: ' + k);
    const ids = new Set(clean.list.map((p) => p.id)); let total = 0;
    for (const pid of Object.keys(ps)) {
      if (!ids.has(pid)) return E('Dados de perfil inexistente: ' + pid);
      const o = ps[pid]; if (!o || typeof o !== 'object' || Array.isArray(o)) return E('Dados de perfil inválidos');
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (!Store.KEYS.includes(k)) return E('Chave desconhecida: ' + k);
        if (typeof v !== 'string' || v.length > this.MAX_VALUE) return E('Valor inválido em ' + k);
        total += v.length;
        if (this.JSON_KEYS.includes(k)) { try { JSON.parse(v); } catch (e) { return E('Dados corrompidos em ' + k); } }
        else if (!/^[\w.\-]{0,40}$/.test(v)) return E('Valor inválido em ' + k);
      }
    }
    if (total > this.MAX_TEXT) return E('Conteúdo grande demais');
    const rows = clean.list.map((p) => {
      const o = ps[p.id] || {}, js = (k, d) => { try { return o[k] ? JSON.parse(o[k]) : d; } catch (e) { return d; } };
      const st = js('stats', { all: {} }), ac = js('achv', {}), th = js('themes', []), hi = js('history', []);
      return { id: p.id, name: p.name, games: num(st.all && st.all.games), best: num(st.all && st.all.bestScore), achv: Object.keys(ac).length, themes: Array.isArray(th) ? th.length : 0, history: Array.isArray(hi) ? hi.length : 0 };
    });
    return { ok: true, errors: [], backup: b, summary: { created: num(b.created), engine: b.engine, profiles: rows, current: clean.current } };
  },
  _wipe(ids) {
    const rm = (k) => { try { localStorage.removeItem(k); } catch (e) {} };
    new Set(ids).forEach((pid) => Store.KEYS.forEach((k) => rm(Profile.prefixFor(pid) + k)));
    ['profiles', 'ranking'].forEach((k) => rm('tetris__' + k));
  },
  _write(data) {
    for (const k of Object.keys(data.global)) localStorage.setItem('tetris__' + k, data.global[k]);
    for (const pid of Object.keys(data.profiles)) for (const k of Object.keys(data.profiles[pid])) localStorage.setItem(Profile.prefixFor(pid) + k, data.profiles[pid][k]);
  },
  _verify(data) {
    for (const k of Object.keys(data.global)) if (localStorage.getItem('tetris__' + k) !== data.global[k]) return false;
    for (const pid of Object.keys(data.profiles)) for (const k of Object.keys(data.profiles[pid])) if (localStorage.getItem(Profile.prefixFor(pid) + k) !== data.profiles[pid][k]) return false;
    return true;
  },
  /** Substitui TODOS os dados atuais pelo backup. Transacional: em qualquer falha, os dados anteriores são restaurados. */
  restore(text) {
    const p = this.parse(text); if (!p.ok) return p;                       // 1) validação total antes de tocar em qualquer coisa
    const snap = this.collect(), snapText = JSON.stringify({ type: 'tetris-backup', v: 1, app: 'tetris', engine: ENGINE_VERSION, created: Date.now(), sum: fnv(JSON.stringify(snap)), data: snap });
    const oldIds = Object.keys(snap.profiles), newData = p.backup.data;
    try {
      this._wipe(oldIds.concat(Object.keys(newData.profiles)));
      this._write(newData);
      if (!this._verify(newData)) throw new Error('verify');
    } catch (e) {                                                           // 2) rollback
      let ok = false;
      try { this._wipe(oldIds.concat(Object.keys(newData.profiles))); this._write(snap); ok = this._verify(snap); } catch (e2) { ok = false; }
      Profile.load(); try { reloadProfileData(); } catch (e3) {}
      return { ok: false, errors: [ok ? 'Falha ao gravar o backup (espaço insuficiente?). Seus dados anteriores foram mantidos.' : 'Falha grave ao restaurar. Use "Recuperar estado anterior" se disponível.'] };
    }
    try { Store.gset('prevbackup', snapText); } catch (e) {}                 // cópia do estado anterior para recuperação manual
    Profile.load(); try { reloadProfileData(); } catch (e) {}
    return { ok: true, errors: [], summary: p.summary };
  },
  hasPrev() { return !!Store.gget('prevbackup'); },
  restorePrev() { const t = Store.gget('prevbackup'); if (!t) return { ok: false, errors: ['Nenhum estado anterior salvo'] }; return this.restore(t); },
};
function openBackup() {
  Sheet.push('Backup e restauração', (b) => {
    b.appendChild(h('div', { class: 'hint', text: 'O backup inclui TODOS os perfis: estatísticas, histórico, recordes, conquistas, missões, temas, configurações, replays, desafios e torneios. Restaurar substitui os dados atuais.' }));
    const out = h('div', { class: 'errs' });
    const text = () => Backup.text();
    b.appendChild(btn('Exportar: salvar arquivo', () => Native.saveFile('tetris-backup-' + Daily.dateKey() + '.json', 'application/json', text(), (ok) => { out.textContent = ok ? '✓ Backup salvo' : 'Não foi possível salvar'; out.className = 'errs' + (ok ? ' ok' : ''); })));
    if (Native.available()) b.appendChild(btn('Exportar: compartilhar', () => Native.share('Backup do Tetris', text())));
    b.appendChild(btn('Exportar: ver texto', () => Sheet.push('Texto do backup', (c) => { const t = text(), ta = h('textarea', { class: 'txt', rows: '8', readonly: 'readonly' }); ta.value = t; c.appendChild(h('div', { class: 'hint', text: Math.ceil(t.length / 1024) + ' KB' })); c.appendChild(ta); })));
    b.appendChild(btn('Importar backup…', openBackupImport));
    if (Backup.hasPrev()) b.appendChild(btn('Recuperar estado anterior à última restauração', () => Confirm.ask('Restaurar o estado que existia antes da última restauração?', () => { const r = Backup.restorePrev(); out.textContent = r.ok ? '✓ Estado anterior recuperado' : r.errors.join(' · '); out.className = 'errs' + (r.ok ? ' ok' : ''); }), 'danger'));
    b.appendChild(out);
  });
}
function openBackupImport() {
  Sheet.push('Importar backup', (b) => {
    const ta = h('textarea', { class: 'txt', rows: '5', placeholder: 'Cole aqui o texto do backup' }), out = h('div', { class: 'errs' }), sum = h('div', {});
    let pending = null;
    const analyze = (t) => {
      clearEl(sum); pending = null; const p = Backup.parse(t);
      if (!p.ok) { out.textContent = p.errors.join(' · '); out.className = 'errs'; return; }
      pending = t; out.textContent = '✓ Backup válido'; out.className = 'errs ok';
      sum.appendChild(kv('Criado em', fmtDate(p.summary.created)));
      p.summary.profiles.forEach((r) => sum.appendChild(kv('👤 ' + r.name, r.games + ' partidas · melhor ' + fmtNum(r.best) + ' · ' + r.achv + ' 🏆 · ' + r.themes + ' temas · ' + r.history + ' no histórico')));
      sum.appendChild(btn('Restaurar (substitui tudo)', () => Confirm.ask('Substituir TODOS os dados atuais por este backup? Os dados atuais serão guardados para recuperação, mas esta ação afeta todos os perfis.', () => {
        const r = Backup.restore(pending); out.textContent = r.ok ? '✓ Backup restaurado' : r.errors.join(' · '); out.className = 'errs' + (r.ok ? ' ok' : ''); if (r.ok) clearEl(sum);
      }), 'danger'));
    };
    b.appendChild(ta); b.appendChild(btn('Verificar texto', () => analyze(ta.value)));
    b.appendChild(btn('Escolher arquivo…', () => Native.pickFile((t, err) => { if (err || t == null) { out.textContent = err || 'Falha ao abrir'; out.className = 'errs'; } else { ta.value = t.length > 20000 ? '(arquivo carregado: ' + Math.ceil(t.length / 1024) + ' KB)' : t; analyze(t); } })));
    b.appendChild(out); b.appendChild(sum);
  });
}
Hub.add(80, 'Backup e restauração', openBackup);
