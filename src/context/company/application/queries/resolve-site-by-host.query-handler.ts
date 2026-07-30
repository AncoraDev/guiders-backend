// QueryHandler para resolver sitio por host/dominio
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ResolveSiteByHostQuery } from './resolve-site-by-host.query';
import { ResolveSiteByHostResponseDto } from '../dtos/resolve-site-by-host-response.dto';
import {
  CompanyRepository,
  COMPANY_REPOSITORY,
} from '../../domain/company.repository';
import { domainsMatch } from '../../../shared/domain/domain-matching.util';

@QueryHandler(ResolveSiteByHostQuery)
export class ResolveSiteByHostQueryHandler
  implements
    IQueryHandler<ResolveSiteByHostQuery, ResolveSiteByHostResponseDto | null>
{
  private readonly logger = new Logger(ResolveSiteByHostQueryHandler.name);

  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
  ) {}

  async execute(
    query: ResolveSiteByHostQuery,
  ): Promise<ResolveSiteByHostResponseDto | null> {
    try {
      this.logger.log(`Resolviendo sitio para host: ${query.host}`);

      // Busca la empresa por dominio en el repositorio
      const companyResult = await this.companyRepository.findByDomain(
        query.host,
      );

      if (companyResult.isErr()) {
        this.logger.warn(`No se encontró empresa para el host: ${query.host}`);
        return null;
      }

      const company = companyResult.value;
      const companyPrimitives = company.toPrimitives();

      // Buscar qué sitio específico maneja este dominio (www/puerto ignorados)
      const matchingSite = companyPrimitives.sites.find(
        (site) =>
          domainsMatch(site.canonicalDomain, query.host) ||
          site.domainAliases.some((alias) => domainsMatch(alias, query.host)),
      );

      if (!matchingSite) {
        this.logger.warn(
          `No se encontró sitio específico para el host: ${query.host}`,
        );
        return null;
      }

      this.logger.log(
        `Sitio resuelto: ${matchingSite.name} (${matchingSite.id}) para empresa ${companyPrimitives.companyName} (${companyPrimitives.id})`,
      );

      return ResolveSiteByHostResponseDto.fromPrimitives(
        companyPrimitives.id, // tenantId
        matchingSite.id, // siteId
      );
    } catch (error) {
      this.logger.error(
        `Error al resolver sitio para host: ${query.host}`,
        error,
      );
      return null;
    }
  }
}
