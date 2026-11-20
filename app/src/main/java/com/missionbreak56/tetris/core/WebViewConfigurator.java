package com.missionbreak56.tetris.core;

import android.annotation.SuppressLint;
import android.annotation.TargetApi;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;

/**
 * Configuração única da WebView do jogo. O app só carrega conteúdo local (assets): qualquer navegação/requisição para
 * outro lugar é bloqueada, e a ponte {@code AndroidBridge} nunca fica exposta a páginas de fora.
 * O JavaScript continua ligado (o jogo depende dele).
 */
public final class WebViewConfigurator {
    public static final String HOME = "file:///android_asset/index.html";
    private static final String ASSET_PREFIX = "file:///android_asset/";

    private WebViewConfigurator() { }

    /** Navegação de página (quadro principal ou subquadro): só os arquivos do próprio app. */
    public static boolean isAllowedPage(String url) { return url != null && url.startsWith(ASSET_PREFIX); }

    /** Recursos carregados pela página: arquivos do app mais data:/blob:/about:blank (locais, sem rede). */
    public static boolean isAllowedResource(String url) {
        return isAllowedPage(url) || (url != null && (url.startsWith("data:") || url.startsWith("blob:") || url.equals("about:blank")));
    }

    @SuppressLint({ "SetJavaScriptEnabled", "AddJavascriptInterface" })
    public static void configure(WebView web, Object bridge, String bridgeName, Runnable onRendererGone) {
        web.setBackgroundColor(Color.parseColor("#000000"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);                          // o jogo é JavaScript + Canvas
        s.setDomStorageEnabled(true);                          // localStorage (perfis, recordes, ...)
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setGeolocationEnabled(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= 26) s.setSafeBrowsingEnabled(true);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(bridge, bridgeName);
        web.setWebViewClient(new LocalOnlyClient(onRendererGone));
        try { WebView.setWebContentsDebuggingEnabled(false); } catch (Throwable ignored) { }
    }

    private static final class LocalOnlyClient extends WebViewClient {
        private final Runnable onRendererGone;
        LocalOnlyClient(Runnable r) { this.onRendererGone = r; }

        @Override @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView v, String url) { return !isAllowedPage(url); }

        @Override @TargetApi(24)
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return !isAllowedPage(r.getUrl().toString()); }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
            if (isAllowedResource(r.getUrl().toString())) return null;
            return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", null, new ByteArrayInputStream(new byte[0]));
        }

        /** Se o processo de renderização morrer (pouca memória), recria a tela em vez de derrubar o app. */
        @Override @TargetApi(26)
        public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
            if (onRendererGone != null) onRendererGone.run();
            return true;
        }
    }
}
