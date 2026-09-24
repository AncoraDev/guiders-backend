import { Inject, Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Result, err, okVoid } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import {
  PROVIDER_COMPANY_LINK_REPOSITORY,
  ProviderCompanyLinkRepository,
} from 'src/context/auth/integration-api-key/domain/repository/provider-company-link.repository';
import {
  PROVIDER_REPOSITORY,
  ProviderRepository,
} from '../../domain/provider.repository';
import { InvalidCompanyDataError } from '../errors/company-platform.errors';
import {
  ProviderHasClientsError,
  ProviderNotFoundError,
} from '../errors/provider.errors';
import { DeletePlatformCompanyCommand } from './delete-platform-company.command';
import { DeletePlatformCompanyCommandHandler } from './delete-platform-company.command-handler';

export class DeleteProviderCommand {
  constructor(public readonly id: string) {}
}

@Injectable()
@CommandHandler(DeleteProviderCommand)
export class DeleteProviderCommandHandler
  implements ICommandHandler<DeleteProviderCommand>
{
  constructor(
    @Inject(PROVIDER_REPOSITORY)
    private readonly providers: ProviderRepository,
    @Inject(PROVIDER_COMPANY_LINK_REPOSITORY)
    private readonly links: ProviderCompanyLinkRepository,
    private readonly deleteCompany: DeletePlatformCompanyCommandHandler,
  ) {}

  async execute(
    command: DeleteProviderCommand,
  ): Promise<Result<void, DomainError>> {
    if (!Uuid.validate(command.id)) {
      return err(new InvalidCompanyDataError('ID de proveedor no válido'));
    }

    const provider = await this.providers.findById(command.id);
    if (!provider) return err(new ProviderNotFoundError());

    const clients = await this.links.countByProvider(provider.companyId);
    if (clients > 0) return err(new ProviderHasClientsError());

    const deleted = await this.deleteCompany.execute(
      new DeletePlatformCompanyCommand(provider.companyId),
    );
    if (deleted.isErr()) return deleted;

    await this.providers.delete(provider.id);
    return okVoid();
  }
}
