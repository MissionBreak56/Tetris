# Arquitetura do Tetris (Android + WebView)

O app é uma `WebView` (`MainActivity.java`) que carrega `app/src/main/assets/index.html`.
Todo o jogo é JavaScript puro, **sem dependências**, dividido em scripts clássicos carregados em ordem
(escopo global compartilhado; a ordem das `<script>` em `index.html` é a ordem de dependência).

## Camadas e módulos

| Camada | Arquivo | Responsabilidade / interface pública |
|---|---|---|
| Persistência | `js/storage.js` | `Store` (get/set/getJSON/setJSON por perfil; `g*` para chaves globais), `LS/SV`, `Store.register(chave)` |
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
| Dados de jogo | `js/stats.js`, `js/history.js`, `js/achv.js`, `js/missions.js`, `js/daily.js`, `js/ranking.js`, `js/analysis.js` | Estatísticas, histórico/recordes/resultados, conquistas, missões, desafio diário, ranking, análises |
| Replays | `js/replay.js` | `Replays` (gravar/verificar/simular/importar/exportar), `Replay` (reprodução) |
| Modos | `js/modes.js`, `js/tutorial.js` + extras | Registro de modos (`Modes.add`), tutorial |
| Android | `js/native.js` + `MainActivity.java` | `Native` (compartilhar, salvar/abrir arquivo). Fora do Android usa alternativas de navegador |
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

## Testes
`node --test tests/*.test.js` carrega os scripts reais em Node com um DOM simulado (`tests/harness.js`).
O CI roda os testes a cada push/PR e só compila o APK se passarem.
