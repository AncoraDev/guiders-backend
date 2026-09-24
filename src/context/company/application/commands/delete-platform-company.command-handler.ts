import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Result, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import {
  USER_ACCOUNT_REPOSITORY,
  UserAccountRepository,
} from 'src/context/auth/auth-user/domain/user-account.repository';
import { UserAccountCompanyId } from 'src/context/auth/auth-user/domain/value-objects/user-account-company-id';
import { KeycloakAdminService } from 'src/context/auth/auth-user/infrastructure/services/keycloak-admin.service';
import {
  API_KEY_REPOSITORY,
  ApiKeyRepository,
} from 'src/context/auth/api-key/domain/repository/api-key.repository';
import {
  EXTERNAL_COMMERCIAL_LINK_REPOSITORY,
  ExternalCommercialLinkRepository,
} from 'src/context/auth/integration-api-key/domain/repository/external-commercial-link.repository';
import {
  INTEGRATION_API_KEY_REPOSITORY,
  IntegrationApiKeyRepository,
} from 'src/context/auth/integration-api-key/domain/repository/integration-api-key.repository';
import {
  PROVIDER_COMPANY_LINK_REPOSITORY,
  ProviderCompanyLinkRepository,
} from 'src/context/auth/integration-api-key/domain/repository/provider-company-link.repository';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import { CompanyNotFoundError } from '../../domain/errors/company.error';
import { InvalidCompanyDataError } from '../errors/company-platform.errors';
import { DeletePlatformCompanyCommand } from './delete-platform-company.command';

/**
 * Borra un cliente desde Admin: cuentas (Keycloak incluido), claves,
 * vínculos y la empresa. No toca chats, mensajes ni leads.
 */
@Injectable()
@CommandHandler(DeletePlatformCompanyCommand)
export class DeletePlatformCompanyCommandHandler
  implements ICommandHandler<DeletePlatformCompanyCommand>
{
  private readonly logger = new Logger(
    DeletePlatformCompanyCommandHandler.name,
  );

  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companies: CompanyRepository,
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly users: UserAccountRepository,
    private readonly keycloakAdmin: KeycloakAdminService,
    @Inject(EXTERNAL_COMMERCIAL_LINK_REPOSITORY)
    private readonly commercialLinks: ExternalCommercialLinkRepository,
    @Inject(INTEGRATION_API_KEY_REPOSITORY)
    private readonly integrationKeys: IntegrationApiKeyRepository,
    @Inject(PROVIDER_COMPANY_LINK_REPOSITORY)
    private readonly providerLinks: ProviderCompanyLinkRepository,
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeys: ApiKeyRepository,
  ) {}

  async execute(
    command: DeletePlatformCompanyCommand,
  ): Promise<Result<void, DomainError>> {
    if (!Uuid.validate(command.companyId)) {
      return err(new InvalidCompanyDataError('ID de empresa no válido'));
    }

    const found = await this.companies.findById(new Uuid(command.companyId));
    if (found.isErr()) return err(new CompanyNotFoundError());

    const accounts = await this.users.findByCompanyId(
      new UserAccountCompanyId(command.companyId),
    );
    for (const account of accounts) {
      if (account.keycloakId.isPresent()) {
        const removed = await this.keycloakAdmin.deleteUser(
          account.keycloakId.get().value,
        );
        if (removed.isErr()) return err(removed.error);
      }
      await this.users.delete(account.id.getValue());
    }

    await this.commercialLinks.deleteByCompanyId(command.companyId);
    await this.integrationKeys.deleteByCompanyId(command.companyId);
    await this.providerLinks.deleteByChild(command.companyId);
    await this.providerLinks.deleteByProvider(command.companyId);
    await this.apiKeys.deleteByCompanyId(command.companyId);

    const deleted = await this.companies.delete(new Uuid(command.companyId));
    if (deleted.isErr()) {
      this.logger.error(
        `La empresa ${command.companyId} no se pudo borrar: ${deleted.error.message}`,
      );
      return err(deleted.error);
    }
    return deleted;
  }
}
