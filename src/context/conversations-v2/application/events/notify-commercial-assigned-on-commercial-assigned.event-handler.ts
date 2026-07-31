import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { CommercialAssignedEvent } from '../../domain/events/commercial-assigned.event';
import { WebSocketGatewayBasic } from 'src/websocket/websocket.gateway';
import {
  COMMERCIAL_REPOSITORY,
  CommercialRepository,
} from 'src/context/commercial/domain/commercial.repository';
import { CommercialId } from 'src/context/commercial/domain/value-objects/commercial-id';
import {
  USER_ACCOUNT_REPOSITORY,
  UserAccountRepository,
} from 'src/context/auth/auth-user/domain/user-account.repository';
import { UserAccountKeycloakId } from 'src/context/auth/auth-user/domain/value-objects/user-account-keycloak-id';

/**
 * Event handler que notifica vía WebSocket cuando se asigna un comercial a un chat
 *
 * Flujo:
 * 1. Escucha el evento CommercialAssignedEvent
 * 2. Obtiene los datos de la asignación
 * 3. Emite notificación a:
 *    - Sala del chat (chat:{chatId}) - para que el visitante sepa que un comercial fue asignado
 *    - Sala del visitante (visitor:{visitorId}) - notificación general al visitante
 *
 * Patrón: NotifyCommercialAssignedOnCommercialAssignedEventHandler
 */
@EventsHandler(CommercialAssignedEvent)
export class NotifyCommercialAssignedOnCommercialAssignedEventHandler
  implements IEventHandler<CommercialAssignedEvent>
{
  private readonly logger = new Logger(
    NotifyCommercialAssignedOnCommercialAssignedEventHandler.name,
  );

  constructor(
    @Inject('WEBSOCKET_GATEWAY')
    private readonly websocketGateway: WebSocketGatewayBasic,
    @Inject(COMMERCIAL_REPOSITORY)
    private readonly commercialRepository: CommercialRepository,
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly userAccountRepository: UserAccountRepository,
  ) {}

  async handle(event: CommercialAssignedEvent): Promise<void> {
    this.logger.log(
      `Procesando notificación de comercial asignado al chat: ${event.getChatId()}`,
    );

    try {
      const assignmentData = event.getAssignmentData();
      const chatId = event.getChatId();
      const visitorId = event.getVisitorId();
      const commercialId = event.getCommercialId();

      const commercialInfo = await this.resolveCommercialInfo(commercialId);
      if (!commercialInfo) {
        this.logger.warn(
          `No se pudo obtener datos del comercial ${commercialId}`,
        );
      }

      let previousCommercialInfo: {
        id: string;
        name: string;
        avatarUrl: string | null;
      } | null = null;

      if (assignmentData.previousCommercialId) {
        previousCommercialInfo = await this.resolveCommercialInfo(
          assignmentData.previousCommercialId,
        );
      }

      const payload = {
        chatId: chatId,
        commercialId: commercialId,
        visitorId: visitorId,
        status: assignmentData.newStatus,
        assignedAt: assignmentData.assignedAt.toISOString(),
        assignmentReason: assignmentData.assignmentReason || 'auto',
        previousCommercialId: assignmentData.previousCommercialId,
        transferredBy: assignmentData.transferredBy,
        commercial: commercialInfo,
        previousCommercial: previousCommercialInfo,
      };

      // Sala del chat (visitante + quien esté en la conversación)
      this.websocketGateway.emitToRoom(
        `chat:${chatId}`,
        'chat:commercial-assigned',
        payload,
      );

      // Destinatario: sala personal (aunque no haya abierto el chat aún)
      this.websocketGateway.emitToRoom(
        `commercial:${commercialId}`,
        'chat:commercial-assigned',
        payload,
      );

      // Origen (transferencia): para que suelte sala WS / deje de notificar
      if (
        assignmentData.assignmentReason === 'transfer' &&
        assignmentData.previousCommercialId &&
        assignmentData.previousCommercialId !== commercialId
      ) {
        this.websocketGateway.emitToRoom(
          `commercial:${assignmentData.previousCommercialId}`,
          'chat:commercial-assigned',
          payload,
        );
      }

      this.logger.log(
        `Notificación enviada a chat:${chatId} y commercial:${commercialId}`,
      );
    } catch (error) {
      const errorObj = error as Error;
      this.logger.error(
        `Error al notificar asignación de comercial: ${errorObj.message}`,
        errorObj.stack,
      );
      // No lanzamos el error para no afectar el flujo principal
    }
  }

  private async resolveCommercialInfo(commercialId: string): Promise<{
    id: string;
    name: string;
    avatarUrl: string | null;
  } | null> {
    const commercialResult = await this.commercialRepository.findById(
      CommercialId.create(commercialId),
    );

    if (!(commercialResult.isOk() && commercialResult.unwrap())) {
      return null;
    }

    const commercial = commercialResult.unwrap()!;
    const primitives = commercial.toPrimitives();
    let avatarUrl = primitives.avatarUrl ?? null;

    if (!avatarUrl) {
      try {
        const userAccount = await this.userAccountRepository.findByKeycloakId(
          UserAccountKeycloakId.create(commercialId),
        );
        if (userAccount) {
          avatarUrl = userAccount.toPrimitives().avatarUrl ?? null;
        }
      } catch {
        this.logger.debug(
          `No se pudo obtener avatar de UserAccount para ${commercialId}`,
        );
      }
    }

    return {
      id: primitives.id,
      name: primitives.name,
      avatarUrl,
    };
  }
}
