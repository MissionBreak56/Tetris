'use strict';
/* Atualização dentro do app (Android): procura a última release no GitHub; se houver uma mais nova mostra "Baixar agora" / "Depois".
   O download acontece no próprio app (com progresso) e a instalação é pedida ao Android (PackageInstaller). Procurar/baixar: AppUpdate.java; instalar: MainActivity.java.
   Estados: idle · checking · available · downloading · downloaded · installing · needPermission · uptodate · error. */
const Updater = {
  st: 'idle', tag: null, notes: '', size: 0, done: 0, total: 0, msg: '', manual: false, lastCheck: 0, ver: null, pendingShow: false, AUTO_MIN_MS: 3600000,
  current() { if (this.ver == null) this.ver = Native.version(); return this.ver; },
  label() { const v = this.current(); return v ? 'v' + v : ''; },
  /** >0 se a é mais nova que b ("1.7.1" × "1.7.0"). */
  cmp(a, b) { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; },
  newer() { return !!(this.tag && this.current() && this.cmp(this.tag.replace(/^v/, ''), this.current()) > 0); },
  busy() { return ['checking', 'downloading', 'installing'].includes(this.st); },
  /** manual = botão "Procurar atualização" (sempre mostra o resultado); automático (ao abrir o app) só incomoda se houver versão nova. */
  check(manual) {
    if (!Native.available()) { this.st = 'error'; this.msg = 'A atualização pelo app só funciona no Android.'; this.manual = !!manual; if (manual) this.showDialog(); return false; }
    if (this.busy()) return false;
    this.manual = !!manual; this.st = 'checking'; this.msg = ''; this.lastCheck = Date.now(); Native.updateCheck(); this.render(); return true;
  },
  /** Ao abrir o app (no máximo 1 vez por hora), se a preferência estiver ligada. */
  autoCheck() {
    if (!settings.updAuto || !Native.available()) return false;
    if (Date.now() - (Number(Store.gget('updLast')) || 0) < this.AUTO_MIN_MS) return false;
    Store.gset('updLast', Date.now()); return this.check(false);
  },
  download() { if (this.st !== 'available' && this.st !== 'error') return false; if (!this.tag) return false; this.done = 0; this.total = this.size; this.st = 'downloading'; this.msg = ''; Native.updateDownload(this.tag); this.render(); return true; },
  cancel() { if (this.st === 'downloading') Native.updateCancel(); },
  install() { this.st = 'installing'; this.msg = ''; Native.updateInstall(); this.render(); },
  /** Eventos vindos do Android (AppUpdate / PackageInstaller). */
  _ev(e) {
    if (!e || typeof e !== 'object') return;
    switch (e.e) {
      case 'checked': {
        const tag = String(e.tag || ''); if (!/^v\d+\.\d+\.\d+$/.test(tag)) { this.st = 'error'; this.msg = 'Resposta inesperada do GitHub'; break; }
        this.tag = tag; this.notes = ''; this.size = 0;
        try { const j = JSON.parse(e.api || '{}'); this.notes = String(j.body || '').replace(/\r/g, '').slice(0, 700); const a = (j.assets || []).find((x) => /\.apk$/i.test(String(x.name || ''))) || (j.assets || [])[0]; this.size = a ? num(a.size) : 0; } catch (x) {}
        this.st = this.newer() ? 'available' : 'uptodate'; break;
      }
      case 'progress': this.done = num(e.done); this.total = num(e.total) || this.size; break;
      case 'downloaded': this.done = this.total = num(e.size); this.st = 'downloaded'; this.install(); return;
      case 'installing': this.st = 'installing'; break;
      case 'confirm': this.st = 'installing'; this.msg = 'Confirme a instalação na tela do Android.'; break;
      case 'needPermission': this.st = 'needPermission'; break;
      case 'installed': this.st = 'installing'; this.msg = 'Atualização instalada. O app vai reiniciar.'; break;
      case 'cancelled': this.st = 'available'; this.msg = 'Download cancelado.'; break;
      case 'error': this.st = 'error'; this.msg = String(e.msg || 'Erro desconhecido').slice(0, 200); break;
      default: return;
    }
    this.render();
  },
  /** Mostra o diálogo conforme o estado (só no menu, para nunca interromper uma partida). */
  render() {
    const show1 = this.st === 'available' ? true : this.manual && this.st !== 'idle' && this.st !== 'checking';
    if (this.st === 'checking') { this.refreshSheet(); return; }
    if (show1 || ['downloading', 'installing', 'needPermission'].includes(this.st)) this.showDialog(); else this.hideDialog();
    this.refreshSheet();
  },
  showDialog() { if (typeof state !== 'undefined' && state !== 'MENU' && !this.manual) { this.pendingShow = true; return; } this.pendingShow = false; this.paint(); show('updPanel'); },
  hideDialog() { hide('updPanel'); },
  /** Chamado ao voltar ao menu: mostra o aviso que ficou pendente durante uma partida. */
  maybeShow() { if (this.pendingShow && this.st === 'available') this.showDialog(); },
  refreshSheet() { if (typeof Sheet !== 'undefined' && $('sheetTitle') && $('sheetTitle').textContent === 'Atualizações' && $('sheet').classList.contains('on')) Sheet.refresh(); },
  fmtSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; },
  paint() {
    const t = $('updTitle'), b = $('updBody'); clearEl(b);
    const close = () => { this.hideDialog(); };
    if (this.st === 'available') {
      t.textContent = 'Atualização disponível';
      b.appendChild(kv('Versão instalada', this.label() || '—')); b.appendChild(kv('Nova versão', this.tag)); if (this.size) b.appendChild(kv('Tamanho', this.fmtSize(this.size)));
      if (this.notes) b.appendChild(h('div', { class: 'hint updnotes', text: this.notes }));
      if (this.msg) b.appendChild(h('div', { class: 'errs', text: this.msg }));
      b.appendChild(btn('Baixar agora', () => this.download())); b.appendChild(btn('Depois', close));
    } else if (this.st === 'downloading') {
      const pct = this.total > 0 ? Math.min(100, Math.round(100 * this.done / this.total)) : 0;
      t.textContent = 'Baixando ' + this.tag + '…';
      b.appendChild(h('div', { class: 'bar' }, h('i', { style: 'width:' + pct + '%' })));
      b.appendChild(h('div', { class: 'hint', text: pct + '% · ' + this.fmtSize(this.done) + (this.total ? ' de ' + this.fmtSize(this.total) : '') }));
      b.appendChild(btn('Cancelar', () => this.cancel()));
    } else if (this.st === 'installing') {
      t.textContent = 'Instalando…'; b.appendChild(h('div', { class: 'hint', text: this.msg || 'Confirme a instalação quando o Android pedir.' })); b.appendChild(btn('Fechar', close));
    } else if (this.st === 'needPermission') {
      t.textContent = 'Permissão necessária';
      b.appendChild(h('div', { class: 'hint', text: 'Para instalar a atualização o Android precisa que você permita "Instalar apps desconhecidos" para o Tetris. Abri o ajuste: ative a opção, volte ao app e toque em Instalar.' }));
      b.appendChild(btn('Instalar', () => this.install())); b.appendChild(btn('Depois', close));
    } else if (this.st === 'uptodate') {
      t.textContent = 'Tudo atualizado'; b.appendChild(h('div', { class: 'hint', text: 'Você está na versão mais recente' + (this.label() ? ' (' + this.label() + ')' : '') + '.' })); b.appendChild(btn('OK', close));
    } else {
      t.textContent = 'Não foi possível atualizar'; b.appendChild(h('div', { class: 'errs', text: this.msg || 'Erro desconhecido' }));
      if (this.tag && Native.available() && this.newer()) b.appendChild(btn('Tentar de novo', () => this.download()));
      b.appendChild(btn('Fechar', close));
    }
  },
};
function openUpdates() {
  Sheet.push('Atualizações', (b) => {
    b.appendChild(kv('Versão instalada', Updater.label() || '—'));
    if (Updater.tag) b.appendChild(kv('Última versão publicada', Updater.tag + (Updater.newer() ? ' (nova)' : '')));
    if (Updater.lastCheck) b.appendChild(kv('Última verificação', fmtDate(Updater.lastCheck)));
    if (Updater.st === 'checking') b.appendChild(h('div', { class: 'hint', text: 'Procurando…' }));
    if (!Native.available()) b.appendChild(h('div', { class: 'hint', text: 'A atualização dentro do app só funciona no Android.' }));
    b.appendChild(btn('Procurar atualização', () => Updater.check(true)));
    if (Updater.st === 'available') b.appendChild(btn('Baixar a versão ' + Updater.tag, () => { Updater.manual = true; Updater.showDialog(); }));
    b.appendChild(toggleBtn('Procurar ao abrir o app', () => settings.updAuto, (v) => { settings.updAuto = v; saveSettings(); }));
    b.appendChild(h('div', { class: 'hint', text: 'O download é feito dentro do app e o Android pede a sua confirmação para instalar. Seus dados e perfis não são apagados.' }));
  });
}
Hub.add(90, 'Atualizações', openUpdates, 'data');
