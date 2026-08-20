import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { AccessService } from '../access/access.service';
import { decodePhotoBase64 } from '../access/photo.util';
import { ManadasService } from '../manadas/manadas.service';
import { toUserProfile, UsersService } from '../users/users.service';
import { UsersRepository } from '../users/users.repository';
import {
  DUMMY_PASSWORD_HASH,
  generateOpaqueToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from './auth.crypto';
import { AuthRepository } from './auth.repository';
import {
  AdminPasswordResetResult,
  AuthUserView,
  FORGOT_PASSWORD_ACK_MESSAGE,
  ForgotPasswordResult,
  JwtAccessPayload,
  LoginResult,
  RegisterResult,
  RESET_PASSWORD_INVALID_MESSAGE,
  ResetPasswordResult,
  TokenPair,
  VerifyEmailResult,
} from './auth.types';
import { EmailDto } from './dtos/email.dto';
import { LoginDto } from './dtos/login.dto';
import { RefreshDto } from './dtos/refresh.dto';
import { RegisterDto } from './dtos/register.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { TokenDto } from './dtos/token.dto';
import { MailService } from '../mail/mail.service';

const DEFAULT_TENANT_SLUG = 'default';
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;

const FORGOT_PASSWORD_ACK: ForgotPasswordResult = {
  message: FORGOT_PASSWORD_ACK_MESSAGE,
};

function isPrismaUniqueConstraint(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  return error.code === 'P2002';
}

function uniqueConstraintTargets(error: unknown): string[] {
  if (typeof error !== 'object' || error === null || !('meta' in error)) {
    return [];
  }
  const meta = (error as { meta?: { target?: unknown } }).meta;
  if (!meta || !Array.isArray(meta.target)) {
    return [];
  }
  return meta.target.filter((item): item is string => typeof item === 'string');
}

function conflictMessageForUnique(error: unknown): string {
  const target = uniqueConstraintTargets(error).join('.').toLowerCase();
  if (target.includes('whatsapp')) {
    return 'WhatsApp já cadastrado';
  }
  return 'E-mail já cadastrado';
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly usersRepository: UsersRepository,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly accessService: AccessService,
    private readonly manadasService: ManadasService,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResult> {
    const tenant =
      await this.authRepository.findActiveTenantBySlug(DEFAULT_TENANT_SLUG);
    if (!tenant) {
      throw new InternalServerErrorException(
        'Default tenant is not configured',
      );
    }

    const email = normalizeEmail(dto.email);
    const whatsapp = this.accessService.parseWhatsapp(dto.whatsapp);
    await this.accessService.assertCanRegister(tenant.id, whatsapp);

    const existing = await this.usersRepository.findActiveByEmail(
      tenant.id,
      email,
    );
    if (existing) {
      throw new ConflictException('E-mail já cadastrado');
    }
    const existingWhatsapp = await this.usersRepository.findActiveByWhatsapp(
      tenant.id,
      whatsapp,
    );
    if (existingWhatsapp) {
      throw new ConflictException('WhatsApp já cadastrado');
    }

    const pack = await this.resolveManada(tenant.id, dto);
    const photo = dto.photoBase64
      ? decodePhotoBase64(dto.photoBase64)
      : undefined;
    const passwordHash = await hashPassword(dto.password);
    const autoVerify =
      this.configService.get<boolean>('mail.autoVerifyEmail') === true;
    let user: User;
    try {
      user = await this.usersRepository.createStudent({
        tenantId: tenant.id,
        email,
        name: dto.name.trim(),
        passwordHash,
        emailVerifiedAt: autoVerify ? new Date() : undefined,
        whatsapp,
        lgndNumber: dto.lgndNumber.trim(),
        manada: pack.name,
        manadaId: pack.id,
        country: dto.country.trim().toUpperCase(),
        state: dto.state.trim(),
        city: dto.city.trim(),
        squad: dto.squad.trim(),
        eventoFire: dto.eventoFire.trim(),
        photoBytes: photo?.bytes,
        photoMime: photo?.mime,
      });
    } catch (error: unknown) {
      if (isPrismaUniqueConstraint(error)) {
        throw new ConflictException(conflictMessageForUnique(error));
      }
      throw error;
    }
    await this.accessService.markRegistered(tenant.id, whatsapp);

    if (!autoVerify) {
      await this.issueVerificationEmail(user);
    }
    return { id: user.id, email: user.email, name: user.name };
  }

  async verifyEmail(dto: TokenDto): Promise<VerifyEmailResult> {
    const record = await this.authRepository.findEmailVerificationTokenByHash(
      hashToken(dto.token),
    );
    if (
      !record ||
      record.expiresAt.getTime() <= Date.now() ||
      record.user.deletedAt
    ) {
      throw new BadRequestException(
        'Token de verificação inválido ou expirado.',
      );
    }
    if (record.usedAt) {
      if (record.user.emailVerifiedAt) {
        return { verified: true };
      }
      throw new BadRequestException(
        'Token de verificação inválido ou expirado.',
      );
    }

    await this.authRepository.markEmailVerificationUsed(
      record.id,
      record.userId,
      new Date(),
    );
    return { verified: true };
  }

  async forgotPassword(dto: EmailDto): Promise<ForgotPasswordResult> {
    const tenant =
      await this.authRepository.findActiveTenantBySlug(DEFAULT_TENANT_SLUG);
    if (!tenant) {
      return FORGOT_PASSWORD_ACK;
    }

    const user = await this.usersRepository.findActiveByEmail(
      tenant.id,
      normalizeEmail(dto.email),
    );
    if (!user) {
      return FORGOT_PASSWORD_ACK;
    }

    const now = new Date();
    const latest = await this.authRepository.findLatestPasswordResetToken(
      user.id,
    );
    if (
      latest &&
      now.getTime() - latest.createdAt.getTime() < PASSWORD_RESET_COOLDOWN_MS
    ) {
      return FORGOT_PASSWORD_ACK;
    }

    await this.issuePasswordResetEmail(user, now);
    return FORGOT_PASSWORD_ACK;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<ResetPasswordResult> {
    const record = await this.authRepository.findPasswordResetTokenByHash(
      hashToken(dto.token),
    );
    if (
      !record ||
      record.usedAt ||
      record.expiresAt.getTime() <= Date.now() ||
      record.user.deletedAt
    ) {
      throw new BadRequestException(RESET_PASSWORD_INVALID_MESSAGE);
    }

    const consumed = await this.authRepository.consumePasswordReset({
      tokenId: record.id,
      userId: record.userId,
      passwordHash: await hashPassword(dto.password),
      usedAt: new Date(),
      verifyEmail: record.user.emailVerifiedAt === null,
    });
    if (!consumed) {
      throw new BadRequestException(RESET_PASSWORD_INVALID_MESSAGE);
    }
    return { reset: true };
  }

  async issueAdminPasswordReset(
    actor: AuthenticatedUser,
    tenantId: string,
    userId: string,
  ): Promise<AdminPasswordResetResult> {
    const target = await this.usersRepository.findActiveByIdInTenant(
      tenantId,
      userId,
    );
    if (!target) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    const now = new Date();
    const rawToken = await this.issuePasswordResetToken(target.id, now);
    this.logger.log(
      JSON.stringify({
        event: 'user.password_reset.issued',
        tenantId,
        actorId: actor.id,
        targetId: target.id,
        timestamp: now.toISOString(),
      }),
    );
    return { resetUrl: this.buildPasswordResetUrl(rawToken) };
  }

  async resendVerification(dto: EmailDto): Promise<void> {
    const tenant =
      await this.authRepository.findActiveTenantBySlug(DEFAULT_TENANT_SLUG);
    if (!tenant) {
      return;
    }

    const user = await this.usersRepository.findActiveByEmail(
      tenant.id,
      normalizeEmail(dto.email),
    );
    if (!user || user.emailVerifiedAt) {
      return;
    }

    await this.issueVerificationEmail(user);
  }

  async login(dto: LoginDto): Promise<LoginResult> {
    const tenant =
      await this.authRepository.findActiveTenantBySlug(DEFAULT_TENANT_SLUG);
    if (!tenant) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const user = await this.usersRepository.findActiveByEmail(
      tenant.id,
      normalizeEmail(dto.email),
    );
    // Sempre roda o bcrypt, exista o usuário ou não: caminhos com custo de CPU
    // diferente vazam a existência da conta pelo tempo de resposta.
    const passwordMatches = await verifyPassword(
      dto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Verifique seu e-mail antes de entrar.');
    }

    await this.usersRepository.updateLastLoginAt(user.id, new Date());
    const tokens = await this.issueTokenPair(user);
    return { ...tokens, user: toUserProfile(user) };
  }

  async refresh(dto: RefreshDto): Promise<TokenPair> {
    const existing = await this.authRepository.findRefreshTokenByHash(
      hashToken(dto.refreshToken),
    );
    if (!existing) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    if (existing.revokedAt) {
      await this.authRepository.revokeAllUserRefreshTokens(
        existing.userId,
        new Date(),
      );
      throw new UnauthorizedException('Refresh token inválido.');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      await this.authRepository.revokeRefreshToken(existing.id, new Date());
      throw new UnauthorizedException('Refresh token inválido.');
    }

    const user = await this.usersRepository.findActiveById(existing.userId);
    if (!user) {
      await this.authRepository.revokeAllUserRefreshTokens(
        existing.userId,
        new Date(),
      );
      throw new UnauthorizedException('Refresh token inválido.');
    }

    const refreshToken = generateOpaqueToken();
    const ttlSeconds = this.configService.getOrThrow<number>(
      'jwt.refreshTtlSeconds',
    );
    const rotated = await this.authRepository.rotateRefreshToken({
      previousId: existing.id,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      revokedAt: new Date(),
    });
    if (!rotated) {
      // Outra requisição rotacionou o mesmo token entre a leitura e a escrita:
      // é reuso, e reuso derruba a cadeia inteira.
      await this.authRepository.revokeAllUserRefreshTokens(
        existing.userId,
        new Date(),
      );
      throw new UnauthorizedException('Refresh token inválido.');
    }

    return {
      accessToken: this.signAccessToken(user),
      refreshToken,
    };
  }

  async logout(dto: RefreshDto): Promise<void> {
    const existing = await this.authRepository.findRefreshTokenByHash(
      hashToken(dto.refreshToken),
    );
    if (existing && !existing.revokedAt) {
      await this.authRepository.revokeRefreshToken(existing.id, new Date());
    }
  }

  me(currentUser: AuthenticatedUser): Promise<AuthUserView> {
    return this.usersService.getMe(currentUser.id);
  }

  private async resolveManada(
    tenantId: string,
    dto: RegisterDto,
  ): Promise<{ id: string; name: string; country: string; state: string }> {
    if (dto.manadaId) {
      const found = await this.manadasService.getById(tenantId, dto.manadaId);
      return {
        id: found.id,
        name: found.name,
        country: found.country,
        state: found.state,
      };
    }
    if (!dto.manada?.trim()) {
      throw new BadRequestException('Informe a manada.');
    }
    const created = await this.manadasService.findOrCreate(tenantId, {
      name: dto.manada,
      country: dto.country,
      state: dto.state,
      city: dto.city,
    });
    return {
      id: created.id,
      name: created.name,
      country: created.country,
      state: created.state,
    };
  }

  private signAccessToken(user: User): string {
    const payload: JwtAccessPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    };
    return this.jwtService.sign(payload);
  }

  private async issueTokenPair(user: User): Promise<TokenPair> {
    const refreshToken = generateOpaqueToken();
    const ttlSeconds = this.configService.getOrThrow<number>(
      'jwt.refreshTtlSeconds',
    );
    await this.authRepository.createRefreshToken({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    });
    return {
      accessToken: this.signAccessToken(user),
      refreshToken,
    };
  }

  private buildPasswordResetUrl(rawToken: string): string {
    const webBaseUrl = this.configService.getOrThrow<string>('mail.webBaseUrl');
    return `${webBaseUrl}/redefinir-senha?token=${encodeURIComponent(rawToken)}`;
  }

  private async issuePasswordResetToken(
    userId: string,
    now: Date,
  ): Promise<string> {
    const rawToken = generateOpaqueToken();
    await this.authRepository.rotatePasswordResetToken({
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
      now,
    });
    return rawToken;
  }

  private async issuePasswordResetEmail(user: User, now: Date): Promise<void> {
    const rawToken = await this.issuePasswordResetToken(user.id, now);
    try {
      await this.mailService.sendPasswordResetEmail(user.email, rawToken);
    } catch (error: unknown) {
      this.logger.error(
        `Password reset email was not delivered for user ${user.id}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async issueVerificationEmail(user: User): Promise<void> {
    const rawToken = generateOpaqueToken();
    await this.authRepository.createEmailVerificationToken({
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    });

    try {
      await this.mailService.sendVerificationEmail(user.email, rawToken);
    } catch (error: unknown) {
      this.logger.error(
        `Verification email was not delivered for user ${user.id}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
