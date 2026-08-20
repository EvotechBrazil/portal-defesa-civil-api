import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CardLevel, UserRole } from '@prisma/client';
import { hasAtLeast } from '../../common/authz/role-hierarchy';
import {
  PaginationMeta,
  buildPaginationMeta,
} from '../../common/dtos/pagination.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { ListManadaMembersQueryDto } from './dtos/list-manada-members-query.dto';
import { ManadaMemberDto } from './dtos/manada-member.dto';
import {
  ListRankingQueryDto,
  RankingSortBy,
} from './dtos/list-ranking-query.dto';
import { PeerStatsResponseDto } from './dtos/peer-stats-response.dto';
import { RankingItemDto } from './dtos/ranking-response.dto';
import {
  CardLevelsDto,
  ModuleAccuracyDto,
  ReviewTallyDto,
  SessionLast30dDto,
  StatsResponseDto,
  StuckCardDto,
} from './dtos/stats-response.dto';
import {
  computePriorityScore,
  engagementBand,
  PRACTICAL_TRAINING_NOTICE,
  splitByMinAttempts,
  STUDY_PRIORITY_DISCLAIMER,
} from './priority-score';
import {
  AttemptAggRow,
  CardLevelCountRow,
  FinishedAttemptRow,
  MemberProfileRow,
  SessionMaxRow,
  SessionRow,
  SessionStartRow,
  RankingStudyScope,
  StatsModuleRow,
  StatsRepository,
  StuckCardRow,
  UserCardLevelRow,
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
  private readonly logger = new Logger(StatsService.name);

  constructor(private readonly statsRepository: StatsRepository) {}

  getMine(
    userId: string,
    tenantId: string,
    courseId?: string,
  ): Promise<StatsResponseDto> {
    return this.getFor(userId, tenantId, courseId);
  }

  async getFor(
    targetUserId: string,
    tenantId: string,
    courseId?: string,
  ): Promise<StatsResponseDto> {
    if (courseId) {
      const course = await this.statsRepository.findCourseById(courseId);
      if (!course) {
        const modules = await this.statsRepository.findModules();
        return emptyStats(modules);
      }
    }

    const since = new Date(Date.now() - THIRTY_DAYS_MS);
    const [modules, attempts, levelRows, stuckRows, sessionRows] =
      await Promise.all([
        this.statsRepository.findModules(courseId),
        this.statsRepository.findFinishedAttempts(
          targetUserId,
          tenantId,
          courseId,
        ),
        this.statsRepository.groupCardLevels(targetUserId, tenantId, courseId),
        this.statsRepository.findStuckCards(targetUserId, tenantId, courseId),
        this.statsRepository.findSessionsSince(targetUserId, tenantId, since),
      ]);

    return {
      byModule: aggregateByModule(modules, attempts),
      cardLevels: toCardLevels(levelRows),
      stuckCards: stuckRows.map(toStuckCard),
      sessionsLast30d: sessionRows.map(toSession),
    };
  }

  async getPeer(
    viewer: AuthenticatedUser,
    targetUserId: string,
    tenantId: string,
    courseId?: string,
  ): Promise<PeerStatsResponseDto> {
    const target =
      await this.statsRepository.findActiveProfileById(targetUserId);
    if (!target || target.tenantId !== tenantId) {
      throw new NotFoundException('User not found');
    }

    const viewerProfile = await this.statsRepository.findActiveProfileById(
      viewer.id,
    );
    if (!viewerProfile || viewerProfile.tenantId !== tenantId) {
      throw new NotFoundException('User not found');
    }

    if (!canViewPeer(viewer, viewerProfile, target)) {
      throw new ForbiddenException('Forbidden');
    }

    const stats = await this.getFor(target.id, tenantId, courseId);
    return {
      ...stats,
      profile: {
        userId: target.id,
        name: target.name,
        photoUrl: null,
        lgndNumber: target.lgndNumber,
        squad: target.squad,
        manada: target.pack,
      },
      disclaimer: STUDY_PRIORITY_DISCLAIMER,
    };
  }

  async listManadaMembers(
    viewer: AuthenticatedUser,
    tenantId: string,
    query: ListManadaMembersQueryDto,
  ): Promise<{
    data: ManadaMemberDto[];
    meta: PaginationMeta & { reason?: 'NO_MANADA' };
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const viewerProfile = await this.statsRepository.findActiveProfileById(
      viewer.id,
    );
    if (!viewerProfile || viewerProfile.tenantId !== tenantId) {
      throw new NotFoundException('User not found');
    }
    if (!viewerProfile.manadaId) {
      return {
        data: [],
        meta: {
          ...buildPaginationMeta(page, pageSize, 0),
          reason: 'NO_MANADA',
        },
      };
    }

    const members = await this.statsRepository.findActiveManadaMembers(
      tenantId,
      viewerProfile.manadaId,
    );
    const metrics = await this.loadMemberMetrics(
      tenantId,
      members.map((member) => member.id),
    );
    const items = members.map((member) => {
      const study = metrics.get(member.id) ?? emptyMemberMetrics();
      return {
        userId: member.id,
        name: member.name,
        photoUrl: null,
        lgndNumber: member.lgndNumber,
        squad: member.squad,
        coveragePct: study.coveragePct,
        practiceAccuracyPct: study.practiceAccuracyPct,
        activeDays30d: study.activeDays30d,
        lastActiveAt: study.lastActiveAt,
      };
    });

    const sortBy = query.sortBy ?? 'name';
    items.sort((a, b) => compareManadaMembers(a, b, sortBy));
    const total = items.length;
    const start = (page - 1) * pageSize;
    return {
      data: items.slice(start, start + pageSize),
      meta: buildPaginationMeta(page, pageSize, total),
    };
  }

  async getRanking(
    viewer: AuthenticatedUser,
    tenantId: string,
    query: ListRankingQueryDto,
  ): Promise<{
    data: { ranked: RankingItemDto[]; insufficientBase: RankingItemDto[] };
    meta: PaginationMeta & { disclaimer: string; truncated: boolean };
  }> {
    const scope = await this.requireRankingScope(query);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const minAttempts = query.minAttempts ?? 3;
    const sortBy = query.sortBy ?? 'priority';

    const { users, truncated } =
      await this.statsRepository.findActiveUsersForRanking(tenantId, {
        manadaId: query.manadaId,
        state: query.state,
        city: query.city,
      });
    const metrics = await this.loadMemberMetrics(
      tenantId,
      users.map((user) => user.id),
      scope,
    );
    const items = users.map((user) =>
      toRankingItem(user, metrics.get(user.id) ?? emptyMemberMetrics()),
    );
    const { ranked, insufficientBase } = splitByMinAttempts(
      items.map((item) => ({ item, attempts: item.study.attempts })),
      minAttempts,
    );
    const rankedItems = ranked.map((row) => row.item);
    const insufficientItems = insufficientBase.map((row) => row.item);
    rankedItems.sort((a, b) => compareRankingItems(a, b, sortBy));
    insufficientItems.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    const total = rankedItems.length;
    const start = (page - 1) * pageSize;
    this.logger.log(
      JSON.stringify({
        event: 'ranking.read',
        userId: viewer.id,
        filters: {
          manadaId: query.manadaId ?? null,
          state: query.state ?? null,
          city: query.city ?? null,
          courseId: scope.courseId ?? null,
          moduleCode: scope.moduleCode ?? null,
        },
        sortBy,
        minAttempts,
        total,
        timestamp: new Date().toISOString(),
      }),
    );
    return {
      data: {
        ranked: rankedItems.slice(start, start + pageSize),
        insufficientBase: insufficientItems,
      },
      meta: {
        ...buildPaginationMeta(page, pageSize, total),
        disclaimer: STUDY_PRIORITY_DISCLAIMER,
        truncated,
      },
    };
  }

  private async requireRankingScope(
    query: ListRankingQueryDto,
  ): Promise<RankingStudyScope> {
    const courseId = query.courseId?.trim() || undefined;
    const moduleCode = query.moduleCode?.trim() || undefined;
    if (!courseId && !moduleCode) {
      throw new BadRequestException(
        'Informe courseId ou moduleCode. A lista não pode ser consultada sem recorte.',
      );
    }
    if (courseId) {
      const course = await this.statsRepository.findCourseById(courseId);
      if (!course) {
        throw new BadRequestException('Curso não encontrado.');
      }
    }
    if (moduleCode) {
      const courseModule = await this.statsRepository.findActiveModuleByCode(
        moduleCode,
        courseId,
      );
      if (!courseModule) {
        throw new BadRequestException('Módulo não encontrado.');
      }
    }
    return { courseId, moduleCode };
  }

  private async loadMemberMetrics(
    tenantId: string,
    userIds: string[],
    scope?: RankingStudyScope,
  ): Promise<Map<string, MemberMetrics>> {
    const since = new Date(Date.now() - THIRTY_DAYS_MS);
    const [attempts, cardLevels, sessionMax, sessionStarts, totalCards] =
      await Promise.all([
        this.statsRepository.groupFinishedAttemptsByUser(
          tenantId,
          userIds,
          scope,
        ),
        this.statsRepository.groupCardLevelsByUser(tenantId, userIds, scope),
        this.statsRepository.groupSessionMaxByUser(tenantId, userIds),
        this.statsRepository.findSessionStartsSinceByUser(
          tenantId,
          userIds,
          since,
        ),
        this.statsRepository.countActiveCards(tenantId, scope),
      ]);
    return mergeMemberMetrics(
      userIds,
      attempts,
      cardLevels,
      sessionMax,
      sessionStarts,
      totalCards,
    );
  }
}

function canViewPeer(
  viewer: AuthenticatedUser,
  viewerProfile: MemberProfileRow,
  target: MemberProfileRow,
): boolean {
  if (viewer.id === target.id) {
    return true;
  }
  if (hasAtLeast(viewer.role, UserRole.ADMIN)) {
    return true;
  }
  if (!viewerProfile.manadaId || !target.manadaId) {
    return false;
  }
  return viewerProfile.manadaId === target.manadaId;
}

type MemberMetrics = {
  practiceAccuracyPct: number;
  attempts: number;
  activeDays30d: number;
  coveragePct: number;
  lastActiveAt: string | null;
};

function emptyMemberMetrics(): MemberMetrics {
  return {
    practiceAccuracyPct: 0,
    attempts: 0,
    activeDays30d: 0,
    coveragePct: 0,
    lastActiveAt: null,
  };
}

function mergeMemberMetrics(
  userIds: string[],
  attempts: AttemptAggRow[],
  cardLevels: UserCardLevelRow[],
  sessionMax: SessionMaxRow[],
  sessionStarts: SessionStartRow[],
  totalCards: number,
): Map<string, MemberMetrics> {
  const byUser = new Map<string, MemberMetrics>();
  for (const userId of userIds) {
    byUser.set(userId, emptyMemberMetrics());
  }

  for (const row of attempts) {
    const metrics = byUser.get(row.userId);
    if (!metrics) {
      continue;
    }
    metrics.attempts = row.attempts;
    metrics.practiceAccuracyPct =
      row.totalCount === 0
        ? 0
        : Math.round((row.correctCount / row.totalCount) * 100);
    metrics.lastActiveAt = laterIso(metrics.lastActiveAt, row.lastFinishedAt);
  }

  const covered = new Map<string, number>();
  for (const row of cardLevels) {
    if (row.level !== CardLevel.EASY && row.level !== CardLevel.LEARNING) {
      continue;
    }
    covered.set(row.userId, (covered.get(row.userId) ?? 0) + row.count);
  }
  for (const [userId, count] of covered) {
    const metrics = byUser.get(userId);
    if (!metrics) {
      continue;
    }
    metrics.coveragePct =
      totalCards === 0 ? 0 : Math.round((count / totalCards) * 100);
  }

  for (const row of sessionMax) {
    const metrics = byUser.get(row.userId);
    if (!metrics) {
      continue;
    }
    metrics.lastActiveAt = laterIso(metrics.lastActiveAt, row.lastStartedAt);
  }

  const days = new Map<string, Set<string>>();
  for (const row of sessionStarts) {
    const key = row.startedAt.toISOString().slice(0, 10);
    const set = days.get(row.userId) ?? new Set<string>();
    set.add(key);
    days.set(row.userId, set);
  }
  for (const [userId, set] of days) {
    const metrics = byUser.get(userId);
    if (metrics) {
      metrics.activeDays30d = set.size;
    }
  }

  return byUser;
}

function laterIso(current: string | null, next: Date | null): string | null {
  if (!next) {
    return current;
  }
  const iso = next.toISOString();
  if (!current || iso > current) {
    return iso;
  }
  return current;
}

function toRankingItem(
  user: {
    id: string;
    name: string;
    lgndNumber: string | null;
    pack: RankingItemDto['manada'];
  },
  study: MemberMetrics,
): RankingItemDto {
  const { priorityScore, parts } = computePriorityScore({
    practiceAccuracyPct: study.practiceAccuracyPct,
    activeDays30d: study.activeDays30d,
    attempts: study.attempts,
  });
  return {
    userId: user.id,
    name: user.name,
    photoUrl: null,
    lgndNumber: user.lgndNumber,
    manada: user.pack,
    study: {
      practiceAccuracyPct: study.practiceAccuracyPct,
      attempts: study.attempts,
      activeDays30d: study.activeDays30d,
      coveragePct: study.coveragePct,
      lastActiveAt: study.lastActiveAt,
      selfReported: ['coveragePct'],
    },
    priorityScore,
    engagementBand: engagementBand(priorityScore),
    priorityParts: parts,
    operational: null,
    practicalTrainingNotice: PRACTICAL_TRAINING_NOTICE,
  };
}

function compareManadaMembers(
  a: ManadaMemberDto,
  b: ManadaMemberDto,
  sortBy: 'name' | 'lastActiveAt',
): number {
  if (sortBy === 'lastActiveAt') {
    if (a.lastActiveAt === b.lastActiveAt) {
      return a.name.localeCompare(b.name, 'pt-BR');
    }
    if (!a.lastActiveAt) {
      return 1;
    }
    if (!b.lastActiveAt) {
      return -1;
    }
    return a.lastActiveAt < b.lastActiveAt ? 1 : -1;
  }
  return a.name.localeCompare(b.name, 'pt-BR');
}

function compareRankingItems(
  a: RankingItemDto,
  b: RankingItemDto,
  sortBy: RankingSortBy,
): number {
  let delta = 0;
  if (sortBy === 'accuracy') {
    delta = b.study.practiceAccuracyPct - a.study.practiceAccuracyPct;
  } else if (sortBy === 'activeDays') {
    delta = b.study.activeDays30d - a.study.activeDays30d;
  } else {
    delta = b.priorityScore - a.priorityScore;
  }
  if (delta !== 0) {
    return delta;
  }
  return a.name.localeCompare(b.name, 'pt-BR');
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
