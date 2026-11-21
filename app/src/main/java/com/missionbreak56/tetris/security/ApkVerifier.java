package com.missionbreak56.tetris.security;

import java.io.File;

/** Verificação de identidade/integridade de um APK baixado. Devolve null se for confiável, ou a mensagem de recusa. */
public interface ApkVerifier {
    String verify(File apk);
}
