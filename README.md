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

### Trilha B — Conteúdo

```bash
pnpm test -- src/modules/courses src/modules/questions
pnpm test:e2e -- test/courses.e2e-spec.ts test/questions.e2e-spec.ts
```

Endpoints: `GET /courses`, `GET /courses/:slug`, `GET /courses/:slug/pages/:pageSlug`,
`POST /courses/:slug/enroll`, `GET /questions`, `GET /questions/:id`.

O banco de questões devolve gabarito (`isCorrect`, `explanationMd`) — é material de estudo.
Listagens usam envelope `{ data, meta }` com `pageSize` máximo 100.
Counts por módulo: M1 13 · M2 21 · M3 17 · M4 20 · M5 18 · M6 20.

### Trilha C — Estudo

```bash
pnpm test -- src/modules/study src/modules/decks
pnpm test:e2e -- test/study.e2e-spec.ts
```

Endpoints: `GET /decks`, `POST /study-sessions`, `GET /study-sessions/:id`,
`POST /study-sessions/:id/reviews`, `POST /study-sessions/:id/finish`.

Algoritmo Leitner intra-sessão: `GAP = {HARD:2, LEARNING:6, EASY:14}`.
A fila e a direção da carta são do servidor. Progresso em `CardState` / `StudySession.queue`.

### Trilha D — Prática

```bash
pnpm test -- --testPathPatterns=practice
pnpm exec jest --config ./test/jest-e2e.json --testPathPatterns=practice --runInBand
```

Endpoints: `POST /cards/:cardId/attempts` (201, sem `isCorrect`),
`POST /attempts/:id/answers` (não revela acerto; segundo envio 409),
`POST /attempts/:id/finish` (nota + gabarito + delta; finish repetido 409),
`GET /cards/:cardId/attempts` (últimas 8 + tentativa em aberto).

Questões e alternativas são embaralhadas a cada tentativa (`shownOrd`, `optionOrder`).
`isCorrect` só existe depois do `finish`. O teste adversarial varre o JSON do create.

## Seed

`pnpm seed` é idempotente (`upsert` com `update: {}` vazio). Os índices `q`/`src` de `decks.json` são resolvidos pela ordem original de `questoes.json`.
