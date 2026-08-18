import { Injectable, NotImplementedException } from '@nestjs/common';
import { StudyRepository } from './study.repository';

@Injectable()
export class StudyService {
  constructor(private readonly studyRepository: StudyRepository) {}

  create(): never {
    throw new NotImplementedException('StudyService.create');
  }

  getById(): never {
    throw new NotImplementedException('StudyService.getById');
  }

  review(): never {
    throw new NotImplementedException('StudyService.review');
  }

  finish(): never {
    throw new NotImplementedException('StudyService.finish');
  }
}
