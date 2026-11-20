package com.missionbreak56.tetris.security;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import com.missionbreak56.tetris.storage.SnapshotManager;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Cifra local com chave AES-256-GCM guardada no Android Keystore (a chave não é exportável e não sai do aparelho).
 * Protege os snapshots locais em repouso. NÃO é usada nos backups transferíveis (.tmb), que usam senha do usuário.
 * Formato: [1][iv(12)][texto cifrado + tag]. Sem Keystore (Android &lt; 6 ou falha do chip): [0][texto] e o dado fica sem cifra
 * (preferimos manter a recuperação a perder o snapshot). Chave invalidada (ex.: restauração em outro aparelho): a chave é
 * apagada e recriada e o snapshot antigo vira ilegível (decrypt devolve erro, e o app volta a criar snapshots novos).
 */
public final class CryptoManager implements SnapshotManager.Cipher {
    public static final String ALIAS = "tetris_snapshot_key_v1";
    private static final String PROVIDER = "AndroidKeyStore", TRANSFORM = "AES/GCM/NoPadding";
    private static final byte PLAIN = 0, KEYSTORE = 1;

    public static boolean available() { return Build.VERSION.SDK_INT >= 23; }

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance(PROVIDER);
        ks.load(null);
        if (!ks.containsAlias(ALIAS)) {
            KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER);
            kg.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)      // o próprio Keystore escolhe um IV novo a cada cifra (nunca repete)
                .build());
            kg.generateKey();
        }
        return (SecretKey) ks.getKey(ALIAS, null);
    }

    /** Apaga a chave (usado quando ela ficou inválida). */
    public static void reset() {
        try { KeyStore ks = KeyStore.getInstance(PROVIDER); ks.load(null); ks.deleteEntry(ALIAS); } catch (Exception ignored) { }
    }

    @Override
    public byte[] encrypt(byte[] plain) {
        if (available()) {
            try {
                Cipher c = Cipher.getInstance(TRANSFORM);
                c.init(Cipher.ENCRYPT_MODE, key());
                byte[] iv = c.getIV(), ct = c.doFinal(plain);
                byte[] out = new byte[1 + iv.length + ct.length];
                out[0] = KEYSTORE;
                System.arraycopy(iv, 0, out, 1, iv.length);
                System.arraycopy(ct, 0, out, 1 + iv.length, ct.length);
                return out;
            } catch (java.security.InvalidKeyException e) {
                reset();                                   // chave invalidada/inutilizável: recria na próxima vez (inclui KeyPermanentlyInvalidatedException)
            } catch (java.security.UnrecoverableKeyException e) {
                reset();
            } catch (Exception e) {
                // falha momentânea de cifra: este snapshot vai sem cifra, mas a chave (e os snapshots antigos) são mantidos
            }
        }
        byte[] out = new byte[1 + plain.length];
        out[0] = PLAIN;
        System.arraycopy(plain, 0, out, 1, plain.length);
        return out;
    }

    @Override
    public byte[] decrypt(byte[] data) throws Exception {
        if (data == null || data.length < 1) throw new IllegalArgumentException("vazio");
        if (data[0] == PLAIN) { byte[] o = new byte[data.length - 1]; System.arraycopy(data, 1, o, 0, o.length); return o; }
        if (data[0] != KEYSTORE || data.length < 1 + 12 + 16) throw new IllegalArgumentException("formato");
        try {
            Cipher c = Cipher.getInstance(TRANSFORM);
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, data, 1, 12));
            return c.doFinal(data, 13, data.length - 13);
        } catch (javax.crypto.BadPaddingException e) {
            throw e;                                       // dado alterado/corrompido (AEAD): a chave está boa, NÃO apagar (o outro slot ainda pode ser lido)
        } catch (java.security.GeneralSecurityException e) {
            reset();                                       // chave invalidada/perdida: o snapshot antigo não é recuperável
            throw e;
        }
    }
}
