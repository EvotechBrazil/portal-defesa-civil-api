import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class StatsRepository {
  constructor(private readonly prisma: PrismaService) {}
}
