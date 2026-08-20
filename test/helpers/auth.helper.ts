import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import { PrismaService } from '../../src/database/prisma.service';
import {
  generateOpaqueToken,
  hashToken,
} from '../../src/modules/auth/auth.crypto';

export async function getDefaultTenant(prisma: PrismaService) {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'default', deletedAt: null },
  });
  if (!tenant) {
    throw new Error('Default tenant missing — run pnpm seed');
  }
  return tenant;
}

// §2.9: nada de Math.random()/Date.now() em teste. Contador determinístico
// por processo Jest — cada worker tem o próprio pid, então não colide em
// paralelo e o slug é reproduzível dentro da suíte.
let fixtureSeq = 0;

function nextFixtureId(): string {
  fixtureSeq += 1;
  return `${process.pid}-${fixtureSeq}`;
}

export const TEST_TENANT_SLUG_PREFIX = 'tenant-e2e-';

/**
 * Os e2e rodam contra o banco de dev. Sem esta limpeza os tenants adversariais
 * sobram e o relatório do §7.3 passa a mentir na contagem de tenants.
 */
export async function cleanupTestTenants(prisma: PrismaService): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: { slug: { startsWith: TEST_TENANT_SLUG_PREFIX } },
    select: { id: true },
  });
  if (tenants.length === 0) {
    return;
  }
  const tenantIds = tenants.map((tenant) => tenant.id);
  const users = await prisma.user.findMany({
    where: { tenantId: { in: tenantIds } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  await prisma.accessRequest.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.allowedWhatsapp.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.user.updateMany({
    where: { tenantId: { in: tenantIds } },
    data: { manadaId: null },
  });
  if (userIds.length > 0) {
    // Antes de qualquer delete de user: a trilha de auditoria tem FK para
    // actor e target, entao um usuario com linha aqui trava o deleteMany com
    // P2003 e derruba a limpeza da suite inteira, nao so a deste arquivo.
    await prisma.roleChangeAudit.deleteMany({
      where: {
        OR: [{ actorId: { in: userIds } }, { targetId: { in: userIds } }],
      },
    });
    await prisma.attemptItem.deleteMany({
      where: { attempt: { userId: { in: userIds } } },
    });
    await prisma.attempt.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.cardState.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.studySession.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.lessonProgress.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.enrollment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.passwordResetToken.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.manada.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

export async function createSecondTenant(prisma: PrismaService) {
  const slug = `${TEST_TENANT_SLUG_PREFIX}${nextFixtureId()}`;
  return prisma.tenant.create({
    data: { slug, name: `Tenant ${slug}`, status: 'ACTIVE' },
  });
}

export function uniqueWhatsapp(): string {
  const digits = nextFixtureId().replace(/\D/g, '').slice(-7).padStart(7, '0');
  return `554370${digits}`;
}

export async function cleanupTestWhatsapps(
  prisma: PrismaService,
): Promise<void> {
  const users = await prisma.user.findMany({
    where: { whatsapp: { startsWith: '554370' } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  await prisma.accessRequest.deleteMany({
    where: { whatsapp: { startsWith: '554370' } },
  });
  await prisma.allowedWhatsapp.deleteMany({
    where: { whatsapp: { startsWith: '554370' } },
  });
  if (userIds.length > 0) {
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.passwordResetToken.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

export async function allowWhatsapp(
  prisma: PrismaService,
  whatsapp: string,
  tenantId?: string,
) {
  const tenant = tenantId ? { id: tenantId } : await getDefaultTenant(prisma);
  return prisma.allowedWhatsapp.create({
    data: { tenantId: tenant.id, whatsapp },
  });
}

export function registerPayload(input: {
  email: string;
  name: string;
  password: string;
  whatsapp: string;
}) {
  return {
    email: input.email,
    name: input.name,
    password: input.password,
    whatsapp: input.whatsapp,
    lgndNumber: '1001',
    manada: 'Manada Teste',
    country: 'BR',
    state: 'PR',
    city: 'Arapongas',
    squad: 'Squad 1',
    eventoFire: 'Fire 2026',
  };
}

export async function createVerifiedStudent(
  prisma: PrismaService,
  overrides?: Partial<Pick<User, 'email' | 'name' | 'role' | 'tenantId'>>,
): Promise<User> {
  const tenant = overrides?.tenantId
    ? { id: overrides.tenantId }
    : await getDefaultTenant(prisma);

  return prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: overrides?.email ?? `student-${nextFixtureId()}@example.com`,
      name: overrides?.name ?? 'Aluno Teste',
      passwordHash: 'not-used-in-helper',
      role: overrides?.role ?? UserRole.STUDENT,
      emailVerifiedAt: new Date(),
    },
  });
}

export function signAccessToken(
  user: Pick<User, 'id' | 'email' | 'role' | 'tenantId'>,
): string {
  const jwt = new JwtService({
    secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
    signOptions: { expiresIn: 900 },
  });
  return jwt.sign({
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    email: user.email,
  });
}

export async function bearerFor(
  prisma: PrismaService,
  overrides?: Partial<Pick<User, 'email' | 'name' | 'role' | 'tenantId'>>,
) {
  const user = await createVerifiedStudent(prisma, overrides);
  const token = signAccessToken(user);
  return {
    user,
    token,
    header: { Authorization: `Bearer ${token}` },
  };
}

export async function issuePasswordResetToken(
  prisma: PrismaService,
  userId: string,
  overrides?: { expiresAt?: Date; usedAt?: Date | null },
): Promise<string> {
  const token = generateOpaqueToken();
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: overrides?.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      usedAt: overrides?.usedAt ?? null,
    },
  });
  return token;
}

export async function issueEmailVerificationToken(
  prisma: PrismaService,
  userId: string,
): Promise<string> {
  const token = generateOpaqueToken();
  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  return token;
}

interface MailpitListResponse {
  messages?: Array<{
    ID: string;
    To?: Array<{ Address?: string }>;
    Subject?: string;
  }>;
}

interface MailpitMessageResponse {
  Text?: string;
  HTML?: string;
}

function extractVerificationToken(source: string): string | null {
  const match = source.match(/[?&]token=([^&'"\s<]+)/);
  if (!match?.[1]) {
    return null;
  }
  return decodeURIComponent(match[1]);
}

export async function readVerificationTokenFromMailpit(
  email: string,
): Promise<string | null> {
  try {
    const baseUrl = 'http://localhost:8025/api/v1';
    const listResponse = await fetch(`${baseUrl}/messages`);
    if (!listResponse.ok) {
      return null;
    }
    const list = (await listResponse.json()) as MailpitListResponse;
    const message = (list.messages ?? []).find((item) =>
      (item.To ?? []).some(
        (to) => to.Address?.toLowerCase() === email.toLowerCase(),
      ),
    );
    if (!message) {
      return null;
    }
    const detailResponse = await fetch(`${baseUrl}/message/${message.ID}`);
    if (!detailResponse.ok) {
      return null;
    }
    const detail = (await detailResponse.json()) as MailpitMessageResponse;
    return extractVerificationToken(
      `${detail.Text ?? ''}\n${detail.HTML ?? ''}`,
    );
  } catch {
    return null;
  }
}

export async function resolveVerificationToken(
  prisma: PrismaService,
  userId: string,
  email: string,
): Promise<string> {
  const fromMailpit = await readVerificationTokenFromMailpit(email);
  if (fromMailpit) {
    return fromMailpit;
  }
  return issueEmailVerificationToken(prisma, userId);
}
