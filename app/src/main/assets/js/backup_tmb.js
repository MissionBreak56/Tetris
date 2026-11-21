'use strict';
/* BackupManager / RestoreManager — formato .tmb ("Tetris Mission Backup") v2.
   Arquivo JSON de texto:
     { format:'TMB', fv:2, app:'tetris', appVersion, engine, created, scope:'all'|'profile',
       enc: null | { alg:'AES-256-GCM', kdf:'PBKDF2-HMAC-SHA256', iter, salt(b64,16), iv(b64,12) },
       body: base64( JSON dos dados  |  AES-GCM(JSON) ), sha256: hex( SHA-256( cabeçalho || body ) ) }
   Protegido por senha: chave = PBKDF2-HMAC-SHA256(senha, salt aleatório de 16 bytes, 600.000 iterações) -> AES-256-GCM com nonce (iv) aleatório de 12 bytes
   NOVO a cada backup (a chave também é nova a cada backup, pois o salt muda: nunca há nonce repetido com a mesma chave).
   O cabeçalho entra como dado autenticado (AAD): alterar escopo/versão/data invalida a decifragem. A chave NÃO vem do Android Keystore
   (chaves do Keystore não saem do aparelho): o backup restaura em outro aparelho com a senha certa. Backup sem senha é só um arquivo íntegro (checksum), NÃO é sigiloso.
   Os dados dentro são os mesmos do backup antigo (v1) e passam pelo MESMO validador (Backup.parse). Backups v1 (.json) continuam funcionando. */
const TMB = { FORMAT: 'TMB', FV: 2, APP: 'tetris', ITER: 600000, MIN_ITER: 100000, MAX_ITER: 3000000, MIN_PW: 8, MAX_PW: 128, MAX_TEXT: 9000000, MAX_BODY: 7000000 };

const tmbPw = (p) => { p = String(p); try { return p.normalize('NFKC'); } catch (e) { return p; } };   // mesma senha digitada por teclados diferentes
const tmbCat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
const tmbAad = (h) => CryptoManager.utf8(['TMB', h.fv, h.app, h.appVersion, h.engine, h.created, h.scope, h.enc ? [h.enc.alg, h.enc.kdf, h.enc.iter, h.enc.salt, h.enc.iv].join(':') : '-'].join('|'));
const tmbVer = () => { let v = ''; try { v = (typeof Native !== 'undefined' && Native.version && Native.version()) || ''; } catch (e) {} return /^[\w.\-]{0,24}$/.test(v) ? v : ''; };

const BackupManager = {
  isTmb(text) { return typeof text === 'string' && text.length < TMB.MAX_TEXT && /^\s*\{\s*"format"\s*:\s*"TMB"/.test(text); },
  /** Dados a exportar: tudo, ou só um perfil (sem o PIN, que depende do aparelho/perfil, e sem o ranking global). */
  collect(profileId) {
    if (!profileId) return Backup.collect();
    const p = Profile.list().find((x) => x.id === profileId); if (!p) return null;
    const o = {}, pre = Profile.prefixFor(p.id);
    Store.KEYS.forEach((k) => { let v = null; try { v = localStorage.getItem(pre + k); } catch (e) {} if (v != null) o[k] = v; });
    const q = Object.assign({}, p); delete q.pin;
    const st = Object.assign({}, Profile.state, { list: [q], current: p.id });
    return { global: { profiles: JSON.stringify(st) }, profiles: { [p.id]: o } };
  },
  /** Gera o texto .tmb. opts: { password?, profileId?, iter? }. Assíncrono (WebCrypto). */
  async create(opts) {
    opts = opts || {};
    const pw = opts.password == null || opts.password === '' ? null : tmbPw(opts.password);
    if (pw !== null && (pw.length < TMB.MIN_PW || pw.length > TMB.MAX_PW)) return { ok: false, errors: ['A senha deve ter de ' + TMB.MIN_PW + ' a ' + TMB.MAX_PW + ' caracteres'] };
    if (pw !== null && !CryptoManager.available()) return { ok: false, errors: ['Criptografia indisponível neste aparelho'] };
    const scope = opts.profileId ? 'profile' : 'all', data = this.collect(opts.profileId || null);
    if (!data) return { ok: false, errors: ['Perfil não encontrado'] };
    const v1 = { type: 'tetris-backup', v: 1, app: 'tetris', engine: ENGINE_VERSION, created: Date.now(), sum: fnv(JSON.stringify(data)), data };
    const chk = Backup.parse(JSON.stringify(v1));                                  // verificação ANTES de exportar
    if (!chk.ok) return { ok: false, errors: ['Os dados atuais não passaram na verificação: ' + chk.errors.join(' · ')] };
    const payload = CryptoManager.utf8(JSON.stringify({ type: 'tetris-backup-data', scope, profile: opts.profileId || null, data }));
    const head = { format: TMB.FORMAT, fv: TMB.FV, app: TMB.APP, appVersion: tmbVer(), engine: String(ENGINE_VERSION), created: Date.now(), scope, enc: null };
    let body;
    if (pw === null) body = payload;
    else {
      const iter = opts.iter || TMB.ITER, salt = CryptoManager.randomBytes(16), iv = CryptoManager.randomBytes(12);
      head.enc = { alg: 'AES-256-GCM', kdf: 'PBKDF2-HMAC-SHA256', iter, salt: CryptoManager.b64e(salt), iv: CryptoManager.b64e(iv) };
      let key = null;
      try {
        key = await CryptoManager.deriveKey(pw, salt, iter);
        body = await CryptoManager.encrypt(key, iv, payload, tmbAad(head));
        const back = await CryptoManager.decrypt(key, iv, body, tmbAad(head));    // conferência: o que cifrei volta igual
        if (!CryptoManager.ctEqual(back, payload)) return { ok: false, errors: ['Falha na verificação da criptografia'] };
      } catch (e) { return { ok: false, errors: ['Falha ao criptografar o backup'] }; }
      finally { if (key) key.fill(0); }
    }
    const out = Object.assign({}, head, { body: CryptoManager.b64e(body), sha256: CryptoManager.hex(CryptoManager.sha256(tmbCat(tmbAad(head), body))) });
    const text = JSON.stringify(out);
    return { ok: true, text, size: text.length, encrypted: pw !== null, scope };
  },
  fileName(scope) { let d = ''; try { d = Daily.dateKey(); } catch (e) { d = String(Date.now()); } return 'tetris-' + (scope === 'profile' ? 'perfil' : 'backup') + '-' + d + '.tmb'; },
};

const RestoreManager = {
  /** Valida (sem tocar em nada). Devolve { ok, errors, summary, scope, v1text, backup } ou { ok:false, errors, needsPassword?, wrongPassword? }. */
  async parse(text, password) {
    const E = (m, x) => Object.assign({ ok: false, errors: [m] }, x || {});
    if (typeof text !== 'string' || !text.trim()) return E('Nada para importar');
    if (text.length > TMB.MAX_TEXT) return E('Arquivo grande demais');
    let o; try { o = JSON.parse(text); } catch (e) { return E('Arquivo não é um JSON válido'); }
    if (!o || typeof o !== 'object' || o.format !== TMB.FORMAT) return E('Não é um backup .tmb do Tetris');
    if (o.app !== TMB.APP) return E('Não é um backup do Tetris');
    if (!Number.isInteger(o.fv) || o.fv < 1) return E('Versão do formato inválida');
    if (o.fv > TMB.FV) return E('Backup de uma versão mais nova do Tetris (formato ' + o.fv + '). Atualize o app para restaurar.');
    const okStr = (v, n) => typeof v === 'string' && v.length <= n && /^[\w.\-]*$/.test(v);
    if (!okStr(o.appVersion, 24) || !okStr(o.engine, 16) || typeof o.created !== 'number' || !isFinite(o.created) || o.created <= 0 || !['all', 'profile'].includes(o.scope)) return E('Cabeçalho do backup inválido');
    if (typeof o.body !== 'string' || typeof o.sha256 !== 'string') return E('Backup incompleto');
    let enc = null;
    if (o.enc != null) {
      const e = o.enc;
      if (!e || typeof e !== 'object' || e.alg !== 'AES-256-GCM' || e.kdf !== 'PBKDF2-HMAC-SHA256' || !Number.isInteger(e.iter) || e.iter < TMB.MIN_ITER || e.iter > TMB.MAX_ITER) return E('Parâmetros de criptografia inválidos');
      const salt = CryptoManager.b64d(e.salt), iv = CryptoManager.b64d(e.iv);
      if (!salt || salt.length !== 16 || !iv || iv.length !== 12) return E('Parâmetros de criptografia inválidos');
      enc = { iter: e.iter, salt, iv };
    }
    const body = CryptoManager.b64d(o.body);
    if (!body || body.length > TMB.MAX_BODY) return E('Conteúdo do backup inválido');
    const head = { fv: o.fv, app: o.app, appVersion: o.appVersion, engine: o.engine, created: o.created, scope: o.scope, enc: o.enc ? { alg: o.enc.alg, kdf: o.enc.kdf, iter: o.enc.iter, salt: o.enc.salt, iv: o.enc.iv } : null };
    const aad = tmbAad(head), want = CryptoManager.unhex(o.sha256);
    if (!want || want.length !== 32 || !CryptoManager.ctEqual(CryptoManager.sha256(tmbCat(aad, body)), want)) return E('Arquivo corrompido ou incompleto (o checksum não confere)');
    let payload;
    if (!enc) payload = body;
    else {
      if (password == null || password === '') return E('Este backup é protegido por senha', { needsPassword: true });
      if (!CryptoManager.available()) return E('Criptografia indisponível neste aparelho');
      let key = null;
      try { key = await CryptoManager.deriveKey(tmbPw(password), enc.salt, enc.iter); payload = await CryptoManager.decrypt(key, enc.iv, body, aad); }
      catch (e) { return E('Senha incorreta ou arquivo alterado', { wrongPassword: true }); }
      finally { if (key) key.fill(0); }
    }
    let pl; try { pl = JSON.parse(CryptoManager.unutf8(payload)); } catch (e) { return E('Conteúdo do backup inválido'); }
    if (!pl || pl.type !== 'tetris-backup-data' || pl.scope !== o.scope || !pl.data || typeof pl.data !== 'object') return E('Conteúdo do backup inválido');
    const v1 = { type: 'tetris-backup', v: 1, app: 'tetris', engine: o.engine, created: o.created, sum: fnv(JSON.stringify(pl.data)), data: pl.data };
    const v1text = JSON.stringify(v1), p = Backup.parse(v1text);                  // mesmo validador do backup antigo
    if (!p.ok) return p;
    if (o.scope === 'profile' && (p.summary.profiles.length !== 1 || Object.keys(p.backup.data.profiles).length > 1)) return E('Backup de perfil inválido');
    return { ok: true, errors: [], backup: p.backup, v1text, scope: o.scope, summary: Object.assign({}, p.summary, { tmb: { fv: o.fv, encrypted: !!enc, scope: o.scope, appVersion: o.appVersion } }) };
  },
  /** Restaura. 'all' substitui tudo (transacional, com snapshot); 'profile' entra como NOVO perfil. */
  async restore(text, password) {
    const p = await this.parse(text, password); if (!p.ok) return p;
    return p.scope === 'all' ? Backup.restore(p.v1text) : this.importProfile(p);
  },
  /** Perfil importado vira um perfil NOVO (nome único, id novo, PIN não vem). Só entra na lista depois de gravar e conferir os dados. */
  importProfile(p) {
    if (Profile.list().length >= Profile.MAX) return { ok: false, errors: ['Limite de ' + Profile.MAX + ' perfis. Exclua um perfil antes de importar.'] };
    const data = p.backup.data, src = JSON.parse(data.global.profiles).list[0], srcData = data.profiles[src.id] || {};
    const names = new Set(Profile.list().map((x) => x.name)); let name = Profile.cleanName(src.name) || 'Perfil';
    if (names.has(name)) { const base = name; for (let n = 2; n < 100; n++) { const c = base.slice(0, 16 - (' (' + n + ')').length) + ' (' + n + ')'; if (!names.has(c)) { name = c; break; } } }
    const id = 'p' + Profile.state.next, pre = Profile.prefixFor(id), written = [];
    const undo = () => written.forEach((k) => { try { localStorage.removeItem(pre + k); } catch (e) {} });
    try {
      for (const k of Object.keys(srcData)) { localStorage.setItem(pre + k, srcData[k]); written.push(k); if (localStorage.getItem(pre + k) !== srcData[k]) throw new Error('verify'); }
    } catch (e) { undo(); return { ok: false, errors: ['Falha ao gravar o perfil (espaço insuficiente?). Nada foi alterado.'] }; }
    const prev = JSON.stringify(Profile.state);
    const row = { id, name }; if (Number.isInteger(src.av)) row.av = src.av;
    Profile.state.list.push(row); Profile.state.next++;
    if (!Profile.save()) { undo(); try { Profile.state = Profile.parse(JSON.parse(prev)); } catch (e) {} return { ok: false, errors: ['Falha ao salvar a lista de perfis. Nada foi alterado.'] }; }
    return { ok: true, errors: [], id, name, summary: p.summary };
  },
};

/* ---------------- telas ---------------- */
function openBackupTmb() {
  Sheet.push('Backup protegido (.tmb)', (b) => {
    b.appendChild(h('div', { class: 'hint', text: 'O arquivo .tmb pode ter senha (criptografia AES-256 + PBKDF2) e restaura em qualquer aparelho com a senha certa. SEM senha o arquivo é íntegro, mas não é sigiloso. Guarde a senha: sem ela não há como abrir o backup.' }));
    const pw = h('input', { type: 'password', class: 'txt', placeholder: 'Senha (opcional, mínimo 8 caracteres)', autocomplete: 'new-password' });
    const pw2 = h('input', { type: 'password', class: 'txt', placeholder: 'Repita a senha', autocomplete: 'new-password' });
    const out = h('div', { class: 'errs' });
    const say = (m, ok) => { out.textContent = m; out.className = 'errs' + (ok ? ' ok' : ''); };
    const go = async (profileId, share) => {
      if (pw.value !== pw2.value) { say('As senhas não são iguais'); return; }
      say('Gerando backup…', true);
      const r = await BackupManager.create({ password: pw.value, profileId });
      if (!r.ok) { say(r.errors.join(' · ')); return; }
      if (share) { Native.share('Backup do Tetris', r.text); say('✓ Backup pronto', true); return; }
      Native.saveFile(BackupManager.fileName(r.scope), 'application/octet-stream', r.text, (ok) => say(ok ? '✓ Backup salvo' + (r.encrypted ? ' (com senha)' : ' (sem senha)') : 'Não foi possível salvar', ok));
    };
    b.appendChild(pw); b.appendChild(pw2);
    b.appendChild(btn('Exportar TUDO (.tmb)', () => go(null, false)));
    b.appendChild(btn('Exportar só o perfil atual (.tmb)', () => go(Profile.state.current, false)));
    b.appendChild(out);
  });
}
/** Importação de .tmb dentro da tela "Importar backup": pede a senha se precisar, mostra a prévia e só então restaura. */
function analyzeTmb(text, out, sum, password) {
  const say = (m, ok) => { out.textContent = m; out.className = 'errs' + (ok ? ' ok' : ''); };
  clearEl(sum); say('Verificando…', true);
  RestoreManager.parse(text, password).then((p) => {
    clearEl(sum);
    if (p.needsPassword || p.wrongPassword) {
      say(p.wrongPassword ? p.errors[0] : 'Este backup é protegido por senha', false);
      const pw = h('input', { type: 'password', class: 'txt', placeholder: 'Senha do backup', autocomplete: 'off' });
      sum.appendChild(pw); sum.appendChild(btn('Abrir backup', () => analyzeTmb(text, out, sum, pw.value))); return;
    }
    if (!p.ok) { say(p.errors.join(' · ')); return; }
    say('✓ Backup válido' + (p.summary.tmb.encrypted ? ' (protegido por senha)' : ''), true);
    sum.appendChild(kv('Criado em', fmtDate(p.summary.created)));
    sum.appendChild(kv('Conteúdo', p.scope === 'profile' ? 'um perfil' : 'todos os perfis'));
    p.summary.profiles.forEach((r) => sum.appendChild(kv('👤 ' + r.name, r.games + ' partidas · melhor ' + fmtNum(r.best) + ' · ' + r.achv + ' 🏆 · ' + r.themes + ' temas · ' + r.history + ' no histórico')));
    const all = p.scope === 'all';
    sum.appendChild(btn(all ? 'Restaurar (substitui tudo)' : 'Importar como novo perfil', () => Confirm.ask(all ? 'Substituir TODOS os dados atuais por este backup? Os dados atuais serão guardados para recuperação, mas esta ação afeta todos os perfis.' : 'Adicionar este perfil como um perfil novo? Nada do que existe será alterado (o PIN não é importado).', () => {
      RestoreManager.restore(text, password).then((r) => { say(r.ok ? (all ? '✓ Backup restaurado' : '✓ Perfil importado: ' + r.name) : r.errors.join(' · '), r.ok); if (r.ok) clearEl(sum); });
    }), all ? 'danger' : ''));
  });
}

/** Snapshot automático do aparelho (fora da memória do jogo): mostra data e conteúdo e restaura se o usuário confirmar. */
function openSnapshotRecover() {
  Sheet.push('Snapshot do aparelho', (b) => {
    const l = SnapshotManager.loadLatest(), out = h('div', { class: 'errs' });
    if (!l.ok) { b.appendChild(h('div', { class: 'hint', text: l.errors.join(' · ') })); return; }
    b.appendChild(h('div', { class: 'hint', text: 'O app guarda sozinho uma cópia dos seus dados fora da memória do jogo (cifrada no aparelho, não vai para a nuvem). Use só se perdeu dados.' }));
    b.appendChild(kv('Criado em', fmtDate(l.snap.created)));
    const pst = (() => { try { return JSON.parse(l.snap.data.global.profiles).list.map((x) => x.name).join(', '); } catch (e) { return '?'; } })();
    b.appendChild(kv('Perfis', pst));
    b.appendChild(btn('Restaurar este snapshot', () => Confirm.ask('Substituir TODOS os dados atuais pelo snapshot? Os dados atuais serão guardados para recuperação.', () => {
      const r = Backup.restore(SnapshotManager.toBackupText(l.snap)); out.textContent = r.ok ? '✓ Snapshot restaurado' : r.errors.join(' · '); out.className = 'errs' + (r.ok ? ' ok' : '');
    }), 'danger'));
    b.appendChild(out);
  });
}
