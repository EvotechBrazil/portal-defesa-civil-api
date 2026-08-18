import { PrismaClient } from '@prisma/client';

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
          options: { where: { isCorrect: true }, select: { id: true } },
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
    expect(courses).toBe(1);
    expect(courseModules).toBe(6);
    expect(quizzes).toBe(40);
    expect(questions).toBe(109);
    expect(questionOptions).toBe(327);
    expect(decks).toBe(2);
    expect(essentialCards).toBe(43);
    expect(examCards).toBe(109);
    expect(contentPages).toBe(4);
    expect(examOrigins).toHaveLength(109);
    expect(essentialCited).toHaveLength(100);
    expect(cardsWithoutQuestions).toBe(0);
    expect(
      questionsWithOptions.every((question) => question.options.length === 1),
    ).toBe(true);

    const slugs = new Set(pageSlugs.map((page) => page.slug));
    expect(linkSlugs.every((link) => slugs.has(link.targetSlug))).toBe(true);
  });
});
