# Migração de dados

`MigrationManager` (migration.js) guarda a **versão do esquema** em `tetris__schema` (`{v, log[], tries, pending, lastError}`); `CURRENT = 2`.

Regras (verificadas por testes em `tests/storage_security.test.js`):
* Migrações **só acrescentam/normalizam**: o `localStorage` antigo **não é apagado**, nenhuma chave é renomeada, o perfil antigo `p1`
  (prefixo `tetris_`) continua igual e os prefixos dos outros perfis são preservados.
* Cada passo roda **uma vez**, é **idempotente** e é conferido (`verify`) — ex.: o passo 2 prova que cada perfil tem o mesmo número de chaves.
* Antes de cada passo: snapshot **durável** (nativo) + cópia em memória. Passo que falha ou perde dado → `Backup.restore` volta **exatamente** ao
  estado anterior e a versão do esquema não avança.
* `pending` marca o passo em andamento: se o app fechar no meio, a próxima abertura detecta e **refaz** (no máximo 3 tentativas; depois o app segue
  com os dados atuais e registra o erro).
* Rodar de novo não faz nada; reabrir o app não migra de novo.

| Passo | De → Para | O que faz |
|---|---|---|
| `baseline-1` | 0 → 1 | Marca a instalação existente (inclusive a de antes do versionamento). Não altera nenhum dado. |
| `profiles-2` | 1 → 2 | Normaliza a lista de perfis (ids/nomes válidos, contador `next` maior que todo id existente). Não toca nos dados dos perfis. |

**PIN dos perfis** não é uma migração em lote: cada PIN antigo (FNV) é convertido **no primeiro acerto** (ver [SECURITY.md](SECURITY.md)), então
ninguém perde acesso.

**Novos passos**: acrescentar um objeto em `MigrationManager.steps` com `from/to/run/verify`, aumentar `CURRENT` e escrever o teste (instalação antiga →
dados idênticos, rodar duas vezes, interrupção, falha com rollback).

**Downgrade**: o esquema só cresce. Versões antigas do app ignoram as chaves novas (`tetris__schema`, `tetris__pinlock`) e **não entendem o PIN
novo** (`v2$…`): quem voltar para uma versão antiga com PIN configurado precisa redefinir o PIN.
