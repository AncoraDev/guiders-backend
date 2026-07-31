import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { CommercialConnectionStatusChangedEvent } from '../../domain/events/commercial-connection-status-changed.event';

/**
 * Side-effect al pasar a offline.
 * La persistencia de duración vive en CommercialConnectionSessionRepository
 * (cerrada en DisconnectCommercialCommandHandler). Aquí solo auditamos.
 */
@EventsHandler(CommercialConnectionStatusChangedEvent)
export class UpdateMetricsOnCommercialDisconnectedEventHandler
  implements IEventHandler<CommercialConnectionStatusChangedEvent>
{
  private readonly logger = new Logger(
    UpdateMetricsOnCommercialDisconnectedEventHandler.name,
  );

  handle(event: CommercialConnectionStatusChangedEvent): void {
    if (event.attributes.newStatus !== 'offline') {
      return;
    }

    const { commercialId, previousStatus, newStatus, changedAt } =
      event.attributes;

    this.logger.log(
      `Comercial desconectado — sesión cerrada vía repository: ${commercialId} ` +
        `(${previousStatus} → ${newStatus} @ ${changedAt.toISOString()})`,
    );
  }
}
