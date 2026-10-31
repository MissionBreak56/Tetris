# Tetris — código próprio

Tetris para Android feito do zero, sem anúncios e sem rede, inspirado nas regras observadas na análise do APK Tetris 1.0.16.

- Grade 10×20, sorteio 7-bag, hold, peça-fantasma, T-Spin e Back-to-Back
- Gravidade pela tabela de quadros (níveis 1–30)
- Modos: **Maratona**, **2 Minutos** e **Estratégia** (bloco-pergunta com 9 habilidades: BLUR, EROSION, FISSION, FUSION, INVASION, SHIFT, SPEED_UP, TURN, TWIST)
- Sons e música sintetizados (WebAudio), 4 temas, recordes salvos no aparelho
- Android 6.0+ (minSdk 23). O jogo é um HTML/Canvas em `app/src/main/assets/index.html` dentro de uma WebView

## Controles
Toque gira (o lado escolhe o sentido) · arrastar move · arrastar para baixo = queda suave · deslizar para baixo = queda dura · deslizar para cima = hold · Voltar = pausa.
Teclado: setas, Z/X girar, Espaço queda dura, C hold, P pausa.

## Build
O APK é compilado pelo GitHub Actions ao enviar uma tag `v*` (ver `.github/workflows/release.yml`).
