import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { GetStatsQueryDto } from './dtos/get-stats-query.dto';
import { StatsResponseDto } from './dtos/stats-response.dto';
import { StatsService } from './stats.service';

@ApiTags('stats')
@ApiBearerAuth()
@Controller('me')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Desempenho do usuário autenticado' })
  @ApiOkResponse({ type: StatsResponseDto })
  @ApiUnauthorizedResponse()
  getMine(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Query() query: GetStatsQueryDto,
  ): Promise<StatsResponseDto> {
    return this.statsService.getMine(user.id, tenantId, query.courseId);
  }
}
