import { CardDirection, Prisma } from '@prisma/client';
import { parseQueue, parseTally, resolveDirection } from './study.algorithm';
import {
  CardWithStudy,
  CurrentCardView,
  StudySessionView,
} from './study.types';

export function toCurrentCard(
  card: CardWithStudy,
  state: {
    level: CurrentCardView['state']['level'];
    streak: number;
    seen: number;
  },
  direction: CardDirection,
): CurrentCardView {
  const isReverse = direction === 'REVERSE';
  return {
    id: card.id,
    code: card.code,
    deck: card.deck.kind,
    direction,
    front: isReverse ? card.backMd : card.frontMd,
    back: isReverse ? card.frontMd : card.backMd,
    theoryMd: card.theoryMd,
    sourceMd: card.sourceMd,
    links: card.links.map((link) => ({
      label: link.label,
      targetSlug: link.targetSlug,
    })),
    state: {
      level: state.level,
      streak: state.streak,
      seen: state.seen,
    },
    practiceQuestionIds: card.cardQuestions.map((item) => item.questionId),
  };
}

export function toSessionView(
  session: {
    id: string;
    queue: Prisma.JsonValue;
    reviews: number;
    bidir: boolean;
    deckSelector: StudySessionView['deckSelector'];
    tally: Prisma.JsonValue;
  },
  card: CardWithStudy | null,
  state: {
    level: CurrentCardView['state']['level'];
    streak: number;
    seen: number;
  } | null,
): StudySessionView {
  const queue = parseQueue(session.queue);
  const finished = queue.length === 0;
  let current: CurrentCardView | null = null;
  if (card && state) {
    const direction = resolveDirection(
      session.bidir,
      card.reversible,
      state.seen,
    );
    current = toCurrentCard(card, state, direction);
  }
  return {
    sessionId: session.id,
    queueLength: queue.length,
    reviews: session.reviews,
    bidir: session.bidir,
    deckSelector: session.deckSelector,
    finished,
    tally: parseTally(session.tally),
    card: finished ? null : current,
  };
}
