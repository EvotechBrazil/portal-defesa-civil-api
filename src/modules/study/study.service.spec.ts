import { ConflictException, NotFoundException } from '@nestjs/common';
import { CardLevel, DeckKind } from '@prisma/client';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { StudyFilterDto } from './dtos/create-study-session.dto';
import { identityShuffle } from './study.algorithm';
import { CardWithStudy } from './study.types';
import {
  CardStateRecord,
  StudyRepository,
  StudySessionRecord,
} from './study.repository';
import { StudyService } from './study.service';

function user(): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'a@example.com',
    role: 'STUDENT',
    tenantId: 'tenant-1',
  };
}

function card(partial: {
  id: string;
  code: string;
  reversible?: boolean;
  kind?: DeckKind;
}): CardWithStudy {
  return {
    id: partial.id,
    deckId: 'deck-1',
    ord: 0,
    code: partial.code,
    frontMd: `front-${partial.id}`,
    backMd: `back-${partial.id}`,
    theoryMd: 'theory',
    sourceMd: 'source',
    reversible: partial.reversible ?? true,
    originQuestionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    deck: {
      kind: partial.kind ?? 'ESSENTIAL',
      courseId: 'course-1',
      course: { slug: 'defesa-civil-lgnd' },
    },
    links: [{ label: 'Núcleo 80/20', targetSlug: 'pareto', ord: 0 }],
    cardQuestions: [{ questionId: 'q1', rank: 0 }],
  };
}

function session(
  overrides: Partial<StudySessionRecord> = {},
): StudySessionRecord {
  return {
    id: 'sess-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    courseId: 'course-1',
    deckSelector: 'ESSENTIAL',
    bidir: true,
    queue: ['hard', 'new', 'easy'],
    reviews: 0,
    tally: { HARD: 0, LEARNING: 0, EASY: 0 },
    startedAt: new Date(),
    endedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function state(cardId: string, level: CardLevel): CardStateRecord {
  return {
    id: `s-${cardId}`,
    tenantId: 'tenant-1',
    userId: 'user-1',
    cardId,
    level,
    streak: 0,
    seen: 1,
    lastSeenAt: null,
  };
}

describe('StudyService', () => {
  let service: StudyService;
  let repo: jest.Mocked<StudyRepository>;

  beforeEach(() => {
    repo = {
      findCourseBySlug: jest.fn(),
      findCardIdsByKinds: jest.fn(),
      findCardsByKinds: jest.fn(),
      findCardById: jest.fn(),
      findStatesForUserCards: jest.fn(),
      findCardState: jest.fn(),
      ensureStates: jest.fn(),
      updateCardState: jest.fn(),
      createSession: jest.fn(),
      findSessionById: jest.fn(),
      updateSession: jest.fn(),
      countEasyInPool: jest.fn(),
      runTransaction: jest.fn(),
    } as unknown as jest.Mocked<StudyRepository>;
    repo.findStatesForUserCards.mockResolvedValue([]);
    service = new StudyService(repo, identityShuffle);
  });

  it('orders HARD first when creating a session', async () => {
    const cards = [
      card({ id: 'new', code: '#1' }),
      card({ id: 'easy', code: '#2' }),
      card({ id: 'hard', code: '#3' }),
    ];
    repo.findCourseBySlug.mockResolvedValue({
      id: 'course-1',
      slug: 'defesa-civil-lgnd',
    });
    repo.findCardIdsByKinds.mockResolvedValue(
      cards.map((item) => ({ id: item.id })),
    );
    repo.findStatesForUserCards.mockResolvedValue([
      {
        id: 's-new',
        tenantId: 'tenant-1',
        userId: 'user-1',
        cardId: 'new',
        level: 'NEW',
        streak: 0,
        seen: 0,
        lastSeenAt: null,
      },
      {
        id: 's-easy',
        tenantId: 'tenant-1',
        userId: 'user-1',
        cardId: 'easy',
        level: 'EASY',
        streak: 2,
        seen: 4,
        lastSeenAt: null,
      },
      {
        id: 's-hard',
        tenantId: 'tenant-1',
        userId: 'user-1',
        cardId: 'hard',
        level: 'HARD',
        streak: 0,
        seen: 3,
        lastSeenAt: null,
      },
    ]);
    repo.ensureStates.mockResolvedValue(undefined);
    repo.createSession.mockImplementation((input) =>
      Promise.resolve(session({ queue: input.queue })),
    );
    repo.findCardById.mockImplementation((id) =>
      Promise.resolve(cards.find((item) => item.id === id) ?? null),
    );
    repo.findCardState.mockResolvedValue({
      id: 's-hard',
      tenantId: 'tenant-1',
      userId: 'user-1',
      cardId: 'hard',
      level: 'HARD',
      streak: 0,
      seen: 2,
      lastSeenAt: null,
    });

    const view = await service.create(user(), {
      deckSelector: 'ESSENTIAL',
    });

    expect(repo.createSession.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ queue: ['hard', 'new', 'easy'] }),
    );
    expect(view.card?.id).toBe('hard');
    expect(view.card?.direction).toBe('FORWARD');
  });

  it('falls back to the full pool when HARD_ONLY matches nothing', async () => {
    const cards = [
      card({ id: 'a', code: '#1' }),
      card({ id: 'b', code: '#2' }),
    ];
    repo.findCourseBySlug.mockResolvedValue({
      id: 'course-1',
      slug: 'defesa-civil-lgnd',
    });
    repo.findCardIdsByKinds.mockResolvedValue(
      cards.map((item) => ({ id: item.id })),
    );
    repo.findStatesForUserCards.mockResolvedValue([]);
    repo.ensureStates.mockResolvedValue(undefined);
    repo.createSession.mockImplementation((input) =>
      Promise.resolve(session({ queue: input.queue })),
    );
    repo.findCardById.mockResolvedValue(cards[0] ?? null);
    repo.findCardState.mockResolvedValue({
      id: 's-a',
      tenantId: 'tenant-1',
      userId: 'user-1',
      cardId: 'a',
      level: 'NEW',
      streak: 0,
      seen: 0,
      lastSeenAt: null,
    });

    await service.create(user(), {
      deckSelector: 'ESSENTIAL',
      filter: StudyFilterDto.HARD_ONLY,
    });

    expect(repo.ensureStates.mock.calls[0]).toEqual([
      'user-1',
      'tenant-1',
      ['a', 'b'],
    ]);
    expect(repo.createSession.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ queue: ['a', 'b'] }),
    );
  });

  it('alternates reversible cards regardless of deck and respects the reversible flag', async () => {
    const reversible = card({ id: 'rev', code: '#1', reversible: true });
    const exam = card({
      id: 'exam',
      code: 'Q1',
      reversible: true,
      kind: 'EXAM',
    });

    repo.findSessionById.mockResolvedValue(
      session({ queue: ['rev'], bidir: true }),
    );
    repo.findCardById.mockResolvedValue(reversible);
    repo.findCardState.mockResolvedValue({
      id: 's-rev',
      tenantId: 'tenant-1',
      userId: 'user-1',
      cardId: 'rev',
      level: 'NEW',
      streak: 0,
      seen: 1,
      lastSeenAt: null,
    });

    const reversed = await service.getById(user(), 'sess-1');
    expect(reversed.card?.direction).toBe('REVERSE');
    expect(reversed.card?.front).toBe('back-rev');
    expect(reversed.card?.back).toBe('front-rev');

    repo.findCardById.mockResolvedValue(exam);
    repo.findCardState.mockResolvedValue({
      id: 's-exam',
      tenantId: 'tenant-1',
      userId: 'user-1',
      cardId: 'exam',
      level: 'NEW',
      streak: 0,
      seen: 1,
      lastSeenAt: null,
    });
    const examView = await service.getById(user(), 'sess-1');
    expect(examView.card?.direction).toBe('REVERSE');
    expect(examView.card?.front).toBe('back-exam');

    repo.findCardById.mockResolvedValue(
      card({ id: 'fixed', code: 'fixed', reversible: false }),
    );
    repo.findCardState.mockResolvedValue({
      id: 's-fixed',
      tenantId: 'tenant-1',
      userId: 'user-1',
      cardId: 'fixed',
      level: 'NEW',
      streak: 0,
      seen: 1,
      lastSeenAt: null,
    });
    const fixedView = await service.getById(user(), 'sess-1');
    expect(fixedView.card?.direction).toBe('FORWARD');
  });

  it('rejects a session from another tenant', async () => {
    repo.findSessionById.mockResolvedValue(null);
    await expect(service.getById(user(), 'sess-other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a review on a finished session', async () => {
    repo.runTransaction.mockImplementation((fn) => fn(repo));
    repo.findSessionById.mockResolvedValue(session({ endedAt: new Date() }));
    await expect(
      service.review(user(), 'sess-1', 'EASY'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('focuses the queue on a single level and reviews that card', async () => {
    const cards = [
      card({ id: 'hard', code: '#1' }),
      card({ id: 'new', code: '#2' }),
      card({ id: 'easy', code: '#3' }),
    ];
    const states = [
      state('hard', 'HARD'),
      state('new', 'NEW'),
      state('easy', 'EASY'),
    ];
    repo.runTransaction.mockImplementation((fn) => fn(repo));
    repo.findSessionById.mockResolvedValue(session());
    repo.findStatesForUserCards.mockResolvedValue(states);
    repo.findCardById.mockImplementation((id) =>
      Promise.resolve(cards.find((item) => item.id === id) ?? null),
    );
    repo.findCardState.mockImplementation((_u, _t, cardId) =>
      Promise.resolve(states.find((item) => item.cardId === cardId) ?? null),
    );

    const focused = await service.getById(user(), 'sess-1', 'EASY');
    expect(focused.card?.id).toBe('easy');
    expect(focused.focus).toBe('EASY');
    expect(focused.queueLevels).toEqual({
      NEW: 1,
      HARD: 1,
      LEARNING: 0,
      EASY: 1,
    });

    repo.updateCardState.mockResolvedValue(states[2]);
    repo.updateSession.mockImplementation((_id, data) =>
      Promise.resolve(session({ queue: data.queue ?? [] })),
    );

    const reviewed = await service.review(user(), 'sess-1', 'HARD', 'EASY');
    expect(reviewed.reviewed.cardId).toBe('easy');
    expect(repo.updateSession.mock.calls[0]?.[1]?.queue).toEqual([
      'hard',
      'new',
      'easy',
    ]);
  });

  it('returns no card when the focus matches nothing in the queue', async () => {
    repo.findSessionById.mockResolvedValue(session());
    repo.findStatesForUserCards.mockResolvedValue([
      state('hard', 'HARD'),
      state('new', 'NEW'),
      state('easy', 'EASY'),
    ]);

    const view = await service.getById(user(), 'sess-1', 'LEARNING');
    expect(view.card).toBeNull();
    expect(view.finished).toBe(false);
    expect(view.queueLength).toBe(3);
  });

  it('rejects a review when the focus matches nothing', async () => {
    repo.runTransaction.mockImplementation((fn) => fn(repo));
    repo.findSessionById.mockResolvedValue(session());
    repo.findStatesForUserCards.mockResolvedValue([
      state('hard', 'HARD'),
      state('new', 'NEW'),
      state('easy', 'EASY'),
    ]);
    await expect(
      service.review(user(), 'sess-1', 'EASY', 'LEARNING'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
