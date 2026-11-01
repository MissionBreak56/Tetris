# Desempenho do Canvas — auditoria e resultados (Etapa 25)

Medido com `tools/bench.py` (Chromium headless, viewport 411×890, DPR 3, renderização por software, mediana de 3 execuções de 300 quadros).
O número absoluto em ms depende da máquina; o **número de operações de Canvas por quadro** é independente do aparelho.

| Cenário | Antes | Depois |
|---|---|---|
| Tela inicial | 33,3 ms · 533 ops | **3,0 ms · 117 ops** |
| Jogo com 12 linhas de blocos | 38,3 ms · 1686 ops | **4,1 ms · 226 ops** |
| Jogo pausado | 37,6 ms · 1686 ops | **4,4 ms · 226 ops** (e só 1 em cada 4 quadros é desenhado) |

## Gargalos encontrados
1. **Blocos**: cada bloco fazia ~10 operações (5 preenchimentos, 4 polígonos, 1 traço) × ~200 blocos por quadro.
2. **Gradientes/brilho recriados todo quadro**: fundo (2 gradientes de tela cheia), moldura com `shadowBlur`, tabuleiro e 30 linhas da grade.
3. **Cores recalculadas** (`shade()` montava strings a cada bloco).
4. **Estrelas**: 44 `arc+fill` individuais.
5. **Resolução**: DPR até 3 preenche 2,25× mais pixels que DPR 2.
6. **Quadros inúteis**: pausa e folhas de menu redesenhavam 60 fps sem movimento.

## Correções (todas só visuais; regras e replays não mudam)
- `Skins.sprite`: cada bloco é pré-renderizado uma vez por (skin, cor, tamanho) e desenhado com `drawImage`.
- `layer()`: fundo e moldura/grade em canvases offscreen, refeitos só quando tema/tamanho mudam; durante o pulso de pontuação a moldura volta ao desenho direto.
- `shade()` com cache. Estrelas agrupadas em 4 níveis de brilho (4 caminhos em vez de 44).
- `DPR_MAX = 2`.
- `idleSkip()`: pausa desenha 1 de 4 quadros; folha de menu aberta, 1 de 2.

## Mantendo
- Não criar objetos/strings por bloco dentro de `render()`; use os caches acima.
- Mudou algo visual no fundo/moldura? Inclua o dado novo na **chave** da camada em `drawBackground`/`drawFrame`.
