import com.missionbreak56.tetris.security.IntegrityManager;
import com.missionbreak56.tetris.storage.SnapshotManager;
import com.missionbreak56.tetris.storage.StorageManager;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Teste do armazenamento nativo (StorageManager, IntegrityManager, SnapshotManager) na JVM. Rodar: java -ea StorageSnapshotTest */
public class StorageSnapshotTest {
    static void check(boolean ok, String msg) { if (!ok) throw new AssertionError(msg); System.out.println("ok - " + msg); }

    /** Cifra AES-GCM de teste (no app é o Android Keystore). */
    static class TestCipher implements SnapshotManager.Cipher {
        final SecretKeySpec key; final SecureRandom r = new SecureRandom();
        TestCipher(byte[] k) { key = new SecretKeySpec(k, "AES"); }
        public byte[] encrypt(byte[] p) throws Exception {
            byte[] iv = new byte[12]; r.nextBytes(iv);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, iv));
            byte[] ct = c.doFinal(p), o = new byte[12 + ct.length]; System.arraycopy(iv, 0, o, 0, 12); System.arraycopy(ct, 0, o, 12, ct.length); return o;
        }
        public byte[] decrypt(byte[] d) throws Exception {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, d, 0, 12));
            return c.doFinal(d, 12, d.length - 12);
        }
    }

    static File tmp() throws Exception { return Files.createTempDirectory("tsnap").toFile(); }

    /** Nome do slot que guarda o snapshot de maior sequência. */
    static String newestSlot(StorageManager st) {
        IntegrityManager.Unwrapped a = IntegrityManager.unwrap(st.read("snap-a.bin")), b = IntegrityManager.unwrap(st.read("snap-b.bin"));
        if (a == null) return "snap-b.bin"; if (b == null) return "snap-a.bin";
        return a.seq > b.seq ? "snap-a.bin" : "snap-b.bin";
    }

    public static void main(String[] a) throws Exception {
        // ---- IntegrityManager ----
        byte[] data = "olá mundo".getBytes(StandardCharsets.UTF_8);
        byte[] w = IntegrityManager.wrap(7, data);
        IntegrityManager.Unwrapped u = IntegrityManager.unwrap(w);
        check(u != null && u.seq == 7 && new String(u.payload, StandardCharsets.UTF_8).equals("olá mundo"), "contêiner: ida e volta");
        byte[] t1 = w.clone(); t1[t1.length - 1] ^= 1;
        check(IntegrityManager.unwrap(t1) == null, "contêiner: byte do conteúdo alterado é recusado");
        byte[] t2 = w.clone(); t2[20] ^= 1;
        check(IntegrityManager.unwrap(t2) == null, "contêiner: hash alterado é recusado");
        check(IntegrityManager.unwrap(java.util.Arrays.copyOf(w, w.length - 1)) == null, "contêiner: truncado é recusado");
        byte[] t3 = java.util.Arrays.copyOf(w, w.length + 1);
        check(IntegrityManager.unwrap(t3) == null, "contêiner: lixo no fim é recusado");
        byte[] t4 = w.clone(); t4[0] = 'X';
        check(IntegrityManager.unwrap(t4) == null && IntegrityManager.unwrap(null) == null && IntegrityManager.unwrap(new byte[3]) == null, "contêiner: magia errada/nulo/curto");
        check(IntegrityManager.constantTimeEquals(new byte[] { 1, 2, 3 }, new byte[] { 1, 2, 3 }) && !IntegrityManager.constantTimeEquals(new byte[] { 1, 2, 3 }, new byte[] { 1, 2, 4 }) && !IntegrityManager.constantTimeEquals(new byte[] { 1, 2 }, new byte[] { 1, 2, 3 }) && !IntegrityManager.constantTimeEquals(null, new byte[0]), "comparação em tempo constante");
        check(IntegrityManager.sha256Hex("abc").equals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"), "SHA-256 (vetor conhecido)");

        // ---- StorageManager ----
        File d = tmp(); StorageManager sm = new StorageManager(d);
        check(sm.writeAtomic("a.bin", new byte[] { 1, 2, 3 }) && java.util.Arrays.equals(sm.read("a.bin"), new byte[] { 1, 2, 3 }), "gravação atômica e leitura");
        check(sm.writeAtomic("a.bin", new byte[] { 9 }) && java.util.Arrays.equals(sm.read("a.bin"), new byte[] { 9 }), "sobrescreve");
        check(new File(d, "a.bin.tmp").exists() == false, "sem arquivo temporário sobrando");
        for (String bad : new String[] { "../x", "a/b", "", "A.bin", ".hidden", "x.tmp", "a b" }) {
            boolean threw = false; try { sm.writeAtomic(bad, new byte[1]); } catch (IllegalArgumentException e) { threw = true; }
            check(threw, "nome inválido recusado: '" + bad + "'");
        }
        check(sm.read("nao-existe.bin") == null && !sm.exists("nao-existe.bin"), "arquivo inexistente");
        File notDir = File.createTempFile("tnd", ".x"); notDir.deleteOnExit();
        check(!new StorageManager(new File(notDir, "sub")).writeAtomic("a.bin", new byte[1]), "falha de gravação NÃO finge sucesso");
        check(sm.delete("a.bin") && !sm.exists("a.bin") && sm.delete("a.bin"), "apagar");

        // ---- SnapshotManager ----
        byte[] key = new byte[32]; new SecureRandom().nextBytes(key);
        File sd = tmp(); StorageManager st = new StorageManager(sd); SnapshotManager sn = new SnapshotManager(st, new TestCipher(key));
        check(sn.load() == null && sn.latestSeq() == -1, "sem snapshot no começo");
        check(sn.save("v1 {\"x\":1}") && sn.latestSeq() == 0 && sn.load().equals("v1 {\"x\":1}"), "salva e carrega (seq 0)");
        check(sn.save("v2") && sn.latestSeq() == 1 && sn.load().equals("v2"), "segundo snapshot vai para o outro slot (seq 1)");
        check(sn.save("v3 çãõ 🎮") && sn.latestSeq() == 2 && sn.load().equals("v3 çãõ 🎮"), "terceiro reaproveita o slot mais antigo, UTF-8 ok");
        check(!new String(st.read("snap-a.bin"), StandardCharsets.ISO_8859_1).contains("v3") && !new String(st.read("snap-b.bin"), StandardCharsets.ISO_8859_1).contains("v2"), "conteúdo em repouso está cifrado");
        // corrompe o mais novo -> usa o anterior
        String newest = newestSlot(st);
        byte[] f = st.read(newest); f[f.length - 3] ^= 0x55; st.writeAtomic(newest, f);
        check(sn.load().equals("v2"), "snapshot mais novo corrompido: volta para o anterior (v2)");
        check(sn.save("v4") && sn.load().equals("v4"), "depois da corrupção volta a salvar normalmente");
        // trunca o mais novo
        String nw = newestSlot(st); byte[] g = st.read(nw);
        st.writeAtomic(nw, java.util.Arrays.copyOf(g, g.length / 2));
        check(sn.load() != null && !sn.load().equals("v4"), "snapshot truncado (queda no meio da gravação): usa o anterior");
        // os dois ruins
        for (String s : new String[] { "snap-a.bin", "snap-b.bin" }) st.writeAtomic(s, new byte[] { 1, 2, 3 });
        check(sn.load() == null, "dois snapshots inválidos: nada para recuperar (sem lixo)");
        // cifra com chave diferente (ex.: Keystore invalidado) -> ilegível, sem exceção
        sn.clear(); sn.save("segredo");
        byte[] k2 = new byte[32]; new SecureRandom().nextBytes(k2);
        check(new SnapshotManager(st, new TestCipher(k2)).load() == null, "chave diferente não lê o snapshot");
        check(new SnapshotManager(st, new TestCipher(key)).load().equals("segredo"), "chave certa lê");
        // gravação interrompida: sobra de .tmp não atrapalha
        Files.write(new File(sd, "snap-a.bin.tmp").toPath(), new byte[] { 7, 7, 7 });
        check(sn.save("depois do tmp") && sn.load().equals("depois do tmp"), "sobra de arquivo temporário não atrapalha");
        // sem cifra (cipher null)
        SnapshotManager plain = new SnapshotManager(new StorageManager(tmp()), null);
        check(plain.save("claro") && plain.load().equals("claro"), "sem cifra também funciona");
        // concorrência
        final SnapshotManager cc = new SnapshotManager(new StorageManager(tmp()), new TestCipher(key));
        Thread[] ts = new Thread[6];
        for (int i = 0; i < ts.length; i++) { final int n = i; ts[i] = new Thread(() -> { for (int j = 0; j < 15; j++) cc.save("t" + n + "-" + j); }); ts[i].start(); }
        for (Thread t : ts) t.join();
        String last = cc.load();
        check(last != null && last.startsWith("t") && cc.latestSeq() == 6 * 15 - 1, "saves concorrentes: tudo íntegro (seq " + cc.latestSeq() + ")");
        System.out.println("ALL OK");
    }
}
