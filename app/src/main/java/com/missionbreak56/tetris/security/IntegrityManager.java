package com.missionbreak56.tetris.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Integridade de dados (JVM pura): SHA-256, comparação em tempo constante e o contêiner de arquivo
 * "TSN1 | seq(8) | tamanho(4) | sha256(32) | dados" usado pelos snapshots. Arquivo truncado, alterado ou com lixo no fim é recusado.
 */
public final class IntegrityManager {
    private IntegrityManager() { }

    private static final byte[] MAGIC = { 'T', 'S', 'N', '1' };
    private static final int HEADER = 4 + 8 + 4 + 32;
    public static final int MAX_PAYLOAD = 48_000_000;

    /** Conteúdo lido de um contêiner válido. */
    public static final class Unwrapped {
        public final long seq;
        public final byte[] payload;
        Unwrapped(long seq, byte[] payload) { this.seq = seq; this.payload = payload; }
    }

    public static byte[] sha256(byte[] data) {
        try { return MessageDigest.getInstance("SHA-256").digest(data); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    public static String sha256Hex(byte[] data) {
        byte[] d = sha256(data);
        StringBuilder sb = new StringBuilder();
        for (byte b : d) sb.append(String.format("%02x", b & 255));
        return sb.toString();
    }

    public static String sha256Hex(String text) { return sha256Hex(text.getBytes(StandardCharsets.UTF_8)); }

    /** Comparação em tempo constante (não para no primeiro byte diferente). */
    public static boolean constantTimeEquals(byte[] a, byte[] b) {
        if (a == null || b == null) return false;
        int d = a.length ^ b.length;
        int n = Math.max(a.length, b.length);
        for (int i = 0; i < n; i++) d |= (i < a.length ? a[i] : 0) ^ (i < b.length ? b[i] : 0);
        return d == 0;
    }

    public static byte[] wrap(long seq, byte[] payload) {
        if (payload == null || payload.length > MAX_PAYLOAD) throw new IllegalArgumentException("payload");
        byte[] out = new byte[HEADER + payload.length];
        System.arraycopy(MAGIC, 0, out, 0, 4);
        for (int i = 0; i < 8; i++) out[4 + i] = (byte) (seq >>> (56 - 8 * i));
        int n = payload.length;
        out[12] = (byte) (n >>> 24); out[13] = (byte) (n >>> 16); out[14] = (byte) (n >>> 8); out[15] = (byte) n;
        System.arraycopy(sha256(payload), 0, out, 16, 32);
        System.arraycopy(payload, 0, out, HEADER, n);
        return out;
    }

    /** null se o contêiner é inválido (magia, tamanho, hash). */
    public static Unwrapped unwrap(byte[] file) {
        if (file == null || file.length < HEADER) return null;
        for (int i = 0; i < 4; i++) if (file[i] != MAGIC[i]) return null;
        long seq = 0;
        for (int i = 0; i < 8; i++) seq = (seq << 8) | (file[4 + i] & 255L);
        int n = ((file[12] & 255) << 24) | ((file[13] & 255) << 16) | ((file[14] & 255) << 8) | (file[15] & 255);
        if (n < 0 || n > MAX_PAYLOAD || file.length != HEADER + n) return null;
        byte[] payload = new byte[n];
        System.arraycopy(file, HEADER, payload, 0, n);
        byte[] want = new byte[32];
        System.arraycopy(file, 16, want, 0, 32);
        if (!constantTimeEquals(want, sha256(payload))) return null;
        return new Unwrapped(seq, payload);
    }
}
