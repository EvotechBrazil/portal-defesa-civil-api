import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { PracticeRepository } from './practice.repository';
import { PracticeService } from './practice.service';
import { PracticeShuffle } from './practice.shuffle';
import {
  AttemptRecord,
  CardWithQuestionsRecord,
  OptionRecord,
  QuestionRecord,
} from './practice.types';

function option(
  id: string,
  questionId: string,
  ord: number,
  isCorrect: boolean,
): OptionRecord {
  return {
    id,
    questionId,
    ord,
    text: `opt-${id}`,
    isCorrect,
  };
}

function question(id: string, options: OptionRecord[]): QuestionRecord {
  return {
    id,
    stem: `stem-${id}`,
    explanationMd: null,
    sourceRef: 'M1 › Quiz 1.1',
    deletedAt: null,
    options,
  };
}

function cardWithQuestions(): CardWithQuestionsRecord {
  const q1 = question('q1', [
    option('o1a', 'q1', 0, true),
    option('o1b', 'q1', 1, false),
  ]);
  const q2 = question('q2', [
    option('o2a', 'q2', 0, false),
    option('o2b', 'q2', 1, true),
  ]);
  return {
    id: 'card-1',
    code: '#1',
    deletedAt: null,
    cardQuestions: [
      { cardId: 'card-1', questionId: 'q1', rank: 0, question: q1 },
      { cardId: 'card-1', questionId: 'q2', rank: 1, question: q2 },
    ],
  };
}

function runningAttempt(): AttemptRecord {
  const card = cardWithQuestions();
  const q1 = card.cardQuestions[0].question;
  const q2 = card.cardQuestions[1].question;
  return {
    id: 'att-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    cardId: 'card-1',
    finishedAt: null,
    correctCount: 0,
    totalCount: 2,
    startedAt: new Date('2026-08-18T00:00:00Z'),
    items: [
      {
        id: 'item-1',
        attemptId: 'att-1',
        questionId: 'q1',
        chosenOptionId: null,
        isCorrect: null,
        shownOrd: 0,
        optionOrder: [0, 1],
        question: q1,
      },
      {
        id: 'item-2',
        attemptId: 'att-1',
        questionId: 'q2',
        chosenOptionId: null,
        isCorrect: null,
        shownOrd: 1,
        optionOrder: [1, 0],
        question: q2,
      },
    ],
  };
}

const user: AuthenticatedUser = {
  id: 'user-1',
  email: 'a@example.com',
  role: 'STUDENT',
  tenantId: 'tenant-1',
};

describe('PracticeService', () => {
  let repository: jest.Mocked<PracticeRepository>;
  let shuffle: PracticeShuffle;
  let service: PracticeService;

  beforeEach(() => {
    repository = {
      findActiveCardWithQuestions: jest.fn(),
      countFinishedAttempts: jest.fn().mockResolvedValue(0),
      createAttempt: jest.fn(),
      findAttemptForUser: jest.fn(),
      findLatestUnfinished: jest.fn(),
      recordAnswer: jest.fn(),
      countAnswered: jest.fn(),
      finishAttempt: jest.fn(),
      markUnansweredIncorrect: jest.fn(),
      findFinishedHistory: jest.fn(),
      listPracticeCards: jest.fn(),
      countPracticeCards: jest.fn(),
      findRecentFinished: jest.fn(),
    } as unknown as jest.Mocked<PracticeRepository>;
    shuffle = <T>(items: readonly T[]): T[] => [...items].reverse();
    service = new PracticeService(repository, shuffle);
  });

  it('creates an attempt with shuffled questions and no isCorrect', async () => {
    const card = cardWithQuestions();
    repository.findActiveCardWithQuestions.mockResolvedValue(card);
    repository.createAttempt.mockImplementation((params) => {
      const attempt = runningAttempt();
      attempt.items = params.items.map((item, index) => ({
        ...attempt.items[index],
        questionId: item.questionId,
        shownOrd: item.shownOrd,
        optionOrder: item.optionOrder,
        question: card.cardQuestions.find(
          (link) => link.questionId === item.questionId,
        )!.question,
      }));
      return Promise.resolve(attempt);
    });

    const view = await service.create(user, 'card-1');
    expect(repository.createAttempt.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        items: [
          { questionId: 'q2', shownOrd: 0, optionOrder: [1, 0] },
          { questionId: 'q1', shownOrd: 1, optionOrder: [1, 0] },
        ],
      }),
    );
    expect(JSON.stringify(view)).not.toContain('isCorrect');
    expect(view.questions.map((question) => question.questionId)).toEqual([
      'q2',
      'q1',
    ]);
  });

  it('throws 404 when the card does not exist', async () => {
    repository.findActiveCardWithQuestions.mockResolvedValue(null);
    await expect(service.create(user, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a second answer on the same question', async () => {
    const attempt = runningAttempt();
    attempt.items[0].chosenOptionId = 'o1a';
    repository.findAttemptForUser.mockResolvedValue(attempt);
    await expect(
      service.answer(user, 'att-1', { questionId: 'q1', optionId: 'o1b' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an invalid option without revealing correctness', async () => {
    repository.findAttemptForUser.mockResolvedValue(runningAttempt());
    await expect(
      service.answer(user, 'att-1', { questionId: 'q1', optionId: 'nope' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records an answer without isCorrect in the payload', async () => {
    repository.findAttemptForUser.mockResolvedValue(runningAttempt());
    repository.recordAnswer.mockResolvedValue(1);
    repository.countAnswered.mockResolvedValue(1);
    const result = await service.answer(user, 'att-1', {
      questionId: 'q1',
      optionId: 'o1a',
    });
    expect(result).toEqual({ recorded: true, answered: 1, total: 2 });
    expect(JSON.stringify(result)).not.toContain('isCorrect');
  });

  it('rejects finish on an already finished attempt', async () => {
    const attempt = runningAttempt();
    attempt.finishedAt = new Date();
    repository.findAttemptForUser.mockResolvedValue(attempt);
    await expect(service.finish(user, 'att-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('scores a finished attempt and compares with the previous one', async () => {
    const running = runningAttempt();
    const finished = {
      ...running,
      finishedAt: new Date('2026-08-18T01:00:00Z'),
      correctCount: 2,
      totalCount: 2,
      items: running.items.map((item) => ({ ...item, isCorrect: true })),
    };
    repository.findAttemptForUser
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(finished)
      .mockResolvedValueOnce(finished);
    repository.markUnansweredIncorrect.mockResolvedValue(undefined);
    repository.finishAttempt.mockResolvedValue(1);
    repository.findFinishedHistory.mockResolvedValue([
      {
        id: 'att-0',
        correctCount: 1,
        totalCount: 2,
        finishedAt: new Date('2026-08-17T00:00:00Z'),
      },
    ]);

    const result = await service.finish(user, 'att-1');
    expect(result.correctCount).toBe(2);
    expect(result.scorePct).toBe(100);
    expect(result.previous?.scorePct).toBe(50);
    expect(result.deltaPct).toBe(50);
    expect(result.answerKey).toHaveLength(2);
    expect(result.answerKey[0]?.isCorrect).toBe(true);
  });
});
