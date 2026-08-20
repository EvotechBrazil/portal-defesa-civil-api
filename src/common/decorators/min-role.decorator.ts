import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const MIN_ROLE_KEY = 'minRole';

/**
 * Nivel MINIMO exigido pela rota — papeis acima herdam o acesso.
 *
 * Substitui o antigo `@Roles(...)` variadico: sob semantica de hierarquia,
 * `@Roles(ADMIN, ADMIN_SENIOR)` leria como "um destes dois" e se comportaria
 * como ">= ADMIN". Decorator que mente e divida cara numa camada de seguranca.
 */
export const MinRole = (role: UserRole) => SetMetadata(MIN_ROLE_KEY, role);
