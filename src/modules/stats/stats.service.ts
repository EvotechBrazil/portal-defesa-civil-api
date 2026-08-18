import { Injectable, NotImplementedException } from '@nestjs/common';
import { StatsRepository } from './stats.repository';

@Injectable()
export class StatsService {
  constructor(private readonly statsRepository: StatsRepository) {}

  getMine(): never {
    throw new NotImplementedException('StatsService.getMine');
  }
}
