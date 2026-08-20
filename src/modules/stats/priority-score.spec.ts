import {
  computePriorityScore,
  PRIORITY_SCORE_WEIGHTS,
  splitByMinAttempts,
} from './priority-score';

describe('computePriorityScore', () => {
  it('weights accuracy, capped consistency and capped volume, then rounds', () => {
    const result = computePriorityScore({
      practiceAccuracyPct: 80,
      activeDays30d: 10,
      attempts: 10,
    });

    expect(result.parts.accuracy).toBe(40);
    expect(result.parts.consistency).toBe(15);
    expect(result.parts.volume).toBe(10);
    expect(result.priorityScore).toBe(65);
  });

  it('caps active days and attempts so a single spike cannot dominate', () => {
    const result = computePriorityScore({
      practiceAccuracyPct: 100,
      activeDays30d: 90,
      attempts: 400,
    });

    expect(result.parts.accuracy).toBe(50);
    expect(result.parts.consistency).toBe(30);
    expect(result.parts.volume).toBe(20);
    expect(result.priorityScore).toBe(100);
    expect(PRIORITY_SCORE_WEIGHTS.consistencyCapDays).toBe(20);
    expect(PRIORITY_SCORE_WEIGHTS.volumeCapAttempts).toBe(20);
  });

  it('returns zero when there is no study activity', () => {
    expect(
      computePriorityScore({
        practiceAccuracyPct: 0,
        activeDays30d: 0,
        attempts: 0,
      }),
    ).toEqual({
      priorityScore: 0,
      parts: { accuracy: 0, consistency: 0, volume: 0 },
    });
  });
});

describe('splitByMinAttempts', () => {
  const rows = [
    { userId: 'high-one-shot', attempts: 1, accuracy: 100 },
    { userId: 'steady', attempts: 5, accuracy: 80 },
    { userId: 'none', attempts: 0, accuracy: 0 },
    { userId: 'on-floor', attempts: 3, accuracy: 50 },
  ];

  it('moves anyone below the floor out of the ranking', () => {
    const { ranked, insufficientBase } = splitByMinAttempts(rows, 3);

    expect(ranked.map((row) => row.userId)).toEqual(['steady', 'on-floor']);
    expect(insufficientBase.map((row) => row.userId)).toEqual([
      'high-one-shot',
      'none',
    ]);
  });

  it('keeps a one-shot 100% out of first place when the floor is the default', () => {
    const { ranked, insufficientBase } = splitByMinAttempts(rows, 3);
    const leader = [...ranked].sort((a, b) => b.accuracy - a.accuracy)[0];

    expect(leader?.userId).toBe('steady');
    expect(insufficientBase.some((row) => row.accuracy === 100)).toBe(true);
  });

  it('puts zero-attempt people into ranked when the floor is 0 — the reason the DTO forbids it', () => {
    const { ranked, insufficientBase } = splitByMinAttempts(rows, 0);

    expect(ranked.map((row) => row.userId)).toEqual([
      'high-one-shot',
      'steady',
      'none',
      'on-floor',
    ]);
    expect(insufficientBase).toEqual([]);
  });
});
