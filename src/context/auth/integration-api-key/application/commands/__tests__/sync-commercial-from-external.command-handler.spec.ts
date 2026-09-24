import { SyncCommercialFromExternalCommandHandler } from '../sync-commercial-from-external.command-handler';
import { SyncCommercialFromExternalCommand } from '../sync-commercial-from-external.command';
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

describe('SyncCommercialFromExternalCommandHandler', () => {
  const companyId = Uuid.random().value;
  const otherCompanyId = Uuid.random().value;
  let users: jest.Mocked<UserAccountRepository>;
  let links: jest.Mocked<ExternalCommercialLinkRepository>;
  let handler: SyncCommercialFromExternalCommandHandler;

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
      findByEmail: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue(null),
      findByKeycloakId: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      findByCompanyId: jest.fn(),
      findAll: jest.fn(),
      delete: jest.fn(),
    };
    links = {
      findByExternalUserId: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
      deleteByExternalUserId: jest.fn(),
      deleteByCompanyId: jest.fn(),
    };
    handler = new SyncCommercialFromExternalCommandHandler(users, links, {
      mergeObjectContext: (user: UserAccount) => user,
    } as never);
  });

  it('debe crear el usuario de Guiders sin Keycloak y devolver su UUID', async () => {
    const result = await handler.execute(
      new SyncCommercialFromExternalCommand(
        companyId,
        'lc-42',
        'ana@concesionario.es',
        'Ana',
        'García',
      ),
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.unwrap().created).toBe(true);
      expect(result.unwrap().active).toBe(true);
      expect(result.unwrap().externalUserId).toBe('lc-42');
      expect(result.unwrap().userId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    }
    expect(users.save).toHaveBeenCalled();
    expect(links.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        externalUserId: 'lc-42',
        provider: 'leadcars',
      }),
    );
    const saved = users.save.mock.calls[0][0];
    expect(saved.keycloakId.isEmpty()).toBe(true);
    expect(saved.roles.toPrimitives()).toContain('commercial');
  });

  it('debe rechazar el email si ya pertenece a otra empresa', async () => {
    users.findByEmail.mockResolvedValue(userIn(otherCompanyId));

    const result = await handler.execute(
      new SyncCommercialFromExternalCommand(
        companyId,
        'lc-42',
        'ana@concesionario.es',
        'Ana',
      ),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ExternalCommercialSyncError);
      expect((result.error as ExternalCommercialSyncError).code).toBe(
        'EXTERNAL_USER_EMAIL_TAKEN',
      );
    }
    expect(users.save).not.toHaveBeenCalled();
  });

  it('debe dar de baja una cuenta ya vinculada cuando active es false', async () => {
    const existing = userIn(companyId);
    links.findByExternalUserId.mockResolvedValue({
      id: Uuid.random().value,
      companyId,
      externalUserId: 'lc-42',
      userAccountId: existing.id.value,
      provider: 'leadcars',
    });
    users.findById.mockResolvedValue(existing);

    const result = await handler.execute(
      new SyncCommercialFromExternalCommand(
        companyId,
        'lc-42',
        'ana@concesionario.es',
        'Ana',
        'García',
        ['commercial'],
        false,
      ),
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.unwrap().created).toBe(false);
      expect(result.unwrap().active).toBe(false);
      expect(result.unwrap().userId).toBe(existing.id.value);
    }
    expect(links.save).not.toHaveBeenCalled();
  });
});
