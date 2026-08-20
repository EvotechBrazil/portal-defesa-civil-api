import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { hasAtLeast } from '../authz/role-hierarchy';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { MIN_ROLE_KEY } from '../decorators/min-role.decorator';
import { RequestWithUser } from '../types/authenticated-request';

/**
 * Terceiro guard global (JwtAuthGuard -> TenantGuard -> RolesGuard).
 *
 * Compara por NIVEL, nao por igualdade: `@MinRole(ADMIN)` aceita ADMIN,
 * ADMIN_SENIOR e SUPER_ADMIN, e segue barrando STUDENT. Para os papeis que ja
 * existiam o comportamento e identico ao da versao anterior — a unica mudanca
 * e a heranca dos papeis novos.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // getAllAndOverride: o handler SOBRESCREVE a classe. E o que permite subir
    // a regua numa rota especifica (@MinRole(ADMIN_SENIOR) dentro de uma classe
    // @MinRole(ADMIN)) — mas tambem permite BAIXA-LA sem alarde. Ao anotar um
    // handler dentro de uma classe ja anotada, confira que a intencao e essa.
    const minRole = this.reflector.getAllAndOverride<UserRole | undefined>(
      MIN_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!minRole) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user || !hasAtLeast(request.user.role, minRole)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
