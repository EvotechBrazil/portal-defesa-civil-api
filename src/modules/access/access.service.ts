import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AccessRequest, AccessRequestStatus } from '@prisma/client';
import {
  PaginationDto,
  PaginationMeta,
  buildPaginationMeta,
} from '../../common/dtos/pagination.dto';
import { MailService } from '../mail/mail.service';
import { ManadasService } from '../manadas/manadas.service';
import { AccessRepository } from './access.repository';
import {
  AccessRequestView,
  AllowedWhatsappView,
  SubmitAccessRequestResult,
  WhatsappCheckResult,
} from './access.types';
import { AllowWhatsappDto } from './dtos/allow-whatsapp.dto';
import { CheckWhatsappDto } from './dtos/check-whatsapp.dto';
import { ListAccessRequestsDto } from './dtos/list-access-requests.dto';
import { RequestAccessDto } from './dtos/request-access.dto';
import {
  canonicalWhatsapp,
  InvalidWhatsappError,
  normalizeWhatsapp,
} from './whatsapp.util';

const DEFAULT_TENANT_SLUG = 'default';
const MAX_PAGE_SIZE = 100;

function isPrismaUniqueConstraint(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  return error.code === 'P2002';
}

@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);

  constructor(
    private readonly accessRepository: AccessRepository,
    private readonly manadasService: ManadasService,
    private readonly mailService: MailService,
  ) {}

  async checkWhatsapp(dto: CheckWhatsappDto): Promise<WhatsappCheckResult> {
    const tenantId = await this.requireDefaultTenantId();
    const whatsapp = this.parseWhatsapp(dto.whatsapp);

    const existingUser = await this.accessRepository.findUserByWhatsapp(
      tenantId,
      whatsapp,
    );
    if (existingUser) {
      return { status: 'REGISTERED', whatsapp };
    }

    const allowed = await this.accessRepository.findAllowed(tenantId, whatsapp);
    if (allowed) {
      return { status: 'ALLOWED', whatsapp };
    }

    const request = await this.accessRepository.findRequest(tenantId, whatsapp);
    if (request?.status === AccessRequestStatus.PENDING) {
      return { status: 'PENDING', whatsapp };
    }
    if (request?.status === AccessRequestStatus.APPROVED) {
      return { status: 'ALLOWED', whatsapp };
    }
    if (request?.status === AccessRequestStatus.REJECTED) {
      return { status: 'REJECTED', whatsapp };
    }

    await this.accessRepository.upsertInterested(tenantId, whatsapp);
    return { status: 'NOT_ALLOWED', whatsapp };
  }

  async requestAccess(
    dto: RequestAccessDto,
  ): Promise<SubmitAccessRequestResult> {
    const tenantId = await this.requireDefaultTenantId();
    const whatsapp = this.parseWhatsapp(dto.whatsapp);

    const existingUser = await this.accessRepository.findUserByWhatsapp(
      tenantId,
      whatsapp,
    );
    if (existingUser) {
      throw new ConflictException('Este WhatsApp já possui cadastro.');
    }

    const allowed = await this.accessRepository.findAllowed(tenantId, whatsapp);
    if (allowed) {
      throw new ConflictException(
        'Este WhatsApp já está liberado. Siga para o cadastro.',
      );
    }

    const existing = await this.accessRepository.findRequest(
      tenantId,
      whatsapp,
    );
    if (existing?.status === AccessRequestStatus.APPROVED) {
      throw new ConflictException(
        'Este WhatsApp já está liberado. Siga para o cadastro.',
      );
    }
    if (existing?.status === AccessRequestStatus.PENDING) {
      throw new ConflictException('Sua solicitação já está em análise.');
    }

    const pack = await this.resolveManada(tenantId, dto);
    const saved = await this.accessRepository.submitRequest({
      tenantId,
      whatsapp,
      name: dto.name.trim(),
      lgndNumber: dto.lgndNumber.trim(),
      manada: pack.name,
      manadaId: pack.id,
      country: dto.country?.trim().toUpperCase(),
      state: dto.state?.trim(),
      city: dto.city?.trim(),
      email: dto.email.trim().toLowerCase(),
      justification: dto.justification.trim(),
    });
    await this.notifyAccessReviewers(tenantId, {
      name: saved.name ?? dto.name.trim(),
      whatsapp: saved.whatsapp,
      email: saved.email ?? dto.email.trim().toLowerCase(),
      lgndNumber: saved.lgndNumber ?? dto.lgndNumber.trim(),
      manada: saved.manada ?? pack.name,
      city: saved.city,
      state: saved.state,
      justification: saved.justification ?? dto.justification.trim(),
    });
    return { id: saved.id, status: saved.status };
  }

  async assertCanRegister(tenantId: string, whatsapp: string): Promise<void> {
    const allowed = await this.accessRepository.findAllowed(tenantId, whatsapp);
    if (allowed) {
      return;
    }
    const request = await this.accessRepository.findRequest(tenantId, whatsapp);
    if (request?.status === AccessRequestStatus.APPROVED) {
      return;
    }
    throw new ForbiddenException(
      'Este WhatsApp não está liberado para cadastro.',
    );
  }

  async markRegistered(tenantId: string, whatsapp: string): Promise<void> {
    await this.accessRepository.markRequestApprovedByWhatsapp(
      tenantId,
      whatsapp,
    );
  }

  async listRequests(
    tenantId: string,
    query: ListAccessRequestsDto,
  ): Promise<{ data: AccessRequestView[]; meta: PaginationMeta }> {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(query.pageSize ?? 20, MAX_PAGE_SIZE);
    const [rows, total] = await Promise.all([
      this.accessRepository.listRequests({
        tenantId,
        status: query.status,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.accessRepository.countRequests(tenantId, query.status),
    ]);
    return {
      data: rows.map((row) => this.toRequestView(row)),
      meta: buildPaginationMeta(page, pageSize, total),
    };
  }

  async listAllowed(
    tenantId: string,
    query: PaginationDto,
  ): Promise<{ data: AllowedWhatsappView[]; meta: PaginationMeta }> {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(query.pageSize ?? 20, MAX_PAGE_SIZE);
    const [rows, total] = await Promise.all([
      this.accessRepository.listAllowed({
        tenantId,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.accessRepository.countAllowed(tenantId),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        whatsapp: row.whatsapp,
        label: row.label,
        createdAt: row.createdAt,
      })),
      meta: buildPaginationMeta(page, pageSize, total),
    };
  }

  async addAllowed(
    tenantId: string,
    dto: AllowWhatsappDto,
  ): Promise<AllowedWhatsappView> {
    const whatsapp = this.parseWhatsapp(dto.whatsapp);
    try {
      const created = await this.accessRepository.createAllowed({
        tenantId,
        whatsapp,
        label: dto.label?.trim() || undefined,
      });
      return {
        id: created.id,
        whatsapp: created.whatsapp,
        label: created.label,
        createdAt: created.createdAt,
      };
    } catch (error: unknown) {
      if (isPrismaUniqueConstraint(error)) {
        throw new ConflictException('Este WhatsApp já está na lista.');
      }
      throw error;
    }
  }

  async removeAllowed(tenantId: string, id: string): Promise<void> {
    const existing = await this.accessRepository.findAllowedById(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException('Número não encontrado.');
    }
    await this.accessRepository.deleteAllowed(id);
  }

  async approveRequest(
    tenantId: string,
    requestId: string,
    reviewerId: string,
  ): Promise<AccessRequestView> {
    const request = await this.requirePendingRequest(tenantId, requestId);
    const updated = await this.accessRepository.approveRequest({
      requestId: request.id,
      tenantId,
      whatsapp: request.whatsapp,
      reviewerId,
      reviewedAt: new Date(),
    });
    return this.toRequestView(updated);
  }

  async rejectRequest(
    tenantId: string,
    requestId: string,
    reviewerId: string,
  ): Promise<AccessRequestView> {
    const request = await this.requirePendingRequest(tenantId, requestId);
    const updated = await this.accessRepository.rejectRequest({
      requestId: request.id,
      reviewerId,
      reviewedAt: new Date(),
    });
    return this.toRequestView(updated);
  }

  private async notifyAccessReviewers(
    tenantId: string,
    payload: {
      name: string;
      whatsapp: string;
      email: string;
      lgndNumber: string;
      manada: string;
      city?: string | null;
      state?: string | null;
      justification: string;
    },
  ): Promise<void> {
    const reviewers = await this.accessRepository.findAccessReviewers(tenantId);
    const recipients = [
      ...new Set(reviewers.map((row) => row.email.trim().toLowerCase())),
    ].filter(Boolean);
    if (recipients.length === 0) {
      this.logger.warn(
        JSON.stringify({
          event: 'access.request.notify.skipped',
          tenantId,
          reason: 'NO_REVIEWERS',
        }),
      );
      return;
    }

    const results = await Promise.allSettled(
      recipients.map((to) =>
        this.mailService.sendAccessRequestNotification(to, payload),
      ),
    );
    const failed = results.filter(
      (result) => result.status === 'rejected',
    ).length;
    if (failed > 0) {
      this.logger.error(
        JSON.stringify({
          event: 'access.request.notify.partial_failure',
          tenantId,
          failed,
          total: recipients.length,
        }),
      );
    }
  }

  private async resolveManada(
    tenantId: string,
    dto: RequestAccessDto,
  ): Promise<{ id?: string; name: string }> {
    if (dto.manadaId) {
      const found = await this.manadasService.getById(tenantId, dto.manadaId);
      return { id: found.id, name: found.name };
    }
    const name = dto.manada?.trim();
    if (!name) {
      throw new BadRequestException('Informe a manada.');
    }
    if (dto.country && dto.state && dto.city) {
      const created = await this.manadasService.findOrCreate(tenantId, {
        name,
        country: dto.country,
        state: dto.state,
        city: dto.city,
      });
      return { id: created.id, name: created.name };
    }
    return { name };
  }

  parseWhatsapp(raw: string): string {
    try {
      return canonicalWhatsapp(normalizeWhatsapp(raw));
    } catch (error: unknown) {
      if (error instanceof InvalidWhatsappError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async requirePendingRequest(
    tenantId: string,
    requestId: string,
  ): Promise<AccessRequest> {
    const request = await this.accessRepository.findRequestById(requestId);
    if (!request || request.tenantId !== tenantId) {
      throw new NotFoundException('Solicitação não encontrada.');
    }
    if (request.status !== AccessRequestStatus.PENDING) {
      throw new ConflictException('Esta solicitação já foi analisada.');
    }
    return request;
  }

  private async requireDefaultTenantId(): Promise<string> {
    const tenant =
      await this.accessRepository.findActiveTenantBySlug(DEFAULT_TENANT_SLUG);
    if (!tenant) {
      throw new InternalServerErrorException(
        'Default tenant is not configured',
      );
    }
    return tenant.id;
  }

  private toRequestView(row: AccessRequest): AccessRequestView {
    return {
      id: row.id,
      whatsapp: row.whatsapp,
      name: row.name,
      lgndNumber: row.lgndNumber,
      manada: row.manada,
      email: row.email,
      justification: row.justification,
      status: row.status,
      createdAt: row.createdAt,
      reviewedAt: row.reviewedAt,
    };
  }
}
