import { UserRole } from '@prisma/client';

/**
 * Fonte unica da precedencia entre papeis.
 *
 * Vive em `common/` porque guard, modulos e o seed consomem — e `common/`
 * nunca importa de `modules/`. As funcoes sao puras sobre `UserRole` (e nao
 * sobre `AuthenticatedUser`) justamente para o seed poder usar `roleLevel`
 * sem arrastar tipo de HTTP.
 *
 * `Record<UserRole, number>` e intencional: acrescentar um papel no enum do
 * Prisma sem dar nivel aqui quebra o `tsc`, em vez de virar bug silencioso.
 * Degraus de 10 para caber papel intermediario sem renumerar tudo.
 */
export const ROLE_LEVEL: Record<UserRole, number> = {
  [UserRole.STUDENT]: 0,
  [UserRole.ADMIN]: 10,
  [UserRole.ADMIN_SENIOR]: 20,
  [UserRole.SUPER_ADMIN]: 30,
};

/**
 * Papeis que a API aceita atribuir. SUPER_ADMIN esta fora de proposito:
 * nasce so pelo seed, para o topo da piramide so mudar por deploy.
 */
export const ASSIGNABLE_ROLES: readonly UserRole[] = [
  UserRole.STUDENT,
  UserRole.ADMIN,
  UserRole.ADMIN_SENIOR,
];

export function roleLevel(role: UserRole): number {
  return ROLE_LEVEL[role];
}

/** Herança: um papel satisfaz a si mesmo e a todos abaixo dele. */
export function hasAtLeast(role: UserRole, minRole: UserRole): boolean {
  return roleLevel(role) >= roleLevel(minRole);
}

export function isAssignableRole(role: UserRole): boolean {
  return ASSIGNABLE_ROLES.includes(role);
}

/**
 * O ator pode mexer no papel deste alvo?
 *
 * Estritamente maior (`>`, nunca `>=`): e isso que codifica "nao pode alterar
 * alguem de papel igual ou superior ao seu" — e, de quebra, impede o ator de
 * alterar a si mesmo.
 */
export function canManageRole(
  actorRole: UserRole,
  targetRole: UserRole,
): boolean {
  return roleLevel(actorRole) > roleLevel(targetRole);
}

/**
 * O ator pode conceder este papel?
 *
 * Tambem estrito: ninguem clona o proprio nivel nem promove acima de si.
 */
export function canAssignRole(
  actorRole: UserRole,
  nextRole: UserRole,
): boolean {
  return (
    isAssignableRole(nextRole) && roleLevel(actorRole) > roleLevel(nextRole)
  );
}
