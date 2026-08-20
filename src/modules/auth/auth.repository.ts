import { Injectable } from '@nestjs/common';
import {
  EmailVerificationToken,
  PasswordResetToken,
  RefreshToken,
  Tenant,
  User,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export type EmailVerificationTokenWithUser = EmailVerificationToken & {
  user: User;
};

export type PasswordResetTokenWithUser = PasswordResetToken & {
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

  /**
   * Revoga o token anterior de forma condicional antes de emitir o novo.
   * Devolve `null` quando outra requisição já revogou aquele token — é o sinal
   * de reuso/corrida que o serviço traduz em revogação da cadeia inteira.
   */
  rotateRefreshToken(params: {
    previousId: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    revokedAt: Date;
  }): Promise<RefreshToken | null> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: params.previousId, revokedAt: null },
        data: { revokedAt: params.revokedAt },
      });
      if (claimed.count === 0) {
        return null;
      }
      const created = await tx.refreshToken.create({
        data: {
          userId: params.userId,
          tokenHash: params.tokenHash,
          expiresAt: params.expiresAt,
        },
      });
      await tx.refreshToken.update({
        where: { id: params.previousId },
        data: { replacedById: created.id },
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

  findLatestPasswordResetToken(
    userId: string,
  ): Promise<PasswordResetToken | null> {
    return this.prisma.passwordResetToken.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findPasswordResetTokenByHash(
    tokenHash: string,
  ): Promise<PasswordResetTokenWithUser | null> {
    return this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  /**
   * Invalida os tokens ainda válidos e emite um novo na mesma transação —
   * dois links vivos ao mesmo tempo é o mesmo que não ter expiração.
   */
  async rotatePasswordResetToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<PasswordResetToken> {
    return this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: {
          userId: data.userId,
          usedAt: null,
          expiresAt: { gt: data.now },
        },
        data: { usedAt: data.now },
      });
      return tx.passwordResetToken.create({
        data: {
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        },
      });
    });
  }

  /**
   * Consome o token, grava a senha nova, marca o e-mail se ainda não estava
   * verificado e derruba todas as sessões. Tudo na mesma transação: trocar a
   * senha e deixar o refresh antigo vivo anula a troca.
   *
   * Devolve `false` quando outra requisição já marcou o token — o serviço
   * traduz isso na mesma 400 genérica de token inválido.
   */
  consumePasswordReset(params: {
    tokenId: string;
    userId: string;
    passwordHash: string;
    usedAt: Date;
    verifyEmail: boolean;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: params.tokenId, usedAt: null },
        data: { usedAt: params.usedAt },
      });
      if (claimed.count === 0) {
        return false;
      }
      await tx.user.update({
        where: { id: params.userId },
        data: {
          passwordHash: params.passwordHash,
          ...(params.verifyEmail ? { emailVerifiedAt: params.usedAt } : {}),
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId: params.userId, revokedAt: null },
        data: { revokedAt: params.usedAt },
      });
      return true;
    });
  }
}
