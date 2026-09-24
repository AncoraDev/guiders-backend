import { RemoveCommercialFromExternalCommandHandler } from '../remove-commercial-from-external.command-handler';
import { RemoveCommercialFromExternalCommand } from '../remove-commercial-from-external.command';
import { UserAccountRepository } from 'src/context/auth/auth-user/domain/user-account.repository';
import { ExternalCommercialLinkRepository } from '../../../domain/repository/external-commercial-link.repository';
import { UserAccount } from 'src/context/auth/auth-user/domain/user-account.aggregate';
import { UserAccountEmail } from 'src/context/auth/auth-user/domain/user-account-email';
import { UserAccountName } from 'src/context/auth/auth-user/domain/value-objects/user-account-name';
import { UserAccountPassword } from 'src/context/auth/auth-user/domain/user-account-password';
import { UserAccountCompanyId } from 'src/context/auth/auth-user/domain/value-objects/user-account-company-id';
import { UserAccountRoles } from 'src/context/auth/auth-user/domain/value-objects/user-account-roles';
import { Role } from 'src/context/auth/auth-user/domain/value-objects/role';
import { ExternalCommercialSyncError } from '../../../domain/errors/external-commercial-sync.errors';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

describe('RemoveCommercialFromExternalCommandHandler', () => {
  const companyId = Uuid.random().value;
  let users: jest.Mocked<UserAccountRepository>;
  let links: jest.Mocked<ExternalCommercialLinkRepository>;
  let handler: RemoveCommercialFromExternalCommandHandler;

  function userIn(targetCompanyId: string): UserAccount {
    return UserAccount.create({
      email: new UserAccountEmail('ana@concesionario.es'),
      name: new UserAccountName('Ana García'),
      password: UserAccountPassword.empty(),
      roles: UserAccountRoles.fromRoles([Role.commercial()]),
      companyId: new UserAccountCompanyId(targetCompanyId),
    });
  }

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findByKeycloakId: jest.fn(),
      save: jest.fn(),
      findByCompanyId: jest.fn(),
      findAll: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    links = {
      findByExternalUserId: jest.fn(),
      save: jest.fn(),
      deleteByExternalUserId: jest.fn().mockResolvedValue(undefined),
      deleteByCompanyId: jest.fn(),
    };
    handler = new RemoveCommercialFromExternalCommandHandler(users, links);
  });

  it('debe borrar la cuenta y el vínculo del comercial', async () => {
    const account = userIn(companyId);
    links.findByExternalUserId.mockResolvedValue({
      id: Uuid.random().value,
      companyId,
      externalUserId: 'lu_ana',
      userAccountId: account.id.getValue(),
      provider: 'leadcars',
    });
    users.findById.mockResolvedValue(account);

    const result = await handler.execute(
      new RemoveCommercialFromExternalCommand(companyId, 'lu_ana'),
    );

    expect(result.isOk()).toBe(true);
    expect(users.delete).toHaveBeenCalledWith(account.id.getValue());
    expect(links.deleteByExternalUserId).toHaveBeenCalledWith(
      companyId,
      'lu_ana',
      'leadcars',
    );
  });

  it('debe responder que no existe cuando no hay vínculo', async () => {
    links.findByExternalUserId.mockResolvedValue(null);

    const result = await handler.execute(
      new RemoveCommercialFromExternalCommand(companyId, 'lu_nadie'),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ExternalCommercialSyncError);
      expect((result.error as ExternalCommercialSyncError).code).toBe(
        'EXTERNAL_USER_NOT_FOUND',
      );
    }
    expect(users.delete).not.toHaveBeenCalled();
    expect(links.deleteByExternalUserId).not.toHaveBeenCalled();
  });

  it('debe borrar el vínculo si la cuenta de Guiders ya no está', async () => {
    links.findByExternalUserId.mockResolvedValue({
      id: Uuid.random().value,
      companyId,
      externalUserId: 'lu_huerfano',
      userAccountId: Uuid.random().value,
      provider: 'leadcars',
    });
    users.findById.mockResolvedValue(null);

    const result = await handler.execute(
      new RemoveCommercialFromExternalCommand(companyId, 'lu_huerfano'),
    );

    expect(result.isOk()).toBe(true);
    expect(users.delete).not.toHaveBeenCalled();
    expect(links.deleteByExternalUserId).toHaveBeenCalled();
  });
});
