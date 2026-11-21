package com.missionbreak56.tetris.security;

/**
 * Lista de permissões (allowlist) da WebView (JVM pura): o app só mostra os arquivos do próprio app (assets) e só deixa a página
 * carregar recursos locais. Qualquer http/https/ftp/content/intent/javascript: é bloqueado, para que nenhuma página de fora
 * chegue a falar com a ponte Android. Comparação por prefixo EXATO e sem normalizar o caminho (nada de "file:///android_asset/../").
 */
public final class NavigationPolicy {
    private NavigationPolicy() { }

    public static final String ASSET_PREFIX = "file:///android_asset/";

    /** Navegação de página (quadro principal ou subquadro). */
    public static boolean isAllowedPage(String url) {
        if (url == null || !url.startsWith(ASSET_PREFIX)) return false;
        String rest = url.substring(ASSET_PREFIX.length());
        return !rest.contains("..") && !rest.contains("\\") && !rest.contains("%2e") && !rest.contains("%2E") && !rest.contains("%2f") && !rest.contains("%2F") && !rest.contains("%5c") && !rest.contains("%5C");
    }

    /** Recursos carregados pela página: arquivos do app + data:/blob: (locais, sem rede) + about:blank. */
    public static boolean isAllowedResource(String url) {
        if (isAllowedPage(url)) return true;
        return url != null && (url.startsWith("data:") || url.startsWith("blob:") || url.equals("about:blank"));
    }
}
