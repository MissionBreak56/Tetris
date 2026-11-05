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

## Ping e atraso de entrada automático
No lobby (e durante a partida) os aparelhos trocam `p`/`pong` com carimbo de tempo e medem o RTT (mediana mostrada na tela, últimas 12 medidas).
Ao iniciar, o anfitrião calcula o atraso de entrada `D = ceil(RTT_p90 / 2 / 16,67 ms) + 3` (mínimo 6, máximo 24 ticks) e envia no `start`.
RTT de 100 ms ⇒ D = 6 (≈100 ms de atraso de entrada); 400 ms ⇒ D = 15 (≈250 ms). Sem medições, D = 8.
O ping aparece no topo durante a partida. Latências acima de ~500 ms ficam difíceis de jogar, mas nunca dessincronizam.

## Arquitetura
- **Camada de rede** (`LanNet.java`, Java puro, testado na JVM): anfitrião = `ServerSocket` TCP 47600 + anúncio por broadcast UDP (47601)
  até alguém conectar; cliente = `scan` (escuta anúncios) ou `join` por IP. Uma única conexão; mensagens em **linhas UTF-8**
  (limite 16 KB; excedeu = conexão fechada). `MainActivity` expõe `lanHost/lanScan/lanJoin/lanSend/lanClose/lanIp` ao JavaScript
  e mantém um `MulticastLock` durante a busca.
- **Protocolo** (`js/net.js`, JSON por linha): `hello{p,eng,name}` / `nack` / `start{seed,D}` / `again` / `in{u,e}` / `h{t,h}` / `p` / `bye`.
  Nada além de `hello` é aceito antes do aperto de mão; valores são validados (inteiros, limites, nomes sanitizados).
- **Sincronização lockstep**: os dois aparelhos simulam **os dois tabuleiros** com a mesma semente (motor determinístico, ver replays).
  Uma ação local vale **D = 8 ticks** no futuro (≈133 ms) e é enviada na hora; a mensagem `in` carrega as ações novas e a promessa
  `u` ("não haverá ação minha antes do tick u"). Um aparelho só executa o tick *t* quando o oponente já prometeu até *t* — se a rede
  atrasar, o jogo espera (stall) e retoma sem divergir. Não há pausa online.
- **Detecção de divergência**: a cada 120 ticks (2 s) cada lado envia o hash dos dois tabuleiros; hash diferente encerra a partida
  ("dessincronizaram") sem registrar estatística. Mensagens inválidas ou atrasadas também abortam.
- **Queda de conexão**: sem mensagens por 7 s (ou soquete fechado) o outro lado vence. Há `ping` a cada ~1 s.
- **Resultado**: modo 10 ("Online (rede local)") nas estatísticas/conquistas do perfil local; fora do ranking oficial e sem replay.

## Testes
`tests/net.test.js` simula dois aparelhos com uma rede falsa (latência 0 a 25 quadros, jitter, corte, adulteração, mensagens inválidas, desistência,
revanche) e confere tabuleiros idênticos; `tests/java/LanNetTest.java` testa sockets, ordem, UTF-8, limite de linha, recusa do segundo cliente,
descoberta UDP e erros (roda no CI).
