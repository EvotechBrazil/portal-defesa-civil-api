import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import { PrismaService } from '../../src/database/prisma.service';

export async function getDefaultTenant(prisma: PrismaService) {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'default', deletedAt: null },
  });
  if (!tenant) {
    throw new Error('Default tenant missing — run pnpm seed');
  }
  return tenant;
}

export async function createSecondTenant(prisma: PrismaService) {
  const slug = `tenant-${Date.now()}`;
  return prisma.tenant.create({
    data: { slug, name: `Tenant ${slug}`, status: 'ACTIVE' },
  });
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
      email: overrides?.email ?? `student-${Date.now()}-${Math.random()}@example.com`,
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
