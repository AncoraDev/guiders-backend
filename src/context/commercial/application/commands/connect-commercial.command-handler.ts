import {
  CommandHandler,
  ICommandHandler,
  EventPublisher,
  EventBus,
} from '@nestjs/cqrs';
import { Inject, Logger, Optional } from '@nestjs/common';
import { ConnectCommercialCommand } from './connect-commercial.command';
import {
  COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
  CommercialConnectionDomainService,
} from '../../domain/commercial-connection.domain-service';
import {
  COMMERCIAL_REPOSITORY,
  CommercialRepository,
} from '../../domain/commercial.repository';
import { Commercial } from '../../domain/commercial.aggregate';
import { CommercialId } from '../../domain/value-objects/commercial-id';
import { CommercialName } from '../../domain/value-objects/commercial-name';
import { CommercialConnectionStatus } from '../../domain/value-objects/commercial-connection-status';
import { CommercialLastActivity } from '../../domain/value-objects/commercial-last-activity';
import {
  USER_ACCOUNT_REPOSITORY,
  UserAccountRepository,
} from 'src/context/auth/auth-user/domain/user-account.repository';
import { UserAccountKeycloakId } from 'src/context/auth/auth-user/domain/value-objects/user-account-keycloak-id';
import {
  COMMERCIAL_CONNECTION_SESSION_REPOSITORY,
  CommercialConnectionSessionRepository,
} from '../../domain/commercial-connection-session.repository';
import { PresenceChangedEvent } from 'src/context/shared/domain/events/presence-changed.event';
import { WebSocketGatewayBasic } from 'src/websocket/websocket.gateway';

@CommandHandler(ConnectCommercialCommand)
export class ConnectCommercialCommandHandler
  implements ICommandHandler<ConnectCommercialCommand, void>
{
  private readonly logger = new Logger(ConnectCommercialCommandHandler.name);

  constructor(
    @Inject(COMMERCIAL_CONNECTION_DOMAIN_SERVICE)
    private readonly connectionService: CommercialConnectionDomainService,
    @Inject(COMMERCIAL_REPOSITORY)
    private readonly commercialRepository: CommercialRepository,
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly userAccountRepository: UserAccountRepository,
    @Inject(COMMERCIAL_CONNECTION_SESSION_REPOSITORY)
    private readonly sessionRepository: CommercialConnectionSessionRepository,
    private readonly publisher: EventPublisher,
    private readonly eventBus: EventBus,
    @Optional()
    @Inject('WEBSOCKET_GATEWAY')
    private readonly websocketGateway?: WebSocketGatewayBasic,
  ) {}

  async execute(command: ConnectCommercialCommand): Promise<void> {
    this.logger.log(
      `Conectando comercial: ${command.commercialId} (${command.name}) companyId=${command.companyId ?? 'n/a'}`,
    );

    try {
      const commercialId = new CommercialId(command.commercialId);
      const onlineStatus = CommercialConnectionStatus.online();

      let realName = command.name;
      let avatarUrl: string | null = null;
      // Prioridad: companyId del request autenticado (fiable)
      let companyId: string | undefined = command.companyId;

      try {
        const userAccount = await this.userAccountRepository.findByKeycloakId(
          UserAccountKeycloakId.create(command.commercialId),
        );
        if (userAccount) {
          const userPrimitives = userAccount.toPrimitives();
          realName = userPrimitives.name || command.name;
          avatarUrl = userPrimitives.avatarUrl ?? null;
          companyId = companyId || userPrimitives.companyId || undefined;
        }
      } catch {
        this.logger.debug(
          `No se pudo obtener UserAccount para ${command.commercialId}`,
        );
      }

      if (!companyId) {
        this.logger.error(
          `❌ Connect SIN companyId para ${command.commercialId} — availability WS no funcionará`,
        );
      }

      const commercialName = new CommercialName(realName);
      const existingCommercialResult =
        await this.commercialRepository.findById(commercialId);

      let commercial: Commercial;
      let previousStatus = 'offline';

      if (
        existingCommercialResult.isOk() &&
        existingCommercialResult.unwrap()
      ) {
        commercial = existingCommercialResult.unwrap()!;
        previousStatus = commercial.toPrimitives().connectionStatus;
        commercial = commercial.changeConnectionStatus(onlineStatus);

        const primitives = commercial.toPrimitives();
        if (primitives.name !== realName) {
          commercial = commercial.updateName(realName);
        }
        if (!primitives.avatarUrl && avatarUrl) {
          commercial = commercial.updateAvatar(avatarUrl);
        }
      } else {
        commercial = Commercial.create({
          id: commercialId,
          name: commercialName,
          connectionStatus: onlineStatus,
          avatarUrl: avatarUrl,
        });
      }

      // Redis CON companyId (sets por tenant)
      await this.connectionService.setConnectionStatus(
        commercialId,
        onlineStatus,
        companyId,
      );
      await this.connectionService.updateLastActivity(
        commercialId,
        CommercialLastActivity.now(),
      );

      const aggCtx = this.publisher.mergeObjectContext(commercial);
      if (
        existingCommercialResult.isOk() &&
        existingCommercialResult.unwrap()
      ) {
        await this.commercialRepository.update(aggCtx);
      } else {
        await this.commercialRepository.save(aggCtx);
      }
      aggCtx.commit();

      if (companyId) {
        const sessionResult = await this.sessionRepository.openSession({
          commercialId: command.commercialId,
          companyId,
          commercialDisplayName: command.name || null,
        });
        if (sessionResult.isErr()) {
          this.logger.warn(
            `No se pudo abrir sesión: ${sessionResult.error.message}`,
          );
        }
      }

      // Evento de presencia CON tenantId
      this.eventBus.publish(
        new PresenceChangedEvent(
          command.commercialId,
          'commercial',
          previousStatus,
          'online',
          companyId,
        ),
      );

      // Emisión DIRECTA de availability (no depender solo de event handlers)
      await this.emitAvailability(companyId);

      this.logger.log(
        `✅ Comercial conectado: ${command.commercialId} tenant=${companyId ?? 'MISSING'}`,
      );
    } catch (error) {
      this.logger.error(
        `Error al conectar comercial ${command.commercialId}:`,
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
