package com.missionbreak56.tetris.core;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.Build;

/**
 * Ciclo de vida do app: guarda os travas de Wi-Fi do modo online e o estado "destruída".
 * Depois de {@link #destroy()} nenhuma thread (rede, atualização, arquivos) deve voltar a chamar a WebView/Activity:
 * quem faz callbacks confere {@link #alive()}.
 */
public final class AppLifecycleManager {
    private final Context app;
    private WifiManager.MulticastLock mlock;
    private WifiManager.WifiLock wlock;
    private volatile boolean destroyed;

    public AppLifecycleManager(Context c) { this.app = c.getApplicationContext(); }

    public boolean alive() { return !destroyed; }

    private WifiManager wifi() { return (WifiManager) app.getSystemService(Context.WIFI_SERVICE); }

    /** Trava de multicast: necessária para receber os anúncios de sala (broadcast UDP). */
    public synchronized void multicastLock(boolean on) {
        try {
            if (on && !destroyed) {
                if (mlock == null) {
                    WifiManager wm = wifi();
                    if (wm != null) { mlock = wm.createMulticastLock("tetris-lan"); mlock.setReferenceCounted(false); }
                }
                if (mlock != null && !mlock.isHeld()) mlock.acquire();
            } else if (mlock != null && mlock.isHeld()) mlock.release();
        } catch (Exception ignored) { }
    }

    /** Mantém o rádio Wi-Fi em modo de baixa latência (sem economia de energia) enquanto houver sala/partida online. */
    public synchronized void wifiLowLatency(boolean on) {
        try {
            if (on && !destroyed) {
                if (wlock == null) {
                    WifiManager wm = wifi();
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

    /** Marca como destruída e solta as travas. */
    public synchronized void destroy() {
        destroyed = true;
        multicastLock(false);
        wifiLowLatency(false);
    }
}
