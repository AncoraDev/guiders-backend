import { EventsHandler, EventPublisher, IEventHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { VisitorBlockedEvent } from '../../domain/events/visitor-blocked.event';
import { visitorBlockReasonLabel } from '../../domain/value-objects/visitor-block';
import {
  CHAT_V2_REPOSITORY,
  IChatRepository,
} from '../../../conversations-v2/domain/chat.repository';
import {
  IMessageRepository,
  MESSAGE_V2_REPOSITORY,
} from '../../../conversations-v2/domain/message.repository';
import { VisitorId } from '../../../conversations-v2/domain/value-objects/visitor-id';
import { ChatStatus } from '../../../conversations-v2/domain/value-objects/chat-status';
import { Chat } from '../../../conversations-v2/domain/entities/chat.aggregate';
import { Message } from '../../../conversations-v2/domain/entities/message.aggregate';
import { WebSocketGatewayBasic } from '../../../../websocket/websocket.gateway';

/**
 * Al bloquear, cierra los chats abiertos, deja un mensaje interno
 * y avisa al equipo para que salga de las colas.
 */
@EventsHandler(VisitorBlockedEvent)
export class CloseChatsOnVisitorBlockedEventHandler
  implements IEventHandler<VisitorBlockedEvent>
{
  private readonly logger = new Logger(CloseChatsOnVisitorBlockedEventHandler.name);

  constructor(
    @Inject(CHAT_V2_REPOSITORY)
    private readonly chats: IChatRepository,
    @Inject(MESSAGE_V2_REPOSITORY)
    private readonly messages: IMessageRepository,
    @Inject('WEBSOCKET_GATEWAY')
    private readonly websocketGateway: WebSocketGatewayBasic,
    private readonly publisher: EventPublisher,
  ) {}

  async handle(event: VisitorBlockedEvent): Promise<void> {
    const { visitorId, tenantId, blockedBy, blockedByName, reason, note } =
      event.attributes;
    const label = visitorBlockReasonLabel(reason);
    const detail = note ? `${label}: ${note}` : label;

    try {
      const found = await this.chats.findByVisitorId(VisitorId.create(visitorId), [
        ChatStatus.PENDING,
        ChatStatus.ASSIGNED,
        ChatStatus.ACTIVE,
      ]);
      if (found.isOk()) {
        for (const chat of found.unwrap()) {
          await this.closeChat(chat, blockedBy, blockedByName, detail);
        }
      }
    } catch (error) {
      this.logger.error(
        `No se pudieron cerrar los chats de ${visitorId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const payload = {
      visitorId,
      blocked: true,
      reason,
      blockedBy,
      blockedByName,
    };
    this.websocketGateway.emitToRoom(`tenant:${tenantId}`, 'visitor:blocked', payload);
    this.websocketGateway.emitToRoom(`visitor:${visitorId}`, 'visitor:blocked', payload);
  }

  private async closeChat(
    chat: Chat,
    blockedBy: string,
    blockedByName: string,
    detail: string,
  ): Promise<void> {
    const chatId = chat.id.getValue();
    try {
      const closed = chat.close(blockedBy, `blocked:${detail}`);
      const aggregate = this.publisher.mergeObjectContext(closed);
      const saved = await this.chats.save(aggregate);
      if (saved.isErr()) {
        this.logger.warn(`No se cerró el chat ${chatId}: ${saved.error.message}`);
        return;
      }
      aggregate.commit();

      const message = Message.createSystemMessage({
        chatId,
        action: 'visitor_blocked',
        fromUserId: blockedBy,
        reason: detail,
        content: `${blockedByName} bloqueó al visitante (${detail})`,
        isInternal: true,
      });
      const messageAggregate = this.publisher.mergeObjectContext(message);
      await this.messages.save(messageAggregate);
      messageAggregate.commit();
    } catch (error) {
      this.logger.warn(
        `Chat ${chatId} no se pudo cerrar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
