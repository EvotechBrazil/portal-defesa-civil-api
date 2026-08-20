-- CreateTable
CREATE TABLE "role_change_audits" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "from_role" "UserRole" NOT NULL,
    "to_role" "UserRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_change_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_change_audits_tenant_id_created_at_idx" ON "role_change_audits"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "role_change_audits_tenant_id_target_id_idx" ON "role_change_audits"("tenant_id", "target_id");

-- AddForeignKey
ALTER TABLE "role_change_audits" ADD CONSTRAINT "role_change_audits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_change_audits" ADD CONSTRAINT "role_change_audits_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_change_audits" ADD CONSTRAINT "role_change_audits_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
