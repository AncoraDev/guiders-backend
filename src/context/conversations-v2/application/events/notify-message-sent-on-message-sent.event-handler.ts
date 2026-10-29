import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { MessageSentEvent } from '../../domain/events/message-sent.event';
import { WebSocketGatewayBasic } from 'src/websocket/websocket.gateway';
import {
  CHAT_V2_REPOSITORY,
  IChatRepository,
} from '../../domain/chat.repository';
import { ChatId } from '../../domain/value-objects/chat-id';
import {
  COMMERCIAL_REPOSITORY,
  CommercialRepository,
} from 'src/context/commercial/domain/commercial.repository';
import {
  COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
  CommercialConnectionDomainService,
} from 'src/context/commercial/domain/commercial-connection.domain-service';
import { CommercialId as ServiceCommercialId } from 'src/context/commercial/domain/value-objects/commercial-id';
import { senderDisplayNames } from '../sender-display-name';
import { openAssigneeId } from '../absent-assignee';
import { Chat } from '../../domain/entities/chat.aggregate';

/**
 * Event handler que notifica vía WebSocket cuando se envía un mensaje.
 *
 * Flujo:
 * 1. Escucha el evento MessageSentEvent
 * 2. Emite notificación a la sala del chat correspondiente
 * 3. Todos los participantes del chat (visitante y comercial) reciben la notificación
 * 4. Si el chat está PENDING (cola), también emite a tenant:{companyId} para
 *    que Console muestre notificación de escritorio sin haber unido esa sala.
 * 5. Si el chat está asignado y ese comercial no está conectado, avisa a
 *    cada comercial online o ocupado en su sala personal (queue: ausente).
 *    No usa la sala del tenant, para no duplicar el aviso de quien tiene
 *    la consola abierta pero desconectado.
 *
 * Nota: el campo unreadMessagesCount ya NO se incluye aquí. El valor confirmado
 * se propaga por separado mediante UnreadCountUpdatedEvent →
 * NotifyUnreadCountUpdatedOnUnreadCountUpdatedEventHandler, eliminando
 * la race condition que existía al consultar el repositorio desde este handler.
 *
 * Patrón: NotifyMessageSentOnMessageSentEventHandler
 */
@EventsHandler(MessageSentEvent)
export class NotifyMessageSentOnMessageSentEventHandler
  implements IEventHandler<MessageSentEvent>
{
  private readonly logger = new Logger(
    NotifyMessageSentOnMessageSentEventHandler.name,
  );

  constructor(
    @Inject('WEBSOCKET_GATEWAY')
    private readonly websocketGateway: WebSocketGatewayBasic,
    @Inject(CHAT_V2_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    @Inject(COMMERCIAL_REPOSITORY)
    private readonly commercials: CommercialRepository,
    @Inject(COMMERCIAL_CONNECTION_DOMAIN_SERVICE)
    private readonly connections: CommercialConnectionDomainService,
  ) {}

  async handle(event: MessageSentEvent): Promise<void> {
    this.logger.log(
      `Procesando notificación de mensaje enviado: ${event.getMessageId()}`,
    );

    try {
      const messageData = event.getMessageData();
      const chatId = event.getChatId();
      const storedName = messageData.senderName?.trim();
      const names = storedName
        ? new Map<string, string>()
        : await senderDisplayNames(this.commercials, [messageData.senderId]);
      const senderName = storedName || names.get(messageData.senderId);

      // No notificar mensajes internos a los visitantes
      // Los mensajes internos solo se notifican en la sala de comerciales
      if (event.isInternal()) {
        this.logger.log(
          `Mensaje interno detectado, notificando solo a comerciales en chat: ${chatId}`,
        );

        this.websocketGateway.emitToRoom(
          `chat:${chatId}:commercial`,
          'message:new',
          {
            messageId: messageData.messageId,
            chatId: messageData.chatId,
            senderId: messageData.senderId,
            ...(senderName ? { senderName } : {}),
            senderType: messageData.type === 'SYSTEM' ? 'SYSTEM' : undefined,
            content: messageData.content,
            type: messageData.type,
            systemData: messageData.systemData,
            isInternal: messageData.isInternal,
            isFirstResponse: messageData.isFirstResponse,
            sentAt: messageData.sentAt.toISOString(),
            attachment: messageData.attachment,
            isAI: messageData.isAI,
            aiMetadata: messageData.aiMetadata,
          },
        );

        this.logger.log(
          `Notificación de mensaje interno enviada a comerciales del chat: ${chatId}`,
        );
        return;
      }

      // Para mensajes normales, notificar a toda la sala del chat
      this.logger.log(
        `Notificando mensaje a todos los participantes del chat: ${chatId}`,
      );

      const payload = {
        messageId: messageData.messageId,
        chatId: messageData.chatId,
        senderId: messageData.senderId,
        ...(senderName ? { senderName } : {}),
        senderType: messageData.type === 'SYSTEM' ? 'SYSTEM' : undefined,
        content: messageData.content,
        type: messageData.type,
        systemData: messageData.systemData,
        isInternal: messageData.isInternal,
        isFirstResponse: messageData.isFirstResponse,
        sentAt: messageData.sentAt.toISOString(),
        attachment: messageData.attachment,
        isAI: messageData.isAI,
        aiMetadata: messageData.aiMetadata,
      };

      this.websocketGateway.emitToRoom(
        `chat:${chatId}`,
        'message:new',
        payload,
      );

      if (event.isFirstResponse()) {
        this.logger.log(
          `Primera respuesta del comercial detectada, notificando cambio de estado del chat: ${chatId}`,
        );

        this.websocketGateway.emitToRoom(`chat:${chatId}`, 'chat:status', {
          chatId: chatId,
          status: 'IN_PROGRESS',
          timestamp: new Date().toISOString(),
        });
      }

      await this.fanOutVisitorMessage(event, payload);
    } catch (error) {
      const errorObj = error as Error;
      this.logger.error(
        `Error al notificar mensaje enviado: ${errorObj.message}`,
        errorObj.stack,
      );
      // No lanzamos el error para no afectar el flujo principal
    }
  }

  private async fanOutVisitorMessage(
    event: MessageSentEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (event.isInternal()) return;

    const chatResult = await this.chatRepository.findById(
      ChatId.create(event.getChatId()),
    );
    if (chatResult.isErr()) return;

    const chat = chatResult.unwrap();
    if (chat.status.isPending()) {
      this.websocketGateway.emitToRoom(
        `tenant:${chat.companyId}`,
        'message:new',
        {
          ...payload,
          queue: 'pendientes',
          senderType: payload.senderType ?? 'VISITOR',
        },
      );
      return;
    }

    if (event.getMessageData().type === 'SYSTEM') return;
    await this.emitToConnectedIfAssigneeAbsent(event, chat, payload);
  }

  /**
   * El visitante escribió y su comercial no está. Avisa a quien sí está,
   * sin tocar la sala del asignado (esa ya recibió message:new del chat).
   */
  private async emitToConnectedIfAssigneeAbsent(
    event: MessageSentEvent,
    chat: Chat,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const assigneeId = openAssigneeId(chat);
    if (!assigneeId) return;
    if (event.getSenderId() !== chat.visitorId.getValue()) return;

    const assigneeOnline = await this.connections.isCommercialOnline(
      new ServiceCommercialId(assigneeId),
    );
    if (assigneeOnline) return;

    const connected = await this.connections.listConnectedByCompany(
      chat.companyId,
    );
    const others = connected.filter((id) => id.value !== assigneeId);
    if (others.length === 0) return;

    const names = await senderDisplayNames(this.commercials, [assigneeId]);
    const assignedCommercialName = names.get(assigneeId) || 'un comercial';

    for (const commercial of others) {
      this.websocketGateway.emitToRoom(
        `commercial:${commercial.value}`,
        'message:new',
        {
          ...payload,
          queue: 'ausente',
          senderType: payload.senderType ?? 'VISITOR',
          assignedCommercialId: assigneeId,
          assignedCommercialName,
        },
      );
    }
  }
}
