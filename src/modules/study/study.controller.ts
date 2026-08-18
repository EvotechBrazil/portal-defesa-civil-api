import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StudyService } from './study.service';

@ApiTags('study')
@Controller('study-sessions')
export class StudyController {
  constructor(private readonly studyService: StudyService) {}

  @Post()
  create() {
    return this.studyService.create();
  }

  @Get(":id")
  getById() {
    return this.studyService.getById();
  }

  @Post(":id/reviews")
  review() {
    return this.studyService.review();
  }

  @Post(":id/finish")
  finish() {
    return this.studyService.finish();
  }
}
