# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:22-slim AS build
WORKDIR /app

# O engine do Prisma exige openssl. node:22-slim não traz.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9.15.0

# O schema entra antes do install porque o postinstall roda `prisma generate`.
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm exec prisma generate && pnpm build

# ---------- runtime ----------
FROM node:22-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9.15.0

# node_modules vem INTEIRO de propósito. O entrypoint roda `prisma migrate deploy`
# e o seed com tsx, e os dois são devDependencies — podar para produção aqui
# quebra o boot em vez de economizar espaço.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
# O seed roda em TypeScript via tsx e importa de src/ (hashPassword,
# normalizeWhatsapp), entao o fonte precisa existir no runtime. Sem isto o
# `pnpm seed` morre com MODULE_NOT_FOUND e o portal sobe sem catalogo.
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/package.json ./package.json
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 3001
CMD ["./entrypoint.sh"]
