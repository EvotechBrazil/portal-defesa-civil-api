import { Injectable } from '@nestjs/common';
import {
  CardLevelsDto,
  ModuleAccuracyDto,
  ReviewTallyDto,
  SessionLast30dDto,
  StatsResponseDto,
  StuckCardDto,
} from './dtos/stats-response.dto';
import {
  CardLevelCountRow,
  FinishedAttemptRow,
  SessionRow,
  StatsModuleRow,
  StatsRepository,
  StuckCardRow,
} from './stats.repository';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const EMPTY_CARD_LEVELS: CardLevelsDto = {
  NEW: 0,
  HARD: 0,
  LEARNING: 0,
  EASY: 0,
};

const EMPTY_TALLY: ReviewTallyDto = {
  HARD: 0,
  LEARNING: 0,
  EASY: 0,
};

@Injectable()
export class StatsService {
  constructor(private readonly statsRepository: StatsRepository) {}

  async getMine(
    userId: string,
    tenantId: string,
    courseId?: string,
  ): Promise<StatsResponseDto> {
    if (courseId) {
      const course = await this.statsRepository.findCourseById(courseId);
      if (!course) {
        return emptyStats();
      }
    }

    const since = new Date(Date.now() - THIRTY_DAYS_MS);
    const [modules, attempts, levelRows, stuckRows, sessionRows] =
      await Promise.all([
        this.statsRepository.findModules(courseId),
        this.statsRepository.findFinishedAttempts(userId, tenantId, courseId),
        this.statsRepository.groupCardLevels(userId, tenantId, courseId),
        this.statsRepository.findStuckCards(userId, tenantId, courseId),
        this.statsRepository.findSessionsSince(userId, tenantId, since),
      ]);

    return {
      byModule: aggregateByModule(modules, attempts),
      cardLevels: toCardLevels(levelRows),
      stuckCards: stuckRows.map(toStuckCard),
      sessionsLast30d: sessionRows.map(toSession),
    };
  }
}

function emptyStats(modules: StatsModuleRow[] = []): StatsResponseDto {
  return {
    byModule: modules.map((module) => ({
      code: module.code,
      title: module.title,
      accuracyPct: 0,
      attempts: 0,
    })),
    cardLevels: { ...EMPTY_CARD_LEVELS },
    stuckCards: [],
    sessionsLast30d: [],
  };
}

function aggregateByModule(
  modules: StatsModuleRow[],
  attempts: FinishedAttemptRow[],
): ModuleAccuracyDto[] {
  const buckets = new Map<
    string,
    { correct: number; total: number; attempts: number }
  >();
  for (const module of modules) {
    buckets.set(module.id, { correct: 0, total: 0, attempts: 0 });
  }

  for (const attempt of attempts) {
    const bucket = buckets.get(attempt.courseModuleId);
    if (!bucket || attempt.totalCount <= 0) {
      continue;
    }
    bucket.correct += attempt.correctCount;
    bucket.total += attempt.totalCount;
    bucket.attempts += 1;
  }

  return modules.map((module) => {
    const bucket = buckets.get(module.id) ?? {
      correct: 0,
      total: 0,
      attempts: 0,
    };
    return {
      code: module.code,
      title: module.title,
      accuracyPct:
        bucket.total === 0
          ? 0
          : Math.round((bucket.correct / bucket.total) * 100),
      attempts: bucket.attempts,
    };
  });
}

function toCardLevels(rows: CardLevelCountRow[]): CardLevelsDto {
  const levels: CardLevelsDto = { ...EMPTY_CARD_LEVELS };
  for (const row of rows) {
    levels[row.level] = row.count;
  }
  return levels;
}

function toStuckCard(row: StuckCardRow): StuckCardDto {
  return {
    cardId: row.cardId,
    code: row.code,
    frontMd: row.frontMd,
    seen: row.seen,
    streak: row.streak,
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
  };
}

function toSession(row: SessionRow): SessionLast30dDto {
  return {
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    reviews: row.reviews,
    tally: parseTally(row.tally),
    deckSelector: row.deckSelector,
  };
}

function parseTally(value: unknown): ReviewTallyDto {
  if (!value || typeof value !== 'object') {
    return { ...EMPTY_TALLY };
  }
  const record = value as Record<string, unknown>;
  return {
    HARD: asNonNegativeInt(record.HARD),
    LEARNING: asNonNegativeInt(record.LEARNING),
    EASY: asNonNegativeInt(record.EASY),
  };
}

function asNonNegativeInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : 0;
}
