# Tetris — código próprio

Tetris para Android feito do zero, sem anúncios e sem rede, inspirado nas regras observadas na análise do APK Tetris 1.0.16.

- Grade 10×20, sorteio 7-bag, hold, peça-fantasma, T-Spin e Back-to-Back
- Gravidade pela tabela de quadros (níveis 1–30)
- Tela inicial neon com TODOS os modos (CLASSIC, 2 MINUTES, STRATEGY, ZEN, SPRINT 40, DAILY, CUSTOM, VERSUS, TORNEIO, TUTORIAL) e os botões LEVEL, THEME, GHOST, MUSIC, SOUND, que acompanha o tema escolhido
- Modos: **Classic**, **2 Minutes** (Ultra), **Strategy** (bloco-pergunta com 9 habilidades), **Zen** (sem game over), **Sprint 40**, **Desafio diário** (determinístico por data), **Desafios personalizados**, **Versus** (IA em 3 níveis ou 2 jogadores) e **Torneios** eliminatórios
- Tutorial interativo, estatísticas e análises (PPS/APM), histórico, ranking local, conquistas, missões e recompensas
- **Perfis locais** com dados isolados, **replays** determinísticos (exportar/importar com verificação), **backup/restauração** transacional
- 4 temas + **editor de temas** (validação de contraste), 4 skins de peças, controles e áudio personalizáveis
- Sons e música sintetizados (WebAudio) com volumes independentes; tudo offline e sem anúncios
- Android 6.0+ (minSdk 23). O jogo é HTML/Canvas/JS em `app/src/main/assets` (módulos em `js/`), dentro de uma WebView. Arquitetura: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Desempenho: [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md)

> Nota de versão 1.3.0: corrigida a rotação de estado 2 da peça **S**, que assumia o formato de um Z. Por isso `ENGINE_VERSION` passou a `E2` (replays de versões anteriores não são compatíveis).

## Controles
Toque gira (o lado escolhe o sentido) · arrastar move · arrastar para baixo = queda suave · deslizar para baixo = queda dura · deslizar para cima = hold · Voltar = pausa.
Teclado: setas, Z/X girar, Espaço queda dura, C hold, P pausa.

## Build
O APK é compilado pelo GitHub Actions ao enviar uma tag `v*` (ver `.github/workflows/release.yml`).

## Testes
241 testes automatizados (regras do motor, modos, replays determinísticos, IA/Versus, torneios, perfis, backup, robustez/fuzz, caches de desenho). Carregam o `index.html` real em Node com DOM simulado e semente fixa — não exigem dependências:

```
node --test tests/*.test.js
```
O CI roda os testes em todo push/PR e só compila o APK se passarem.
