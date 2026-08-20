import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import {
  createTestingApp,
  httpServer,
  readEnvelope,
} from './helpers/app.helper';
import {
  bearerFor,
  cleanupTestTenants,
  createSecondTenant,
} from './helpers/auth.helper';

interface AdminUserItem {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

interface RoleChangeItem {
  id: string;
  actor: { id: string; name: string };
  target: { id: string; name: string };
  fromRole: UserRole;
  toRole: UserRole;
}

// Nunca podem aparecer numa resposta admin. `email` e `role` sao intencionais
// aqui — a tela de gestao existe para mostrar exatamente isso.
const SENSITIVE_KEYS = [
  'passwordHash',
  'password_hash',
  'photoBytes',
  'photo_bytes',
  'whatsapp',
  'tenantId',
  'tenant_id',
];

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeys(item, keys);
    }
    return keys;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      keys.add(key);
      collectKeys(nested, keys);
    }
  }
  return keys;
}

function assertNoSensitiveKeys(body: unknown): void {
  const keys = collectKeys(body);
  for (const key of SENSITIVE_KEYS) {
    expect(keys.has(key)).toBe(false);
  }
}

describe('Admin users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  // Tenant proprio: no `default` o seed e as outras suites poluem meta.total.
  let tenantId: string;

  beforeAll(async () => {
    app = await createTestingApp();
    prisma = app.get(PrismaService);
    const tenant = await createSecondTenant(prisma);
    tenantId = tenant.id;
  });

  afterAll(async () => {
    await cleanupTestTenants(prisma);
    await app.close();
  });

  const senior = () =>
    bearerFor(prisma, { role: UserRole.ADMIN_SENIOR, tenantId });
  const superAdmin = () =>
    bearerFor(prisma, { role: UserRole.SUPER_ADMIN, tenantId });
  const admin = () => bearerFor(prisma, { role: UserRole.ADMIN, tenantId });
  const student = () => bearerFor(prisma, { role: UserRole.STUDENT, tenantId });

  describe('GET /admin/users', () => {
    it('devolve envelope paginado sem campo sensivel para ADMIN_SENIOR', async () => {
      const actor = await senior();

      const response = await request(httpServer(app))
        .get('/api/v1/admin/users')
        .set(actor.header)
        .expect(200);

      const body = readEnvelope<AdminUserItem[]>(response.body);
      expect(body.meta).toEqual(
        expect.objectContaining({ page: 1, pageSize: 20 }),
      );
      expect(body.data.some((row) => row.id === actor.user.id)).toBe(true);
      assertNoSensitiveKeys(response.body);
    });

    it('deixa o ADMIN ler a lista', async () => {
      const actor = await admin();
      await request(httpServer(app))
        .get('/api/v1/admin/users')
        .set(actor.header)
        .expect(200);
    });

    it('barra STUDENT com 403', async () => {
      const actor = await student();
      await request(httpServer(app))
        .get('/api/v1/admin/users')
        .set(actor.header)
        .expect(403);
    });

    it('exige token', async () => {
      await request(httpServer(app)).get('/api/v1/admin/users').expect(401);
    });

    it('filtra por papel', async () => {
      const actor = await senior();
      await admin();

      const response = await request(httpServer(app))
        .get('/api/v1/admin/users?role=ADMIN')
        .set(actor.header)
        .expect(200);

      const body = readEnvelope<AdminUserItem[]>(response.body);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data.every((row) => row.role === UserRole.ADMIN)).toBe(true);
    });

    it('busca por nome', async () => {
      const actor = await senior();
      const alvo = await bearerFor(prisma, {
        role: UserRole.STUDENT,
        tenantId,
        name: 'Zoraide Buscavel',
      });

      const response = await request(httpServer(app))
        .get('/api/v1/admin/users?q=zoraide')
        .set(actor.header)
        .expect(200);

      const body = readEnvelope<AdminUserItem[]>(response.body);
      expect(body.data.map((row) => row.id)).toContain(alvo.user.id);
    });

    it('recusa pageSize acima de 100', async () => {
      const actor = await senior();
      await request(httpServer(app))
        .get('/api/v1/admin/users?pageSize=101')
        .set(actor.header)
        .expect(400);
    });
  });

  describe('PATCH /admin/users/:id/role', () => {
    it('deixa o ADMIN_SENIOR promover STUDENT a ADMIN e registra a trilha', async () => {
      const actor = await senior();
      const alvo = await student();

      const response = await request(httpServer(app))
        .patch(`/api/v1/admin/users/${alvo.user.id}/role`)
        .set(actor.header)
        .send({ role: UserRole.ADMIN })
        .expect(200);

      expect(readEnvelope<AdminUserItem>(response.body).data.role).toBe(
        UserRole.ADMIN,
      );

      const trilha = await request(httpServer(app))
        .get(`/api/v1/admin/role-changes?targetUserId=${alvo.user.id}`)
        .set(actor.header)
        .expect(200);

      const linhas = readEnvelope<RoleChangeItem[]>(trilha.body).data;
      expect(linhas).toHaveLength(1);
      expect(linhas[0]).toEqual(
        expect.objectContaining({
          fromRole: UserRole.STUDENT,
          toRole: UserRole.ADMIN,
          actor: { id: actor.user.id, name: actor.user.name },
          target: { id: alvo.user.id, name: alvo.user.name },
        }),
      );
    });

    // O papel efetivo vem do banco a cada request: um token emitido enquanto o
    // usuario era STUDENT passa a valer como ADMIN sem novo login.
    it('aplica o papel novo ao token ja emitido, sem esperar expirar', async () => {
      const actor = await senior();
      const alvo = await student();

      await request(httpServer(app))
        .get('/api/v1/admin/access-requests')
        .set(alvo.header)
        .expect(403);

      await request(httpServer(app))
        .patch(`/api/v1/admin/users/${alvo.user.id}/role`)
        .set(actor.header)
        .send({ role: UserRole.ADMIN })
        .expect(200);

      await request(httpServer(app))
        .get('/api/v1/admin/access-requests')
        .set(alvo.header)
        .expect(200);
    });

    it('barra o ADMIN com 403', async () => {
      const actor = await admin();
      const alvo = await student();

      await request(httpServer(app))
        .patch(`/api/v1/admin/users/${alvo.user.id}/role`)
        .set(actor.header)
        .send({ role: UserRole.ADMIN })
        .expect(403);
    });

    it('recusa conceder SUPER_ADMIN ate para um SUPER_ADMIN', async () => {
      const actor = await superAdmin();
      const alvo = await student();

      await request(httpServer(app))
        .patch(`/api/v1/admin/users/${alvo.user.id}/role`)
        .set(actor.header)
        .send({ role: UserRole.SUPER_ADMIN })
        .expect(403);
    });

    it('recusa alterar o proprio papel', async () => {
      const actor = await superAdmin();

      await request(httpServer(app))
        .patch(`/api/v1/admin/users/${actor.user.id}/role`)
        .set(actor.header)
        .send({ role: UserRole.STUDENT })
        .expect(403);
    });

    it('recusa o ADMIN_SENIOR mexer em outro ADMIN_SENIOR', async () => {
      const actor = await senior();
      const alvo = await senior();

      await request(httpServer(app))
        .patch(`/api/v1/admin/users/${alvo.user.id}/role`)
        .set(actor.header)
        .send({ role: UserRole.STUDENT })
        .expect(403);
    });

    it('recusa o ADMIN_SENIOR promover alguem ao proprio nivel', async () => {
      const actor = await senior();
      const alvo = await student();

      await request(httpServer(app))
        .patch(`/api/v1/admin/users/${alvo.user.id}/role`)
        .set(actor.header)
        .send({ role: UserRole.ADMIN_SENIOR })
        .expect(403);
    });

    it('deixa o SUPER_ADMIN conceder ADMIN_SENIOR', async () => {
      const actor = await superAdmin();
      const alvo = await student();

      const response = await request(httpServer(app))
        .patch(`/api/v1/admin/users/${alvo.user.id}/role`)
        .set(actor.header)
        .send({ role: UserRole.ADMIN_SENIOR })
        .expect(200);

      expect(readEnvelope<AdminUserItem>(response.body).data.role).toBe(
        UserRole.ADMIN_SENIOR,
      );
    });

    // 404 e nao 403: responder 403 confirmaria que o id existe noutro tenant.
    it('responde 404 para alvo de outro tenant', async () => {
      const actor = await senior();
      const outro = await createSecondTenant(prisma);
      const alvo = await bearerFor(prisma, {
        role: UserRole.STUDENT,
        tenantId: outro.id,
      });

      await request(httpServer(app))
        .patch(`/api/v1/admin/users/${alvo.user.id}/role`)
        .set(actor.header)
        .send({ role: UserRole.ADMIN })
        .expect(404);
    });

    it('responde 404 para id inexistente', async () => {
      const actor = await senior();
      await request(httpServer(app))
        .patch('/api/v1/admin/users/nao-existe/role')
        .set(actor.header)
        .send({ role: UserRole.ADMIN })
        .expect(404);
    });

    it('recusa papel fora do enum e propriedade extra com 400', async () => {
      const actor = await senior();
      const alvo = await student();

      await request(httpServer(app))
        .patch(`/api/v1/admin/users/${alvo.user.id}/role`)
        .set(actor.header)
        .send({ role: 'GOD' })
        .expect(400);

      await request(httpServer(app))
        .patch(`/api/v1/admin/users/${alvo.user.id}/role`)
        .set(actor.header)
        .send({ role: UserRole.ADMIN, tenantId: 'forjado' })
        .expect(400);
    });

    it('trata papel repetido como no-op, sem nova linha de auditoria', async () => {
      const actor = await senior();
      const alvo = await admin();

      const antes = await prisma.roleChangeAudit.count({ where: { tenantId } });

      await request(httpServer(app))
        .patch(`/api/v1/admin/users/${alvo.user.id}/role`)
        .set(actor.header)
        .send({ role: UserRole.ADMIN })
        .expect(200);

      expect(await prisma.roleChangeAudit.count({ where: { tenantId } })).toBe(
        antes,
      );
    });
  });

  describe('POST /admin/users/:userId/password-reset', () => {
    it('ADMIN devolve o link e nao coloca o token em outra rota', async () => {
      const actor = await admin();
      const alvo = await student();

      const response = await request(httpServer(app))
        .post(`/api/v1/admin/users/${alvo.user.id}/password-reset`)
        .set(actor.header)
        .expect(200);

      const body = readEnvelope<{ resetUrl: string }>(response.body);
      expect(body.data.resetUrl).toMatch(/\/redefinir-senha\?token=/);
      const token = new URL(body.data.resetUrl).searchParams.get('token');
      expect(token).toBeTruthy();

      const stored = await prisma.passwordResetToken.findMany({
        where: { userId: alvo.user.id },
      });
      expect(stored).toHaveLength(1);
      expect(stored[0]?.tokenHash).not.toBe(token);
    });

    it('barra STUDENT com 403', async () => {
      const actor = await student();
      const alvo = await student();

      await request(httpServer(app))
        .post(`/api/v1/admin/users/${alvo.user.id}/password-reset`)
        .set(actor.header)
        .expect(403);
    });

    it('responde 404 para alvo de outro tenant', async () => {
      const actor = await admin();
      const outro = await createSecondTenant(prisma);
      const alvo = await bearerFor(prisma, {
        role: UserRole.STUDENT,
        tenantId: outro.id,
      });

      await request(httpServer(app))
        .post(`/api/v1/admin/users/${alvo.user.id}/password-reset`)
        .set(actor.header)
        .expect(404);
    });
  });

  describe('GET /admin/role-changes', () => {
    it('barra o ADMIN com 403 e aceita o ADMIN_SENIOR', async () => {
      const comum = await admin();
      await request(httpServer(app))
        .get('/api/v1/admin/role-changes')
        .set(comum.header)
        .expect(403);

      const actor = await senior();
      await request(httpServer(app))
        .get('/api/v1/admin/role-changes')
        .set(actor.header)
        .expect(200);
    });
  });

  // O coracao da mudanca do guard: os papeis novos herdam as rotas que ja
  // existiam sob @MinRole(ADMIN).
  describe('heranca nas rotas admin ja existentes', () => {
    it.each([UserRole.ADMIN_SENIOR, UserRole.SUPER_ADMIN])(
      'deixa %s ler /admin/access-requests',
      async (role) => {
        const actor = await bearerFor(prisma, { role, tenantId });
        await request(httpServer(app))
          .get('/api/v1/admin/access-requests')
          .set(actor.header)
          .expect(200);
      },
    );

    // 400 (e nao 403) prova que passou pelo guard e morreu na validacao.
    it('deixa ADMIN_SENIOR alcancar /admin/members/ranking', async () => {
      const actor = await senior();
      await request(httpServer(app))
        .get('/api/v1/admin/members/ranking')
        .set(actor.header)
        .expect(400);
    });
  });
});
