import { Injectable, NotImplementedException } from '@nestjs/common';
import { PracticeRepository } from './practice.repository';

@Injectable()
export class PracticeService {
  constructor(private readonly practiceRepository: PracticeRepository) {}

  create(): never {
    throw new NotImplementedException('PracticeService.create');
  }

  answer(): never {
    throw new NotImplementedException('PracticeService.answer');
  }

  finish(): never {
    throw new NotImplementedException('PracticeService.finish');
  }

  history(): never {
    throw new NotImplementedException('PracticeService.history');
  }
}
