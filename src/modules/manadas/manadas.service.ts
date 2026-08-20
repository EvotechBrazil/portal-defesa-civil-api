import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Manada } from '@prisma/client';
import { ListManadasDto } from './dtos/list-manadas.dto';
import {
  isPrismaUniqueConstraint,
  ManadasRepository,
} from './manadas.repository';
import {
  CreateManadaInput,
  ManadaListResult,
  ManadaView,
} from './manadas.types';

const DEFAULT_TENANT_SLUG = 'default';

export function normalizeCountry(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeRegionPart(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeState(value: string): string {
  const trimmed = normalizeRegionPart(value);
  return trimmed.length <= 3 ? trimmed.toUpperCase() : trimmed;
}

export function regionKey(value: string): string {
  return normalizeRegionPart(value).toLocaleLowerCase('pt-BR');
}

@Injectable()
export class ManadasService {
  constructor(private readonly manadasRepository: ManadasRepository) {}

  async listPublic(query: ListManadasDto): Promise<ManadaListResult> {
    const tenantId = await this.requireDefaultTenantId();
    return this.list(tenantId, query);
  }

  async createPublic(dto: CreateManadaInput): Promise<ManadaView> {
    const tenantId = await this.requireDefaultTenantId();
    return this.toView(await this.findOrCreate(tenantId, dto));
  }

  async list(
    tenantId: string,
    query: ListManadasDto,
  ): Promise<ManadaListResult> {
    const rows = await this.manadasRepository.listActive(
      tenantId,
      query.q?.trim() || undefined,
    );
    const country = query.country ? normalizeCountry(query.country) : '';
    const state = query.state ? regionKey(query.state) : '';
    const city = query.city ? regionKey(query.city) : '';

    const automatic: ManadaView[] = [];
    const others: ManadaView[] = [];

    for (const row of rows) {
      const view = this.toView(row);
      if (this.matchesRegion(row, country, state, city)) {
        automatic.push(view);
      } else {
        others.push(view);
      }
    }

    automatic.sort((a, b) => this.compareAutomatic(a, b, city));
    return { automatic, others };
  }

  async getById(tenantId: string, id: string): Promise<Manada> {
    const found = await this.manadasRepository.findActiveById(tenantId, id);
    if (!found) {
      throw new NotFoundException('Manada não encontrada.');
    }
    return found;
  }

  async findOrCreate(
    tenantId: string,
    input: CreateManadaInput,
  ): Promise<Manada> {
    const data = {
      name: normalizeRegionPart(input.name),
      country: normalizeCountry(input.country),
      state: normalizeState(input.state),
      city: normalizeRegionPart(input.city),
    };

    const existing = await this.manadasRepository.findByLocation(
      tenantId,
      data,
    );
    if (existing) {
      if (existing.deletedAt) {
        return this.manadasRepository.restore(existing.id);
      }
      return existing;
    }

    try {
      return await this.manadasRepository.create({ tenantId, ...data });
    } catch (error: unknown) {
      if (isPrismaUniqueConstraint(error)) {
        const raced = await this.manadasRepository.findByLocation(
          tenantId,
          data,
        );
        if (raced) {
          return raced.deletedAt
            ? this.manadasRepository.restore(raced.id)
            : raced;
        }
      }
      throw error;
    }
  }

  private matchesRegion(
    row: Manada,
    country: string,
    state: string,
    city: string,
  ): boolean {
    if (!country || normalizeCountry(row.country) !== country) {
      return false;
    }
    if (state && regionKey(row.state) === state) {
      return true;
    }
    return Boolean(city && regionKey(row.city) === city);
  }

  private compareAutomatic(a: ManadaView, b: ManadaView, city: string): number {
    if (city) {
      const aCity = regionKey(a.city) === city;
      const bCity = regionKey(b.city) === city;
      if (aCity !== bCity) {
        return aCity ? -1 : 1;
      }
    }
    return a.name.localeCompare(b.name, 'pt-BR');
  }

  private toView(row: Manada): ManadaView {
    return {
      id: row.id,
      name: row.name,
      country: row.country,
      state: row.state,
      city: row.city,
    };
  }

  private async requireDefaultTenantId(): Promise<string> {
    const tenant =
      await this.manadasRepository.findActiveTenantBySlug(DEFAULT_TENANT_SLUG);
    if (!tenant) {
      throw new InternalServerErrorException(
        'Default tenant is not configured',
      );
    }
    return tenant.id;
  }
}
