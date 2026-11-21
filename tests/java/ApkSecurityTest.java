import com.missionbreak56.tetris.security.SignerPolicy;
import java.util.*;

/** Teste da política de certificados/checksum (JVM pura). Rodar: java -ea ApkSecurityTest */
public class ApkSecurityTest {
    static void check(boolean ok, String msg) { if (!ok) throw new AssertionError(msg); System.out.println("ok - " + msg); }

    public static void main(String[] a) {
        String c1 = SignerPolicy.certDigest("certificado A".getBytes()), c2 = SignerPolicy.certDigest("certificado B".getBytes());
        check(c1.matches("[0-9a-f]{64}") && !c1.equals(c2), "digest do certificado: SHA-256 em hex, certificados diferentes dão digests diferentes");
        check(SignerPolicy.certDigest("abc".getBytes()).equals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"), "SHA-256 com vetor conhecido");
        check(SignerPolicy.sameSigners(Arrays.asList(c1), Arrays.asList(c1)), "mesmo certificado é aceito");
        check(SignerPolicy.sameSigners(Arrays.asList(c1.toUpperCase()), Arrays.asList(c1)), "comparação sem diferenciar maiúsculas");
        check(!SignerPolicy.sameSigners(Arrays.asList(c1), Arrays.asList(c2)), "certificado diferente é RECUSADO");
        check(!SignerPolicy.sameSigners(Arrays.asList(c1), Arrays.asList(c1, c2)), "APK com signatário extra é recusado");
        check(!SignerPolicy.sameSigners(Arrays.asList(c1, c2), Arrays.asList(c1)), "APK com signatário a menos é recusado");
        check(SignerPolicy.sameSigners(Arrays.asList(c1, c2), Arrays.asList(c2, c1)), "ordem dos signatários não importa");
        check(!SignerPolicy.sameSigners(new ArrayList<String>(), Arrays.asList(c1)) && !SignerPolicy.sameSigners(Arrays.asList(c1), new ArrayList<String>()) && !SignerPolicy.sameSigners(new ArrayList<String>(), new ArrayList<String>()), "sem assinatura nunca é confiável (nem vazio == vazio)");
        check(!SignerPolicy.sameSigners(null, Arrays.asList(c1)) && !SignerPolicy.sameSigners(Arrays.asList(c1), null) && !SignerPolicy.sameSigners(Arrays.asList((String) null), Arrays.asList(c1)), "nulos são recusados");

        String good = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        check(good.equals(SignerPolicy.parseChecksumFile(good + "  Tetris-v1.8.2.apk\n")), "arquivo .sha256: 'hex  nome'");
        check(good.equals(SignerPolicy.parseChecksumFile(good.toUpperCase())) && good.equals(SignerPolicy.parseChecksumFile("  " + good + "\r\n")), "arquivo .sha256: só o hash, maiúsculas e espaços");
        for (String bad : new String[]{ null, "", "isto não é hash", good.substring(1), good + "0", "zz" + good.substring(2), "<html>404</html>" }) check(SignerPolicy.parseChecksumFile(bad) == null, "arquivo .sha256 inválido recusado: " + bad);
        byte[] d = new byte[32]; for (int i = 0; i < 32; i++) d[i] = (byte) i;
        String h = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
        check(SignerPolicy.digestEquals(d, h) && SignerPolicy.digestEquals(d, h.toUpperCase()), "digestEquals confere");
        check(!SignerPolicy.digestEquals(d, h.replace('1', '2')) && !SignerPolicy.digestEquals(d, null) && !SignerPolicy.digestEquals(null, h) && !SignerPolicy.digestEquals(d, h.substring(2)), "digestEquals recusa diferente/nulo/curto");
        System.out.println("ALL OK");
    }
}
