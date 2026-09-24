import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs';
import { Result, err, ok } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import {
  API_KEY_REPOSITORY,
  ApiKeyRepository,
} from 'src/context/auth/api-key/domain/repository/api-key.repository';
import { CreateIntegrationApiKeyCommand } from 'src/context/auth/integration-api-key/application/commands/create-integration-api-key.command';
import { CreateIntegrationApiKeyCommandHandler } from 'src/context/auth/integration-api-key/application/commands/create-integration-api-key.command-handler';
import {
  INTEGRATION_API_KEY_REPOSITORY,
  IntegrationApiKeyRepository,
} from 'src/context/auth/integration-api-key/domain/repository/integration-api-key.repository';
import { Company } from '../../domain/company.aggregate';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import {
  PROVIDER_REPOSITORY,
  ProviderRepository,
} from '../../domain/provider.repository';
import { CompanyName } from '../../domain/value-objects/company-name';
import { CompanySites } from '../../domain/value-objects/company-sites';
import { Site } from '../../domain/entities/site';
import { SiteId } from '../../domain/value-objects/site-id';
import { SiteName } from '../../domain/value-objects/site-name';
import { CanonicalDomain } from '../../domain/value-objects/canonical-domain';
import { DomainAliases } from '../../domain/value-objects/domain-aliases';
import { InvalidCompanyDataError } from '../errors/company-platform.errors';
import { providerInternalDomain } from '../providers/provider-internal-domain';
import { demoAdminCredentialError } from '../providers/provider-demo-admin';
import { ProviderDemoAdminEmailTakenError } from '../errors/provider.errors';

export class CreateProviderCommand {
  constructor(
    public readonly name: string,
    public readonly demoAdminEmail: string,
    public readonly demoAdminPassword: string,
  ) {}
}

export interface CreateProviderResult {
  id: string;
  companyId: string;
  name: string;
  token: string;
  tokenPrefix: string;
}

@Injectable()
@CommandHandler(CreateProviderCommand)
export class CreateProviderCommandHandler
  implements ICommandHandler<CreateProviderCommand>
{
  private readonly logger = new Logger(CreateProviderCommandHandler.name);

  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companies: CompanyRepository,
    @Inject(PROVIDER_REPOSITORY)
    private readonly providers: ProviderRepository,
    @Inject(INTEGRATION_API_KEY_REPOSITORY)
    private readonly integrationKeys: IntegrationApiKeyRepository,
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeys: ApiKeyRepository,
    private readonly createKey: CreateIntegrationApiKeyCommandHandler,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(
    command: CreateProviderCommand,
  ): Promise<Result<CreateProviderResult, DomainError>> {
    const name = command.name.trim();
    if (!name) {
      return err(
        new InvalidCompanyDataError('El nombre del proveedor es obligatorio'),
      );
    }

    const credentials = demoAdminCredentialError(
      command.demoAdminEmail,
      command.demoAdminPassword,
    );
    if (credentials) return err(new InvalidCompanyDataError(credentials));

    const demoAdminEmail = command.demoAdminEmail.trim().toLowerCase();
    const taken = await this.providers.findByDemoAdminEmail(demoAdminEmail);
    if (taken) return err(new ProviderDemoAdminEmailTakenError());

    const domain = await this.availableDomain(name);
    if (domain.isErr()) return err(domain.error);

    const now = new Date();
    const company = Company.create({
      id: Uuid.random(),
      companyName: new CompanyName(name),
      sites: CompanySites.fromSiteArray([
        Site.create({
          id: SiteId.random(),
          name: new SiteName(name.slice(0, 100)),
          canonicalDomain: new CanonicalDomain(domain.unwrap()),
          domainAliases: DomainAliases.fromPrimitives([]),
        }),
      ]),
      createdAt: now,
      updatedAt: now,
    });

    const aggregate = this.publisher.mergeObjectContext(company);
    const saved = await this.companies.save(aggregate);
    if (saved.isErr()) return err(saved.error);
    aggregate.commit();

    const companyId = company.getId().getValue();
    const key = await this.createKey.execute(
      new CreateIntegrationApiKeyCommand(companyId, name.slice(0, 100), 'live'),
    );
    if (key.isErr()) {
      await this.rollbackCompany(companyId);
      return err(key.error);
    }

    try {
      const created = key.unwrap();
      const provider = await this.providers.save({
        companyId,
        accessToken: created.plainToken,
        demoAdminEmail,
        demoAdminPassword: command.demoAdminPassword,
      });
      return ok({
        id: provider.id,
        companyId,
        name,
        token: created.plainToken,
        tokenPrefix: created.tokenPrefix,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo registrar el proveedor ${name}: ${
          error instanceof Error ? error.message : 'error'
        }`,
      );
      await this.integrationKeys.deleteByCompanyId(companyId);
      await this.rollbackCompany(companyId);
      return err(
        new InvalidCompanyDataError('No se pudo registrar el proveedor'),
      );
    }
  }

  private async availableDomain(
    name: string,
  ): Promise<Result<string, DomainError>> {
    const first = providerInternalDomain(name);
    if (await this.domainIsFree(first)) return ok(first);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = Uuid.random().value.replace(/-/g, '').slice(0, 4);
      const candidate = providerInternalDomain(name, suffix);
      if (await this.domainIsFree(candidate)) return ok(candidate);
    }

    return err(
      new InvalidCompanyDataError(
        'No se pudo reservar un dominio interno para el proveedor',
      ),
    );
  }

  private async domainIsFree(domain: string): Promise<boolean> {
    const existing = await this.companies.findByDomain(domain);
    return existing.isErr();
  }

  private async rollbackCompany(companyId: string): Promise<void> {
    await this.apiKeys.deleteByCompanyId(companyId);
    const deleted = await this.companies.delete(new Uuid(companyId));
    if (deleted.isErr()) {
      this.logger.error(
        `No se pudo deshacer la empresa ${companyId}: ${deleted.error.message}`,
      );
    }
  }
}
