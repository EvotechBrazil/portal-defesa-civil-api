/**
 * Pontuação de empenho no programa de estudo — não é aptidão de campo.
 *
 * A fórmula vive nesta constante nomeada, não espalhada na query:
 * ela vai mudar quando dados operacionais entrarem em `operational`.
 */
export const STUDY_PRIORITY_DISCLAIMER =
  'Não use esta lista para escalar equipe operacional. Ela não mede formação prática.';

export const PRACTICAL_TRAINING_NOTICE = 'Formação prática: NÃO AVALIADA';

export const ENGAGEMENT_BANDS = {
  highMin: 70,
  midMin: 40,
} as const;

export type EngagementBand = 'high' | 'mid' | 'low';

export function engagementBand(priorityScore: number): EngagementBand {
  if (priorityScore >= ENGAGEMENT_BANDS.highMin) {
    return 'high';
  }
  if (priorityScore >= ENGAGEMENT_BANDS.midMin) {
    return 'mid';
  }
  return 'low';
}

export const PRIORITY_SCORE_WEIGHTS = {
  accuracy: 0.5,
  consistency: 0.3,
  volume: 0.2,
  consistencyCapDays: 20,
  volumeCapAttempts: 20,
} as const;

export type PriorityParts = {
  accuracy: number;
  consistency: number;
  volume: number;
};

export type PriorityScoreInput = {
  practiceAccuracyPct: number;
  activeDays30d: number;
  attempts: number;
};

export function computePriorityScore(input: PriorityScoreInput): {
  priorityScore: number;
  parts: PriorityParts;
} {
  const parts: PriorityParts = {
    accuracy: PRIORITY_SCORE_WEIGHTS.accuracy * input.practiceAccuracyPct,
    consistency:
      (PRIORITY_SCORE_WEIGHTS.consistency *
        Math.min(
          input.activeDays30d,
          PRIORITY_SCORE_WEIGHTS.consistencyCapDays,
        ) *
        100) /
      PRIORITY_SCORE_WEIGHTS.consistencyCapDays,
    volume:
      (PRIORITY_SCORE_WEIGHTS.volume *
        Math.min(input.attempts, PRIORITY_SCORE_WEIGHTS.volumeCapAttempts) *
        100) /
      PRIORITY_SCORE_WEIGHTS.volumeCapAttempts,
  };
  return {
    priorityScore: Math.round(
      parts.accuracy + parts.consistency + parts.volume,
    ),
    parts,
  };
}

export function splitByMinAttempts<T extends { attempts: number }>(
  rows: T[],
  minAttempts: number,
): { ranked: T[]; insufficientBase: T[] } {
  const ranked: T[] = [];
  const insufficientBase: T[] = [];
  for (const row of rows) {
    if (row.attempts >= minAttempts) {
      ranked.push(row);
    } else {
      insufficientBase.push(row);
    }
  }
  return { ranked, insufficientBase };
}
