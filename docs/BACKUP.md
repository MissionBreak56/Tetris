# Backup e restauração

## Formatos
* **`.tmb` (novo, v2)** — *Tetris Mission Backup*. Arquivo de texto (JSON):
```
{ "format":"TMB", "fv":2, "app":"tetris", "appVersion":"1.8.2", "engine":"E3", "created":<ms>, "scope":"all"|"profile",
  "enc": null | { "alg":"AES-256-GCM", "kdf":"PBKDF2-HMAC-SHA256", "iter":600000, "salt":"<b64 16 bytes>", "iv":"<b64 12 bytes>" },
  "body":"<b64: JSON dos dados | texto cifrado + tag>", "sha256":"<hex SHA-256(cabeçalho || body)>" }
```
  O conteúdo é `{type:'tetris-backup-data', scope, data:{global, profiles}}` — os **mesmos dados** do backup antigo, validados pelo **mesmo** validador.
* **JSON antigo (v1)** — continua sendo exportado e importado (nada foi removido). `Backup.parse` recusa `.tmb` com mensagem clara.

## Criptografia (backup protegido por senha)
* Chave: **PBKDF2-HMAC-SHA256**, **600.000 iterações**, **salt aleatório de 16 bytes** por backup → 32 bytes. Cifra: **AES-256-GCM**, nonce (`iv`) **aleatório de 12 bytes novo a cada backup**
  (o salt também é novo, então a chave é nova: nunca há nonce repetido com a mesma chave).
* O cabeçalho entra como **dado autenticado (AAD)**: mudar escopo/versão/data/parâmetros invalida a decifragem, mesmo que o checksum seja recalculado.
* Senha: 8 a 128 caracteres, normalizada (NFKC); **nunca** é gravada nem enviada; a chave é zerada na memória depois do uso (melhor esforço).
* **Não usa o Android Keystore** (chaves do Keystore não saem do aparelho): o backup restaura **em outro aparelho** com a senha certa.
* Senha errada / arquivo alterado → "Senha incorreta ou arquivo alterado" (GCM não distingue) e **nada é tocado**.
* Limites contra arquivo malicioso: iterações aceitas entre 100.000 e 3.000.000, salt/iv com tamanho exato, texto até 9 MB, conteúdo até 7 MB.
* **Sem senha** o `.tmb` é só **íntegro** (checksum SHA-256), **não é sigiloso** — a tela avisa. Ele contém, entre outros dados, os registros de PIN dos perfis (salgados, PBKDF2); um PIN de 4 dígitos continua tendo só 10.000 combinações, por isso use senha.

## Exportar
Tela *Backup → Backup protegido por senha (.tmb)…*: exportar tudo ou só o perfil atual (sem PIN e sem o ranking global), com ou sem senha. Antes de exportar os dados
passam pelo validador; depois de cifrar, o conteúdo é decifrado de volta para conferir.

## Importar / restaurar (RestoreManager)
1. Validação do formato, versão, cabeçalho, parâmetros, **checksum** e (se houver) senha → **prévia** (data, perfis, partidas, recordes…). Nada foi alterado ainda.
2. **Tudo (`scope: all`)**: restauração **transacional** (`Backup.restore`): snapshot durável do estado atual + marca "restaurando" → apaga/grava → **confere de volta** →
   se algo falhar, **rollback** automático (os dados anteriores voltam). Se o app morrer no meio, na próxima abertura `Backup.recoverInterrupted()` volta ao estado de antes.
3. **Perfil (`scope: profile`)**: entra como **perfil novo** (id novo, nome único "Nome (2)", PIN não é importado), só aparece na lista depois de gravar e conferir todos os
   dados; falha → nada fica para trás. Respeita o limite de perfis.
4. Mais um nível: *Desfazer* (`prevbackup`) continua existindo.

## Compatibilidade
Backups v1 e `.tmb` v2 se restauram; `.tmb` de formato mais novo (`fv > 2`) é recusado com pedido de atualizar o app.
