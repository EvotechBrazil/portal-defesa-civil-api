import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { ListRankingQueryDto } from './dtos/list-ranking-query.dto';
import { RankingDataDto } from './dtos/ranking-response.dto';
import { StatsService } from './stats.service';

@ApiTags('admin-members')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class MembersAdminController {
  constructor(private readonly statsService: StatsService) {}

  @Get('members/ranking')
  @ApiOperation({
    summary: 'Engajamento no estudo',
    description:
      'Não use esta lista para escalar equipe operacional. Ela não mede formação prática. Exige courseId ou moduleCode.',
  })
  @ApiOkResponse({ type: RankingDataDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  getRanking(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Query() query: ListRankingQueryDto,
  ) {
    return this.statsService.getRanking(user, tenantId, query);
  }
}
