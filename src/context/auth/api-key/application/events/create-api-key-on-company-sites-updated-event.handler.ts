import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Injectable, Logger } from '@nestjs/common';
import { CompanySitesUpdatedEvent } from 'src/context/company/domain/events/company-sites-updated.event';
import { CreateApiKeyForDomainUseCase } from '../usecase/create-api-key-for-domain.usecase';
import { ApiKeyDomain } from '../../domain/model/api-key-domain';
import { ApiKeyCompanyId } from '../../domain/model/api-key-company-id';

/**
 * Al cambiar los sitios de un cliente, crea la clave de widget de cada
 * dominio nuevo. Si el dominio ya tiene clave, el caso de uso la reutiliza.
 */
@Injectable()
@EventsHandler(CompanySitesUpdatedEvent)
export class CreateApiKeyOnCompanySitesUpdatedEventHandler
  implements IEventHandler<CompanySitesUpdatedEvent>
{
  private readonly logger = new Logger(
    CreateApiKeyOnCompanySitesUpdatedEventHandler.name,
  );

  constructor(
    private readonly createApiKeyForDomainUseCase: CreateApiKeyForDomainUseCase,
  ) {}

  async handle(event: CompanySitesUpdatedEvent): Promise<void> {
    const sites = event.attributes.sites;
    const companyId = event.attributes.id;

    if (!sites || sites.length === 0) {
      this.logger.warn(
        `No se encontraron sitios para la empresa ${companyId}, no se crearán API Keys.`,
      );
      return;
    }

    const allDomains: string[] = [];
    for (const site of sites) {
      allDomains.push(site.canonicalDomain);
      allDomains.push(...site.domainAliases);
    }

    if (allDomains.length === 0) {
      this.logger.warn(
        `No se encontraron dominios en los sitios para la empresa ${companyId}, no se crearán API Keys.`,
      );
      return;
    }

    for (const domain of allDomains) {
      try {
        await this.createApiKeyForDomainUseCase.execute(
          ApiKeyDomain.create(domain),
          ApiKeyCompanyId.create(companyId),
        );
        this.logger.log(
          `API Key asegurada para la empresa ${companyId} y dominio ${domain}`,
        );
      } catch (error) {
        this.logger.error(
          `Error al crear API Key para la empresa ${companyId} y dominio ${domain}: ${error}`,
        );
      }
    }
  }
}
