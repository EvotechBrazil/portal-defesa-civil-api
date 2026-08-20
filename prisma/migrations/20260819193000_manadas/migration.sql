-- CreateTable
CREATE TABLE "manadas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "manadas_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "manada_id" TEXT;
ALTER TABLE "users" ADD COLUMN "country" TEXT;
ALTER TABLE "users" ADD COLUMN "state" TEXT;

-- AlterTable
ALTER TABLE "access_requests" ADD COLUMN "manada_id" TEXT;
ALTER TABLE "access_requests" ADD COLUMN "country" TEXT;
ALTER TABLE "access_requests" ADD COLUMN "state" TEXT;
ALTER TABLE "access_requests" ADD COLUMN "city" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "manadas_tenant_id_name_country_state_city_key" ON "manadas"("tenant_id", "name", "country", "state", "city");

-- CreateIndex
CREATE INDEX "manadas_tenant_id_idx" ON "manadas"("tenant_id");

-- CreateIndex
CREATE INDEX "manadas_tenant_id_country_state_city_idx" ON "manadas"("tenant_id", "country", "state", "city");

-- CreateIndex
CREATE INDEX "users_manada_id_idx" ON "users"("manada_id");

-- CreateIndex
CREATE INDEX "access_requests_manada_id_idx" ON "access_requests"("manada_id");

-- Backfill: manadas a partir do texto livre já gravado em users
INSERT INTO "manadas" ("id", "tenant_id", "name", "country", "state", "city", "created_at", "updated_at")
SELECT
    'mnd_' || md5(u."tenant_id" || E'\n' || lower(trim(u."manada")) || E'\n' || lower(trim(coalesce(u."city", '')))),
    u."tenant_id",
    trim(u."manada"),
    'BR',
    '',
    coalesce(nullif(trim(u."city"), ''), '—'),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (
        "tenant_id",
        lower(trim("manada")),
        lower(trim(coalesce("city", '')))
    )
        "tenant_id",
        "manada",
        "city"
    FROM "users"
    WHERE "manada" IS NOT NULL AND trim("manada") <> ''
) u
ON CONFLICT DO NOTHING;

-- Backfill: manadas citadas só em pedidos de acesso
INSERT INTO "manadas" ("id", "tenant_id", "name", "country", "state", "city", "created_at", "updated_at")
SELECT
    'mnd_' || md5(r."tenant_id" || E'\n' || lower(trim(r."manada")) || E'\n' || lower(trim(coalesce(r."city", '')))),
    r."tenant_id",
    trim(r."manada"),
    'BR',
    '',
    coalesce(nullif(trim(r."city"), ''), '—'),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (
        "tenant_id",
        lower(trim("manada")),
        lower(trim(coalesce("city", '')))
    )
        "tenant_id",
        "manada",
        "city"
    FROM "access_requests"
    WHERE "manada" IS NOT NULL AND trim("manada") <> ''
) r
ON CONFLICT DO NOTHING;

UPDATE "users" u
SET
    "manada_id" = 'mnd_' || md5(u."tenant_id" || E'\n' || lower(trim(u."manada")) || E'\n' || lower(trim(coalesce(u."city", '')))),
    "country" = 'BR'
WHERE u."manada" IS NOT NULL AND trim(u."manada") <> '';

UPDATE "access_requests" r
SET
    "manada_id" = 'mnd_' || md5(r."tenant_id" || E'\n' || lower(trim(r."manada")) || E'\n' || lower(trim(coalesce(r."city", '')))),
    "country" = 'BR'
WHERE r."manada" IS NOT NULL AND trim(r."manada") <> '';

-- AddForeignKey
ALTER TABLE "manadas" ADD CONSTRAINT "manadas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "users" ADD CONSTRAINT "users_manada_id_fkey" FOREIGN KEY ("manada_id") REFERENCES "manadas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_manada_id_fkey" FOREIGN KEY ("manada_id") REFERENCES "manadas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
