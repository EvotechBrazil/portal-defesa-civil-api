import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PracticeService } from './practice.service';

@ApiTags('practice')
@Controller()
export class PracticeController {
  constructor(private readonly practiceService: PracticeService) {}

  @Post('cards/:cardId/attempts')
  create(@Param('cardId') _cardId: string) {
    return this.practiceService.create();
  }

  @Post('attempts/:id/answers')
  answer(@Param('id') _id: string) {
    return this.practiceService.answer();
  }

  @Post('attempts/:id/finish')
  finish(@Param('id') _id: string) {
    return this.practiceService.finish();
  }

  @Get('cards/:cardId/attempts')
  history(@Param('cardId') _cardId: string) {
    return this.practiceService.history();
  }
}
