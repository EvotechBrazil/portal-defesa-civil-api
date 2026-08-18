import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { DecksRepository } from './decks.repository';
import { DecksService } from './decks.service';

describe('DecksService', () => {
  it('aggregates card levels only for the authenticated tenant', async () => {
    const repo = {
      list: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'deck-ess',
            kind: 'ESSENTIAL',
            title: 'Essenciais',
            courseId: 'course-1',
            course: { slug: 'defesa-civil-lgnd' },
            _count: { cards: 43 },
          },
        ],
        total: 1,
      }),
      countLevelsByDeck: jest
        .fn()
        .mockResolvedValue(
          new Map([['deck-ess', { NEW: 40, HARD: 2, LEARNING: 1, EASY: 0 }]]),
        ),
    } as unknown as jest.Mocked<DecksRepository>;

    const service = new DecksService(repo);
    const user: AuthenticatedUser = {
      id: 'user-a',
      email: 'a@example.com',
      role: 'STUDENT',
      tenantId: 'tenant-a',
    };

    const result = await service.list(user, { page: 1, pageSize: 20 });

    expect(repo.countLevelsByDeck.mock.calls[0]).toEqual([
      'user-a',
      'tenant-a',
      ['deck-ess'],
    ]);
    expect(result.data[0]?.levels).toEqual({
      NEW: 40,
      HARD: 2,
      LEARNING: 1,
      EASY: 0,
    });
    expect(result.meta.total).toBe(1);
  });

  it('counts cards without state as NEW', async () => {
    const repo = {
      list: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'deck-ess',
            kind: 'ESSENTIAL',
            title: 'Essenciais',
            courseId: 'course-1',
            course: { slug: 'defesa-civil-lgnd' },
            _count: { cards: 43 },
          },
        ],
        total: 1,
      }),
      countLevelsByDeck: jest
        .fn()
        .mockResolvedValue(
          new Map([['deck-ess', { NEW: 0, HARD: 1, LEARNING: 0, EASY: 0 }]]),
        ),
    } as unknown as jest.Mocked<DecksRepository>;

    const service = new DecksService(repo);
    const result = await service.list(
      {
        id: 'user-a',
        email: 'a@example.com',
        role: 'STUDENT',
        tenantId: 'tenant-a',
      },
      { page: 1, pageSize: 20 },
    );

    expect(result.data[0]?.levels.NEW).toBe(42);
    expect(result.data[0]?.levels.HARD).toBe(1);
  });
});
