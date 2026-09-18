import { BadRequestException, Inject, Logger } from '@nestjs/common';
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs';
import { CancelContactDataCommand } from './cancel-contact-data.command';
import { findOpenContactRequest } from './find-open-contact-request';
import {
  CHAT_V2_REPOSITORY,
  IChatRepository,
} from '../../domain/chat.repository';
import {
  IMessageRepository,
  MESSAGE_V2_REPOSITORY,
} from '../../domain/message.repository';
import { Message } from '../../domain/entities/message.aggregate';
import { ChatId } from '../../domain/value-objects/chat-id';
import { MessageType } from '../../domain/value-objects/message-type';
import { MessageResponseDto } from '../dtos/message-response.dto';

@CommandHandler(CancelContactDataCommand)
export class CancelContactDataCommandHandler
  implements ICommandHandler<CancelContactDataCommand, MessageResponseDto>
{
  private readonly logger = new Logger(CancelContactDataCommandHandler.name);

  constructor(
    @Inject(CHAT_V2_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    @Inject(MESSAGE_V2_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(
    command: CancelContactDataCommand,
  ): Promise<MessageResponseDto> {
    const chatResult = await this.chatRepository.findById(
      ChatId.create(command.chatId),
    );
    if (chatResult.isErr()) {
      throw new Error(`Chat no encontrado: ${chatResult.error.message}`);
    }

    const chat = chatResult.unwrap();
    if (chat.visitorId.value !== command.visitorId) {
      throw new BadRequestException(
        'El visitante no pertenece a este chat',
      );
    }

    const existing = await this.messageRepository.findByType(
      MessageType.INTERACTIVE,
      ChatId.create(command.chatId),
      50,
    );
    if (existing.isErr()) {
      throw new Error(existing.error.message);
    }

    const pending = findOpenContactRequest(existing.unwrap());
    if (!pending) {
      throw new BadRequestException(
        'No hay una solicitud de datos pendiente',
      );
    }

    const requestId = pending.systemData?.requestId;
    const cancellation = Message.createInteractiveMessage({
      chatId: command.chatId,
      senderId: command.visitorId,
      content: 'El visitante ha cancelado el formulario',
      systemData: {
        action: 'contact_cancellation',
        requestId,
        status: 'cancelled',
        fromUserId: command.visitorId,
      },
    });

    const aggregate = this.publisher.mergeObjectContext(cancellation);
    const saved = await this.messageRepository.save(aggregate);
    if (saved.isErr()) {
      throw new Error(
        `Error al cancelar la solicitud: ${saved.error.message}`,
      );
    }
    aggregate.commit();

    this.logger.log(
      `Formulario de contacto cancelado en chat ${command.chatId} (request ${requestId})`,
    );

    const primitives = cancellation.toPrimitives();
    return {
      id: primitives.id,
      chatId: primitives.chatId,
      senderId: primitives.senderId,
      content: primitives.content,
      type: primitives.type,
      systemData: primitives.systemData,
      isInternal: primitives.isInternal,
      isFirstResponse: primitives.isFirstResponse,
      isRead: primitives.isRead,
      isAI: primitives.isAI,
      createdAt: primitives.createdAt.toISOString(),
      updatedAt: primitives.updatedAt.toISOString(),
    };
  }
}
