import { Module } from '@nestjs/common';
import { MembersAdminController } from './members.admin.controller';
import { StatsController } from './stats.controller';
import { StatsRepository } from './stats.repository';
import { StatsService } from './stats.service';
import { UserStatsController } from './user-stats.controller';

@Module({
  controllers: [StatsController, UserStatsController, MembersAdminController],
  providers: [StatsService, StatsRepository],
  exports: [StatsService, StatsRepository],
})
export class StatsModule {}
