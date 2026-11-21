package com.missionbreak56.tetris.security;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.os.Build;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * Compara o certificado do APK baixado com o do app INSTALADO. APK de outro pacote, de outro certificado, sem assinatura,
 * ilegível ou com versão menor (downgrade) é recusado. Nunca há chave privada no app: só se comparam certificados públicos.
 */
public final class ApkSignatureVerifier implements ApkVerifier {
    private final Context ctx;

    public ApkSignatureVerifier(Context ctx) { this.ctx = ctx.getApplicationContext(); }

    @SuppressWarnings("deprecation")
    private static List<String> digests(PackageInfo pi) {
        List<String> out = new ArrayList<String>();
        if (pi == null) return out;
        Signature[] sigs = null;
        if (Build.VERSION.SDK_INT >= 28) {
            SigningInfo si = pi.signingInfo;
            if (si != null) sigs = si.hasMultipleSigners() ? si.getApkContentsSigners() : si.getSigningCertificateHistory();
            // com rotação de chave o histórico tem várias entradas; o que vale é o certificado ATUAL (último do histórico)
            if (sigs != null && !si.hasMultipleSigners() && sigs.length > 1) sigs = new Signature[] { sigs[sigs.length - 1] };
        } else {
            sigs = pi.signatures;
        }
        if (sigs != null) for (Signature s : sigs) out.add(SignerPolicy.certDigest(s.toByteArray()));
        return out;
    }

    @SuppressWarnings("deprecation")
    private static long versionOf(PackageInfo pi) { return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode; }

    @Override
    @SuppressWarnings("deprecation")
    public String verify(File apk) {
        try {
            PackageManager pm = ctx.getPackageManager();
            int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
            PackageInfo mine = pm.getPackageInfo(ctx.getPackageName(), flags);
            PackageInfo cand = pm.getPackageArchiveInfo(apk.getPath(), flags);
            if (cand == null) return "O arquivo baixado não é um APK válido";
            if (!ctx.getPackageName().equals(cand.packageName)) return "O APK é de outro aplicativo";
            if (versionOf(cand) < versionOf(mine)) return "O APK é de uma versão mais antiga que a instalada";
            if (!SignerPolicy.sameSigners(digests(mine), digests(cand))) return "A assinatura do APK não confere com a do app instalado. Atualização recusada.";
            return null;
        } catch (Exception e) {
            return "Não foi possível verificar a assinatura do APK";
        }
    }
}
