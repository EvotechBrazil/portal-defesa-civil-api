import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const questionDetailsInclude = {
  options: { orderBy: { ord: 'asc' as const } },
  quiz: {
    select: {
      code: true,
      courseModule: { select: { code: true } },
    },
  },
} satisfies Prisma.QuestionInclude;

export type QuestionDetailsRecord = Prisma.QuestionGetPayload<{
  include: typeof questionDetailsInclude;
}>;

export interface ListQuestionsParams {
  moduleCode?: string;
  quizCode?: string;
  search?: string;
  skip: number;
  take: number;
}

@Injectable()
export class QuestionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(params: ListQuestionsParams): Promise<QuestionDetailsRecord[]> {
    return this.prisma.question.findMany({
      where: this.buildWhere(params),
      include: questionDetailsInclude,
      orderBy: [
        { quiz: { courseModule: { ord: 'asc' } } },
        { quiz: { ord: 'asc' } },
        { ord: 'asc' },
      ],
      skip: params.skip,
      take: params.take,
    });
  }

  count(params: Omit<ListQuestionsParams, 'skip' | 'take'>): Promise<number> {
    return this.prisma.question.count({
      where: this.buildWhere(params),
    });
  }

  findById(id: string): Promise<QuestionDetailsRecord | null> {
    return this.prisma.question.findFirst({
      where: { id, deletedAt: null },
      include: questionDetailsInclude,
    });
  }

  private buildWhere(
    params: Omit<ListQuestionsParams, 'skip' | 'take'>,
  ): Prisma.QuestionWhereInput {
    const moduleCode = params.moduleCode?.trim();
    const quizCode = params.quizCode?.trim();
    const search = params.search?.trim();

    return {
      deletedAt: null,
      quiz: {
        deletedAt: null,
        ...(quizCode ? { code: quizCode } : {}),
        courseModule: {
          deletedAt: null,
          ...(moduleCode && moduleCode !== 'all' ? { code: moduleCode } : {}),
        },
      },
      ...(search ? { stem: { contains: search, mode: 'insensitive' } } : {}),
    };
  }
}
