import { Inject, Injectable } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Result, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { UpdateCompanyCommand } from 'src/context/company/application/commands/update-company.command';
import {
  PROVIDER_COMPANY_LINK_REPOSITORY,
  ProviderCompanyLinkRepository,
} from '../../domain/repository/provider-company-link.repository';
import { ManagedCompanyError } from '../../domain/errors/managed-company.errors';
import { UpdateManagedCompanyCommand } from './update-managed-company.command';

@Injectable()
@CommandHandler(UpdateManagedCompanyCommand)
export class UpdateManagedCompanyCommandHandler
  implements ICommandHandler<UpdateManagedCompanyCommand>
{
  constructor(
    private readonly commandBus: CommandBus,
    @Inject(PROVIDER_COMPANY_LINK_REPOSITORY)
    private readonly links: ProviderCompanyLinkRepository,
  ) {}

  async execute(
    command: UpdateManagedCompanyCommand,
  ): Promise<Result<void, DomainError>> {
    const link = await this.links.findByChild(command.companyId);
    if (!link || link.providerCompanyId !== command.providerCompanyId) {
      return err(
        new ManagedCompanyError(
          'MANAGED_COMPANY_NOT_FOUND',
          'No hay un cliente vinculado con esa empresa',
        ),
      );
    }

    return this.commandBus.execute<
      UpdateCompanyCommand,
      Result<void, DomainError>
    >(
      new UpdateCompanyCommand(
        command.companyId,
        command.companyName,
        command.sites,
      ),
    );
  }
}
