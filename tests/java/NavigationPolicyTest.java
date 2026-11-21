import com.missionbreak56.tetris.security.NavigationPolicy;

/** Teste da allowlist de navegação da WebView (JVM pura). Rodar: java -ea NavigationPolicyTest */
public class NavigationPolicyTest {
    static void check(boolean ok, String msg) { if (!ok) throw new AssertionError(msg); System.out.println("ok - " + msg); }

    public static void main(String[] a) {
        String[] pages = { "file:///android_asset/index.html", "file:///android_asset/js/net.js", "file:///android_asset/index.html#x", "file:///android_asset/index.html?a=1" };
        for (String p : pages) check(NavigationPolicy.isAllowedPage(p) && NavigationPolicy.isAllowedResource(p), "página do app permitida: " + p);
        String[] blocked = { null, "", "http://example.com", "https://github.com/MissionBreak56/Tetris", "ftp://x/y", "content://com.x/y", "intent://x#Intent;end", "javascript:alert(1)",
            "file:///data/data/com.missionbreak56.tetris/shared_prefs/x.xml", "file:///sdcard/Download/x.html", "file:///android_asset", "file:///android_asset/../../data/x", "file:///android_asset/js/../../x",
            "file:///android_asset/%2e%2e/x", "file:///android_asset/a%2Fb", "file:///android_asset/a\\b", "FILE:///android_asset/index.html", "file://android_asset/index.html", "about:blank", "data:text/html,<script>x</script>", "blob:file:///x", "market://details?id=x", "//evil.com/x" };
        for (String b : blocked) check(!NavigationPolicy.isAllowedPage(b), "navegação bloqueada: " + b);
        for (String r : new String[] { "data:image/png;base64,AAAA", "blob:file:///abc-123", "about:blank" }) check(NavigationPolicy.isAllowedResource(r), "recurso local permitido: " + r);
        for (String r : new String[] { "http://example.com/x.js", "https://cdn.x/y.png", "ws://x", "content://x", "file:///sdcard/x", null }) check(!NavigationPolicy.isAllowedResource(r), "recurso de rede/externo bloqueado: " + r);
        System.out.println("ALL OK");
    }
}
