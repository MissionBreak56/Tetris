package com.missionbreak56.tetris.updates;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.missionbreak56.tetris.network.LanNet;
import com.missionbreak56.tetris.security.ApkVerifier;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

/** Instala o APK baixado (cache/updates) com o PackageInstaller e repassa o resultado ao JavaScript (Updater._ev). */
public final class UpdateInstaller {
    public static final String ACTION_INSTALL = "com.missionbreak56.tetris.INSTALL_RESULT";

    /** Quem recebe os eventos (chamado em qualquer thread; o dono confere se a tela ainda existe). */
    public interface Sink { void js(String code); }

    private final Activity act;
    private final Sink sink;
    private final ApkVerifier verifier;
    private BroadcastReceiver rx;

    public UpdateInstaller(Activity act, Sink sink, ApkVerifier verifier) { this.act = act; this.sink = sink; this.verifier = verifier; }

    public File updatesDir() { return new File(act.getCacheDir(), "updates"); }

    private void err(String msg) { sink.js("Updater._ev({\"e\":\"error\",\"msg\":" + LanNet.q(msg) + "})"); }

    private void register() {
        if (rx != null) return;
        rx = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent in) {
                int st = in.getIntExtra(PackageInstaller.EXTRA_STATUS, -1);
                String msg = in.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
                if (st == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                    Intent confirm = (Intent) in.getParcelableExtra(Intent.EXTRA_INTENT);
                    if (confirm != null) { confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); act.startActivity(confirm); }
                    sink.js("Updater._ev({\"e\":\"confirm\"})");
                } else if (st == PackageInstaller.STATUS_SUCCESS) {
                    sink.js("Updater._ev({\"e\":\"installed\"})");
                } else {
                    err("A instalação não foi concluída" + (msg == null ? "" : " (" + msg + ")"));
                }
            }
        };
        IntentFilter f = new IntentFilter(ACTION_INSTALL);
        if (Build.VERSION.SDK_INT >= 33) act.registerReceiver(rx, f, Context.RECEIVER_NOT_EXPORTED); else act.registerReceiver(rx, f);
    }

    /** Solta o receptor (chamar ao destruir a tela). */
    public void unregister() {
        if (rx != null) { try { act.unregisterReceiver(rx); } catch (Exception ignored) { } rx = null; }
    }

    /** Sem a permissão "instalar apps desconhecidos" abre o ajuste do Android e avisa o JS. Chamar na thread da interface. */
    public void install() {
        try {
            File[] fs = updatesDir().listFiles(); File apk = null;
            if (fs != null) for (File f : fs) if (f.getName().endsWith(".apk") && (apk == null || f.lastModified() > apk.lastModified())) apk = f;
            if (apk == null) { err("Arquivo da atualização não encontrado. Baixe de novo."); return; }
            if (verifier != null) {                                       // confere de novo na hora de instalar (o arquivo pode ter mudado desde o download)
                String why = verifier.verify(apk);
                if (why != null) { apk.delete(); err(why); return; }
            }
            if (Build.VERSION.SDK_INT >= 26 && !act.getPackageManager().canRequestPackageInstalls()) {
                act.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + act.getPackageName())));
                sink.js("Updater._ev({\"e\":\"needPermission\"})"); return;
            }
            PackageInstaller pi = act.getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams p = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            int id = pi.createSession(p);
            PackageInstaller.Session s = pi.openSession(id);
            InputStream in = null; OutputStream out = null;
            try {
                in = new FileInputStream(apk);
                out = s.openWrite("tetris.apk", 0, apk.length());
                byte[] buf = new byte[65536]; int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                s.fsync(out); out.close(); out = null; in.close(); in = null;
                register();
                Intent it = new Intent(ACTION_INSTALL); it.setPackage(act.getPackageName());
                int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                s.commit(PendingIntent.getBroadcast(act, id, it, fl).getIntentSender());
                sink.js("Updater._ev({\"e\":\"installing\"})");
            } finally {
                if (out != null) { try { out.close(); } catch (Exception ignored) { } }
                if (in != null) { try { in.close(); } catch (Exception ignored) { } }
                s.close();
            }
        } catch (Exception e) {
            err("Não foi possível instalar: " + e.getMessage());
        }
    }
}
