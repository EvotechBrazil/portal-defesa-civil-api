import { Injectable } from '@nestjs/common';
import { CardLevel, DeckSelector, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export type StatsModuleRow = {
  id: string;
  code: string;
  title: string;
};

export type FinishedAttemptRow = {
  courseModuleId: string;
  correctCount: number;
  totalCount: number;
};

export type CardLevelCountRow = {
  level: CardLevel;
  count: number;
};

export type StuckCardRow = {
  cardId: string;
  code: string;
  frontMd: string;
  seen: number;
  streak: number;
  lastSeenAt: Date | null;
};

export type SessionRow = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  reviews: number;
  tally: unknown;
  deckSelector: DeckSelector;
};

const LIST_LIMIT = 100;
export const MEMBER_CAP = 500;

const MANADA_MEMBER_SELECT = {
  id: true,
  name: true,
  lgndNumber: true,
  squad: true,
} as const;

const MEMBER_PROFILE_SELECT = {
  id: true,
  tenantId: true,
  name: true,
  lgndNumber: true,
  squad: true,
  manadaId: true,
  pack: { select: { id: true, name: true, city: true, state: true } },
} as const;

const RANKING_USER_SELECT = {
  id: true,
  name: true,
  lgndNumber: true,
  pack: { select: { id: true, name: true, city: true, state: true } },
} as const;

export type ManadaMemberRow = {
  id: string;
  name: string;
  lgndNumber: string | null;
  squad: string | null;
};

export type MemberProfileRow = {
  id: string;
  tenantId: string;
  name: string;
  lgndNumber: string | null;
  squad: string | null;
  manadaId: string | null;
  pack: { id: string; name: string; city: string; state: string } | null;
};

export type RankingUserRow = {
  id: string;
  name: string;
  lgndNumber: string | null;
  pack: { id: string; name: string; city: string; state: string } | null;
};

export type RankingUserFilters = {
  manadaId?: string;
  state?: string;
  city?: string;
};

export type RankingStudyScope = {
  courseId?: string;
  moduleCode?: string;
};

export type AttemptAggRow = {
  userId: string;
  correctCount: number;
  totalCount: number;
  attempts: number;
  lastFinishedAt: Date | null;
};

export type UserCardLevelRow = {
  userId: string;
  level: CardLevel;
  count: number;
};

export type SessionMaxRow = {
  userId: string;
  lastStartedAt: Date | null;
};

export type SessionStartRow = {
  userId: string;
  startedAt: Date;
};

@Injectable()
export class StatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCourseById(courseId: string): Promise<{ id: string } | null> {
    return this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true },
    });
  }

  findActiveModuleByCode(
    code: string,
    courseId?: string,
  ): Promise<StatsModuleRow | null> {
    return this.prisma.courseModule.findFirst({
      where: {
        code,
        deletedAt: null,
        course: { deletedAt: null },
        ...(courseId ? { courseId } : {}),
      },
      select: { id: true, code: true, title: true },
    });
  }

  findModules(courseId?: string): Promise<StatsModuleRow[]> {
    return this.prisma.courseModule.findMany({
      where: {
        deletedAt: null,
        course: { deletedAt: null },
        ...(courseId ? { courseId } : {}),
      },
      orderBy: [{ ord: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, title: true },
    });
  }

  async findFinishedAttempts(
    userId: string,
    tenantId: string,
    courseId?: string,
  ): Promise<FinishedAttemptRow[]> {
    const attempts = await this.prisma.attempt.findMany({
      where: {
        tenantId,
        userId,
        finishedAt: { not: null },
        ...(courseId
          ? {
              OR: [
                { quiz: { courseModule: { courseId, deletedAt: null } } },
                { card: { deck: { courseId, deletedAt: null } } },
              ],
            }
          : {}),
      },
      select: {
        correctCount: true,
        totalCount: true,
        quiz: { select: { courseModuleId: true } },
        card: {
          select: {
            originQuestion: {
              select: { quiz: { select: { courseModuleId: true } } },
            },
            cardQuestions: {
              take: 1,
              orderBy: { rank: 'asc' },
              select: {
                question: {
                  select: { quiz: { select: { courseModuleId: true } } },
                },
              },
            },
          },
        },
      },
    });

    const rows: FinishedAttemptRow[] = [];
    for (const attempt of attempts) {
      const courseModuleId = resolveAttemptModuleId(attempt);
      if (!courseModuleId) {
        continue;
      }
      rows.push({
        courseModuleId,
        correctCount: attempt.correctCount,
        totalCount: attempt.totalCount,
      });
    }
    return rows;
  }

  async groupCardLevels(
    userId: string,
    tenantId: string,
    courseId?: string,
  ): Promise<CardLevelCountRow[]> {
    const grouped = await this.prisma.cardState.groupBy({
      by: ['level'],
      where: {
        tenantId,
        userId,
        card: {
          deletedAt: null,
          ...(courseId ? { deck: { courseId, deletedAt: null } } : {}),
        },
      },
      _count: { _all: true },
    });

    return grouped.map((row) => ({
      level: row.level,
      count: row._count._all,
    }));
  }

  async findStuckCards(
    userId: string,
    tenantId: string,
    courseId?: string,
  ): Promise<StuckCardRow[]> {
    const states = await this.prisma.cardState.findMany({
      where: {
        tenantId,
        userId,
        level: CardLevel.HARD,
        seen: { gte: 3 },
        card: {
          deletedAt: null,
          ...(courseId ? { deck: { courseId, deletedAt: null } } : {}),
        },
      },
      orderBy: [{ seen: 'desc' }, { lastSeenAt: 'desc' }],
      take: LIST_LIMIT,
      select: {
        cardId: true,
        seen: true,
        streak: true,
        lastSeenAt: true,
        card: { select: { code: true, frontMd: true } },
      },
    });

    return states.map((state) => ({
      cardId: state.cardId,
      code: state.card.code,
      frontMd: state.card.frontMd,
      seen: state.seen,
      streak: state.streak,
      lastSeenAt: state.lastSeenAt,
    }));
  }

  findSessionsSince(
    userId: string,
    tenantId: string,
    since: Date,
  ): Promise<SessionRow[]> {
    return this.prisma.studySession.findMany({
      where: {
        tenantId,
        userId,
        startedAt: { gte: since },
      },
      orderBy: { startedAt: 'asc' },
      take: LIST_LIMIT,
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        reviews: true,
        tally: true,
        deckSelector: true,
      },
    });
  }

  findActiveProfileById(id: string): Promise<MemberProfileRow | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: MEMBER_PROFILE_SELECT,
    });
  }

  findActiveManadaMembers(
    tenantId: string,
    manadaId: string,
  ): Promise<ManadaMemberRow[]> {
    return this.prisma.user.findMany({
      where: { tenantId, manadaId, deletedAt: null },
      select: MANADA_MEMBER_SELECT,
      orderBy: { name: 'asc' },
      take: MEMBER_CAP,
    });
  }

  async findActiveUsersForRanking(
    tenantId: string,
    filters: RankingUserFilters,
  ): Promise<{ users: RankingUserRow[]; truncated: boolean }> {
    const rows = await this.prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(filters.manadaId ? { manadaId: filters.manadaId } : {}),
        ...(filters.state || filters.city
          ? {
              pack: {
                is: {
                  deletedAt: null,
                  ...(filters.state
                    ? { state: { equals: filters.state, mode: 'insensitive' } }
                    : {}),
                  ...(filters.city
                    ? { city: { equals: filters.city, mode: 'insensitive' } }
                    : {}),
                },
              },
            }
          : {}),
      },
      select: RANKING_USER_SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: MEMBER_CAP + 1,
    });
    const truncated = rows.length > MEMBER_CAP;
    return {
      users: truncated ? rows.slice(0, MEMBER_CAP) : rows,
      truncated,
    };
  }

  async groupFinishedAttemptsByUser(
    tenantId: string,
    userIds: string[],
    scope?: RankingStudyScope,
  ): Promise<AttemptAggRow[]> {
    if (userIds.length === 0) {
      return [];
    }
    const grouped = await this.prisma.attempt.groupBy({
      by: ['userId'],
      where: {
        tenantId,
        userId: { in: userIds },
        finishedAt: { not: null },
        ...(hasStudyScope(scope) ? attemptScopeWhere(scope) : {}),
      },
      _sum: { correctCount: true, totalCount: true },
      _count: { _all: true },
      _max: { finishedAt: true },
    });
    return grouped.map((row) => ({
      userId: row.userId,
      correctCount: row._sum.correctCount ?? 0,
      totalCount: row._sum.totalCount ?? 0,
      attempts: row._count._all,
      lastFinishedAt: row._max.finishedAt,
    }));
  }

  async groupCardLevelsByUser(
    tenantId: string,
    userIds: string[],
    scope?: RankingStudyScope,
  ): Promise<UserCardLevelRow[]> {
    if (userIds.length === 0) {
      return [];
    }
    const grouped = await this.prisma.cardState.groupBy({
      by: ['userId', 'level'],
      where: {
        tenantId,
        userId: { in: userIds },
        card: hasStudyScope(scope)
          ? cardCatalogWhere(scope)
          : { deletedAt: null },
      },
      _count: { _all: true },
    });
    return grouped.map((row) => ({
      userId: row.userId,
      level: row.level,
      count: row._count._all,
    }));
  }

  async groupSessionMaxByUser(
    tenantId: string,
    userIds: string[],
  ): Promise<SessionMaxRow[]> {
    if (userIds.length === 0) {
      return [];
    }
    const grouped = await this.prisma.studySession.groupBy({
      by: ['userId'],
      where: { tenantId, userId: { in: userIds } },
      _max: { startedAt: true },
    });
    return grouped.map((row) => ({
      userId: row.userId,
      lastStartedAt: row._max.startedAt,
    }));
  }

  async findSessionStartsSinceByUser(
    tenantId: string,
    userIds: string[],
    since: Date,
  ): Promise<SessionStartRow[]> {
    if (userIds.length === 0) {
      return [];
    }
    return this.prisma.studySession.findMany({
      where: {
        tenantId,
        userId: { in: userIds },
        startedAt: { gte: since },
      },
      select: { userId: true, startedAt: true },
    });
  }

  countActiveCards(
    tenantId: string,
    scope?: RankingStudyScope,
  ): Promise<number> {
    if (!tenantId) {
      return Promise.resolve(0);
    }
    return this.prisma.card.count({
      where: hasStudyScope(scope)
        ? cardCatalogWhere(scope)
        : { deletedAt: null, deck: { deletedAt: null } },
    });
  }
}

function hasStudyScope(scope?: RankingStudyScope): scope is RankingStudyScope {
  return Boolean(scope?.courseId || scope?.moduleCode);
}

function moduleFilter(scope: RankingStudyScope): Prisma.CourseModuleWhereInput {
  return {
    deletedAt: null,
    ...(scope.courseId ? { courseId: scope.courseId } : {}),
    ...(scope.moduleCode ? { code: scope.moduleCode } : {}),
  };
}

function attemptScopeWhere(scope: RankingStudyScope): Prisma.AttemptWhereInput {
  const module = moduleFilter(scope);
  return {
    OR: [
      { quiz: { courseModule: module } },
      {
        quiz: null,
        card: { originQuestion: { quiz: { courseModule: module } } },
      },
      {
        quiz: null,
        card: {
          originQuestion: null,
          cardQuestions: {
            some: { question: { quiz: { courseModule: module } } },
          },
        },
      },
    ],
  };
}

function cardCatalogWhere(scope: RankingStudyScope): Prisma.CardWhereInput {
  const module = moduleFilter(scope);
  if (scope.moduleCode) {
    return {
      deletedAt: null,
      OR: [
        { originQuestion: { quiz: { courseModule: module } } },
        {
          cardQuestions: {
            some: { question: { quiz: { courseModule: module } } },
          },
        },
      ],
    };
  }
  return {
    deletedAt: null,
    deck: {
      deletedAt: null,
      ...(scope.courseId ? { courseId: scope.courseId } : {}),
    },
  };
}

type AttemptModuleSource = {
  quiz: { courseModuleId: string } | null;
  card: {
    originQuestion: { quiz: { courseModuleId: string } } | null;
    cardQuestions: { question: { quiz: { courseModuleId: string } } }[];
  } | null;
};

function resolveAttemptModuleId(attempt: AttemptModuleSource): string | null {
  if (attempt.quiz) {
    return attempt.quiz.courseModuleId;
  }
  if (attempt.card?.originQuestion) {
    return attempt.card.originQuestion.quiz.courseModuleId;
  }
  const linked = attempt.card?.cardQuestions[0];
  if (linked) {
    return linked.question.quiz.courseModuleId;
  }
  return null;
}
