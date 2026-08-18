import { Injectable } from '@nestjs/common';
import {
  buildPaginationMeta,
  PaginationDto,
} from '../../common/dtos/pagination.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { DecksRepository, LevelCounts } from './decks.repository';

export interface DeckListItem {
  id: string;
  kind: 'ESSENTIAL' | 'EXAM';
  title: string;
  courseId: string;
  courseSlug: string;
  cardCount: number;
  levels: LevelCounts;
}

@Injectable()
export class DecksService {
  constructor(private readonly decksRepository: DecksRepository) {}

  async list(user: AuthenticatedUser, query: PaginationDto) {
    const page = query.page;
    const pageSize = query.pageSize;
    const { items, total } = await this.decksRepository.list(page, pageSize);
    const counts = await this.decksRepository.countLevelsByDeck(
      user.id,
      user.tenantId,
      items.map((deck) => deck.id),
    );

    const data: DeckListItem[] = items.map((deck) => {
      const cardCount = deck._count.cards;
      const byLevel = counts.get(deck.id) ?? {
        NEW: 0,
        HARD: 0,
        LEARNING: 0,
        EASY: 0,
      };
      const stated =
        byLevel.NEW + byLevel.HARD + byLevel.LEARNING + byLevel.EASY;
      return {
        id: deck.id,
        kind: deck.kind,
        title: deck.title,
        courseId: deck.courseId,
        courseSlug: deck.course.slug,
        cardCount,
        levels: {
          ...byLevel,
          NEW: byLevel.NEW + (cardCount - stated),
        },
      };
    });

    return { data, meta: buildPaginationMeta(page, pageSize, total) };
  }
}
