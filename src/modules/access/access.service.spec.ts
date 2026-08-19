import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AccessRequestStatus } from '@prisma/client';
import { AccessRepository } from './access.repository';
import { AccessService } from './access.service';

describe('AccessService', () => {
  const tenant = { id: 'tenant-default', slug: 'default' };
  let repository: {
    findActiveTenantBySlug: jest.Mock;
    findUserByWhatsapp: jest.Mock;
    findAllowed: jest.Mock;
    findRequest: jest.Mock;
    upsertInterested: jest.Mock;
    submitRequest: jest.Mock;
  };
  let service: AccessService;

  beforeEach(() => {
    repository = {
      findActiveTenantBySlug: jest.fn().mockResolvedValue(tenant),
      findUserByWhatsapp: jest.fn().mockResolvedValue(null),
      findAllowed: jest.fn().mockResolvedValue(null),
      findRequest: jest.fn().mockResolvedValue(null),
      upsertInterested: jest.fn(),
      submitRequest: jest.fn(),
    };
    service = new AccessService(repository as unknown as AccessRepository);
  });

  it('captures an unknown number as interested and returns NOT_ALLOWED', async () => {
    const result = await service.checkWhatsapp({ whatsapp: '(43) 98888-7777' });

    expect(result).toEqual({
      status: 'NOT_ALLOWED',
      whatsapp: '5543988887777',
    });
    expect(repository.upsertInterested).toHaveBeenCalledWith(
      tenant.id,
      '5543988887777',
    );
  });

  it('returns ALLOWED when the number is pre-released', async () => {
    repository.findAllowed.mockResolvedValue({ id: 'allow-1' });

    const result = await service.checkWhatsapp({ whatsapp: '43988887777' });

    expect(result.status).toBe('ALLOWED');
    expect(repository.upsertInterested).not.toHaveBeenCalled();
  });

  it('blocks register when the number is not on the list', async () => {
    await expect(
      service.assertCanRegister(tenant.id, '5543988887777'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a second pending request for the same number', async () => {
    repository.findRequest.mockResolvedValue({
      status: AccessRequestStatus.PENDING,
    });

    await expect(
      service.requestAccess({
        whatsapp: '43988887777',
        name: 'Ana Silva',
        lgndNumber: '1001',
        manada: 'Norte',
        email: 'ana@example.com',
        justification: 'Quero estudar para a prova da brigada.',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.submitRequest).not.toHaveBeenCalled();
  });
});
