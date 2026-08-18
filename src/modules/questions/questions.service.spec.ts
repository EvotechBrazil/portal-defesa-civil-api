import { NotFoundException } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import {
  QuestionDetailsRecord,
  QuestionsRepository,
} from './questions.repository';

function questionFixture(
  overrides?: Partial<QuestionDetailsRecord>,
): QuestionDetailsRecord {
  return {
    id: 'q-1',
    quizId: 'quiz-1',
    ord: 1,
    stem: 'O risco é definido como:',
    explanationMd: '<em>Comentário:</em> equação do risco.',
    sourceRef: 'MÓDULO 2 › Quiz 2.1',
    verifiedAt: new Date('2026-08-18'),
    verifiedBy: 'platform-elimination-algorithm',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    options: [
      {
        id: 'opt-1',
        questionId: 'q-1',
        ord: 0,
        text: 'Ameaça apenas',
        isCorrect: false,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      {
        id: 'opt-2',
        questionId: 'q-1',
        ord: 1,
        text: 'Ameaça × Exposição × Vulnerabilidade ÷ Capacidade',
        isCorrect: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
    ],
    quiz: { code: '2.1', courseModule: { code: 'M2' } },
    ...overrides,
  };
}

describe('QuestionsService', () => {
  let service: QuestionsService;
  let repository: jest.Mocked<
    Pick<QuestionsRepository, 'findMany' | 'count' | 'findById'>
  >;

  beforeEach(() => {
    repository = {
      findMany: jest.fn(),
      count: jest.fn(),
      findById: jest.fn(),
    };
    service = new QuestionsService(
      repository as unknown as QuestionsRepository,
    );
  });

  describe('list', () => {
    it('returns mapped questions and pagination meta', async () => {
      repository.findMany.mockResolvedValue([questionFixture()]);
      repository.count.mockResolvedValue(109);

      const result = await service.list({ page: 1, pageSize: 20 });

      expect(repository.findMany).toHaveBeenCalledWith({
        moduleCode: undefined,
        quizCode: undefined,
        search: undefined,
        skip: 0,
        take: 20,
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('q-1');
      expect(result.data[0].moduleCode).toBe('M2');
      expect(result.data[0].quizCode).toBe('2.1');
      expect(result.data[0].options.some((option) => option.isCorrect)).toBe(
        true,
      );
      expect(result.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 109,
        pageCount: 6,
      });
    });

    it('forwards module, quiz and search filters', async () => {
      repository.findMany.mockResolvedValue([]);
      repository.count.mockResolvedValue(0);

      await service.list({
        page: 2,
        pageSize: 10,
        moduleCode: 'M1',
        quizCode: '1.1',
        search: 'risco',
      });

      expect(repository.findMany).toHaveBeenCalledWith({
        moduleCode: 'M1',
        quizCode: '1.1',
        search: 'risco',
        skip: 10,
        take: 10,
      });
      expect(repository.count).toHaveBeenCalledWith({
        moduleCode: 'M1',
        quizCode: '1.1',
        search: 'risco',
      });
    });

    it('clamps pageSize at 100', async () => {
      repository.findMany.mockResolvedValue([]);
      repository.count.mockResolvedValue(0);

      await service.list({ page: 1, pageSize: 250 });

      expect(repository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100, skip: 0 }),
      );
    });
  });

  describe('getById', () => {
    it('returns the question with options, isCorrect and explanation', async () => {
      repository.findById.mockResolvedValue(questionFixture());

      const result = await service.getById('q-1');

      expect(result.explanationMd).toContain('equação do risco');
      expect(result.options.filter((option) => option.isCorrect)).toHaveLength(
        1,
      );
    });

    it('throws when the question does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getById('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
