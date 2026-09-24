import { Test, TestingModule } from '@nestjs/testing';
import { CommandBus, EventPublisher } from '@nestjs/cqrs';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { err, ok, okVoid } from 'src/context/shared/domain/result';
import { COMPANY_REPOSITORY } from '../../../domain/company.repository';
import { API_KEY_REPOSITORY } from 'src/context/auth/api-key/domain/repository/api-key.repository';
import { CompanyUserEmailExistsError } from 'src/context/auth/auth-user/application/errors/company-user.errors';
import { CreateCompanyWithAdminCommand } from '../create-company-with-admin.command';
import { CreateCompanyWithAdminCommandHandler } from '../create-company-with-admin-command.handler';

describe('CreateCompanyWithAdminCommandHandler', () => {
  let handler: CreateCompanyWithAdminCommandHandler;
  let companies: { save: jest.Mock; delete: jest.Mock };
  let apiKeys: { deleteByCompanyId: jest.Mock };
  let commit: jest.Mock;
  let commandBus: { execute: jest.Mock };

  beforeEach(async () => {
    commit = jest.fn();
    companies = {
      save: jest.fn().mockResolvedValue(okVoid()),
      delete: jest.fn().mockResolvedValue(okVoid()),
    };
    apiKeys = { deleteByCompanyId: jest.fn().mockResolvedValue(undefined) };
    commandBus = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateCompanyWithAdminCommandHandler,
        { provide: COMPANY_REPOSITORY, useValue: companies },
        { provide: API_KEY_REPOSITORY, useValue: apiKeys },
        {
          provide: EventPublisher,
          useValue: {
            mergeObjectContext: jest.fn((company: { commit: () => void }) => {
              company.commit = commit;
              return company;
            }),
          },
        },
        { provide: CommandBus, useValue: commandBus },
      ],
    }).compile();

    handler = module.get(CreateCompanyWithAdminCommandHandler);
  });

  function command(): CreateCompanyWithAdminCommand {
    return new CreateCompanyWithAdminCommand({
      companyName: 'Rmotion',
      sites: [
        {
          name: 'Web',
          canonicalDomain: 'rmotion.example',
          domainAliases: [],
        },
      ],
      adminFirstName: 'Ana',
      adminLastName: 'Admin',
      adminEmail: 'admin@rmotion.com',
      adminPassword: 'Admin123!',
    });
  }

  it('borra la empresa y las claves del widget si falla el admin', async () => {
    commandBus.execute.mockResolvedValue(
      err(new CompanyUserEmailExistsError('admin@rmotion.com')),
    );

    const result = await handler.execute(command());

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toContain(
      'admin@rmotion.com',
    );
    expect(apiKeys.deleteByCompanyId).toHaveBeenCalledTimes(1);
    expect(companies.delete).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });

  it('publica la empresa solo cuando el admin queda creado', async () => {
    commandBus.execute.mockResolvedValue(
      ok({ userId: Uuid.random().value }),
    );

    const result = await handler.execute(command());

    expect(result.isOk()).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(companies.delete).not.toHaveBeenCalled();
    expect(apiKeys.deleteByCompanyId).not.toHaveBeenCalled();
  });
});
