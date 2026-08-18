import { toRunningAttempt } from './practice.mapper';
import { AttemptRecord } from './practice.types';

function assertNoIsCorrect(value: unknown, path = '$'): void {
  if (typeof value === 'string') {
    expect(`${path}:${value}`).not.toContain('isCorrect');
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
      expect(key).not.toBe('isCorrect');
      assertNoIsCorrect(nested, `${path}.${key}`);
    }
  }
}

describe('practice mapper', () => {
  it('strips isCorrect from a running attempt even when records contain it', () => {
    const record: AttemptRecord = {
      id: 'att-1',
      tenantId: 't1',
      userId: 'u1',
      cardId: 'c1',
      finishedAt: null,
      correctCount: 0,
      totalCount: 1,
      startedAt: new Date('2026-08-18T00:00:00Z'),
      items: [
        {
          id: 'item-1',
          attemptId: 'att-1',
          questionId: 'q1',
          chosenOptionId: null,
          isCorrect: true,
          shownOrd: 0,
          optionOrder: [1, 0],
          question: {
            id: 'q1',
            stem: 'O risco é definido como:',
            explanationMd: 'comentário',
            sourceRef: 'MÓDULO 2 › Quiz 2.1',
            deletedAt: null,
            options: [
              {
                id: 'o1',
                questionId: 'q1',
                ord: 0,
                text: 'errada',
                isCorrect: false,
              },
              {
                id: 'o2',
                questionId: 'q1',
                ord: 1,
                text: 'certa',
                isCorrect: true,
              },
            ],
          },
        },
      ],
    };

    const view = toRunningAttempt(record);
    expect(view.questions[0]?.options.map((option) => option.optionId)).toEqual(
      ['o2', 'o1'],
    );
    assertNoIsCorrect(view);
  });
});
