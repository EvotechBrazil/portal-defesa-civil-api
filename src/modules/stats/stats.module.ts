import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsRepository } from './stats.repository';
import { StatsService } from './stats.service';

@Module({
  controllers: [StatsController],
  providers: [StatsService, StatsRepository],
  exports: [StatsService, StatsRepository],
})
export class StatsModule {}
