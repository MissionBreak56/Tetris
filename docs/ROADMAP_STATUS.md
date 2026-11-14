# Status do roadmap (Etapas 00–30)

| Etapas | Entrega | Principais arquivos |
|---|---|---|
| 00–01 | Auditoria e testes de regressão (Node + DOM simulado) | `tests/harness.js`, `tests/regression.test.js` |
| 02–04 | Estatísticas, histórico (100 últimos), tela de resultados (gravação única) | `js/stats.js`, `js/history.js` |
| 05 | Conquistas derivadas das estatísticas | `js/achv.js` |
| 06 | Controles personalizáveis (botão de pausa, sensibilidades) | `js/controls.js`, `js/settings.js` |
| 07 | Áudio por categoria com volumes | `js/core/audio.js`, `js/settings.js` |
| 08 | Pausa completa (resumo, ajustes rápidos, timers em tempo de jogo) | `js/core/flow.js` |
| 09 | Feedback de pontuação (tipos, PERFECT CLEAR, COMBO, modo sem efeitos) | `js/core/app.js` |
| 10 | Tutorial interativo no motor real | `js/tutorial.js` |
| 11–13 | Zen, Sprint 40 e auditoria do Ultra (2 Minutes) | `js/rules.js`, `js/modes.js` |
| 14–15 | Desafio diário determinístico, missões e recompensas idempotentes | `js/daily.js`, `js/missions.js` |
| 16–17 | Skins e editor de temas com validação de contraste | `js/skins.js`, `js/themes.js` |
| 18 | Perfis (p1 mantém as chaves antigas) | `js/profiles.js` |
| 19 | Camada única de ações; passo fixo (a tela de Análises PPS/APM foi removida do menu) | `js/actions.js` |
| 20 | Ranking local por perfil (só modos oficiais; top 10 de cada perfil) | `js/ranking.js` |
| 21–22 | Replays determinísticos, export/import, ponte Android | `js/replay.js`, `js/native.js`, `MainActivity.java` |
| 23 | Modularização + arquitetura | `js/core/*`, `docs/ARCHITECTURE.md` |
| 24 | Testes de robustez/fuzz | `tests/robustness.test.js` |
| 25 | Otimização do Canvas com benchmark | `docs/PERFORMANCE.md`, `tools/bench.py` |
| 26 | Desafios personalizados | `js/custom.js` |
| 27–28 | IA (3 níveis) e Versus local | `js/ai.js`, `js/versus.js` |
| 29 | Torneios | `js/tournament.js` |
| 30 | Backup/restauração transacional | `js/backup.js` |

| extra | Modo online em rede local (lockstep determinístico) | `js/net.js`, `LanNet.java`, `docs/ONLINE.md` |

## Decisões e correções registradas
- **S em rotação 2 virava Z** (defeito original): corrigido; `ENGINE_VERSION` = `E2`. Teste de geometria cobre todas as peças.
- `lastRot` não é limpo ao mover/cair (possível T-Spin falso após girar e mover): **mantido** (caracterização em teste), pendente de decisão.
- "2 Minutes" já é o modo Ultra; não foi criado modo duplicado.
- A tela LEVEL (engrenagem) virou o menu geral (nível inicial, modos, estatísticas, temas, perfis, backup...).
- Versus não grava replays; tutorial não grava nada; Zen/diário/personalizado/versus não entram no ranking oficial.
- Aleatoriedade de jogo usa `G.rng` por partida; `Math.random` ficou só para efeitos visuais.
- **Animações por tabuleiro (v1.5.2):** `updateFx` só suavizava o `G` global (= tabuleiro 0). No online o cliente (tabuleiro 1) via a peça ativa parada na coluna de nascimento e a 35% de opacidade, a pontuação travada em 0 e sem animação de queda de linhas; o mesmo ocorria no 2º tabuleiro do Versus local. Agora `smoothBoard` roda para todos os tabuleiros em jogo e os campos visuais (`disp`, `rowOff`, `overT`, `note`, `dx`, `age`) ficam fora dos snapshots do rollback.
- **Interface temática (v1.6.0):** janelas/painéis, botões, textos, valores em destaque e botões da tela inicial seguem o tema por variáveis CSS (`--p1/--p2` painel, `--b1/--b2` botões, `--btnbg` botões pequenos, `--ink/--dim/--val` textos). Cada tema (4 embutidos + personalizados) tem 8 cores de interface editáveis no editor de temas, com pré-visualização do painel e validação de contraste (texto ≥ 4,5:1 no painel). Temas personalizados antigos recebem cores derivadas do destaque (sempre legíveis). O tema ativo fica em cache (`Theme.invalidate()` ao trocar/salvar/excluir).

