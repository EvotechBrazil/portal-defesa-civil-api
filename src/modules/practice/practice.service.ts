import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildPaginationMeta,
  PaginationMeta,
} from '../../common/dtos/pagination.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { PRACTICE_HISTORY_LIMIT, PRACTICE_SHUFFLE } from './practice.constants';
import { ListPracticeCardsQueryDto } from './dtos/list-practice-cards-query.dto';
import { SubmitAnswerDto } from './dtos/submit-answer.dto';
import {
  toFinishedAttempt,
  toHistoryItem,
  toPracticeCard,
  toRecentAttempt,
  toRunningAttempt,
  toStudyAnswerKey,
} from './practice.mapper';
import { PracticeRepository } from './practice.repository';
import { PracticeShuffle } from './practice.shuffle';
import {
  AnswerKeyQuestionView,
  AnswerRecordView,
  AttemptHistoryView,
  AttemptRecord,
  FinishedAttemptView,
  PracticeCardView,
  RecentAttemptView,
  RunningAttemptView,
} from './practice.types';

@Injectable()
export class PracticeService {
  constructor(
    private readonly practiceRepository: PracticeRepository,
    @Inject(PRACTICE_SHUFFLE) private readonly shuffle: PracticeShuffle,
  ) {}

  async create(
    user: AuthenticatedUser,
    cardId: string,
  ): Promise<RunningAttemptView> {
    const card =
      await this.practiceRepository.findActiveCardWithQuestions(cardId);
    if (!card) {
      throw new NotFoundException('Carta não encontrada.');
    }

    const links = card.cardQuestions.filter(
      (link) =>
        link.question.deletedAt === null && link.question.options.length > 0,
    );
    if (links.length === 0) {
      throw new BadRequestException(
        'Esta carta não possui questões para praticar.',
      );
    }

    const shuffledQuestions = this.shuffle(links);
    const items = shuffledQuestions.map((link, shownOrd) => {
      const shuffledOptions = this.shuffle(link.question.options);
      return {
        questionId: link.question.id,
        shownOrd,
        optionOrder: shuffledOptions.map((option) => option.ord),
      };
    });

    const attempt = await this.practiceRepository.createAttempt({
      tenantId: user.tenantId,
      userId: user.id,
      cardId: card.id,
      totalCount: items.length,
      items,
    });
    return toRunningAttempt(attempt);
  }

  async answer(
    user: AuthenticatedUser,
    attemptId: string,
    dto: SubmitAnswerDto,
  ): Promise<AnswerRecordView> {
    const attempt = await this.requireAttempt(user, attemptId);
    this.assertRunning(attempt);

    const item = attempt.items.find((row) => row.questionId === dto.questionId);
    if (!item) {
      throw new NotFoundException('Questão não pertence a esta tentativa.');
    }
    if (item.chosenOptionId) {
      throw new ConflictException('Esta questão já foi respondida.');
    }

    const option = item.question.options.find((row) => row.id === dto.optionId);
    if (!option) {
      throw new BadRequestException('Alternativa inválida para esta questão.');
    }

    const updated = await this.practiceRepository.recordAnswer({
      itemId: item.id,
      optionId: option.id,
      isCorrect: option.isCorrect,
    });
    if (updated === 0) {
      throw new ConflictException('Esta questão já foi respondida.');
    }

    const answered = await this.practiceRepository.countAnswered(attempt.id);
    return {
      recorded: true,
      answered,
      total: attempt.totalCount || attempt.items.length,
    };
  }

  async finish(
    user: AuthenticatedUser,
    attemptId: string,
  ): Promise<FinishedAttemptView> {
    const attempt = await this.requireAttempt(user, attemptId);
    this.assertRunning(attempt);

    await this.practiceRepository.markUnansweredIncorrect(attempt.id);

    const scored = await this.requireAttempt(user, attemptId);
    const correctCount = scored.items.filter(
      (item) => item.isCorrect === true,
    ).length;
    const totalCount = scored.items.length;
    const finishedAt = new Date();

    const updated = await this.practiceRepository.finishAttempt({
      attemptId: attempt.id,
      userId: user.id,
      tenantId: user.tenantId,
      correctCount,
      totalCount,
      finishedAt,
    });
    if (updated === 0) {
      throw new ConflictException('Esta tentativa já foi finalizada.');
    }

    const finished = await this.requireAttempt(user, attemptId);
    const priorHistory = await this.practiceRepository.findFinishedHistory({
      userId: user.id,
      tenantId: user.tenantId,
      cardId: finished.cardId ?? '',
      take: PRACTICE_HISTORY_LIMIT - 1,
      excludeAttemptId: finished.id,
    });

    return toFinishedAttempt({
      attempt: finished,
      previous: priorHistory[0] ?? null,
      priorHistory,
    });
  }

  async history(
    user: AuthenticatedUser,
    cardId: string,
  ): Promise<AttemptHistoryView> {
    const card =
      await this.practiceRepository.findActiveCardWithQuestions(cardId);
    if (!card) {
      throw new NotFoundException('Carta não encontrada.');
    }

    const [rows, current] = await Promise.all([
      this.practiceRepository.findFinishedHistory({
        userId: user.id,
        tenantId: user.tenantId,
        cardId,
        take: PRACTICE_HISTORY_LIMIT,
      }),
      this.practiceRepository.findLatestUnfinished(
        user.id,
        user.tenantId,
        cardId,
      ),
    ]);

    return {
      history: [...rows].reverse().map(toHistoryItem),
      current: current ? toRunningAttempt(current) : null,
      questionCount: card.cardQuestions.filter(
        (link) => link.question.deletedAt === null,
      ).length,
    };
  }

  async getAttempt(
    user: AuthenticatedUser,
    attemptId: string,
  ): Promise<RunningAttemptView | FinishedAttemptView> {
    const attempt = await this.requireAttempt(user, attemptId);
    if (!attempt.finishedAt) {
      return toRunningAttempt(attempt);
    }
    if (!attempt.cardId) {
      return toFinishedAttempt({
        attempt,
        previous: null,
        priorHistory: [],
      });
    }
    const priorHistory = await this.practiceRepository.findFinishedHistory({
      userId: user.id,
      tenantId: user.tenantId,
      cardId: attempt.cardId,
      take: PRACTICE_HISTORY_LIMIT - 1,
      excludeAttemptId: attempt.id,
    });
    return toFinishedAttempt({
      attempt,
      previous: priorHistory[0] ?? null,
      priorHistory,
    });
  }

  async answerKey(
    _user: AuthenticatedUser,
    cardId: string,
  ): Promise<{ questions: AnswerKeyQuestionView[] }> {
    const card =
      await this.practiceRepository.findActiveCardWithQuestions(cardId);
    if (!card) {
      throw new NotFoundException('Carta não encontrada.');
    }
    const questions = card.cardQuestions
      .filter((link) => link.question.deletedAt === null)
      .map((link) => link.question);
    return { questions: toStudyAnswerKey(questions) };
  }

  async listCards(
    _user: AuthenticatedUser,
    query: ListPracticeCardsQueryDto,
  ): Promise<{ data: PracticeCardView[]; meta: PaginationMeta }> {
    const page = query.page;
    const pageSize = query.pageSize;
    const [rows, total] = await Promise.all([
      this.practiceRepository.listPracticeCards({
        skip: (page - 1) * pageSize,
        take: pageSize,
        search: query.search,
      }),
      this.practiceRepository.countPracticeCards(query.search),
    ]);
    return {
      data: rows.map(toPracticeCard),
      meta: buildPaginationMeta(page, pageSize, total),
    };
  }

  async recent(
    user: AuthenticatedUser,
  ): Promise<{ items: RecentAttemptView[] }> {
    const rows = await this.practiceRepository.findRecentFinished({
      userId: user.id,
      tenantId: user.tenantId,
      take: PRACTICE_HISTORY_LIMIT,
    });
    const items = rows
      .map(toRecentAttempt)
      .filter((row): row is RecentAttemptView => row !== null);
    return { items };
  }

  private async requireAttempt(
    user: AuthenticatedUser,
    attemptId: string,
  ): Promise<AttemptRecord> {
    const attempt = await this.practiceRepository.findAttemptForUser(
      attemptId,
      user.id,
      user.tenantId,
    );
    if (!attempt) {
      throw new NotFoundException('Tentativa não encontrada.');
    }
    return attempt;
  }

  private assertRunning(attempt: AttemptRecord): void {
    if (attempt.finishedAt) {
      throw new ConflictException('Esta tentativa já foi finalizada.');
    }
  }
}
