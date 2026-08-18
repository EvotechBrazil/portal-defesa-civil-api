import { Injectable } from '@nestjs/common';
import { CardLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export interface DeckListRow {
  id: string;
  kind: 'ESSENTIAL' | 'EXAM';
  title: string;
  courseId: string;
  course: { slug: string };
  _count: { cards: number };
}

export type LevelCounts = Record<CardLevel, number>;

@Injectable()
export class DecksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    page: number,
    pageSize: number,
  ): Promise<{
    items: DeckListRow[];
    total: number;
  }> {
    const where: Prisma.DeckWhereInput = { deletedAt: null };
    const [items, total] = await Promise.all([
      this.prisma.deck.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { kind: 'asc' },
        select: {
          id: true,
          kind: true,
          title: true,
          courseId: true,
          course: { select: { slug: true } },
          _count: {
            select: { cards: { where: { deletedAt: null } } },
          },
        },
      }),
      this.prisma.deck.count({ where }),
    ]);
    return { items, total };
  }

  async countLevelsByDeck(
    userId: string,
    tenantId: string,
    deckIds: string[],
  ): Promise<Map<string, LevelCounts>> {
    const result = new Map<string, LevelCounts>();
    for (const deckId of deckIds) {
      result.set(deckId, emptyLevels());
    }
    if (deckIds.length === 0) {
      return result;
    }

    const states = await this.prisma.cardState.findMany({
      where: {
        userId,
        tenantId,
        card: { deletedAt: null, deckId: { in: deckIds } },
      },
      select: {
        level: true,
        card: { select: { deckId: true } },
      },
    });

    for (const state of states) {
      const counts = result.get(state.card.deckId);
      if (!counts) {
        continue;
      }
      counts[state.level] += 1;
    }
    return result;
  }
}

function emptyLevels(): LevelCounts {
  return {
    NEW: 0,
    HARD: 0,
    LEARNING: 0,
    EASY: 0,
  };
}
