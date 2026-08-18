import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class QuestionsRepository {
  constructor(private readonly prisma: PrismaService) {}
}
