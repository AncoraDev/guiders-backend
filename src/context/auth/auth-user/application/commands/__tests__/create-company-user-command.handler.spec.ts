import { Test, TestingModule } from '@nestjs/testing';
import { EventPublisher } from '@nestjs/cqrs';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { ok, err } from 'src/context/shared/domain/result';
import { USER_ACCOUNT_REPOSITORY } from '../../../domain/user-account.repository';
import {
  KeycloakAdminService,
  KeycloakUserExistsError,
} from '../../../infrastructure/services/keycloak-admin.service';
import { CompanyUserEmailExistsError } from '../../errors/company-user.errors';
import { CreateCompanyUserCommand } from '../create-company-user.command';
import { CreateCompanyUserCommandHandler } from '../create-company-user-command.handler';

describe('CreateCompanyUserCommandHandler', () => {
  const companyId = Uuid.random().value;
  const email = 'admin@rmotion.com';

  let handler: CreateCompanyUserCommandHandler;
  let keycloak: {
    findByEmail: jest.Mock;
    findByUsername: jest.Mock;
    createUser: jest.Mock;
  };

  beforeEach(async () => {
    keycloak = {
      findByEmail: jest.fn().mockResolvedValue(ok(null)),
      findByUsername: jest.fn().mockResolvedValue(ok(null)),
      createUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateCompanyUserCommandHandler,
        {
          provide: USER_ACCOUNT_REPOSITORY,
          useValue: {
            findByEmail: jest.fn().mockResolvedValue(null),
            save: jest.fn(),
          },
        },
        { provide: KeycloakAdminService, useValue: keycloak },
        {
          provide: EventPublisher,
          useValue: { mergeObjectContext: jest.fn((user) => user) },
        },
      ],
    }).compile();

    handler = module.get(CreateCompanyUserCommandHandler);
  });

  function command(): CreateCompanyUserCommand {
    return new CreateCompanyUserCommand(
      companyId,
      'Ana',
      'Admin',
      email,
      ['admin'],
      'Admin123!',
    );
  }

  it('devuelve el email ocupado si Keycloak lo tiene como username', async () => {
    keycloak.findByUsername.mockResolvedValue(
      ok({ id: Uuid.random().value, username: email }),
    );

    const result = await handler.execute(command());

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error).toBeInstanceOf(
      CompanyUserEmailExistsError,
    );
    expect(result.isErr() && result.error.message).toContain(email);
    expect(keycloak.createUser).not.toHaveBeenCalled();
  });

  it('traduce el 409 de Keycloak al email ya existente', async () => {
    keycloak.createUser.mockResolvedValue(err(new KeycloakUserExistsError()));

    const result = await handler.execute(command());

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error).toBeInstanceOf(
      CompanyUserEmailExistsError,
    );
    expect(result.isErr() && result.error.message).toBe(
      `Ya existe un usuario con el email ${email}`,
    );
  });
});
