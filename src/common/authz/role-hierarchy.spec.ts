import { UserRole } from '@prisma/client';
import {
  ASSIGNABLE_ROLES,
  ROLE_LEVEL,
  canAssignRole,
  canManageRole,
  hasAtLeast,
  isAssignableRole,
  roleLevel,
} from './role-hierarchy';

const ALL_ROLES = [
  UserRole.STUDENT,
  UserRole.ADMIN,
  UserRole.ADMIN_SENIOR,
  UserRole.SUPER_ADMIN,
] as const;

describe('role-hierarchy', () => {
  it('cobre todo papel do enum do Prisma', () => {
    // Guarda de exaustividade: papel novo no schema sem nivel aqui derruba
    // este teste antes de virar bug silencioso de autorizacao.
    expect(Object.keys(ROLE_LEVEL).sort()).toEqual(
      Object.keys(UserRole).sort(),
    );
  });

  it('ordena STUDENT < ADMIN < ADMIN_SENIOR < SUPER_ADMIN', () => {
    expect(roleLevel(UserRole.STUDENT)).toBeLessThan(roleLevel(UserRole.ADMIN));
    expect(roleLevel(UserRole.ADMIN)).toBeLessThan(
      roleLevel(UserRole.ADMIN_SENIOR),
    );
    expect(roleLevel(UserRole.ADMIN_SENIOR)).toBeLessThan(
      roleLevel(UserRole.SUPER_ADMIN),
    );
  });

  describe('hasAtLeast', () => {
    it('faz cada papel satisfazer a si mesmo e a todos abaixo', () => {
      for (const role of ALL_ROLES) {
        for (const min of ALL_ROLES) {
          expect(hasAtLeast(role, min)).toBe(roleLevel(role) >= roleLevel(min));
        }
      }
    });

    it('deixa os papeis superiores herdarem a regua de ADMIN', () => {
      expect(hasAtLeast(UserRole.ADMIN, UserRole.ADMIN)).toBe(true);
      expect(hasAtLeast(UserRole.ADMIN_SENIOR, UserRole.ADMIN)).toBe(true);
      expect(hasAtLeast(UserRole.SUPER_ADMIN, UserRole.ADMIN)).toBe(true);
      expect(hasAtLeast(UserRole.STUDENT, UserRole.ADMIN)).toBe(false);
    });
  });

  describe('isAssignableRole', () => {
    it('nunca considera SUPER_ADMIN atribuivel', () => {
      expect(isAssignableRole(UserRole.SUPER_ADMIN)).toBe(false);
      expect(ASSIGNABLE_ROLES).not.toContain(UserRole.SUPER_ADMIN);
    });

    it('aceita os demais papeis', () => {
      expect(isAssignableRole(UserRole.STUDENT)).toBe(true);
      expect(isAssignableRole(UserRole.ADMIN)).toBe(true);
      expect(isAssignableRole(UserRole.ADMIN_SENIOR)).toBe(true);
    });
  });

  describe('canManageRole', () => {
    it('deixa o ADMIN_SENIOR gerenciar ADMIN e STUDENT', () => {
      expect(canManageRole(UserRole.ADMIN_SENIOR, UserRole.ADMIN)).toBe(true);
      expect(canManageRole(UserRole.ADMIN_SENIOR, UserRole.STUDENT)).toBe(true);
    });

    it('barra alvo de papel igual ou superior ao do ator', () => {
      expect(canManageRole(UserRole.ADMIN_SENIOR, UserRole.ADMIN_SENIOR)).toBe(
        false,
      );
      expect(canManageRole(UserRole.ADMIN_SENIOR, UserRole.SUPER_ADMIN)).toBe(
        false,
      );
      expect(canManageRole(UserRole.SUPER_ADMIN, UserRole.SUPER_ADMIN)).toBe(
        false,
      );
    });

    it('nao deixa o ADMIN gerenciar outro ADMIN', () => {
      expect(canManageRole(UserRole.ADMIN, UserRole.ADMIN)).toBe(false);
    });
  });

  describe('canAssignRole', () => {
    it('deixa o ADMIN_SENIOR conceder ADMIN e revogar para STUDENT', () => {
      expect(canAssignRole(UserRole.ADMIN_SENIOR, UserRole.ADMIN)).toBe(true);
      expect(canAssignRole(UserRole.ADMIN_SENIOR, UserRole.STUDENT)).toBe(true);
    });

    it('nao deixa ninguem clonar o proprio nivel', () => {
      expect(canAssignRole(UserRole.ADMIN_SENIOR, UserRole.ADMIN_SENIOR)).toBe(
        false,
      );
      expect(canAssignRole(UserRole.SUPER_ADMIN, UserRole.SUPER_ADMIN)).toBe(
        false,
      );
    });

    it('recusa SUPER_ADMIN ate para um SUPER_ADMIN', () => {
      expect(canAssignRole(UserRole.SUPER_ADMIN, UserRole.SUPER_ADMIN)).toBe(
        false,
      );
    });

    it('deixa o SUPER_ADMIN conceder ADMIN_SENIOR', () => {
      expect(canAssignRole(UserRole.SUPER_ADMIN, UserRole.ADMIN_SENIOR)).toBe(
        true,
      );
    });
  });
});
