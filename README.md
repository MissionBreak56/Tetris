# Tetris — código próprio

Tetris para Android feito do zero, sem anúncios e sem rede, inspirado nas regras observadas na análise do APK Tetris 1.0.16.

- Grade 10×20, sorteio 7-bag, hold, peça-fantasma, T-Spin e Back-to-Back
- Gravidade pela tabela de quadros (níveis 1–30)
- Tela inicial neon (CLASSIC, 2 MINUTES, STRATEGY, LEVEL, THEME, GHOST, MUSIC, SOUND) que acompanha o tema escolhido
- Modos: **Maratona**, **2 Minutos** e **Estratégia** (bloco-pergunta com 9 habilidades: BLUR, EROSION, FISSION, FUSION, INVASION, SHIFT, SPEED_UP, TURN, TWIST)
- Sons e música sintetizados (WebAudio), 4 temas, recordes salvos no aparelho
- Android 6.0+ (minSdk 23). O jogo é um HTML/Canvas em `app/src/main/assets/index.html` dentro de uma WebView

## Controles
Toque gira (o lado escolhe o sentido) · arrastar move · arrastar para baixo = queda suave · deslizar para baixo = queda dura · deslizar para cima = hold · Voltar = pausa.
Teclado: setas, Z/X girar, Espaço queda dura, C hold, P pausa.

## Build
O APK é compilado pelo GitHub Actions ao enviar uma tag `v*` (ver `.github/workflows/release.yml`).

## Testes
Testes de regressão da lógica do jogo (colisões, movimento, rotação, 7-bag, hold, ghost, linhas, pontuação, T-Spin, Back-to-Back, modos, persistência e controles). Carregam o `index.html` real em Node com DOM simulado e semente fixa — não exigem dependências:

```
node --test tests/*.test.js
```
O CI roda os testes em todo push/PR e só compila o APK se passarem.
