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
import { CreateStudySessionDto } from './dtos/create-study-session.dto';
import { ReviewStudySessionDto } from './dtos/review-study-session.dto';
import { StudyFocusQueryDto } from './dtos/study-focus.dto';
import { StudyService } from './study.service';

@ApiTags('study')
@ApiBearerAuth()
@Controller('study-sessions')
export class StudyController {
  constructor(private readonly studyService: StudyService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStudySessionDto,
  ) {
    return this.studyService.create(user, dto);
  }

  @Get(':id')
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: StudyFocusQueryDto,
  ) {
    return this.studyService.getById(user, id, query.focus ?? null);
  }

  @Post(':id/reviews')
  @HttpCode(HttpStatus.OK)
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewStudySessionDto,
  ) {
    return this.studyService.review(user, id, dto.rating, dto.focus ?? null);
  }

  @Post(':id/finish')
  @HttpCode(HttpStatus.OK)
  finish(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.studyService.finish(user, id);
  }
}
