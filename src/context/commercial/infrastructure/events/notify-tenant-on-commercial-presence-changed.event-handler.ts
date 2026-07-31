import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Inject, Logger, Optional } from '@nestjs/common';
import { PresenceChangedEvent } from 'src/context/shared/domain/events/presence-changed.event';
import { WebSocketGatewayBasic } from 'src/websocket/websocket.gateway';
import {
  COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
  CommercialConnectionDomainService,
} from '../../domain/commercial-connection.domain-service';
import { CommercialId } from '../../domain/value-objects/commercial-id';

/**
 * Event handler de infraestructura que emite el evento commercial:availability-changed
 * a la room del tenant cuando cambia la presencia de un comercial.
 *
 * Flujo:
 * 1. Escucha PresenceChangedEvent de tipo 'commercial' que tenga tenantId
 * 2. Consulta el conteo actual de disponibles en Redis (SCARD O(1))
 * 3. Emite commercial:availability-changed a la room tenant:{companyId}
 *
 * Este evento es consumido por el SDK del visitante para actualizar la UI en tiempo real.
 *
 * Payload emitido:
 * {
 *   available: boolean,   // true si onlineCount > 0
 *   onlineCount: number,  // número de comerciales disponibles en el tenant
 *   tenantId: string,     // companyId del tenant
 *   timestamp: string     // ISO 8601
 * }
 */
@EventsHandler(PresenceChangedEvent)
export class NotifyTenantOnCommercialPresenceChangedEventHandler
  implements IEventHandler<PresenceChangedEvent>
{
  private readonly logger = new Logger(
    NotifyTenantOnCommercialPresenceChangedEventHandler.name,
  );

  constructor(
    @Optional()
    @Inject('WEBSOCKET_GATEWAY')
    private readonly websocketGateway: WebSocketGatewayBasic,
    @Inject(COMMERCIAL_CONNECTION_DOMAIN_SERVICE)
    private readonly connectionService: CommercialConnectionDomainService,
  ) {}

  async handle(event: PresenceChangedEvent): Promise<void> {
    // Solo procesar eventos de comerciales
    if (event.getUserType() !== 'commercial') return;

    let tenantId = event.getTenantId();
    if (!tenantId) {
      // Fallback: companyId en Redis (commercial:tenant:{id})
      tenantId = await this.connectionService.getCompanyIdByCommercial(
        new CommercialId(event.getUserId()),
      );
    }

    if (!tenantId) {
      this.logger.warn(
        `PresenceChangedEvent de comercial ${event.getUserId()} sin tenantId — omitido commercial:availability-changed`,
      );
      return;
    }

    if (!this.websocketGateway) {
      this.logger.debug(
        'WebSocketGateway no disponible — omitiendo emisión de commercial:availability-changed',
      );
      return;
    }

    try {
      // Consultar conteo actual usando SCARD O(1) — no iterar todos los miembros
      const onlineCount =
        await this.connectionService.getOnlineCountByTenant(tenantId);
      const available = onlineCount > 0;

      const tenantRoom = `tenant:${tenantId}`;
      const payload = {
        available,
        onlineCount,
        tenantId,
        timestamp: new Date().toISOString(),
      };

      this.websocketGateway.emitToRoom(
        tenantRoom,
        'commercial:availability-changed',
        payload,
      );

      this.logger.log(
        `commercial:availability-changed emitido a ${tenantRoom}: available=${available}, onlineCount=${onlineCount}`,
      );
    } catch (error) {
      const errorObj = error as Error;
      this.logger.error(
        `Error al emitir commercial:availability-changed para tenant ${tenantId}: ${errorObj.message}`,
        errorObj.stack,
      );
      // No relanzar — no debe afectar el flujo principal
    }
  }
}
