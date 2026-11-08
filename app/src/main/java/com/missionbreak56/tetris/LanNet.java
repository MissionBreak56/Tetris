package com.missionbreak56.tetris;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;

/**
 * Rede local do Tetris (sem dependências do Android, testável na JVM).
 * - Anfitrião: ServerSocket TCP + anúncio por broadcast UDP até alguém conectar.
 * - Cliente: procura anúncios (scan) ou conecta direto por IP.
 * - Uma única conexão, mensagens em linhas UTF-8 (JSON gerado pelo JavaScript).
 * Eventos (JSON) vão para Listener.event; linhas recebidas para Listener.line.
 */
public final class LanNet {
    public interface Listener {
        void event(String json);
        void line(String line);
    }

    public static final int TCP_PORT = 47600;
    public static final int UDP_PORT = 47601;
    public static final int MAX_LINE = 16384;
    private static final String MAGIC = "TETRIS1";

    private final Listener out;
    private final int udpPort;
    private final Object lock = new Object();
    private int gen = 0;                       // cada host/join/scan/close cancela as threads anteriores
    private ServerSocket server;
    private Socket sock;
    private OutputStream sockOut;
    private ExecutorService sender;
    /** Somente testes: destinos do anúncio (null = broadcast real da rede). */
    public volatile List<InetAddress> broadcastTargets;

    public LanNet(Listener out) { this(out, UDP_PORT); }
    public LanNet(Listener out, int udpPort) { this.out = out; this.udpPort = udpPort; }

    /* ------------------------------------------------------------------ util */
    public static String q(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                default:
                    if (c < 0x20 || c == 0x2028 || c == 0x2029) b.append(String.format("\\u%04x", (int) c));
                    else b.append(c);
            }
        }
        return b.append('"').toString();
    }

    private void emit(String json) { try { out.event(json); } catch (RuntimeException ignored) { } }

    /** IP IPv4 local preferindo endereços privados (Wi-Fi/hotspot). */
    public static String localIp() {
        String fallback = "";
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) {
                        if (a.isSiteLocalAddress()) return a.getHostAddress();
                        if (fallback.isEmpty()) fallback = a.getHostAddress();
                    }
                }
            }
        } catch (Exception ignored) { }
        return fallback;
    }

    /** Todos os IPv4 ativos do aparelho como JSON: [{"n":"wlan0","ip":"192.168.0.5"}, ...] (inclui VPN: tun0, tailscale0...). */
    public static String localIpsJson() {
        StringBuilder b = new StringBuilder("[");
        int n = 0;
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && !a.isLoopbackAddress() && n < 8) {
                        if (n++ > 0) b.append(',');
                        b.append("{\"n\":").append(q(ni.getName())).append(",\"ip\":").append(q(a.getHostAddress())).append('}');
                    }
                }
            }
        } catch (Exception ignored) { }
        return b.append(']').toString();
    }

    private List<InetAddress> targets() {
        List<InetAddress> t = broadcastTargets;
        if (t != null) return t;
        List<InetAddress> r = new ArrayList<>();
        try {
            r.add(InetAddress.getByName("255.255.255.255"));
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) if (ia.getBroadcast() != null) r.add(ia.getBroadcast());
            }
        } catch (Exception ignored) { }
        return r;
    }

    private static Thread daemon(Runnable r, String name) { Thread t = new Thread(r, name); t.setDaemon(true); return t; }

    /* ------------------------------------------------------------------ host */
    public void host(final String name, final int port) {
        final int g;
        synchronized (lock) { closeLocked(); g = ++gen; }
        daemon(new Runnable() {
            public void run() {
                ServerSocket ss = null;
                try {
                    ss = new ServerSocket();
                    ss.setReuseAddress(true);
                    ss.bind(new InetSocketAddress(port));
                    synchronized (lock) { if (g != gen) { ss.close(); return; } server = ss; }
                    final int p = ss.getLocalPort();
                    emit("{\"e\":\"hosting\",\"ip\":" + q(localIp()) + ",\"ips\":" + localIpsJson() + ",\"port\":" + p + "}");
                    startAnnouncer(g, name, p);
                    Socket s = ss.accept();
                    synchronized (lock) {
                        if (g != gen) { s.close(); return; }
                        server = null;
                    }
                    try { ss.close(); } catch (IOException ignored) { }
                    attach(s, g);
                } catch (IOException e) {
                    synchronized (lock) { if (g != gen) return; }
                    emit("{\"e\":\"error\",\"msg\":" + q("Não foi possível abrir a sala: " + e.getMessage()) + "}");
                    close();
                } finally {
                    if (ss != null) try { ss.close(); } catch (IOException ignored) { }
                }
            }
        }, "lan-host").start();
    }

    private void startAnnouncer(final int g, final String name, final int port) {
        daemon(new Runnable() {
            public void run() {
                DatagramSocket ds = null;
                try {
                    ds = new DatagramSocket();
                    ds.setBroadcast(true);
                    String clean = name.replace("|", " ").replace("\n", " ");
                    byte[] data = (MAGIC + "|1|" + clean + "|" + port).getBytes(StandardCharsets.UTF_8);
                    while (true) {
                        synchronized (lock) { if (g != gen || server == null) break; }
                        for (InetAddress a : targets()) {
                            try { ds.send(new DatagramPacket(data, data.length, a, udpPort)); } catch (IOException ignored) { }
                        }
                        try { Thread.sleep(800); } catch (InterruptedException e) { break; }
                    }
                } catch (IOException ignored) {
                } finally { if (ds != null) ds.close(); }
            }
        }, "lan-announce").start();
    }

    /* ------------------------------------------------------------------ scan */
    public void scan(final int millis) {
        final int g;
        synchronized (lock) { closeLocked(); g = ++gen; }
        daemon(new Runnable() {
            public void run() {
                DatagramSocket ds = null;
                Set<String> seen = new HashSet<>();
                try {
                    ds = new DatagramSocket(null);
                    ds.setReuseAddress(true);
                    ds.bind(new InetSocketAddress(udpPort));
                    ds.setSoTimeout(250);
                    long end = System.currentTimeMillis() + millis;
                    byte[] buf = new byte[512];
                    while (System.currentTimeMillis() < end) {
                        synchronized (lock) { if (g != gen) return; }
                        DatagramPacket p = new DatagramPacket(buf, buf.length);
                        try { ds.receive(p); } catch (java.net.SocketTimeoutException e) { continue; }
                        String[] f = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8).split("\\|", 4);
                        if (f.length != 4 || !MAGIC.equals(f[0]) || !"1".equals(f[1])) continue;
                        int port; try { port = Integer.parseInt(f[3].trim()); } catch (NumberFormatException e) { continue; }
                        if (port < 1 || port > 65535) continue;
                        String ip = p.getAddress().getHostAddress();
                        if (!seen.add(ip + ":" + port)) continue;
                        emit("{\"e\":\"found\",\"name\":" + q(f[2].length() > 24 ? f[2].substring(0, 24) : f[2]) + ",\"ip\":" + q(ip) + ",\"port\":" + port + "}");
                    }
                } catch (IOException e) {
                    emit("{\"e\":\"error\",\"msg\":" + q("Falha ao procurar salas: " + e.getMessage()) + "}");
                } finally {
                    if (ds != null) ds.close();
                    synchronized (lock) { if (g == gen) emit("{\"e\":\"scanDone\"}"); }
                }
            }
        }, "lan-scan").start();
    }

    /* ------------------------------------------------------------------ join */
    public void join(final String ip, final int port) {
        final int g;
        synchronized (lock) { closeLocked(); g = ++gen; }
        daemon(new Runnable() {
            public void run() {
                Socket s = new Socket();
                try {
                    s.connect(new InetSocketAddress(ip, port), 4000);
                    synchronized (lock) { if (g != gen) { s.close(); return; } }
                    attach(s, g);
                } catch (Exception e) {
                    try { s.close(); } catch (IOException ignored) { }
                    synchronized (lock) { if (g != gen) return; }
                    emit("{\"e\":\"error\",\"msg\":" + q("Não foi possível conectar a " + ip + ": " + e.getMessage()) + "}");
                }
            }
        }, "lan-join").start();
    }

    /* ------------------------------------------------------------------ conexão */
    private void attach(Socket s, int g) {
        try {
            s.setTcpNoDelay(true);                       // sem agrupar pacotes pequenos (Nagle desligado)
            s.setKeepAlive(true);
            try { s.setTrafficClass(0x10); } catch (Exception ignored) { }   // IPTOS_LOWDELAY
            OutputStream os = s.getOutputStream();
            synchronized (lock) {
                if (g != gen) { s.close(); return; }
                sock = s; sockOut = os;
                sender = Executors.newSingleThreadExecutor(new ThreadFactory() {
                    public Thread newThread(Runnable r) { return daemon(r, "lan-send"); }
                });
            }
            emit("{\"e\":\"connected\",\"peer\":" + q(s.getInetAddress().getHostAddress()) + "}");
            InputStream is = s.getInputStream();
            ByteArrayOutputStream line = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) > 0) {
                for (int i = 0; i < n; i++) {
                    byte b = buf[i];
                    if (b == '\n') {
                        String l = new String(line.toByteArray(), StandardCharsets.UTF_8);
                        line.reset();
                        synchronized (lock) { if (g != gen) return; }
                        try { out.line(l); } catch (RuntimeException ignored) { }
                    } else {
                        line.write(b);
                        if (line.size() > MAX_LINE) { endConnection(g, "Mensagem grande demais"); return; }
                    }
                }
            }
            endConnection(g, "Conexão encerrada");
        } catch (IOException e) {
            endConnection(g, "Conexão perdida");
        }
    }

    private void endConnection(int g, String why) {
        synchronized (lock) { if (g != gen) return; closeLocked(); gen++; }
        emit("{\"e\":\"closed\",\"why\":" + q(why) + "}");
    }

    /** Envia uma linha (sem quebras). Falha de envio encerra a conexão. */
    public void send(final String line) {
        final ExecutorService ex; final OutputStream os; final int g;
        synchronized (lock) { ex = sender; os = sockOut; g = gen; }
        if (ex == null || os == null) return;
        final byte[] bytes = (line.replace("\n", " ").replace("\r", " ") + "\n").getBytes(StandardCharsets.UTF_8);
        ex.execute(new Runnable() {
            public void run() {
                try { synchronized (os) { os.write(bytes); os.flush(); } }
                catch (IOException e) { endConnection(g, "Falha ao enviar"); }
            }
        });
    }

    /** Encerra tudo (sem emitir evento: quem chamou já sabe). */
    public void close() { synchronized (lock) { closeLocked(); gen++; } }

    private void closeLocked() {
        try { if (server != null) server.close(); } catch (IOException ignored) { }
        try { if (sock != null) sock.close(); } catch (IOException ignored) { }
        if (sender != null) sender.shutdown();
        server = null; sock = null; sockOut = null; sender = null;
    }
}
