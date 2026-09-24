import { Inject, Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Result, err, ok } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { CreateIntegrationApiKeyCommand } from 'src/context/auth/integration-api-key/application/commands/create-integration-api-key.command';
import { CreateIntegrationApiKeyCommandHandler } from 'src/context/auth/integration-api-key/application/commands/create-integration-api-key.command-handler';
import { RevokeIntegrationApiKeyCommand } from 'src/context/auth/integration-api-key/application/commands/revoke-integration-api-key.command';
import { RevokeIntegrationApiKeyCommandHandler } from 'src/context/auth/integration-api-key/application/commands/revoke-integration-api-key.command-handler';
import {
  INTEGRATION_API_KEY_REPOSITORY,
  IntegrationApiKeyRepository,
} from 'src/context/auth/integration-api-key/domain/repository/integration-api-key.repository';
import { IntegrationApiKeyCompanyId } from 'src/context/auth/integration-api-key/domain/model/integration-api-key-company-id';
import {
  PROVIDER_REPOSITORY,
  ProviderRepository,
} from '../../domain/provider.repository';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import { InvalidCompanyDataError } from '../errors/company-platform.errors';
import { ProviderNotFoundError } from '../errors/provider.errors';

export class RegenerateProviderTokenCommand {
  constructor(public readonly id: string) {}
}

export interface RegenerateProviderTokenResult {
  token: string;
  tokenPrefix: string;
}

@Injectable()
@CommandHandler(RegenerateProviderTokenCommand)
export class RegenerateProviderTokenCommandHandler
  implements ICommandHandler<RegenerateProviderTokenCommand>
{
  constructor(
    @Inject(PROVIDER_REPOSITORY)
    private readonly providers: ProviderRepository,
    @Inject(COMPANY_REPOSITORY)
    private readonly companies: CompanyRepository,
    @Inject(INTEGRATION_API_KEY_REPOSITORY)
    private readonly integrationKeys: IntegrationApiKeyRepository,
    private readonly revokeKey: RevokeIntegrationApiKeyCommandHandler,
    private readonly createKey: CreateIntegrationApiKeyCommandHandler,
  ) {}

  async execute(
    command: RegenerateProviderTokenCommand,
  ): Promise<Result<RegenerateProviderTokenResult, DomainError>> {
    if (!Uuid.validate(command.id)) {
      return err(new InvalidCompanyDataError('ID de proveedor no válido'));
    }

    const provider = await this.providers.findById(command.id);
    if (!provider) return err(new ProviderNotFoundError());

    const found = await this.companies.findById(new Uuid(provider.companyId));
    if (found.isErr()) return err(found.error);
    const name = found.unwrap().getCompanyName().getValue();

    const keys = await this.integrationKeys.findByCompanyId(
      IntegrationApiKeyCompanyId.create(provider.companyId),
    );
    for (const key of keys) {
      if (!key.status.isActive()) continue;
      const revoked = await this.revokeKey.execute(
        new RevokeIntegrationApiKeyCommand(
          key.id.getValue(),
          provider.companyId,
        ),
      );
      if (revoked.isErr()) return err(revoked.error);
    }

    const created = await this.createKey.execute(
      new CreateIntegrationApiKeyCommand(
        provider.companyId,
        name.slice(0, 100),
        'live',
      ),
    );
    if (created.isErr()) return err(created.error);

    const issued = created.unwrap();
    await this.providers.updateAccess(provider.id, {
      accessToken: issued.plainToken,
    });

    return ok({
      token: issued.plainToken,
      tokenPrefix: issued.tokenPrefix,
    });
  }
}
