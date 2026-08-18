import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { QuestionsService } from './questions.service';

@ApiTags('questions')
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  list() {
    return this.questionsService.list();
  }

  @Get(":id")
  getById() {
    return this.questionsService.getById();
  }
}
