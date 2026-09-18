import { BadRequestException, Inject, Logger } from '@nestjs/common';
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs';
import { ConfirmContactDataCommand } from './confirm-contact-data.command';
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

/**
 * Marca en el hilo que el comercial ha aplicado los datos recibidos.
 * Sin este mensaje el estado "confirmado" solo viviría en memoria en Console
 * y se perdería al recargar.
 */
@CommandHandler(ConfirmContactDataCommand)
export class ConfirmContactDataCommandHandler
  implements ICommandHandler<ConfirmContactDataCommand, MessageResponseDto>
{
  private readonly logger = new Logger(ConfirmContactDataCommandHandler.name);

  constructor(
    @Inject(CHAT_V2_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    @Inject(MESSAGE_V2_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(
    command: ConfirmContactDataCommand,
  ): Promise<MessageResponseDto> {
    if (!command.requestId?.trim()) {
      throw new BadRequestException('El requestId es obligatorio');
    }

    const chatResult = await this.chatRepository.findById(
      ChatId.create(command.chatId),
    );
    if (chatResult.isErr()) {
      throw new Error(`Chat no encontrado: ${chatResult.error.message}`);
    }

    const existing = await this.messageRepository.findByType(
      MessageType.INTERACTIVE,
      ChatId.create(command.chatId),
      50,
    );
    if (existing.isErr()) {
      throw new Error(existing.error.message);
    }

    const interactive = existing.unwrap();
    const submission = interactive.find(
      (message) =>
        message.systemData?.action === 'contact_submission' &&
        message.systemData?.requestId === command.requestId,
    );
    if (!submission) {
      throw new BadRequestException(
        'No hay datos de contacto enviados para esta solicitud',
      );
    }

    const alreadyConfirmed = interactive.some(
      (message) =>
        message.systemData?.action === 'contact_confirmation' &&
        message.systemData?.requestId === command.requestId,
    );
    if (alreadyConfirmed) {
      throw new BadRequestException(
        'Los datos de esta solicitud ya estaban confirmados',
      );
    }

    const confirmation = Message.createInteractiveMessage({
      chatId: command.chatId,
      senderId: command.commercialId,
      content: 'Datos de contacto confirmados',
      systemData: {
        action: 'contact_confirmation',
        requestId: command.requestId,
        status: 'confirmed',
        fromUserId: command.commercialId,
        data: submission.systemData?.data,
      },
    });

    const aggregate = this.publisher.mergeObjectContext(confirmation);
    const saved = await this.messageRepository.save(aggregate);
    if (saved.isErr()) {
      throw new Error(
        `Error al confirmar los datos de contacto: ${saved.error.message}`,
      );
    }
    aggregate.commit();

    this.logger.log(
      `Datos de contacto confirmados en chat ${command.chatId} (request ${command.requestId})`,
    );

    const primitives = confirmation.toPrimitives();
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
