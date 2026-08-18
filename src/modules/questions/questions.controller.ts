import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ListQuestionsDto } from './dtos/list-questions.dto';
import { QuestionsService } from './questions.service';

@ApiTags('questions')
@ApiBearerAuth()
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  list(@Query() query: ListQuestionsDto) {
    return this.questionsService.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.questionsService.getById(id);
  }
}
