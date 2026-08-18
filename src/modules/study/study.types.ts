import {
  Card,
  CardDirection,
  CardLevel,
  CardLink,
  CardQuestion,
  Deck,
  DeckKind,
  DeckSelector,
  ReviewRating,
} from '@prisma/client';

export interface CardLinkView {
  label: string;
  targetSlug: string;
}

export interface CardStateView {
  level: CardLevel;
  streak: number;
  seen: number;
}

export interface CurrentCardView {
  id: string;
  code: string;
  deck: DeckKind;
  direction: CardDirection;
  front: string;
  back: string;
  theoryMd: string;
  sourceMd: string;
  links: CardLinkView[];
  state: CardStateView;
  practiceQuestionIds: string[];
}

export interface StudySessionView {
  sessionId: string;
  queueLength: number;
  reviews: number;
  bidir: boolean;
  deckSelector: DeckSelector;
  finished: boolean;
  tally: Record<ReviewRating, number>;
  card: CurrentCardView | null;
}

export interface ReviewedCardView {
  cardId: string;
  level: CardLevel;
  streak: number;
  seen: number;
  retired: boolean;
}

export interface ReviewSessionView extends StudySessionView {
  reviewed: ReviewedCardView;
}

export interface FinishSessionView {
  sessionId: string;
  reviews: number;
  tally: Record<ReviewRating, number>;
  easyCount: number;
  poolSize: number;
  endedAt: Date;
}

export type CardWithStudy = Card & {
  deck: Pick<Deck, 'kind' | 'courseId'> & {
    course: { slug: string };
  };
  links: Pick<CardLink, 'label' | 'targetSlug' | 'ord'>[];
  cardQuestions: Pick<CardQuestion, 'questionId' | 'rank'>[];
};
