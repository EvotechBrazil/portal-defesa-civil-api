import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { QuestionDto } from '../src/modules/questions/dtos/question-response.dto';
import {
  createTestingApp,
  httpServer,
  readEnvelope,
} from './helpers/app.helper';
import { bearerFor } from './helpers/auth.helper';

const MODULE_QUESTION_COUNTS: Record<string, number> = {
  M1: 13,
  M2: 21,
  M3: 17,
  M4: 20,
  M5: 18,
  M6: 20,
  M7: 24,
};

describe('Questions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await createTestingApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    await app.close();
  });

  async function authHeader() {
    const session = await bearerFor(prisma);
    createdUserIds.push(session.user.id);
    return session.header;
  }

  it('lists 133 questions in a paginated envelope', async () => {
    const header = await authHeader();

    const firstResponse = await request(httpServer(app))
      .get('/api/v1/questions')
      .query({ page: 1, pageSize: 100 })
      .set(header)
      .expect(200);
    const firstPage = readEnvelope<QuestionDto[]>(firstResponse.body);

    expect(firstPage.meta).toEqual({
      page: 1,
      pageSize: 100,
      total: 133,
      pageCount: 2,
    });
    expect(firstPage.data).toHaveLength(100);

    const secondResponse = await request(httpServer(app))
      .get('/api/v1/questions')
      .query({ page: 2, pageSize: 100 })
      .set(header)
      .expect(200);
    const secondPage = readEnvelope<QuestionDto[]>(secondResponse.body);

    expect(secondPage.data).toHaveLength(33);
    expect(secondPage.meta?.total).toBe(133);

    const ids = new Set(
      [...firstPage.data, ...secondPage.data].map((question) => question.id),
    );
    expect(ids.size).toBe(133);
  });

  it('filters by module with the measured counts', async () => {
    const header = await authHeader();

    for (const [moduleCode, total] of Object.entries(MODULE_QUESTION_COUNTS)) {
      const response = await request(httpServer(app))
        .get('/api/v1/questions')
        .query({ moduleCode, page: 1, pageSize: 100 })
        .set(header)
        .expect(200);
      const envelope = readEnvelope<QuestionDto[]>(response.body);

      expect(envelope.meta?.total).toBe(total);
      expect(envelope.data).toHaveLength(total);
      expect(
        envelope.data.every((question) => question.moduleCode === moduleCode),
      ).toBe(true);
    }
  });

  it('rejects pageSize above 100', async () => {
    const header = await authHeader();

    await request(httpServer(app))
      .get('/api/v1/questions')
      .query({ pageSize: 101 })
      .set(header)
      .expect(400);
  });

  it('searches stems case-insensitively', async () => {
    const header = await authHeader();

    const lowerResponse = await request(httpServer(app))
      .get('/api/v1/questions')
      .query({ search: 'principal motivo', pageSize: 100 })
      .set(header)
      .expect(200);
    const upperResponse = await request(httpServer(app))
      .get('/api/v1/questions')
      .query({ search: 'PRINCIPAL MOTIVO', pageSize: 100 })
      .set(header)
      .expect(200);

    const lower = readEnvelope<QuestionDto[]>(lowerResponse.body);
    const upper = readEnvelope<QuestionDto[]>(upperResponse.body);

    expect(lower.meta?.total).toBeGreaterThan(0);
    expect(lower.meta?.total).toBe(upper.meta?.total);
    expect(
      lower.data.some((question) =>
        question.stem.toLowerCase().includes('principal motivo'),
      ),
    ).toBe(true);
  });

  it('returns a question with options, isCorrect and explanationMd', async () => {
    const header = await authHeader();

    const listResponse = await request(httpServer(app))
      .get('/api/v1/questions')
      .query({ pageSize: 1 })
      .set(header)
      .expect(200);
    const listed = readEnvelope<QuestionDto[]>(listResponse.body).data[0];

    const response = await request(httpServer(app))
      .get(`/api/v1/questions/${listed.id}`)
      .set(header)
      .expect(200);
    const question = readEnvelope<QuestionDto>(response.body).data;

    expect(question.id).toBe(listed.id);
    expect(question.options.length).toBeGreaterThanOrEqual(3);
    expect(question.options.filter((option) => option.isCorrect)).toHaveLength(
      1,
    );
    expect(question.explanationMd).toBeTruthy();
  });

  it('returns 404 for an unknown question', async () => {
    const header = await authHeader();

    await request(httpServer(app))
      .get('/api/v1/questions/cm00000000000000000000000')
      .set(header)
      .expect(404);
  });
});
