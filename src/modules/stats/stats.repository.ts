import { Injectable } from '@nestjs/common';
import { CardLevel, DeckSelector } from '@prisma/client';
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

@Injectable()
export class StatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCourseById(courseId: string): Promise<{ id: string } | null> {
    return this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true },
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
        ...(courseId
          ? {
              card: {
                deletedAt: null,
                deck: { courseId, deletedAt: null },
              },
            }
          : {}),
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
