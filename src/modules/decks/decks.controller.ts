import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { DecksService } from './decks.service';

@ApiTags('decks')
@ApiBearerAuth()
@Controller('decks')
export class DecksController {
  constructor(private readonly decksService: DecksService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationDto) {
    return this.decksService.list(user, query);
  }
}
