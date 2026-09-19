import { Test } from '@nestjs/testing';
import { UpdateLeadFollowUpCommandHandler } from '../update-lead-follow-up.command-handler';
import { UpdateLeadFollowUpCommand } from '../update-lead-follow-up.command';
import {
  ILeadContactDataRepository,
  LEAD_CONTACT_DATA_REPOSITORY,
} from '../../../domain/lead-contact-data.repository';
import { ok, okVoid, err } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { LeadContactDataNotFoundError } from '../../../domain/errors/leads.error';
import { LeadsPersistenceError } from '../../../domain/errors/leads.error';

describe('UpdateLeadFollowUpCommandHandler', () => {
  let handler: UpdateLeadFollowUpCommandHandler;
  let repository: jest.Mocked<ILeadContactDataRepository>;

  const companyId = Uuid.random().value;
  const visitorId = Uuid.random().value;
  const commercialId = Uuid.random().value;

  const existing = {
    id: Uuid.random().value,
    visitorId,
    companyId,
    nombre: 'Ana',
    extractedAt: new Date(),
    followUpStatus: 'pending' as const,
  };

  beforeEach(async () => {
    repository = {
      save: jest.fn(),
      findByVisitorId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findByEmail: jest.fn(),
      exists: jest.fn(),
      findByChatId: jest.fn(),
      findById: jest.fn(),
      findByCompanyId: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        UpdateLeadFollowUpCommandHandler,
        { provide: LEAD_CONTACT_DATA_REPOSITORY, useValue: repository },
      ],
    }).compile();

    handler = module.get(UpdateLeadFollowUpCommandHandler);
  });

  it('debe marcar el lead como contactado', async () => {
    repository.findByVisitorId.mockResolvedValue(ok(existing));
    repository.update.mockResolvedValue(okVoid());

    const result = await handler.execute(
      new UpdateLeadFollowUpCommand({
        visitorId,
        companyId,
        commercialId,
        status: 'contacted',
      }),
    );

    expect(result.isOk()).toBe(true);
    const saved = result.unwrap();
    expect(saved.followUpStatus).toBe('contacted');
    expect(saved.followUpBy).toBe(commercialId);
    expect(saved.followUpAt).toBeInstanceOf(Date);
    expect(repository.update).toHaveBeenCalled();
  });

  it('debe fallar si no hay ficha', async () => {
    repository.findByVisitorId.mockResolvedValue(ok(null));

    const result = await handler.execute(
      new UpdateLeadFollowUpCommand({
        visitorId,
        companyId,
        commercialId,
        status: 'dismissed',
      }),
    );

    expect(result.isErr()).toBe(true);
    expect((result as { error?: unknown }).error).toBeInstanceOf(
      LeadContactDataNotFoundError,
    );
  });

  it('propaga un error de persistencia', async () => {
    repository.findByVisitorId.mockResolvedValue(
      err(new LeadsPersistenceError('down')),
    );

    const result = await handler.execute(
      new UpdateLeadFollowUpCommand({
        visitorId,
        companyId,
        commercialId,
        status: 'contacted',
      }),
    );

    expect(result.isErr()).toBe(true);
  });
});
