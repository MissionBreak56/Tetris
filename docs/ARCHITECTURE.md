# Arquitetura

O app é um **motor de Tetris em JavaScript + Canvas** (`app/src/main/assets`) dentro de uma **WebView Android**. Esta refatoração
(branch `refactor/foundation-incremental`) separa as responsabilidades que ficavam todas em `MainActivity.java`, **sem mudar o
comportamento** e sem tocar no motor do jogo, nas regras, nos replays determinísticos, no protocolo LAN nem na interface.

## Antes
`MainActivity.java` (≈290 linhas) fazia tudo: configurava a WebView, expunha a ponte `AndroidBridge` (como classe interna), mexia em
travas de Wi-Fi, abria/gravava arquivos, instalava o APK, registrava receptores e guardava `LanNet`/`AppUpdate`.

## Depois (Java, `com.missionbreak56.tetris`)
| Pacote / classe | Responsabilidade |
|---|---|
| `MainActivity` | Só cria a WebView, liga as peças abaixo e encaminha ciclo de vida/Back. |
| `core/WebViewConfigurator` | Configuração e **segurança** da WebView (JS ligado, DOM Storage, sem acesso a arquivos/conteúdo, sem conteúdo misto, Safe Browsing, allowlist de navegação e de recursos, recuperação se o renderer morrer). |
| `core/GameBridge` | Objeto `AndroidBridge` (mesmos métodos públicos de antes — contrato com o JS) com **validação de todos os argumentos**; trata o seletor de arquivos; snapshots. |
| `core/AppLifecycleManager` | Travas de Wi-Fi (multicast/baixa latência) e o estado "destruída": depois de `onDestroy` nenhuma thread volta a chamar a WebView. |
| `updates/AppUpdate` | Procurar e baixar a atualização (GitHub Releases) com checksum SHA-256, HTTPS e verificação de assinatura. |
| `updates/UpdateInstaller` | Instalar o APK com o `PackageInstaller` (verifica de novo na hora). |
| `network/LanNet` | Rede local (TCP + anúncio UDP). Movido de pacote, **sem mudar o protocolo**. |
| `storage/StorageManager`, `storage/SnapshotManager` | Arquivos atômicos e snapshots em 2 slots (ver [STORAGE.md](STORAGE.md)). |
| `security/*` | `CryptoManager` (Android Keystore), `IntegrityManager` (SHA-256/contêiner), `BridgeValidator`, `NavigationPolicy`, `SignerPolicy`, `ApkSignatureVerifier`, `ApkVerifier`. As classes **sem dependência do Android** são testadas na JVM. |

Correções de ciclo de vida: callbacks (rede, atualização, gravação de snapshot) conferem `AppLifecycleManager.alive()`; `onDestroy`
fecha rede/atualização/receptores e zera a referência da WebView; `configChanges` evita recriar a Activity em mudanças de
tema/idioma/densidade; se o processo de renderização morrer, a tela é recriada em vez de derrubar o app; a gravação de arquivos
fecha os fluxos mesmo em caso de erro.

## JavaScript (`assets/js`)
Mesmo desenho de antes (scripts globais carregados por `index.html`), com módulos novos:
`crypto.js` (CryptoManager), `snapshot.js` (SnapshotManager), `backup_tmb.js` (BackupManager/RestoreManager), `migration.js`
(MigrationManager). `Store` (storage.js) ganhou detecção de falhas. `profiles.js` ganhou o PIN novo.

Ordem de carga: `crypto → storage → … → profiles → … → backup → snapshot → backup_tmb → migration → … → core/app`. Na abertura
(`core/app.js`, bloco INIT) roda `MigrationManager.boot()`.

## Decisões e adaptações ao pedido
* O prompt sugere `StorageManager/MigrationManager/SnapshotManager/BackupManager/RestoreManager` em Java. Os dados do jogo vivem no
  `localStorage` da WebView e a lógica já é JavaScript (e testável com `node --test`), então **migração, backup e restauração ficaram em
  JavaScript**; o que realmente precisa ser nativo (arquivos atômicos fora do `localStorage`, Keystore) ficou em Java.
* Não foram adicionadas dependências (nada de Room/DataStore/Compose/Kotlin).
* `PinSecurityManager.java`: o PIN é verificado em JavaScript (interface síncrona, testes existentes), então não há classe Java para ele.
* Não existe `ApkSignatureVerifier` para "assinar": o app **nunca** contém chave privada; só compara certificados públicos.

## Testes
`node --test tests/*.test.js` (JavaScript) e as classes Java puras em `tests/java` (ver o workflow `.github/workflows/release.yml`).
