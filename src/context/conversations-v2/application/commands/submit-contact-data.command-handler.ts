import { BadRequestException, Inject, Logger } from '@nestjs/common';
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs';
import { SubmitContactDataCommand } from './submit-contact-data.command';
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

@CommandHandler(SubmitContactDataCommand)
export class SubmitContactDataCommandHandler
  implements ICommandHandler<SubmitContactDataCommand, MessageResponseDto>
{
  private readonly logger = new Logger(SubmitContactDataCommandHandler.name);

  constructor(
    @Inject(CHAT_V2_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    @Inject(MESSAGE_V2_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(
    command: SubmitContactDataCommand,
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

    const messages = existing.unwrap();
    const submittedIds = new Set(
      messages
        .filter((message) => message.systemData?.action === 'contact_submission')
        .map((message) => message.systemData?.requestId)
        .filter((id): id is string => !!id),
    );
    const pending = messages.find((message) => {
      const data = message.systemData;
      return (
        data?.action === 'contact_request' &&
        data.status === 'pending' &&
        !!data.requestId &&
        !submittedIds.has(data.requestId)
      );
    });
    if (!pending) {
      throw new BadRequestException(
        'No hay una solicitud de datos pendiente',
      );
    }

    const nombre = command.data.nombre?.trim() ?? '';
    const email = command.data.email?.trim() ?? '';
    const telefono = command.data.telefono?.trim() ?? '';
    if (!nombre || !email || !telefono) {
      throw new BadRequestException(
        'Nombre, email y teléfono son obligatorios',
      );
    }

    const requestId = pending.systemData?.requestId;
    const submission = Message.createInteractiveMessage({
      chatId: command.chatId,
      senderId: command.visitorId,
      content: 'Datos de contacto enviados',
      systemData: {
        action: 'contact_submission',
        requestId,
        status: 'submitted',
        fromUserId: command.visitorId,
        data: {
          nombre,
          email,
          telefono,
          apellidos: command.data.apellidos?.trim() || undefined,
          poblacion: command.data.poblacion?.trim() || undefined,
        },
      },
    });

    const aggregate = this.publisher.mergeObjectContext(submission);
    const saved = await this.messageRepository.save(aggregate);
    if (saved.isErr()) {
      throw new Error(`Error al guardar los datos: ${saved.error.message}`);
    }
    aggregate.commit();

    this.logger.log(
      `Datos de contacto enviados en chat ${command.chatId} (request ${requestId})`,
    );

    const primitives = submission.toPrimitives();
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
