import { Test, TestingModule } from '@nestjs/testing';
import { CreateCompanyWithAdminCommandHandler } from './create-company-with-admin-command.handler';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import { CreateCompanyWithAdminCommand } from './create-company-with-admin.command';
import { CommandBus, EventPublisher } from '@nestjs/cqrs';
import { ok, err, okVoid } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { CompanyUserEmailExistsError } from 'src/context/auth/auth-user/application/errors/company-user.errors';

describe('CreateCompanyWithAdminCommandHandler', () => {
  let handler: CreateCompanyWithAdminCommandHandler;
  let repository: jest.Mocked<Pick<CompanyRepository, 'save'>>;
  let publisher: { mergeObjectContext: jest.Mock };
  let commandBus: { execute: jest.Mock };

  beforeEach(async () => {
    repository = { save: jest.fn().mockResolvedValue(okVoid()) };
    publisher = {
      mergeObjectContext: jest.fn((agg) => {
        agg.commit = jest.fn();
        return agg;
      }),
    };
    commandBus = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: COMPANY_REPOSITORY, useValue: repository },
        { provide: EventPublisher, useValue: publisher },
        { provide: CommandBus, useValue: commandBus },
        CreateCompanyWithAdminCommandHandler,
      ],
    }).compile();

    handler = module.get(CreateCompanyWithAdminCommandHandler);
  });

  it('debe crear la compañía y el admin vía Keycloak (CreateCompanyUser)', async () => {
    const adminUserId = Uuid.random().value;
    commandBus.execute.mockResolvedValue(ok({ userId: adminUserId }));

    const props = {
      companyName: 'GuiderTest',
      sites: [
        {
          id: Uuid.random().value,
          name: 'Principal',
          canonicalDomain: 'guiders.com',
          domainAliases: [],
        },
      ],
      adminName: 'Admin User',
      adminEmail: 'admin@guiders.com',
      adminTel: '123456789',
      adminPassword: 'TempPassw0rd!',
    };

    const result = await handler.execute(
      new CreateCompanyWithAdminCommand(props),
    );

    expect(result.isOk()).toBe(true);
    expect(repository.save).toHaveBeenCalled();
    expect(publisher.mergeObjectContext).toHaveBeenCalled();
    expect(commandBus.execute).toHaveBeenCalled();
    const unwrapped = result.unwrap();
    expect(unwrapped.adminUserId).toBe(adminUserId);
    expect(unwrapped.companyId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('debe fallar si el email del admin ya existe', async () => {
    commandBus.execute.mockResolvedValue(
      err(new CompanyUserEmailExistsError('admin@guiders.com')),
    );

    const result = await handler.execute(
      new CreateCompanyWithAdminCommand({
        companyName: 'GuiderTest',
        sites: [
          {
            name: 'Principal',
            canonicalDomain: 'guiders.com',
            domainAliases: [],
          },
        ],
        adminName: 'Admin User',
        adminEmail: 'admin@guiders.com',
        adminPassword: 'TempPassw0rd!',
      }),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('admin@guiders.com');
    }
  });

  it('debe rechazar si falta el email del admin', async () => {
    const result = await handler.execute(
      new CreateCompanyWithAdminCommand({
        companyName: 'GuiderTest',
        sites: [
          {
            name: 'Principal',
            canonicalDomain: 'guiders.com',
            domainAliases: [],
          },
        ],
        adminName: 'Admin User',
        adminEmail: '   ',
        adminPassword: 'TempPassw0rd!',
      }),
    );

    expect(result.isErr()).toBe(true);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });
});
