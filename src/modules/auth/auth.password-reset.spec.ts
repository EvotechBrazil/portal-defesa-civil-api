import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PasswordResetToken, User, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { UsersRepository } from '../users/users.repository';
import { UsersService } from '../users/users.service';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import {
  FORGOT_PASSWORD_ACK_MESSAGE,
  RESET_PASSWORD_INVALID_MESSAGE,
} from './auth.types';
import { MailService } from '../mail/mail.service';

function buildUser(overrides?: Partial<User>): User {
  return {
    id: 'user-1',
    tenantId: 'tenant-default',
    email: 'ana@example.com',
    name: 'Ana Silva',
    passwordHash: 'hashed',
    role: UserRole.STUDENT,
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    lastLoginAt: null,
    whatsapp: null,
    lgndNumber: null,
    manada: null,
    city: null,
    squad: null,
    eventoFire: null,
    manadaId: null,
    country: null,
    state: null,
    photoBytes: null,
    photoMime: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function buildResetToken(
  user: User,
  overrides?: Partial<PasswordResetToken>,
): PasswordResetToken & { user: User } {
  return {
    id: 'prt-1',
    userId: user.id,
    tokenHash: 'hash',
    expiresAt: new Date('2026-06-01T13:00:00.000Z'),
    usedAt: null,
    createdAt: new Date('2026-06-01T12:00:00.000Z'),
    user,
    ...overrides,
  };
}

describe('AuthService password reset', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');
  const tenant = {
    id: 'tenant-default',
    slug: 'default',
    name: 'Default',
    status: 'ACTIVE' as const,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  let authRepository: {
    findActiveTenantBySlug: jest.Mock;
    findLatestPasswordResetToken: jest.Mock;
    findPasswordResetTokenByHash: jest.Mock;
    rotatePasswordResetToken: jest.Mock;
    consumePasswordReset: jest.Mock;
    findRefreshTokenByHash: jest.Mock;
    rotateRefreshToken: jest.Mock;
    revokeRefreshToken: jest.Mock;
    revokeAllUserRefreshTokens: jest.Mock;
    createRefreshToken: jest.Mock;
    createEmailVerificationToken: jest.Mock;
    findEmailVerificationTokenByHash: jest.Mock;
    markEmailVerificationUsed: jest.Mock;
  };
  let usersRepository: {
    findActiveById: jest.Mock;
    findActiveByEmail: jest.Mock;
    findActiveByWhatsapp: jest.Mock;
    findActiveByIdInTenant: jest.Mock;
    appendAudit: jest.Mock;
    createStudent: jest.Mock;
    updateLastLoginAt: jest.Mock;
  };
  let mailService: {
    sendVerificationEmail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
  };
  let service: AuthService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);

    authRepository = {
      findActiveTenantBySlug: jest.fn().mockResolvedValue(tenant),
      findLatestPasswordResetToken: jest.fn().mockResolvedValue(null),
      findPasswordResetTokenByHash: jest.fn(),
      rotatePasswordResetToken: jest.fn(),
      consumePasswordReset: jest.fn().mockResolvedValue(true),
      findRefreshTokenByHash: jest.fn(),
      rotateRefreshToken: jest.fn(),
      revokeRefreshToken: jest.fn(),
      revokeAllUserRefreshTokens: jest.fn(),
      createRefreshToken: jest.fn(),
      createEmailVerificationToken: jest.fn(),
      findEmailVerificationTokenByHash: jest.fn(),
      markEmailVerificationUsed: jest.fn(),
    };
    usersRepository = {
      findActiveById: jest.fn(),
      findActiveByEmail: jest.fn(),
      findActiveByWhatsapp: jest.fn(),
      findActiveByIdInTenant: jest.fn(),
      appendAudit: jest.fn().mockResolvedValue(undefined),
      createStudent: jest.fn(),
      updateLastLoginAt: jest.fn(),
    };
    mailService = {
      sendVerificationEmail: jest.fn(),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };

    service = new AuthService(
      authRepository as unknown as AuthRepository,
      usersRepository as unknown as UsersRepository,
      { getMe: jest.fn() } as unknown as UsersService,
      { sign: jest.fn() } as unknown as JwtService,
      {
        getOrThrow: jest.fn((key: string) => {
          if (key === 'jwt.refreshTtlSeconds') {
            return 60 * 60 * 24 * 7;
          }
          if (key === 'mail.webBaseUrl') {
            return 'http://localhost:3000';
          }
          throw new Error(`unexpected config key ${key}`);
        }),
      } as unknown as ConfigService,
      mailService as unknown as MailService,
      {
        parseWhatsapp: jest.fn(),
        assertCanRegister: jest.fn(),
        markRegistered: jest.fn(),
      } as never,
      {
        getById: jest.fn(),
        findOrCreate: jest.fn(),
      } as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('forgotPassword', () => {
    it('returns the same ack for missing and existing e-mail and never leaks the token', async () => {
      usersRepository.findActiveByEmail.mockResolvedValueOnce(null);
      const missing = await service.forgotPassword({
        email: 'missing@example.com',
      });

      usersRepository.findActiveByEmail.mockResolvedValueOnce(buildUser());
      const existing = await service.forgotPassword({
        email: 'ana@example.com',
      });

      expect(missing).toEqual(existing);
      expect(missing).toEqual({ message: FORGOT_PASSWORD_ACK_MESSAGE });
      expect(JSON.stringify(missing)).not.toMatch(/token/i);
      expect(JSON.stringify(existing)).not.toMatch(/localhost:3000/);
      expect(authRepository.rotatePasswordResetToken).toHaveBeenCalledTimes(1);
      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    });

    it('skips a new token when the last one is inside the 60s cooldown', async () => {
      const user = buildUser();
      usersRepository.findActiveByEmail.mockResolvedValue(user);
      authRepository.findLatestPasswordResetToken.mockResolvedValue(
        buildResetToken(user, {
          createdAt: new Date(now.getTime() - 59_000),
        }),
      );

      const result = await service.forgotPassword({ email: user.email });

      expect(result).toEqual({ message: FORGOT_PASSWORD_ACK_MESSAGE });
      expect(authRepository.rotatePasswordResetToken).not.toHaveBeenCalled();
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('issues a new token when the last one is older than 60s', async () => {
      const user = buildUser();
      usersRepository.findActiveByEmail.mockResolvedValue(user);
      authRepository.findLatestPasswordResetToken.mockResolvedValue(
        buildResetToken(user, {
          createdAt: new Date(now.getTime() - 60_000),
        }),
      );

      await service.forgotPassword({ email: user.email });

      expect(authRepository.rotatePasswordResetToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          now,
          expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        }),
      );
      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        user.email,
        expect.any(String),
      );
    });
  });

  describe('resetPassword', () => {
    const password = 'new-password-12';

    it('returns the same generic 400 for missing, expired and already used tokens', async () => {
      const user = buildUser();
      authRepository.findPasswordResetTokenByHash
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          buildResetToken(user, {
            expiresAt: new Date(now.getTime() - 1),
          }),
        )
        .mockResolvedValueOnce(
          buildResetToken(user, { usedAt: new Date(now.getTime() - 1) }),
        );

      const missing = service.resetPassword({ token: 'tampered', password });
      const expired = service.resetPassword({ token: 'expired', password });
      const used = service.resetPassword({ token: 'used', password });

      await expect(missing).rejects.toBeInstanceOf(BadRequestException);
      await expect(expired).rejects.toBeInstanceOf(BadRequestException);
      await expect(used).rejects.toBeInstanceOf(BadRequestException);

      const [missingErr, expiredErr, usedErr] = await Promise.all([
        missing.catch((error: unknown) => error),
        expired.catch((error: unknown) => error),
        used.catch((error: unknown) => error),
      ]);
      expect((missingErr as BadRequestException).message).toBe(
        RESET_PASSWORD_INVALID_MESSAGE,
      );
      expect((expiredErr as BadRequestException).message).toBe(
        (missingErr as BadRequestException).message,
      );
      expect((usedErr as BadRequestException).message).toBe(
        (missingErr as BadRequestException).message,
      );
      expect(authRepository.consumePasswordReset).not.toHaveBeenCalled();
    });

    it('consumes the token, hashes the password and asks the repository to revoke sessions', async () => {
      const user = buildUser({ emailVerifiedAt: null });
      authRepository.findPasswordResetTokenByHash.mockResolvedValue(
        buildResetToken(user),
      );

      await expect(
        service.resetPassword({ token: 'valid-token', password }),
      ).resolves.toEqual({ reset: true });

      expect(authRepository.consumePasswordReset).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenId: 'prt-1',
          userId: user.id,
          usedAt: now,
          verifyEmail: true,
        }),
      );
      expect(authRepository.consumePasswordReset).toHaveBeenCalledWith(
        expect.not.objectContaining({ passwordHash: password }),
      );
    });
  });

  describe('issueAdminPasswordReset', () => {
    const actor: AuthenticatedUser = {
      id: 'senior-1',
      email: 'senior@portal.local',
      role: UserRole.ADMIN_SENIOR,
      tenantId: 'tenant-default',
    };

    it('returns the link, does not send e-mail, logs and writes audit', async () => {
      const target = buildUser();
      usersRepository.findActiveByIdInTenant.mockResolvedValue(target);
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);

      const result = await service.issueAdminPasswordReset(
        actor,
        actor.tenantId,
        target.id,
      );

      expect(result.resetUrl).toMatch(
        /^http:\/\/localhost:3000\/redefinir-senha\?token=/,
      );
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(authRepository.rotatePasswordResetToken).toHaveBeenCalledWith(
        expect.objectContaining({ userId: target.id, now }),
      );
      expect(usersRepository.appendAudit).toHaveBeenCalledWith({
        tenantId: actor.tenantId,
        event: 'user.password_reset.issued',
        actorId: actor.id,
        targetId: target.id,
      });
      expect(logSpy).toHaveBeenCalledWith(
        JSON.stringify({
          event: 'user.password_reset.issued',
          tenantId: actor.tenantId,
          actorId: actor.id,
          targetId: target.id,
          timestamp: now.toISOString(),
        }),
      );
      logSpy.mockRestore();
    });

    it('returns 404 for missing, other-tenant or soft-deleted target', async () => {
      usersRepository.findActiveByIdInTenant.mockResolvedValue(null);

      await expect(
        service.issueAdminPasswordReset(actor, actor.tenantId, 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(authRepository.rotatePasswordResetToken).not.toHaveBeenCalled();
    });

    it('returns 403 for equal or higher target role', async () => {
      usersRepository.findActiveByIdInTenant.mockResolvedValue(
        buildUser({ role: UserRole.ADMIN_SENIOR }),
      );

      await expect(
        service.issueAdminPasswordReset(actor, actor.tenantId, 'peer'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(authRepository.rotatePasswordResetToken).not.toHaveBeenCalled();
      expect(usersRepository.appendAudit).not.toHaveBeenCalled();
    });
  });
});
