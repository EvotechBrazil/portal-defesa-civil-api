import { Injectable } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
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

  findActiveByWhatsapp(
    tenantId: string,
    whatsapp: string,
  ): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { tenantId, whatsapp, deletedAt: null },
    });
  }

  createStudent(data: {
    tenantId: string;
    email: string;
    name: string;
    passwordHash: string;
    emailVerifiedAt?: Date;
    whatsapp: string;
    lgndNumber: string;
    manada: string;
    city: string;
    squad: string;
    eventoFire: string;
    photoBytes?: Buffer;
    photoMime?: string;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        tenantId: data.tenantId,
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash,
        role: UserRole.STUDENT,
        emailVerifiedAt: data.emailVerifiedAt,
        whatsapp: data.whatsapp,
        lgndNumber: data.lgndNumber,
        manada: data.manada,
        city: data.city,
        squad: data.squad,
        eventoFire: data.eventoFire,
        photoBytes: data.photoBytes
          ? Uint8Array.from(data.photoBytes)
          : undefined,
        photoMime: data.photoMime,
      },
    });
  }

  async updateLastLoginAt(id: string, lastLoginAt: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLoginAt },
    });
  }
}
