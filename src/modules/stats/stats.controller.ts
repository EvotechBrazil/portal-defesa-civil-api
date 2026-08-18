import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StatsService } from './stats.service';

@ApiTags('stats')
@Controller('me')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get("stats")
  getMine() {
    return this.statsService.getMine();
  }
}
