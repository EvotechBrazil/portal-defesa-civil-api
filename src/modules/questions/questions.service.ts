import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PaginationMeta,
  buildPaginationMeta,
} from '../../common/dtos/pagination.dto';
import { ListQuestionsDto } from './dtos/list-questions.dto';
import { QuestionDto } from './dtos/question-response.dto';
import {
  QuestionDetailsRecord,
  QuestionsRepository,
} from './questions.repository';

const MAX_PAGE_SIZE = 100;

@Injectable()
export class QuestionsService {
  constructor(private readonly questionsRepository: QuestionsRepository) {}

  async list(
    query: ListQuestionsDto,
  ): Promise<{ data: QuestionDto[]; meta: PaginationMeta }> {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(query.pageSize ?? 20, MAX_PAGE_SIZE);
    const filters = {
      moduleCode: query.moduleCode,
      quizCode: query.quizCode,
      search: query.search,
    };

    const [questions, total] = await Promise.all([
      this.questionsRepository.findMany({
        ...filters,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.questionsRepository.count(filters),
    ]);

    return {
      data: questions.map((question) => this.toDto(question)),
      meta: buildPaginationMeta(page, pageSize, total),
    };
  }

  async getById(id: string): Promise<QuestionDto> {
    const question = await this.questionsRepository.findById(id);
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    return this.toDto(question);
  }

  private toDto(question: QuestionDetailsRecord): QuestionDto {
    return {
      id: question.id,
      stem: question.stem,
      explanationMd: question.explanationMd,
      sourceRef: question.sourceRef,
      moduleCode: question.quiz.courseModule.code,
      quizCode: question.quiz.code,
      options: question.options.map((option) => ({
        id: option.id,
        ord: option.ord,
        text: option.text,
        isCorrect: option.isCorrect,
      })),
    };
  }
}
