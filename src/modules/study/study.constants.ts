import { CardLevel, ReviewRating } from '@prisma/client';

export const GAP: Record<ReviewRating, number> = {
  HARD: 2,
  LEARNING: 6,
  EASY: 14,
} as const;

export const RANK: Record<CardLevel, number> = {
  HARD: 0,
  LEARNING: 1,
  NEW: 2,
  EASY: 3,
} as const;

export const EMPTY_TALLY: Record<ReviewRating, number> = {
  HARD: 0,
  LEARNING: 0,
  EASY: 0,
};

export type StudyFilter = 'ALL' | 'HARD_ONLY';

export type ShuffleFn = <T>(items: readonly T[]) => T[];
