-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('INTERESTED', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "whatsapp" TEXT;
ALTER TABLE "users" ADD COLUMN "lgnd_number" TEXT;
ALTER TABLE "users" ADD COLUMN "manada" TEXT;
ALTER TABLE "users" ADD COLUMN "city" TEXT;
ALTER TABLE "users" ADD COLUMN "squad" TEXT;
ALTER TABLE "users" ADD COLUMN "evento_fire" TEXT;
ALTER TABLE "users" ADD COLUMN "photo_bytes" BYTEA;
ALTER TABLE "users" ADD COLUMN "photo_mime" TEXT;

-- Partial unique: vários usuários podem ter whatsapp nulo (admin/legado),
-- mas um número ativo não se repete no tenant.
CREATE UNIQUE INDEX "users_tenant_id_whatsapp_key" ON "users"("tenant_id", "whatsapp") WHERE "whatsapp" IS NOT NULL;

-- CreateTable
CREATE TABLE "allowed_whatsapps" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "allowed_whatsapps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "name" TEXT,
    "lgnd_number" TEXT,
    "manada" TEXT,
    "email" TEXT,
    "justification" TEXT,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'INTERESTED',
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "allowed_whatsapps_tenant_id_whatsapp_key" ON "allowed_whatsapps"("tenant_id", "whatsapp");

-- CreateIndex
CREATE INDEX "allowed_whatsapps_tenant_id_idx" ON "allowed_whatsapps"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "access_requests_tenant_id_whatsapp_key" ON "access_requests"("tenant_id", "whatsapp");

-- CreateIndex
CREATE INDEX "access_requests_tenant_id_status_idx" ON "access_requests"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "allowed_whatsapps" ADD CONSTRAINT "allowed_whatsapps_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
