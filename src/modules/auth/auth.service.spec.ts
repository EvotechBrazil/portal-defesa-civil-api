import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import { UsersRepository } from '../users/users.repository';
import { UsersService } from '../users/users.service';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { MailService } from './mail.service';

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
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('AuthService refresh rotation', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');
  let authRepository: {
    findRefreshTokenByHash: jest.Mock;
    rotateRefreshToken: jest.Mock;
    revokeRefreshToken: jest.Mock;
    revokeAllUserRefreshTokens: jest.Mock;
    createRefreshToken: jest.Mock;
    findActiveTenantBySlug: jest.Mock;
    createEmailVerificationToken: jest.Mock;
    findEmailVerificationTokenByHash: jest.Mock;
    markEmailVerificationUsed: jest.Mock;
  };
  let usersRepository: {
    findActiveById: jest.Mock;
    findActiveByEmail: jest.Mock;
    createStudent: jest.Mock;
    updateLastLoginAt: jest.Mock;
  };
  let jwtService: { sign: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);

    authRepository = {
      findRefreshTokenByHash: jest.fn(),
      rotateRefreshToken: jest.fn(),
      revokeRefreshToken: jest.fn(),
      revokeAllUserRefreshTokens: jest.fn(),
      createRefreshToken: jest.fn(),
      findActiveTenantBySlug: jest.fn(),
      createEmailVerificationToken: jest.fn(),
      findEmailVerificationTokenByHash: jest.fn(),
      markEmailVerificationUsed: jest.fn(),
    };
    usersRepository = {
      findActiveById: jest.fn(),
      findActiveByEmail: jest.fn(),
      createStudent: jest.fn(),
      updateLastLoginAt: jest.fn(),
    };
    jwtService = { sign: jest.fn().mockReturnValue('signed-access-token') };

    service = new AuthService(
      authRepository as unknown as AuthRepository,
      usersRepository as unknown as UsersRepository,
      { getMe: jest.fn() } as unknown as UsersService,
      jwtService as unknown as JwtService,
      {
        getOrThrow: jest.fn((key: string) => {
          if (key === 'jwt.refreshTtlSeconds') {
            return 60 * 60 * 24 * 7;
          }
          throw new Error(`unexpected config key ${key}`);
        }),
      } as unknown as ConfigService,
      { sendVerificationEmail: jest.fn() } as unknown as MailService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rotates a valid refresh token and revokes the previous one', async () => {
    const user = buildUser();
    authRepository.findRefreshTokenByHash.mockResolvedValue({
      id: 'rt-old',
      userId: user.id,
      tokenHash: 'old-hash',
      expiresAt: new Date(now.getTime() + 60_000),
      revokedAt: null,
      replacedById: null,
      createdAt: now,
    });
    usersRepository.findActiveById.mockResolvedValue(user);
    authRepository.rotateRefreshToken.mockResolvedValue({
      id: 'rt-new',
      userId: user.id,
      tokenHash: 'new-hash',
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      revokedAt: null,
      replacedById: null,
      createdAt: now,
    });

    const result = await service.refresh({ refreshToken: 'old-refresh' });

    expect(result.accessToken).toBe('signed-access-token');
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.refreshToken).not.toBe('old-refresh');
    expect(authRepository.rotateRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        previousId: 'rt-old',
        userId: user.id,
        revokedAt: now,
      }),
    );
    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    });
    expect(authRepository.revokeAllUserRefreshTokens).not.toHaveBeenCalled();
  });

  it('revokes the entire user chain when a revoked refresh token is reused', async () => {
    authRepository.findRefreshTokenByHash.mockResolvedValue({
      id: 'rt-old',
      userId: 'user-1',
      tokenHash: 'old-hash',
      expiresAt: new Date(now.getTime() + 60_000),
      revokedAt: new Date(now.getTime() - 1_000),
      replacedById: 'rt-new',
      createdAt: now,
    });

    await expect(
      service.refresh({ refreshToken: 'reused-refresh' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authRepository.revokeAllUserRefreshTokens).toHaveBeenCalledWith(
      'user-1',
      now,
    );
    expect(authRepository.rotateRefreshToken).not.toHaveBeenCalled();
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('does not treat an expired unused token as reuse', async () => {
    authRepository.findRefreshTokenByHash.mockResolvedValue({
      id: 'rt-old',
      userId: 'user-1',
      tokenHash: 'old-hash',
      expiresAt: new Date(now.getTime() - 1_000),
      revokedAt: null,
      replacedById: null,
      createdAt: now,
    });

    await expect(
      service.refresh({ refreshToken: 'expired-refresh' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authRepository.revokeRefreshToken).toHaveBeenCalledWith(
      'rt-old',
      now,
    );
    expect(authRepository.revokeAllUserRefreshTokens).not.toHaveBeenCalled();
    expect(authRepository.rotateRefreshToken).not.toHaveBeenCalled();
  });
});
