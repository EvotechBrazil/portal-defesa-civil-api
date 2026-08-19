import { Injectable } from '@nestjs/common';
import {
  AccessRequest,
  AccessRequestStatus,
  AllowedWhatsapp,
  Tenant,
  User,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AccessRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveTenantBySlug(slug: string): Promise<Tenant | null> {
    return this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null, status: 'ACTIVE' },
    });
  }

  findAllowed(
    tenantId: string,
    whatsapp: string,
  ): Promise<AllowedWhatsapp | null> {
    return this.prisma.allowedWhatsapp.findUnique({
      where: { tenantId_whatsapp: { tenantId, whatsapp } },
    });
  }

  findUserByWhatsapp(tenantId: string, whatsapp: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { tenantId, whatsapp, deletedAt: null },
    });
  }

  findRequest(
    tenantId: string,
    whatsapp: string,
  ): Promise<AccessRequest | null> {
    return this.prisma.accessRequest.findUnique({
      where: { tenantId_whatsapp: { tenantId, whatsapp } },
    });
  }

  findRequestById(id: string): Promise<AccessRequest | null> {
    return this.prisma.accessRequest.findUnique({ where: { id } });
  }

  upsertInterested(tenantId: string, whatsapp: string): Promise<AccessRequest> {
    return this.prisma.accessRequest.upsert({
      where: { tenantId_whatsapp: { tenantId, whatsapp } },
      create: { tenantId, whatsapp, status: AccessRequestStatus.INTERESTED },
      update: {},
    });
  }

  submitRequest(data: {
    tenantId: string;
    whatsapp: string;
    name: string;
    lgndNumber: string;
    manada: string;
    email: string;
    justification: string;
  }): Promise<AccessRequest> {
    return this.prisma.accessRequest.upsert({
      where: {
        tenantId_whatsapp: { tenantId: data.tenantId, whatsapp: data.whatsapp },
      },
      create: {
        tenantId: data.tenantId,
        whatsapp: data.whatsapp,
        name: data.name,
        lgndNumber: data.lgndNumber,
        manada: data.manada,
        email: data.email,
        justification: data.justification,
        status: AccessRequestStatus.PENDING,
      },
      update: {
        name: data.name,
        lgndNumber: data.lgndNumber,
        manada: data.manada,
        email: data.email,
        justification: data.justification,
        status: AccessRequestStatus.PENDING,
        reviewedAt: null,
        reviewedById: null,
      },
    });
  }

  listRequests(params: {
    tenantId: string;
    status?: AccessRequestStatus;
    skip: number;
    take: number;
  }): Promise<AccessRequest[]> {
    return this.prisma.accessRequest.findMany({
      where: {
        tenantId: params.tenantId,
        ...(params.status ? { status: params.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }

  countRequests(
    tenantId: string,
    status?: AccessRequestStatus,
  ): Promise<number> {
    return this.prisma.accessRequest.count({
      where: { tenantId, ...(status ? { status } : {}) },
    });
  }

  listAllowed(params: {
    tenantId: string;
    skip: number;
    take: number;
  }): Promise<AllowedWhatsapp[]> {
    return this.prisma.allowedWhatsapp.findMany({
      where: { tenantId: params.tenantId },
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }

  countAllowed(tenantId: string): Promise<number> {
    return this.prisma.allowedWhatsapp.count({
      where: { tenantId },
    });
  }

  createAllowed(data: {
    tenantId: string;
    whatsapp: string;
    label?: string;
  }): Promise<AllowedWhatsapp> {
    return this.prisma.allowedWhatsapp.create({ data });
  }

  findAllowedById(id: string): Promise<AllowedWhatsapp | null> {
    return this.prisma.allowedWhatsapp.findUnique({ where: { id } });
  }

  async deleteAllowed(id: string): Promise<void> {
    await this.prisma.allowedWhatsapp.delete({ where: { id } });
  }

  async approveRequest(params: {
    requestId: string;
    tenantId: string;
    whatsapp: string;
    reviewerId: string;
    reviewedAt: Date;
  }): Promise<AccessRequest> {
    return this.prisma.$transaction(async (tx) => {
      await tx.allowedWhatsapp.upsert({
        where: {
          tenantId_whatsapp: {
            tenantId: params.tenantId,
            whatsapp: params.whatsapp,
          },
        },
        create: {
          tenantId: params.tenantId,
          whatsapp: params.whatsapp,
        },
        update: {},
      });
      return tx.accessRequest.update({
        where: { id: params.requestId },
        data: {
          status: AccessRequestStatus.APPROVED,
          reviewedAt: params.reviewedAt,
          reviewedById: params.reviewerId,
        },
      });
    });
  }

  rejectRequest(params: {
    requestId: string;
    reviewerId: string;
    reviewedAt: Date;
  }): Promise<AccessRequest> {
    return this.prisma.accessRequest.update({
      where: { id: params.requestId },
      data: {
        status: AccessRequestStatus.REJECTED,
        reviewedAt: params.reviewedAt,
        reviewedById: params.reviewerId,
      },
    });
  }

  markRequestApprovedByWhatsapp(
    tenantId: string,
    whatsapp: string,
  ): Promise<void> {
    return this.prisma.accessRequest
      .updateMany({
        where: { tenantId, whatsapp },
        data: { status: AccessRequestStatus.APPROVED },
      })
      .then(() => undefined);
  }
}
