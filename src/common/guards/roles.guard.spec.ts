import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { MIN_ROLE_KEY } from '../decorators/min-role.decorator';
import { AuthenticatedUser } from '../types/authenticated-request';
import { RolesGuard } from './roles.guard';

/** Reflector falso: responde por chave de metadata, como o real. */
function reflectorFor(metadata: { isPublic?: boolean; minRole?: UserRole }): {
  reflector: Reflector;
  getAllAndOverride: jest.Mock;
} {
  const getAllAndOverride = jest.fn((key: string) =>
    key === IS_PUBLIC_KEY ? metadata.isPublic : metadata.minRole,
  );
  return {
    reflector: { getAllAndOverride } as unknown as Reflector,
    getAllAndOverride,
  };
}

function contextFor(user?: AuthenticatedUser): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const userWith = (role: UserRole): AuthenticatedUser => ({
  id: 'user-1',
  email: 'user@portal.local',
  role,
  tenantId: 'tenant-1',
});

describe('RolesGuard', () => {
  it('libera rota sem metadata de papel', () => {
    const guard = new RolesGuard(reflectorFor({}).reflector);
    expect(guard.canActivate(contextFor(userWith(UserRole.STUDENT)))).toBe(
      true,
    );
  });

  it('libera rota @Public() mesmo sem usuario', () => {
    const guard = new RolesGuard(reflectorFor({ isPublic: true }).reflector);
    expect(guard.canActivate(contextFor(undefined))).toBe(true);
  });

  describe('@MinRole(ADMIN)', () => {
    const guard = () =>
      new RolesGuard(reflectorFor({ minRole: UserRole.ADMIN }).reflector);

    // Regressao-chave: e o que mantem access.admin.controller e
    // members.admin.controller acessiveis aos papeis novos.
    it.each([UserRole.ADMIN, UserRole.ADMIN_SENIOR, UserRole.SUPER_ADMIN])(
      'aceita %s',
      (role) => {
        expect(guard().canActivate(contextFor(userWith(role)))).toBe(true);
      },
    );

    it('barra STUDENT com 403', () => {
      expect(() =>
        guard().canActivate(contextFor(userWith(UserRole.STUDENT))),
      ).toThrow(ForbiddenException);
    });

    it('barra request sem usuario com 403, nao 500', () => {
      expect(() => guard().canActivate(contextFor(undefined))).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('@MinRole(ADMIN_SENIOR)', () => {
    const guard = () =>
      new RolesGuard(
        reflectorFor({ minRole: UserRole.ADMIN_SENIOR }).reflector,
      );

    it('barra ADMIN', () => {
      expect(() =>
        guard().canActivate(contextFor(userWith(UserRole.ADMIN))),
      ).toThrow(ForbiddenException);
    });

    it('aceita ADMIN_SENIOR e SUPER_ADMIN', () => {
      expect(
        guard().canActivate(contextFor(userWith(UserRole.ADMIN_SENIOR))),
      ).toBe(true);
      expect(
        guard().canActivate(contextFor(userWith(UserRole.SUPER_ADMIN))),
      ).toBe(true);
    });
  });

  it('consulta o metadata do handler antes do da classe', () => {
    const { reflector, getAllAndOverride } = reflectorFor({
      minRole: UserRole.ADMIN,
    });
    const guard = new RolesGuard(reflector);
    const handler = () => undefined;
    const klass = class {};
    const context = {
      getHandler: () => handler,
      getClass: () => klass,
      switchToHttp: () => ({
        getRequest: () => ({ user: userWith(UserRole.ADMIN) }),
      }),
    } as unknown as ExecutionContext;

    guard.canActivate(context);

    expect(getAllAndOverride).toHaveBeenCalledWith(MIN_ROLE_KEY, [
      handler,
      klass,
    ]);
  });
});
