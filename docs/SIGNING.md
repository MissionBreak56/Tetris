# Assinatura do APK

As releases são assinadas com uma chave própria (RSA 4096, validade até 2056, alias `tetris`).
A chave **não** está no repositório: fica nos *secrets* do GitHub (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`) e o workflow
(`.github/workflows/release.yml`) a usa em todo release por tag. Se os secrets faltarem, o release por tag **falha** (nada é publicado).

**Impressão digital (SHA-256) do certificado:**
`5C:E0:5E:19:DA:1A:F0:D4:51:C6:AE:19:86:3F:C7:7D:72:34:51:AB:C6:DE:AE:9B:2D:C8:D8:B3:34:81:27:C1`

Conferir um APK baixado: `keytool -printcert -jarfile Tetris-vX.Y.Z.apk | grep SHA256`

## Importante
- **Guarde uma cópia do arquivo `tetris-release.jks` e da senha em local seguro (fora do GitHub).** Sem a chave não é possível publicar
  atualizações que o Android aceite instalar por cima do app já instalado.
- Nunca faça commit do `.jks` (já ignorado em `.gitignore`).
- Apps assinados com chaves diferentes não se atualizam entre si: quem instalou uma versão anterior à 1.3.2 (chave temporária) precisa
  desinstalar antes de instalar uma versão assinada com esta chave. A partir daí, todas as atualizações serão compatíveis.

## Recriar os secrets (se necessário)
```
base64 -w0 tetris-release.jks   # valor de KEYSTORE_BASE64
# KEYSTORE_PASSWORD = senha do keystore (a mesma da chave; alias: tetris)
```
