package com.missionbreak56.tetris.updates;

import com.missionbreak56.tetris.network.LanNet;
import com.missionbreak56.tetris.security.ApkVerifier;
import com.missionbreak56.tetris.security.SignerPolicy;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Atualização dentro do app (sem dependências do Android, testável na JVM): descobre a última release do GitHub e baixa o APK.
 * Procurar: HEAD em {web}/{repo}/releases/latest (o redirecionamento revela a tag; não usa a API, então não esbarra em limite de requisições)
 * e, opcionalmente, o JSON da release em {api}/repos/{repo}/releases/tags/{tag} (notas e tamanho; falha não impede a atualização).
 * Eventos (JSON): checked{tag,api} · progress{done,total} · downloaded{file,size} · cancelled · error{msg}.
 * A instalação (PackageInstaller) fica no MainActivity.
 */
public final class AppUpdate {
    public static final String WEB = "https://github.com", API = "https://api.github.com";
    private static final Pattern TAG = Pattern.compile("^v\\d+\\.\\d+\\.\\d+$");
    private static final Pattern LOC = Pattern.compile("/releases/tag/(v\\d+\\.\\d+\\.\\d+)$");
    private static final int MAX_API = 65536, MAX_CHECKSUM = 1024;
    /** Teto do tamanho do APK (protege o disco de um download sem fim). */
    public static final long MAX_APK = 80_000_000L;

    public interface Listener { void event(String json); }

    private final Listener l;
    private final String web, api, repo;
    private final ApkVerifier verifier;     // null = sem verificação de assinatura (só testes)
    private volatile boolean cancel;
    private Thread th;

    public AppUpdate(Listener l, String web, String api, String repo) { this(l, web, api, repo, null); }

    /** web/api precisam ser https (exceto o servidor local 127.0.0.1 dos testes). */
    public AppUpdate(Listener l, String web, String api, String repo, ApkVerifier verifier) {
        if (!secureOrLoopback(web) || !secureOrLoopback(api)) throw new IllegalArgumentException("a atualização exige HTTPS");
        this.l = l; this.web = web; this.api = api; this.repo = repo; this.verifier = verifier;
    }

    static boolean secureOrLoopback(String u) { return u != null && (u.startsWith("https://") || u.startsWith("http://127.0.0.1") || u.startsWith("http://localhost")); }

    private static String err(String msg) { return "{\"e\":\"error\",\"msg\":" + LanNet.q(msg) + "}"; }

    public static boolean validTag(String tag) { return tag != null && TAG.matcher(tag).matches(); }

    public void check() { start(new Runnable() { public void run() { doCheck(); } }, "upd-check"); }

    public void download(final String tag, final File dir) { cancel = false; start(new Runnable() { public void run() { doDownload(tag, dir); } }, "upd-download"); }

    public void cancel() { cancel = true; }

    private synchronized void start(Runnable r, String name) { th = new Thread(r, name); th.setDaemon(true); th.start(); }

    /** Espera a tarefa atual terminar (testes). */
    public void join(long ms) throws InterruptedException { Thread t; synchronized (this) { t = th; } if (t != null) t.join(ms); }

    private void doCheck() {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(web + "/" + repo + "/releases/latest").openConnection();
            c.setInstanceFollowRedirects(false); c.setRequestMethod("HEAD"); c.setConnectTimeout(8000); c.setReadTimeout(8000);
            int code = c.getResponseCode(); String loc = c.getHeaderField("Location");
            if (code / 100 != 3 || loc == null) { l.event(err("Não encontrei nenhuma versão publicada (código " + code + ")")); return; }
            Matcher m = LOC.matcher(loc); if (!m.find()) { l.event(err("Resposta inesperada do GitHub")); return; }
            String tag = m.group(1), raw = "";
            HttpURLConnection a = null;
            try {                                                   // notas da versão: opcional (a API tem limite de requisições; sem ela o resto funciona)
                a = (HttpURLConnection) new URL(api + "/repos/" + repo + "/releases/tags/" + tag).openConnection();
                a.setConnectTimeout(5000); a.setReadTimeout(5000); a.setRequestProperty("Accept", "application/vnd.github+json");
                if (a.getResponseCode() == 200) raw = readLimited(a.getInputStream(), MAX_API);
            } catch (Exception ignored) { } finally { if (a != null) a.disconnect(); }
            l.event("{\"e\":\"checked\",\"tag\":" + LanNet.q(tag) + ",\"api\":" + LanNet.q(raw) + "}");
        } catch (Exception e) { l.event(err("Sem conexão com o GitHub")); }
        finally { if (c != null) c.disconnect(); }
    }

    private static String readLimited(InputStream in, int max) throws Exception {
        java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream(); byte[] buf = new byte[4096]; int n, tot = 0;
        while ((n = in.read(buf)) > 0) { tot += n; if (tot > max) return ""; bo.write(buf, 0, n); }
        in.close(); return bo.toString("UTF-8");
    }

    /** Baixa o arquivo .sha256 da release (primeira palavra = SHA-256 do APK em hex). null + evento de erro se não existir/for inválido. */
    private String fetchChecksum(String tag) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(web + "/" + repo + "/releases/download/" + tag + "/Tetris-" + tag + ".apk.sha256").openConnection();
            c.setConnectTimeout(10000); c.setReadTimeout(10000); c.setInstanceFollowRedirects(true);
            if (c.getResponseCode() != 200) { l.event(err("A versão não publicou o checksum SHA-256: atualização recusada")); return null; }
            String h = SignerPolicy.parseChecksumFile(readLimited(c.getInputStream(), MAX_CHECKSUM));
            if (h == null) { l.event(err("Checksum SHA-256 da versão é inválido: atualização recusada")); return null; }
            return h;
        } catch (Exception e) { l.event(err("Não consegui obter o checksum da versão")); return null; }
        finally { if (c != null) c.disconnect(); }
    }

    private void doDownload(String tag, File dir) {
        if (!validTag(tag)) { l.event(err("Versão inválida")); return; }
        HttpURLConnection c = null; File part = null;
        try {
            if (!dir.isDirectory() && !dir.mkdirs()) { l.event(err("Sem espaço para guardar a atualização")); return; }
            File[] old = dir.listFiles(); if (old != null) for (File f : old) f.delete();            // só fica o APK atual
            File apk = new File(dir, "Tetris-" + tag + ".apk"); part = new File(dir, apk.getName() + ".part");
            String want = fetchChecksum(tag); if (want == null) return;                              // sem checksum publicado, não baixa
            c = (HttpURLConnection) new URL(web + "/" + repo + "/releases/download/" + tag + "/Tetris-" + tag + ".apk").openConnection();
            c.setConnectTimeout(10000); c.setReadTimeout(15000); c.setInstanceFollowRedirects(true);
            int code = c.getResponseCode(); if (code != 200) { l.event(err("Não consegui baixar (código " + code + ")")); return; }
            if (secureOrLoopback(web) && !web.startsWith("http://") && !"https".equals(c.getURL().getProtocol())) { l.event(err("Download recusado: a conexão final não é HTTPS")); return; }
            long total = c.getContentLengthLong(), done = 0, last = 0;
            if (total > MAX_APK) { l.event(err("Arquivo grande demais para ser o APK")); return; }
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(part);
            byte[] buf = new byte[16384]; int n;
            try {
                while ((n = in.read(buf)) > 0) {
                    if (cancel) { out.close(); in.close(); part.delete(); l.event("{\"e\":\"cancelled\"}"); return; }
                    out.write(buf, 0, n); md.update(buf, 0, n); done += n;
                    if (done > MAX_APK) { out.close(); in.close(); part.delete(); l.event(err("Arquivo grande demais para ser o APK")); return; }
                    long now = System.currentTimeMillis(); if (now - last >= 200) { last = now; l.event("{\"e\":\"progress\",\"done\":" + done + ",\"total\":" + total + "}"); }
                }
                out.getFD().sync();
            } finally { out.close(); in.close(); }
            if (total > 0 && done != total) { part.delete(); l.event(err("Download incompleto")); return; }
            RandomAccessFile r = new RandomAccessFile(part, "r"); byte[] m = new byte[2]; boolean zip = r.read(m) == 2 && m[0] == 'P' && m[1] == 'K'; r.close();
            if (!zip || done < 1024) { part.delete(); l.event(err("O arquivo baixado não é um APK válido")); return; }
            if (!SignerPolicy.digestEquals(md.digest(), want)) { part.delete(); l.event(err("O arquivo não confere com o SHA-256 publicado (corrompido ou adulterado): atualização recusada")); return; }
            if (!part.renameTo(apk)) { l.event(err("Não consegui salvar o arquivo")); return; }
            if (verifier != null) {                                                                 // identidade: o certificado precisa ser o do app instalado
                String why = verifier.verify(apk);
                if (why != null) { apk.delete(); l.event(err(why)); return; }
            }
            l.event("{\"e\":\"progress\",\"done\":" + done + ",\"total\":" + done + "}");
            l.event("{\"e\":\"downloaded\",\"file\":" + LanNet.q(apk.getAbsolutePath()) + ",\"size\":" + done + "}");
        } catch (Exception e) { if (part != null) part.delete(); l.event(err("Falha no download: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()))); }
        finally { if (c != null) c.disconnect(); }
    }
}
