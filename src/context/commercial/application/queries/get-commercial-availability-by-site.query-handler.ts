import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { GetCommercialAvailabilityBySiteQuery } from './get-commercial-availability-by-site.query';
import { CommercialAvailabilityResponseDto } from '../dtos/commercial-response.dto';
import {
  COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
  CommercialConnectionDomainService,
} from '../../domain/commercial-connection.domain-service';

/**
 * Handler para la query GetCommercialAvailabilityBySiteQuery
 * Obtiene la disponibilidad de comerciales para un sitio específico
 *
 * La consulta filtra por companyId usando los sets Redis por tenant,
 * eliminando el bug cross-tenant donde se devolvían comerciales de otros tenants.
 */
@QueryHandler(GetCommercialAvailabilityBySiteQuery)
export class GetCommercialAvailabilityBySiteQueryHandler
  implements
    IQueryHandler<
      GetCommercialAvailabilityBySiteQuery,
      CommercialAvailabilityResponseDto
    >
{
  private readonly logger = new Logger(
    GetCommercialAvailabilityBySiteQueryHandler.name,
  );

  constructor(
    @Inject(COMMERCIAL_CONNECTION_DOMAIN_SERVICE)
    private readonly connectionService: CommercialConnectionDomainService,
  ) {}

  async execute(
    query: GetCommercialAvailabilityBySiteQuery,
  ): Promise<CommercialAvailabilityResponseDto> {
    try {
      this.logger.log(
        `Consultando disponibilidad de comerciales para siteId: ${query.siteId}, companyId: ${query.companyId}`,
      );

      // Obtener comerciales disponibles filtrados por tenant (companyId)
      const availableCommercialIds =
        await this.connectionService.getAvailableCommercials(query.companyId);

      const onlineCount = availableCommercialIds.length;
      const available = onlineCount > 0;

      this.logger.log(
        `Disponibilidad para siteId ${query.siteId} (tenant ${query.companyId}): ${available} (${onlineCount} comerciales online)`,
      );

      return {
        available,
        onlineCount,
        timestamp: new Date().toISOString(),
        siteId: query.siteId,
        tenantId: query.companyId,
      };
    } catch (error) {
      this.logger.error(
        `Error al consultar disponibilidad para siteId ${query.siteId}:`,
        error,
      );

      // En caso de error, retornar disponibilidad false por seguridad
      return {
        available: false,
        onlineCount: 0,
        timestamp: new Date().toISOString(),
        siteId: query.siteId,
        tenantId: query.companyId,
      };
    }
  }
}
