import { Injectable } from '@nestjs/common';
import { Manada, Prisma, Tenant } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ManadasRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveTenantBySlug(slug: string): Promise<Tenant | null> {
    return this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null, status: 'ACTIVE' },
    });
  }

  findActiveById(tenantId: string, id: string): Promise<Manada | null> {
    return this.prisma.manada.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  findByLocation(
    tenantId: string,
    data: {
      name: string;
      country: string;
      state: string;
      city: string;
    },
  ): Promise<Manada | null> {
    return this.prisma.manada.findFirst({
      where: {
        tenantId,
        country: data.country,
        name: { equals: data.name, mode: 'insensitive' },
        state: { equals: data.state, mode: 'insensitive' },
        city: { equals: data.city, mode: 'insensitive' },
      },
    });
  }

  listActive(tenantId: string, q?: string): Promise<Manada[]> {
    return this.prisma.manada.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ name: 'asc' }, { city: 'asc' }],
      take: 500,
    });
  }

  create(data: {
    tenantId: string;
    name: string;
    country: string;
    state: string;
    city: string;
  }): Promise<Manada> {
    return this.prisma.manada.create({ data });
  }

  restore(id: string): Promise<Manada> {
    return this.prisma.manada.update({
      where: { id },
      data: { deletedAt: null },
    });
  }
}

export function isPrismaUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as Prisma.PrismaClientKnownRequestError).code === 'P2002'
  );
}
