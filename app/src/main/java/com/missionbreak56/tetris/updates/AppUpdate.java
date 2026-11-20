package com.missionbreak56.tetris.updates;

import com.missionbreak56.tetris.network.LanNet;

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
    private static final int MAX_API = 65536;

    public interface Listener { void event(String json); }

    private final Listener l;
    private final String web, api, repo;
    private volatile boolean cancel;
    private Thread th;

    public AppUpdate(Listener l, String web, String api, String repo) { this.l = l; this.web = web; this.api = api; this.repo = repo; }

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

    private void doDownload(String tag, File dir) {
        if (!validTag(tag)) { l.event(err("Versão inválida")); return; }
        HttpURLConnection c = null; File part = null;
        try {
            if (!dir.isDirectory() && !dir.mkdirs()) { l.event(err("Sem espaço para guardar a atualização")); return; }
            File[] old = dir.listFiles(); if (old != null) for (File f : old) f.delete();            // só fica o APK atual
            File apk = new File(dir, "Tetris-" + tag + ".apk"); part = new File(dir, apk.getName() + ".part");
            c = (HttpURLConnection) new URL(web + "/" + repo + "/releases/download/" + tag + "/Tetris-" + tag + ".apk").openConnection();
            c.setConnectTimeout(10000); c.setReadTimeout(15000); c.setInstanceFollowRedirects(true);
            int code = c.getResponseCode(); if (code != 200) { l.event(err("Não consegui baixar (código " + code + ")")); return; }
            long total = c.getContentLengthLong(), done = 0, last = 0;
            InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(part);
            byte[] buf = new byte[16384]; int n;
            try {
                while ((n = in.read(buf)) > 0) {
                    if (cancel) { out.close(); in.close(); part.delete(); l.event("{\"e\":\"cancelled\"}"); return; }
                    out.write(buf, 0, n); done += n;
                    long now = System.currentTimeMillis(); if (now - last >= 200) { last = now; l.event("{\"e\":\"progress\",\"done\":" + done + ",\"total\":" + total + "}"); }
                }
                out.getFD().sync();
            } finally { out.close(); in.close(); }
            if (total > 0 && done != total) { part.delete(); l.event(err("Download incompleto")); return; }
            RandomAccessFile r = new RandomAccessFile(part, "r"); byte[] m = new byte[2]; boolean zip = r.read(m) == 2 && m[0] == 'P' && m[1] == 'K'; r.close();
            if (!zip || done < 1024) { part.delete(); l.event(err("O arquivo baixado não é um APK válido")); return; }
            if (!part.renameTo(apk)) { l.event(err("Não consegui salvar o arquivo")); return; }
            l.event("{\"e\":\"progress\",\"done\":" + done + ",\"total\":" + done + "}");
            l.event("{\"e\":\"downloaded\",\"file\":" + LanNet.q(apk.getAbsolutePath()) + ",\"size\":" + done + "}");
        } catch (Exception e) { if (part != null) part.delete(); l.event(err("Falha no download: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()))); }
        finally { if (c != null) c.disconnect(); }
    }
}
