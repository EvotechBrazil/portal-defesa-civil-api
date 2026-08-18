import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { PRACTICE_SHUFFLE } from '../src/modules/practice/practice.constants';
import { PracticeShuffle } from '../src/modules/practice/practice.shuffle';
import {
  bearerFor,
  createSecondTenant,
  cleanupTestTenants,
} from './helpers/auth.helper';

interface Envelope<T> {
  data: T;
}

interface RunningOption {
  optionId: string;
  text: string;
}

interface RunningQuestion {
  questionId: string;
  shownOrd: number;
  stem: string;
  sourceRef: string | null;
  options: RunningOption[];
  chosenOptionId?: string | null;
}

interface RunningAttempt {
  attemptId: string;
  total: number;
  questions: RunningQuestion[];
}

interface AnswerRecord {
  recorded: true;
  answered: number;
  total: number;
}

interface HistoryPayload {
  history: Array<{
    attemptId: string;
    correctCount: number;
    totalCount: number;
    finishedAt: string;
  }>;
  current: RunningAttempt | null;
}

function assertNoIsCorrect(value: unknown, path = '$'): void {
  if (typeof value === 'string') {
    if (value.includes('isCorrect')) {
      throw new Error(`isCorrect leaked as string at ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoIsCorrect(item, `${path}[${index}]`),
    );
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (key === 'isCorrect') {
        throw new Error(`isCorrect key at ${path}.${key}`);
      }
      assertNoIsCorrect(nested, `${path}.${key}`);
    }
  }
}

describe('Practice (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let user: User;
  let authHeader: { Authorization: string };
  let cardId: string;
  let reverseShuffle = false;

  const shuffle: PracticeShuffle = <T>(items: readonly T[]): T[] =>
    reverseShuffle ? [...items].reverse() : [...items];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PRACTICE_SHUFFLE)
      .useValue(shuffle)
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
    const auth = await bearerFor(prisma);
    user = auth.user;
    authHeader = auth.header;

    const card = await prisma.card.findFirst({
      where: { deletedAt: null, code: '#1' },
      select: { id: true },
    });
    if (!card) {
      throw new Error('Seed card #1 is missing');
    }
    cardId = card.id;
  });

  afterAll(async () => {
    await prisma.attempt.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestTenants(prisma);
    await app.close();
  });

  it('POST /cards/:cardId/attempts returns shuffled questions without isCorrect', async () => {
    reverseShuffle = false;
    const response = await request(app.getHttpServer())
      .post(`/api/v1/cards/${cardId}/attempts`)
      .set(authHeader)
      .expect(201);

    assertNoIsCorrect(response.body);
    const body = response.body as Envelope<RunningAttempt>;
    expect(body.data.attemptId).toEqual(expect.any(String));
    expect(body.data.total).toBeGreaterThan(1);
    expect(body.data.questions).toHaveLength(body.data.total);
    expect(body.data.questions[0]?.options.length).toBeGreaterThan(1);
    expect(body.data.questions[0]?.stem.length).toBeGreaterThan(0);
  });

  it('POST /answers does not reveal correctness', async () => {
    reverseShuffle = false;
    const created = await request(app.getHttpServer())
      .post(`/api/v1/cards/${cardId}/attempts`)
      .set(authHeader)
      .expect(201);
    const attempt = (created.body as Envelope<RunningAttempt>).data;
    const question = attempt.questions[0];
    const option = question.options[0];

    const response = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attempt.attemptId}/answers`)
      .set(authHeader)
      .send({ questionId: question.questionId, optionId: option.optionId })
      .expect(200);

    assertNoIsCorrect(response.body);
    const body = response.body as Envelope<AnswerRecord>;
    expect(body.data).toEqual({
      recorded: true,
      answered: 1,
      total: attempt.total,
    });
  });

  it('second answer for the same question returns 409', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/cards/${cardId}/attempts`)
      .set(authHeader)
      .expect(201);
    const attempt = (created.body as Envelope<RunningAttempt>).data;
    const question = attempt.questions[0];
    const first = question.options[0];
    const second = question.options[1];

    await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attempt.attemptId}/answers`)
      .set(authHeader)
      .send({ questionId: question.questionId, optionId: first.optionId })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attempt.attemptId}/answers`)
      .set(authHeader)
      .send({ questionId: question.questionId, optionId: second.optionId })
      .expect(409);
  });

  it('GET unfinished attempt does not return the answer key', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/cards/${cardId}/attempts`)
      .set(authHeader)
      .expect(201);
    const attempt = (created.body as Envelope<RunningAttempt>).data;

    const response = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${attempt.attemptId}`)
      .set(authHeader)
      .expect(200);

    assertNoIsCorrect(response.body);
    expect(JSON.stringify(response.body)).not.toContain('answerKey');
    expect(JSON.stringify(response.body)).not.toContain('correctOptionId');
  });

  it('finish then finish again returns 409', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/cards/${cardId}/attempts`)
      .set(authHeader)
      .expect(201);
    const attempt = (created.body as Envelope<RunningAttempt>).data;

    const first = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attempt.attemptId}/finish`)
      .set(authHeader)
      .expect(200);
    const finished = first.body as Envelope<{
      totalCount: number;
      answerKey: unknown[];
    }>;
    expect(finished.data.totalCount).toBe(attempt.total);
    expect(Array.isArray(finished.data.answerKey)).toBe(true);
    expect(JSON.stringify(first.body)).toContain('isCorrect');

    await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attempt.attemptId}/finish`)
      .set(authHeader)
      .expect(409);
  });

  it('two attempts have different question and option orders', async () => {
    reverseShuffle = false;
    const firstRes = await request(app.getHttpServer())
      .post(`/api/v1/cards/${cardId}/attempts`)
      .set(authHeader)
      .expect(201);
    const first = (firstRes.body as Envelope<RunningAttempt>).data;

    reverseShuffle = true;
    const secondRes = await request(app.getHttpServer())
      .post(`/api/v1/cards/${cardId}/attempts`)
      .set(authHeader)
      .expect(201);
    const second = (secondRes.body as Envelope<RunningAttempt>).data;
    reverseShuffle = false;

    const firstQuestionIds = first.questions.map((item) => item.questionId);
    const secondQuestionIds = second.questions.map((item) => item.questionId);
    expect(firstQuestionIds).not.toEqual(secondQuestionIds);
    expect([...firstQuestionIds].sort()).toEqual([...secondQuestionIds].sort());

    const sampleId = firstQuestionIds[0];
    const firstOptions = first.questions
      .find((item) => item.questionId === sampleId)!
      .options.map((option) => option.optionId);
    const secondOptions = second.questions
      .find((item) => item.questionId === sampleId)!
      .options.map((option) => option.optionId);
    expect(firstOptions).not.toEqual(secondOptions);
    expect([...firstOptions].sort()).toEqual([...secondOptions].sort());
  });

  // §6.4 regra 1 / §9.2: answer_key sai de idle, nunca de running. Sem este
  // gate a rota auxiliar entrega correctOptionId com a tentativa aberta e o
  // aluno gabarita 100% sem saber a matéria.
  it('GET /cards/:cardId/answer-key is refused while an attempt is running', async () => {
    reverseShuffle = false;
    // Carta própria: os testes anteriores deixam tentativas abertas em #1.
    const other = await prisma.card.findFirst({
      where: { deletedAt: null, code: '#2' },
      select: { id: true },
    });
    if (!other) {
      throw new Error('Seed card #2 is missing');
    }

    await request(app.getHttpServer())
      .get(`/api/v1/cards/${other.id}/answer-key`)
      .set(authHeader)
      .expect(200);

    const created = await request(app.getHttpServer())
      .post(`/api/v1/cards/${other.id}/attempts`)
      .set(authHeader)
      .expect(201);
    const attempt = (created.body as Envelope<RunningAttempt>).data;

    const blocked = await request(app.getHttpServer())
      .get(`/api/v1/cards/${other.id}/answer-key`)
      .set(authHeader)
      .expect(409);
    assertNoIsCorrect(blocked.body);

    await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attempt.attemptId}/finish`)
      .set(authHeader)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/cards/${other.id}/answer-key`)
      .set(authHeader)
      .expect(200);
  });

  it('never leaks isCorrect on the auxiliary practice listings', async () => {
    const cards = await request(app.getHttpServer())
      .get('/api/v1/practice/cards?page=1&pageSize=5')
      .set(authHeader)
      .expect(200);
    assertNoIsCorrect(cards.body);

    const recent = await request(app.getHttpServer())
      .get('/api/v1/practice/recent')
      .set(authHeader)
      .expect(200);
    assertNoIsCorrect(recent.body);
  });

  it('GET history is isolated by tenant', async () => {
    reverseShuffle = false;
    const created = await request(app.getHttpServer())
      .post(`/api/v1/cards/${cardId}/attempts`)
      .set(authHeader)
      .expect(201);
    const attempt = (created.body as Envelope<RunningAttempt>).data;
    await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attempt.attemptId}/finish`)
      .set(authHeader)
      .expect(200);

    const tenantB = await createSecondTenant(prisma);
    const authB = await bearerFor(prisma, { tenantId: tenantB.id });

    const foreignHistory = await request(app.getHttpServer())
      .get(`/api/v1/cards/${cardId}/attempts`)
      .set(authB.header)
      .expect(200);
    assertNoIsCorrect(foreignHistory.body);
    const payload = foreignHistory.body as Envelope<HistoryPayload>;
    expect(payload.data.history).toEqual([]);
    expect(
      payload.data.history.some((row) => row.attemptId === attempt.attemptId),
    ).toBe(false);

    const ownHistory = await request(app.getHttpServer())
      .get(`/api/v1/cards/${cardId}/attempts`)
      .set(authHeader)
      .expect(200);
    const own = ownHistory.body as Envelope<HistoryPayload>;
    expect(
      own.data.history.some((row) => row.attemptId === attempt.attemptId),
    ).toBe(true);

    await request(app.getHttpServer())
      .get(`/api/v1/attempts/${attempt.attemptId}`)
      .set(authB.header)
      .expect(404);

    // §12: o adversarial precisa cobrir mutação, não só leitura.
    await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attempt.attemptId}/answers`)
      .set(authB.header)
      .send({
        questionId: attempt.questions[0].questionId,
        optionId: attempt.questions[0].options[0].optionId,
      })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attempt.attemptId}/finish`)
      .set(authB.header)
      .expect(404);

    const foreignRecent = await request(app.getHttpServer())
      .get('/api/v1/practice/recent')
      .set(authB.header)
      .expect(200);
    assertNoIsCorrect(foreignRecent.body);
    const recentPayload = foreignRecent.body as Envelope<{
      items: Array<{ attemptId: string }>;
    }>;
    expect(
      recentPayload.data.items.some(
        (row) => row.attemptId === attempt.attemptId,
      ),
    ).toBe(false);

    await prisma.attempt.deleteMany({ where: { userId: authB.user.id } });
    await prisma.user.delete({ where: { id: authB.user.id } });
    await prisma.tenant.delete({ where: { id: tenantB.id } });
  });
});
