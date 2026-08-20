import { INestApplication } from '@nestjs/common';
import { CardLevel, UserRole } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { STUDY_PRIORITY_DISCLAIMER } from '../src/modules/stats/priority-score';
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

const SENSITIVE_KEYS = new Set([
  'email',
  'whatsapp',
  'passwordHash',
  'password_hash',
  'eventoFire',
  'evento_fire',
  'role',
]);

type MemberItem = {
  userId: string;
  name: string;
  photoUrl: string | null;
  lgndNumber: string | null;
  squad: string | null;
  coveragePct: number;
  practiceAccuracyPct: number;
  activeDays30d: number;
  lastActiveAt: string | null;
};

type RankingItem = {
  userId: string;
  name: string;
  study: {
    attempts: number;
    practiceAccuracyPct: number;
    selfReported: string[];
  };
  priorityScore: number;
  operational: null;
  practicalTrainingNotice: string;
};

type RankingData = {
  ranked: RankingItem[];
  insufficientBase: RankingItem[];
};

type PeerStats = {
  byModule: unknown[];
  profile: {
    userId: string;
    name: string;
    photoUrl: string | null;
    lgndNumber: string | null;
    squad: string | null;
    manada: { id: string; name: string } | null;
  };
  disclaimer: string;
};

const BASE_COURSE_SLUG = 'defesa-civil-lgnd';

describe('Perfil e ranking (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];
  const createdManadaIds: string[] = [];

  beforeAll(async () => {
    app = await createTestingApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.attempt.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.cardState.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.studySession.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.updateMany({
        where: { id: { in: createdUserIds } },
        data: { manadaId: null },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (createdManadaIds.length > 0) {
      await prisma.manada.deleteMany({
        where: { id: { in: createdManadaIds } },
      });
    }
    await cleanupTestTenants(prisma);
    await app.close();
  });

  it('returns an empty manada list, not 500, when the user has no manada', async () => {
    const auth = await bearerFor(prisma);
    createdUserIds.push(auth.user.id);

    const response = await request(httpServer(app))
      .get('/api/v1/me/manada/members')
      .set(auth.header)
      .expect(200);

    const body = readEnvelope<MemberItem[]>(response.body);
    expect(body.data).toEqual([]);
    expect(body.meta).toMatchObject({ reason: 'NO_MANADA', total: 0 });
    assertNoSensitiveKeys(response.body);
  });

  it('lists same-manada members and hides email, whatsapp and passwordHash', async () => {
    const pack = await createManada(prisma, 'Norte');
    createdManadaIds.push(pack.id);
    const self = await bearerFor(prisma, { name: 'Alice Membro' });
    const peer = await bearerFor(prisma, { name: 'Bruno Membro' });
    createdUserIds.push(self.user.id, peer.user.id);
    await assignManada(prisma, [self.user.id, peer.user.id], pack.id);

    const response = await request(httpServer(app))
      .get('/api/v1/me/manada/members')
      .set(self.header)
      .expect(200);

    const body = readEnvelope<MemberItem[]>(response.body);
    expect(body.data.map((row) => row.userId).sort()).toEqual(
      [self.user.id, peer.user.id].sort(),
    );
    expect(body.data.every((row) => row.name.length > 0)).toBe(true);
    assertNoSensitiveKeys(response.body);
  });

  it('returns 403 when a student from another manada reads /users/:id/stats', async () => {
    const packA = await createManada(prisma, 'Alpha');
    const packB = await createManada(prisma, 'Beta');
    createdManadaIds.push(packA.id, packB.id);
    const alice = await bearerFor(prisma, { name: 'Alice Alpha' });
    const bruno = await bearerFor(prisma, { name: 'Bruno Beta' });
    createdUserIds.push(alice.user.id, bruno.user.id);
    await assignManada(prisma, [alice.user.id], packA.id);
    await assignManada(prisma, [bruno.user.id], packB.id);

    await request(httpServer(app))
      .get(`/api/v1/users/${bruno.user.id}/stats`)
      .set(alice.header)
      .expect(403);
  });

  it('lets a same-manada student read the peer profile without leaking secrets', async () => {
    const pack = await createManada(prisma, 'Leste');
    createdManadaIds.push(pack.id);
    const alice = await bearerFor(prisma, { name: 'Alice Leste' });
    const bruno = await bearerFor(prisma, { name: 'Bruno Leste' });
    createdUserIds.push(alice.user.id, bruno.user.id);
    await assignManada(prisma, [alice.user.id, bruno.user.id], pack.id);

    const response = await request(httpServer(app))
      .get(`/api/v1/users/${bruno.user.id}/stats`)
      .set(alice.header)
      .expect(200);

    const body = readEnvelope<PeerStats>(response.body);
    expect(body.data.profile.userId).toBe(bruno.user.id);
    expect(body.data.profile.name).toBe('Bruno Leste');
    expect(body.data.disclaimer).toBe(STUDY_PRIORITY_DISCLAIMER);
    expect(body.data.byModule.length).toBeGreaterThan(0);
    assertNoSensitiveKeys(response.body);
  });

  it('returns 404, never 403, when the target belongs to another tenant', async () => {
    const tenantB = await createSecondTenant(prisma);
    const local = await bearerFor(prisma);
    const foreign = await bearerFor(prisma, { tenantId: tenantB.id });
    createdUserIds.push(local.user.id, foreign.user.id);

    const response = await request(httpServer(app))
      .get(`/api/v1/users/${foreign.user.id}/stats`)
      .set(local.header)
      .expect(404);

    expect(response.status).not.toBe(403);
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash/);
  });

  it('returns 404 for a missing or soft-deleted target', async () => {
    const auth = await bearerFor(prisma);
    createdUserIds.push(auth.user.id);

    await request(httpServer(app))
      .get('/api/v1/users/does-not-exist/stats')
      .set(auth.header)
      .expect(404);

    const gone = await bearerFor(prisma);
    createdUserIds.push(gone.user.id);
    await prisma.user.update({
      where: { id: gone.user.id },
      data: { deletedAt: new Date() },
    });

    await request(httpServer(app))
      .get(`/api/v1/users/${gone.user.id}/stats`)
      .set(auth.header)
      .expect(404);
  });

  it('returns 403 when a STUDENT hits /admin/members/ranking', async () => {
    const student = await bearerFor(prisma);
    createdUserIds.push(student.user.id);

    await request(httpServer(app))
      .get('/api/v1/admin/members/ranking')
      .set(student.header)
      .expect(403);
  });

  it('ranks only users above minAttempts and never includes sensitive fields', async () => {
    const catalog = await loadCatalog(prisma);
    const pack = await createManada(prisma, 'Ranking');
    createdManadaIds.push(pack.id);
    const admin = await bearerFor(prisma, {
      name: 'Admin Ranking',
      role: UserRole.ADMIN,
    });
    const oneShot = await bearerFor(prisma, { name: 'Ana Um Tiro' });
    const steady = await bearerFor(prisma, { name: 'Bruno Constante' });
    createdUserIds.push(admin.user.id, oneShot.user.id, steady.user.id);
    await assignManada(
      prisma,
      [admin.user.id, oneShot.user.id, steady.user.id],
      pack.id,
    );

    await prisma.attempt.create({
      data: {
        tenantId: oneShot.user.tenantId,
        userId: oneShot.user.id,
        quizId: catalog.quizId,
        finishedAt: new Date(),
        correctCount: 10,
        totalCount: 10,
      },
    });
    await prisma.attempt.createMany({
      data: Array.from({ length: 5 }, () => ({
        tenantId: steady.user.tenantId,
        userId: steady.user.id,
        quizId: catalog.quizId,
        finishedAt: new Date(),
        correctCount: 4,
        totalCount: 5,
      })),
    });
    await prisma.cardState.create({
      data: {
        tenantId: steady.user.tenantId,
        userId: steady.user.id,
        cardId: catalog.cardId,
        level: CardLevel.EASY,
        seen: 2,
        streak: 2,
      },
    });

    const response = await request(httpServer(app))
      .get('/api/v1/admin/members/ranking')
      .query({
        manadaId: pack.id,
        minAttempts: 3,
        courseId: catalog.courseId,
      })
      .set(admin.header)
      .expect(200);

    const body = readEnvelope<RankingData>(response.body);
    expect(body.meta).toMatchObject({
      disclaimer: STUDY_PRIORITY_DISCLAIMER,
    });
    expect(body.data.ranked.map((row) => row.userId)).toEqual([steady.user.id]);
    expect(body.data.insufficientBase.map((row) => row.userId)).toEqual(
      expect.arrayContaining([oneShot.user.id]),
    );
    expect(body.data.ranked[0]?.study.selfReported).toEqual(['coveragePct']);
    expect(body.data.ranked[0]?.operational).toBeNull();
    expect(body.data.ranked[0]?.practicalTrainingNotice).toMatch(
      /NÃO AVALIADA/,
    );
    expect(body.meta).toMatchObject({ truncated: false });
    assertNoSensitiveKeys(response.body);
  });

  it('returns 400 when ranking is requested without courseId or moduleCode', async () => {
    const admin = await bearerFor(prisma, {
      name: 'Admin Sem Recorte',
      role: UserRole.ADMIN,
    });
    createdUserIds.push(admin.user.id);

    await request(httpServer(app))
      .get('/api/v1/admin/members/ranking')
      .set(admin.header)
      .expect(400);
  });

  it('returns 400 when minAttempts is below 3', async () => {
    const catalog = await loadCatalog(prisma);
    const admin = await bearerFor(prisma, {
      name: 'Admin Piso Zero',
      role: UserRole.ADMIN,
    });
    createdUserIds.push(admin.user.id);

    await request(httpServer(app))
      .get('/api/v1/admin/members/ranking')
      .query({ courseId: catalog.courseId, minAttempts: 0 })
      .set(admin.header)
      .expect(400);
  });

  it('ranks by the requested module, not global accuracy', async () => {
    const catalog = await loadCatalog(prisma);
    const pack = await createManada(prisma, 'Modulo');
    createdManadaIds.push(pack.id);
    const admin = await bearerFor(prisma, {
      name: 'Admin Modulo',
      role: UserRole.ADMIN,
    });
    const legislation = await bearerFor(prisma, { name: 'Carla Legislacao' });
    const swiftwater = await bearerFor(prisma, { name: 'Diego Aguas' });
    createdUserIds.push(admin.user.id, legislation.user.id, swiftwater.user.id);
    await assignManada(
      prisma,
      [admin.user.id, legislation.user.id, swiftwater.user.id],
      pack.id,
    );

    await prisma.attempt.createMany({
      data: Array.from({ length: 5 }, () => ({
        tenantId: legislation.user.tenantId,
        userId: legislation.user.id,
        quizId: catalog.quizId,
        finishedAt: new Date(),
        correctCount: 10,
        totalCount: 10,
      })),
    });
    await prisma.attempt.createMany({
      data: Array.from({ length: 5 }, () => ({
        tenantId: swiftwater.user.tenantId,
        userId: swiftwater.user.id,
        quizId: catalog.moduleTwoQuizId,
        finishedAt: new Date(),
        correctCount: 4,
        totalCount: 5,
      })),
    });

    const response = await request(httpServer(app))
      .get('/api/v1/admin/members/ranking')
      .query({
        manadaId: pack.id,
        moduleCode: 'M2',
        minAttempts: 3,
      })
      .set(admin.header)
      .expect(200);

    const body = readEnvelope<RankingData>(response.body);
    expect(body.data.ranked.map((row) => row.userId)).toEqual([
      swiftwater.user.id,
    ]);
    expect(body.data.ranked[0]?.study.practiceAccuracyPct).toBe(80);
    expect(body.data.insufficientBase.map((row) => row.userId)).toEqual(
      expect.arrayContaining([legislation.user.id]),
    );
  });
});

function assertNoSensitiveKeys(body: unknown): void {
  const keys = collectKeys(body);
  for (const key of SENSITIVE_KEYS) {
    expect(keys.has(key)).toBe(false);
  }
}

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

let manadaSeq = 0;

async function createManada(prisma: PrismaService, suffix: string) {
  manadaSeq += 1;
  const stamp = `${process.pid}-${suffix}-${manadaSeq}`;
  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'default', deletedAt: null },
  });
  if (!tenant) {
    throw new Error('Default tenant missing — run pnpm seed');
  }
  return prisma.manada.create({
    data: {
      tenantId: tenant.id,
      name: `Manada ${stamp}`,
      country: 'BR',
      state: 'PR',
      city: 'Arapongas',
    },
  });
}

async function assignManada(
  prisma: PrismaService,
  userIds: string[],
  manadaId: string,
): Promise<void> {
  await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { manadaId },
  });
}

/**
 * `code` de módulo não é único no catálogo: cada aula tem o seu M1 e a Aula 1
 * também tem um M2 (nós e amarrações). Tudo aqui é ancorado no curso base para
 * o quiz do fixture bater com o `moduleCode` que a asserção usa no recorte.
 */
async function loadCatalog(prisma: PrismaService) {
  const course = await prisma.course.findFirst({
    where: { slug: BASE_COURSE_SLUG, deletedAt: null },
    select: { id: true },
  });
  const moduleOne = await prisma.courseModule.findFirst({
    where: {
      code: 'M1',
      deletedAt: null,
      course: { slug: BASE_COURSE_SLUG },
    },
    select: {
      quizzes: {
        where: { deletedAt: null },
        take: 1,
        select: { id: true },
      },
    },
  });
  const moduleTwo = await prisma.courseModule.findFirst({
    where: {
      code: 'M2',
      deletedAt: null,
      course: { slug: BASE_COURSE_SLUG },
    },
    select: {
      quizzes: {
        where: { deletedAt: null },
        take: 1,
        select: { id: true },
      },
    },
  });
  const card = await prisma.card.findFirst({
    where: {
      deletedAt: null,
      deck: { course: { slug: BASE_COURSE_SLUG } },
    },
    select: { id: true },
  });
  if (!course || !moduleOne?.quizzes[0] || !moduleTwo?.quizzes[0] || !card) {
    throw new Error('Catalog seed missing — run pnpm seed');
  }
  return {
    courseId: course.id,
    quizId: moduleOne.quizzes[0].id,
    moduleTwoQuizId: moduleTwo.quizzes[0].id,
    cardId: card.id,
  };
}
