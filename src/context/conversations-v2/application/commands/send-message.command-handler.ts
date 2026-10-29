import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs';
import { SendMessageCommand } from './send-message.command';
import { Inject, Logger } from '@nestjs/common';
import {
  CHAT_V2_REPOSITORY,
  IChatRepository,
} from '../../domain/chat.repository';
import {
  MESSAGE_V2_REPOSITORY,
  IMessageRepository,
} from '../../domain/message.repository';
import { Message } from '../../domain/entities/message.aggregate';
import { ChatId } from '../../domain/value-objects/chat-id';
import { MessageResponseDto } from '../dtos/message-response.dto';
import { Result } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import {
  COMMERCIAL_REPOSITORY,
  CommercialRepository,
} from 'src/context/commercial/domain/commercial.repository';
import { senderDisplayNames } from '../sender-display-name';
import { assertVisitorNotBlocked } from '../visitor-block';
import { VisitorBlockedError } from 'src/context/visitors-v2/domain/errors/visitor-block.error';
import { BadRequestException } from '@nestjs/common';
import {
  VISITOR_V2_REPOSITORY,
  VisitorV2Repository,
} from 'src/context/visitors-v2/domain/visitor-v2.repository';
import {
  COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
  CommercialConnectionDomainService,
} from 'src/context/commercial/domain/commercial-connection.domain-service';
import { CommercialId as ServiceCommercialId } from 'src/context/commercial/domain/value-objects/commercial-id';
import { Chat } from '../../domain/entities/chat.aggregate';
import { openAssigneeId } from '../absent-assignee';

@CommandHandler(SendMessageCommand)
export class SendMessageCommandHandler
  implements ICommandHandler<SendMessageCommand, MessageResponseDto>
{
  private readonly logger = new Logger(SendMessageCommandHandler.name);

  constructor(
    @Inject(CHAT_V2_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    @Inject(MESSAGE_V2_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
    @Inject(COMMERCIAL_REPOSITORY)
    private readonly commercials: CommercialRepository,
    @Inject(VISITOR_V2_REPOSITORY)
    private readonly visitors: VisitorV2Repository,
    @Inject(COMMERCIAL_CONNECTION_DOMAIN_SERVICE)
    private readonly connections: CommercialConnectionDomainService,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(command: SendMessageCommand): Promise<MessageResponseDto> {
    this.logger.log(
      `Ejecutando SendMessage para chat ${command.chatId} desde usuario ${command.senderId}`,
    );

    // Verificar que el chat existe
    const chatResult: Result<any, DomainError> =
      await this.chatRepository.findById(ChatId.create(command.chatId));

    if (chatResult.isErr()) {
      throw new Error(`Chat no encontrado: ${chatResult.error.message}`);
    }

    const chat = chatResult.unwrap() as {
      visitorId?: { value?: string; getValue?: () => string };
    };
    const visitorId =
      chat.visitorId?.value ?? chat.visitorId?.getValue?.() ?? '';
    if (visitorId) {
      try {
        await assertVisitorNotBlocked(this.visitors, visitorId);
      } catch (error) {
        if (error instanceof VisitorBlockedError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }
    }

    if (this.isDomainChat(chatResult.unwrap())) {
      await this.coverAbsentAssignee(
        chatResult.unwrap() as Chat,
        command.senderId,
        command.messageData.isInternal === true,
      );
    }

    // Determinar si es primera respuesta del comercial
    const isFirstResponse = this.shouldMarkAsFirstResponse();
    const senderName = await this.resolveSenderName(command.senderId);

    // Crear el mensaje según el tipo
    let message: Message;

    if (command.messageData.attachment && command.messageData.type !== 'text') {
      // Mensaje con archivo adjunto
      message = Message.createFileMessage({
        chatId: command.chatId,
        senderId: command.senderId,
        senderName,
        fileName: command.messageData.attachment.fileName,
        attachment: command.messageData.attachment,
        isInternal: command.messageData.isInternal || false,
      });
    } else {
      // Mensaje de texto
      message = Message.createTextMessage({
        chatId: command.chatId,
        senderId: command.senderId,
        senderName,
        content: command.messageData.content,
        isInternal: command.messageData.isInternal || false,
        isFirstResponse,
      });
    }

    // Preparar el contexto del mensaje con eventos
    const messageAggregate = this.publisher.mergeObjectContext(message);

    // Guardar el mensaje
    const messageSaveResult =
      await this.messageRepository.save(messageAggregate);

    if (messageSaveResult.isErr()) {
      throw new Error(
        `Error al guardar el mensaje: ${messageSaveResult.error.message}`,
      );
    }

    // Disparar eventos del mensaje
    messageAggregate.commit();

    // Convertir a DTO de respuesta
    const messagePrimitives = message.toPrimitives();

    return {
      id: messagePrimitives.id,
      chatId: messagePrimitives.chatId,
      senderId: messagePrimitives.senderId,
      senderName: messagePrimitives.senderName,
      content: messagePrimitives.content,
      type: messagePrimitives.type,
      systemData: messagePrimitives.systemData,
      attachment: messagePrimitives.attachment,
      isInternal: messagePrimitives.isInternal,
      isFirstResponse: messagePrimitives.isFirstResponse,
      isRead: messagePrimitives.isRead,
      readAt: messagePrimitives.readAt?.toISOString(),
      readBy: messagePrimitives.readBy,
      isAI: messagePrimitives.isAI,
      aiMetadata: messagePrimitives.aiMetadata,
      createdAt: messagePrimitives.createdAt.toISOString(),
      updatedAt: messagePrimitives.updatedAt.toISOString(),
    };
  }

  private isDomainChat(chat: unknown): chat is Chat {
    return (
      !!chat &&
      typeof (chat as Chat).transferTo === 'function' &&
      typeof (chat as Chat).visitorId?.getValue === 'function'
    );
  }

  /**
   * Otro comercial contesta un chat cuyo asignado no está.
   * El mensaje visible transfiere la conversación. Una nota interna no.
   * Si el asignado ya volvió, el envío se rechaza.
   */
  private async coverAbsentAssignee(
    chat: Chat,
    senderId: string,
    isInternal: boolean,
  ): Promise<void> {
    if (senderId === chat.visitorId.getValue()) return;

    const assigneeId = openAssigneeId(chat);
    if (!assigneeId || assigneeId === senderId) return;

    const assigneeOnline = await this.connections.isCommercialOnline(
      new ServiceCommercialId(assigneeId),
    );
    if (assigneeOnline) {
      throw new BadRequestException(
        'Esta conversación la tiene otro comercial conectado',
      );
    }
    if (isInternal) return;

    const transferred = chat.transferTo(senderId, { transferredBy: senderId });
    const updateResult = await this.chatRepository.update(transferred);
    if (updateResult.isErr()) {
      throw new BadRequestException(
        'No se pudo quedar esta conversación. Inténtalo de nuevo.',
      );
    }

    const names = await senderDisplayNames(this.commercials, [
      assigneeId,
      senderId,
    ]);
    const fromName = names.get(assigneeId) || 'un comercial';
    const toName = names.get(senderId) || 'un comercial';
    const systemMessage = Message.createSystemMessage({
      chatId: chat.id.getValue(),
      action: 'transferred',
      fromUserId: assigneeId,
      toUserId: senderId,
      reason: 'assignee_absent',
      content: `Transferido de ${fromName} a ${toName}`,
      isInternal: false,
    });
    const saveMsg = await this.messageRepository.save(systemMessage);
    if (saveMsg.isOk()) {
      const messageCtx = this.publisher.mergeObjectContext(systemMessage);
      messageCtx.commit();
    } else {
      this.logger.error(
        `Chat transferido pero falló el mensaje de sistema: ${saveMsg.error.message}`,
      );
    }

    const chatCtx = this.publisher.mergeObjectContext(transferred);
    chatCtx.commit();
  }

  /**
   * Determina si debe marcarse como primera respuesta del comercial
   */
  private async resolveSenderName(
    senderId: string,
  ): Promise<string | undefined> {
    const names = await senderDisplayNames(this.commercials, [senderId]);
    return names.get(senderId);
  }

  private shouldMarkAsFirstResponse(): boolean {
    // TODO: Implementar lógica para determinar si es primera respuesta
    // Esto requeriría verificar:
    // 1. Si el sender es un comercial (no visitante)
    // 2. Si es el primer mensaje del comercial en este chat
    // Por ahora, asumimos que no es primera respuesta
    return false;
  }
}
