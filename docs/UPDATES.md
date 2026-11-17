# Atualização dentro do app

Menu › **Conta e dados › Atualizações** (e, ao abrir o app, uma procura automática no máximo 1 vez por hora — dá para desligar).

1. **Procurar** (`AppUpdate.check`): `HEAD https://github.com/MissionBreak56/Tetris/releases/latest`; o redirecionamento revela a tag (`vX.Y.Z`). Não usa a API (sem limite de requisições). As notas e o tamanho vêm
   de `api.github.com/.../releases/tags/<tag>` e são opcionais (se falhar, a atualização continua).
2. **Aviso**: se a tag for mais nova que a versão instalada (`versionName` do APK), aparece "Atualização disponível" com **Baixar agora** / **Depois**. Durante uma partida o aviso espera o menu.
3. **Baixar** (`AppUpdate.download`): `releases/download/<tag>/Tetris-<tag>.apk` dentro do app, com barra de progresso e botão Cancelar. Só aceita tag `vX.Y.Z`, confere o tamanho e a assinatura `PK` do arquivo
   e guarda só o APK atual em `cache/updates`.
4. **Instalar** (`MainActivity.installUpdate`): `PackageInstaller` (sem FileProvider). Se o Android ainda não permitiu "Instalar apps desconhecidos" para o Tetris, o app abre esse ajuste e mostra "Instalar" para tentar de novo.
   O Android pede a confirmação final. Os dados e perfis são mantidos (mesmo pacote e mesma chave de assinatura das releases).

Na tela inicial aparece `vX.Y.Z · Developed by T. Marques` (com "⬆" e aviso quando há versão nova).

Testes: `tests/update.test.js` (estados, diálogo, progresso, permissão, preferência, tela inicial) e `tests/java/AppUpdateTest.java` (servidor HTTP local imitando o GitHub: redirecionamentos, API fora do ar, 404,
arquivo inválido, download cortado, cancelamento), executado no CI antes de compilar.
