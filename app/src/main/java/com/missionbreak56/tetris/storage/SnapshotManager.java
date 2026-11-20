package com.missionbreak56.tetris.storage;

import com.missionbreak56.tetris.security.IntegrityManager;
import java.nio.charset.StandardCharsets;

/**
 * Cópias consistentes dos dados do jogo FORA do localStorage da WebView (que pode ser limpo/corrompido).
 * Dois "slots" alternados: cada gravação vai para o slot MAIS ANTIGO e só vale depois de conferida (leitura de volta);
 * o slot anterior continua intacto até a próxima gravação, então sempre sobra pelo menos um snapshot válido.
 * Cada slot é um contêiner com sequência + SHA-256 ({@link IntegrityManager}) e o conteúdo é cifrado por {@link Cipher}.
 * JVM pura (a cifra do Android Keystore é injetada).
 */
public final class SnapshotManager {
    /** Cifra do conteúdo em repouso. encrypt/decrypt lançam exceção se não conseguirem (chave inválida, dado alterado). */
    public interface Cipher {
        byte[] encrypt(byte[] plain) throws Exception;
        byte[] decrypt(byte[] data) throws Exception;
    }

    private static final String[] SLOTS = { "snap-a.bin", "snap-b.bin" };
    private final StorageManager store;
    private final Cipher cipher;

    /** cipher pode ser null (conteúdo sem cifra). */
    public SnapshotManager(StorageManager store, Cipher cipher) { this.store = store; this.cipher = cipher; }

    private long seqOf(String slot) {
        byte[] f = store.read(slot);
        IntegrityManager.Unwrapped u = IntegrityManager.unwrap(f);
        return u == null ? -1 : u.seq;
    }

    /** Sequência do snapshot mais novo válido (-1 se não há nenhum). */
    public synchronized long latestSeq() { return Math.max(seqOf(SLOTS[0]), seqOf(SLOTS[1])); }

    public synchronized boolean save(String text) {
        if (text == null) return false;
        try {
            byte[] plain = text.getBytes(StandardCharsets.UTF_8);
            byte[] enc = cipher == null ? plain : cipher.encrypt(plain);
            long a = seqOf(SLOTS[0]), b = seqOf(SLOTS[1]), latest = Math.max(a, b);
            String target = a >= b ? SLOTS[1] : SLOTS[0];            // escreve no slot mais antigo (ou inválido)
            long seq = latest + 1;
            if (!store.writeAtomic(target, IntegrityManager.wrap(seq, enc))) return false;
            return seqOf(target) == seq;                              // só vale se leu de volta íntegro
        } catch (Exception e) {
            return false;
        }
    }

    /** Texto do snapshot válido mais novo; se o mais novo estiver ilegível (corrompido/chave inválida), tenta o anterior. */
    public synchronized String load() {
        long a = seqOf(SLOTS[0]), b = seqOf(SLOTS[1]);
        String[] order = a >= b ? new String[] { SLOTS[0], SLOTS[1] } : new String[] { SLOTS[1], SLOTS[0] };
        for (String slot : order) {
            IntegrityManager.Unwrapped u = IntegrityManager.unwrap(store.read(slot));
            if (u == null) continue;
            try {
                byte[] plain = cipher == null ? u.payload : cipher.decrypt(u.payload);
                if (plain != null) return new String(plain, StandardCharsets.UTF_8);
            } catch (Exception ignored) { }
        }
        return null;
    }

    public synchronized void clear() { for (String s : SLOTS) store.delete(s); }
}
