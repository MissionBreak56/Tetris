package com.missionbreak56.tetris;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.pm.PackageInstaller;
import android.provider.Settings;
import java.io.File;
import java.io.FileInputStream;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.PowerManager;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final int REQ_SAVE = 101, REQ_OPEN = 102, MAX_READ = 8000000;
    private WebView web;
    private String pendingSave;
    private LanNet lan;
    private WifiManager.MulticastLock mlock;
    private WifiManager.WifiLock wlock;
    private AppUpdate upd;
    private BroadcastReceiver instRx;
    private static final String ACTION_INSTALL = "com.missionbreak56.tetris.INSTALL_RESULT";

    private void lock(boolean on) {
        try {
            if (on) {
                if (mlock == null) {
                    WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                    if (wm != null) { mlock = wm.createMulticastLock("tetris-lan"); mlock.setReferenceCounted(false); }
                }
                if (mlock != null && !mlock.isHeld()) mlock.acquire();
            } else if (mlock != null && mlock.isHeld()) mlock.release();
        } catch (Exception ignored) { }
    }

    /** Mantém o rádio Wi-Fi em modo de baixa latência (sem economia de energia) enquanto houver sala/partida online. */
    private void wifiLowLatency(boolean on) {
        try {
            if (on) {
                if (wlock == null) {
                    WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                    if (wm != null) {
                        int mode = Build.VERSION.SDK_INT >= 29 ? 4 /* WIFI_MODE_FULL_LOW_LATENCY */ : 3 /* WIFI_MODE_FULL_HIGH_PERF */;
                        wlock = wm.createWifiLock(mode, "tetris-online");
                        wlock.setReferenceCounted(false);
                    }
                }
                if (wlock != null && !wlock.isHeld()) wlock.acquire();
            } else if (wlock != null && wlock.isHeld()) wlock.release();
        } catch (Exception ignored) { }
    }

    private LanNet lan() {
        if (lan == null) {
            lan = new LanNet(new LanNet.Listener() {
                public void event(final String json) { js("Net._ev(" + json + ")"); }
                public void line(final String line) { js("Net._line(" + LanNet.q(line) + ")"); }
            });
        }
        return lan;
    }

    /** Atualização dentro do app: procurar/baixar (AppUpdate, GitHub Releases) e instalar (PackageInstaller). */
    private AppUpdate upd() {
        if (upd == null) upd = new AppUpdate(new AppUpdate.Listener() { public void event(final String json) { js("Updater._ev(" + json + ")"); } }, AppUpdate.WEB, AppUpdate.API, "MissionBreak56/Tetris");
        return upd;
    }

    private void registerInstallReceiver() {
        if (instRx != null) return;
        instRx = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent in) {
                int st = in.getIntExtra(PackageInstaller.EXTRA_STATUS, -1);
                String msg = in.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
                if (st == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                    Intent confirm = (Intent) in.getParcelableExtra(Intent.EXTRA_INTENT);
                    if (confirm != null) { confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); startActivity(confirm); }
                    js("Updater._ev({\"e\":\"confirm\"})");
                } else if (st == PackageInstaller.STATUS_SUCCESS) {
                    js("Updater._ev({\"e\":\"installed\"})");
                } else {
                    js("Updater._ev({\"e\":\"error\",\"msg\":" + LanNet.q("A instalação não foi concluída" + (msg == null ? "" : " (" + msg + ")")) + "})");
                }
            }
        };
        IntentFilter f = new IntentFilter(ACTION_INSTALL);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(instRx, f, Context.RECEIVER_NOT_EXPORTED); else registerReceiver(instRx, f);
    }

    /** Instala o APK baixado (cache/updates). Sem a permissão "instalar apps desconhecidos" abre o ajuste do Android e avisa o JS. */
    private void installUpdate() {
        try {
            File[] fs = new File(getCacheDir(), "updates").listFiles(); File apk = null;
            if (fs != null) for (File f : fs) if (f.getName().endsWith(".apk") && (apk == null || f.lastModified() > apk.lastModified())) apk = f;
            if (apk == null) { js("Updater._ev({\"e\":\"error\",\"msg\":\"Arquivo da atualização não encontrado. Baixe de novo.\"})"); return; }
            if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
                js("Updater._ev({\"e\":\"needPermission\"})"); return;
            }
            PackageInstaller pi = getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams p = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            int id = pi.createSession(p);
            PackageInstaller.Session s = pi.openSession(id);
            try {
                InputStream in = new FileInputStream(apk);
                OutputStream out = s.openWrite("tetris.apk", 0, apk.length());
                byte[] buf = new byte[65536]; int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                s.fsync(out); out.close(); in.close();
                registerInstallReceiver();
                Intent it = new Intent(ACTION_INSTALL); it.setPackage(getPackageName());
                int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                s.commit(PendingIntent.getBroadcast(this, id, it, fl).getIntentSender());
                js("Updater._ev({\"e\":\"installing\"})");
            } finally { s.close(); }
        } catch (Exception e) {
            js("Updater._ev({\"e\":\"error\",\"msg\":" + LanNet.q("Não foi possível instalar: " + e.getMessage()) + "})");
        }
    }

    /** Ponte JS -> Android (somente conteúdo local do app é carregado na WebView). */
    private class Bridge {
        @JavascriptInterface
        public void share(final String title, final String text) {
            runOnUiThread(new Runnable() { public void run() {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_SUBJECT, title);
                i.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(i, title));
            } });
        }
        @JavascriptInterface
        public void saveFile(final String name, final String mime, final String text) {
            runOnUiThread(new Runnable() { public void run() {
                pendingSave = text;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime);
                i.putExtra(Intent.EXTRA_TITLE, name);
                startActivityForResult(i, REQ_SAVE);
            } });
        }
        @JavascriptInterface public String version() { try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; } }
        @JavascriptInterface public void updateCheck() { upd().check(); }
        @JavascriptInterface public void updateDownload(String tag) { upd().download(tag, new File(getCacheDir(), "updates")); }
        @JavascriptInterface public void updateCancel() { upd().cancel(); }
        @JavascriptInterface public void updateInstall() { runOnUiThread(new Runnable() { public void run() { installUpdate(); } }); }
        /** Bateria para o modo "Automático" de desempenho: {"level":0-100,"charging":bool,"saver":bool} (texto vazio se indisponível). */
        @JavascriptInterface
        public String battery() {
            try {
                Intent b = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                if (b == null) return "";
                int level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100), plugged = b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                boolean saver = pm != null && pm.isPowerSaveMode();
                int pct = level < 0 ? 100 : (level * 100) / Math.max(1, scale);
                return "{\"level\":" + pct + ",\"charging\":" + (plugged != 0) + ",\"saver\":" + saver + "}";
            } catch (Exception e) { return ""; }
        }
        // ---- Rede local (modo online) ----
        @JavascriptInterface public void lanHost(String name, int port) { lock(true); wifiLowLatency(true); lan().host(name, port); }
        @JavascriptInterface public void lanListen(int port) { lock(true); wifiLowLatency(true); lan().listen(port); }   // retomada de partida: reabre a porta sem anunciar
        @JavascriptInterface public void lanScan() { lock(true); lan().scan(4000); }
        @JavascriptInterface public void lanJoin(String ip, int port) { lock(false); wifiLowLatency(true); lan().join(ip, port); }
        @JavascriptInterface public void lanSend(String line) { lan().send(line); }
        @JavascriptInterface public void lanClose() { lan().close(); lock(false); wifiLowLatency(false); }
        @JavascriptInterface public String lanIp() { return LanNet.localIp(); }
        @JavascriptInterface public String lanIps() { return LanNet.localIpsJson(); }

        @JavascriptInterface
        public void pickFile() {
            runOnUiThread(new Runnable() { public void run() {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                startActivityForResult(i, REQ_OPEN);
            } });
        }
    }

    private void js(final String code) {
        runOnUiThread(new Runnable() { public void run() { if (web != null) web.evaluateJavascript(code, null); } });
    }


    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_SAVE) {
            boolean ok = false;
            if (res == RESULT_OK && data != null && data.getData() != null && pendingSave != null) {
                try {
                    OutputStream os = getContentResolver().openOutputStream(data.getData());
                    os.write(pendingSave.getBytes("UTF-8"));
                    os.close();
                    ok = true;
                } catch (Exception e) { ok = false; }
            }
            pendingSave = null;
            js("Native._onSaved(" + ok + ")");
        } else if (req == REQ_OPEN) {
            if (res != RESULT_OK || data == null || data.getData() == null) { js("Native._onPicked(null,'Nenhum arquivo escolhido')"); return; }
            try {
                InputStream is = getContentResolver().openInputStream(data.getData());
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n, total = 0;
                while ((n = is.read(buf)) > 0) {
                    total += n;
                    if (total > MAX_READ) { is.close(); js("Native._onPicked(null,'Arquivo muito grande')"); return; }
                    bo.write(buf, 0, n);
                }
                is.close();
                js("Native._onPicked(" + JSONObject.quote(bo.toString("UTF-8")) + ",null)");
            } catch (Exception e) { js("Native._onPicked(null,'Falha ao ler o arquivo')"); }
        }
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#000000"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient());
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
        hideBars();
    }

    private void hideBars() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) hideBars(); }
    @Override protected void onPause() { super.onPause(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override protected void onDestroy() {
        if (instRx != null) { try { unregisterReceiver(instRx); } catch (Exception ignored) { } }
        if (lan != null) lan.close();
        lock(false);
        wifiLowLatency(false);
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // Back = pausa o jogo (dispara visibilitychange não ocorre; simula tecla P)
        js("if(typeof handleBack==='function')handleBack();");
    }
}
