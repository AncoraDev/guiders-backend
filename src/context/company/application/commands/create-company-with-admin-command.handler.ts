// Handler para CreateCompanyWithAdminCommand siguiendo DDD y CQRS
import {
  CommandBus,
  CommandHandler,
  EventPublisher,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { CreateCompanyWithAdminCommand } from './create-company-with-admin.command';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import { Company } from '../../domain/company.aggregate';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { CompanyName } from '../../domain/value-objects/company-name';
import { Site } from '../../domain/entities/site';
import { SiteId } from '../../domain/value-objects/site-id';
import { SiteName } from '../../domain/value-objects/site-name';
import { CanonicalDomain } from '../../domain/value-objects/canonical-domain';
import { DomainAliases } from '../../domain/value-objects/domain-aliases';
import { CompanySites } from '../../domain/value-objects/company-sites';
import { CreateCompanyUserCommand } from 'src/context/auth/auth-user/application/commands/create-company-user.command';
import { Result, ok, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import {
  AdminCredentialsRequiredError,
  AdminEmailRequiredError,
} from '../errors/company-platform.errors';

export interface CreateCompanyWithAdminResult {
  companyId: string;
  adminUserId: string;
}

@CommandHandler(CreateCompanyWithAdminCommand)
export class CreateCompanyWithAdminCommandHandler
  implements
    ICommandHandler<
      CreateCompanyWithAdminCommand,
      Result<CreateCompanyWithAdminResult, DomainError>
    >
{
  private readonly logger = new Logger(
    CreateCompanyWithAdminCommandHandler.name,
  );

  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
    private readonly publisher: EventPublisher,
    private readonly commandBus: CommandBus,
  ) {}

  /**
   * Crea la company (API keys vía CompanyCreatedEvent) y el admin en Keycloak
   * reutilizando CreateCompanyUserCommand. No emite CompanyCreatedWithAdminEvent
   * (evita invite local legado y doble email).
   */
  async execute(
    command: CreateCompanyWithAdminCommand,
  ): Promise<Result<CreateCompanyWithAdminResult, DomainError>> {
    const {
      companyName,
      sites,
      adminName,
      adminFirstName,
      adminLastName,
      adminEmail,
      adminTel,
      adminPassword,
    } = command.props;

    if (!adminEmail?.trim()) {
      return err(new AdminEmailRequiredError());
    }

    const firstName =
      adminFirstName?.trim() ||
      adminName?.trim().split(/\s+/)[0] ||
      '';
    const lastName =
      adminLastName?.trim() ||
      adminName?.trim().split(/\s+/).slice(1).join(' ') ||
      firstName;
    if (!firstName || !adminPassword?.trim()) {
      return err(new AdminCredentialsRequiredError());
    }

    const companyId = Uuid.random();
    const now = new Date();

    const siteEntities = sites.map((siteData) => {
      return Site.create({
        id: siteData.id ? new SiteId(siteData.id) : SiteId.random(),
        name: new SiteName(siteData.name),
        canonicalDomain: new CanonicalDomain(siteData.canonicalDomain),
        domainAliases: DomainAliases.fromPrimitives(siteData.domainAliases),
      });
    });

    const company = Company.create({
      id: companyId,
      companyName: new CompanyName(companyName),
      sites: CompanySites.fromSiteArray(siteEntities),
      createdAt: now,
      updatedAt: now,
    });

    const companyAggregate = this.publisher.mergeObjectContext(company);
    const saveResult = await this.companyRepository.save(companyAggregate);
    if (saveResult.isErr()) {
      return err(saveResult.error);
    }
    companyAggregate.commit();

    const companyIdValue = companyId.getValue();

    // Admin del cliente: Keycloak + password temporal (sin email)
    const adminResult = await this.commandBus.execute<
      CreateCompanyUserCommand,
      Result<{ userId: string }, DomainError>
    >(
      new CreateCompanyUserCommand(
        companyIdValue,
        firstName,
        lastName || firstName,
        adminEmail.trim(),
        ['admin'],
        adminPassword,
        adminTel,
      ),
    );

    if (adminResult.isErr()) {
      this.logger.error(
        `Company ${companyIdValue} creada pero falló el alta del admin: ${adminResult.error.message}`,
      );
      return err(adminResult.error);
    }

    return ok({
      companyId: companyIdValue,
      adminUserId: adminResult.unwrap().userId,
    });
  }
}
