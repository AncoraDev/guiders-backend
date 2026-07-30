import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import { GetChatsWithFiltersQuery } from './get-chats-with-filters.query';
import { Chat } from '../../domain/entities/chat.aggregate';
import { Inject, Logger } from '@nestjs/common';
import { Criteria, Filter, Operator } from 'src/context/shared/domain/criteria';
import {
  CHAT_V2_REPOSITORY,
  IChatRepository,
} from '../../domain/chat.repository';
import {
  MESSAGE_V2_REPOSITORY,
  IMessageRepository,
} from '../../domain/message.repository';
import { ChatId } from '../../domain/value-objects/chat-id';
import { base64ToCursor } from 'src/context/shared/domain/cursor/base64-to-cursor.util';
import { cursorToBase64 } from 'src/context/shared/domain/cursor/cursor-to-base64.util';
import { ChatListResponseDto } from '../dtos/chat-response.dto';
import { Result } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { FindUserByIdQuery } from 'src/context/auth/auth-user/application/queries/find-user-by-id.query';

/**
 * Handler para obtener chats con filtros avanzados y paginación con cursor
 */
@QueryHandler(GetChatsWithFiltersQuery)
export class GetChatsWithFiltersQueryHandler
  implements IQueryHandler<GetChatsWithFiltersQuery, ChatListResponseDto>
{
  private readonly logger = new Logger(GetChatsWithFiltersQueryHandler.name);

  constructor(
    @Inject(CHAT_V2_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    @Inject(MESSAGE_V2_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
    private readonly queryBus: QueryBus,
  ) {}

  /**
   * Obtiene los datos del comercial/usuario por su ID
   */
  private async getCommercialData(
    commercialId: string | undefined,
  ): Promise<{ id: string; name: string; avatarUrl?: string | null } | null> {
    if (!commercialId) {
      this.logger.log('[getCommercialData] commercialId es undefined o null');
      return null;
    }

    try {
      this.logger.log(
        `[getCommercialData] → Ejecutando FindUserByIdQuery para ID: ${commercialId}`,
      );
      const user = await this.queryBus.execute(
        new FindUserByIdQuery(commercialId),
      );

      this.logger.log(
        `[getCommercialData] ← Resultado: ${user ? '✓ Usuario encontrado' : '✗ Usuario NO encontrado'}`,
      );

      if (user) {
        const userName = user.name.value;
        const userAvatarUrl = user.avatarUrl.getOrNull();
        this.logger.log(
          `[getCommercialData] ✓ Retornando datos: { id: ${commercialId}, name: "${userName}", avatarUrl: "${userAvatarUrl || 'null'}" }`,
        );
        return {
          id: commercialId,
          name: userName,
          avatarUrl: userAvatarUrl,
        };
      }

      this.logger.warn(
        `[getCommercialData] ✗ Usuario ${commercialId} no encontrado, retornando NULL`,
      );
      return null;
    } catch (error) {
      this.logger.error(
        `[getCommercialData] ERROR al obtener datos del usuario ${commercialId}:`,
        error,
      );
      return null;
    }
  }

  async execute(query: GetChatsWithFiltersQuery): Promise<ChatListResponseDto> {
    const { userId, userRoles, filters, sort, cursor, limit } = query;

    this.logger.log(
      `Ejecutando query para usuario ${userId} con roles ${JSON.stringify(userRoles)}`,
    );
    this.logger.log(`Filtros recibidos: ${JSON.stringify(filters)}`);
    this.logger.log(
      `Sort: ${JSON.stringify(sort)}, Cursor: ${cursor}, Limit: ${limit}`,
    );

    try {
      // Construir filtros base
      const criteriaFilters: Filter<Chat>[] = [];

      this.logger.log(
        `Construyendo filtros base para roles: ${JSON.stringify(userRoles)}`,
      );

      // Comercial: ve sus chats asignados. Si pide explícitamente solo PENDING,
      // no aplicar filtro de assignee (usa la cola de sin asignar).
      const isAdmin = userRoles.some((role) =>
        ['admin', 'superadmin', 'supervisor'].includes(role),
      );
      const requestingOnlyPending =
        Array.isArray(filters?.status) &&
        filters.status.length > 0 &&
        filters.status.every(
          (s) => String(s).toUpperCase() === 'PENDING',
        );

      if (userRoles.includes('commercial') && !isAdmin && !requestingOnlyPending) {
        // Los comerciales solo ven chats asignados a ellos o disponibles para ellos
        criteriaFilters.push(
          new Filter<Chat>('assignedCommercialId', Operator.EQUALS, userId),
        );
        this.logger.log(
          `Filtro agregado para comercial: assignedCommercialId = ${userId}`,
        );
      } else if (requestingOnlyPending) {
        this.logger.log(
          'Comercial solicitando solo PENDING: omitiendo filtro assignedCommercialId',
        );
      }

      // Aplicar filtros adicionales si existen
      if (filters) {
        this.logger.log(`Aplicando filtros adicionales...`);

        if (filters.status) {
          criteriaFilters.push(
            new Filter<Chat>('status', Operator.IN, filters.status),
          );
          this.logger.log(
            `Filtro status agregado: ${JSON.stringify(filters.status)}`,
          );
        }
        if (filters.priority) {
          criteriaFilters.push(
            new Filter<Chat>('priority', Operator.IN, filters.priority),
          );
          this.logger.log(
            `Filtro priority agregado: ${JSON.stringify(filters.priority)}`,
          );
        }
        if (filters.visitorId) {
          criteriaFilters.push(
            new Filter<Chat>('visitorId', Operator.EQUALS, filters.visitorId),
          );
          this.logger.log(`Filtro visitorId agregado: ${filters.visitorId}`);
        }
        if (filters.assignedCommercialId) {
          criteriaFilters.push(
            new Filter<Chat>(
              'assignedCommercialId',
              Operator.EQUALS,
              filters.assignedCommercialId,
            ),
          );
          this.logger.log(
            `Filtro assignedCommercialId agregado: ${filters.assignedCommercialId}`,
          );
        }
        // Nota: department y hasUnreadMessages no son campos directos de la entidad Chat
        // Se podrían implementar como filtros especiales en el repositorio
        if (filters.dateFrom) {
          criteriaFilters.push(
            new Filter<Chat>(
              'createdAt',
              Operator.GREATER_OR_EQUALS,
              new Date(filters.dateFrom),
            ),
          );
          this.logger.log(`Filtro dateFrom agregado: ${filters.dateFrom}`);
        }
        if (filters.dateTo) {
          criteriaFilters.push(
            new Filter<Chat>(
              'createdAt',
              Operator.LESS_OR_EQUALS,
              new Date(filters.dateTo),
            ),
          );
          this.logger.log(`Filtro dateTo agregado: ${filters.dateTo}`);
        }
        // Nota: hasUnreadMessages no es un campo directo de la entidad Chat
        // Se podría implementar como filtro especial en el repositorio
      }

      this.logger.log(
        `Total de filtros construidos: ${criteriaFilters.length}`,
      );

      // Decodificar cursor si existe
      const criteriaCursor = cursor ? base64ToCursor(cursor) : undefined;
      this.logger.log(`Cursor decodificado: ${JSON.stringify(criteriaCursor)}`);

      // Configurar ordenamiento
      let criteria = new Criteria<Chat>(criteriaFilters);

      if (sort) {
        // Mapear campos de ordenamiento a propiedades disponibles
        let sortField: keyof Chat;
        switch (sort.field) {
          case 'lastMessageDate':
            // No hay getter para lastMessageDate, usar createdAt como fallback
            sortField = 'createdAt';
            break;
          case 'createdAt':
            sortField = 'createdAt';
            break;
          case 'priority':
            sortField = 'priority';
            break;
          case 'totalMessages':
            sortField = 'totalMessages';
            break;
          default:
            sortField = 'createdAt';
        }

        criteria = criteria.orderByField(sortField, sort.direction);
        this.logger.log(
          `Ordenamiento aplicado: ${sortField} ${sort.direction}`,
        );
      } else {
        // Ordenamiento por defecto: por fecha de creación descendente, luego por ID
        criteria = criteria
          .orderByField('createdAt', 'DESC')
          .orderByField('id', 'DESC');
        this.logger.log(
          `Ordenamiento por defecto aplicado: createdAt DESC, id DESC`,
        );
      }

      criteria = criteria.setLimit(limit || 20);

      if (criteriaCursor) {
        criteria = criteria.setCursor(criteriaCursor);
      }

      this.logger.log(
        `Criteria final construido con ${criteriaFilters.length} filtros y límite ${limit || 20}`,
      );

      // Ejecutar búsqueda
      this.logger.log(`Ejecutando búsqueda en repositorio...`);
      const result: Result<Chat[], DomainError> =
        await this.chatRepository.match(criteria);

      if (result.isErr()) {
        this.logger.error(`Error al buscar chats: ${result.error.message}`);
        throw new Error(result.error.message);
      }

      const chats = result.value;
      this.logger.log(`Búsqueda completada. ${chats.length} chats encontrados`);

      // Calcular cursor siguiente si hay más chats
      let nextCursor: string | null = null;
      if (chats.length > 0) {
        const lastChat = chats[chats.length - 1];
        const chatPrimitives = lastChat.toPrimitives();
        nextCursor = cursorToBase64<Chat>({
          createdAt: chatPrimitives.createdAt,
          id: chatPrimitives.id,
        });
        this.logger.log(`Next cursor generado: ${nextCursor}`);
      }

      // Verificar si hay más chats disponibles
      let hasMore = false;
      if (nextCursor && chats.length === (limit || 20)) {
        this.logger.log(`Verificando si hay más chats disponibles...`);
        const nextCriteria = new Criteria<Chat>(criteriaFilters)
          .orderByField('createdAt', 'DESC')
          .orderByField('id', 'DESC')
          .setLimit(1)
          .setCursor(base64ToCursor(nextCursor));

        const nextResult = await this.chatRepository.match(nextCriteria);
        if (nextResult.isOk()) {
          hasMore = nextResult.value.length > 0;
          this.logger.log(`Hay más chats disponibles: ${hasMore}`);
        }
      }

      // Obtener total de chats (sin paginación)
      this.logger.log(`Obteniendo total de chats sin paginación...`);
      const totalCriteria = new Criteria(criteriaFilters);
      const totalResult = await this.chatRepository.match(totalCriteria);
      const total = totalResult.isOk() ? totalResult.value.length : 0;
      this.logger.log(`Total de chats encontrados: ${total}`);

      // Obtener IDs únicos de comerciales para enriquecer datos
      this.logger.log(`Obteniendo datos de comerciales asignados...`);
      const commercialIds = [
        ...new Set(
          chats
            .map((chat) => chat.toPrimitives().assignedCommercialId)
            .filter((id): id is string => !!id),
        ),
      ];

      // Obtener datos de todos los comerciales en paralelo
      const commercialsDataMap = new Map<
        string,
        { id: string; name: string; avatarUrl?: string | null }
      >();
      await Promise.all(
        commercialIds.map(async (commercialId) => {
          const commercialData = await this.getCommercialData(commercialId);
          if (commercialData) {
            commercialsDataMap.set(commercialId, commercialData);
          }
        }),
      );

      // Obtener el último mensaje de cada chat en paralelo
      const lastMessagesMap = new Map<
        string,
        { content: string; sentAt: Date }
      >();
      await Promise.all(
        chats.map(async (chat) => {
          const chatId = chat.id.getValue();
          const lastMessageResult = await this.messageRepository.getLastMessage(
            ChatId.create(chatId),
          );
          if (lastMessageResult.isOk()) {
            const message = lastMessageResult.value;
            const messagePrimitives = message.toPrimitives();
            // Truncar contenido a 100 caracteres para preview
            const contentPreview =
              messagePrimitives.content.length > 100
                ? `${messagePrimitives.content.substring(0, 100)}...`
                : messagePrimitives.content;
            lastMessagesMap.set(chatId, {
              content: contentPreview,
              sentAt: messagePrimitives.createdAt,
            });
          }
        }),
      );

      // Mapear a DTOs de respuesta
      this.logger.log(`Mapeando ${chats.length} chats a DTOs...`);
      const chatDtos = chats.map((chat) => {
        const primitives = chat.toPrimitives();
        const commercialData = primitives.assignedCommercialId
          ? commercialsDataMap.get(primitives.assignedCommercialId)
          : null;
        const lastMessageData = lastMessagesMap.get(primitives.id);

        return {
          id: primitives.id,
          status: primitives.status,
          priority: primitives.priority,
          visitorInfo: {
            id: primitives.visitorId, // Usar el visitorId como id
            name: primitives.visitorInfo.name || '',
            email: primitives.visitorInfo.email || '',
            phone: primitives.visitorInfo.phone,
            location: primitives.visitorInfo.location
              ? `${primitives.visitorInfo.location.city || ''}, ${primitives.visitorInfo.location.country || ''}`
              : undefined,
            additionalData: {
              company: primitives.visitorInfo.company,
              ipAddress: primitives.visitorInfo.ipAddress,
              referrer: primitives.visitorInfo.referrer,
              userAgent: primitives.visitorInfo.userAgent,
            },
          },
          assignedCommercialId: primitives.assignedCommercialId,
          assignedCommercial: commercialData
            ? {
                id: commercialData.id,
                name: commercialData.name,
                avatarUrl: commercialData.avatarUrl ?? null,
              }
            : null,
          availableCommercialIds: primitives.availableCommercialIds,
          metadata: {
            department: primitives.metadata?.department || '',
            source: primitives.metadata?.source || '',
            initialUrl: undefined, // No disponible en ChatMetadataData
            userAgent: undefined, // No disponible en ChatMetadataData
            referrer: undefined, // No disponible en ChatMetadataData
            tags: primitives.metadata?.tags,
            customFields: primitives.metadata?.customFields,
          },
          createdAt: primitives.createdAt,
          assignedAt: undefined, // No disponible en primitives
          closedAt: primitives.closedAt,
          lastMessageDate:
            lastMessageData?.sentAt || primitives.lastMessageDate,
          lastMessagePreview:
            lastMessageData?.content || primitives.lastMessageContent,
          unreadMessagesCount: 0, // No disponible en primitives
          isActive: primitives.status !== 'CLOSED',
          visitorId: primitives.visitorId,
          department: primitives.metadata?.department || '',
          tags: [], // No disponible en primitives
          updatedAt: primitives.updatedAt,
          averageResponseTimeMinutes: primitives.responseTimeSeconds
            ? primitives.responseTimeSeconds / 60
            : undefined,
          chatDurationMinutes: undefined, // No disponible en primitives
          resolutionStatus: undefined, // No disponible en primitives
          satisfactionRating: undefined, // No disponible en primitives
        };
      });

      const finalResult = {
        chats: chatDtos,
        total,
        hasMore,
        nextCursor: hasMore ? nextCursor : null,
      };

      this.logger.log(
        `Resultado final: ${finalResult.chats.length} chats, total: ${finalResult.total}, hasMore: ${finalResult.hasMore}`,
      );

      return finalResult;
    } catch (error) {
      this.logger.error(`Error ejecutando query: ${error}`);
      throw new Error(
        `Error al obtener chats: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
