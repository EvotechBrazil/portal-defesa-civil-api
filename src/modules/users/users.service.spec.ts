import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { RoleChangeAuditRepository } from './role-change-audit.repository';
import { AdminUserRow, UsersRepository } from './users.repository';
import { UsersService } from './users.service';

const TENANT = 'tenant-a';

function actorWith(role: UserRole, id = 'actor-1'): AuthenticatedUser {
  return { id, email: 'actor@portal.local', role, tenantId: TENANT };
}

function targetUser(overrides: Partial<User> = {}): User {
  return {
    id: 'target-1',
    tenantId: TENANT,
    name: 'Alvo',
    email: 'alvo@portal.local',
    role: UserRole.STUDENT,
    manada: null,
    lgndNumber: null,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as User;
}

function adminRow(overrides: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    id: 'target-1',
    name: 'Alvo',
    email: 'alvo@portal.local',
    role: UserRole.ADMIN,
    manada: null,
    lgndNumber: null,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: jest.Mocked<
    Pick<
      UsersRepository,
      | 'findActiveById'
      | 'findActiveByIdInTenant'
      | 'listByTenant'
      | 'countByTenant'
      | 'updateRoleWithAudit'
    >
  >;
  let auditRepository: jest.Mocked<
    Pick<RoleChangeAuditRepository, 'listByTenant' | 'countByTenant'>
  >;

  beforeEach(() => {
    usersRepository = {
      findActiveById: jest.fn(),
      findActiveByIdInTenant: jest.fn(),
      listByTenant: jest.fn(),
      countByTenant: jest.fn(),
      updateRoleWithAudit: jest.fn(),
    };
    auditRepository = { listByTenant: jest.fn(), countByTenant: jest.fn() };
    service = new UsersService(
      usersRepository as unknown as UsersRepository,
      auditRepository as unknown as RoleChangeAuditRepository,
    );
  });

  describe('listUsers', () => {
    it('pagina e repassa os filtros para o repositorio', async () => {
      usersRepository.listByTenant.mockResolvedValue([adminRow()]);
      usersRepository.countByTenant.mockResolvedValue(42);

      const result = await service.listUsers(TENANT, {
        page: 2,
        pageSize: 20,
        role: UserRole.ADMIN,
        q: 'ana',
      });

      expect(usersRepository.listByTenant).toHaveBeenCalledWith({
        tenantId: TENANT,
        role: UserRole.ADMIN,
        q: 'ana',
        skip: 20,
        take: 20,
      });
      expect(result.meta).toEqual({
        page: 2,
        pageSize: 20,
        total: 42,
        pageCount: 3,
      });
    });

    it('nunca projeta campo sensivel', async () => {
      usersRepository.listByTenant.mockResolvedValue([adminRow()]);
      usersRepository.countByTenant.mockResolvedValue(1);

      const result = await service.listUsers(TENANT, { page: 1, pageSize: 20 });

      expect(Object.keys(result.data[0]).sort()).toEqual(
        [
          'createdAt',
          'email',
          'id',
          'lastLoginAt',
          'lgndNumber',
          'manada',
          'name',
          'role',
        ].sort(),
      );
    });

    it('limita o pageSize a 100', async () => {
      usersRepository.listByTenant.mockResolvedValue([]);
      usersRepository.countByTenant.mockResolvedValue(0);

      await service.listUsers(TENANT, { page: 1, pageSize: 500 });

      expect(usersRepository.listByTenant).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  describe('changeUserRole', () => {
    it('deixa o ADMIN_SENIOR promover STUDENT a ADMIN e grava a trilha', async () => {
      usersRepository.findActiveByIdInTenant.mockResolvedValue(targetUser());
      usersRepository.updateRoleWithAudit.mockResolvedValue(adminRow());

      const result = await service.changeUserRole(
        actorWith(UserRole.ADMIN_SENIOR),
        TENANT,
        'target-1',
        UserRole.ADMIN,
      );

      expect(usersRepository.updateRoleWithAudit).toHaveBeenCalledWith({
        tenantId: TENANT,
        actorId: 'actor-1',
        targetId: 'target-1',
        fromRole: UserRole.STUDENT,
        toRole: UserRole.ADMIN,
      });
      expect(result.role).toBe(UserRole.ADMIN);
    });

    it('deixa o ADMIN_SENIOR revogar ADMIN de volta para STUDENT', async () => {
      usersRepository.findActiveByIdInTenant.mockResolvedValue(
        targetUser({ role: UserRole.ADMIN }),
      );
      usersRepository.updateRoleWithAudit.mockResolvedValue(
        adminRow({ role: UserRole.STUDENT }),
      );

      await service.changeUserRole(
        actorWith(UserRole.ADMIN_SENIOR),
        TENANT,
        'target-1',
        UserRole.STUDENT,
      );

      expect(usersRepository.updateRoleWithAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          fromRole: UserRole.ADMIN,
          toRole: UserRole.STUDENT,
        }),
      );
    });

    it('deixa o SUPER_ADMIN conceder ADMIN_SENIOR', async () => {
      usersRepository.findActiveByIdInTenant.mockResolvedValue(
        targetUser({ role: UserRole.ADMIN }),
      );
      usersRepository.updateRoleWithAudit.mockResolvedValue(
        adminRow({ role: UserRole.ADMIN_SENIOR }),
      );

      const result = await service.changeUserRole(
        actorWith(UserRole.SUPER_ADMIN),
        TENANT,
        'target-1',
        UserRole.ADMIN_SENIOR,
      );

      expect(result.role).toBe(UserRole.ADMIN_SENIOR);
    });

    it('recusa alterar o proprio papel com 403', async () => {
      await expect(
        service.changeUserRole(
          actorWith(UserRole.SUPER_ADMIN, 'same-1'),
          TENANT,
          'same-1',
          UserRole.STUDENT,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(usersRepository.findActiveByIdInTenant).not.toHaveBeenCalled();
    });

    it('responde 404 para alvo inexistente, de outro tenant ou soft-deletado', async () => {
      usersRepository.findActiveByIdInTenant.mockResolvedValue(null);

      await expect(
        service.changeUserRole(
          actorWith(UserRole.SUPER_ADMIN),
          TENANT,
          'missing',
          UserRole.ADMIN,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('recusa conceder SUPER_ADMIN ate para um SUPER_ADMIN', async () => {
      usersRepository.findActiveByIdInTenant.mockResolvedValue(targetUser());

      await expect(
        service.changeUserRole(
          actorWith(UserRole.SUPER_ADMIN),
          TENANT,
          'target-1',
          UserRole.SUPER_ADMIN,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(usersRepository.updateRoleWithAudit).not.toHaveBeenCalled();
    });

    it('recusa o ADMIN_SENIOR mexer em outro ADMIN_SENIOR', async () => {
      usersRepository.findActiveByIdInTenant.mockResolvedValue(
        targetUser({ role: UserRole.ADMIN_SENIOR }),
      );

      await expect(
        service.changeUserRole(
          actorWith(UserRole.ADMIN_SENIOR),
          TENANT,
          'target-1',
          UserRole.STUDENT,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('recusa o ADMIN_SENIOR mexer em um SUPER_ADMIN', async () => {
      usersRepository.findActiveByIdInTenant.mockResolvedValue(
        targetUser({ role: UserRole.SUPER_ADMIN }),
      );

      await expect(
        service.changeUserRole(
          actorWith(UserRole.ADMIN_SENIOR),
          TENANT,
          'target-1',
          UserRole.STUDENT,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('recusa o ADMIN_SENIOR promover alguem ao proprio nivel', async () => {
      usersRepository.findActiveByIdInTenant.mockResolvedValue(targetUser());

      await expect(
        service.changeUserRole(
          actorWith(UserRole.ADMIN_SENIOR),
          TENANT,
          'target-1',
          UserRole.ADMIN_SENIOR,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('trata papel igual ao atual como no-op, sem gravar auditoria', async () => {
      usersRepository.findActiveByIdInTenant.mockResolvedValue(
        targetUser({ role: UserRole.ADMIN }),
      );

      const result = await service.changeUserRole(
        actorWith(UserRole.SUPER_ADMIN),
        TENANT,
        'target-1',
        UserRole.ADMIN,
      );

      expect(result.role).toBe(UserRole.ADMIN);
      expect(usersRepository.updateRoleWithAudit).not.toHaveBeenCalled();
    });
  });

  describe('listRoleChanges', () => {
    it('pagina a trilha e mapeia actor e target', async () => {
      auditRepository.listByTenant.mockResolvedValue([
        {
          id: 'audit-1',
          tenantId: TENANT,
          actorId: 'actor-1',
          targetId: 'target-1',
          fromRole: UserRole.STUDENT,
          toRole: UserRole.ADMIN,
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
          actor: { id: 'actor-1', name: 'Chefe' },
          target: { id: 'target-1', name: 'Alvo' },
        },
      ]);
      auditRepository.countByTenant.mockResolvedValue(1);

      const result = await service.listRoleChanges(TENANT, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data[0]).toEqual({
        id: 'audit-1',
        actor: { id: 'actor-1', name: 'Chefe' },
        target: { id: 'target-1', name: 'Alvo' },
        fromRole: UserRole.STUDENT,
        toRole: UserRole.ADMIN,
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      expect(result.meta.total).toBe(1);
    });
  });
});
