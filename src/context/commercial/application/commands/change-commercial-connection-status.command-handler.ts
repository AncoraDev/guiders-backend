import { CommandHandler, ICommandHandler, EventPublisher } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ChangeCommercialConnectionStatusCommand } from './change-commercial-connection-status.command';
import {
  COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
  CommercialConnectionDomainService,
} from '../../domain/commercial-connection.domain-service';
import {
  COMMERCIAL_REPOSITORY,
  CommercialRepository,
} from '../../domain/commercial.repository';
import { CommercialId } from '../../domain/value-objects/commercial-id';
import { CommercialConnectionStatus } from '../../domain/value-objects/commercial-connection-status';
import {
  COMMERCIAL_CONNECTION_SESSION_REPOSITORY,
  CommercialConnectionSessionRepository,
} from '../../domain/commercial-connection-session.repository';

/**
 * Handler para el comando ChangeCommercialConnectionStatusCommand
 * Se encarga de cambiar el estado de conexión de un comercial
 */
@CommandHandler(ChangeCommercialConnectionStatusCommand)
export class ChangeCommercialConnectionStatusCommandHandler
  implements ICommandHandler<ChangeCommercialConnectionStatusCommand, void>
{
  private readonly logger = new Logger(
    ChangeCommercialConnectionStatusCommandHandler.name,
  );

  constructor(
    @Inject(COMMERCIAL_CONNECTION_DOMAIN_SERVICE)
    private readonly connectionService: CommercialConnectionDomainService,
    @Inject(COMMERCIAL_REPOSITORY)
    private readonly commercialRepository: CommercialRepository,
    @Inject(COMMERCIAL_CONNECTION_SESSION_REPOSITORY)
    private readonly sessionRepository: CommercialConnectionSessionRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(
    command: ChangeCommercialConnectionStatusCommand,
  ): Promise<void> {
    this.logger.log(
      `Cambiando estado de conexión para comercial: ${command.commercialId} a ${command.newStatus}`,
    );

    try {
      const commercialId = new CommercialId(command.commercialId);
      const newStatus = new CommercialConnectionStatus(command.newStatus);

      // Recuperar companyId desde Redis para actualizar sets por tenant correctamente
      const companyId =
        await this.connectionService.getCompanyIdByCommercial(commercialId);

      // Solo offline termina la conexión; away y busy siguen siendo sesión activa.
      if (newStatus.isOffline()) {
        await this.closeOpenSession(command.commercialId);
      }

      // Actualizar estado en el domain service propagando companyId (puede ser undefined)
      await this.connectionService.setConnectionStatus(
        commercialId,
        newStatus,
        companyId,
      );

      // Buscar el comercial para actualizar el aggregate
      const commercialResult =
        await this.commercialRepository.findById(commercialId);

      if (commercialResult.isErr()) {
        this.logger.warn(
          `No se encontró el comercial con ID: ${command.commercialId}`,
        );
        return;
      }

      const commercial = commercialResult.unwrap();
      if (!commercial) {
        this.logger.warn(
          `Comercial no encontrado con ID: ${command.commercialId}`,
        );
        return;
      }

      // Cambiar estado del aggregate
      const updatedCommercial = commercial.changeConnectionStatus(newStatus);

      // Publicar eventos
      const aggCtx = this.publisher.mergeObjectContext(updatedCommercial);
      await this.commercialRepository.update(aggCtx);
      aggCtx.commit();

      this.logger.log(
        `Estado de conexión actualizado exitosamente para comercial: ${command.commercialId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error al cambiar estado de conexión para comercial ${command.commercialId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Cierra la sesión abierta del comercial. El registro de conexiones es un
   * histórico, así que un fallo aquí se registra pero no aborta el cambio de
   * estado.
   */
  private async closeOpenSession(commercialId: string): Promise<void> {
    const closeResult = await this.sessionRepository.closeOpenSession({
      commercialId,
      endReason: 'manual',
    });

    if (closeResult.isErr()) {
      this.logger.error(
        `No se pudo cerrar la sesión de conexión de ${commercialId}: ${closeResult.error.message}`,
      );
    }
  }
}
