import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Result, err, okVoid } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import {
  USER_ACCOUNT_REPOSITORY,
  UserAccountRepository,
} from 'src/context/auth/auth-user/domain/user-account.repository';
import { UserAccountCompanyId } from 'src/context/auth/auth-user/domain/value-objects/user-account-company-id';
import { KeycloakAdminService } from 'src/context/auth/auth-user/infrastructure/services/keycloak-admin.service';
import { DeleteCompanyRecordCommand } from 'src/context/company/application/commands/delete-company-record.command';
import {
  EXTERNAL_COMMERCIAL_LINK_REPOSITORY,
  ExternalCommercialLinkRepository,
} from '../../domain/repository/external-commercial-link.repository';
import {
  INTEGRATION_API_KEY_REPOSITORY,
  IntegrationApiKeyRepository,
} from '../../domain/repository/integration-api-key.repository';
import {
  PROVIDER_COMPANY_LINK_REPOSITORY,
  ProviderCompanyLinkRepository,
} from '../../domain/repository/provider-company-link.repository';
import { ManagedCompanyError } from '../../domain/errors/managed-company.errors';
import { RemoveManagedCompanyCommand } from './remove-managed-company.command';

/**
 * Borra la empresa hija y sus cuentas. No toca chats, mensajes ni leads.
 */
@Injectable()
@CommandHandler(RemoveManagedCompanyCommand)
export class RemoveManagedCompanyCommandHandler
  implements ICommandHandler<RemoveManagedCompanyCommand>
{
  private readonly logger = new Logger(RemoveManagedCompanyCommandHandler.name);

  constructor(
    private readonly commandBus: CommandBus,
    @Inject(PROVIDER_COMPANY_LINK_REPOSITORY)
    private readonly companies: ProviderCompanyLinkRepository,
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly users: UserAccountRepository,
    private readonly keycloakAdmin: KeycloakAdminService,
    @Inject(EXTERNAL_COMMERCIAL_LINK_REPOSITORY)
    private readonly commercialLinks: ExternalCommercialLinkRepository,
    @Inject(INTEGRATION_API_KEY_REPOSITORY)
    private readonly integrationKeys: IntegrationApiKeyRepository,
  ) {}

  async execute(
    command: RemoveManagedCompanyCommand,
  ): Promise<Result<void, DomainError>> {
    const link = await this.companies.findByChild(command.companyId);
    if (!link || link.providerCompanyId !== command.providerCompanyId) {
      return err(
        new ManagedCompanyError(
          'MANAGED_COMPANY_NOT_FOUND',
          'No hay un cliente vinculado con esa empresa',
        ),
      );
    }

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
    await this.companies.deleteByChild(command.companyId);

    const deleted = await this.commandBus.execute<
      DeleteCompanyRecordCommand,
      Result<void, DomainError>
    >(new DeleteCompanyRecordCommand(command.companyId));
    if (deleted.isErr()) {
      this.logger.error(
        `La empresa ${command.companyId} no se pudo borrar: ${deleted.error.message}`,
      );
      return err(deleted.error);
    }
    return okVoid();
  }
}
