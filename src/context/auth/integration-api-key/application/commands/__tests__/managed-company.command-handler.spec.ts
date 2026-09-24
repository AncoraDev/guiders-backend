import { CommandBus } from '@nestjs/cqrs';
import { ok, okVoid } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { CreateManagedCompanyCommandHandler } from '../create-managed-company.command-handler';
import { CreateManagedCompanyCommand } from '../create-managed-company.command';
import { UpdateManagedCompanyCommandHandler } from '../update-managed-company.command-handler';
import { UpdateManagedCompanyCommand } from '../update-managed-company.command';
import { RemoveManagedCompanyCommandHandler } from '../remove-managed-company.command-handler';
import { RemoveManagedCompanyCommand } from '../remove-managed-company.command';
import { ProviderCompanyLinkRepository } from '../../../domain/repository/provider-company-link.repository';
import { UserAccountRepository } from 'src/context/auth/auth-user/domain/user-account.repository';
import { KeycloakAdminService } from 'src/context/auth/auth-user/infrastructure/services/keycloak-admin.service';
import { ExternalCommercialLinkRepository } from '../../../domain/repository/external-commercial-link.repository';
import { IntegrationApiKeyRepository } from '../../../domain/repository/integration-api-key.repository';
import { ManagedCompanyError } from '../../../domain/errors/managed-company.errors';
import { ManagedCompanyAccess } from '../../services/managed-company-access';

describe('Clientes gestionados por la clave de integración', () => {
  const providerCompanyId = Uuid.random().value;
  const childCompanyId = Uuid.random().value;
  let links: jest.Mocked<ProviderCompanyLinkRepository>;
  let commandBus: jest.Mocked<Pick<CommandBus, 'execute'>>;

  beforeEach(() => {
    links = {
      save: jest.fn().mockResolvedValue(undefined),
      findByChild: jest.fn().mockResolvedValue(null),
      deleteByChild: jest.fn().mockResolvedValue(undefined),
      deleteByProvider: jest.fn().mockResolvedValue(undefined),
      countByProvider: jest.fn().mockResolvedValue(0),
      findAll: jest.fn().mockResolvedValue([]),
    };
    commandBus = { execute: jest.fn() };
  });

  it('debe crear la empresa y guardar el vínculo con la clave', async () => {
    commandBus.execute.mockResolvedValue(
      ok({ companyId: childCompanyId, adminUserId: Uuid.random().value }),
    );
    const handler = new CreateManagedCompanyCommandHandler(
      commandBus as unknown as CommandBus,
      links,
    );

    const result = await handler.execute(
      new CreateManagedCompanyCommand(providerCompanyId, {
        companyName: 'Rmotion',
        sites: [
          {
            name: 'Web',
            canonicalDomain: 'rmotion.example',
            domainAliases: [],
          },
        ],
        adminFirstName: 'Ana',
        adminLastName: 'García',
        adminEmail: 'ana@rmotion.example',
        adminPassword: 'temporal1',
      }),
    );

    expect(result.isOk()).toBe(true);
    expect(links.save).toHaveBeenCalledWith(providerCompanyId, childCompanyId);
  });

  it('debe rechazar el cambio si la empresa no es de esta clave', async () => {
    const handler = new UpdateManagedCompanyCommandHandler(
      commandBus as unknown as CommandBus,
      links,
    );

    const result = await handler.execute(
      new UpdateManagedCompanyCommand(
        providerCompanyId,
        childCompanyId,
        'Otro',
        [{ name: 'Web', canonicalDomain: 'otro.example', domainAliases: [] }],
      ),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ManagedCompanyError);
      expect((result.error as ManagedCompanyError).code).toBe(
        'MANAGED_COMPANY_NOT_FOUND',
      );
    }
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('debe borrar cuentas, vínculos y la empresa hija', async () => {
    links.findByChild.mockResolvedValue({
      id: Uuid.random().value,
      providerCompanyId,
      childCompanyId,
    });
    const userId = Uuid.random().value;
    const users = {
      findByCompanyId: jest.fn().mockResolvedValue([
        {
          id: { getValue: () => userId },
          keycloakId: { isPresent: () => false },
        },
      ]),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const commercialLinks = {
      deleteByCompanyId: jest.fn().mockResolvedValue(undefined),
    };
    const integrationKeys = {
      deleteByCompanyId: jest.fn().mockResolvedValue(undefined),
    };
    commandBus.execute.mockResolvedValue(okVoid());
    const handler = new RemoveManagedCompanyCommandHandler(
      commandBus as unknown as CommandBus,
      links,
      users as unknown as UserAccountRepository,
      { deleteUser: jest.fn() } as unknown as KeycloakAdminService,
      commercialLinks as unknown as ExternalCommercialLinkRepository,
      integrationKeys as unknown as IntegrationApiKeyRepository,
    );

    const result = await handler.execute(
      new RemoveManagedCompanyCommand(providerCompanyId, childCompanyId),
    );

    expect(result.isOk()).toBe(true);
    expect(users.delete).toHaveBeenCalledWith(userId);
    expect(commercialLinks.deleteByCompanyId).toHaveBeenCalledWith(
      childCompanyId,
    );
    expect(integrationKeys.deleteByCompanyId).toHaveBeenCalledWith(
      childCompanyId,
    );
    expect(links.deleteByChild).toHaveBeenCalledWith(childCompanyId);
    expect(commandBus.execute).toHaveBeenCalled();
  });

  it('debe permitir la empresa de la clave y una hija suya', async () => {
    links.findByChild.mockImplementation(async (companyId: string) =>
      companyId === childCompanyId
        ? {
            id: Uuid.random().value,
            providerCompanyId,
            childCompanyId,
          }
        : null,
    );
    const access = new ManagedCompanyAccess(links);

    await expect(
      access.allows(providerCompanyId, providerCompanyId),
    ).resolves.toBe(true);
    await expect(
      access.allows(providerCompanyId, childCompanyId),
    ).resolves.toBe(true);
    await expect(
      access.allows(providerCompanyId, Uuid.random().value),
    ).resolves.toBe(false);
  });
});
