import { Injectable } from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import { AUDIT_EVENT } from '../../common/audit/audit-events';
import { PrismaService } from '../../database/prisma.service';
import { whatsappAliases } from '../access/whatsapp.util';

/** Projecao unica das telas admin: nada de passwordHash/photoBytes/whatsapp. */
const ADMIN_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  manada: true,
  lgndNumber: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type AdminUserRow = Prisma.UserGetPayload<{
  select: typeof ADMIN_USER_SELECT;
}>;

interface ListUsersParams {
  tenantId: string;
  role?: UserRole;
  q?: string;
  skip: number;
  take: number;
}

function listUsersWhere(params: {
  tenantId: string;
  role?: UserRole;
  q?: string;
}): Prisma.UserWhereInput {
  return {
    tenantId: params.tenantId,
    deletedAt: null,
    ...(params.role ? { role: params.role } : {}),
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: 'insensitive' as const } },
            { email: { contains: params.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
  }

  findActiveByEmail(tenantId: string, email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { tenantId, email, deletedAt: null },
    });
  }

  findActiveByWhatsapp(
    tenantId: string,
    whatsapp: string,
  ): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        tenantId,
        whatsapp: { in: whatsappAliases(whatsapp) },
        deletedAt: null,
      },
    });
  }

  createStudent(data: {
    tenantId: string;
    email: string;
    name: string;
    passwordHash: string;
    emailVerifiedAt?: Date;
    whatsapp: string;
    lgndNumber: string;
    manada: string;
    manadaId?: string;
    country: string;
    state: string;
    city: string;
    squad: string;
    eventoFire: string;
    photoBytes?: Buffer;
    photoMime?: string;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        tenantId: data.tenantId,
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash,
        role: UserRole.STUDENT,
        emailVerifiedAt: data.emailVerifiedAt,
        whatsapp: data.whatsapp,
        lgndNumber: data.lgndNumber,
        manada: data.manada,
        manadaId: data.manadaId,
        country: data.country,
        state: data.state,
        city: data.city,
        squad: data.squad,
        eventoFire: data.eventoFire,
        photoBytes: data.photoBytes
          ? Uint8Array.from(data.photoBytes)
          : undefined,
        photoMime: data.photoMime,
      },
    });
  }

  async updateLastLoginAt(id: string, lastLoginAt: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLoginAt },
    });
  }

  async markEmailVerified(id: string, emailVerifiedAt: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { emailVerifiedAt },
    });
  }

  findActiveByIdInTenant(tenantId: string, id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  listByTenant(params: ListUsersParams): Promise<AdminUserRow[]> {
    return this.prisma.user.findMany({
      where: listUsersWhere(params),
      // Ordena por nome, NUNCA por role: no Postgres o ORDER BY de um enum
      // segue a ordem de declaracao do tipo, que aqui nao e a hierarquia.
      // `id` como desempate deixa a paginacao estavel.
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: ADMIN_USER_SELECT,
      skip: params.skip,
      take: params.take,
    });
  }

  countByTenant(params: {
    tenantId: string;
    role?: UserRole;
    q?: string;
  }): Promise<number> {
    return this.prisma.user.count({ where: listUsersWhere(params) });
  }

  /**
   * Troca o papel e grava a trilha na MESMA transacao — uma promocao sem
   * rastro e pior que nenhuma promocao.
   *
   * `updateMany` com tenantId + deletedAt: o `update` por id sozinho atravessa
   * tenant se o service errar o lookup. count === 0 aborta sem escrever audit.
   */
  async updateRoleWithAudit(params: {
    tenantId: string;
    actorId: string;
    targetId: string;
    fromRole: UserRole;
    toRole: UserRole;
  }): Promise<AdminUserRow | null> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: {
          id: params.targetId,
          tenantId: params.tenantId,
          deletedAt: null,
        },
        data: { role: params.toRole },
      });
      if (updated.count === 0) {
        return null;
      }
      await tx.auditLog.create({
        data: {
          tenantId: params.tenantId,
          event: AUDIT_EVENT.ROLE_CHANGED,
          actorId: params.actorId,
          targetId: params.targetId,
          fromRole: params.fromRole,
          toRole: params.toRole,
        },
      });
      return tx.user.findFirstOrThrow({
        where: { id: params.targetId, tenantId: params.tenantId },
        select: ADMIN_USER_SELECT,
      });
    });
  }

  appendAudit(params: {
    tenantId: string;
    event: string;
    actorId: string;
    targetId: string;
    fromRole?: UserRole;
    toRole?: UserRole;
  }): Promise<void> {
    return this.prisma.auditLog
      .create({
        data: {
          tenantId: params.tenantId,
          event: params.event,
          actorId: params.actorId,
          targetId: params.targetId,
          fromRole: params.fromRole,
          toRole: params.toRole,
        },
      })
      .then(() => undefined);
  }
}
