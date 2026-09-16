import { ConflictException, Inject, Logger } from '@nestjs/common';
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs';
import { RequestContactDataCommand } from './request-contact-data.command';
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
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import {
  ILeadContactDataRepository,
  LEAD_CONTACT_DATA_REPOSITORY,
} from 'src/context/leads/domain/lead-contact-data.repository';

@CommandHandler(RequestContactDataCommand)
export class RequestContactDataCommandHandler
  implements ICommandHandler<RequestContactDataCommand, MessageResponseDto>
{
  private readonly logger = new Logger(RequestContactDataCommandHandler.name);

  constructor(
    @Inject(CHAT_V2_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    @Inject(MESSAGE_V2_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
    @Inject(LEAD_CONTACT_DATA_REPOSITORY)
    private readonly contactDataRepository: ILeadContactDataRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(
    command: RequestContactDataCommand,
  ): Promise<MessageResponseDto> {
    const chatResult = await this.chatRepository.findById(
      ChatId.create(command.chatId),
    );
    if (chatResult.isErr()) {
      throw new Error(`Chat no encontrado: ${chatResult.error.message}`);
    }

    const chat = chatResult.unwrap();
    const storedContact = await this.contactDataRepository.findByVisitorId(
      chat.visitorId.getValue(),
      chat.companyId,
    );
    if (storedContact.isOk()) {
      const contact = storedContact.unwrap();
      const hasName = !!contact?.nombre?.trim();
      const hasContact =
        !!contact?.email?.trim() || !!contact?.telefono?.trim();
      if (hasName && hasContact) {
        throw new ConflictException(
          'Ya existen datos de contacto para este visitante',
        );
      }
    }

    const existing = await this.messageRepository.findByType(
      MessageType.INTERACTIVE,
      ChatId.create(command.chatId),
      50,
    );
    if (existing.isOk()) {
      const messages = existing.unwrap();
      const submittedIds = new Set(
        messages
          .filter((message) => message.systemData?.action === 'contact_submission')
          .map((message) => message.systemData?.requestId)
          .filter((id): id is string => !!id),
      );
      if (submittedIds.size > 0) {
        throw new ConflictException(
          'El visitante ya envió sus datos de contacto en este chat',
        );
      }
      const pending = messages.find((message) => {
        const data = message.systemData;
        return (
          data?.action === 'contact_request' &&
          data.status === 'pending' &&
          !!data.requestId &&
          !submittedIds.has(data.requestId)
        );
      });
      if (pending) {
        throw new ConflictException(
          'Ya hay una solicitud de datos pendiente en este chat',
        );
      }
    }

    const requestId = Uuid.random().value;
    const message = Message.createInteractiveMessage({
      chatId: command.chatId,
      senderId: command.commercialId,
      content: 'Solicitud de datos de contacto',
      systemData: {
        action: 'contact_request',
        requestId,
        status: 'pending',
        fromUserId: command.commercialId,
      },
    });

    const aggregate = this.publisher.mergeObjectContext(message);
    const saved = await this.messageRepository.save(aggregate);
    if (saved.isErr()) {
      throw new Error(`Error al guardar la solicitud: ${saved.error.message}`);
    }
    aggregate.commit();

    this.logger.log(
      `Solicitud de datos ${requestId} creada en chat ${command.chatId}`,
    );

    const primitives = message.toPrimitives();
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
