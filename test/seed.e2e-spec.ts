import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface SeedQuestion {
  mod: string;
  quiz: string;
  q: string;
}

interface SeedCard {
  code: string;
  q?: number[];
  src?: number;
}

interface SeedDecks {
  p: SeedCard[];
  q: SeedCard[];
}

const SEED_DATA_DIR = join(__dirname, '..', 'prisma', 'seed', 'data');

function readSeedJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(SEED_DATA_DIR, file), 'utf8')) as T;
}

describe('seed integrity', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('matches the measured catalog counts', async () => {
    const [
      tenants,
      courses,
      courseModules,
      quizzes,
      questions,
      questionOptions,
      decks,
      essentialCards,
      examCards,
      reversibleExamCards,
      contentPages,
      examOrigins,
      essentialCited,
      cardsWithoutQuestions,
      questionsWithOptions,
      pageSlugs,
      linkSlugs,
    ] = await Promise.all([
      prisma.tenant.count({ where: { deletedAt: null, slug: 'default' } }),
      prisma.course.count({ where: { deletedAt: null } }),
      prisma.courseModule.count({ where: { deletedAt: null } }),
      prisma.quiz.count({ where: { deletedAt: null } }),
      prisma.question.count({ where: { deletedAt: null } }),
      prisma.questionOption.count(),
      prisma.deck.count({ where: { deletedAt: null } }),
      prisma.card.count({
        where: { deletedAt: null, deck: { kind: 'ESSENTIAL' } },
      }),
      prisma.card.count({
        where: { deletedAt: null, deck: { kind: 'EXAM' } },
      }),
      prisma.card.count({
        where: {
          deletedAt: null,
          reversible: true,
          deck: { kind: 'EXAM' },
        },
      }),
      prisma.contentPage.count({ where: { deletedAt: null } }),
      prisma.card.findMany({
        where: {
          deletedAt: null,
          deck: { kind: 'EXAM' },
          originQuestionId: { not: null },
        },
        distinct: ['originQuestionId'],
        select: { originQuestionId: true },
      }),
      prisma.cardQuestion.findMany({
        where: { card: { deletedAt: null, deck: { kind: 'ESSENTIAL' } } },
        distinct: ['questionId'],
        select: { questionId: true },
      }),
      prisma.card.count({
        where: { deletedAt: null, cardQuestions: { none: {} } },
      }),
      prisma.question.findMany({
        where: { deletedAt: null },
        select: {
          options: { select: { isCorrect: true } },
        },
      }),
      prisma.contentPage.findMany({
        where: { deletedAt: null },
        select: { slug: true },
      }),
      prisma.cardLink.findMany({
        distinct: ['targetSlug'],
        select: { targetSlug: true },
      }),
    ]);

    expect(tenants).toBe(1);
    expect(courses).toBe(3);
    expect(courseModules).toBe(9);
    expect(quizzes).toBe(56);
    expect(questions).toBe(157);
    expect(questionOptions).toBe(471);
    expect(decks).toBe(4);
    expect(essentialCards).toBe(71);
    expect(examCards).toBe(133);
    expect(reversibleExamCards).toBe(133);
    expect(contentPages).toBe(14);
    expect(examOrigins).toHaveLength(133);
    expect(essentialCited).toHaveLength(148);
    expect(cardsWithoutQuestions).toBe(0);
    expect(
      questionsWithOptions.every(
        (question) =>
          question.options.length === 3 &&
          question.options.filter((option) => option.isCorrect).length === 1,
      ),
    ).toBe(true);

    const slugs = new Set(pageSlugs.map((page) => page.slug));
    expect(linkSlugs.every((link) => slugs.has(link.targetSlug))).toBe(true);
  });

  // §7.1 / §11.4: o índice do array de questoes.json É o identificador, e só
  // vale na ordem original. Contagem não detecta um mapa permutado — só a
  // comparação por conteúdo detecta.
  it('resolves every card→question link through the original array order', async () => {
    const seedQuestions = readSeedJson<SeedQuestion[]>('questoes.json');
    const seedDecks = readSeedJson<SeedDecks>('decks.json');

    const cards = await prisma.card.findMany({
      where: {
        deletedAt: null,
        deck: { course: { slug: 'defesa-civil-lgnd' } },
      },
      select: {
        code: true,
        deck: { select: { kind: true } },
        originQuestion: { select: { stem: true, sourceRef: true } },
        cardQuestions: {
          orderBy: { rank: 'asc' },
          select: {
            rank: true,
            question: { select: { stem: true, sourceRef: true } },
          },
        },
      },
    });
    const byKey = new Map(
      cards.map((card) => [`${card.deck.kind}:${card.code}`, card]),
    );

    const expectedRef = (index: number) => {
      const row = seedQuestions[index];
      return { stem: row.q, sourceRef: `${row.mod} › ${row.quiz}` };
    };

    const mismatches: string[] = [];
    const check = (kind: 'ESSENTIAL' | 'EXAM', entries: SeedCard[]) => {
      for (const entry of entries) {
        const card = byKey.get(`${kind}:${entry.code}`);
        if (!card) {
          mismatches.push(`${kind}:${entry.code} ausente no banco`);
          continue;
        }
        if (typeof entry.src === 'number') {
          const want = expectedRef(entry.src);
          if (
            card.originQuestion?.stem !== want.stem ||
            card.originQuestion?.sourceRef !== want.sourceRef
          ) {
            mismatches.push(
              `${kind}:${entry.code} originQuestion != questoes[${entry.src}]`,
            );
          }
        }
        (entry.q ?? []).forEach((questionIndex, rank) => {
          const want = expectedRef(questionIndex);
          const got = card.cardQuestions[rank]?.question;
          if (got?.stem !== want.stem || got?.sourceRef !== want.sourceRef) {
            mismatches.push(
              `${kind}:${entry.code} rank ${rank} != questoes[${questionIndex}]`,
            );
          }
        });
      }
    };

    check('ESSENTIAL', seedDecks.p);
    check('EXAM', seedDecks.q);

    expect(mismatches).toEqual([]);
  });
});
