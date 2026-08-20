#!/bin/sh
# O Coolify não tem release step: migration e seed rodam aqui, no boot.
set -e

echo "[entrypoint] aplicando migrations"
# `migrate deploy` e nunca `db push --accept-data-loss`: com gente cadastrada,
# o push pode derrubar coluna e apagar progresso de estudo.
pnpm exec prisma migrate deploy

if [ "${SEED_ON_BOOT:-true}" = "true" ]; then
  echo "[entrypoint] rodando seed (idempotente por contrato)"
  if ! pnpm seed; then
    echo "[entrypoint] AVISO: o seed falhou. A API sobe assim mesmo, mas o catalogo pode estar incompleto." >&2
  fi
else
  echo "[entrypoint] SEED_ON_BOOT=false, pulando seed"
fi

echo "[entrypoint] iniciando API"
# `dist/src/main.js` e nao `dist/main`: o api/index.ts da Vercel fica fora de
# src/ e empurra o rootDir, entao o nest build gera dist/src/.
exec node dist/src/main.js
