import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PRACTICE_HISTORY_LIMIT } from './practice.constants';
import {
  AttemptHistoryRecord,
  AttemptRecord,
  CardWithQuestionsRecord,
  CreateAttemptItemInput,
  PracticeCardListRecord,
  RecentAttemptRecord,
} from './practice.types';

const questionInclude = {
  options: { orderBy: { ord: 'asc' as const } },
};

const attemptDetailInclude = {
  items: {
    orderBy: { shownOrd: 'asc' as const },
    include: {
      question: { include: questionInclude },
    },
  },
};

@Injectable()
export class PracticeRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveCardWithQuestions(
    cardId: string,
  ): Promise<CardWithQuestionsRecord | null> {
    return this.prisma.card.findFirst({
      where: { id: cardId, deletedAt: null },
      include: {
        cardQuestions: {
          orderBy: { rank: 'asc' },
          include: {
            question: { include: questionInclude },
          },
        },
      },
    });
  }

  createAttempt(params: {
    tenantId: string;
    userId: string;
    cardId: string;
    totalCount: number;
    items: CreateAttemptItemInput[];
  }): Promise<AttemptRecord> {
    return this.prisma.attempt.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        cardId: params.cardId,
        totalCount: params.totalCount,
        items: {
          create: params.items.map((item) => ({
            questionId: item.questionId,
            shownOrd: item.shownOrd,
            optionOrder: item.optionOrder,
          })),
        },
      },
      include: attemptDetailInclude,
    });
  }

  findAttemptForUser(
    attemptId: string,
    userId: string,
    tenantId: string,
  ): Promise<AttemptRecord | null> {
    return this.prisma.attempt.findFirst({
      where: { id: attemptId, userId, tenantId },
      include: attemptDetailInclude,
    });
  }

  findLatestUnfinished(
    userId: string,
    tenantId: string,
    cardId: string,
  ): Promise<AttemptRecord | null> {
    return this.prisma.attempt.findFirst({
      where: {
        userId,
        tenantId,
        cardId,
        finishedAt: null,
      },
      orderBy: { startedAt: 'desc' },
      include: attemptDetailInclude,
    });
  }

  recordAnswer(params: {
    itemId: string;
    optionId: string;
    isCorrect: boolean;
  }): Promise<number> {
    return this.prisma.attemptItem
      .updateMany({
        where: { id: params.itemId, chosenOptionId: null },
        data: {
          chosenOptionId: params.optionId,
          isCorrect: params.isCorrect,
        },
      })
      .then((result) => result.count);
  }

  countAnswered(attemptId: string): Promise<number> {
    return this.prisma.attemptItem.count({
      where: { attemptId, chosenOptionId: { not: null } },
    });
  }

  finishAttempt(params: {
    attemptId: string;
    userId: string;
    tenantId: string;
    correctCount: number;
    totalCount: number;
    finishedAt: Date;
  }): Promise<number> {
    return this.prisma.attempt
      .updateMany({
        where: {
          id: params.attemptId,
          userId: params.userId,
          tenantId: params.tenantId,
          finishedAt: null,
        },
        data: {
          finishedAt: params.finishedAt,
          correctCount: params.correctCount,
          totalCount: params.totalCount,
        },
      })
      .then((result) => result.count);
  }

  markUnansweredIncorrect(attemptId: string): Promise<void> {
    return this.prisma.attemptItem
      .updateMany({
        where: { attemptId, chosenOptionId: null },
        data: { isCorrect: false },
      })
      .then(() => undefined);
  }

  findFinishedHistory(params: {
    userId: string;
    tenantId: string;
    cardId: string;
    take?: number;
    excludeAttemptId?: string;
  }): Promise<AttemptHistoryRecord[]> {
    return this.prisma.attempt.findMany({
      where: {
        userId: params.userId,
        tenantId: params.tenantId,
        cardId: params.cardId,
        finishedAt: { not: null },
        ...(params.excludeAttemptId
          ? { id: { not: params.excludeAttemptId } }
          : {}),
      },
      orderBy: { finishedAt: 'desc' },
      take: params.take ?? PRACTICE_HISTORY_LIMIT,
      select: {
        id: true,
        correctCount: true,
        totalCount: true,
        finishedAt: true,
      },
    }) as Promise<AttemptHistoryRecord[]>;
  }

  listPracticeCards(params: {
    skip: number;
    take: number;
    search?: string;
  }): Promise<PracticeCardListRecord[]> {
    return this.prisma.card.findMany({
      where: this.practiceCardWhere(params.search),
      orderBy: [{ deck: { kind: 'asc' } }, { ord: 'asc' }],
      skip: params.skip,
      take: params.take,
      select: {
        id: true,
        code: true,
        frontMd: true,
        deck: { select: { kind: true } },
        _count: {
          select: {
            cardQuestions: { where: { question: { deletedAt: null } } },
          },
        },
      },
    });
  }

  countPracticeCards(search?: string): Promise<number> {
    return this.prisma.card.count({
      where: this.practiceCardWhere(search),
    });
  }

  findRecentFinished(params: {
    userId: string;
    tenantId: string;
    take: number;
  }): Promise<RecentAttemptRecord[]> {
    return this.prisma.attempt.findMany({
      where: {
        userId: params.userId,
        tenantId: params.tenantId,
        finishedAt: { not: null },
        cardId: { not: null },
        card: { deletedAt: null },
      },
      orderBy: { finishedAt: 'desc' },
      take: params.take,
      select: {
        id: true,
        cardId: true,
        correctCount: true,
        totalCount: true,
        finishedAt: true,
        card: { select: { id: true, code: true, frontMd: true } },
      },
    });
  }

  private practiceCardWhere(search?: string): Prisma.CardWhereInput {
    const term = search?.trim();
    return {
      deletedAt: null,
      cardQuestions: { some: { question: { deletedAt: null } } },
      ...(term
        ? {
            OR: [
              { code: { contains: term, mode: 'insensitive' } },
              { frontMd: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }
}
