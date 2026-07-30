import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { GetChatPresenceQuery } from './get-chat-presence.query';
import { ChatPresenceDto } from '../dtos/chat-presence.dto';
import { ParticipantPresenceDto } from '../dtos/participant-presence.dto';
import {
  CHAT_V2_REPOSITORY,
  IChatRepository,
} from '../../domain/chat.repository';
import { ChatId } from '../../domain/value-objects/chat-id';
import {
  COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
  CommercialConnectionDomainService,
} from '../../../commercial/domain/commercial-connection.domain-service';
import {
  VISITOR_CONNECTION_DOMAIN_SERVICE,
  VisitorConnectionDomainService,
} from '../../../visitors-v2/domain/visitor-connection.domain-service';
import { CommercialId } from '../../../commercial/domain/value-objects/commercial-id';
import { VisitorId } from '../../../visitors-v2/domain/value-objects/visitor-id';

/**
 * Query handler para obtener el estado de presencia de los participantes de un chat
 *
 * Retorna información sobre:
 * - Estado de conexión (online, offline, away, busy, chatting)
 * - Si están escribiendo actualmente
 * - Última actividad (si está disponible)
 */
@QueryHandler(GetChatPresenceQuery)
export class GetChatPresenceQueryHandler
  implements IQueryHandler<GetChatPresenceQuery, ChatPresenceDto>
{
  private readonly logger = new Logger(GetChatPresenceQueryHandler.name);

  constructor(
    @Inject(CHAT_V2_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    @Inject(COMMERCIAL_CONNECTION_DOMAIN_SERVICE)
    private readonly commercialConnectionService: CommercialConnectionDomainService,
    @Inject(VISITOR_CONNECTION_DOMAIN_SERVICE)
    private readonly visitorConnectionService: VisitorConnectionDomainService,
  ) {}

  async execute(query: GetChatPresenceQuery): Promise<ChatPresenceDto> {
    this.logger.debug(`Obteniendo presencia para chat ${query.chatId}`);

    try {
      // Obtener información del chat
      const chatResult = await this.chatRepository.findById(
        ChatId.create(query.chatId),
      );

      if (chatResult.isErr()) {
        throw new Error(`Chat no encontrado: ${query.chatId}`);
      }

      const chat = chatResult.unwrap();
      const chatPrimitives = chat.toPrimitives();

      const participants: ParticipantPresenceDto[] = [];

      // Obtener presencia del visitante
      const visitorId = new VisitorId(chatPrimitives.visitorId);
      const visitorStatus =
        await this.visitorConnectionService.getConnectionStatus(visitorId);
      const visitorTyping = await this.visitorConnectionService.isTyping(
        visitorId,
        query.chatId,
      );
      const visitorLastActivity =
        await this.visitorConnectionService.getLastActivity(visitorId);

      participants.push({
        userId: chatPrimitives.visitorId,
        userType: 'visitor',
        connectionStatus: visitorStatus.getValue(),
        isTyping: visitorTyping,
        lastActivity: visitorLastActivity.value.toISOString(),
      });

      // Obtener presencia del comercial asignado
      if (chatPrimitives.assignedCommercialId) {
        const commercialId = new CommercialId(
          chatPrimitives.assignedCommercialId,
        );
        const commercialStatus =
          await this.commercialConnectionService.getConnectionStatus(
            commercialId,
          );
        const commercialTyping =
          await this.commercialConnectionService.isTyping(
            commercialId,
            query.chatId,
          );
        const commercialLastActivity =
          await this.commercialConnectionService.getLastActivity(commercialId);

        participants.push({
          userId: chatPrimitives.assignedCommercialId,
          userType: 'commercial',
          connectionStatus: commercialStatus.value,
          isTyping: commercialTyping,
          lastActivity: commercialLastActivity.value.toISOString(),
        });
      } else {
        // Chat PENDING sin asignar: incluir comerciales disponibles del tenant.
        // Sin esto el widget del visitante marca "Desconectado" aunque haya
        // agentes online en Console (falso negativo histórico → "haz refresh").
        const available =
          await this.commercialConnectionService.getAvailableCommercials(
            chatPrimitives.companyId,
          );

        for (const commercialId of available) {
          const commercialStatus =
            await this.commercialConnectionService.getConnectionStatus(
              commercialId,
            );
          const commercialTyping =
            await this.commercialConnectionService.isTyping(
              commercialId,
              query.chatId,
            );
          const commercialLastActivity =
            await this.commercialConnectionService.getLastActivity(
              commercialId,
            );

          participants.push({
            userId: commercialId.value,
            userType: 'commercial',
            connectionStatus: commercialStatus.value,
            isTyping: commercialTyping,
            lastActivity: commercialLastActivity.value.toISOString(),
          });
        }
      }

      return {
        chatId: query.chatId,
        participants,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Error al obtener presencia del chat ${query.chatId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }
}
