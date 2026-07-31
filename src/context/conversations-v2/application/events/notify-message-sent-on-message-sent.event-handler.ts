import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { MessageSentEvent } from '../../domain/events/message-sent.event';
import { WebSocketGatewayBasic } from 'src/websocket/websocket.gateway';

/**
 * Event handler que notifica vía WebSocket cuando se envía un mensaje.
 *
 * Flujo:
 * 1. Escucha el evento MessageSentEvent
 * 2. Emite notificación a la sala del chat correspondiente
 * 3. Todos los participantes del chat (visitante y comercial) reciben la notificación
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
  ) {}

  handle(event: MessageSentEvent): void {
    this.logger.log(
      `Procesando notificación de mensaje enviado: ${event.getMessageId()}`,
    );

    try {
      const messageData = event.getMessageData();
      const chatId = event.getChatId();

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
            senderType:
              messageData.type === 'SYSTEM' ? 'SYSTEM' : undefined,
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

      this.websocketGateway.emitToRoom(`chat:${chatId}`, 'message:new', {
        messageId: messageData.messageId,
        chatId: messageData.chatId,
        senderId: messageData.senderId,
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
      });

      // Si es la primera respuesta del comercial, notificar estado de chat actualizado
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

      this.logger.log(
        `Notificación de mensaje enviada exitosamente a chat: ${chatId}`,
      );
    } catch (error) {
      const errorObj = error as Error;
      this.logger.error(
        `Error al notificar mensaje enviado: ${errorObj.message}`,
        errorObj.stack,
      );
      // No lanzamos el error para no afectar el flujo principal
    }
  }
}
