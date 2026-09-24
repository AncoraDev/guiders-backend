import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { UpdateCompanyCommand } from './update-company.command';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import { CompanyName } from '../../domain/value-objects/company-name';
import { CompanySites } from '../../domain/value-objects/company-sites';
import { Site } from '../../domain/entities/site';
import { SiteId } from '../../domain/value-objects/site-id';
import { SiteName } from '../../domain/value-objects/site-name';
import { CanonicalDomain } from '../../domain/value-objects/canonical-domain';
import { DomainAliases } from '../../domain/value-objects/domain-aliases';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { Result, err, okVoid } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { CompanyNotFoundError } from '../../domain/errors/company.error';
import {
  CompanyDomainTakenError,
  InvalidCompanyDataError,
} from '../errors/company-platform.errors';

@CommandHandler(UpdateCompanyCommand)
export class UpdateCompanyCommandHandler
  implements ICommandHandler<UpdateCompanyCommand>
{
  private readonly logger = new Logger(UpdateCompanyCommandHandler.name);

  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(
    command: UpdateCompanyCommand,
  ): Promise<Result<void, DomainError>> {
    if (!Uuid.validate(command.companyId)) {
      return err(new InvalidCompanyDataError('ID de empresa no válido'));
    }

    const name = command.companyName.trim();
    if (!name) {
      return err(
        new InvalidCompanyDataError('El nombre de la empresa es obligatorio'),
      );
    }

    if (!Array.isArray(command.sites) || command.sites.length === 0) {
      return err(
        new InvalidCompanyDataError('Debes mantener al menos un sitio'),
      );
    }

    const found = await this.companyRepository.findById(
      new Uuid(command.companyId),
    );
    if (found.isErr()) {
      return err(new CompanyNotFoundError());
    }

    let sites: CompanySites;
    try {
      const siteEntities = command.sites.map((site) => {
        const canonical = site.canonicalDomain.trim().toLowerCase();
        const aliases = (site.domainAliases ?? [])
          .map((alias) => alias.trim().toLowerCase())
          .filter((alias) => alias.length > 0);

        if (!CanonicalDomain.isValid(canonical)) {
          throw new InvalidCompanyDataError(
            `El dominio canónico no es válido: ${site.canonicalDomain}`,
          );
        }
        const invalidAlias = aliases.find(
          (alias) => !CanonicalDomain.isValid(alias),
        );
        if (invalidAlias) {
          throw new InvalidCompanyDataError(
            `El alias de dominio no es válido: ${invalidAlias}`,
          );
        }

        const siteName = site.name.trim() || 'Sitio principal';
        const siteId =
          site.id && Uuid.validate(site.id)
            ? new SiteId(site.id)
            : SiteId.random();

        return Site.create({
          id: siteId,
          name: new SiteName(siteName),
          canonicalDomain: new CanonicalDomain(canonical),
          domainAliases: DomainAliases.fromPrimitives(aliases),
        });
      });
      sites = CompanySites.fromSiteArray(siteEntities);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Datos de sitio no válidos';
      return err(
        error instanceof InvalidCompanyDataError
          ? error
          : new InvalidCompanyDataError(message),
      );
    }

    const uniqueDomains = new Set<string>();
    for (const domain of sites.getAllDomains()) {
      if (uniqueDomains.has(domain)) {
        return err(
          new InvalidCompanyDataError(
            `El dominio ${domain} está duplicado en esta company`,
          ),
        );
      }
      uniqueDomains.add(domain);

      const existing = await this.companyRepository.findByDomain(domain);
      if (
        existing.isOk() &&
        existing.unwrap().getId().getValue() !== command.companyId
      ) {
        return err(new CompanyDomainTakenError(domain));
      }
    }

    const updated = this.publisher.mergeObjectContext(
      found.unwrap().updateDetails(new CompanyName(name), sites),
    );

    const saveResult = await this.companyRepository.update(updated);
    if (saveResult.isErr()) {
      this.logger.error(
        `Error persistiendo company ${command.companyId}: ${saveResult.error.message}`,
      );
      return saveResult;
    }

    updated.commit();
    return okVoid();
  }
}
