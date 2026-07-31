import { EventsHandler, IEventHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { CommercialConnectionStatusChangedEvent } from '../../domain/events/commercial-connection-status-changed.event';
import { PresenceChangedEvent } from 'src/context/shared/domain/events/presence-changed.event';
import {
  COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
  CommercialConnectionDomainService,
} from '../../domain/commercial-connection.domain-service';
import { CommercialId } from '../../domain/value-objects/commercial-id';

/**
 * Convierte CommercialConnectionStatusChangedEvent → PresenceChangedEvent
 * con tenantId (companyId) para que el SDK reciba commercial:availability-changed.
 */
@EventsHandler(CommercialConnectionStatusChangedEvent)
export class EmitPresenceChangedOnCommercialConnectionStatusChangedEventHandler
  implements IEventHandler<CommercialConnectionStatusChangedEvent>
{
  private readonly logger = new Logger(
    EmitPresenceChangedOnCommercialConnectionStatusChangedEventHandler.name,
  );

  constructor(
    private readonly eventBus: EventBus,
    @Inject(COMMERCIAL_CONNECTION_DOMAIN_SERVICE)
    private readonly connectionService: CommercialConnectionDomainService,
  ) {}

  async handle(event: CommercialConnectionStatusChangedEvent): Promise<void> {
    try {
      const { commercialId, previousStatus, newStatus } = event.attributes;

      this.logger.debug(
        `Procesando cambio de conexión de comercial: ${commercialId} de ${previousStatus} a ${newStatus}`,
      );

      // companyId en Redis (escrito en connect / setConnectionStatus)
      const tenantId = await this.connectionService.getCompanyIdByCommercial(
        new CommercialId(commercialId),
      );

      if (!tenantId) {
        this.logger.warn(
          `PresenceChangedEvent sin tenantId para comercial ${commercialId} — el chat no recibirá availability-changed`,
        );
      }

      const presenceEvent = new PresenceChangedEvent(
        commercialId,
        'commercial',
        previousStatus,
        newStatus,
        tenantId,
      );

      this.eventBus.publish(presenceEvent);

      this.logger.debug(
        `PresenceChangedEvent emitido para comercial: ${commercialId} (tenant=${tenantId ?? 'n/a'})`,
      );
    } catch (error) {
      const errorObj = error as Error;
      this.logger.error(
        `Error al emitir PresenceChangedEvent para comercial: ${errorObj.message}`,
        errorObj.stack,
      );
    }
  }
}
