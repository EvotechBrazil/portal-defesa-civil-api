import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { hashToken } from '../src/modules/auth/auth.crypto';
import {
  FORGOT_PASSWORD_ACK_MESSAGE,
  RESET_PASSWORD_INVALID_MESSAGE,
} from '../src/modules/auth/auth.types';
import {
  allowWhatsapp,
  bearerFor,
  cleanupTestTenants,
  cleanupTestWhatsapps,
  createSecondTenant,
  issuePasswordResetToken,
  registerPayload,
  resolveVerificationToken,
  signAccessToken,
  uniqueWhatsapp,
} from './helpers/auth.helper';

interface Envelope<T> {
  data: T;
}

interface RegisterData {
  id: string;
  email: string;
  name: string;
}

interface LoginData {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    tenantId: string;
  };
}

interface TokenPairData {
  accessToken: string;
  refreshToken: string;
}

interface MeData {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
}

function expectNoSecretLeak(body: unknown, password: string): void {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain(password);
  expect(serialized).not.toMatch(/passwordHash/i);
  expect(serialized.toLowerCase()).not.toContain('"password"');
}

function errorMessage(body: unknown): string {
  if (
    body &&
    typeof body === 'object' &&
    'message' in body &&
    typeof body.message === 'string'
  ) {
    return body.message;
  }
  throw new Error('Response is missing message');
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let server: App;
  let prisma: PrismaService;
  let seq = 0;

  function uniqueEmail(label: string): string {
    seq += 1;
    return `auth-${label}-${Date.now()}-${seq}@example.com`;
  }

  async function registerStudent(input: {
    email: string;
    name: string;
    password: string;
  }) {
    const whatsapp = uniqueWhatsapp();
    await allowWhatsapp(prisma, whatsapp);
    return request(server)
      .post('/api/v1/auth/register')
      .send(registerPayload({ ...input, whatsapp }))
      .expect(201);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    server = app.getHttpServer() as App;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await cleanupTestWhatsapps(prisma);
    await cleanupTestTenants(prisma);
    await app.close();
  });

  it('registers, verifies from mailbox/db, then logs in', async () => {
    const email = uniqueEmail('happy');
    const password = 'password12';
    const name = 'Ana Silva';

    const registerRes = await registerStudent({ email, name, password });

    const registered = (registerRes.body as Envelope<RegisterData>).data;
    expect(typeof registered.id).toBe('string');
    expect(registered.email).toBe(email);
    expect(registered.name).toBe(name);
    expectNoSecretLeak(registerRes.body, password);

    const stored = await prisma.user.findUnique({
      where: { id: registered.id },
    });
    expect(stored?.passwordHash).toBeTruthy();
    expect(stored?.passwordHash).not.toContain(password);
    expect(stored?.role).toBe('STUDENT');
    expect(stored?.emailVerifiedAt).toBeNull();

    const defaultTenant = await prisma.tenant.findFirst({
      where: { slug: 'default', deletedAt: null },
    });
    expect(stored?.tenantId).toBe(defaultTenant?.id);

    const token = await resolveVerificationToken(prisma, registered.id, email);
    const verifyRes = await request(server)
      .post('/api/v1/auth/verify-email')
      .send({ token })
      .expect(200);

    expect((verifyRes.body as Envelope<{ verified: boolean }>).data).toEqual({
      verified: true,
    });
    expectNoSecretLeak(verifyRes.body, password);

    const loginRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const login = (loginRes.body as Envelope<LoginData>).data;
    expect(typeof login.accessToken).toBe('string');
    expect(typeof login.refreshToken).toBe('string');
    expect(login.user).toMatchObject({
      id: registered.id,
      email,
      name,
      role: 'STUDENT',
      tenantId: defaultTenant?.id,
    });
    expectNoSecretLeak(loginRes.body, password);

    const hashedRefresh = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(login.refreshToken) },
    });
    expect(hashedRefresh).not.toBeNull();
    expect(hashedRefresh?.tokenHash).not.toBe(login.refreshToken);
  });

  it('rejects login before e-mail verification with 403', async () => {
    const email = uniqueEmail('unverified');
    const password = 'password12';

    await registerStudent({
      email,
      name: 'Unverified User',
      password,
    });

    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(403);

    expect(JSON.stringify(res.body)).toMatch(/verif/i);
    expectNoSecretLeak(res.body, password);
  });

  it('always returns 202 on resend-verification without enumerating users', async () => {
    const missing = await request(server)
      .post('/api/v1/auth/resend-verification')
      .send({ email: uniqueEmail('missing') })
      .expect(202);

    const email = uniqueEmail('resend');
    await registerStudent({
      email,
      name: 'Resend User',
      password: 'password12',
    });

    const existing = await request(server)
      .post('/api/v1/auth/resend-verification')
      .send({ email })
      .expect(202);

    expect(JSON.stringify(missing.body)).toBe(JSON.stringify(existing.body));
  });

  it('rotates refresh tokens and revokes the chain on reuse', async () => {
    const email = uniqueEmail('rotate');
    const password = 'password12';
    const registerRes = await registerStudent({
      email,
      name: 'Rotate User',
      password,
    });
    const userId = (registerRes.body as Envelope<RegisterData>).data.id;
    const verifyToken = await resolveVerificationToken(prisma, userId, email);
    await request(server)
      .post('/api/v1/auth/verify-email')
      .send({ token: verifyToken })
      .expect(200);

    const loginRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const firstRefresh = (loginRes.body as Envelope<LoginData>).data
      .refreshToken;

    const rotatedRes = await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefresh })
      .expect(200);
    const rotated = (rotatedRes.body as Envelope<TokenPairData>).data;
    expect(rotated.refreshToken).not.toBe(firstRefresh);
    expect(typeof rotated.accessToken).toBe('string');
    expectNoSecretLeak(rotatedRes.body, password);

    const previous = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(firstRefresh) },
    });
    const current = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rotated.refreshToken) },
    });
    expect(previous?.revokedAt).not.toBeNull();
    expect(previous?.replacedById).toBe(current?.id);

    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefresh })
      .expect(401);

    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.refreshToken })
      .expect(401);

    const leftover = await prisma.refreshToken.findMany({
      where: { userId, revokedAt: null },
    });
    expect(leftover).toHaveLength(0);
  });

  it('logs out a refresh token with 204', async () => {
    const email = uniqueEmail('logout');
    const password = 'password12';
    const registerRes = await registerStudent({
      email,
      name: 'Logout User',
      password,
    });
    const userId = (registerRes.body as Envelope<RegisterData>).data.id;
    const verifyToken = await resolveVerificationToken(prisma, userId, email);
    await request(server)
      .post('/api/v1/auth/verify-email')
      .send({ token: verifyToken })
      .expect(200);
    const loginRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const refreshToken = (loginRes.body as Envelope<LoginData>).data
      .refreshToken;

    await request(server)
      .post('/api/v1/auth/logout')
      .send({ refreshToken })
      .expect(204);

    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('ignores tenantId from body and query and rejects a tampered JWT tenant', async () => {
    const { user, header } = await bearerFor(prisma, {
      email: uniqueEmail('tenant-a'),
    });
    const otherTenant = await createSecondTenant(prisma);

    const loginWithTenant = await request(server)
      .post('/api/v1/auth/login')
      .send({
        email: user.email,
        password: 'password12',
        tenantId: otherTenant.id,
      })
      .expect(400);
    expect(JSON.stringify(loginWithTenant.body)).toMatch(/tenantId/i);

    const meRes = await request(server)
      .get('/api/v1/me')
      .query({ tenantId: otherTenant.id })
      .set(header)
      .expect(200);

    const me = (meRes.body as Envelope<MeData>).data;
    expect(me.tenantId).toBe(user.tenantId);
    expect(me.tenantId).not.toBe(otherTenant.id);
    expect(me).toMatchObject({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    expect(me).not.toHaveProperty('passwordHash');

    const tampered = signAccessToken({ ...user, tenantId: otherTenant.id });
    await request(server)
      .get('/api/v1/me')
      .set({ Authorization: `Bearer ${tampered}` })
      .expect(401);

    const otherUser = await bearerFor(prisma, {
      email: uniqueEmail('tenant-b'),
      tenantId: otherTenant.id,
    });
    const otherMe = await request(server)
      .get('/api/v1/me')
      .set(otherUser.header)
      .expect(200);
    expect((otherMe.body as Envelope<MeData>).data.tenantId).toBe(
      otherTenant.id,
    );
    expect((otherMe.body as Envelope<MeData>).data.id).not.toBe(user.id);
  });

  it('rejects register when the WhatsApp is not on the pre-released list', async () => {
    const res = await request(server)
      .post('/api/v1/auth/register')
      .send(
        registerPayload({
          email: uniqueEmail('blocked'),
          name: 'Blocked User',
          password: 'password12',
          whatsapp: uniqueWhatsapp(),
        }),
      )
      .expect(403);

    expect(JSON.stringify(res.body)).toMatch(/não está liberado/i);
  });

  describe('password reset', () => {
    const FORGOT_ACK = {
      data: { message: FORGOT_PASSWORD_ACK_MESSAGE },
    };

    it('returns the same 200 body for missing and existing e-mail', async () => {
      const email = uniqueEmail('forgot');
      await registerStudent({
        email,
        name: 'Forgot User',
        password: 'password12',
      });

      const missing = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: uniqueEmail('nobody') })
        .expect(200);

      const existing = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email })
        .expect(200);

      expect(missing.body).toEqual(FORGOT_ACK);
      expect(existing.body).toEqual(missing.body);
      expect(JSON.stringify(existing.body)).not.toMatch(/token=/);
      expect(JSON.stringify(existing.body)).not.toMatch(/resetUrl/);
    });

    it('rejects expired, used and tampered tokens with the same 400', async () => {
      const email = uniqueEmail('reset-invalid');
      const registerRes = await registerStudent({
        email,
        name: 'Reset Invalid',
        password: 'password12',
      });
      const userId = (registerRes.body as Envelope<RegisterData>).data.id;

      const expiredToken = await issuePasswordResetToken(prisma, userId, {
        expiresAt: new Date(Date.now() - 1000),
      });
      const usedToken = await issuePasswordResetToken(prisma, userId, {
        usedAt: new Date(),
      });

      const expired = await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token: expiredToken, password: 'newpass12' })
        .expect(400);
      const used = await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token: usedToken, password: 'newpass12' })
        .expect(400);
      const tampered = await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'adulterated-token', password: 'newpass12' })
        .expect(400);

      expect(errorMessage(expired.body)).toBe(RESET_PASSWORD_INVALID_MESSAGE);
      expect(errorMessage(used.body)).toBe(errorMessage(expired.body));
      expect(errorMessage(tampered.body)).toBe(errorMessage(expired.body));
      expect(JSON.stringify(expired.body)).not.toMatch(/expirad[oa] e/);
      expect(JSON.stringify(used.body)).not.toMatch(/já usado|already used/i);
    });

    it('revokes the previous refresh token after a successful reset', async () => {
      const email = uniqueEmail('reset-revoke');
      const oldPassword = 'password12';
      const newPassword = 'newpass34';
      const registerRes = await registerStudent({
        email,
        name: 'Reset Revoke',
        password: oldPassword,
      });
      const userId = (registerRes.body as Envelope<RegisterData>).data.id;
      const verifyToken = await resolveVerificationToken(prisma, userId, email);
      await request(server)
        .post('/api/v1/auth/verify-email')
        .send({ token: verifyToken })
        .expect(200);

      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .send({ email, password: oldPassword })
        .expect(200);
      const refreshToken = (loginRes.body as Envelope<LoginData>).data
        .refreshToken;

      const resetToken = await issuePasswordResetToken(prisma, userId);
      await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, password: newPassword })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      const leftover = await prisma.refreshToken.findMany({
        where: { userId, revokedAt: null },
      });
      expect(leftover).toHaveLength(0);

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email, password: oldPassword })
        .expect(401);

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email, password: newPassword })
        .expect(200);
    });
  });
});
