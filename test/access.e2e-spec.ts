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
  allowWhatsapp,
  bearerFor,
  cleanupTestWhatsapps,
  getDefaultTenant,
  registerPayload,
  uniqueWhatsapp,
} from './helpers/auth.helper';

interface CheckData {
  status: string;
  whatsapp: string;
}

describe('Access (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdWhatsapps: string[] = [];

  beforeAll(async () => {
    app = await createTestingApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await cleanupTestWhatsapps(prisma);
    if (createdWhatsapps.length > 0) {
      await prisma.accessRequest.deleteMany({
        where: { whatsapp: { in: createdWhatsapps } },
      });
      await prisma.allowedWhatsapp.deleteMany({
        where: { whatsapp: { in: createdWhatsapps } },
      });
      await prisma.user.deleteMany({
        where: { whatsapp: { in: createdWhatsapps } },
      });
    }
    await app.close();
  });

  function trackWhatsapp(): string {
    const value = uniqueWhatsapp();
    createdWhatsapps.push(value);
    return value;
  }

  it('captures an unknown number and then accepts an access request', async () => {
    const whatsapp = trackWhatsapp();
    const server = httpServer(app);

    const check = await request(server)
      .post('/api/v1/auth/check-whatsapp')
      .send({ whatsapp })
      .expect(200);

    const checked = readEnvelope<CheckData>(check.body);
    expect(checked.data.status).toBe('NOT_ALLOWED');
    expect(checked.data.whatsapp).toBe(whatsapp);

    const stored = await prisma.accessRequest.findFirst({
      where: { whatsapp },
    });
    expect(stored?.status).toBe('INTERESTED');

    const submitted = await request(server)
      .post('/api/v1/auth/access-requests')
      .send({
        whatsapp,
        name: 'Carlos Lima',
        lgndNumber: '2040',
        manada: 'Manada Sul',
        email: 'carlos@example.com',
        justification: 'Faço parte da manada e quero estudar para a prova.',
      })
      .expect(201);

    expect(readEnvelope<{ status: string }>(submitted.body).data.status).toBe(
      'PENDING',
    );
  });

  it('lets a pre-released number register after the WhatsApp check', async () => {
    const whatsapp = trackWhatsapp();
    await allowWhatsapp(prisma, whatsapp);
    const server = httpServer(app);

    const check = await request(server)
      .post('/api/v1/auth/check-whatsapp')
      .send({ whatsapp })
      .expect(200);
    expect(readEnvelope<CheckData>(check.body).data.status).toBe('ALLOWED');

    const email = `access-ok-${Date.now()}@example.com`;
    await request(server)
      .post('/api/v1/auth/register')
      .send(
        registerPayload({
          email,
          name: 'Liberado User',
          password: 'password12',
          whatsapp,
        }),
      )
      .expect(201);
  });

  it('allows an admin to approve a request and then the user can register', async () => {
    const whatsapp = trackWhatsapp();
    const server = httpServer(app);
    const tenant = await getDefaultTenant(prisma);

    await prisma.accessRequest.create({
      data: {
        tenantId: tenant.id,
        whatsapp,
        name: 'Joana Alves',
        lgndNumber: '3301',
        manada: 'Manada Leste',
        email: 'joana@example.com',
        justification: 'Quero acesso para estudar com o squad.',
        status: 'PENDING',
      },
    });

    const admin = await bearerFor(prisma, {
      email: `admin-access-${Date.now()}@example.com`,
      role: UserRole.ADMIN,
    });

    const pending = await request(server)
      .get('/api/v1/admin/access-requests')
      .query({ status: 'PENDING' })
      .set(admin.header)
      .expect(200);

    const list = readEnvelope<Array<{ id: string; whatsapp: string }>>(
      pending.body,
    );
    const row = list.data.find((item) => item.whatsapp === whatsapp);
    expect(row).toBeDefined();

    await request(server)
      .post(`/api/v1/admin/access-requests/${row?.id}/approve`)
      .set(admin.header)
      .expect(200);

    const allowed = await prisma.allowedWhatsapp.findFirst({
      where: { whatsapp },
    });
    expect(allowed).not.toBeNull();

    await request(server)
      .post('/api/v1/auth/register')
      .send(
        registerPayload({
          email: `approved-${Date.now()}@example.com`,
          name: 'Joana Alves',
          password: 'password12',
          whatsapp,
        }),
      )
      .expect(201);
  });
});
