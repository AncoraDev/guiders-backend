import { Test, TestingModule } from '@nestjs/testing';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { CompanySitesUpdatedEvent } from 'src/context/company/domain/events/company-sites-updated.event';
import { CreateApiKeyForDomainUseCase } from '../usecase/create-api-key-for-domain.usecase';
import { ApiKeyDomain } from '../../domain/model/api-key-domain';
import { ApiKeyCompanyId } from '../../domain/model/api-key-company-id';
import { CreateApiKeyOnCompanySitesUpdatedEventHandler } from './create-api-key-on-company-sites-updated-event.handler';

describe('CreateApiKeyOnCompanySitesUpdatedEventHandler', () => {
  let handler: CreateApiKeyOnCompanySitesUpdatedEventHandler;
  let useCase: CreateApiKeyForDomainUseCase;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateApiKeyOnCompanySitesUpdatedEventHandler,
        {
          provide: CreateApiKeyForDomainUseCase,
          useValue: { execute: jest.fn() },
        },
      ],
    }).compile();

    handler = module.get(CreateApiKeyOnCompanySitesUpdatedEventHandler);
    useCase = module.get(CreateApiKeyForDomainUseCase);
  });

  it('debe asegurar una API Key para el dominio canónico y cada alias', async () => {
    const companyId = Uuid.random().value;
    const event = new CompanySitesUpdatedEvent({
      id: companyId,
      companyName: 'Rmotion',
      sites: [
        {
          id: Uuid.random().value,
          name: 'Web',
          canonicalDomain: 'localhost',
          domainAliases: ['127.0.0.1'],
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const spy = jest
      .spyOn(useCase, 'execute')
      .mockResolvedValue({ apiKey: 'test-key' });

    await handler.handle(event);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][0]).toBeInstanceOf(ApiKeyDomain);
    expect(spy.mock.calls[0][0].getValue()).toBe('localhost');
    expect(spy.mock.calls[0][1]).toBeInstanceOf(ApiKeyCompanyId);
    expect(spy.mock.calls[0][1].getValue()).toBe(companyId);
    expect(spy.mock.calls[1][0].getValue()).toBe('127.0.0.1');
    expect(spy.mock.calls[1][1].getValue()).toBe(companyId);
  });

  it('no debe crear API Key si no hay sitios', async () => {
    const event = new CompanySitesUpdatedEvent({
      id: Uuid.random().value,
      companyName: 'Rmotion',
      sites: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const spy = jest.spyOn(useCase, 'execute');

    await handler.handle(event);

    expect(spy).not.toHaveBeenCalled();
  });
});
