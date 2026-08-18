import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CardLevel } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { bearerFor, createSecondTenant } from './helpers/auth.helper';

interface Envelope<T> {
  data: T;
}

interface SessionCard {
  id: string;
  code: string;
  deck: string;
  direction: string;
  front: string;
  back: string;
  state: { level: string; streak: number; seen: number };
  practiceQuestionIds: string[];
}

interface SessionView {
  sessionId: string;
  queueLength: number;
  reviews: number;
  finished: boolean;
  card: SessionCard | null;
  tally: { HARD: number; LEARNING: number; EASY: number };
  reviewed?: { cardId: string; level: string; retired: boolean };
}

interface DeckListItem {
  id: string;
  kind: string;
  cardCount: number;
  levels: { NEW: number; HARD: number; LEARNING: number; EASY: number };
}

describe('Study (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .useMocker((token) => {
        if (token === 'PRACTICE_SHUFFLE') {
          return <T>(items: readonly T[]) => [...items];
        }
        return undefined;
      })
      .compile();

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
    if (app) {
      await app.close();
    }
  });

  function server() {
    if (!app) {
      throw new Error('app not initialized');
    }
    return app.getHttpServer();
  }

  it('creates a session, reviews, and GET survives as F5 (progress in DB)', async () => {
    const auth = await bearerFor(prisma);

    const created = await request(server())
      .post('/api/v1/study-sessions')
      .set(auth.header)
      .send({ deckSelector: 'ESSENTIAL', bidir: true })
      .expect(201);

    const createdBody = created.body as Envelope<SessionView>;
    expect(createdBody.data.sessionId).toBeDefined();
    expect(createdBody.data.queueLength).toBe(43);
    expect(createdBody.data.reviews).toBe(0);
    expect(createdBody.data.card).toBeTruthy();
    expect(createdBody.data.card?.direction).toBe('FORWARD');
    expect(createdBody.data.card?.state.seen).toBe(0);

    const sessionId = createdBody.data.sessionId;
    const firstCardId = createdBody.data.card?.id;
    expect(firstCardId).toBeDefined();

    const reviewed = await request(server())
      .post(`/api/v1/study-sessions/${sessionId}/reviews`)
      .set(auth.header)
      .send({ rating: 'HARD' })
      .expect(200);

    const reviewedBody = reviewed.body as Envelope<SessionView>;
    expect(reviewedBody.data.reviews).toBe(1);
    expect(reviewedBody.data.tally.HARD).toBe(1);
    expect(reviewedBody.data.reviewed?.cardId).toBe(firstCardId);
    expect(reviewedBody.data.reviewed?.level).toBe('HARD');
    expect(reviewedBody.data.card).toBeTruthy();
    expect(reviewedBody.data.card?.id).not.toBe(firstCardId);

    const fetched = await request(server())
      .get(`/api/v1/study-sessions/${sessionId}`)
      .set(auth.header)
      .expect(200);

    const fetchedBody = fetched.body as Envelope<SessionView>;
    expect(fetchedBody.data.sessionId).toBe(sessionId);
    expect(fetchedBody.data.reviews).toBe(1);
    expect(fetchedBody.data.card?.id).toBe(reviewedBody.data.card?.id);
    expect(fetchedBody.data.queueLength).toBe(reviewedBody.data.queueLength);

    const persisted = await prisma.studySession.findFirst({
      where: { id: sessionId, tenantId: auth.user.tenantId },
    });
    expect(persisted?.reviews).toBe(1);
    const state = await prisma.cardState.findFirst({
      where: {
        userId: auth.user.id,
        tenantId: auth.user.tenantId,
        cardId: firstCardId,
      },
    });
    expect(state?.level).toBe(CardLevel.HARD);
    expect(state?.seen).toBe(1);
  });

  it('HARD_ONLY with no matching cards falls back to the full pool', async () => {
    const auth = await bearerFor(prisma);
    const created = await request(server())
      .post('/api/v1/study-sessions')
      .set(auth.header)
      .send({ deckSelector: 'ESSENTIAL', filter: 'HARD_ONLY' })
      .expect(201);

    const body = created.body as Envelope<SessionView>;
    expect(body.data.queueLength).toBe(43);
    expect(body.data.card).toBeTruthy();
  });

  it('FULL selector unions ESSENTIAL + EXAM', async () => {
    const auth = await bearerFor(prisma);
    const created = await request(server())
      .post('/api/v1/study-sessions')
      .set(auth.header)
      .send({ deckSelector: 'FULL' })
      .expect(201);

    const body = created.body as Envelope<SessionView>;
    expect(body.data.queueLength).toBe(152);
  });

  it('orders HARD cards first at session start', async () => {
    const auth = await bearerFor(prisma);
    const essential = await prisma.card.findMany({
      where: { deletedAt: null, deck: { kind: 'ESSENTIAL', deletedAt: null } },
      orderBy: { ord: 'asc' },
      take: 2,
    });
    const hardCard = essential[1];
    if (!hardCard) {
      throw new Error('seed missing essential cards');
    }
    await prisma.cardState.create({
      data: {
        userId: auth.user.id,
        tenantId: auth.user.tenantId,
        cardId: hardCard.id,
        level: CardLevel.HARD,
        seen: 3,
        streak: 0,
      },
    });

    const created = await request(server())
      .post('/api/v1/study-sessions')
      .set(auth.header)
      .send({ deckSelector: 'ESSENTIAL' })
      .expect(201);

    const body = created.body as Envelope<SessionView>;
    expect(body.data.card?.id).toBe(hardCard.id);
    expect(body.data.card?.state.level).toBe('HARD');
  });

  it('alternates direction and never reverses EXAM cards', async () => {
    const auth = await bearerFor(prisma);
    const essential = await prisma.card.findFirst({
      where: {
        deletedAt: null,
        reversible: true,
        deck: { kind: 'ESSENTIAL', deletedAt: null },
      },
    });
    const exam = await prisma.card.findFirst({
      where: {
        deletedAt: null,
        reversible: false,
        deck: { kind: 'EXAM', deletedAt: null },
      },
    });
    if (!essential || !exam) {
      throw new Error('seed missing cards');
    }

    await prisma.cardState.createMany({
      data: [
        {
          userId: auth.user.id,
          tenantId: auth.user.tenantId,
          cardId: essential.id,
          level: CardLevel.NEW,
          seen: 1,
          streak: 0,
        },
        {
          userId: auth.user.id,
          tenantId: auth.user.tenantId,
          cardId: exam.id,
          level: CardLevel.NEW,
          seen: 1,
          streak: 0,
        },
      ],
    });

    const session = await prisma.studySession.create({
      data: {
        tenantId: auth.user.tenantId,
        userId: auth.user.id,
        deckSelector: 'FULL',
        bidir: true,
        queue: [essential.id, exam.id],
        reviews: 0,
        tally: { HARD: 0, LEARNING: 0, EASY: 0 },
      },
    });

    const first = await request(server())
      .get(`/api/v1/study-sessions/${session.id}`)
      .set(auth.header)
      .expect(200);
    const firstBody = first.body as Envelope<SessionView>;
    expect(firstBody.data.card?.id).toBe(essential.id);
    expect(firstBody.data.card?.direction).toBe('REVERSE');
    expect(firstBody.data.card?.front).toBe(essential.backMd);
    expect(firstBody.data.card?.back).toBe(essential.frontMd);

    await prisma.studySession.update({
      where: { id: session.id },
      data: { queue: [exam.id] },
    });

    const second = await request(server())
      .get(`/api/v1/study-sessions/${session.id}`)
      .set(auth.header)
      .expect(200);
    const secondBody = second.body as Envelope<SessionView>;
    expect(secondBody.data.card?.id).toBe(exam.id);
    expect(secondBody.data.card?.direction).toBe('FORWARD');
    expect(secondBody.data.card?.front).toBe(exam.frontMd);
  });

  it('isolates sessions, listings and level aggregations across tenants', async () => {
    const authA = await bearerFor(prisma);
    const tenantB = await createSecondTenant(prisma);
    const authB = await bearerFor(prisma, { tenantId: tenantB.id });

    const created = await request(server())
      .post('/api/v1/study-sessions')
      .set(authA.header)
      .send({ deckSelector: 'ESSENTIAL' })
      .expect(201);
    const sessionA = (created.body as Envelope<SessionView>).data;
    const cardId = sessionA.card?.id;
    expect(cardId).toBeDefined();

    await request(server())
      .post(`/api/v1/study-sessions/${sessionA.sessionId}/reviews`)
      .set(authA.header)
      .send({ rating: 'HARD' })
      .expect(200);

    await request(server())
      .get(`/api/v1/study-sessions/${sessionA.sessionId}`)
      .set(authB.header)
      .expect(404);

    await request(server())
      .post(`/api/v1/study-sessions/${sessionA.sessionId}/reviews`)
      .set(authB.header)
      .send({ rating: 'EASY' })
      .expect(404);

    const decksA = await request(server())
      .get('/api/v1/decks')
      .set(authA.header)
      .expect(200);
    const decksB = await request(server())
      .get('/api/v1/decks')
      .set(authB.header)
      .expect(200);

    const listA = (decksA.body as Envelope<DeckListItem[]>).data;
    const listB = (decksB.body as Envelope<DeckListItem[]>).data;
    const essentialA = listA.find((deck) => deck.kind === 'ESSENTIAL');
    const essentialB = listB.find((deck) => deck.kind === 'ESSENTIAL');
    expect(essentialA?.cardCount).toBe(43);
    expect(essentialB?.cardCount).toBe(43);
    expect(essentialA?.levels.HARD).toBeGreaterThanOrEqual(1);
    expect(essentialB?.levels.HARD).toBe(0);
    expect(essentialB?.levels.NEW).toBe(43);

    const stateB = await prisma.cardState.findFirst({
      where: {
        userId: authB.user.id,
        tenantId: tenantB.id,
        cardId,
      },
    });
    expect(stateB).toBeNull();
  });

  it('finishes a session and returns tally plus easy count', async () => {
    const auth = await bearerFor(prisma);
    const created = await request(server())
      .post('/api/v1/study-sessions')
      .set(auth.header)
      .send({ deckSelector: 'ESSENTIAL' })
      .expect(201);
    const sessionId = (created.body as Envelope<SessionView>).data.sessionId;

    await request(server())
      .post(`/api/v1/study-sessions/${sessionId}/reviews`)
      .set(auth.header)
      .send({ rating: 'EASY' })
      .expect(200);

    const finished = await request(server())
      .post(`/api/v1/study-sessions/${sessionId}/finish`)
      .set(auth.header)
      .expect(200);

    const body = finished.body as Envelope<{
      sessionId: string;
      reviews: number;
      tally: { EASY: number };
      easyCount: number;
      poolSize: number;
      endedAt: string;
    }>;
    expect(body.data.sessionId).toBe(sessionId);
    expect(body.data.reviews).toBe(1);
    expect(body.data.tally.EASY).toBe(1);
    expect(body.data.poolSize).toBe(43);
    expect(body.data.endedAt).toBeTruthy();

    const persisted = await prisma.studySession.findFirst({
      where: { id: sessionId },
    });
    expect(persisted?.endedAt).toBeTruthy();
  });
});
