import { Injectable } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { Result, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { CreateCompanyWithAdminCommand } from 'src/context/company/application/commands/create-company-with-admin.command';
import { CreateCompanyWithAdminResult } from 'src/context/company/application/commands/create-company-with-admin-command.handler';
import {
  PROVIDER_COMPANY_LINK_REPOSITORY,
  ProviderCompanyLinkRepository,
} from '../../domain/repository/provider-company-link.repository';
import { CreateManagedCompanyCommand } from './create-managed-company.command';

@Injectable()
@CommandHandler(CreateManagedCompanyCommand)
export class CreateManagedCompanyCommandHandler
  implements ICommandHandler<CreateManagedCompanyCommand>
{
  constructor(
    private readonly commandBus: CommandBus,
    @Inject(PROVIDER_COMPANY_LINK_REPOSITORY)
    private readonly links: ProviderCompanyLinkRepository,
  ) {}

  async execute(
    command: CreateManagedCompanyCommand,
  ): Promise<Result<CreateCompanyWithAdminResult, DomainError>> {
    const created = await this.commandBus.execute<
      CreateCompanyWithAdminCommand,
      Result<CreateCompanyWithAdminResult, DomainError>
    >(new CreateCompanyWithAdminCommand(command.props));
    if (created.isErr()) return err(created.error);

    const value = created.unwrap();
    await this.links.save(command.providerCompanyId, value.companyId);
    return created;
  }
}
