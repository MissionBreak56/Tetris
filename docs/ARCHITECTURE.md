# Arquitetura do Tetris (Android + WebView)

O app é uma `WebView` (`MainActivity.java`) que carrega `app/src/main/assets/index.html`.
Todo o jogo é JavaScript puro, **sem dependências**, dividido em scripts clássicos carregados em ordem
(escopo global compartilhado; a ordem das `<script>` em `index.html` é a ordem de dependência).

## Camadas e módulos

| Camada | Arquivo | Responsabilidade / interface pública |
|---|---|---|
| Persistência | `js/storage.js` | `Store` (get/set/getJSON/setJSON por perfil; `g*` para chaves globais), `LS/SV`, `Store.register(chave)`; detecção de falhas e gravação verificada (ver [STORAGE.md](STORAGE.md)) |
| Perfis | `js/profiles.js` | `Profile` (create/rename/remove/switchTo). Perfil `p1` usa as chaves antigas `tetris_*` |
| Utilitários de UI | `js/ui.js` | `h()` (DOM seguro), `Sheet` (folhas), `Confirm`, `Hub` (menu), formatadores |
| Regras | `js/rules.js` | `rulesFor(modo, opts)`, `mkRng(semente)` — regras declarativas por modalidade |
| Motor | `js/core/engine.js` | Estado `G`, peças, `move/rotate/hardDrop/hold/lockPiece`, T-Spin, habilidades |
| Fluxo | `js/core/flow.js` | `startGame/pauseGame/resumeGame/gameOver/leaveGame`, `update(dt)` (passo fixo `STEP`) |
| Ações | `js/actions.js` | `act(código)` — **única** porta de entrada de ações do jogador (conta APM e grava replay) |
| Renderização | `js/core/renderer.js` | Layout (`L`, `CELL`), desenho no Canvas. Só lê estado, nunca altera regras |
| Skins/Temas | `js/skins.js`, `js/themes.js` | `Skins.draw`, `Theme` (validação, editor, import/export) |
| Áudio | `js/core/audio.js` | `tone(...)` por categoria (`sfx`/`music`) com volumes independentes |
| Entrada | `js/core/input.js`, `js/controls.js` | Loop de passo fixo, teclado, gestos; `Controls` (sensibilidade/botão de pausa) |
| Dados de jogo | `js/stats.js`, `js/history.js`, `js/achv.js`, `js/rewards.js`, `js/daily.js`, `js/ranking.js` | Estatísticas, histórico/recordes/resultados, conquistas, missões, desafio diário, ranking, análises |
| Replays | `js/replay.js` | `Replays` (gravar/verificar/simular/importar/exportar), `Replay` (reprodução) |
| Modos | `js/modes.js`, `js/tutorial.js` + extras | Registro de modos (`Modes.add`), tutorial |
| Online (LAN) | `js/net.js`, `Versus` (modo `net`), `network/LanNet.java` | `Net` (lobby, protocolo, lockstep), `Lan` (ponte), `LanNet` (sockets TCP + descoberta UDP). Ver `docs/ONLINE.md` |
| Android | `js/native.js` + `core/GameBridge.java` | `Native` (compartilhar, salvar/abrir arquivo). Fora do Android usa alternativas de navegador |
| Aplicação | `js/core/app.js`, `js/core/config.js` | Ligação dos botões da tela inicial, inicialização, constantes e configurações |

## Regras de dependência
1. **Motor não conhece interface**: o motor (`engine/flow`) só chama funções de efeito (`sfx.*`, `showMsg`, `vib`) que são
   silenciadas quando `SIM` é verdadeiro. Resultado das regras **nunca** depende de tela, som, skin, tema ou `Math.random` visual.
2. **Aleatoriedade de jogo** usa somente `G.rng` (semente por partida). `Math.random` é permitido só em efeitos visuais.
3. **Toda ação do jogador** passa por `act()` (teclado, gesto, IA, replay). Assim ela é contada, gravada e reproduzível.
4. **Armazenamento** só via `Store`. Chaves de perfil devem ser registradas (`Store.register`) para exclusão/backup.
5. Qualquer mudança que altere o resultado de uma partida exige **incrementar `ENGINE_VERSION`** (`js/replay.js`);
   o teste *GOLDEN* em `tests/replay.test.js` falha caso o motor mude sem isso.
6. Módulos novos registram menus com `Hub.add` / `Modes.add` em vez de editar o código central.
7. Módulos adicionados na v1.7: `js/music.js` (trilhas e andamento), `js/perf.js` (economia/automático), `js/lock.js` (PIN e bloqueio), `js/social.js` (revanche, placar e emotes), `js/ghost.js` (fantasma do recorde), `js/rewards.js` (estrelas ganhas/gastas). v1.7.1: `js/update.js` + `AppUpdate.java` (atualização dentro do app, `docs/UPDATES.md`).

## Testes
`node --test tests/*.test.js` carrega os scripts reais em Node com um DOM simulado (`tests/harness.js`).
O CI roda os testes a cada push/PR e só compila o APK se passarem.

---

# Refatoração incremental (branch `refactor/foundation-incremental`)

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
