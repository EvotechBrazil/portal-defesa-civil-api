import { Injectable, NotImplementedException } from '@nestjs/common';
import { CoursesRepository } from './courses.repository';

@Injectable()
export class CoursesService {
  constructor(private readonly coursesRepository: CoursesRepository) {}

  list(): never {
    throw new NotImplementedException('CoursesService.list');
  }

  getBySlug(): never {
    throw new NotImplementedException('CoursesService.getBySlug');
  }

  getPage(): never {
    throw new NotImplementedException('CoursesService.getPage');
  }

  enroll(): never {
    throw new NotImplementedException('CoursesService.enroll');
  }
}
