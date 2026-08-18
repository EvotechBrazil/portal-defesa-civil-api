import { Injectable } from '@nestjs/common';
import {
  EmailVerificationToken,
  RefreshToken,
  Tenant,
  User,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export type EmailVerificationTokenWithUser = EmailVerificationToken & {
  user: User;
};

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveTenantBySlug(slug: string): Promise<Tenant | null> {
    return this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null, status: 'ACTIVE' },
    });
  }

  createEmailVerificationToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<EmailVerificationToken> {
    return this.prisma.emailVerificationToken.create({ data });
  }

  findEmailVerificationTokenByHash(
    tokenHash: string,
  ): Promise<EmailVerificationTokenWithUser | null> {
    return this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  async markEmailVerificationUsed(
    tokenId: string,
    userId: string,
    usedAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: tokenId },
        data: { usedAt },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: usedAt },
      }),
    ]);
  }

  createRefreshToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({ data });
  }

  findRefreshTokenByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
  }

  rotateRefreshToken(params: {
    previousId: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    revokedAt: Date;
  }): Promise<RefreshToken> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          userId: params.userId,
          tokenHash: params.tokenHash,
          expiresAt: params.expiresAt,
        },
      });
      await tx.refreshToken.update({
        where: { id: params.previousId },
        data: {
          revokedAt: params.revokedAt,
          replacedById: created.id,
        },
      });
      return created;
    });
  }

  async revokeRefreshToken(
    id: string,
    revokedAt: Date,
    replacedById?: string,
  ): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt, replacedById },
    });
  }

  async revokeAllUserRefreshTokens(
    userId: string,
    revokedAt: Date,
  ): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt },
    });
  }
}
