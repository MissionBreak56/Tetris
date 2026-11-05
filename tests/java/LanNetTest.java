import com.missionbreak56.tetris.LanNet;
import java.net.InetAddress;
import java.util.*;
import java.util.concurrent.*;

/** Teste da rede local na JVM (loopback). Rodar: java -ea LanNetTest */
public class LanNetTest {
    static class Peer implements LanNet.Listener {
        final BlockingQueue<String> events = new LinkedBlockingQueue<>(), lines = new LinkedBlockingQueue<>();
        final LanNet net;
        Peer(int udp) { net = new LanNet(this, udp); }
        public void event(String j) { events.add(j); }
        public void line(String l) { lines.add(l); }
        String waitEvent(String contains, int ms) throws Exception {
            long end = System.currentTimeMillis() + ms;
            while (System.currentTimeMillis() < end) {
                String e = events.poll(100, TimeUnit.MILLISECONDS);
                if (e != null && e.contains(contains)) return e;
            }
            throw new AssertionError("evento não chegou: " + contains + " (sobraram " + events + ")");
        }
    }
    static void check(boolean ok, String msg) { if (!ok) throw new AssertionError(msg); System.out.println("ok - " + msg); }
    static int portOf(String json) { int i = json.indexOf("\"port\":") + 7; int j = i; while (j < json.length() && Character.isDigit(json.charAt(j))) j++; return Integer.parseInt(json.substring(i, j)); }

    public static void main(String[] a) throws Exception {
        int udp = 47000 + new Random().nextInt(500);
        // 1) host + join + linhas em ordem nos dois sentidos
        Peer h = new Peer(udp), c = new Peer(udp);
        h.net.broadcastTargets = Arrays.asList(InetAddress.getByName("127.0.0.1"));
        h.net.host("Sala \"Teste\"", 0);
        int port = portOf(h.waitEvent("hosting", 3000));
        c.net.join("127.0.0.1", port);
        h.waitEvent("connected", 3000); c.waitEvent("connected", 3000);
        for (int i = 0; i < 2000; i++) { h.net.send("{\"n\":" + i + ",\"t\":\"çãõ ✓ \\\"x\\\"\"}"); c.net.send("c" + i); }
        for (int i = 0; i < 2000; i++) {
            String l = c.lines.poll(3, TimeUnit.SECONDS), m = h.lines.poll(3, TimeUnit.SECONDS);
            if (l == null || !l.startsWith("{\"n\":" + i + ",")) throw new AssertionError("ordem host->cliente em " + i + ": " + l);
            if (!("c" + i).equals(m)) throw new AssertionError("ordem cliente->host em " + i + ": " + m);
        }
        check(true, "2000 linhas em ordem nos dois sentidos (UTF-8 preservado)");
        check(c.lines.isEmpty() && h.lines.isEmpty(), "sem linhas extras");
        // 2) cliente fecha => host recebe closed
        c.net.close(); h.waitEvent("closed", 3000); check(true, "fechamento remoto detectado");
        // 3) linha longa derruba a conexão
        Peer h2 = new Peer(udp), c2 = new Peer(udp);
        h2.net.host("H2", 0); int p2 = portOf(h2.waitEvent("hosting", 3000));
        c2.net.join("127.0.0.1", p2); h2.waitEvent("connected", 3000); c2.waitEvent("connected", 3000);
        StringBuilder big = new StringBuilder(); for (int i = 0; i < LanNet.MAX_LINE + 100; i++) big.append('x');
        c2.net.send(big.toString());
        h2.waitEvent("grande demais", 3000); check(true, "linha acima do limite fecha a conexão");
        c2.waitEvent("closed", 3000);
        // 4) segunda conexão depois que a sala foi preenchida é recusada
        Peer h3 = new Peer(udp), c3 = new Peer(udp), c4 = new Peer(udp);
        h3.net.host("H3", 0); int p3 = portOf(h3.waitEvent("hosting", 3000));
        c3.net.join("127.0.0.1", p3); h3.waitEvent("connected", 3000);
        Thread.sleep(200); c4.net.join("127.0.0.1", p3); c4.waitEvent("error", 6000);
        check(true, "segundo cliente é recusado");
        // 5) conexão a porta fechada gera erro
        Peer c5 = new Peer(udp); c5.net.join("127.0.0.1", 1); c5.waitEvent("error", 6000); check(true, "erro ao conectar em porta fechada");
        // 6) descoberta por broadcast (loopback)
        Peer h6 = new Peer(udp), s6 = new Peer(udp);
        h6.net.broadcastTargets = Arrays.asList(InetAddress.getByName("127.0.0.1"));
        s6.net.scan(4000);
        Thread.sleep(300);
        h6.net.host("Sala do Zé | x", 0); int p6 = portOf(h6.waitEvent("hosting", 3000));
        String found = s6.waitEvent("found", 4000);
        check(found.contains("\"ip\":\"127.0.0.1\"") && found.contains("\"port\":" + p6) && found.contains("Sala do Zé"), "anúncio descoberto: " + found);
        s6.waitEvent("scanDone", 6000); check(true, "scan termina");
        // 6b) lista de IPs do aparelho (inclui VPN) e evento hosting com ips
        String ips = LanNet.localIpsJson();
        check(ips.startsWith("[") && ips.endsWith("]") && (ips.equals("[]") || ips.matches("^\\[(\\{\"n\":\"[^\"]+\",\"ip\":\"\\d+\\.\\d+\\.\\d+\\.\\d+\"\\},?)+\\]$")), "localIpsJson válido: " + ips);
        Peer h10 = new Peer(udp); h10.net.host("Ips", 0); String hev = h10.waitEvent("hosting", 3000); check(hev.contains("\"ips\":["), "evento hosting traz ips: " + hev); h10.net.close();
        // 7) escape JSON
        check(LanNet.q("a\"b\\c\n\u2028").equals("\"a\\\"b\\\\c\\n\\u2028\""), "escape JSON");
        // 8) host em porta ocupada informa erro
        Peer h8 = new Peer(udp), h9 = new Peer(udp);
        h8.net.host("A", 0); int p8 = portOf(h8.waitEvent("hosting", 3000));
        h9.net.host("B", p8); h9.waitEvent("error", 3000); check(true, "porta ocupada gera erro");
        for (Peer p : new Peer[]{h, c, h2, c2, h3, c3, c4, c5, h6, s6, h8, h9}) p.net.close();
        System.out.println("TODOS OS TESTES JAVA PASSARAM");
        System.exit(0);
    }
}
