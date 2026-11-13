# Modo online em rede local

Dois aparelhos Android no **mesmo Wi-Fi (ou hotspot)** jogam Versus um contra o outro. Não usa internet nem servidor externo.

## Como usar
1. Um jogador abre **ONLINE → Criar sala** (aparece o IP dele).
2. O outro abre **ONLINE → Procurar salas** (a sala aparece sozinha) ou digita o IP em **Conectar por IP**.
3. O anfitrião toca em **Iniciar partida**. Perde quem topar primeiro; desistir (botão de pausa/voltar) dá a vitória ao outro.
4. No fim, **Retry** pede revanche (o anfitrião inicia). **Home** encerra a conexão.

Requisitos: mesma versão do app nos dois aparelhos (o aperto de mão compara protocolo e `ENGINE_VERSION`), Wi-Fi sem isolamento de clientes
("AP isolation" desligado). Faixas aceitas: redes privadas (10.x, 172.16–31.x, 192.168.x, 169.254.x) e de VPN (Tailscale 100.64–127.x, Hamachi 25.x).

## Jogar à distância com VPN
Qualquer VPN que coloque os dois celulares na mesma rede virtual serve (Tailscale, ZeroTier, WireGuard, Hamachi...):
1. Os dois entram na mesma rede da VPN.
2. O anfitrião toca em **Criar sala**: a tela lista **todos os IPs do aparelho** com o nome da interface (ex.: `wlan0`, `tun0`, `tailscale0`); ele passa o IP da interface da VPN.
3. O outro usa **Conectar por IP** (a busca automática não atravessa VPN, pois o broadcast UDP não é repassado).

A porta TCP 47600 precisa estar liberada na VPN (por padrão está).

## Ping
No lobby e durante a partida os aparelhos trocam `p`/`pong` com carimbo de tempo e medem o RTT (mediana das últimas 12 medidas), mostrado no lobby e no topo da partida.
Não há mais "atraso de entrada" fixo: o ping só afeta o quão rápido você *vê* as jogadas do oponente (≈ RTT/2) e quantas correções ocorrem.
Acima de ~500 ms de ida o jogo espera o oponente (janela de previsão) — mesmo assim nunca dessincroniza.

## Tela
No online **cada jogador vê só a sua tela**, em tela cheia, igual ao modo solo (tabuleiro grande, Hold, Next, pontuação, mensagens de TETRIS/T-SPIN/COMBO e os mesmos gestos).
O que é específico da partida online:
- uma **miniatura do tabuleiro do oponente** na coluna esquerda, abaixo do Hold (pilha, peça atual, lixo a caminho e K.O.). Dá para desligar em **Ajustes → Miniatura do oponente (online)**;
- uma **barra vermelha** na margem esquerda da sua moldura mostrando quantas linhas de lixo estão a caminho;
- "vs Nome · ping" sob a pontuação e **WIN / K.O.** sobre o seu tabuleiro ao final.
O Versus local (contra a IA ou dois jogadores no mesmo aparelho) continua com a tela dividida.

## Arquitetura
- **Camada de rede** (`LanNet.java`, Java puro, testado na JVM): anfitrião = `ServerSocket` TCP 47600 + anúncio por broadcast UDP (47601)
  até alguém conectar; cliente = `scan` (escuta anúncios) ou `join` por IP. Uma única conexão; mensagens em **linhas UTF-8**
  (limite 16 KB; excedeu = conexão fechada). `MainActivity` expõe `lanHost/lanScan/lanJoin/lanSend/lanClose/lanIp` ao JavaScript
  e mantém um `MulticastLock` durante a busca.
- **Protocolo** (`js/net.js`, versão 3, JSON por linha): `hello{p,eng,name}` / `nack` / `start{seed}` / `again` / `in{u,e}` / `h{t,h}` / `p{t}` / `pong{t}` / `bye`.
  Nada além de `hello` é aceito antes do aperto de mão; valores são validados (inteiros, limites, nomes sanitizados). Versão de protocolo diferente é recusada.
- **Sincronização por previsão com correção (rollback)** — latência dos seus comandos ≈ 0:
  os dois aparelhos simulam **os dois tabuleiros** com a mesma semente (motor determinístico, ver replays). Suas ações valem **no próximo tick**
  (≤ 16 ms) e são enviadas **no instante do toque**. O tabuleiro do oponente é *previsto* sem ação nova; quando uma ação dele chega com tick
  já simulado, o jogo volta ao *snapshot* daquele tick e re-simula em silêncio até o presente (sem repetir som/efeitos). A mensagem `in`
  carrega as ações novas e a promessa monotônica `u` ("não haverá ação minha antes do tick u+1"). Janela: o jogo só prevê até 30 ticks (≈ 0,5 s)
  além do que o oponente já confirmou (depois espera) e guarda 40 snapshots. Custo medido: ~0,3–1 ms por correção com latências de rede local.
- **Fim de partida confirmado**: derrota/vitória só vale quando todas as ações anteriores ao fim são conhecidas; o estado final vem do snapshot
  do tick do fim, idêntico nos dois aparelhos (um topo "previsto" que depois some com uma ação atrasada é desfeito).
- **Detecção de divergência**: a cada 120 ticks cada lado envia o hash do estado **confirmado** (o grid entra só como ocupação 0/1: as cores vêm do tema de cada aparelho e podem diferir) (a partir dos snapshots) dos dois tabuleiros;
  hash diferente encerra a partida ("dessincronizaram") sem registrar estatística. Mensagens inválidas, fora de ordem ou além da janela também abortam.
- **Queda de conexão**: sem mensagens por 7 s (ou soquete fechado) o outro lado vence. `p`/`pong` a cada ~0,5 s (lobby) / ~1 s (partida) medem o ping mostrado na tela.
- **Baixa latência no Android**: `TCP_NODELAY` + `IPTOS_LOWDELAY`, e `WifiLock` em modo de baixa latência (`WIFI_MODE_FULL_LOW_LATENCY`, Android 10+; `HIGH_PERF` antes)
  enquanto houver sala/partida (permissão `WAKE_LOCK`).
- **Resultado**: modo 10 ("Online (rede local)") nas estatísticas/conquistas do perfil local; fora do ranking oficial e sem replay.

## Testes
`tests/net.test.js` simula dois aparelhos com uma rede falsa (latência 0 a 25 quadros, jitter, corte, adulteração, mensagens inválidas, desistência,
revanche) e compara cada partida com uma **simulação de referência offline** alimentada pelo registro real das ações (mesmo hash final, mesmos ticks e vencedor); `tests/java/LanNetTest.java` testa sockets, ordem, UTF-8, limite de linha, recusa do segundo cliente,
descoberta UDP e erros (roda no CI).
