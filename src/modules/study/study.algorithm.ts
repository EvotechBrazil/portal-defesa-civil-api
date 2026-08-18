import { CardDirection, CardLevel, ReviewRating } from '@prisma/client';
import { GAP, RANK, ShuffleFn, StudyFilter } from './study.constants';

export interface CardProgress {
  level: CardLevel;
  streak: number;
  seen: number;
  lastSeenAt: Date | null;
}

export interface RankableCard {
  id: string;
  level: CardLevel;
}

export interface ReviewResult {
  cardId: string;
  queue: string[];
  state: CardProgress;
  retired: boolean;
}

export function fisherYatesShuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = copy[i];
    const swap = copy[j];
    if (current === undefined || swap === undefined) {
      continue;
    }
    copy[i] = swap;
    copy[j] = current;
  }
  return copy;
}

export function identityShuffle<T>(items: readonly T[]): T[] {
  return [...items];
}

export function applyHardOnlyFilter<T extends { level: CardLevel }>(
  pool: readonly T[],
  filter: StudyFilter,
): T[] {
  if (filter !== 'HARD_ONLY') {
    return [...pool];
  }
  const hard = pool.filter(
    (card) => card.level === 'HARD' || card.level === 'LEARNING',
  );
  return hard.length > 0 ? hard : [...pool];
}

export function orderPoolByRank<T extends RankableCard>(
  pool: readonly T[],
  shuffle: ShuffleFn,
): T[] {
  const shuffled = shuffle(pool);
  return [...shuffled].sort((a, b) => RANK[a.level] - RANK[b.level]);
}

export function resolveDirection(
  bidir: boolean,
  reversible: boolean,
  seen: number,
): CardDirection {
  return bidir && reversible && seen % 2 === 1 ? 'REVERSE' : 'FORWARD';
}

export function applyReview(
  queue: readonly string[],
  state: CardProgress,
  rating: ReviewRating,
  now: Date,
): ReviewResult {
  const nextQueue = [...queue];
  const cardId = nextQueue.shift();
  if (!cardId) {
    throw new Error('Cannot review an empty queue');
  }

  const nextState: CardProgress = {
    level: state.level,
    streak: state.streak,
    seen: state.seen + 1,
    lastSeenAt: now,
  };

  if (rating === 'EASY') {
    nextState.streak = state.level === 'EASY' ? state.streak + 1 : 1;
    nextState.level = 'EASY';
  } else {
    nextState.streak = 0;
    nextState.level = rating;
  }

  const retired = rating === 'EASY' && nextState.streak >= 2;
  if (!retired) {
    nextQueue.splice(Math.min(GAP[rating], nextQueue.length), 0, cardId);
  }

  return { cardId, queue: nextQueue, state: nextState, retired };
}

export function parseQueue(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is string => typeof item === 'string');
}

export function parseTally(raw: unknown): Record<ReviewRating, number> {
  const source =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    HARD: asCount(source.HARD),
    LEARNING: asCount(source.LEARNING),
    EASY: asCount(source.EASY),
  };
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
