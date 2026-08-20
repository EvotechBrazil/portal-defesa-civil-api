import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import {
  createTestingApp,
  httpServer,
  readEnvelope,
} from './helpers/app.helper';
import {
  allowWhatsapp,
  getDefaultTenant,
  registerPayload,
  uniqueWhatsapp,
} from './helpers/auth.helper';

interface ManadaData {
  id: string;
  name: string;
  country: string;
  state: string;
  city: string;
}

interface ManadaListData {
  automatic: ManadaData[];
  others: ManadaData[];
}

describe('Manadas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdIds: string[] = [];

  beforeAll(async () => {
    app = await createTestingApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.user.updateMany({
        where: { manadaId: { in: createdIds } },
        data: { manadaId: null },
      });
      await prisma.accessRequest.updateMany({
        where: { manadaId: { in: createdIds } },
        data: { manadaId: null },
      });
      await prisma.manada.deleteMany({ where: { id: { in: createdIds } } });
    }
    await app.close();
  });

  it('creates a manada, reuses the same location, and groups the automatic filter', async () => {
    const server = httpServer(app);
    const stamp = `${process.pid}-${Date.now()}`;

    const createdRes = await request(server)
      .post('/api/v1/manadas')
      .send({
        name: `Manada E2E ${stamp}`,
        country: 'BR',
        state: 'PR',
        city: 'Arapongas',
      })
      .expect(201);

    const created = readEnvelope<ManadaData>(createdRes.body).data;
    createdIds.push(created.id);
    expect(created.country).toBe('BR');
    expect(created.state).toBe('PR');
    expect(created.city).toBe('Arapongas');

    const reusedRes = await request(server)
      .post('/api/v1/manadas')
      .send({
        name: `manada e2e ${stamp}`,
        country: 'br',
        state: 'pr',
        city: 'Arapongas',
      })
      .expect(201);

    expect(readEnvelope<ManadaData>(reusedRes.body).data.id).toBe(created.id);

    const otherRes = await request(server)
      .post('/api/v1/manadas')
      .send({
        name: `Manada E2E ${stamp} SP`,
        country: 'BR',
        state: 'SP',
        city: 'São Paulo',
      })
      .expect(201);
    createdIds.push(readEnvelope<ManadaData>(otherRes.body).data.id);

    const listRes = await request(server)
      .get('/api/v1/manadas')
      .query({ country: 'BR', state: 'PR', city: 'Arapongas', q: stamp })
      .expect(200);

    const listed = readEnvelope<ManadaListData>(listRes.body).data;
    expect(listed.automatic.map((item) => item.id)).toContain(created.id);
    expect(listed.others.map((item) => item.id)).toContain(
      readEnvelope<ManadaData>(otherRes.body).data.id,
    );
  });

  it('links the selected manada when registering', async () => {
    const server = httpServer(app);
    const tenant = await getDefaultTenant(prisma);
    const pack = await prisma.manada.create({
      data: {
        tenantId: tenant.id,
        name: `Manada Registro ${process.pid}`,
        country: 'BR',
        state: 'PR',
        city: 'Londrina',
      },
    });
    createdIds.push(pack.id);

    const whatsapp = uniqueWhatsapp();
    await allowWhatsapp(prisma, whatsapp);
    const email = `manada-reg-${process.pid}-${Date.now()}@example.com`;

    const registerRes = await request(server)
      .post('/api/v1/auth/register')
      .send({
        ...registerPayload({
          email,
          name: 'Aluno Manada',
          password: 'password12',
          whatsapp,
        }),
        manadaId: pack.id,
        city: 'Arapongas',
      })
      .expect(201);

    const userId = (registerRes.body as { data: { id: string } }).data.id;
    const stored = await prisma.user.findUnique({ where: { id: userId } });
    expect(stored?.manadaId).toBe(pack.id);
    expect(stored?.manada).toBe(pack.name);
    expect(stored?.country).toBe('BR');
    expect(stored?.state).toBe('PR');
    expect(stored?.city).toBe('Arapongas');
  });
});
