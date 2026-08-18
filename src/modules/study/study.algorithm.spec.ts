import { CardLevel } from '@prisma/client';
import {
  applyHardOnlyFilter,
  applyReview,
  CardProgress,
  identityShuffle,
  orderPoolByRank,
  resolveDirection,
} from './study.algorithm';

function blankState(): CardProgress {
  return { level: 'NEW', streak: 0, seen: 0, lastSeenAt: null };
}

describe('study algorithm', () => {
  describe('40-review spacing (original engine)', () => {
    it('HARD reappears at 0, 3, 18; LEARNING at 1, 8, 23; EASY retires after 2 consecutive', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-08-18T12:00:00.000Z'));

      const pool = Array.from({ length: 43 }, (_, index) => ({
        id: `c${index}`,
        level: 'NEW' as const,
      }));
      let queue = orderPoolByRank(pool, identityShuffle).map((card) => card.id);
      const states = new Map<string, CardProgress>(
        pool.map((card) => [card.id, blankState()]),
      );
      const seenOrder: string[] = [];

      for (let step = 0; step < 40; step += 1) {
        const cardId = queue[0];
        expect(cardId).toBeDefined();
        seenOrder.push(cardId);
        const rating = step === 0 ? 'HARD' : step === 1 ? 'LEARNING' : 'EASY';
        const current = states.get(cardId);
        if (!current) {
          throw new Error('missing state');
        }
        const result = applyReview(queue, current, rating, new Date());
        queue = result.queue;
        states.set(result.cardId, result.state);
      }

      const hardId = 'c0';
      const learningId = 'c1';
      const hardPositions = seenOrder
        .map((id, index) => (id === hardId ? index : -1))
        .filter((index) => index >= 0);
      const learningPositions = seenOrder
        .map((id, index) => (id === learningId ? index : -1))
        .filter((index) => index >= 0);

      expect(hardPositions).toEqual([0, 3, 18]);
      expect(learningPositions).toEqual([1, 8, 23]);

      const alwaysEasyId = 'c2';
      const easyPositions = seenOrder
        .map((id, index) => (id === alwaysEasyId ? index : -1))
        .filter((index) => index >= 0);
      expect(easyPositions).toHaveLength(2);
      expect(states.get(alwaysEasyId)?.level).toBe('EASY');
      expect(states.get(alwaysEasyId)?.streak).toBe(2);
      expect(queue.includes(alwaysEasyId)).toBe(false);

      const hardState = states.get(hardId);
      expect(hardState?.level).toBe('EASY');
      expect(hardState?.streak).toBe(2);
      expect(queue.includes(hardId)).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('queue order', () => {
    it('stable-sorts HARD first after shuffle', () => {
      const pool = [
        { id: 'new', level: 'NEW' as const },
        { id: 'easy', level: 'EASY' as const },
        { id: 'hard', level: 'HARD' as const },
        { id: 'learning', level: 'LEARNING' as const },
      ];
      const ordered = orderPoolByRank(pool, identityShuffle).map(
        (card) => card.id,
      );
      expect(ordered).toEqual(['hard', 'learning', 'new', 'easy']);
    });
  });

  describe('direction', () => {
    it('starts FORWARD and alternates only when bidir and reversible', () => {
      expect(resolveDirection(true, true, 0)).toBe('FORWARD');
      expect(resolveDirection(true, true, 1)).toBe('REVERSE');
      expect(resolveDirection(true, true, 2)).toBe('FORWARD');
      expect(resolveDirection(true, true, 3)).toBe('REVERSE');
    });

    it('never reverses when reversible is false', () => {
      expect(resolveDirection(true, false, 1)).toBe('FORWARD');
      expect(resolveDirection(true, false, 3)).toBe('FORWARD');
    });

    it('never reverses when bidir is off', () => {
      expect(resolveDirection(false, true, 1)).toBe('FORWARD');
    });
  });

  describe('HARD_ONLY filter', () => {
    const pool = [
      { id: 'a', level: 'NEW' as CardLevel },
      { id: 'b', level: 'EASY' as CardLevel },
      { id: 'c', level: 'HARD' as CardLevel },
      { id: 'd', level: 'LEARNING' as CardLevel },
    ];

    it('keeps HARD and LEARNING', () => {
      expect(
        applyHardOnlyFilter(pool, 'HARD_ONLY').map((card) => card.id),
      ).toEqual(['c', 'd']);
    });

    it('falls back to the full pool when the filter is empty', () => {
      const onlyNew = pool.filter(
        (card) => card.level === 'NEW' || card.level === 'EASY',
      );
      expect(applyHardOnlyFilter(onlyNew, 'HARD_ONLY')).toEqual(onlyNew);
    });
  });
});
