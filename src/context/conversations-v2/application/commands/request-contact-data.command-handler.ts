import { Inject, Logger } from '@nestjs/common';
import {
  CommandHandler,
  EventPublisher,
  ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { RequestContactDataCommand } from './request-contact-data.command';
import { GetCompanyContactFormLegalQuery } from 'src/context/company/application/queries/get-company-contact-form-legal.query';
import {
  CompanyContactFormLegal,
  ContactFormLegalPrimitives,
} from 'src/context/company/domain/value-objects/company-contact-form-legal';
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
import { MessageResponseDto } from '../dtos/message-response.dto';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

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
    private readonly publisher: EventPublisher,
    private readonly queryBus: QueryBus,
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
    const requestId = Uuid.random().value;
    const preface =
      command.preface?.trim() ||
      'Para atenderte mejor, necesitamos unos datos.';
    const legal = await this.resolveLegalSnapshot(chat.companyId);
    const message = Message.createInteractiveMessage({
      chatId: command.chatId,
      senderId: command.commercialId,
      content: preface,
      systemData: {
        action: 'contact_request',
        requestId,
        status: 'pending',
        fromUserId: command.commercialId,
        preface,
        legal,
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

  private async resolveLegalSnapshot(
    companyId: string,
  ): Promise<ContactFormLegalPrimitives> {
    try {
      const legal = await this.queryBus.execute<
        GetCompanyContactFormLegalQuery,
        ContactFormLegalPrimitives | null
      >(new GetCompanyContactFormLegalQuery(companyId));
      if (legal) {
        return legal;
      }
    } catch (error) {
      this.logger.warn(
        `No se pudieron cargar textos legales de company ${companyId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return CompanyContactFormLegal.empty().getValue();
  }
}
