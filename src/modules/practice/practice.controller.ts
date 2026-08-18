import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { ListPracticeCardsQueryDto } from './dtos/list-practice-cards-query.dto';
import { SubmitAnswerDto } from './dtos/submit-answer.dto';
import { PracticeService } from './practice.service';

@ApiTags('practice')
@ApiBearerAuth()
@Controller()
export class PracticeController {
  constructor(private readonly practiceService: PracticeService) {}

  @Post('cards/:cardId/attempts')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cardId') cardId: string,
  ) {
    return this.practiceService.create(user, cardId);
  }

  @Post('attempts/:id/answers')
  @HttpCode(HttpStatus.OK)
  answer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') attemptId: string,
    @Body() dto: SubmitAnswerDto,
  ) {
    return this.practiceService.answer(user, attemptId, dto);
  }

  @Post('attempts/:id/finish')
  @HttpCode(HttpStatus.OK)
  finish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') attemptId: string,
  ) {
    return this.practiceService.finish(user, attemptId);
  }

  @Get('cards/:cardId/attempts')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cardId') cardId: string,
  ) {
    return this.practiceService.history(user, cardId);
  }

  @Get('attempts/:id')
  getAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') attemptId: string,
  ) {
    return this.practiceService.getAttempt(user, attemptId);
  }

  @Get('cards/:cardId/answer-key')
  answerKey(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cardId') cardId: string,
  ) {
    return this.practiceService.answerKey(user, cardId);
  }

  @Get('practice/cards')
  listCards(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListPracticeCardsQueryDto,
  ) {
    return this.practiceService.listCards(user, query);
  }

  @Get('practice/recent')
  recent(@CurrentUser() user: AuthenticatedUser) {
    return this.practiceService.recent(user);
  }
}
