import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { GetStatsQueryDto } from './dtos/get-stats-query.dto';
import { PeerStatsResponseDto } from './dtos/peer-stats-response.dto';
import { StatsService } from './stats.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UserStatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get(':userId/stats')
  @ApiOperation({
    summary: 'Perfil de desenvolvimento de um legendário',
    description:
      'Visível só dentro da mesma manada. Admin vê todos do tenant. Alvo de outro tenant, inexistente ou soft-deletado devolve 404.',
  })
  @ApiOkResponse({ type: PeerStatsResponseDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  getPeer(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Param('userId') userId: string,
    @Query() query: GetStatsQueryDto,
  ): Promise<PeerStatsResponseDto> {
    return this.statsService.getPeer(user, userId, tenantId, query.courseId);
  }
}
