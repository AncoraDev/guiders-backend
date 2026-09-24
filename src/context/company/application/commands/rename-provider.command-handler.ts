import { Inject, Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Result, err, ok } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import {
  PROVIDER_REPOSITORY,
  ProviderRepository,
} from '../../domain/provider.repository';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import { InvalidCompanyDataError } from '../errors/company-platform.errors';
import {
  ProviderDemoAdminEmailTakenError,
  ProviderNotFoundError,
} from '../errors/provider.errors';
import { demoAdminCredentialError } from '../providers/provider-demo-admin';
import { UpdateCompanyCommand } from './update-company.command';
import { UpdateCompanyCommandHandler } from './update-company-command.handler';

export class RenameProviderCommand {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly demoAdminEmail: string,
    public readonly demoAdminPassword: string,
  ) {}
}

export interface RenameProviderResult {
  id: string;
  name: string;
  demoAdminEmail: string;
}

@Injectable()
@CommandHandler(RenameProviderCommand)
export class RenameProviderCommandHandler
  implements ICommandHandler<RenameProviderCommand>
{
  constructor(
    @Inject(PROVIDER_REPOSITORY)
    private readonly providers: ProviderRepository,
    @Inject(COMPANY_REPOSITORY)
    private readonly companies: CompanyRepository,
    private readonly updateCompany: UpdateCompanyCommandHandler,
  ) {}

  async execute(
    command: RenameProviderCommand,
  ): Promise<Result<RenameProviderResult, DomainError>> {
    if (!Uuid.validate(command.id)) {
      return err(new InvalidCompanyDataError('ID de proveedor no válido'));
    }

    const name = command.name.trim();
    if (!name) {
      return err(
        new InvalidCompanyDataError('El nombre del proveedor es obligatorio'),
      );
    }

    const emailError = demoAdminCredentialError(
      command.demoAdminEmail,
      'xxxxxxxx',
    );
    if (emailError) return err(new InvalidCompanyDataError(emailError));
    if (command.demoAdminPassword) {
      const passwordError = demoAdminCredentialError(
        command.demoAdminEmail,
        command.demoAdminPassword,
      );
      if (passwordError) return err(new InvalidCompanyDataError(passwordError));
    }

    const provider = await this.providers.findById(command.id);
    if (!provider) return err(new ProviderNotFoundError());

    const demoAdminEmail = command.demoAdminEmail.trim().toLowerCase();
    const taken = await this.providers.findByDemoAdminEmail(demoAdminEmail);
    if (taken && taken.id !== provider.id) {
      return err(new ProviderDemoAdminEmailTakenError());
    }

    const found = await this.companies.findById(new Uuid(provider.companyId));
    if (found.isErr()) return err(found.error);

    const sites = found
      .unwrap()
      .toPrimitives()
      .sites.map((site) => ({
        id: site.id,
        name: site.name,
        canonicalDomain: site.canonicalDomain,
        domainAliases: site.domainAliases,
      }));

    const updated = await this.updateCompany.execute(
      new UpdateCompanyCommand(provider.companyId, name, sites),
    );
    if (updated.isErr()) return err(updated.error);

    await this.providers.updateAccess(provider.id, {
      demoAdminEmail,
      ...(command.demoAdminPassword
        ? { demoAdminPassword: command.demoAdminPassword }
        : {}),
    });

    return ok({ id: provider.id, name, demoAdminEmail });
  }
}
