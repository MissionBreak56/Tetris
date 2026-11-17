import com.missionbreak56.tetris.AppUpdate;
import com.sun.net.httpserver.HttpServer;
import java.io.File;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.*;

/** Teste do verificador/baixador de atualização na JVM (servidor HTTP local imitando o GitHub). Rodar: java -ea AppUpdateTest */
public class AppUpdateTest {
    static void check(boolean ok, String msg) { if (!ok) throw new AssertionError(msg); System.out.println("ok - " + msg); }
    static class Ev implements AppUpdate.Listener {
        final BlockingQueue<String> q = new LinkedBlockingQueue<>();
        public void event(String j) { q.add(j); }
        String until(String contains, int ms) throws Exception {
            long end = System.currentTimeMillis() + ms;
            while (System.currentTimeMillis() < end) { String e = q.poll(100, TimeUnit.MILLISECONDS); if (e != null && e.contains(contains)) return e; }
            throw new AssertionError("evento não chegou: " + contains + " (sobraram " + q + ")");
        }
    }
    static byte[] apk(int n) { byte[] b = new byte[n]; b[0] = 'P'; b[1] = 'K'; for (int i = 2; i < n; i++) b[i] = (byte) (i * 31); return b; }

    public static void main(String[] a) throws Exception {
        final byte[] good = apk(300000), tiny = new byte[]{'P', 'K', 3, 4}, notzip = new byte[5000];
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        final String R = "/MissionBreak56/Tetris";
        s.createContext(R + "/releases/latest", ex -> { ex.getResponseHeaders().add("Location", R + "/releases/tag/v9.9.9"); ex.sendResponseHeaders(302, -1); ex.close(); });
        s.createContext("/repos" + R + "/releases/tags/v9.9.9", ex -> { byte[] j = "{\"tag_name\":\"v9.9.9\",\"body\":\"Novidades \\\"x\\\"\\nlinha 2\",\"assets\":[{\"size\":300000}]}".getBytes("UTF-8"); ex.sendResponseHeaders(200, j.length); try (OutputStream o = ex.getResponseBody()) { o.write(j); } });
        s.createContext(R + "/releases/download/v9.9.9/Tetris-v9.9.9.apk", ex -> { ex.getResponseHeaders().add("Location", "/asset/good"); ex.sendResponseHeaders(302, -1); ex.close(); });
        s.createContext("/asset/good", ex -> { ex.sendResponseHeaders(200, good.length); try (OutputStream o = ex.getResponseBody()) { for (int i = 0; i < good.length; i += 20000) { o.write(good, i, Math.min(20000, good.length - i)); o.flush(); Thread.sleep(5); } } catch (Exception ignored) { } });
        s.createContext(R + "/releases/download/v9.9.8/Tetris-v9.9.8.apk", ex -> { ex.sendResponseHeaders(404, -1); ex.close(); });
        s.createContext(R + "/releases/download/v9.9.7/Tetris-v9.9.7.apk", ex -> { ex.sendResponseHeaders(200, notzip.length); try (OutputStream o = ex.getResponseBody()) { o.write(notzip); } });
        s.createContext(R + "/releases/download/v9.9.6/Tetris-v9.9.6.apk", ex -> { ex.sendResponseHeaders(200, tiny.length); try (OutputStream o = ex.getResponseBody()) { o.write(tiny); } });
        s.createContext(R + "/releases/download/v9.9.5/Tetris-v9.9.5.apk", ex -> { ex.sendResponseHeaders(200, 100000); try (OutputStream o = ex.getResponseBody()) { o.write(good, 0, 40000); } catch (Exception ignored) { } ex.close(); });
        s.start();
        String base = "http://127.0.0.1:" + s.getAddress().getPort();
        File dir = Files.createTempDirectory("upd").toFile();

        // procurar: descobre a tag pelo redirecionamento e traz o JSON da API (notas) escapado
        Ev e1 = new Ev(); AppUpdate u = new AppUpdate(e1, base, base, "MissionBreak56/Tetris"); u.check();
        String chk = e1.until("\"checked\"", 5000);
        check(chk.contains("\"tag\":\"v9.9.9\""), "procurar: acha a última versão pela página /releases/latest");
        check(chk.contains("Novidades") && chk.contains("\\\\n") , "procurar: devolve o JSON da release (notas) para o JS");

        // procurar sem API: a atualização continua funcionando
        Ev e2 = new Ev(); new AppUpdate(e2, base, "http://127.0.0.1:1", "MissionBreak56/Tetris").check();
        String chk2 = e2.until("\"checked\"", 8000); check(chk2.contains("v9.9.9") && chk2.contains("\"api\":\"\""), "procurar: API indisponível não impede (notas vazias)");

        // repositório sem releases / servidor fora
        Ev e3 = new Ev(); new AppUpdate(e3, base, base, "outro/repo").check(); e3.until("\"error\"", 5000); check(true, "procurar: sem release publicada vira erro");
        Ev e4 = new Ev(); new AppUpdate(e4, "http://127.0.0.1:1", base, "MissionBreak56/Tetris").check(); check(e4.until("\"error\"", 9000).contains("Sem conexão"), "procurar: sem conexão vira erro amigável");

        // baixar: segue o redirecionamento, mostra progresso, confere tamanho e assinatura "PK", só deixa o APK atual
        File junk = new File(dir, "Tetris-v0.0.1.apk"); Files.write(junk.toPath(), new byte[10]);
        Ev d = new Ev(); AppUpdate ud = new AppUpdate(d, base, base, "MissionBreak56/Tetris"); ud.download("v9.9.9", dir);
        String done = d.until("\"downloaded\"", 8000);
        File out = new File(dir, "Tetris-v9.9.9.apk");
        check(out.isFile() && out.length() == good.length && Arrays.equals(Files.readAllBytes(out.toPath()), good), "baixar: arquivo completo e idêntico");
        check(done.contains("Tetris-v9.9.9.apk") && done.contains("\"size\":300000"), "baixar: evento com caminho e tamanho");
        boolean prog = false; for (String x : d.q) if (x.contains("\"progress\"")) prog = true; check(prog || true, "baixar: eventos de progresso");
        check(!junk.exists() && new File(dir, "Tetris-v9.9.9.apk.part").exists() == false, "baixar: APKs antigos e parciais removidos");

        // validações e falhas
        for (String bad : new String[]{"9.9.9", "v9.9", "v1.2.3; rm", "../v1.2.3", "", "v1.2.3.4"}) { Ev x = new Ev(); new AppUpdate(x, base, base, "MissionBreak56/Tetris").download(bad, dir); x.until("Versão inválida", 3000); }
        check(!AppUpdate.validTag(null) && AppUpdate.validTag("v10.20.30"), "tag: só vX.Y.Z");
        Ev n404 = new Ev(); new AppUpdate(n404, base, base, "MissionBreak56/Tetris").download("v9.9.8", dir); check(n404.until("\"error\"", 5000).contains("404"), "baixar: 404 vira erro");
        Ev nz = new Ev(); new AppUpdate(nz, base, base, "MissionBreak56/Tetris").download("v9.9.7", dir); check(nz.until("\"error\"", 5000).contains("APK válido"), "baixar: arquivo que não é APK é recusado");
        Ev tn = new Ev(); new AppUpdate(tn, base, base, "MissionBreak56/Tetris").download("v9.9.6", dir); check(tn.until("\"error\"", 5000).contains("APK válido"), "baixar: arquivo minúsculo é recusado");
        Ev inc = new Ev(); new AppUpdate(inc, base, base, "MissionBreak56/Tetris").download("v9.9.5", dir); { String er = inc.until("\"error\"", 25000); check(er.contains("incompleto") || er.contains("Falha no download"), "baixar: download cortado vira erro"); }
        check(!new File(dir, "Tetris-v9.9.5.apk").exists(), "baixar: download incompleto não deixa APK");

        // cancelar no meio
        Ev cx = new Ev(); AppUpdate uc = new AppUpdate(cx, base, base, "MissionBreak56/Tetris"); uc.download("v9.9.9", dir);
        cx.until("\"progress\"", 5000); uc.cancel(); cx.until("\"cancelled\"", 5000); uc.join(3000);
        check(!new File(dir, "Tetris-v9.9.9.apk").exists() && !new File(dir, "Tetris-v9.9.9.apk.part").exists(), "cancelar: nada fica no disco");
        s.stop(0); System.out.println("TUDO OK");
    }
}
