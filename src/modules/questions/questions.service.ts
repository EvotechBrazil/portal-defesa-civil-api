import { Injectable, NotImplementedException } from '@nestjs/common';
import { QuestionsRepository } from './questions.repository';

@Injectable()
export class QuestionsService {
  constructor(private readonly questionsRepository: QuestionsRepository) {}

  list(): never {
    throw new NotImplementedException('QuestionsService.list');
  }

  getById(): never {
    throw new NotImplementedException('QuestionsService.getById');
  }
}
