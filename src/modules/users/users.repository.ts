import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
  }

  findActiveByEmail(tenantId: string, email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { tenantId, email, deletedAt: null },
    });
  }
}
