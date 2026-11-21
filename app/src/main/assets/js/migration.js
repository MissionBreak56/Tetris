'use strict';
/* MigrationManager — versão do esquema de dados + migrações seguras.
   Regras: (1) migrações só ACRESCENTAM/normalizam: nunca apagam o localStorage antigo nem renomeiam chaves; o perfil antigo "p1" (prefixo tetris_) continua igual;
   (2) cada passo roda uma vez (versão gravada em 'schema'), é idempotente e é conferido (verify);
   (3) antes de cada passo há snapshot durável + cópia em memória; se o passo falhar, volta EXATAMENTE ao estado anterior;
   (4) 'pending' marca o passo em andamento: se o app fechar no meio, a próxima abertura detecta e refaz (idempotente), no máximo MAX_TRIES vezes. */
const MigrationManager = {
  KEY: 'schema', CURRENT: 2, MAX_TRIES: 3, lastBoot: null,
  read() { const s = Store.ggetJSON(this.KEY, null); return s && typeof s === 'object' && Number.isInteger(s.v) && s.v >= 0 ? s : { v: 0, log: [], tries: 0, pending: null }; },
  write(s) { return Store.gsetVerified(this.KEY, JSON.stringify(s)); },
  /** Quantas chaves cada perfil tem (para provar que uma migração não perdeu dado). */
  keyCounts() {
    const o = {};
    Profile.list().forEach((p) => { const pre = Profile.prefixFor(p.id); let n = 0; Store.KEYS.forEach((k) => { try { if (localStorage.getItem(pre + k) != null) n++; } catch (e) {} }); o[p.id] = n; });
    return o;
  },
  steps: [
    { id: 'baseline-1', from: 0, to: 1,
      // marca a instalação existente (inclusive a de antes do versionamento: perfil p1 com chaves tetris_*). Não altera NENHUM dado.
      run() {},
      verify() { return Profile.list().length >= 1; } },
    { id: 'profiles-2', from: 1, to: 2,
      // normaliza a lista de perfis (ids/nomes válidos, contador 'next' maior que todo id existente). Os dados dos perfis não são tocados.
      run() {
        const raw = Store.ggetJSON('profiles', null); if (raw == null) return;        // nunca foi salva: nada a migrar
        const clean = Profile.parse(raw);
        const max = clean.list.reduce((m, p) => Math.max(m, parseInt(String(p.id).slice(1), 10) || 0), 0);
        if (!(clean.next > max)) clean.next = max + 1;
        if (JSON.stringify(clean) !== JSON.stringify(raw)) { if (!Store.gsetJSON('profiles', clean)) throw new Error('write'); Profile.load(); }
      },
      verify(ctx) { const now = MigrationManager.keyCounts(); return Object.keys(ctx.keys).every((id) => !(id in now) || now[id] === ctx.keys[id]); } },
  ],
  run() {
    const res = { ran: [], ok: true, rolledBack: false, errors: [] };
    let s = this.read();
    if (s.v >= this.CURRENT && !s.pending) return res;
    if (s.pending) res.interrupted = s.pending;                                        // migração interrompida: os passos são idempotentes, refaz
    let ver = ''; try { ver = Native.version() || ''; } catch (e) {}
    for (const m of this.steps) {
      if (m.to <= s.v) continue;
      if ((s.tries || 0) >= this.MAX_TRIES) { res.ok = false; res.errors.push('Migração ' + m.id + ' falhou ' + this.MAX_TRIES + ' vezes; o app segue com os dados atuais'); break; }
      const pre = Backup.text();                                                       // estado exato de antes (memória), para desfazer
      try { if (typeof SnapshotManager !== 'undefined') SnapshotManager.protect('pre-migration'); } catch (e) {}
      s.pending = m.id; s.tries = (s.tries || 0) + 1; this.write(s);
      const ctx = { keys: this.keyCounts() };
      let ok = false;
      try { m.run(ctx); ok = !!m.verify(ctx); } catch (e) { ok = false; }
      if (!ok) {
        const r = Backup.restore(pre, { recovery: true });                             // volta exatamente ao estado anterior
        res.ok = false; res.rolledBack = !!r.ok; res.errors.push('Migração ' + m.id + ' falhou' + (r.ok ? ' e foi desfeita' : ' (e não foi possível desfazer)'));
        s = this.read(); s.pending = null; s.lastError = m.id; this.write(s);
        break;
      }
      s.v = m.to; s.pending = null; s.tries = 0; s.log = (s.log || []).concat({ id: m.id, at: Date.now(), app: ver }).slice(-20);
      if (!this.write(s)) res.errors.push('Não foi possível gravar a versão do esquema (será refeita na próxima abertura)');
      res.ran.push(m.id);
    }
    return res;
  },
  /** Chamado uma vez na abertura do app: recupera restauração interrompida, recupera dados perdidos, migra e liga os snapshots. */
  boot() {
    const out = { restore: null, snapshot: null, migration: null };
    try { out.restore = Backup.recoverInterrupted(); } catch (e) {}
    try { out.snapshot = SnapshotManager.recoverIfEmpty(); } catch (e) {}
    try { out.migration = this.run(); } catch (e) { out.migration = { ok: false, errors: [String(e && e.message || e)] }; }
    let last = 0;
    Store.onError = () => { const t = Date.now(); if (t - last < 15000) return; last = t; try { pzToast('Não foi possível salvar os dados (armazenamento cheio?)'); } catch (e) {} };
    try { SnapshotManager.install(); if (SnapshotManager.available()) setTimeout(() => SnapshotManager.create('boot', false), 6000); } catch (e) {}
    try { if ((out.snapshot && out.snapshot.recovered) || (out.restore && out.restore.recovered)) pzToast('Dados recuperados do snapshot do aparelho'); } catch (e) {}
    this.lastBoot = out;
    return out;
  },
};
