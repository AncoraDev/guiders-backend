import {
  CommandHandler,
  ICommandHandler,
  EventPublisher,
  EventBus,
} from '@nestjs/cqrs';
import { Inject, Logger, Optional } from '@nestjs/common';
import { DisconnectCommercialCommand } from './disconnect-commercial.command';
import { CommercialRepository } from '../../domain/commercial.repository';
import { COMMERCIAL_REPOSITORY } from '../../domain/commercial.repository';
import { COMMERCIAL_CONNECTION_DOMAIN_SERVICE } from '../../domain/commercial-connection.domain-service';
import { CommercialConnectionDomainService } from '../../domain/commercial-connection.domain-service';
import { CommercialId } from '../../domain/value-objects/commercial-id';
import { CommercialConnectionStatus } from '../../domain/value-objects/commercial-connection-status';
import {
  COMMERCIAL_CONNECTION_SESSION_REPOSITORY,
  CommercialConnectionSessionRepository,
} from '../../domain/commercial-connection-session.repository';
import { PresenceChangedEvent } from 'src/context/shared/domain/events/presence-changed.event';
import { WebSocketGatewayBasic } from 'src/websocket/websocket.gateway';

@CommandHandler(DisconnectCommercialCommand)
export class DisconnectCommercialCommandHandler
  implements ICommandHandler<DisconnectCommercialCommand>
{
  private readonly logger = new Logger(DisconnectCommercialCommandHandler.name);

  constructor(
    @Inject(COMMERCIAL_REPOSITORY)
    private readonly commercialRepository: CommercialRepository,
    @Inject(COMMERCIAL_CONNECTION_DOMAIN_SERVICE)
    private readonly connectionService: CommercialConnectionDomainService,
    @Inject(COMMERCIAL_CONNECTION_SESSION_REPOSITORY)
    private readonly sessionRepository: CommercialConnectionSessionRepository,
    private readonly publisher: EventPublisher,
    private readonly eventBus: EventBus,
    @Optional()
    @Inject('WEBSOCKET_GATEWAY')
    private readonly websocketGateway?: WebSocketGatewayBasic,
  ) {}

  async execute(command: DisconnectCommercialCommand): Promise<void> {
    this.logger.log(
      `Desconectando comercial: ${command.commercialId} companyId=${command.companyId ?? 'n/a'} reason=${command.endReason}`,
    );

    try {
      const commercialId = new CommercialId(command.commercialId);
      const offlineStatus = CommercialConnectionStatus.offline();

      const closeResult = await this.sessionRepository.closeOpenSession({
        commercialId: command.commercialId,
        endReason: command.endReason,
      });
      if (closeResult.isErr()) {
        this.logger.warn(
          `No se pudo cerrar sesión: ${closeResult.error.message}`,
        );
      }

      // companyId: request > Redis
      let companyId =
        command.companyId ||
        (await this.connectionService.getCompanyIdByCommercial(commercialId));

      const commercialResult =
        await this.commercialRepository.findById(commercialId);

      let previousStatus = 'online';

      if (!commercialResult.isOk() || !commercialResult.unwrap()) {
        await this.connectionService.setConnectionStatus(
          commercialId,
          offlineStatus,
          companyId,
        );
        this.logger.warn(
          `Comercial no encontrado en Mongo; Redis offline: ${command.commercialId}`,
        );
        this.eventBus.publish(
          new PresenceChangedEvent(
            command.commercialId,
            'commercial',
            previousStatus,
            'offline',
            companyId,
          ),
        );
        await this.emitAvailability(companyId);
        return;
      }

      const commercial = commercialResult.unwrap()!;
      previousStatus = commercial.toPrimitives().connectionStatus;

      const updatedCommercial =
        commercial.changeConnectionStatus(offlineStatus);

      await this.connectionService.setConnectionStatus(
        commercialId,
        offlineStatus,
        companyId,
      );

      if (previousStatus !== 'offline') {
        const aggCtx = this.publisher.mergeObjectContext(updatedCommercial);
        await this.commercialRepository.update(aggCtx);
        aggCtx.commit();
      }

      if (!companyId) {
        companyId =
          await this.connectionService.getCompanyIdByCommercial(commercialId);
      }

      this.eventBus.publish(
        new PresenceChangedEvent(
          command.commercialId,
          'commercial',
          previousStatus,
          'offline',
          companyId,
        ),
      );

      await this.emitAvailability(companyId);

      this.logger.log(
        `✅ Comercial desconectado: ${commercialId.value} tenant=${companyId ?? 'MISSING'}`,
      );
    } catch (error) {
      this.logger.error(
        `Error al desconectar comercial ${command.commercialId}:`,
        error,
      );
      throw error;
    }
  }

  private async emitAvailability(companyId?: string): Promise<void> {
    if (!companyId || !this.websocketGateway) {
      this.logger.warn(
        `emitAvailability omitido: companyId=${companyId ?? 'n/a'} gateway=${!!this.websocketGateway}`,
      );
      return;
    }
    const onlineCount =
      await this.connectionService.getOnlineCountByTenant(companyId);
    const payload = {
      available: onlineCount > 0,
      onlineCount,
      tenantId: companyId,
      timestamp: new Date().toISOString(),
    };
    this.websocketGateway.emitToRoom(
      `tenant:${companyId}`,
      'commercial:availability-changed',
      payload,
    );
    this.logger.log(
      `📡 commercial:availability-changed → tenant:${companyId} available=${payload.available} count=${onlineCount}`,
    );
  }
}
