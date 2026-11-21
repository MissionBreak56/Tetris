package com.missionbreak56.tetris.security;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Collection;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Regra de confiança dos certificados de assinatura (JVM pura): o APK novo só é aceito se o conjunto de certificados que o assina
 * for EXATAMENTE o mesmo do app instalado (comparando SHA-256 dos certificados). Um SHA-256 do arquivo sozinho NÃO prova quem o
 * publicou; o certificado, sim.
 */
public final class SignerPolicy {
    private SignerPolicy() { }

    /** SHA-256 (hex minúsculo) de um certificado codificado. */
    public static String certDigest(byte[] cert) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(cert);
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format(Locale.ROOT, "%02x", b & 255));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    /** true só se os dois conjuntos são não vazios e idênticos. Conjunto vazio (APK sem assinatura) nunca é confiável. */
    public static boolean sameSigners(Collection<String> installed, Collection<String> candidate) {
        if (installed == null || candidate == null || installed.isEmpty() || candidate.isEmpty()) return false;
        Set<String> a = new HashSet<String>(), b = new HashSet<String>();
        for (String s : installed) { if (s == null) return false; a.add(s.toLowerCase(Locale.ROOT)); }
        for (String s : candidate) { if (s == null) return false; b.add(s.toLowerCase(Locale.ROOT)); }
        return a.equals(b);
    }

    /** Compara um digest binário com um SHA-256 em hex, em tempo constante. */
    public static boolean digestEquals(byte[] digest, String hex) {
        if (digest == null || hex == null || hex.length() != 64) return false;
        StringBuilder sb = new StringBuilder();
        for (byte b : digest) sb.append(String.format(Locale.ROOT, "%02x", b & 255));
        return IntegrityManager.constantTimeEquals(sb.toString().getBytes(java.nio.charset.StandardCharsets.US_ASCII), hex.toLowerCase(Locale.ROOT).getBytes(java.nio.charset.StandardCharsets.US_ASCII));
    }

    /** Primeira palavra de um arquivo .sha256 ("hex  nome") se for um SHA-256 válido em hex; senão null. */
    public static String parseChecksumFile(String text) {
        if (text == null) return null;
        String t = text.trim();
        int sp = 0; while (sp < t.length() && !Character.isWhitespace(t.charAt(sp))) sp++;
        String h = t.substring(0, sp).toLowerCase(Locale.ROOT);
        return h.matches("[0-9a-f]{64}") ? h : null;
    }
}
