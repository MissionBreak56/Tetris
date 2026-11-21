package com.missionbreak56.tetris.security;

import java.util.regex.Pattern;

/**
 * Validação dos argumentos que o JavaScript envia para a ponte Android (sem dependências do Android, testável na JVM).
 * Regra geral: dado inválido é recusado (nunca "consertado" em silêncio quando isso mudaria o conteúdo do usuário).
 */
public final class BridgeValidator {
    private BridgeValidator() { }

    public static final int MAX_FILE_CHARS = 8_000_000;     // salvar/abrir arquivo (backup)
    public static final int MAX_SHARE_CHARS = 4_000_000;    // compartilhar texto
    public static final int MAX_TITLE = 120;
    public static final int MAX_LAN_LINE = 16_384;          // igual ao limite de linha do LanNet
    public static final int MAX_ROOM_NAME = 24;
    public static final int MAX_SNAPSHOT_CHARS = 12_000_000;

    private static final Pattern IPV4 = Pattern.compile("^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$");
    private static final String[] MIMES = { "application/json", "text/plain", "application/octet-stream", "application/x-tetris-backup" };

    /** Texto nulo vira vazio e texto longo demais é cortado (para títulos/nomes, não para conteúdo do usuário). */
    public static String clip(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max);
    }

    /** true se o conteúdo é nulo ou passa do limite (conteúdo do usuário não é cortado: é recusado). */
    public static boolean tooLong(String s, int max) { return s == null || s.length() > max; }

    /** Nome de arquivo seguro: sem separadores de caminho/controle, sem ponto inicial, no máximo 100 caracteres. */
    public static String cleanFileName(String n) {
        if (n == null) return "tetris.dat";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n.length() && sb.length() < 100; i++) {
            char c = n.charAt(i);
            if (c < 32 || c == '/' || c == '\\' || c == ':' || c == '*' || c == '?' || c == '"' || c == '<' || c == '>' || c == '|') sb.append('_');
            else sb.append(c);
        }
        String r = sb.toString().trim();
        while (r.startsWith(".")) r = r.substring(1);
        return r.isEmpty() ? "tetris.dat" : r;
    }

    /** Tipo MIME aceito para salvar arquivos; qualquer outro vira application/octet-stream. */
    public static String cleanMime(String m) {
        if (m != null) for (String ok : MIMES) if (ok.equalsIgnoreCase(m.trim())) return ok;
        return "application/octet-stream";
    }

    public static boolean validPort(int p) { return p >= 1 && p <= 65535; }

    /** IPv4 em formato decimal com 4 partes de 0 a 255 (não aceita nomes de host). */
    public static boolean validIpv4(String s) {
        if (s == null || s.length() > 15) return false;
        java.util.regex.Matcher m = IPV4.matcher(s);
        if (!m.matches()) return false;
        for (int i = 1; i <= 4; i++) if (Integer.parseInt(m.group(i)) > 255) return false;
        return true;
    }
}
