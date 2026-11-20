package com.missionbreak56.tetris;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import com.missionbreak56.tetris.core.AppLifecycleManager;
import com.missionbreak56.tetris.core.GameBridge;
import com.missionbreak56.tetris.core.WebViewConfigurator;

/**
 * Tela única do app: uma WebView em tela cheia que roda o jogo (HTML/Canvas/JS em assets).
 * Responsabilidades separadas em classes próprias:
 * {@link WebViewConfigurator} (configuração e segurança da WebView), {@link GameBridge} (ponte JS -> Android),
 * {@link AppLifecycleManager} (travas de Wi-Fi e estado "destruída").
 */
public class MainActivity extends Activity {
    private WebView web;
    private AppLifecycleManager life;
    private GameBridge bridge;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        life = new AppLifecycleManager(this);
        bridge = new GameBridge(this, life);
        web = new WebView(this);
        bridge.attach(web);
        WebViewConfigurator.configure(web, bridge, GameBridge.NAME, new Runnable() { public void run() { recreate(); } });
        setContentView(web);
        web.loadUrl(WebViewConfigurator.HOME);
        hideBars();
    }

    private void hideBars() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (bridge != null) bridge.onActivityResult(req, res, data);
    }

    @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) hideBars(); }
    @Override protected void onPause() { super.onPause(); if (web != null) web.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }

    @Override
    protected void onDestroy() {
        if (bridge != null) bridge.destroy();       // rede, atualização e receptores: nenhum callback volta depois daqui
        if (life != null) life.destroy();
        WebView w = web; web = null;
        if (w != null) w.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // Back = o jogo decide (pausa / voltar / escolha no online)
        if (bridge != null) bridge.js("if(typeof handleBack==='function')handleBack();");
    }
}
