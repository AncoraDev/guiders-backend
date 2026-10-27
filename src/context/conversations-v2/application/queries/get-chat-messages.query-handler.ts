import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { GetChatMessagesQuery } from './get-chat-messages.query';
import {
  MESSAGE_V2_REPOSITORY,
  IMessageRepository,
} from '../../domain/message.repository';
import {
  CHAT_V2_REPOSITORY,
  IChatRepository,
} from '../../domain/chat.repository';
import { ChatId } from '../../domain/value-objects/chat-id';
import {
  MessageListResponseDto,
  MessageResponseDto,
} from '../dtos/message-response.dto';
import {
  USER_ACCOUNT_REPOSITORY,
  UserAccountRepository,
} from 'src/context/auth/auth-user/domain/user-account.repository';
import { senderDisplayNames } from '../sender-display-name';

@QueryHandler(GetChatMessagesQuery)
export class GetChatMessagesQueryHandler
  implements IQueryHandler<GetChatMessagesQuery>
{
  private readonly logger = new Logger(GetChatMessagesQueryHandler.name);

  constructor(
    @Inject(MESSAGE_V2_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
    @Inject(CHAT_V2_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly userAccounts: UserAccountRepository,
  ) {}

  async execute(query: GetChatMessagesQuery): Promise<MessageListResponseDto> {
    this.logger.debug(
      `Ejecutando consulta para obtener mensajes del chat: ${query.chatId}`,
    );

    try {
      // Validar que el chat existe
      const chatId = ChatId.create(query.chatId);
      const chatResult = await this.chatRepository.findById(chatId);

      if (chatResult.isErr()) {
        throw new Error(`Chat no encontrado: ${query.chatId}`);
      }

      const chat = chatResult.unwrap();

      if (
        !this.hasPermissionToViewMessages(
          { visitorId: chat.visitorId?.getValue() },
          query.userId,
          query.userRoles,
        )
      ) {
        throw new Error('Sin permisos para ver mensajes de este chat');
      }

      // Obtener mensajes usando el método directo del repositorio
      const messagesResult = await this.messageRepository.findByChatId(
        chatId,
        {
          dateFrom: query.filters?.dateFrom
            ? new Date(query.filters.dateFrom)
            : undefined,
          dateTo: query.filters?.dateTo
            ? new Date(query.filters.dateTo)
            : undefined,
          types: query.filters?.messageType
            ? [query.filters.messageType]
            : undefined,
          keyword: undefined,
        },
        {
          field: query.sort?.field || 'sentAt',
          direction: query.sort?.direction || 'DESC',
        },
        query.limit, // Agregar el límite aquí
        this.parseCursor(query.cursor), // Offset como último parámetro
      );

      if (messagesResult.isErr()) {
        throw new Error(
          `Error al obtener mensajes: ${messagesResult.error.message}`,
        );
      }

      const searchResult = messagesResult.unwrap();
      const names = await senderDisplayNames(
        this.userAccounts,
        searchResult.messages.map((message) => message.senderId || ''),
      );

      // Mapear a DTOs
      const messageDtos: MessageResponseDto[] = searchResult.messages.map(
        (message) => ({
          id: message.id.getValue(),
          chatId: message.chatId.getValue(),
          senderId: message.senderId || '',
          senderName: names.get(message.senderId || '') || undefined,
          content: message.content.getValue(),
          type: message.type.getValue(),
          systemData: message.systemData || undefined,
          attachment: message.attachment || undefined,
          isInternal: message.isInternal,
          isFirstResponse: message.isFirstResponse,
          isRead: message.isRead,
          readAt: message.readAt?.toISOString(),
          readBy: message.readBy || undefined,
          isAI: message.isAI,
          aiMetadata: message.aiMetadata || undefined,
          createdAt: message.createdAt.toISOString(),
          updatedAt: message.updatedAt.toISOString(),
        }),
      );

      return {
        messages: messageDtos,
        total: searchResult.total,
        hasMore: searchResult.hasMore,
        nextCursor: searchResult.hasMore
          ? this.encodeCursor(
              messageDtos[messageDtos.length - 1],
              this.parseCursor(query.cursor),
              query.limit || 20,
            ) || undefined
          : undefined,
      };
    } catch (error) {
      this.logger.error('Error en GetChatMessagesQueryHandler', error);
      throw error;
    }
  }

  /**
   * Verifica si el usuario tiene permisos para ver mensajes del chat
   */
  private hasPermissionToViewMessages(
    chat: { visitorId?: string },
    userId?: string,
    userRoles?: string[],
  ): boolean {
    // Los administradores, superadmin, supervisores y comerciales pueden ver todos los chats
    const allowedRoles = ['admin', 'superadmin', 'supervisor', 'commercial'];

    // Verificar si ALGUNO de los roles del usuario está en la lista de roles permitidos
    if (userRoles && userRoles.some((role) => allowedRoles.includes(role))) {
      return true;
    }

    // Los visitantes solo pueden ver sus propios chats
    if (userRoles && userRoles.includes('visitor') && userId) {
      return Boolean(chat.visitorId && chat.visitorId === userId);
    }

    return false;
  }

  /**
   * Parsea el cursor de paginación
   */
  private parseCursor(cursor?: string): number {
    if (!cursor) return 0;

    try {
      const decoded = Buffer.from(cursor, 'base64').toString();
      const data = JSON.parse(decoded) as { offset?: number; lastId?: string };
      return data.offset || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Codifica el cursor para el siguiente lote
   */
  private encodeCursor(
    lastMessage?: MessageResponseDto,
    currentOffset = 0,
    limit = 0,
  ): string | null {
    if (!lastMessage) return null;

    const cursorData = {
      lastId: lastMessage.id,
      offset: currentOffset + limit, // Calcular el siguiente offset
    };

    return Buffer.from(JSON.stringify(cursorData)).toString('base64');
  }
}
