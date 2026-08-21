import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import {
  canAssignRole,
  canManageRole,
  isAssignableRole,
} from '../../common/authz/role-hierarchy';
import {
  PaginationMeta,
  buildPaginationMeta,
} from '../../common/dtos/pagination.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { AdminUserDto } from './dtos/admin-user.dto';
import { ListRoleChangesDto } from './dtos/list-role-changes.dto';
import { ListUsersDto } from './dtos/list-users.dto';
import { RoleChangeDto } from './dtos/role-change.dto';
import { AuditLogRepository, AuditLogRow } from './audit-log.repository';
import { AdminUserRow, UsersRepository } from './users.repository';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
}

export function toUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
  };
}

const MAX_PAGE_SIZE = 100;

function toAdminUser(row: AdminUserRow): AdminUserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    manada: row.manada,
    lgndNumber: row.lgndNumber,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  };
}

function toRoleChange(row: AuditLogRow): RoleChangeDto {
  return {
    id: row.id,
    event: row.event,
    actor: { id: row.actor.id, name: row.actor.name },
    target: { id: row.target.id, name: row.target.name },
    fromRole: row.fromRole,
    toRole: row.toRole,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly auditLogRepository: AuditLogRepository,
  ) {}

  async getMe(userId: string): Promise<UserProfile> {
    const user = await this.usersRepository.findActiveById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toUserProfile(user);
  }

  async listUsers(
    tenantId: string,
    query: ListUsersDto,
  ): Promise<{ data: AdminUserDto[]; meta: PaginationMeta }> {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(query.pageSize ?? 20, MAX_PAGE_SIZE);
    const filters = { tenantId, role: query.role, q: query.q };
    const [rows, total] = await Promise.all([
      this.usersRepository.listByTenant({
        ...filters,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.usersRepository.countByTenant(filters),
    ]);
    return {
      data: rows.map(toAdminUser),
      meta: buildPaginationMeta(page, pageSize, total),
    };
  }

  /**
   * Troca o papel de um usuario.
   *
   * A ordem das checagens e contrato, nao estilo: o 404 vem ANTES de qualquer
   * 403 sobre o alvo, para nao vazar a existencia de usuario de outro tenant.
   */
  async changeUserRole(
    actor: AuthenticatedUser,
    tenantId: string,
    targetId: string,
    nextRole: UserRole,
  ): Promise<AdminUserDto> {
    if (actor.id === targetId) {
      // Redundante com canManageRole (o proprio papel nunca e menor que ele
      // mesmo), mas explicito para dar a mensagem certa.
      throw new ForbiddenException('Nao e possivel alterar o proprio papel.');
    }

    const target = await this.usersRepository.findActiveByIdInTenant(
      tenantId,
      targetId,
    );
    if (!target) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    if (!isAssignableRole(nextRole)) {
      throw new ForbiddenException(
        'SUPER_ADMIN nao e atribuivel por API: so o seed concede.',
      );
    }
    if (!canManageRole(actor.role, target.role)) {
      throw new ForbiddenException(
        'O alvo tem papel igual ou superior ao seu.',
      );
    }
    if (!canAssignRole(actor.role, nextRole)) {
      throw new ForbiddenException(
        'Nao e possivel conceder papel igual ou superior ao seu.',
      );
    }

    if (target.role === nextRole) {
      // No-op idempotente: retry de rede nao polui a trilha com "ADMIN -> ADMIN".
      return toAdminUser({
        id: target.id,
        name: target.name,
        email: target.email,
        role: target.role,
        manada: target.manada,
        lgndNumber: target.lgndNumber,
        lastLoginAt: target.lastLoginAt,
        createdAt: target.createdAt,
      });
    }

    const updated = await this.usersRepository.updateRoleWithAudit({
      tenantId,
      actorId: actor.id,
      targetId,
      fromRole: target.role,
      toRole: nextRole,
    });
    if (!updated) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    // Segundo rastro, no padrao de stats.service: evento estruturado em stdout,
    // sem PII (so ids) — standards/lgpd-erasure.md.
    this.logger.log(
      JSON.stringify({
        event: 'user.role.changed',
        tenantId,
        actorId: actor.id,
        targetId,
        fromRole: target.role,
        toRole: nextRole,
        timestamp: new Date().toISOString(),
      }),
    );

    return toAdminUser(updated);
  }

  async listRoleChanges(
    tenantId: string,
    query: ListRoleChangesDto,
  ): Promise<{ data: RoleChangeDto[]; meta: PaginationMeta }> {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(query.pageSize ?? 20, MAX_PAGE_SIZE);
    const filters = { tenantId, targetUserId: query.targetUserId };
    const [rows, total] = await Promise.all([
      this.auditLogRepository.listByTenant({
        ...filters,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.auditLogRepository.countByTenant(filters),
    ]);
    return {
      data: rows.map(toRoleChange),
      meta: buildPaginationMeta(page, pageSize, total),
    };
  }
}
