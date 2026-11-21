# Segurança

## PIN dos perfis
* **Antes**: `fnv('pin|' + id + '|' + pin)` (8 hex, 32 bits, sem sal) — trivial de reverter.
* **Agora**: `v2$<iterações>$<sal base64 de 16 bytes>$<PBKDF2-HMAC-SHA256 hex>` (50.000 iterações, **sal aleatório por PIN**, parâmetros versionados no próprio registro),
  comparação em **tempo constante**. O PIN original **nunca** é gravado.
* PBKDF2 **síncrono em JavaScript puro** (`crypto.js`, validado contra o `crypto` do Node e os vetores RFC) porque a interface de PIN e os testes são síncronos.
* **Migração transparente**: um PIN antigo continua valendo; no **primeiro acerto** o registro é regravado no formato novo. Erro não altera nada. Backups antigos com PIN FNV restauram e funcionam.
* **Bloqueio persistente**: erros seguidos e bloqueio ficam gravados (`tetris__pinlock`) e sobrevivem a fechar o app. 5 erros → bloqueio de 30 s; cada bloqueio seguido **dobra** (até 15 min); acertar zera.
  Relógio mexido nunca bloqueia além do teto; chave de bloqueio corrompida é ignorada.
* **Limitação honesta**: um PIN de **4 dígitos tem só 10.000 combinações**. O hash lento + o bloqueio dificultam, mas **não é proteção criptográfica forte**: quem tiver o arquivo
  de dados pode testar os 10.000 PINs offline. Para proteger dados de verdade use o **backup com senha** e a tela de bloqueio do aparelho.
* Compatibilidade: versões antigas do app **não entendem** o PIN novo (precisam redefini-lo).

## Android Keystore
`security/CryptoManager`: chave AES-256-GCM **não exportável** (alias `tetris_snapshot_key_v1`) protege os **snapshots locais**; IV novo a cada cifra (o próprio Keystore escolhe). Tratamento de
chave inválida/perdida (apaga e recria; erro de autenticação **não** apaga a chave). Disponível a partir do Android 6 (API 23); sem ele o snapshot fica sem cifra (a recuperação é preservada).
Não é usado nos backups `.tmb` (precisam ser transferíveis).

## WebView
Mantido: JavaScript ligado (o jogo depende dele) e DOM Storage. Reforçado em `core/WebViewConfigurator` + `security/NavigationPolicy`:
* **allowlist de navegação**: só `file:///android_asset/` (sem `..`, `%2e`, `\`); `http/https/ftp/content/intent/javascript:` e `file://` fora dos assets são **bloqueados**; nenhuma URL externa abre dentro da WebView
  (o app não tem fluxo de abrir links externos — não há `window.open`/links no JS);
* **recursos**: só assets + `data:`/`blob:`/`about:blank`; qualquer requisição de rede recebe 403;
* acesso a arquivos/conteúdo desligado, `AllowFileAccessFromFileURLs`/`UniversalAccess` desligados, **conteúdo misto bloqueado**, Safe Browsing ligado, geolocalização desligada, janelas múltiplas desligadas, depuração remota desligada;
* **ponte Android**: nomes e assinaturas dos métodos **mantidos**; todo argumento é validado (`BridgeValidator`): tamanhos (arquivo 8 M caracteres, compartilhar 4 M, snapshot 12 M, linha LAN 16 K), nome de arquivo sem caminhos/controle,
  MIME em lista, porta 1–65535, IPv4 literal. **Limite técnico**: `addJavascriptInterface` expõe a ponte a todos os quadros da página e a API não informa a origem do chamador;
  a proteção é **nunca carregar conteúdo de fora** (allowlist acima), de modo que só o próprio jogo chega à ponte.
* se o renderer morrer, a tela é recriada.

## Atualização do APK
Fluxo: procurar → baixar → instalar, todos com `HTTPS` (a URL de atualização exige `https://`; só `127.0.0.1` nos testes) e:
1. **Checksum SHA-256 obrigatório**: a release publica `Tetris-vX.Y.Z.apk.sha256`; sem ele (ou inválido) o app **nem baixa** o APK; calculado durante o download e comparado em tempo constante.
2. **Tamanho**: teto de 80 MB, `Content-Length` conferido, arquivo incompleto/sem assinatura `PK` recusado e apagado.
3. **Certificado**: o conjunto de certificados (SHA-256) do APK precisa ser **idêntico** ao do app instalado (`SignerPolicy` + `ApkSignatureVerifier`), mesmo pacote e versão **não menor** (sem downgrade). APK de outro certificado é **apagado e recusado**.
   Um SHA-256 isolado não prova *quem* publicou o arquivo; o certificado prova — e é conferido **de novo** na hora de instalar. Rotação de chave exigiria atualizar a política (hoje seria recusada).
4. Nenhuma chave de assinatura no repositório: o workflow usa **GitHub Secrets** (`KEYSTORE_BASE64`, etc.). O Android ainda exige a confirmação do usuário e a permissão de "instalar apps desconhecidos".
* Limitação: o checksum vem do mesmo local do APK (GitHub); ele protege contra corrupção e troca parcial, não contra quem controla a release — por isso a verificação do **certificado** é a barreira que importa.

## Multiplayer LAN
Protocolo **inalterado** (iPhone/Android/versões anteriores continuam compatíveis). Em cima do que já existia (limite de linha de 16 KB, `sid` da partida, números de sequência com descarte de duplicata e pedido de reenvio, hash de estado, `hello` com versão):
* **limite de taxa** por conexão (balde de tokens: 200 msg/s com rajada de 400; tráfego normal é < 120/s); descarta o excesso e **desconecta** inundação sustentada (> 300 descartes em 2 s);
* **mensagens malformadas** (JSON inválido, linha grande demais, campos com tipo errado nos tipos conhecidos) são contadas: mais de 20 em 10 s → desconecta; tipos desconhecidos são ignorados (compatibilidade com versões futuras);
* ações da partida inválidas continuam **abortando** a partida (validação em `onIn`/`Versus.netRecv`);
* a camada Java valida IPv4/porta/tamanho antes de abrir qualquer conexão.

## Reportar problema
Abra uma *issue* privada no repositório ou fale com o mantenedor; não publique dados de backup.
