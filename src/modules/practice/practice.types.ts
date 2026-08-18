export interface OptionRecord {
  id: string;
  questionId: string;
  ord: number;
  text: string;
  isCorrect: boolean;
}

export interface QuestionRecord {
  id: string;
  stem: string;
  explanationMd: string | null;
  sourceRef: string | null;
  deletedAt: Date | null;
  options: OptionRecord[];
}

export interface CardQuestionRecord {
  cardId: string;
  questionId: string;
  rank: number;
  question: QuestionRecord;
}

export interface CardWithQuestionsRecord {
  id: string;
  code: string;
  deletedAt: Date | null;
  cardQuestions: CardQuestionRecord[];
}

export interface AttemptItemRecord {
  id: string;
  attemptId: string;
  questionId: string;
  chosenOptionId: string | null;
  isCorrect: boolean | null;
  shownOrd: number;
  optionOrder: unknown;
  question: QuestionRecord;
}

export interface AttemptRecord {
  id: string;
  tenantId: string;
  userId: string;
  cardId: string | null;
  finishedAt: Date | null;
  correctCount: number;
  totalCount: number;
  startedAt: Date;
  items: AttemptItemRecord[];
}

export interface AttemptHistoryRecord {
  id: string;
  correctCount: number;
  totalCount: number;
  finishedAt: Date;
}

export interface PracticeCardListRecord {
  id: string;
  code: string;
  frontMd: string;
  deck: { kind: 'ESSENTIAL' | 'EXAM' };
  _count: { cardQuestions: number };
}

export interface RecentAttemptRecord {
  id: string;
  cardId: string | null;
  correctCount: number;
  totalCount: number;
  finishedAt: Date | null;
  card: { id: string; code: string; frontMd: string } | null;
}

export interface CreateAttemptItemInput {
  questionId: string;
  shownOrd: number;
  optionOrder: number[];
}

export interface RunningOptionView {
  optionId: string;
  text: string;
}

export interface RunningQuestionView {
  questionId: string;
  shownOrd: number;
  stem: string;
  sourceRef: string | null;
  chosenOptionId: string | null;
  options: RunningOptionView[];
}

export interface RunningAttemptView {
  attemptId: string;
  total: number;
  answered: number;
  questions: RunningQuestionView[];
}

export interface AnswerRecordView {
  recorded: true;
  answered: number;
  total: number;
}

export interface HistoryItemView {
  attemptId: string;
  correctCount: number;
  totalCount: number;
  scorePct: number;
  finishedAt: string;
}

export interface AttemptHistoryView {
  history: HistoryItemView[];
  current: RunningAttemptView | null;
  questionCount: number;
}

export interface AnswerKeyOptionView {
  optionId: string;
  text: string;
  isCorrect: boolean;
}

export interface AnswerKeyQuestionView {
  questionId: string;
  stem: string;
  explanationMd: string | null;
  correctOptionId: string;
  chosenOptionId: string | null;
  isCorrect: boolean;
  options: AnswerKeyOptionView[];
}

export interface PreviousAttemptView {
  correctCount: number;
  totalCount: number;
  scorePct: number;
  finishedAt: string;
}

export interface FinishedAttemptView {
  correctCount: number;
  totalCount: number;
  scorePct: number;
  previous: PreviousAttemptView | null;
  deltaPct: number | null;
  history: Array<{
    correctCount: number;
    totalCount: number;
    finishedAt: string;
  }>;
  answerKey: AnswerKeyQuestionView[];
}

export interface PracticeCardView {
  id: string;
  code: string;
  front: string;
  deckKind: 'ESSENTIAL' | 'EXAM';
  questionCount: number;
}

export interface RecentAttemptView {
  attemptId: string;
  cardId: string;
  cardCode: string;
  cardFront: string;
  correctCount: number;
  totalCount: number;
  scorePct: number;
  finishedAt: string;
}
