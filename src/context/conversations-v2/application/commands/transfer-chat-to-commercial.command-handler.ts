import { CommandHandler, ICommandHandler, EventPublisher } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { Result, ok, err } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/domain.error';
import { TransferChatToCommercialCommand } from './transfer-chat-to-commercial.command';
import {
  IChatRepository,
  CHAT_V2_REPOSITORY,
} from '../../domain/chat.repository';
import {
  IMessageRepository,
  MESSAGE_V2_REPOSITORY,
} from '../../domain/message.repository';
import { Message } from '../../domain/entities/message.aggregate';
import { ChatId } from '../../domain/value-objects/chat-id';
import { CommercialId } from '../../domain/value-objects/commercial-id';
import { CommercialId as ServiceCommercialId } from '../../../commercial/domain/value-objects/commercial-id';
import {
  CommercialConnectionDomainService,
  COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
} from '../../../commercial/domain/commercial-connection.domain-service';
import {
  COMMERCIAL_REPOSITORY,
  CommercialRepository,
} from '../../../commercial/domain/commercial.repository';

/**
 * Error específico para transferencia de chat
 */
export class TransferChatToCommercialError extends DomainError {
  constructor(message: string) {
    super(`Error en transferencia: ${message}`);
    this.name = 'TransferChatToCommercialError';
  }
}

/**
 * Transfiere un chat ASSIGNED/ACTIVE a otro comercial (debe estar online).
 * Persiste un mensaje de sistema visible en el hilo (origen → destino).
 */
@CommandHandler(TransferChatToCommercialCommand)
export class TransferChatToCommercialCommandHandler
  implements ICommandHandler<TransferChatToCommercialCommand>
{
  private readonly logger = new Logger(
    TransferChatToCommercialCommandHandler.name,
  );

  constructor(
    @Inject(CHAT_V2_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    @Inject(MESSAGE_V2_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
    @Inject(COMMERCIAL_CONNECTION_DOMAIN_SERVICE)
    private readonly commercialConnectionService: CommercialConnectionDomainService,
    @Inject(COMMERCIAL_REPOSITORY)
    private readonly commercialRepository: CommercialRepository,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(
    command: TransferChatToCommercialCommand,
  ): Promise<
    Result<{ assignedCommercialId: string }, TransferChatToCommercialError>
  > {
    try {
      this.logger.log(
        `Transfiriendo chat ${command.chatId} al comercial ${command.commercialId}`,
      );

      const chatId = ChatId.create(command.chatId);
      const chatResult = await this.chatRepository.findById(chatId);
      if (chatResult.isErr()) {
        return err(
          new TransferChatToCommercialError(
            `Chat no encontrado: ${chatResult.error.message}`,
          ),
        );
      }

      const chat = chatResult.value;

      if (!chat.status.canBeTransferred()) {
        return err(
          new TransferChatToCommercialError(
            `El chat ${command.chatId} no puede transferirse en estado ${chat.status.value}`,
          ),
        );
      }

      const currentAssignee = chat.assignedCommercialId.isPresent()
        ? chat.assignedCommercialId.get().getValue()
        : null;

      if (!currentAssignee) {
        return err(
          new TransferChatToCommercialError(
            'El chat no tiene comercial asignado',
          ),
        );
      }

      if (
        command.transferredBy &&
        command.transferredBy !== currentAssignee
      ) {
        return err(
          new TransferChatToCommercialError(
            'Solo el comercial asignado puede transferir este chat',
          ),
        );
      }

      if (currentAssignee === command.commercialId) {
        return err(
          new TransferChatToCommercialError(
            'El chat ya está asignado a ese comercial',
          ),
        );
      }

      CommercialId.create(command.commercialId);

      const serviceCommercialId = ServiceCommercialId.create(
        command.commercialId,
      );
      const isOnline =
        await this.commercialConnectionService.isCommercialOnline(
          serviceCommercialId,
        );

      if (!isOnline) {
        return err(
          new TransferChatToCommercialError(
            'El comercial de destino no está conectado',
          ),
        );
      }

      let transferredChat;
      try {
        transferredChat = chat.transferTo(command.commercialId, {
          transferredBy: command.transferredBy,
        });
      } catch (domainError) {
        return err(
          new TransferChatToCommercialError(
            domainError instanceof Error
              ? domainError.message
              : String(domainError),
          ),
        );
      }

      const updateResult = await this.chatRepository.update(transferredChat);
      if (updateResult.isErr()) {
        return err(
          new TransferChatToCommercialError(
            `Error al actualizar chat: ${updateResult.error.message}`,
          ),
        );
      }

      const fromName = await this.resolveCommercialName(currentAssignee);
      const toName = await this.resolveCommercialName(command.commercialId);
      const systemMessage = Message.createSystemMessage({
        chatId: command.chatId,
        action: 'transferred',
        fromUserId: currentAssignee,
        toUserId: command.commercialId,
        reason: 'transfer_via_mention',
        content: `Transferido de ${fromName} a ${toName}`,
        isInternal: false,
      });

      const saveMsgResult = await this.messageRepository.save(systemMessage);
      if (saveMsgResult.isErr()) {
        this.logger.error(
          `Chat transferido pero falló el mensaje de sistema: ${saveMsgResult.error.message}`,
        );
      } else {
        const messageCtx = this.eventPublisher.mergeObjectContext(systemMessage);
        messageCtx.commit();
      }

      const chatCtx = this.eventPublisher.mergeObjectContext(transferredChat);
      chatCtx.commit();

      this.logger.log(
        `Chat ${command.chatId} transferido a ${command.commercialId}`,
      );

      return ok({ assignedCommercialId: command.commercialId });
    } catch (error) {
      const errorMessage = `Error inesperado en transferencia: ${
        error instanceof Error ? error.message : String(error)
      }`;
      this.logger.error(errorMessage);
      return err(new TransferChatToCommercialError(errorMessage));
    }
  }

  private async resolveCommercialName(commercialId: string): Promise<string> {
    try {
      const result = await this.commercialRepository.findById(
        ServiceCommercialId.create(commercialId),
      );
      if (result.isOk() && result.unwrap()) {
        const name = result.unwrap()!.name.value?.trim();
        if (name) return name;
      }
    } catch {
      // fallback
    }
    return commercialId.slice(0, 8);
  }
}
