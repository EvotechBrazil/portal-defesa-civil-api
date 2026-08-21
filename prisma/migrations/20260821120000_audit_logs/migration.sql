ALTER TABLE "role_change_audits" RENAME TO "audit_logs";

ALTER TABLE "audit_logs" ADD COLUMN "event" TEXT NOT NULL DEFAULT 'user.role.changed';
ALTER TABLE "audit_logs" ALTER COLUMN "event" DROP DEFAULT;

ALTER TABLE "audit_logs" ALTER COLUMN "from_role" DROP NOT NULL;
ALTER TABLE "audit_logs" ALTER COLUMN "to_role" DROP NOT NULL;

ALTER INDEX "role_change_audits_tenant_id_created_at_idx" RENAME TO "audit_logs_tenant_id_created_at_idx";
ALTER INDEX "role_change_audits_tenant_id_target_id_idx" RENAME TO "audit_logs_tenant_id_target_id_idx";

ALTER TABLE "audit_logs" RENAME CONSTRAINT "role_change_audits_pkey" TO "audit_logs_pkey";
ALTER TABLE "audit_logs" RENAME CONSTRAINT "role_change_audits_tenant_id_fkey" TO "audit_logs_tenant_id_fkey";
ALTER TABLE "audit_logs" RENAME CONSTRAINT "role_change_audits_actor_id_fkey" TO "audit_logs_actor_id_fkey";
ALTER TABLE "audit_logs" RENAME CONSTRAINT "role_change_audits_target_id_fkey" TO "audit_logs_target_id_fkey";

CREATE INDEX "audit_logs_tenant_id_event_idx" ON "audit_logs"("tenant_id", "event");
