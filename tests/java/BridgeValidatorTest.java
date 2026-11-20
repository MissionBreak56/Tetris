import com.missionbreak56.tetris.security.BridgeValidator;

/** Teste da validação dos argumentos da ponte JS -> Android (JVM pura). Rodar: java -ea BridgeValidatorTest */
public class BridgeValidatorTest {
    static void check(boolean ok, String msg) { if (!ok) throw new AssertionError(msg); System.out.println("ok - " + msg); }

    public static void main(String[] a) {
        check(BridgeValidator.cleanFileName("tetris-backup-2026.tmb").equals("tetris-backup-2026.tmb"), "nome normal é mantido");
        check(BridgeValidator.cleanFileName("../../etc/passwd").equals("_.._etc_passwd") || !BridgeValidator.cleanFileName("../../etc/passwd").contains("/"), "sem separadores de caminho");
        check(!BridgeValidator.cleanFileName("a\\b:c*d?e\"f<g>h|i").matches(".*[\\\\:*?\"<>|].*"), "caracteres proibidos viram _");
        check(BridgeValidator.cleanFileName("...").equals("tetris.dat") && BridgeValidator.cleanFileName(null).equals("tetris.dat") && BridgeValidator.cleanFileName("").equals("tetris.dat"), "vazio/nulo/só pontos -> nome padrão");
        check(!BridgeValidator.cleanFileName(".hidden").startsWith("."), "sem ponto inicial");
        check(BridgeValidator.cleanFileName(new String(new char[500]).replace('\0', 'x')).length() == 100, "limite de 100 caracteres");
        check(BridgeValidator.cleanFileName("a\nb\u0000c").equals("a_b_c"), "caracteres de controle");

        check(BridgeValidator.cleanMime("application/json").equals("application/json"), "mime permitido");
        check(BridgeValidator.cleanMime("TEXT/PLAIN").equals("text/plain"), "mime sem diferenciar maiúsculas");
        check(BridgeValidator.cleanMime("text/html").equals("application/octet-stream") && BridgeValidator.cleanMime(null).equals("application/octet-stream"), "mime desconhecido vira octet-stream");

        check(BridgeValidator.validPort(47600) && BridgeValidator.validPort(1) && BridgeValidator.validPort(65535), "portas válidas");
        check(!BridgeValidator.validPort(0) && !BridgeValidator.validPort(-1) && !BridgeValidator.validPort(65536), "portas inválidas");

        check(BridgeValidator.validIpv4("192.168.0.10") && BridgeValidator.validIpv4("10.0.0.1") && BridgeValidator.validIpv4("255.255.255.255"), "IPv4 válido");
        String[] bad = { "", null, "1.2.3", "1.2.3.4.5", "256.1.1.1", "a.b.c.d", "192.168.0.1 ", " 1.2.3.4", "1.2.3.-4", "example.com", "::1", "1111.1.1.1", "01234567890123456" };
        for (String s : bad) check(!BridgeValidator.validIpv4(s), "IPv4 inválido: " + s);

        check(BridgeValidator.clip(null, 5).equals("") && BridgeValidator.clip("abcdefgh", 5).equals("abcde") && BridgeValidator.clip("abc", 5).equals("abc"), "clip");
        check(BridgeValidator.tooLong(null, 5) && BridgeValidator.tooLong("abcdef", 5) && !BridgeValidator.tooLong("abcde", 5), "tooLong (nulo é recusado)");
        System.out.println("ALL OK");
    }
}
