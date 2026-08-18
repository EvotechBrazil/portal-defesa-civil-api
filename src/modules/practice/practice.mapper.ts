import {
  AnswerKeyOptionView,
  AnswerKeyQuestionView,
  AttemptHistoryRecord,
  AttemptItemRecord,
  AttemptRecord,
  FinishedAttemptView,
  HistoryItemView,
  OptionRecord,
  PracticeCardListRecord,
  PracticeCardView,
  PreviousAttemptView,
  QuestionRecord,
  RecentAttemptRecord,
  RecentAttemptView,
  RunningAttemptView,
  RunningQuestionView,
} from './practice.types';

export function parseOptionOrder(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is number => Number.isInteger(item));
}

export function scorePct(correctCount: number, totalCount: number): number {
  if (totalCount <= 0) {
    return 0;
  }
  return Math.round((correctCount / totalCount) * 100);
}

export function toHistoryItem(record: AttemptHistoryRecord): HistoryItemView {
  return {
    attemptId: record.id,
    correctCount: record.correctCount,
    totalCount: record.totalCount,
    scorePct: scorePct(record.correctCount, record.totalCount),
    finishedAt: record.finishedAt.toISOString(),
  };
}

export function toPreviousAttempt(
  record: AttemptHistoryRecord,
): PreviousAttemptView {
  return {
    correctCount: record.correctCount,
    totalCount: record.totalCount,
    scorePct: scorePct(record.correctCount, record.totalCount),
    finishedAt: record.finishedAt.toISOString(),
  };
}

function orderOptions(
  options: OptionRecord[],
  optionOrder: unknown,
): OptionRecord[] {
  const byOrd = new Map(options.map((option) => [option.ord, option]));
  const order = parseOptionOrder(optionOrder);
  if (order.length === 0) {
    return [...options].sort((a, b) => a.ord - b.ord);
  }
  const ordered: OptionRecord[] = [];
  for (const ord of order) {
    const option = byOrd.get(ord);
    if (option) {
      ordered.push(option);
    }
  }
  return ordered.length > 0
    ? ordered
    : [...options].sort((a, b) => a.ord - b.ord);
}

function toRunningQuestion(item: AttemptItemRecord): RunningQuestionView {
  return {
    questionId: item.question.id,
    shownOrd: item.shownOrd,
    stem: item.question.stem,
    sourceRef: item.question.sourceRef,
    chosenOptionId: item.chosenOptionId,
    options: orderOptions(item.question.options, item.optionOrder).map(
      (option) => ({
        optionId: option.id,
        text: option.text,
      }),
    ),
  };
}

export function toRunningAttempt(attempt: AttemptRecord): RunningAttemptView {
  const questions = [...attempt.items]
    .sort((a, b) => a.shownOrd - b.shownOrd)
    .map(toRunningQuestion);
  return {
    attemptId: attempt.id,
    total: attempt.totalCount || questions.length,
    answered: questions.filter((question) => question.chosenOptionId).length,
    questions,
  };
}

function findCorrectOption(question: QuestionRecord): OptionRecord | undefined {
  return question.options.find((option) => option.isCorrect);
}

export function toAnswerKeyQuestion(
  item: AttemptItemRecord,
): AnswerKeyQuestionView {
  const ordered = orderOptions(item.question.options, item.optionOrder);
  const correct = findCorrectOption(item.question);
  const options: AnswerKeyOptionView[] = ordered.map((option) => ({
    optionId: option.id,
    text: option.text,
    isCorrect: option.isCorrect,
  }));
  const chosenIsCorrect =
    item.isCorrect ??
    (item.chosenOptionId !== null &&
      item.chosenOptionId === (correct?.id ?? null));
  return {
    questionId: item.question.id,
    stem: item.question.stem,
    explanationMd: item.question.explanationMd,
    correctOptionId: correct?.id ?? '',
    chosenOptionId: item.chosenOptionId,
    isCorrect: chosenIsCorrect,
    options,
  };
}

export function toStudyAnswerKey(
  questions: QuestionRecord[],
): AnswerKeyQuestionView[] {
  return questions.map((question) => {
    const correct = findCorrectOption(question);
    const options: AnswerKeyOptionView[] = [...question.options]
      .sort((a, b) => a.ord - b.ord)
      .map((option) => ({
        optionId: option.id,
        text: option.text,
        isCorrect: option.isCorrect,
      }));
    return {
      questionId: question.id,
      stem: question.stem,
      explanationMd: question.explanationMd,
      correctOptionId: correct?.id ?? '',
      chosenOptionId: null,
      isCorrect: false,
      options,
    };
  });
}

export function toFinishedAttempt(params: {
  attempt: AttemptRecord;
  previous: AttemptHistoryRecord | null;
  priorHistory: AttemptHistoryRecord[];
}): FinishedAttemptView {
  const { attempt, previous, priorHistory } = params;
  const correctCount = attempt.correctCount;
  const totalCount = attempt.totalCount;
  const currentPct = scorePct(correctCount, totalCount);
  const previousView = previous ? toPreviousAttempt(previous) : null;
  const history = [
    ...[...priorHistory].reverse().map((row) => ({
      correctCount: row.correctCount,
      totalCount: row.totalCount,
      finishedAt: row.finishedAt.toISOString(),
    })),
    {
      correctCount,
      totalCount,
      finishedAt: (attempt.finishedAt ?? new Date()).toISOString(),
    },
  ];
  return {
    correctCount,
    totalCount,
    scorePct: currentPct,
    previous: previousView,
    deltaPct: previousView ? currentPct - previousView.scorePct : null,
    history,
    answerKey: [...attempt.items]
      .sort((a, b) => a.shownOrd - b.shownOrd)
      .map(toAnswerKeyQuestion),
  };
}

export function toPracticeCard(
  record: PracticeCardListRecord,
): PracticeCardView {
  return {
    id: record.id,
    code: record.code,
    front: record.frontMd,
    deckKind: record.deck.kind,
    questionCount: record._count.cardQuestions,
  };
}

export function toRecentAttempt(
  record: RecentAttemptRecord,
): RecentAttemptView | null {
  if (!record.cardId || !record.card || !record.finishedAt) {
    return null;
  }
  return {
    attemptId: record.id,
    cardId: record.cardId,
    cardCode: record.card.code,
    cardFront: record.card.frontMd,
    correctCount: record.correctCount,
    totalCount: record.totalCount,
    scorePct: scorePct(record.correctCount, record.totalCount),
    finishedAt: record.finishedAt.toISOString(),
  };
}
