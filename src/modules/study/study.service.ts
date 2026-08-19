import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DeckKind, ReviewRating } from '@prisma/client';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import {
  applyHardOnlyFilter,
  applyReview,
  fisherYatesShuffle,
  orderPoolByRank,
  parseQueue,
  parseTally,
} from './study.algorithm';
import { EMPTY_TALLY, ShuffleFn } from './study.constants';
import { CreateStudySessionDto } from './dtos/create-study-session.dto';
import { toSessionView } from './study.mapper';
import {
  CardStateRecord,
  StudyRepository,
  StudySessionRecord,
  StudyStore,
} from './study.repository';
import {
  FinishSessionView,
  ReviewSessionView,
  StudySessionView,
} from './study.types';

export const STUDY_SHUFFLE_TOKEN = 'STUDY_SHUFFLE';

@Injectable()
export class StudyService {
  private shuffle: ShuffleFn;

  constructor(
    private readonly studyRepository: StudyRepository,
    @Optional() @Inject(STUDY_SHUFFLE_TOKEN) shuffle?: ShuffleFn,
  ) {
    this.shuffle = shuffle ?? fisherYatesShuffle;
  }

  setShuffle(shuffle: ShuffleFn): void {
    this.shuffle = shuffle;
  }

  async create(
    user: AuthenticatedUser,
    dto: CreateStudySessionDto,
  ): Promise<StudySessionView> {
    const kinds = kindsForSelector(dto.deckSelector);
    const cards = await this.studyRepository.findCardIdsByKinds(kinds);
    if (cards.length === 0) {
      throw new NotFoundException('No cards available');
    }

    const cardIds = cards.map((card) => card.id);
    const states = await this.studyRepository.findStatesForUserCards(
      user.id,
      user.tenantId,
      cardIds,
    );
    const stateByCard = new Map(states.map((state) => [state.cardId, state]));

    const pooled = cards.map((card) => ({
      id: card.id,
      level: stateByCard.get(card.id)?.level ?? 'NEW',
    }));
    const selected = applyHardOnlyFilter(pooled, dto.filter ?? 'ALL');

    await this.studyRepository.ensureStates(
      user.id,
      user.tenantId,
      selected.map((item) => item.id),
    );

    const queue = orderPoolByRank(selected, this.shuffle).map(
      (item) => item.id,
    );
    const session = await this.studyRepository.createSession({
      tenantId: user.tenantId,
      userId: user.id,
      deckSelector: dto.deckSelector,
      bidir: dto.bidir ?? true,
      queue,
      reviews: 0,
      tally: { ...EMPTY_TALLY },
    });

    return this.presentSession(this.studyRepository, session);
  }

  async getById(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<StudySessionView> {
    const session = await this.studyRepository.findSessionById(
      sessionId,
      user.id,
      user.tenantId,
    );
    if (!session) {
      throw new NotFoundException('Study session not found');
    }
    return this.presentSession(this.studyRepository, session);
  }

  review(
    user: AuthenticatedUser,
    sessionId: string,
    rating: ReviewRating,
  ): Promise<ReviewSessionView> {
    return this.studyRepository.runTransaction(async (store) => {
      const session = await store.findSessionById(
        sessionId,
        user.id,
        user.tenantId,
      );
      if (!session) {
        throw new NotFoundException('Study session not found');
      }
      if (session.endedAt) {
        throw new ConflictException('Study session already finished');
      }

      const queue = parseQueue(session.queue);
      if (queue.length === 0) {
        throw new ConflictException('Study session already finished');
      }

      const currentId = queue[0];
      if (!currentId) {
        throw new ConflictException('Study session already finished');
      }

      const state = await store.findCardState(
        user.id,
        user.tenantId,
        currentId,
      );
      if (!state) {
        throw new NotFoundException('Card state not found');
      }

      const now = new Date();
      const result = applyReview(
        queue,
        {
          level: state.level,
          streak: state.streak,
          seen: state.seen,
          lastSeenAt: state.lastSeenAt,
        },
        rating,
        now,
      );

      const tally = parseTally(session.tally);
      tally[rating] += 1;

      await store.updateCardState(state.id, {
        level: result.state.level,
        streak: result.state.streak,
        seen: result.state.seen,
        lastSeenAt: result.state.lastSeenAt,
      });

      const updated = await store.updateSession(session.id, {
        queue: result.queue,
        reviews: session.reviews + 1,
        tally,
        endedAt: result.queue.length === 0 ? now : undefined,
      });

      const view = await this.presentSession(store, updated);
      return {
        ...view,
        reviewed: {
          cardId: result.cardId,
          level: result.state.level,
          streak: result.state.streak,
          seen: result.state.seen,
          retired: result.retired,
        },
      };
    });
  }

  async finish(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<FinishSessionView> {
    const session = await this.studyRepository.findSessionById(
      sessionId,
      user.id,
      user.tenantId,
    );
    if (!session) {
      throw new NotFoundException('Study session not found');
    }

    const ended =
      session.endedAt ??
      (
        await this.studyRepository.updateSession(session.id, {
          endedAt: new Date(),
        })
      ).endedAt;

    const kinds = kindsForSelector(session.deckSelector);
    const { easyCount, poolSize } = await this.studyRepository.countEasyInPool(
      user.id,
      user.tenantId,
      kinds,
    );

    return {
      sessionId: session.id,
      reviews: session.reviews,
      tally: parseTally(session.tally),
      easyCount,
      poolSize,
      endedAt: ended ?? new Date(),
    };
  }

  private async presentSession(
    store: StudyStore,
    session: StudySessionRecord,
  ): Promise<StudySessionView> {
    const queue = parseQueue(session.queue);
    const cardId = queue[0];
    if (!cardId) {
      return toSessionView(session, null, null);
    }

    const card = await store.findCardById(cardId);
    if (!card) {
      throw new NotFoundException('Current card not found');
    }
    const state = await store.findCardState(
      session.userId,
      session.tenantId,
      cardId,
    );
    return toSessionView(session, card, toProgress(state));
  }
}

function kindsForSelector(
  selector: StudySessionRecord['deckSelector'],
): DeckKind[] {
  return selector === 'FULL'
    ? [DeckKind.ESSENTIAL, DeckKind.EXAM]
    : [DeckKind.ESSENTIAL];
}

function toProgress(state: CardStateRecord | null): {
  level: CardStateRecord['level'];
  streak: number;
  seen: number;
} {
  if (!state) {
    return { level: 'NEW', streak: 0, seen: 0 };
  }
  return { level: state.level, streak: state.streak, seen: state.seen };
}
