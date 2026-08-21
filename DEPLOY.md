# Deploy — Programa de evolução contínua LGND SQUAD (API)

A API roda em container. Não depende de nenhuma plataforma específica: qualquer
lugar que rode Docker e alcance um Postgres serve — Coolify, Render, Railway,
Fly, ou uma VPS com `docker run`.

## Como sobe

O `entrypoint.sh` executa, nesta ordem, a cada boot:

1. `prisma migrate deploy` — aplica migrations pendentes. **Nunca `db push`**: com
   gente cadastrada, `--accept-data-loss` derruba coluna e apaga progresso.
2. `pnpm seed` — popula o catálogo (módulos, 157 questões, 204 cartas). O seed é
   idempotente por contrato: rodar de novo produz os mesmos números, sem duplicar.
   Desligue com `SEED_ON_BOOT=false` quando o conteúdo estabilizar.
3. `node dist/src/main.js` — sobe a API.

Se o seed falhar, a API sobe assim mesmo e grava um aviso no log. A consequência é
catálogo incompleto, não indisponibilidade.

## Variáveis de ambiente

| Variável | Obrigatória | Observação |
|---|---|---|
| `DATABASE_URL` | sim | Postgres 16. Em serverless, use pooler (`connection_limit=1`) |
| `JWT_ACCESS_SECRET` | sim | 32+ caracteres aleatórios. Em produção, ausência derruba o boot |
| `JWT_REFRESH_SECRET` | sim | idem |
| `CORS_ORIGIN` | sim | Origem exata do front. **Nunca `*`** — a API envia `credentials: true` |
| `WEB_BASE_URL` | sim | Usada no link de verificação enviado por e-mail |
| `PORT` | não | Padrão 3001 |
| `MAIL_HOST` / `MAIL_PORT` | sim | SMTP do provedor |
| `MAIL_USER` / `MAIL_PASSWORD` | em produção | Vazios usam transporte sem auth (só Mailpit local) |
| `MAIL_SECURE` | não | `true` para porta 465 |
| `MAIL_FROM` | não | Remetente exibido |
| `SEED_ON_BOOT` | não | Padrão `true` |
| `AUTO_VERIFY_EMAIL` | não | Em produção o default é `true` (pula a prova de e-mail). `false` religa quando o SMTP entregar |

Gerar segredo: `openssl rand -hex 32`.

## Construir e rodar localmente

```sh
docker build -t pdc-api .
docker run --rm -p 3001:3001 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  -e JWT_ACCESS_SECRET="$(openssl rand -hex 32)" \
  -e JWT_REFRESH_SECRET="$(openssl rand -hex 32)" \
  -e CORS_ORIGIN="https://seu-front" \
  -e WEB_BASE_URL="https://seu-front" \
  pdc-api
```

## Backup e migração

O catálogo se reconstrói sozinho pelo seed. **O progresso das pessoas não**:
`CardState`, `StudySession`, `Attempt` e `User` só existem no banco.

```sh
# backup
pg_dump "$DATABASE_URL" -Fc -f portal-$(date +%F).dump
# restauração
pg_restore -d "$DATABASE_URL" --clean --if-exists portal-<data>.dump
```

Migrar para outro servidor é: restaurar o dump, apontar `DATABASE_URL` e subir a
mesma imagem. Nenhum estado vive fora do Postgres.

## Notas de imagem

- Base `node:22-slim` (Debian) e não Alpine: `bcrypt` é módulo nativo e musl dá
  problema de compilação.
- `openssl` é instalado porque o engine do Prisma exige.
- O `node_modules` vai inteiro para o runtime de propósito: `prisma` (migrations)
  e `tsx` (seed) são devDependencies. Podar para produção quebra o boot.
- `src/` também vai para o runtime: o seed roda em TypeScript e importa de lá.
