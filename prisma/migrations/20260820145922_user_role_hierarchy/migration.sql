-- AlterEnum
-- Hierarquia de papeis: SUPER_ADMIN > ADMIN_SENIOR > ADMIN > STUDENT.
-- Os valores entram no fim do enum; a precedencia vive em
-- src/common/authz/role-hierarchy.ts, nunca na ordem de declaracao.
--
-- Migration isolada de proposito: no Postgres um valor de enum recem-criado
-- nao pode ser USADO na mesma transacao que o criou (erro 55P04). Como o
-- Prisma roda cada arquivo numa transacao, qualquer DEFAULT/UPDATE citando
-- ADMIN_SENIOR ou SUPER_ADMIN precisa vir num arquivo posterior.
ALTER TYPE "UserRole" ADD VALUE 'ADMIN_SENIOR';
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';
