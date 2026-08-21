import { PrismaClient, UserRole } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashPassword } from '../../src/modules/auth/auth.crypto';
import { normalizeWhatsapp } from '../../src/modules/access/whatsapp.util';
import { roleLevel } from '../../src/common/authz/role-hierarchy';

const prisma = new PrismaClient();

interface SeedQuestion {
  mod: string;
  quiz: string;
  q: string;
  opts: string[];
  c: number;
  com: string;
  verifiedBy?: string;
}

interface SeedCard {
  id?: string;
  code: string;
  deck?: string;
  f: string;
  v: string;
  t: string;
  a: string;
  s?: [string, string][];
  q?: number[];
  rev: boolean;
  mod?: string;
  quiz?: string;
  src?: number;
}

interface SeedDecks {
  p: SeedCard[];
  q: SeedCard[];
}

function cardBack(item: SeedCard, kind: 'ESSENTIAL' | 'EXAM'): string {
  if (kind !== 'EXAM') {
    return item.v;
  }
  const context = [item.mod, item.quiz]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/^MÓDULO\s+/u, 'Módulo '))
    .join(' · ');
  return context
    ? `${item.v}\n\n*Contexto para revisão inversa: ${context}.*`
    : item.v;
}

const DATA_DIR = join(__dirname, 'data');
const CONTENT_DIR = join(DATA_DIR, 'content');
const VERIFIED_AT = new Date('2026-08-18T00:00:00.000Z');
const VERIFIED_BY = 'platform-elimination-algorithm';

const CONTENT_PAGES: Array<{
  file: string;
  slug: string;
  ord: number;
  title: string;
}> = [
  {
    file: '01_nucleo_pareto.md',
    slug: 'pareto',
    ord: 1,
    title: 'Núcleo Pareto 80/20',
  },
  {
    file: '02_modulos_plataforma.md',
    slug: 'modulos',
    ord: 2,
    title: 'Resumo por módulo · M1 a M6',
  },
  {
    file: '06_apostila_sintese.md',
    slug: 'apostila',
    ord: 3,
    title: 'Síntese da apostila · Módulos 01 a 08',
  },
  {
    file: '03_glossario_linha_tempo.md',
    slug: 'gloss',
    ord: 4,
    title: 'Glossário, siglas e linha do tempo',
  },
  {
    file: '08_apostila_m01.md',
    slug: 'apostila-01',
    ord: 5,
    title: 'Apostila · M01 Introdução',
  },
  {
    file: '08_apostila_m02.md',
    slug: 'apostila-02',
    ord: 6,
    title: 'Apostila · M02 PNPDEC',
  },
  {
    file: '08_apostila_m03.md',
    slug: 'apostila-03',
    ord: 7,
    title: 'Apostila · M03 Riscos',
  },
  {
    file: '08_apostila_m04.md',
    slug: 'apostila-04',
    ord: 8,
    title: 'Apostila · M04 Prevenção e mitigação',
  },
  {
    file: '08_apostila_m05.md',
    slug: 'apostila-05',
    ord: 9,
    title: 'Apostila · M05 Preparação e planejamento',
  },
  {
    file: '08_apostila_m06.md',
    slug: 'apostila-06',
    ord: 10,
    title: 'Apostila · M06 Resposta',
  },
  {
    file: '08_apostila_m07.md',
    slug: 'apostila-07',
    ord: 11,
    title: 'Apostila · M07 Recuperação',
  },
  {
    file: '08_apostila_m08.md',
    slug: 'apostila-08',
    ord: 12,
    title: 'Apostila · M08 Ética e liderança',
  },
];

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8')) as T;
}

function readMd(name: string): string {
  return readFileSync(join(CONTENT_DIR, name), 'utf8');
}

function parseModule(mod: string): {
  ord: number;
  code: string;
  title: string;
} {
  const match = /^MÓDULO\s+(\d+)\s+—\s+(.+)$/.exec(mod.trim());
  if (!match) {
    throw new Error(`Unexpected module label: ${mod}`);
  }
  const ord = Number(match[1]);
  return { ord, code: `M${ord}`, title: match[2] };
}

function parseQuiz(quiz: string): { code: string; ord: number; title: string } {
  const match = /^Quiz\s+(\d+)\.(\d+)\s+—\s+(.+)$/.exec(quiz.trim());
  if (!match) {
    throw new Error(`Unexpected quiz label: ${quiz}`);
  }
  return {
    code: `${match[1]}.${match[2]}`,
    ord: Number(match[2]),
    title: match[3],
  };
}

const EXPECTED_MODULE_SUMMARIES = 7;

/**
 * §11.1: fatiar por `## ` só é seguro se a âncora for única e a saída for
 * validada. Âncora duplicada sobrescreveria em silêncio, e um heading que
 * mudasse de formato degradaria para `summaryMd: null` sem estourar nada.
 */
function extractModuleSummaries(source: string): Map<string, string> {
  const summaries = new Map<string, string>();
  const parts = source.split(/^## /m).slice(1);
  for (const part of parts) {
    const heading = part.split('\n', 1)[0] ?? '';
    const codeMatch = /^(M\d+)\b/.exec(heading.trim());
    if (!codeMatch) {
      continue;
    }
    const code = codeMatch[1];
    if (summaries.has(code)) {
      throw new Error(
        `Âncora duplicada em 02_modulos_plataforma.md: "## ${code}" aparece mais de uma vez`,
      );
    }
    summaries.set(code, `## ${part.trim()}`);
  }
  if (summaries.size !== EXPECTED_MODULE_SUMMARIES) {
    throw new Error(
      `Esperados ${EXPECTED_MODULE_SUMMARIES} resumos de módulo em 02_modulos_plataforma.md, extraídos ${summaries.size}: ${[...summaries.keys()].join(',')}`,
    );
  }
  return summaries;
}

async function seedTenant() {
  return prisma.tenant.upsert({
    where: { slug: 'default' },
    create: {
      slug: 'default',
      name: 'Programa de evolução contínua LGND SQUAD',
      status: 'ACTIVE',
    },
    update: {
      name: 'Programa de evolução contínua LGND SQUAD',
    },
  });
}

function allowSeedDefaultPasswords(): boolean {
  return process.env.ALLOW_SEED_DEFAULT_PASSWORDS === 'true';
}

async function seedAdmin(tenantId: string) {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@portal.local').toLowerCase();
  const existing = await prisma.user.findFirst({
    where: { tenantId, email, deletedAt: null },
  });
  if (existing) {
    // Comparacao por NIVEL, nunca por igualdade: `entrypoint.sh` roda o seed em
    // todo boot do container (o Coolify nao tem release step). Com `!==`, um
    // ADMIN_EMAIL promovido a ADMIN_SENIOR pela tela era rebaixado no proximo
    // restart. So promove quem esta ABAIXO de ADMIN. Nunca reescreve a senha.
    if (roleLevel(existing.role) < roleLevel(UserRole.ADMIN)) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: UserRole.ADMIN, emailVerifiedAt: new Date() },
      });
    }
    return;
  }

  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === 'production' || !allowSeedDefaultPasswords()) {
      console.warn('[seed] ADMIN_PASSWORD ausente: admin padrao nao criado.');
      return;
    }
    password = 'admin12345';
    console.warn(
      '[seed] ADMIN_PASSWORD ausente: usando senha padrao porque ALLOW_SEED_DEFAULT_PASSWORDS=true.',
    );
  }

  await prisma.user.create({
    data: {
      tenantId,
      email,
      name: 'Administrador',
      passwordHash: await hashPassword(password),
      role: UserRole.ADMIN,
      emailVerifiedAt: new Date(),
    },
  });
}

async function seedSuperAdmin(tenantId: string) {
  const email = process.env.SUPER_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    // NAO lanca: `entrypoint.sh` roda o seed em todo boot, e um throw
    // derrubaria o catalogo junto. Fallback so com flag explicito — nunca
    // inferido por NODE_ENV.
    if (allowSeedDefaultPasswords() && process.env.NODE_ENV !== 'production') {
      console.warn(
        '[seed] SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD ausentes: usando padrao porque ALLOW_SEED_DEFAULT_PASSWORDS=true.',
      );
      return seedSuperAdminWith(
        tenantId,
        'super-admin@portal.local',
        'superadmin12345',
      );
    }
    console.warn(
      '[seed] SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD ausentes: super-admin nao criado.',
    );
    return;
  }

  return seedSuperAdminWith(tenantId, email, password);
}

async function seedSuperAdminWith(
  tenantId: string,
  email: string,
  password: string,
) {
  const existing = await prisma.user.findFirst({
    where: { tenantId, email, deletedAt: null },
  });
  if (existing) {
    // So promove quem esta ABAIXO de SUPER_ADMIN, e nunca reescreve a senha:
    // o seed roda em todo boot e nao pode pisar em config de runtime.
    if (roleLevel(existing.role) < roleLevel(UserRole.SUPER_ADMIN)) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: UserRole.SUPER_ADMIN, emailVerifiedAt: new Date() },
      });
    }
    return;
  }
  await prisma.user.create({
    data: {
      tenantId,
      email,
      name: 'Super Administrador',
      passwordHash: await hashPassword(password),
      role: UserRole.SUPER_ADMIN,
      emailVerifiedAt: new Date(),
    },
  });
}

interface SeedAllowedWhatsapp {
  whatsapp: string;
  label?: string;
}

async function seedManadas(tenantId: string) {
  const packs = [
    { name: 'Manada Norte', country: 'BR', state: 'PR', city: 'Arapongas' },
    { name: 'Manada Centro', country: 'BR', state: 'PR', city: 'Londrina' },
    { name: 'Manada Sul', country: 'BR', state: 'PR', city: 'Curitiba' },
    { name: 'Manada Capital', country: 'BR', state: 'SP', city: 'São Paulo' },
  ];
  for (const pack of packs) {
    const existing = await prisma.manada.findFirst({
      where: {
        tenantId,
        country: pack.country,
        name: { equals: pack.name, mode: 'insensitive' },
        state: { equals: pack.state, mode: 'insensitive' },
        city: { equals: pack.city, mode: 'insensitive' },
      },
    });
    if (existing) {
      if (existing.deletedAt) {
        await prisma.manada.update({
          where: { id: existing.id },
          data: { deletedAt: null },
        });
      }
      continue;
    }
    await prisma.manada.create({
      data: { tenantId, ...pack },
    });
  }
}

async function seedAllowedWhatsapps(tenantId: string) {
  const file = readJson<{ numbers: SeedAllowedWhatsapp[] }>(
    'allowed-whatsapps.json',
  );
  for (const item of file.numbers) {
    const whatsapp = normalizeWhatsapp(item.whatsapp.replace(/\D/g, ''));
    await prisma.allowedWhatsapp.upsert({
      where: { tenantId_whatsapp: { tenantId, whatsapp } },
      create: {
        tenantId,
        whatsapp,
        label: item.label ?? null,
      },
      update: {
        label: item.label ?? undefined,
      },
    });
  }
}

async function seedCourse() {
  return prisma.course.upsert({
    where: { slug: 'defesa-civil-lgnd' },
    create: {
      slug: 'defesa-civil-lgnd',
      title: 'Programa de evolução contínua LGND SQUAD',
      sourcePlatform: 'ticketandgo',
    },
    update: {
      title: 'Programa de evolução contínua LGND SQUAD',
    },
  });
}

async function seedModulesAndQuestions(
  courseId: string,
  questions: SeedQuestion[],
  summaries: Map<string, string>,
): Promise<Map<number, string>> {
  const moduleIds = new Map<string, string>();
  const quizIds = new Map<string, string>();
  const indexToQuestionId = new Map<number, string>();

  for (const question of questions) {
    const parsedMod = parseModule(question.mod);
    if (!moduleIds.has(parsedMod.code)) {
      const created = await prisma.courseModule.upsert({
        where: {
          courseId_code: { courseId, code: parsedMod.code },
        },
        create: {
          courseId,
          ord: parsedMod.ord,
          code: parsedMod.code,
          title: parsedMod.title,
          summaryMd: summaries.get(parsedMod.code) ?? null,
        },
        update: {},
      });
      moduleIds.set(parsedMod.code, created.id);
    }
  }

  const quizSeen = new Set<string>();
  for (const question of questions) {
    const parsedMod = parseModule(question.mod);
    const parsedQuiz = parseQuiz(question.quiz);
    const key = `${parsedMod.code}:${parsedQuiz.code}`;
    if (quizSeen.has(key)) {
      continue;
    }
    quizSeen.add(key);
    const courseModuleId = moduleIds.get(parsedMod.code);
    if (!courseModuleId) {
      throw new Error(`Missing module ${parsedMod.code}`);
    }
    const created = await prisma.quiz.upsert({
      where: {
        courseModuleId_code: { courseModuleId, code: parsedQuiz.code },
      },
      create: {
        courseModuleId,
        ord: parsedQuiz.ord,
        code: parsedQuiz.code,
        title: parsedQuiz.title,
        passScore: 66,
      },
      update: {},
    });
    quizIds.set(key, created.id);
  }

  const quizOrd = new Map<string, number>();
  for (let i = 0; i < questions.length; i += 1) {
    const question = questions[i];
    const parsedMod = parseModule(question.mod);
    const parsedQuiz = parseQuiz(question.quiz);
    const quizKey = `${parsedMod.code}:${parsedQuiz.code}`;
    const quizId = quizIds.get(quizKey);
    if (!quizId) {
      throw new Error(`Missing quiz ${quizKey}`);
    }
    const ord = (quizOrd.get(quizKey) ?? 0) + 1;
    quizOrd.set(quizKey, ord);

    const existing = await prisma.question.findFirst({
      where: { quizId, ord, deletedAt: null },
    });

    const data = {
      quizId,
      ord,
      stem: question.q,
      explanationMd: question.com,
      sourceRef: `${question.mod} › ${question.quiz}`,
      verifiedAt: VERIFIED_AT,
      verifiedBy: question.verifiedBy ?? VERIFIED_BY,
    };

    const saved = existing ? existing : await prisma.question.create({ data });

    if (existing) {
      // idempotent: do not overwrite curated fields
    }

    for (let optIdx = 0; optIdx < question.opts.length; optIdx += 1) {
      await prisma.questionOption.upsert({
        where: {
          questionId_ord: { questionId: saved.id, ord: optIdx },
        },
        create: {
          questionId: saved.id,
          ord: optIdx,
          text: question.opts[optIdx],
          isCorrect: optIdx === question.c,
        },
        update: {},
      });
    }

    indexToQuestionId.set(i, saved.id);
  }

  return indexToQuestionId;
}

async function seedDeck(
  courseId: string,
  kind: 'ESSENTIAL' | 'EXAM',
  title: string,
  cards: SeedCard[],
  indexToQuestionId: Map<number, string>,
) {
  const deck = await prisma.deck.upsert({
    where: { courseId_kind: { courseId, kind } },
    create: { courseId, kind, title },
    update: {},
  });

  for (let i = 0; i < cards.length; i += 1) {
    const item = cards[i];
    const originQuestionId =
      kind === 'EXAM' && typeof item.src === 'number'
        ? (indexToQuestionId.get(item.src) ?? null)
        : null;

    const cardData = {
      ord: i,
      frontMd: item.f,
      backMd: cardBack(item, kind),
      theoryMd: item.t,
      sourceMd: item.a,
      reversible: kind === 'EXAM' ? true : item.rev,
      originQuestionId,
    };

    const card = await prisma.card.upsert({
      where: { deckId_code: { deckId: deck.id, code: item.code } },
      create: {
        deckId: deck.id,
        code: item.code,
        ...cardData,
      },
      update: cardData,
    });

    const related = item.q ?? [];
    for (let rank = 0; rank < related.length; rank += 1) {
      const questionId = indexToQuestionId.get(related[rank]);
      if (!questionId) {
        throw new Error(
          `Card ${item.code} references missing question index ${related[rank]}`,
        );
      }
      await prisma.cardQuestion.upsert({
        where: {
          cardId_questionId: { cardId: card.id, questionId },
        },
        create: { cardId: card.id, questionId, rank },
        update: {},
      });
    }

    const links = item.s ?? [];
    for (let ord = 0; ord < links.length; ord += 1) {
      const [label, targetSlug] = links[ord];
      const existingLink = await prisma.cardLink.findFirst({
        where: { cardId: card.id, ord },
      });
      if (!existingLink) {
        await prisma.cardLink.create({
          data: { cardId: card.id, label, targetSlug, ord },
        });
      }
    }
  }
}

async function seedContentPages(
  courseId: string,
  pages: Array<{ file: string; slug: string; ord: number; title: string }>,
) {
  for (const page of pages) {
    const bodyMd = readMd(page.file);
    await prisma.contentPage.upsert({
      where: { courseId_slug: { courseId, slug: page.slug } },
      create: {
        courseId,
        slug: page.slug,
        ord: page.ord,
        title: page.title,
        bodyMd,
      },
      update: {
        ord: page.ord,
        title: page.title,
        bodyMd,
      },
    });
  }
}

async function printValidation() {
  const [
    tenants,
    courses,
    courseModules,
    quizzes,
    questions,
    questionOptions,
    decks,
    essentialCards,
    essentialQuestionPrompts,
    examCards,
    reversibleExamCards,
    contentPages,
    examOrigins,
    essentialCited,
    cardsWithoutQuestions,
    badOptions,
    orphanLinks,
  ] = await Promise.all([
    // Escopado no tenant que ESTE seeder cria: os e2e adversariais criam
    // tenants extras no mesmo banco e poluiriam a contagem do §7.3.
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
      where: {
        deletedAt: null,
        frontMd: { endsWith: '?' },
        deck: { kind: 'ESSENTIAL' },
      },
    }),
    prisma.card.count({ where: { deletedAt: null, deck: { kind: 'EXAM' } } }),
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
      select: { originQuestionId: true },
      distinct: ['originQuestionId'],
    }),
    prisma.cardQuestion.findMany({
      where: { card: { deletedAt: null, deck: { kind: 'ESSENTIAL' } } },
      select: { questionId: true },
      distinct: ['questionId'],
    }),
    prisma.card.count({
      where: { deletedAt: null, cardQuestions: { none: {} } },
    }),
    prisma.question.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        options: { where: { isCorrect: true }, select: { id: true } },
      },
    }),
    prisma.cardLink.findMany({
      select: { targetSlug: true },
      distinct: ['targetSlug'],
    }),
  ]);

  const pageSlugs = new Set(
    (
      await prisma.contentPage.findMany({
        where: { deletedAt: null },
        select: { slug: true },
      })
    ).map((p) => p.slug),
  );
  const missingLinkSlugs = orphanLinks
    .map((l) => l.targetSlug)
    .filter((slug) => !pageSlugs.has(slug));
  const questionsWithoutSingleCorrect = badOptions.filter(
    (q) => q.options.length !== 1,
  ).length;

  const modulesWithSummary = await prisma.courseModule.count({
    where: { deletedAt: null, summaryMd: { not: null } },
  });

  const totalCards = essentialCards + examCards;
  const report = [
    `tenants: ${tenants} · courses: ${courses} · course_modules: ${courseModules} · quizzes: ${quizzes}`,
    `questions: ${questions} · question_options: ${questionOptions} (${questions} × 3)`,
    `decks: ${decks} · cards ESSENTIAL: ${essentialCards} · cards EXAM: ${examCards}`,
    `frentes ESSENTIAL formuladas como pergunta: ${essentialQuestionPrompts}/${essentialCards}`,
    `cartas EXAM reversíveis: ${reversibleExamCards}/${examCards}`,
    `card_questions: ${cardsWithoutQuestions === 0 ? `> 0 para todas as ${totalCards} cartas` : `MISSING on ${cardsWithoutQuestions} cards`}`,
    `content_pages: ${contentPages}`,
    `course_modules com summaryMd: ${modulesWithSummary}/${courseModules}`,
    `cobertura EXAM (originQuestionId distintos): ${examOrigins.length}/${questions}`,
    `cobertura ESSENTIAL (questões citadas em CardQuestion de cartas ESSENTIAL): ${essentialCited.length}/${questions}`,
    `todo CardLink.targetSlug existe em ContentPage.slug: ${missingLinkSlugs.length === 0 ? 'OK' : missingLinkSlugs.join(',')}`,
    `toda Question tem exatamente 1 option com isCorrect = true: ${questionsWithoutSingleCorrect === 0 ? 'OK' : String(questionsWithoutSingleCorrect)}`,
  ];
  for (const line of report) {
    console.info(line);
  }

  // §11.5: medir sem gate é meio caminho. Divergência derruba o seed.
  const failures: string[] = [];
  const expect = (label: string, actual: number, expected: number) => {
    if (actual !== expected) {
      failures.push(`${label}: esperado ${expected}, medido ${actual}`);
    }
  };
  expect('tenants', tenants, 1);
  expect('courses', courses, 5);
  expect('course_modules', courseModules, 12);
  expect('course_modules com summaryMd', modulesWithSummary, 12);
  expect('quizzes', quizzes, 71);
  expect('questions', questions, 201);
  expect('question_options', questionOptions, 603);
  expect('decks', decks, 6);
  expect('cards ESSENTIAL', essentialCards, 106);
  expect('frentes ESSENTIAL como pergunta', essentialQuestionPrompts, 106);
  expect('cards EXAM', examCards, 133);
  expect('cards EXAM reversíveis', reversibleExamCards, 133);
  expect('content_pages', contentPages, 17);
  expect('cartas sem card_question', cardsWithoutQuestions, 0);
  expect('cobertura EXAM', examOrigins.length, 133);
  expect('cobertura ESSENTIAL', essentialCited.length, 192);
  expect('CardLink órfãos', missingLinkSlugs.length, 0);
  expect('questões sem 1 correta', questionsWithoutSingleCorrect, 0);

  if (failures.length > 0) {
    throw new Error(`Seed divergente do §7.3:\n  - ${failures.join('\n  - ')}`);
  }
}

async function seedLectureCourse(input: {
  slug: string;
  title: string;
  questionsFile: string;
  decksFile: string;
  pages: Array<{ file: string; slug: string; ord: number; title: string }>;
  summaries: Record<string, string>;
}) {
  const course = await prisma.course.upsert({
    where: { slug: input.slug },
    create: {
      slug: input.slug,
      title: input.title,
      sourcePlatform: 'lgnd-squad',
    },
    update: { title: input.title },
  });
  const questions = readJson<SeedQuestion[]>(input.questionsFile);
  const decks = readJson<SeedDecks>(input.decksFile);
  const summaries = new Map<string, string>(Object.entries(input.summaries));
  const indexToQuestionId = await seedModulesAndQuestions(
    course.id,
    questions,
    summaries,
  );
  await seedDeck(
    course.id,
    'ESSENTIAL',
    'Essenciais · 80/20',
    decks.p,
    indexToQuestionId,
  );
  await seedContentPages(course.id, input.pages);
}

async function main() {
  const questions = readJson<SeedQuestion[]>('questoes.json');
  const decks = readJson<SeedDecks>('decks.json');

  const tenant = await seedTenant();
  await seedAdmin(tenant.id);
  await seedSuperAdmin(tenant.id);
  await seedAllowedWhatsapps(tenant.id);
  await seedManadas(tenant.id);
  const course = await seedCourse();
  const indexToQuestionId = await seedModulesAndQuestions(
    course.id,
    questions,
    extractModuleSummaries(readMd('02_modulos_plataforma.md')),
  );
  await seedDeck(
    course.id,
    'ESSENTIAL',
    'Cartas essenciais',
    decks.p,
    indexToQuestionId,
  );
  await seedDeck(
    course.id,
    'EXAM',
    'Cartas de prova',
    decks.q,
    indexToQuestionId,
  );
  await seedContentPages(course.id, CONTENT_PAGES);
  await seedLectureCourse({
    slug: 'aula-1-brec-nos',
    title: 'Aula 1 — BREC e NOS',
    questionsFile: 'aula1-questoes.json',
    decksFile: 'aula1-decks.json',
    pages: [
      {
        file: '09_aula1_brec_nos.md',
        slug: 'aula',
        ord: 1,
        title: 'Aula 1 · BREC e NOS',
      },
      {
        file: '12_aula1_nos_amarracoes.md',
        slug: 'nos',
        ord: 2,
        title: 'Aula 1 · Cartilha dos 7 nós',
      },
    ],
    summaries: {
      M1: 'FIRE Experience: noções de BREC e NOS para a Brigada de Resgate. Regra zero, 7 nós, 3 pontos, apito, chamada 360° e croqui.',
      M2: 'Cartilha dos 7 nós, um a um, com vídeo de execução: fiel, lais de guia, azelha, oito, direito, carioca e cadeirinha rápida. Todo nó tira 20–50% da corda; nó conferido é nó seguro.',
    },
  });
  await seedLectureCourse({
    slug: 'aula-2-aguas-rapidas',
    title: 'Aula 2 — Águas rápidas e corretezas',
    questionsFile: 'aula2-questoes.json',
    decksFile: 'aula2-decks.json',
    pages: [
      {
        file: '10_aula2_aguas_rapidas.md',
        slug: 'aula',
        ord: 1,
        title: 'Aula 2 · Águas rápidas',
      },
    ],
    summaries: {
      M1: 'Táticas de águas rápidas: pirâmide resgatista-equipe-vítima, EPI, 3 km/h, strainer, remanso, 45°, throw bag e choque térmico.',
    },
  });
  await seedLectureCourse({
    slug: 'aula-3-combate-incendio',
    title: 'Aula 3 — Combate a incêndio',
    questionsFile: 'aula3-questoes.json',
    decksFile: 'aula3-decks.json',
    pages: [
      {
        file: '11_aula3_combate_incendio.md',
        slug: 'aula',
        ord: 1,
        title: 'Aula 3 · Combate a incêndio',
      },
    ],
    summaries: {
      M1: 'Teoria do fogo aplicada ao combate: tetraedro, pirólise, propagação do calor, pontos de fulgor/combustão/ignição, métodos de extinção e classes A a K.',
    },
  });
  await seedLectureCourse({
    slug: 'aula-4-primeiros-socorros',
    title: 'Aula 4 — Primeiros socorros',
    questionsFile: 'aula4-questoes.json',
    decksFile: 'aula4-decks.json',
    pages: [
      {
        file: '12_aula4_primeiros_socorros.md',
        slug: 'aula',
        ord: 1,
        title: 'Aula 4 · Primeiros socorros',
      },
    ],
    summaries: {
      M1: 'Atendimento pre-hospitalar: seguranca da cena, protocolo XABCDE, controle de hemorragia e torniquete, OVACE, PCR/RCP e triagem START.',
    },
  });
  await printValidation();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
