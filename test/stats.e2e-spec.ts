import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CardLevel, DeckSelector, Prisma } from '@prisma/client';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { bearerFor, createSecondTenant } from './helpers/auth.helper';

type StatsPayload = {
  byModule: Array<{
    code: string;
    title: string;
    accuracyPct: number;
    attempts: number;
  }>;
  cardLevels: {
    NEW: number;
    HARD: number;
    LEARNING: number;
    EASY: number;
  };
  stuckCards: Array<{ cardId: string; code: string; seen: number }>;
  sessionsLast30d: Array<{ id: string; reviews: number }>;
};

const BASE_COURSE_SLUG = 'defesa-civil-lgnd';

describe('Stats (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
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
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (createdTenantIds.length > 0) {
      await prisma.tenant.deleteMany({
        where: { id: { in: createdTenantIds } },
      });
    }
    await app.close();
  });

  it('rejects unauthenticated access', async () => {
    await request(httpServer(app)).get('/api/v1/me/stats').expect(401);
  });

  it('returns zeros and empty arrays when the user has no data', async () => {
    const auth = await bearerFor(prisma);
    createdUserIds.push(auth.user.id);

    const response = await request(httpServer(app))
      .get('/api/v1/me/stats')
      .set(auth.header)
      .expect(200);

    const body = response.body as { data: StatsPayload };
    expect(body.data.byModule.length).toBeGreaterThan(0);
    expect(
      body.data.byModule.every(
        (module) => module.attempts === 0 && module.accuracyPct === 0,
      ),
    ).toBe(true);
    expect(body.data.cardLevels).toEqual({
      NEW: 0,
      HARD: 0,
      LEARNING: 0,
      EASY: 0,
    });
    expect(body.data.stuckCards).toEqual([]);
    expect(body.data.sessionsLast30d).toEqual([]);
  });

  it('does not 500 when courseId is unknown', async () => {
    const auth = await bearerFor(prisma);
    createdUserIds.push(auth.user.id);

    const response = await request(httpServer(app))
      .get('/api/v1/me/stats')
      .query({ courseId: 'does-not-exist' })
      .set(auth.header)
      .expect(200);

    const body = response.body as { data: StatsPayload };
    expect(body.data.byModule.length).toBeGreaterThan(0);
    expect(
      body.data.byModule.every(
        (module) => module.attempts === 0 && module.accuracyPct === 0,
      ),
    ).toBe(true);
    expect(body.data.cardLevels).toEqual({
      NEW: 0,
      HARD: 0,
      LEARNING: 0,
      EASY: 0,
    });
    expect(body.data.stuckCards).toEqual([]);
    expect(body.data.sessionsLast30d).toEqual([]);
  });

  it('aggregates only the current user finished attempts and recent sessions', async () => {
    const auth = await bearerFor(prisma);
    createdUserIds.push(auth.user.id);
    const catalog = await loadCatalog(prisma);

    await prisma.attempt.createMany({
      data: [
        {
          tenantId: auth.user.tenantId,
          userId: auth.user.id,
          quizId: catalog.quizId,
          cardId: catalog.cards[0],
          finishedAt: new Date(),
          correctCount: 1,
          totalCount: 2,
        },
        {
          tenantId: auth.user.tenantId,
          userId: auth.user.id,
          quizId: catalog.quizId,
          cardId: catalog.cards[0],
          finishedAt: null,
          correctCount: 9,
          totalCount: 9,
        },
      ],
    });
    await prisma.cardState.create({
      data: {
        tenantId: auth.user.tenantId,
        userId: auth.user.id,
        cardId: catalog.cards[0],
        level: CardLevel.EASY,
        seen: 2,
        streak: 2,
        lastSeenAt: new Date(),
      },
    });
    await prisma.studySession.createMany({
      data: [
        {
          tenantId: auth.user.tenantId,
          userId: auth.user.id,
          deckSelector: DeckSelector.ESSENTIAL,
          bidir: true,
          queue: [],
          reviews: 4,
          tally: { HARD: 1, LEARNING: 1, EASY: 2 } as Prisma.InputJsonValue,
          startedAt: new Date(),
        },
        {
          tenantId: auth.user.tenantId,
          userId: auth.user.id,
          deckSelector: DeckSelector.FULL,
          bidir: true,
          queue: [],
          reviews: 99,
          tally: { HARD: 99, LEARNING: 0, EASY: 0 } as Prisma.InputJsonValue,
          startedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        },
      ],
    });

    const response = await request(httpServer(app))
      .get('/api/v1/me/stats')
      .query({ courseId: catalog.courseId })
      .set(auth.header)
      .expect(200);

    const stats = (response.body as { data: StatsPayload }).data;
    const moduleOne = stats.byModule.find((module) => module.code === 'M1');
    expect(moduleOne).toEqual(
      expect.objectContaining({
        code: 'M1',
        accuracyPct: 50,
        attempts: 1,
      }),
    );
    expect(stats.cardLevels.EASY).toBe(1);
    expect(stats.cardLevels.HARD).toBe(0);
    expect(stats.stuckCards).toEqual([]);
    expect(stats.sessionsLast30d).toHaveLength(1);
    expect(stats.sessionsLast30d[0].reviews).toBe(4);
  });

  it('does not leak another tenant aggregations in byModule, cardLevels, stuckCards or sessions', async () => {
    const catalog = await loadCatalog(prisma);
    const tenantB = await createSecondTenant(prisma);
    createdTenantIds.push(tenantB.id);

    const userA = await bearerFor(prisma);
    const userB = await bearerFor(prisma, { tenantId: tenantB.id });
    createdUserIds.push(userA.user.id, userB.user.id);

    await prisma.attempt.createMany({
      data: [
        {
          tenantId: userA.user.tenantId,
          userId: userA.user.id,
          quizId: catalog.quizId,
          cardId: catalog.cards[0],
          finishedAt: new Date(),
          correctCount: 1,
          totalCount: 2,
        },
        {
          tenantId: tenantB.id,
          userId: userB.user.id,
          quizId: catalog.quizId,
          cardId: catalog.cards[0],
          finishedAt: new Date(),
          correctCount: 20,
          totalCount: 20,
        },
        {
          tenantId: tenantB.id,
          userId: userB.user.id,
          quizId: catalog.quizId,
          cardId: catalog.cards[1],
          finishedAt: new Date(),
          correctCount: 20,
          totalCount: 20,
        },
      ],
    });

    await prisma.cardState.createMany({
      data: [
        {
          tenantId: userA.user.tenantId,
          userId: userA.user.id,
          cardId: catalog.cards[0],
          level: CardLevel.EASY,
          seen: 1,
          streak: 1,
        },
        {
          tenantId: tenantB.id,
          userId: userB.user.id,
          cardId: catalog.cards[0],
          level: CardLevel.HARD,
          seen: 8,
          streak: 0,
          lastSeenAt: new Date(),
        },
        {
          tenantId: tenantB.id,
          userId: userB.user.id,
          cardId: catalog.cards[1],
          level: CardLevel.HARD,
          seen: 6,
          streak: 0,
          lastSeenAt: new Date(),
        },
        {
          tenantId: tenantB.id,
          userId: userB.user.id,
          cardId: catalog.cards[2],
          level: CardLevel.HARD,
          seen: 5,
          streak: 0,
          lastSeenAt: new Date(),
        },
        {
          tenantId: tenantB.id,
          userId: userB.user.id,
          cardId: catalog.cards[3],
          level: CardLevel.LEARNING,
          seen: 2,
          streak: 1,
        },
      ],
    });

    await prisma.studySession.createMany({
      data: [
        {
          tenantId: userA.user.tenantId,
          userId: userA.user.id,
          deckSelector: DeckSelector.ESSENTIAL,
          bidir: true,
          queue: [],
          reviews: 2,
          tally: { HARD: 0, LEARNING: 1, EASY: 1 } as Prisma.InputJsonValue,
          startedAt: new Date(),
        },
        {
          tenantId: tenantB.id,
          userId: userB.user.id,
          deckSelector: DeckSelector.FULL,
          bidir: true,
          queue: [],
          reviews: 40,
          tally: { HARD: 20, LEARNING: 10, EASY: 10 } as Prisma.InputJsonValue,
          startedAt: new Date(),
        },
        {
          tenantId: tenantB.id,
          userId: userB.user.id,
          deckSelector: DeckSelector.FULL,
          bidir: true,
          queue: [],
          reviews: 30,
          tally: { HARD: 15, LEARNING: 10, EASY: 5 } as Prisma.InputJsonValue,
          startedAt: new Date(),
        },
      ],
    });

    const [responseA, responseB] = await Promise.all([
      request(httpServer(app))
        .get('/api/v1/me/stats')
        .set(userA.header)
        .expect(200),
      request(httpServer(app))
        .get('/api/v1/me/stats')
        .set(userB.header)
        .expect(200),
    ]);

    const statsA = (responseA.body as { data: StatsPayload }).data;
    const statsB = (responseB.body as { data: StatsPayload }).data;

    // Sem recorte de curso o payload traz um M1 por curso — casar também pelo
    // título isola o módulo do curso base, que é onde o fixture criou attempts.
    const isBaseModuleOne = (module: { code: string; title: string }) =>
      module.code === 'M1' && module.title === catalog.moduleTitle;
    const moduleA = statsA.byModule.find(isBaseModuleOne);
    const moduleB = statsB.byModule.find(isBaseModuleOne);

    expect(moduleA).toEqual(
      expect.objectContaining({ accuracyPct: 50, attempts: 1 }),
    );
    expect(moduleB).toEqual(
      expect.objectContaining({ accuracyPct: 100, attempts: 2 }),
    );

    expect(statsA.cardLevels).toEqual({
      NEW: 0,
      HARD: 0,
      LEARNING: 0,
      EASY: 1,
    });
    expect(statsB.cardLevels).toEqual({
      NEW: 0,
      HARD: 3,
      LEARNING: 1,
      EASY: 0,
    });

    expect(statsA.stuckCards).toEqual([]);
    expect(statsB.stuckCards).toHaveLength(3);
    expect(statsB.stuckCards.every((card) => card.seen >= 3)).toBe(true);

    expect(statsA.sessionsLast30d).toHaveLength(1);
    expect(statsA.sessionsLast30d[0].reviews).toBe(2);
    expect(statsB.sessionsLast30d).toHaveLength(2);
    expect(
      statsB.sessionsLast30d.reduce((sum, session) => sum + session.reviews, 0),
    ).toBe(70);

    const leakedStuckIds = new Set(
      statsB.stuckCards.map((card) => card.cardId),
    );
    expect(
      statsA.stuckCards.some((card) => leakedStuckIds.has(card.cardId)),
    ).toBe(false);
    expect(statsA.sessionsLast30d.map((session) => session.id)).not.toEqual(
      expect.arrayContaining(
        statsB.sessionsLast30d.map((session) => session.id),
      ),
    );
  });
});

function httpServer(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

/**
 * `code` de módulo não é único no catálogo: cada aula tem o seu M1. Sem ancorar
 * no curso base, o `findFirst` pega o M1 de qualquer aula e o quiz do fixture
 * deixa de bater com o módulo que a asserção procura no `byModule`.
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
      id: true,
      title: true,
      quizzes: {
        where: { deletedAt: null },
        take: 1,
        select: { id: true },
      },
    },
  });
  const cards = await prisma.card.findMany({
    where: {
      deletedAt: null,
      deck: { course: { slug: BASE_COURSE_SLUG } },
    },
    take: 4,
    select: { id: true },
    orderBy: { ord: 'asc' },
  });

  if (!course || !moduleOne?.quizzes[0] || cards.length < 4) {
    throw new Error('Catalog seed missing — run pnpm seed');
  }

  return {
    courseId: course.id,
    quizId: moduleOne.quizzes[0].id,
    moduleTitle: moduleOne.title,
    cards: cards.map((card) => card.id),
  };
}
