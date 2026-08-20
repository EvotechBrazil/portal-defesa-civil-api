import { NotFoundException } from '@nestjs/common';
import { Manada } from '@prisma/client';
import { ManadasRepository } from './manadas.repository';
import { ManadasService } from './manadas.service';

function manadaFixture(overrides?: Partial<Manada>): Manada {
  return {
    id: 'mnd-1',
    tenantId: 'tenant-default',
    name: 'Manada Norte',
    country: 'BR',
    state: 'PR',
    city: 'Arapongas',
    createdAt: new Date('2026-08-19'),
    updatedAt: new Date('2026-08-19'),
    deletedAt: null,
    ...overrides,
  };
}

describe('ManadasService', () => {
  const tenant = { id: 'tenant-default', slug: 'default' };
  let repository: {
    findActiveTenantBySlug: jest.Mock;
    findActiveById: jest.Mock;
    findByLocation: jest.Mock;
    listActive: jest.Mock;
    create: jest.Mock;
    restore: jest.Mock;
  };
  let service: ManadasService;

  beforeEach(() => {
    repository = {
      findActiveTenantBySlug: jest.fn().mockResolvedValue(tenant),
      findActiveById: jest.fn(),
      findByLocation: jest.fn(),
      listActive: jest.fn(),
      create: jest.fn(),
      restore: jest.fn(),
    };
    service = new ManadasService(repository as unknown as ManadasRepository);
  });

  it('groups manadas from the same state under automatic filter', async () => {
    repository.listActive.mockResolvedValue([
      manadaFixture(),
      manadaFixture({
        id: 'mnd-2',
        name: 'Manada Centro',
        city: 'Londrina',
      }),
      manadaFixture({
        id: 'mnd-3',
        name: 'Manada Capital',
        state: 'SP',
        city: 'São Paulo',
      }),
    ]);

    const result = await service.listPublic({
      country: 'BR',
      state: 'PR',
      city: 'Arapongas',
    });

    expect(result.automatic.map((item) => item.id)).toEqual(['mnd-1', 'mnd-2']);
    expect(result.others.map((item) => item.id)).toEqual(['mnd-3']);
  });

  it('puts same-city manadas first in the automatic group', async () => {
    repository.listActive.mockResolvedValue([
      manadaFixture({
        id: 'mnd-2',
        name: 'Manada Centro',
        city: 'Londrina',
      }),
      manadaFixture({ id: 'mnd-1' }),
    ]);

    const result = await service.listPublic({
      country: 'br',
      state: 'pr',
      city: 'Arapongas',
    });

    expect(result.automatic.map((item) => item.id)).toEqual(['mnd-1', 'mnd-2']);
  });

  it('creates a manada when the name and location are new', async () => {
    repository.findByLocation.mockResolvedValue(null);
    repository.create.mockResolvedValue(manadaFixture());

    const created = await service.createPublic({
      name: '  Manada Norte  ',
      country: 'br',
      state: 'pr',
      city: 'Arapongas',
    });

    expect(repository.create).toHaveBeenCalledWith({
      tenantId: tenant.id,
      name: 'Manada Norte',
      country: 'BR',
      state: 'PR',
      city: 'Arapongas',
    });
    expect(created.id).toBe('mnd-1');
  });

  it('returns the existing manada instead of duplicating it', async () => {
    repository.findByLocation.mockResolvedValue(manadaFixture());

    const found = await service.findOrCreate(tenant.id, {
      name: 'manada norte',
      country: 'BR',
      state: 'PR',
      city: 'Arapongas',
    });

    expect(found.id).toBe('mnd-1');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('throws when the manada id does not exist', async () => {
    repository.findActiveById.mockResolvedValue(null);

    await expect(service.getById(tenant.id, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
