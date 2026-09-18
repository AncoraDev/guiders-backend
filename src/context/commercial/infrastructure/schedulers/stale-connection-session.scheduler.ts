import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
  CommercialConnectionDomainService,
} from '../../domain/commercial-connection.domain-service';
import {
  COMMERCIAL_CONNECTION_SESSION_REPOSITORY,
  CommercialConnectionSessionRepository,
} from '../../domain/commercial-connection-session.repository';
import { CommercialId } from '../../domain/value-objects/commercial-id';
import { WebSocketGatewayBasic } from 'src/websocket/websocket.gateway';

/**
 * Cierra las sesiones de conexión que quedaron abiertas sin que nadie avisara:
 * un reinicio del backend, un proceso matado o un beacon que no llegó.
 *
 * Una sesión se considera huérfana cuando el comercial no tiene socket vivo y
 * tampoco figura conectado en Redis. Se comprueban las dos cosas porque la
 * clave de presencia de Redis caduca a los 5 minutos, así que por sí sola
 * cerraría sesiones de comerciales que siguen trabajando.
 */
@Injectable()
export class StaleConnectionSessionScheduler {
  private readonly logger = new Logger(StaleConnectionSessionScheduler.name);
  private readonly isEnabled: boolean;
  /** Margen para no cerrar una sesión recién abierta mientras el socket sube. */
  private readonly GRACE_MS = 2 * 60 * 1000;
  private isProcessing = false;

  constructor(
    @Inject(COMMERCIAL_CONNECTION_SESSION_REPOSITORY)
    private readonly sessionRepository: CommercialConnectionSessionRepository,
    @Inject(COMMERCIAL_CONNECTION_DOMAIN_SERVICE)
    private readonly connectionService: CommercialConnectionDomainService,
    @Optional()
    @Inject('WEBSOCKET_GATEWAY')
    private readonly websocketGateway?: WebSocketGatewayBasic,
  ) {
    this.isEnabled = process.env.CONNECTION_SESSION_SWEEPER_ENABLED !== 'false';
  }

  @Cron('0 */10 * * * *', {
    name: 'stale-connection-session-sweep',
    timeZone: 'UTC',
  })
  async handleSweep(): Promise<void> {
    if (!this.isEnabled || this.isProcessing) return;

    try {
      this.isProcessing = true;

      const openResult = await this.sessionRepository.listOpenSessions();
      if (openResult.isErr()) {
        this.logger.error(
          `No se pudieron listar las sesiones abiertas: ${openResult.error.message}`,
        );
        return;
      }

      const openSessions = openResult.unwrap();
      if (openSessions.length === 0) return;

      const now = Date.now();
      let closed = 0;

      for (const session of openSessions) {
        if (now - session.startedAt.getTime() < this.GRACE_MS) continue;
        if (await this.isStillConnected(session.commercialId)) continue;

        const closeResult = await this.sessionRepository.closeOpenSession({
          commercialId: session.commercialId,
          endedAt: await this.resolveEndedAt(session.commercialId),
          endReason: 'connection_lost',
        });

        if (closeResult.isErr()) {
          this.logger.error(
            `No se pudo cerrar la sesión huérfana de ${session.commercialId}: ${closeResult.error.message}`,
          );
          continue;
        }
        closed++;
      }

      if (closed > 0) {
        this.logger.log(
          `Cerradas ${closed} de ${openSessions.length} sesiones de conexión huérfanas`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error en el barrido de sesiones de conexión: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  private async isStillConnected(commercialId: string): Promise<boolean> {
    if (this.websocketGateway?.isUserConnected(commercialId)) return true;

    const status = await this.connectionService.getConnectionStatus(
      new CommercialId(commercialId),
    );
    return !status.isOffline();
  }

  /**
   * Se cierra con la última actividad conocida para no inflar la duración. Si
   * Redis ya no la tiene, devuelve la actividad actual, así que solo se usa
   * cuando es realmente pasada.
   */
  private async resolveEndedAt(
    commercialId: string,
  ): Promise<Date | undefined> {
    try {
      const lastActivity = await this.connectionService.getLastActivity(
        new CommercialId(commercialId),
      );
      const value = lastActivity?.value;
      if (value && Date.now() - value.getTime() > this.GRACE_MS) {
        return value;
      }
    } catch {
      // Sin actividad en Redis se cierra con la hora actual
    }
    return undefined;
  }
}
