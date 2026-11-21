package com.missionbreak56.tetris.core;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.PowerManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.missionbreak56.tetris.network.LanNet;
import com.missionbreak56.tetris.security.CryptoManager;
import com.missionbreak56.tetris.security.BridgeValidator;
import com.missionbreak56.tetris.storage.SnapshotManager;
import com.missionbreak56.tetris.storage.StorageManager;
import com.missionbreak56.tetris.updates.AppUpdate;
import com.missionbreak56.tetris.updates.UpdateInstaller;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/**
 * Ponte JavaScript -> Android (objeto {@code AndroidBridge}). Os nomes e assinaturas dos métodos públicos são o contrato com o
 * JavaScript e NÃO mudam (compatibilidade). Todo argumento vindo do JS é validado ({@link BridgeValidator}).
 * Só conteúdo local do app é carregado na WebView (ver {@link WebViewConfigurator}).
 */
public final class GameBridge {
    public static final String NAME = "AndroidBridge";
    public static final int REQ_SAVE = 101, REQ_OPEN = 102;

    private final Activity act;
    private final AppLifecycleManager life;
    private final UpdateInstaller installer;
    private volatile WebView web;
    private LanNet lan;
    private AppUpdate upd;
    private String pendingSave;
    private SnapshotManager snaps;
    /** Gravação dos snapshots fora da thread do JavaScript (o JS chama a ponte de forma síncrona: disco lento travaria o jogo). */
    private final ExecutorService io = Executors.newSingleThreadExecutor(new ThreadFactory() {
        public Thread newThread(Runnable r) { Thread t = new Thread(r, "tetris-snapshot"); t.setDaemon(true); return t; }
    });

    public GameBridge(Activity act, AppLifecycleManager life) {
        this.act = act;
        this.life = life;
        this.installer = new UpdateInstaller(act, new UpdateInstaller.Sink() { public void js(String code) { GameBridge.this.js(code); } });
    }

    public void attach(WebView w) { this.web = w; }

    /** Chamar em onDestroy: solta rede, atualização e a referência da WebView (nenhum callback volta depois disso). */
    public void destroy() {
        web = null;
        LanNet l; AppUpdate u;
        synchronized (this) { l = lan; u = upd; lan = null; upd = null; }
        if (l != null) l.close();
        if (u != null) u.cancel();
        installer.unregister();
        pendingSave = null;
        io.shutdown();      // termina a gravação pendente e não aceita mais
    }

    /** Executa JavaScript na página (se a tela ainda existir). */
    public void js(final String code) {
        if (!life.alive()) return;
        act.runOnUiThread(new Runnable() { public void run() {
            WebView w = web;
            if (life.alive() && w != null) w.evaluateJavascript(code, null);
        } });
    }

    private synchronized LanNet lan() {
        if (lan == null) {
            lan = new LanNet(new LanNet.Listener() {
                public void event(final String json) { js("Net._ev(" + json + ")"); }
                public void line(final String line) { js("Net._line(" + LanNet.q(line) + ")"); }
            });
        }
        return lan;
    }

    /** Atualização dentro do app: procurar/baixar (AppUpdate, GitHub Releases); instalar fica em {@link UpdateInstaller}. */
    private synchronized AppUpdate upd() {
        if (upd == null) upd = new AppUpdate(new AppUpdate.Listener() { public void event(final String json) { js("Updater._ev(" + json + ")"); } }, AppUpdate.WEB, AppUpdate.API, "MissionBreak56/Tetris");
        return upd;
    }

    private synchronized SnapshotManager snaps() {
        if (snaps == null) snaps = new SnapshotManager(new StorageManager(new File(act.getFilesDir(), "snapshots")), CryptoManager.available() ? new CryptoManager() : null);
        return snaps;
    }

    private void netError(String msg) { js("Net._ev({\"e\":\"error\",\"msg\":" + LanNet.q(msg) + "})"); }

    // ---------------------------------------------------------------- compartilhar / arquivos
    @JavascriptInterface
    public void share(final String title, final String text) {
        if (BridgeValidator.tooLong(text, BridgeValidator.MAX_SHARE_CHARS)) return;
        final String t = BridgeValidator.clip(title, BridgeValidator.MAX_TITLE);
        act.runOnUiThread(new Runnable() { public void run() {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_SUBJECT, t);
            i.putExtra(Intent.EXTRA_TEXT, text);
            act.startActivity(Intent.createChooser(i, t));
        } });
    }

    @JavascriptInterface
    public void saveFile(final String name, final String mime, final String text) {
        if (BridgeValidator.tooLong(text, BridgeValidator.MAX_FILE_CHARS)) { js("Native._onSaved(false)"); return; }
        final String fn = BridgeValidator.cleanFileName(name), mt = BridgeValidator.cleanMime(mime);
        act.runOnUiThread(new Runnable() { public void run() {
            pendingSave = text;
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType(mt);
            i.putExtra(Intent.EXTRA_TITLE, fn);
            act.startActivityForResult(i, REQ_SAVE);
        } });
    }

    @JavascriptInterface
    public void pickFile() {
        act.runOnUiThread(new Runnable() { public void run() {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            act.startActivityForResult(i, REQ_OPEN);
        } });
    }

    /** Resultado do seletor de arquivos. Devolve true se era um dos pedidos desta ponte. */
    public boolean onActivityResult(int req, int res, Intent data) {
        if (req == REQ_SAVE) {
            boolean ok = false;
            String text = pendingSave; pendingSave = null;
            if (res == Activity.RESULT_OK && data != null && data.getData() != null && text != null) {
                OutputStream os = null;
                try {
                    os = act.getContentResolver().openOutputStream(data.getData());
                    os.write(text.getBytes("UTF-8"));
                    ok = true;
                } catch (Exception e) { ok = false; }
                finally { if (os != null) { try { os.close(); } catch (Exception e2) { ok = false; } } }
            }
            js("Native._onSaved(" + ok + ")");
            return true;
        }
        if (req == REQ_OPEN) {
            if (res != Activity.RESULT_OK || data == null || data.getData() == null) { js("Native._onPicked(null,'Nenhum arquivo escolhido')"); return true; }
            InputStream is = null;
            try {
                is = act.getContentResolver().openInputStream(data.getData());
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n, total = 0;
                while ((n = is.read(buf)) > 0) {
                    total += n;
                    if (total > BridgeValidator.MAX_FILE_CHARS) { js("Native._onPicked(null,'Arquivo muito grande')"); return true; }
                    bo.write(buf, 0, n);
                }
                js("Native._onPicked(" + JSONObject.quote(bo.toString("UTF-8")) + ",null)");
            } catch (Exception e) { js("Native._onPicked(null,'Falha ao ler o arquivo')"); }
            finally { if (is != null) { try { is.close(); } catch (Exception ignored) { } } }
            return true;
        }
        return false;
    }

    // ---------------------------------------------------------------- app / atualização / bateria
    @JavascriptInterface public String version() { try { return act.getPackageManager().getPackageInfo(act.getPackageName(), 0).versionName; } catch (Exception e) { return ""; } }
    @JavascriptInterface public void updateCheck() { upd().check(); }
    @JavascriptInterface public void updateDownload(String tag) { if (AppUpdate.validTag(tag)) upd().download(tag, installer.updatesDir()); }
    @JavascriptInterface public void updateCancel() { upd().cancel(); }
    @JavascriptInterface public void updateInstall() { act.runOnUiThread(new Runnable() { public void run() { installer.install(); } }); }

    /** Bateria para o modo "Automático" de desempenho: {"level":0-100,"charging":bool,"saver":bool} (texto vazio se indisponível). */
    @JavascriptInterface
    public String battery() {
        try {
            Intent b = act.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (b == null) return "";
            int level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100), plugged = b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
            PowerManager pm = (PowerManager) act.getSystemService(Context.POWER_SERVICE);
            boolean saver = pm != null && pm.isPowerSaveMode();
            int pct = level < 0 ? 100 : (level * 100) / Math.max(1, scale);
            return "{\"level\":" + pct + ",\"charging\":" + (plugged != 0) + ",\"saver\":" + saver + "}";
        } catch (Exception e) { return ""; }
    }

    // ---------------------------------------------------------------- snapshots dos dados (fora do localStorage)
    /** Guarda uma cópia consistente (texto JSON) em arquivo atômico cifrado com o Android Keystore. Assíncrono. */
    @JavascriptInterface
    public void snapshotSave(final String text) {
        if (BridgeValidator.tooLong(text, BridgeValidator.MAX_SNAPSHOT_CHARS)) return;
        try {
            io.execute(new Runnable() { public void run() { snaps().save(text); } });
        } catch (Exception ignored) { }     // pool já encerrado (tela destruída)
    }

    /** Igual a snapshotSave, mas espera a gravação terminar e confirma (usado antes de operações arriscadas: restauração e migração). */
    @JavascriptInterface
    public boolean snapshotSaveNow(final String text) {
        if (BridgeValidator.tooLong(text, BridgeValidator.MAX_SNAPSHOT_CHARS)) return false;
        try {
            Future<Boolean> f = io.submit(new Callable<Boolean>() { public Boolean call() { return snaps().save(text); } });
            return f.get(20, TimeUnit.SECONDS);
        } catch (Exception e) { return false; }
    }

    /** Último snapshot válido ou texto vazio. Só é chamado na inicialização quando o localStorage veio vazio. */
    @JavascriptInterface
    public String snapshotLoad() { String t = snaps().load(); return t == null ? "" : t; }

    /** Sequência do snapshot mais novo (-1 se não há). */
    @JavascriptInterface
    public int snapshotSeq() { return (int) Math.min(Integer.MAX_VALUE, snaps().latestSeq()); }

    // ---------------------------------------------------------------- rede local (modo online)
    @JavascriptInterface
    public void lanHost(String name, int port) {
        if (!BridgeValidator.validPort(port)) { netError("Porta inválida"); return; }
        life.multicastLock(true); life.wifiLowLatency(true);
        lan().host(BridgeValidator.clip(name, BridgeValidator.MAX_ROOM_NAME), port);
    }

    /** Retomada de partida: reabre a porta sem anunciar a sala. */
    @JavascriptInterface
    public void lanListen(int port) {
        if (!BridgeValidator.validPort(port)) { netError("Porta inválida"); return; }
        life.multicastLock(true); life.wifiLowLatency(true);
        lan().listen(port);
    }

    @JavascriptInterface public void lanScan() { life.multicastLock(true); lan().scan(4000); }

    @JavascriptInterface
    public void lanJoin(String ip, int port) {
        if (!BridgeValidator.validIpv4(ip) || !BridgeValidator.validPort(port)) { netError("Endereço inválido"); return; }
        life.multicastLock(false); life.wifiLowLatency(true);
        lan().join(ip, port);
    }

    @JavascriptInterface public void lanSend(String line) { if (line != null && line.length() <= BridgeValidator.MAX_LAN_LINE) lan().send(line); }
    @JavascriptInterface public void lanClose() { lan().close(); life.multicastLock(false); life.wifiLowLatency(false); }
    @JavascriptInterface public String lanIp() { return LanNet.localIp(); }
    @JavascriptInterface public String lanIps() { return LanNet.localIpsJson(); }
}
