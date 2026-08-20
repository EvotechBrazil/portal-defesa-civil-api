import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const ROLE_CHANGE_INCLUDE = {
  actor: { select: { id: true, name: true } },
  target: { select: { id: true, name: true } },
} satisfies Prisma.RoleChangeAuditInclude;

export type RoleChangeRow = Prisma.RoleChangeAuditGetPayload<{
  include: typeof ROLE_CHANGE_INCLUDE;
}>;

function where(params: {
  tenantId: string;
  targetUserId?: string;
}): Prisma.RoleChangeAuditWhereInput {
  return {
    tenantId: params.tenantId,
    ...(params.targetUserId ? { targetId: params.targetUserId } : {}),
  };
}

/**
 * Leitura da trilha de auditoria. READ-ONLY de proposito: a escrita acontece
 * em UsersRepository.updateRoleWithAudit, dentro da mesma transacao do update
 * do papel.
 */
@Injectable()
export class RoleChangeAuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByTenant(params: {
    tenantId: string;
    targetUserId?: string;
    skip: number;
    take: number;
  }): Promise<RoleChangeRow[]> {
    return this.prisma.roleChangeAudit.findMany({
      where: where(params),
      include: ROLE_CHANGE_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: params.skip,
      take: params.take,
    });
  }

  countByTenant(params: {
    tenantId: string;
    targetUserId?: string;
  }): Promise<number> {
    return this.prisma.roleChangeAudit.count({ where: where(params) });
  }
}
