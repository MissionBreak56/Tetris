# Armazenamento

## Camadas
1. **`Store` (storage.js)** — `localStorage` com prefixo por perfil (`tetris_` para o perfil antigo `p1`, `tetris_p2_`, … para os outros;
   chaves globais `tetris__*`). Nomes de chaves **não mudaram**. Novidades:
   * toda gravação que falha (cota/armazenamento cheio) é **contada** (`Store.errors`, `lastError`), **avisada** (`Store.onError` → aviso na tela)
     e devolve `false`: nunca se finge sucesso;
   * `Store.health()` testa gravar/ler/apagar; `setVerified/gsetVerified` gravam e **conferem lendo de volta**;
   * `Store.onWrite` marca os dados como "alterados" (para o snapshot automático).
2. **Snapshots nativos (fora do localStorage)** — ver abaixo.
3. **Backups do usuário** — `.tmb` e o JSON antigo ([BACKUP.md](BACKUP.md)).

## Snapshots
`SnapshotManager` (JS) monta `{type:'tetris-snapshot', v:1, engine, created, reason, sum, data}` com os mesmos dados do backup e entrega à ponte
(`AndroidBridge.snapshotSave` assíncrono / `snapshotSaveNow` confirmado / `snapshotLoad`). No Java:
* `StorageManager`: gravação **atômica** (arquivo temporário → `fsync` → `rename`); falha devolve `false`.
* `IntegrityManager`: contêiner `TSN1 | seq | tamanho | SHA-256 | dados`: truncado, alterado ou com lixo é recusado.
* `SnapshotManager`: **2 slots alternados** (`snap-a.bin`/`snap-b.bin`); cada gravação vai para o slot MAIS ANTIGO e só vale depois de lida de volta
  íntegra; o slot anterior fica intacto → sempre sobra um snapshot válido. Se o mais novo estiver ilegível usa o anterior.
* `CryptoManager`: o conteúdo é cifrado com **AES-256-GCM, chave no Android Keystore** (não exportável). Sem Keystore o conteúdo fica sem cifra
  (mantém a recuperação). Chave invalidada → apagada/recriada e o snapshot antigo vira ilegível (o app volta a gerar novos).
* Os snapshots ficam em `filesDir/snapshots` e **não entram** no backup automático do Android (a chave do Keystore não acompanha).

Quando são criados: ~20 s depois de gravações (no máximo 1 a cada 30 s), ao ir para segundo plano, 6 s depois de abrir o app, e **antes de cada
restauração e de cada passo de migração** (com confirmação de gravação).

Uso: (1) se o `localStorage` vier **sem dados de jogo** e houver snapshot válido, o app restaura sozinho na abertura; (2) restauração ou migração
interrompida volta ao estado anterior; (3) tela *Backup → Recuperar do snapshot do aparelho…* (manual).

## Sem snapshot nativo
Navegador/testes ou ponte antiga: tudo continua funcionando; só não há recuperação automática (e a restauração usa a cópia `prevbackup` antiga).
