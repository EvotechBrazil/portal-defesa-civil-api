# portal-defesa-civil-api

API NestJS do Portal de Ensino — Defesa Civil.

## Como rodar

```bash
# na raiz do monorepo de pastas
docker-compose up -d
cd portal-defesa-civil-api
pnpm install
pnpm exec prisma migrate dev
pnpm seed
pnpm start:dev
```

- API: `http://localhost:3001/api/v1`
- Swagger: `http://localhost:3001/docs`
- Health: `http://localhost:3001/api/v1/health`

`DATABASE_URL` aponta para Postgres na porta **5438** (5432 estava ocupada neste host).

## Como testar

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm test:e2e
```

O e2e `test/seed.e2e-spec.ts` confere os counts da §7.3 do plano.

## Seed

`pnpm seed` é idempotente (`upsert` com `update: {}` vazio). Os índices `q`/`src` de `decks.json` são resolvidos pela ordem original de `questoes.json`.
