import { Test, TestingModule } from '@nestjs/testing';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { ok } from 'src/context/shared/domain/result';
import { USER_ACCOUNT_REPOSITORY } from '../../../domain/user-account.repository';
import { UserAccount } from '../../../domain/user-account.aggregate';
import { UserAccountId } from '../../../domain/user-account-id';
import { UserAccountEmail } from '../../../domain/user-account-email';
import { UserAccountName } from '../../../domain/value-objects/user-account-name';
import { UserAccountPassword } from '../../../domain/user-account-password';
import { UserAccountCompanyId } from '../../../domain/value-objects/user-account-company-id';
import { UserAccountRoles } from '../../../domain/value-objects/user-account-roles';
import { UserAccountKeycloakId } from '../../../domain/value-objects/user-account-keycloak-id';
import { KeycloakAdminService } from '../../../infrastructure/services/keycloak-admin.service';
import { CompanyUserEmailExistsError } from '../../errors/company-user.errors';
import { UpdateCompanyUserCommand } from '../update-company-user.command';
import { UpdateCompanyUserCommandHandler } from '../update-company-user-command.handler';

describe('UpdateCompanyUserCommandHandler', () => {
  const companyId = Uuid.random().value;
  const userId = Uuid.random().value;
  const keycloakId = Uuid.random().value;
  const email = 'nuevo@demo.com';

  let handler: UpdateCompanyUserCommandHandler;
  let users: { findById: jest.Mock; findByEmail: jest.Mock; save: jest.Mock };
  let keycloak: {
    findByEmail: jest.Mock;
    findByUsername: jest.Mock;
    updateUserProfile: jest.Mock;
  };

  function buildUser(currentEmail: string): UserAccount {
    return UserAccount.create({
      id: new UserAccountId(userId),
      email: UserAccountEmail.create(currentEmail),
      name: new UserAccountName('Admin Demo'),
      password: UserAccountPassword.empty(),
      companyId: UserAccountCompanyId.create(companyId),
      roles: UserAccountRoles.fromPrimitives(['admin']),
      keycloakId: UserAccountKeycloakId.fromString(keycloakId),
    });
  }

  beforeEach(async () => {
    users = {
      findById: jest.fn().mockResolvedValue(buildUser(email)),
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };
    keycloak = {
      findByEmail: jest.fn().mockResolvedValue(ok(null)),
      findByUsername: jest.fn().mockResolvedValue(ok(null)),
      updateUserProfile: jest.fn().mockResolvedValue(ok(undefined)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateCompanyUserCommandHandler,
        { provide: USER_ACCOUNT_REPOSITORY, useValue: users },
        { provide: KeycloakAdminService, useValue: keycloak },
      ],
    }).compile();

    handler = module.get(UpdateCompanyUserCommandHandler);
  });

  it('al guardar de nuevo envía el email de Guiders para alinear el username', async () => {
    const result = await handler.execute(
      new UpdateCompanyUserCommand(
        companyId,
        userId,
        'Admin Demo',
        undefined,
        email,
      ),
    );

    expect(result.isOk()).toBe(true);
    expect(keycloak.updateUserProfile).toHaveBeenCalledWith(keycloakId, {
      email,
      name: 'Admin Demo',
    });
    expect(users.save).toHaveBeenCalled();
  });

  it('rechaza el email si otro usuario de Keycloak lo tiene como username', async () => {
    users.findById.mockResolvedValue(buildUser('viejo@demo.com'));
    keycloak.findByUsername.mockResolvedValue(
      ok({ id: Uuid.random().value, username: 'admin@rmotion.com' }),
    );

    const result = await handler.execute(
      new UpdateCompanyUserCommand(
        companyId,
        userId,
        undefined,
        undefined,
        'admin@rmotion.com',
      ),
    );

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error).toBeInstanceOf(
      CompanyUserEmailExistsError,
    );
    expect(result.isErr() && result.error.message).toContain(
      'admin@rmotion.com',
    );
    expect(keycloak.updateUserProfile).not.toHaveBeenCalled();
    expect(users.save).not.toHaveBeenCalled();
  });
});
