import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const AUDIT_INCLUDE = {
  actor: { select: { id: true, name: true } },
  target: { select: { id: true, name: true } },
} satisfies Prisma.AuditLogInclude;

export type AuditLogRow = Prisma.AuditLogGetPayload<{
  include: typeof AUDIT_INCLUDE;
}>;

function where(params: {
  tenantId: string;
  targetUserId?: string;
}): Prisma.AuditLogWhereInput {
  return {
    tenantId: params.tenantId,
    ...(params.targetUserId ? { targetId: params.targetUserId } : {}),
  };
}

/**
 * Leitura da trilha. READ-ONLY de proposito: a escrita acontece junto do
 * efeito (troca de papel, emissao de link) na mesma transacao, quando da.
 */
@Injectable()
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByTenant(params: {
    tenantId: string;
    targetUserId?: string;
    skip: number;
    take: number;
  }): Promise<AuditLogRow[]> {
    return this.prisma.auditLog.findMany({
      where: where(params),
      include: AUDIT_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: params.skip,
      take: params.take,
    });
  }

  countByTenant(params: {
    tenantId: string;
    targetUserId?: string;
  }): Promise<number> {
    return this.prisma.auditLog.count({ where: where(params) });
  }
}
