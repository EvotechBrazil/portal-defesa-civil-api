import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CardLevel, DeckSelector, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import {
  PRACTICAL_TRAINING_NOTICE,
  STUDY_PRIORITY_DISCLAIMER,
} from './priority-score';
import { MemberProfileRow, StatsRepository } from './stats.repository';
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
      | 'findActiveProfileById'
      | 'findActiveManadaMembers'
      | 'findActiveUsersForRanking'
      | 'findActiveModuleByCode'
      | 'groupFinishedAttemptsByUser'
      | 'groupCardLevelsByUser'
      | 'groupSessionMaxByUser'
      | 'findSessionStartsSinceByUser'
      | 'countActiveCards'
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
      findActiveProfileById: jest.fn(),
      findActiveManadaMembers: jest.fn().mockResolvedValue([]),
      findActiveUsersForRanking: jest
        .fn()
        .mockResolvedValue({ users: [], truncated: false }),
      findActiveModuleByCode: jest.fn(),
      groupFinishedAttemptsByUser: jest.fn().mockResolvedValue([]),
      groupCardLevelsByUser: jest.fn().mockResolvedValue([]),
      groupSessionMaxByUser: jest.fn().mockResolvedValue([]),
      findSessionStartsSinceByUser: jest.fn().mockResolvedValue([]),
      countActiveCards: jest.fn().mockResolvedValue(10),
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

  it('returns catalog modules with zeros when courseId does not exist', async () => {
    repository.findCourseById.mockResolvedValue(null);

    const stats = await service.getMine('user-a', 'tenant-a', 'missing-course');

    expect(repository.findModules).toHaveBeenCalledWith();
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
    expect(repository.findFinishedAttempts).not.toHaveBeenCalled();
    expect(repository.groupCardLevels).not.toHaveBeenCalled();
    expect(repository.findStuckCards).not.toHaveBeenCalled();
    expect(repository.findSessionsSince).not.toHaveBeenCalled();
  });

  it('getMine delegates to getFor with the same arguments', async () => {
    const spy = jest.spyOn(service, 'getFor');

    await service.getMine('user-a', 'tenant-a', 'course-1');

    expect(spy).toHaveBeenCalledWith('user-a', 'tenant-a', 'course-1');
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

  describe('getPeer authorization', () => {
    const viewer = authUser('viewer-1', UserRole.STUDENT);
    const samePack = profile({
      id: 'peer-1',
      manadaId: 'pack-a',
    });
    const otherPack = profile({
      id: 'peer-2',
      manadaId: 'pack-b',
    });

    it('returns profile and disclaimer when viewer and target share a manada', async () => {
      repository.findActiveProfileById
        .mockResolvedValueOnce(samePack)
        .mockResolvedValueOnce(profile({ id: viewer.id, manadaId: 'pack-a' }));

      const result = await service.getPeer(viewer, samePack.id, 'tenant-a');

      expect(result.disclaimer).toBe(STUDY_PRIORITY_DISCLAIMER);
      expect(result.profile).toEqual({
        userId: 'peer-1',
        name: 'Aluno',
        photoUrl: null,
        lgndNumber: '1001',
        squad: 'Squad 1',
        manada: {
          id: 'pack-a',
          name: 'Manada Norte',
          city: 'Arapongas',
          state: 'PR',
        },
      });
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('whatsapp');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('forbids a student from another manada', async () => {
      repository.findActiveProfileById
        .mockResolvedValueOnce(otherPack)
        .mockResolvedValueOnce(profile({ id: viewer.id, manadaId: 'pack-a' }));

      await expect(
        service.getPeer(viewer, otherPack.id, 'tenant-a'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('never matches two null manadaIds', async () => {
      repository.findActiveProfileById
        .mockResolvedValueOnce(profile({ id: 'peer-null', manadaId: null }))
        .mockResolvedValueOnce(profile({ id: viewer.id, manadaId: null }));

      await expect(
        service.getPeer(viewer, 'peer-null', 'tenant-a'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns 404 for a missing user or another tenant, never 403', async () => {
      repository.findActiveProfileById.mockResolvedValueOnce(null);
      await expect(
        service.getPeer(viewer, 'missing', 'tenant-a'),
      ).rejects.toBeInstanceOf(NotFoundException);

      repository.findActiveProfileById.mockResolvedValueOnce(
        profile({ id: 'foreign', tenantId: 'tenant-b', manadaId: 'pack-a' }),
      );
      await expect(
        service.getPeer(viewer, 'foreign', 'tenant-a'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lets an admin read another manada in the same tenant', async () => {
      const admin = authUser('admin-1', UserRole.ADMIN);
      repository.findActiveProfileById
        .mockResolvedValueOnce(otherPack)
        .mockResolvedValueOnce(profile({ id: admin.id, manadaId: 'pack-a' }));

      const result = await service.getPeer(admin, otherPack.id, 'tenant-a');
      expect(result.profile.userId).toBe(otherPack.id);
    });

    // Regressao da hierarquia: canViewPeer comparava com `=== UserRole.ADMIN`,
    // o que fazia o papel SUPERIOR perder um acesso que o inferior tinha.
    it.each([UserRole.ADMIN_SENIOR, UserRole.SUPER_ADMIN])(
      'lets a %s read another manada in the same tenant',
      async (role) => {
        const senior = authUser('senior-1', role);
        repository.findActiveProfileById
          .mockResolvedValueOnce(otherPack)
          .mockResolvedValueOnce(
            profile({ id: senior.id, manadaId: 'pack-a' }),
          );

        const result = await service.getPeer(senior, otherPack.id, 'tenant-a');
        expect(result.profile.userId).toBe(otherPack.id);
      },
    );
  });

  describe('listManadaMembers', () => {
    it('returns an empty list with NO_MANADA when the viewer has no pack', async () => {
      repository.findActiveProfileById.mockResolvedValue(
        profile({ id: 'viewer-1', manadaId: null }),
      );

      const result = await service.listManadaMembers(
        authUser('viewer-1', UserRole.STUDENT),
        'tenant-a',
        { page: 1, pageSize: 20 },
      );

      expect(result.data).toEqual([]);
      expect(result.meta).toMatchObject({
        total: 0,
        reason: 'NO_MANADA',
      });
      expect(repository.findActiveManadaMembers).not.toHaveBeenCalled();
    });
  });

  describe('getRanking', () => {
    const admin = authUser('admin-1', UserRole.ADMIN);

    it('rejects a ranking without courseId or moduleCode', async () => {
      await expect(
        service.getRanking(admin, 'tenant-a', {
          page: 1,
          pageSize: 20,
          minAttempts: 3,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('keeps a 100% one-shot out of ranked and exposes the disclaimer', async () => {
      repository.findCourseById.mockResolvedValue({ id: 'course-1' });
      repository.findActiveUsersForRanking.mockResolvedValue({
        users: [rankingUser('one-shot', 'Ana'), rankingUser('steady', 'Bruno')],
        truncated: false,
      });
      repository.groupFinishedAttemptsByUser.mockResolvedValue([
        {
          userId: 'one-shot',
          correctCount: 10,
          totalCount: 10,
          attempts: 1,
          lastFinishedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        {
          userId: 'steady',
          correctCount: 16,
          totalCount: 20,
          attempts: 5,
          lastFinishedAt: new Date('2026-08-02T00:00:00.000Z'),
        },
      ]);

      const result = await service.getRanking(admin, 'tenant-a', {
        page: 1,
        pageSize: 20,
        minAttempts: 3,
        courseId: 'course-1',
      });

      expect(repository.groupFinishedAttemptsByUser).toHaveBeenCalledWith(
        'tenant-a',
        ['one-shot', 'steady'],
        { courseId: 'course-1', moduleCode: undefined },
      );
      expect(repository.countActiveCards).toHaveBeenCalledWith('tenant-a', {
        courseId: 'course-1',
        moduleCode: undefined,
      });
      expect(result.meta.disclaimer).toBe(STUDY_PRIORITY_DISCLAIMER);
      expect(result.meta.truncated).toBe(false);
      expect(result.data.ranked.map((row) => row.userId)).toEqual(['steady']);
      expect(result.data.insufficientBase.map((row) => row.userId)).toEqual([
        'one-shot',
      ]);
      expect(result.data.ranked[0]?.study.selfReported).toEqual([
        'coveragePct',
      ]);
      expect(result.data.ranked[0]?.operational).toBeNull();
      expect(result.data.ranked[0]?.practicalTrainingNotice).toBe(
        PRACTICAL_TRAINING_NOTICE,
      );
      expect(result.data.ranked[0]).not.toHaveProperty('email');
    });

    it('signals truncated when the repository hits the member cap', async () => {
      repository.findCourseById.mockResolvedValue({ id: 'course-1' });
      repository.findActiveUsersForRanking.mockResolvedValue({
        users: [rankingUser('steady', 'Bruno')],
        truncated: true,
      });
      repository.groupFinishedAttemptsByUser.mockResolvedValue([
        {
          userId: 'steady',
          correctCount: 16,
          totalCount: 20,
          attempts: 5,
          lastFinishedAt: new Date('2026-08-02T00:00:00.000Z'),
        },
      ]);

      const result = await service.getRanking(admin, 'tenant-a', {
        page: 1,
        pageSize: 20,
        minAttempts: 3,
        courseId: 'course-1',
      });

      expect(result.meta.truncated).toBe(true);
    });
  });
});

function authUser(id: string, role: UserRole): AuthenticatedUser {
  return {
    id,
    email: `${id}@example.com`,
    role,
    tenantId: 'tenant-a',
  };
}

function profile(
  overrides: Partial<MemberProfileRow> & Pick<MemberProfileRow, 'id'>,
): MemberProfileRow {
  const manadaId = overrides.manadaId ?? null;
  return {
    tenantId: 'tenant-a',
    name: 'Aluno',
    lgndNumber: '1001',
    squad: 'Squad 1',
    pack: manadaId
      ? { id: manadaId, name: 'Manada Norte', city: 'Arapongas', state: 'PR' }
      : null,
    ...overrides,
    manadaId,
  };
}

function rankingUser(id: string, name: string) {
  return {
    id,
    name,
    lgndNumber: '1001',
    pack: {
      id: 'pack-a',
      name: 'Manada Norte',
      city: 'Arapongas',
      state: 'PR',
    },
  };
}
