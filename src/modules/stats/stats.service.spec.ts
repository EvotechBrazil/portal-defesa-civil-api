import { CardLevel, DeckSelector } from '@prisma/client';
import { StatsRepository } from './stats.repository';
import { StatsService } from './stats.service';

describe('StatsService', () => {
  let service: StatsService;
  let repository: jest.Mocked<
    Pick<
      StatsRepository,
      | 'findCourseById'
      | 'findModules'
      | 'findFinishedAttempts'
      | 'groupCardLevels'
      | 'findStuckCards'
      | 'findSessionsSince'
    >
  >;

  const modules = [
    { id: 'mod-1', code: 'M1', title: 'Apresentação' },
    { id: 'mod-2', code: 'M2', title: 'Risco' },
  ];

  beforeEach(() => {
    repository = {
      findCourseById: jest.fn(),
      findModules: jest.fn().mockResolvedValue(modules),
      findFinishedAttempts: jest.fn().mockResolvedValue([]),
      groupCardLevels: jest.fn().mockResolvedValue([]),
      findStuckCards: jest.fn().mockResolvedValue([]),
      findSessionsSince: jest.fn().mockResolvedValue([]),
    };
    service = new StatsService(repository as unknown as StatsRepository);
  });

  it('returns zeros and empty arrays when the user has no study or practice data', async () => {
    const stats = await service.getMine('user-a', 'tenant-a');

    expect(stats.byModule).toEqual([
      { code: 'M1', title: 'Apresentação', accuracyPct: 0, attempts: 0 },
      { code: 'M2', title: 'Risco', accuracyPct: 0, attempts: 0 },
    ]);
    expect(stats.cardLevels).toEqual({
      NEW: 0,
      HARD: 0,
      LEARNING: 0,
      EASY: 0,
    });
    expect(stats.stuckCards).toEqual([]);
    expect(stats.sessionsLast30d).toEqual([]);
    expect(repository.findFinishedAttempts).toHaveBeenCalledWith(
      'user-a',
      'tenant-a',
      undefined,
    );
    expect(repository.groupCardLevels).toHaveBeenCalledWith(
      'user-a',
      'tenant-a',
      undefined,
    );
    expect(repository.findStuckCards).toHaveBeenCalledWith(
      'user-a',
      'tenant-a',
      undefined,
    );
    expect(repository.findSessionsSince).toHaveBeenCalledWith(
      'user-a',
      'tenant-a',
      expect.any(Date),
    );
  });

  it('returns empty payload when courseId does not exist', async () => {
    repository.findCourseById.mockResolvedValue(null);

    const stats = await service.getMine('user-a', 'tenant-a', 'missing-course');

    expect(stats).toEqual({
      byModule: [],
      cardLevels: { NEW: 0, HARD: 0, LEARNING: 0, EASY: 0 },
      stuckCards: [],
      sessionsLast30d: [],
    });
    expect(repository.findFinishedAttempts).not.toHaveBeenCalled();
    expect(repository.groupCardLevels).not.toHaveBeenCalled();
    expect(repository.findStuckCards).not.toHaveBeenCalled();
    expect(repository.findSessionsSince).not.toHaveBeenCalled();
  });

  it('aggregates accuracyPct from finished attempts of the current tenant only', async () => {
    repository.findCourseById.mockResolvedValue({ id: 'course-1' });
    repository.findFinishedAttempts.mockResolvedValue([
      { courseModuleId: 'mod-1', correctCount: 1, totalCount: 2 },
      { courseModuleId: 'mod-1', correctCount: 3, totalCount: 4 },
      { courseModuleId: 'mod-2', correctCount: 0, totalCount: 0 },
    ]);

    const stats = await service.getMine('user-a', 'tenant-a', 'course-1');

    expect(repository.findCourseById).toHaveBeenCalledWith('course-1');
    expect(repository.findFinishedAttempts).toHaveBeenCalledWith(
      'user-a',
      'tenant-a',
      'course-1',
    );
    expect(stats.byModule).toEqual([
      { code: 'M1', title: 'Apresentação', accuracyPct: 67, attempts: 2 },
      { code: 'M2', title: 'Risco', accuracyPct: 0, attempts: 0 },
    ]);
  });

  it('maps card levels, stuck cards and recent sessions', async () => {
    const seenAt = new Date('2026-08-01T12:00:00.000Z');
    const startedAt = new Date('2026-08-10T09:00:00.000Z');
    const endedAt = new Date('2026-08-10T09:20:00.000Z');

    repository.groupCardLevels.mockResolvedValue([
      { level: CardLevel.HARD, count: 3 },
      { level: CardLevel.EASY, count: 7 },
    ]);
    repository.findStuckCards.mockResolvedValue([
      {
        cardId: 'card-1',
        code: '#1',
        frontMd: 'Fórmula do risco',
        seen: 5,
        streak: 0,
        lastSeenAt: seenAt,
      },
    ]);
    repository.findSessionsSince.mockResolvedValue([
      {
        id: 'session-1',
        startedAt,
        endedAt,
        reviews: 8,
        tally: { HARD: 2, LEARNING: 3, EASY: 3 },
        deckSelector: DeckSelector.ESSENTIAL,
      },
      {
        id: 'session-2',
        startedAt,
        endedAt: null,
        reviews: 1,
        tally: { unexpected: true },
        deckSelector: DeckSelector.FULL,
      },
    ]);

    const stats = await service.getMine('user-a', 'tenant-a');

    expect(stats.cardLevels).toEqual({
      NEW: 0,
      HARD: 3,
      LEARNING: 0,
      EASY: 7,
    });
    expect(stats.stuckCards).toEqual([
      {
        cardId: 'card-1',
        code: '#1',
        frontMd: 'Fórmula do risco',
        seen: 5,
        streak: 0,
        lastSeenAt: '2026-08-01T12:00:00.000Z',
      },
    ]);
    expect(stats.sessionsLast30d).toEqual([
      {
        id: 'session-1',
        startedAt: '2026-08-10T09:00:00.000Z',
        endedAt: '2026-08-10T09:20:00.000Z',
        reviews: 8,
        tally: { HARD: 2, LEARNING: 3, EASY: 3 },
        deckSelector: 'ESSENTIAL',
      },
      {
        id: 'session-2',
        startedAt: '2026-08-10T09:00:00.000Z',
        endedAt: null,
        reviews: 1,
        tally: { HARD: 0, LEARNING: 0, EASY: 0 },
        deckSelector: 'FULL',
      },
    ]);
  });
});
