# Tetris para iPhone

O jogo é o mesmo do Android (HTML/Canvas/JS em `app/src/main/assets`), dentro de um `WKWebView`. O app serve os arquivos pelo esquema
`tetris://localhost/` (origem estável: os dados salvos continuam os mesmos entre atualizações) e expõe ao JavaScript o mesmo objeto
`AndroidBridge` do Android, implementado em Swift:

| Recurso | Implementação |
|---|---|
| Online em rede local | `LanNet.swift` (porta da classe Java `LanNet`, mesmo protocolo: iPhone e Android jogam entre si) |
| Vibração | `UIImpactFeedbackGenerator` (o iOS não tem `navigator.vibrate`) |
| Compartilhar, salvar e abrir arquivos | `UIActivityViewController` e `UIDocumentPickerViewController` |
| Bateria / economia de energia | `UIDevice` + `ProcessInfo.isLowPowerModeEnabled` |
| Tela sempre ligada, sem barra de status | `isIdleTimerDisabled`, `prefersStatusBarHidden` |

## Instalar
A release traz `Tetris-vX.Y.Z.ipa` **sem assinatura** (não há conta paga da Apple no projeto). Instale com **AltStore** ou **Sideloadly**
(eles assinam com o seu Apple ID; com conta gratuita o app precisa ser reassinado a cada 7 dias).

## Limitações no iPhone
- **Atualização dentro do app**: não existe (o iOS não permite). Baixe o novo `.ipa` na release e instale de novo.
- **Buscar salas automaticamente** usa broadcast UDP, que o iOS só libera para apps com um entitlement especial da Apple. Sem ele a busca pode não achar nada: crie a sala num aparelho e **entre digitando o IP** no outro (isso funciona normalmente). O iOS pede a permissão de "Rede local" na primeira vez.
- Apps de iPhone só mantêm a conexão com o app aberto; se o app for para segundo plano a partida online cai (e o reconexão automática tenta voltar).

## Compilar
O CI (`.github/workflows/ios.yml`, runner macOS) gera o projeto com [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`ios/project.yml`) e compila o IPA.
Localmente num Mac: `brew install xcodegen && cd ios && xcodegen generate && open Tetris.xcodeproj`.
