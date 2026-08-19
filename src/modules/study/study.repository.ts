import { Injectable } from '@nestjs/common';
import {
  CardLevel,
  DeckKind,
  DeckSelector,
  Prisma,
  ReviewRating,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CardWithStudy } from './study.types';

type DbClient = PrismaService | Prisma.TransactionClient;

export interface StudySessionRecord {
  id: string;
  tenantId: string;
  userId: string;
  deckSelector: DeckSelector;
  bidir: boolean;
  queue: Prisma.JsonValue;
  reviews: number;
  tally: Prisma.JsonValue;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CardStateRecord {
  id: string;
  tenantId: string;
  userId: string;
  cardId: string;
  level: CardLevel;
  streak: number;
  seen: number;
  lastSeenAt: Date | null;
}

export interface CreateSessionInput {
  tenantId: string;
  userId: string;
  deckSelector: DeckSelector;
  bidir: boolean;
  queue: string[];
  reviews: number;
  tally: Record<ReviewRating, number>;
}

export interface UpdateSessionInput {
  queue?: string[];
  reviews?: number;
  tally?: Record<ReviewRating, number>;
  endedAt?: Date | null;
}

export interface UpdateCardStateInput {
  level: CardLevel;
  streak: number;
  seen: number;
  lastSeenAt: Date | null;
}

export interface CardPoolRow {
  id: string;
}

export interface StudyStore {
  findCardIdsByKinds(kinds: DeckKind[]): Promise<CardPoolRow[]>;
  findCardsByKinds(kinds: DeckKind[]): Promise<CardWithStudy[]>;
  findCardById(id: string): Promise<CardWithStudy | null>;
  findStatesForUserCards(
    userId: string,
    tenantId: string,
    cardIds: string[],
  ): Promise<CardStateRecord[]>;
  findCardState(
    userId: string,
    tenantId: string,
    cardId: string,
  ): Promise<CardStateRecord | null>;
  ensureStates(
    userId: string,
    tenantId: string,
    cardIds: string[],
  ): Promise<void>;
  updateCardState(
    id: string,
    data: UpdateCardStateInput,
  ): Promise<CardStateRecord>;
  createSession(data: CreateSessionInput): Promise<StudySessionRecord>;
  findSessionById(
    id: string,
    userId: string,
    tenantId: string,
  ): Promise<StudySessionRecord | null>;
  updateSession(
    id: string,
    data: UpdateSessionInput,
  ): Promise<StudySessionRecord>;
  countEasyInPool(
    userId: string,
    tenantId: string,
    kinds: DeckKind[],
  ): Promise<{ easyCount: number; poolSize: number }>;
}

const cardStudyInclude = {
  deck: {
    select: {
      kind: true,
      courseId: true,
      course: { select: { slug: true } },
    },
  },
  links: {
    orderBy: { ord: 'asc' as const },
    select: { label: true, targetSlug: true, ord: true },
  },
  cardQuestions: {
    orderBy: { rank: 'asc' as const },
    select: { questionId: true, rank: true },
  },
} satisfies Prisma.CardInclude;

function createStore(db: DbClient): StudyStore {
  return {
    findCardIdsByKinds(kinds: DeckKind[]) {
      return db.card.findMany({
        where: {
          deletedAt: null,
          deck: { deletedAt: null, kind: { in: kinds } },
        },
        select: { id: true },
        orderBy: [{ deck: { kind: 'asc' } }, { ord: 'asc' }],
      });
    },

    findCardsByKinds(kinds: DeckKind[]) {
      return db.card.findMany({
        where: {
          deletedAt: null,
          deck: { deletedAt: null, kind: { in: kinds } },
        },
        include: cardStudyInclude,
        orderBy: [{ deck: { kind: 'asc' } }, { ord: 'asc' }],
      });
    },

    findCardById(id: string) {
      return db.card.findFirst({
        where: { id, deletedAt: null },
        include: cardStudyInclude,
      });
    },

    findStatesForUserCards(userId, tenantId, cardIds) {
      if (cardIds.length === 0) {
        return Promise.resolve([]);
      }
      return db.cardState.findMany({
        where: { userId, tenantId, cardId: { in: cardIds } },
      });
    },

    findCardState(userId, tenantId, cardId) {
      return db.cardState.findFirst({
        where: { userId, tenantId, cardId },
      });
    },

    async ensureStates(userId, tenantId, cardIds) {
      if (cardIds.length === 0) {
        return;
      }
      const existing = await db.cardState.findMany({
        where: { userId, tenantId, cardId: { in: cardIds } },
        select: { cardId: true },
      });
      const present = new Set(existing.map((row) => row.cardId));
      const missing = cardIds.filter((cardId) => !present.has(cardId));
      if (missing.length === 0) {
        return;
      }
      await db.cardState.createMany({
        data: missing.map((cardId) => ({
          userId,
          tenantId,
          cardId,
          level: CardLevel.NEW,
          streak: 0,
          seen: 0,
        })),
        skipDuplicates: true,
      });
    },

    updateCardState(id, data) {
      return db.cardState.update({
        where: { id },
        data,
      });
    },

    createSession(data) {
      return db.studySession.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          deckSelector: data.deckSelector,
          bidir: data.bidir,
          queue: data.queue,
          reviews: data.reviews,
          tally: data.tally,
        },
      });
    },

    findSessionById(id, userId, tenantId) {
      return db.studySession.findFirst({
        where: { id, userId, tenantId },
      });
    },

    updateSession(id, data) {
      return db.studySession.update({
        where: { id },
        data: {
          ...(data.queue !== undefined ? { queue: data.queue } : {}),
          ...(data.reviews !== undefined ? { reviews: data.reviews } : {}),
          ...(data.tally !== undefined ? { tally: data.tally } : {}),
          ...(data.endedAt !== undefined ? { endedAt: data.endedAt } : {}),
        },
      });
    },

    async countEasyInPool(userId, tenantId, kinds) {
      const whereCard = {
        deletedAt: null,
        deck: { deletedAt: null, kind: { in: kinds } },
      };
      const [poolSize, easyCount] = await Promise.all([
        db.card.count({ where: whereCard }),
        db.cardState.count({
          where: {
            userId,
            tenantId,
            level: CardLevel.EASY,
            card: whereCard,
          },
        }),
      ]);
      return { easyCount, poolSize };
    },
  };
}

@Injectable()
export class StudyRepository implements StudyStore {
  constructor(private readonly prisma: PrismaService) {}

  private get store(): StudyStore {
    return createStore(this.prisma);
  }

  findCardIdsByKinds(kinds: DeckKind[]): Promise<CardPoolRow[]> {
    return this.store.findCardIdsByKinds(kinds);
  }

  findCardsByKinds(kinds: DeckKind[]): Promise<CardWithStudy[]> {
    return this.store.findCardsByKinds(kinds);
  }

  findCardById(id: string): Promise<CardWithStudy | null> {
    return this.store.findCardById(id);
  }

  findStatesForUserCards(
    userId: string,
    tenantId: string,
    cardIds: string[],
  ): Promise<CardStateRecord[]> {
    return this.store.findStatesForUserCards(userId, tenantId, cardIds);
  }

  findCardState(
    userId: string,
    tenantId: string,
    cardId: string,
  ): Promise<CardStateRecord | null> {
    return this.store.findCardState(userId, tenantId, cardId);
  }

  ensureStates(
    userId: string,
    tenantId: string,
    cardIds: string[],
  ): Promise<void> {
    return this.store.ensureStates(userId, tenantId, cardIds);
  }

  updateCardState(
    id: string,
    data: UpdateCardStateInput,
  ): Promise<CardStateRecord> {
    return this.store.updateCardState(id, data);
  }

  createSession(data: CreateSessionInput): Promise<StudySessionRecord> {
    return this.store.createSession(data);
  }

  findSessionById(
    id: string,
    userId: string,
    tenantId: string,
  ): Promise<StudySessionRecord | null> {
    return this.store.findSessionById(id, userId, tenantId);
  }

  updateSession(
    id: string,
    data: UpdateSessionInput,
  ): Promise<StudySessionRecord> {
    return this.store.updateSession(id, data);
  }

  countEasyInPool(
    userId: string,
    tenantId: string,
    kinds: DeckKind[],
  ): Promise<{ easyCount: number; poolSize: number }> {
    return this.store.countEasyInPool(userId, tenantId, kinds);
  }

  runTransaction<T>(fn: (store: StudyStore) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => fn(createStore(tx)), {
      maxWait: 10_000,
      timeout: 20_000,
    });
  }
}
