import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { SearchVisitorsQuery } from './search-visitors.query';
import {
  VISITOR_V2_REPOSITORY,
  VisitorV2Repository,
  VisitorSearchFilters,
  VisitorSearchSort,
  VisitorSearchPagination,
} from '../../domain/visitor-v2.repository';
import {
  IChatRepository,
  CHAT_V2_REPOSITORY,
} from 'src/context/conversations-v2/domain/chat.repository';
import {
  CommercialRepository,
  COMMERCIAL_REPOSITORY,
} from 'src/context/commercial/domain/commercial.repository';
import { CommercialId } from 'src/context/commercial/domain/value-objects/commercial-id';
import { TenantId } from '../../domain/value-objects/tenant-id';
import { Result, ok, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { VisitorV2PersistenceError } from '../../domain/errors/visitor-v2.error';
import {
  SearchVisitorsResponseDto,
  VisitorSummaryDto,
  PaginationInfoDto,
} from '../dtos/visitor-search-response.dto';
import { VisitorSortField, SortDirection } from '../dtos/visitor-filters.dto';

@QueryHandler(SearchVisitorsQuery)
export class SearchVisitorsQueryHandler
  implements IQueryHandler<SearchVisitorsQuery>
{
  private readonly logger = new Logger(SearchVisitorsQueryHandler.name);

  constructor(
    @Inject(VISITOR_V2_REPOSITORY)
    private readonly visitorRepository: VisitorV2Repository,
    @Inject(CHAT_V2_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    @Inject(COMMERCIAL_REPOSITORY)
    private readonly commercialRepository: CommercialRepository,
  ) {}

  async execute(
    query: SearchVisitorsQuery,
  ): Promise<Result<SearchVisitorsResponseDto, DomainError>> {
    this.logger.debug(
      `Buscando visitantes con filtros para tenant ${query.tenantId}`,
    );

    try {
      // Convertir DTOs a interfaces del repositorio
      const filters = this.mapFilters(query.filters);
      const sort = this.mapSort(query.sort);
      const pagination = this.mapPagination(query.pagination);

      // Pre-filtrar por hasPendingChats si está definido
      if (query.filters.hasPendingChats !== undefined) {
        const pendingChatsResult = await this.chatRepository.getAvailableChats(
          [],
          { status: ['PENDING'] },
          10000,
        );

        if (pendingChatsResult.isOk()) {
          const visitorIdsWithPendingChats = [
            ...new Set(
              pendingChatsResult.value.map((chat) => chat.visitorId.getValue()),
            ),
          ];

          if (query.filters.hasPendingChats === true) {
            // Si no hay chats pendientes, forzar resultado vacío con ID imposible
            filters.visitorIds =
              visitorIdsWithPendingChats.length > 0
                ? visitorIdsWithPendingChats
                : ['00000000-0000-0000-0000-000000000000'];
          } else {
            // Excluir visitantes con chats pendientes
            filters.excludeVisitorIds = visitorIdsWithPendingChats;
          }
        }
      }

      // Ejecutar búsqueda
      const result = await this.visitorRepository.searchWithFilters(
        new TenantId(query.tenantId),
        filters,
        sort,
        pagination,
      );

      if (result.isErr()) {
        return err(result.error);
      }

      let searchResult = result.unwrap();

      // Validar y auto-ajustar página si excede el total de páginas
      // Esto puede ocurrir cuando se aplican filtros que reducen drásticamente los resultados
      // mientras el usuario está en una página alta
      if (
        searchResult.page > searchResult.totalPages &&
        searchResult.totalPages > 0
      ) {
        this.logger.warn(
          `⚠️ Página solicitada (${searchResult.page}) excede totalPages (${searchResult.totalPages}). Auto-ajustando a página ${searchResult.totalPages}`,
        );

        // Re-ejecutar búsqueda con página ajustada
        const adjustedPagination = {
          ...pagination,
          page: searchResult.totalPages,
        };

        const adjustedResult = await this.visitorRepository.searchWithFilters(
          new TenantId(query.tenantId),
          filters,
          sort,
          adjustedPagination,
        );

        if (adjustedResult.isErr()) {
          return err(adjustedResult.error);
        }

        searchResult = adjustedResult.unwrap();
      }

      // Obtener fingerprints conocidos del comercial si commercialId está presente
      let commercialKnownFingerprints: string[] = [];
      if (query.commercialId) {
        try {
          const commercialResult = await this.commercialRepository.findById(
            new CommercialId(query.commercialId),
          );
          if (commercialResult.isOk() && commercialResult.unwrap()) {
            commercialKnownFingerprints = commercialResult
              .unwrap()!
              .getKnownFingerprints();
            this.logger.debug(
              `Comercial ${query.commercialId} tiene ${commercialKnownFingerprints.length} fingerprints conocidos`,
            );
          }
        } catch (error) {
          this.logger.warn(
            `Error obteniendo fingerprints del comercial ${query.commercialId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // Obtener IDs de visitantes para consultar chats
      const visitorIds = searchResult.visitors.map((v) => v.getId().getValue());

      // Obtener conteo de chats por visitante
      let chatCountsMap = new Map<string, number>();
      if (visitorIds.length > 0) {
        const chatCountsResult =
          await this.chatRepository.countByVisitorIds(visitorIds);
        if (chatCountsResult.isOk()) {
          chatCountsMap = chatCountsResult.unwrap();
        }
      }

      // Obtener chats pendientes por visitante
      const pendingChatsByVisitor = new Map<string, string[]>();
      try {
        const unassignedChatsResult =
          await this.chatRepository.getAvailableChats(
            [], // commercialIds vacío para obtener chats no asignados
            { status: ['PENDING'] }, // Solo chats pendientes
            1000, // límite de chats a obtener
          );

        if (unassignedChatsResult.isOk()) {
          // Agrupar chats pendientes por visitorId
          for (const chat of unassignedChatsResult.value) {
            const visitorId = chat.visitorId.getValue();
            const chatId = chat.id.getValue();

            if (!pendingChatsByVisitor.has(visitorId)) {
              pendingChatsByVisitor.set(visitorId, []);
            }
            pendingChatsByVisitor.get(visitorId)!.push(chatId);
          }
        }
      } catch (error) {
        this.logger.warn(
          `Error obteniendo chats pendientes: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Mapear a DTOs de respuesta
      const visitors: VisitorSummaryDto[] = searchResult.visitors.map(
        (visitor) => {
          const primitives = visitor.toPrimitives();

          // Calcular duración total de sesiones en milisegundos
          const totalSessionDuration = primitives.sessions.reduce(
            (total, session) => {
              const startTime = new Date(session.startedAt).getTime();
              const endTime = session.endedAt
                ? new Date(session.endedAt).getTime()
                : Date.now();
              return total + (endTime - startTime);
            },
            0,
          );

          // Ordenar sesiones por fecha de inicio (más reciente primero)
          const sortedSessions = [...primitives.sessions].sort((a, b) => {
            const timeA = new Date(a.startedAt).getTime();
            const timeB = new Date(b.startedAt).getTime();
            return timeB - timeA; // Descendente: más reciente primero
          });

          // Buscar la IP más reciente disponible (fallback a sesiones anteriores si la última no tiene)
          const lastIpAddress = sortedSessions.find(
            (session) => session.ipAddress,
          )?.ipAddress;

          // Buscar el UserAgent más reciente disponible (fallback a sesiones anteriores si la última no tiene)
          const lastUserAgent = sortedSessions.find(
            (session) => session.userAgent,
          )?.userAgent;

          // Lógica híbrida para determinar si este visitante es el comercial que hace la búsqueda
          // Opción 1: Match por fingerprint (más preciso)
          // Opción 2: Match por IP + UserAgent (fallback para evitar falsos positivos)
          // Opción 3: Match por IP sola (backward compatibility cuando no hay UserAgent ni commercialId)
          let isMe = false;

          // Verificar match por fingerprint si el comercial tiene fingerprints registrados
          if (
            commercialKnownFingerprints.length > 0 &&
            primitives.fingerprint
          ) {
            isMe = commercialKnownFingerprints.includes(primitives.fingerprint);
          }

          // Si no hubo match por fingerprint, intentar match por IP + UserAgent
          if (!isMe && query.requestIpAddress && query.requestUserAgent) {
            isMe = primitives.sessions.some(
              (session) =>
                session.ipAddress === query.requestIpAddress &&
                session.userAgent === query.requestUserAgent,
            );
          }

          // Backward compatibility: si no hay commercialId ni requestUserAgent, usar solo IP
          if (
            !isMe &&
            query.requestIpAddress &&
            !query.commercialId &&
            !query.requestUserAgent
          ) {
            isMe = primitives.sessions.some(
              (session) => session.ipAddress === query.requestIpAddress,
            );
          }

          return {
            id: primitives.id,
            tenantId: primitives.tenantId,
            siteId: primitives.siteId,
            lifecycle: primitives.lifecycle,
            connectionStatus: primitives.connectionStatus || 'offline',
            hasAcceptedPrivacyPolicy: primitives.hasAcceptedPrivacyPolicy,
            isInternal: primitives.isInternal,
            currentUrl: primitives.currentUrl,
            createdAt: primitives.createdAt,
            updatedAt: primitives.updatedAt,
            activeSessionsCount: primitives.sessions.filter(
              (s) => s.endedAt === null,
            ).length,
            totalSessionsCount: primitives.sessions.length,
            totalSessionDuration,
            totalChatsCount: chatCountsMap.get(primitives.id) || 0,
            pendingChatIds: pendingChatsByVisitor.get(primitives.id) || [],
            lastIpAddress,
            lastUserAgent,
            fingerprint: primitives.fingerprint,
            isMe,
          };
        },
      );

      const paginationInfo: PaginationInfoDto = {
        page: searchResult.page,
        limit: searchResult.limit,
        total: searchResult.total,
        totalPages: searchResult.totalPages,
        hasNextPage: searchResult.page < searchResult.totalPages,
        hasPreviousPage: searchResult.page > 1,
      };

      return ok({
        visitors,
        pagination: paginationInfo,
        appliedFilters: query.filters as unknown as Record<string, unknown>,
      });
    } catch (error) {
      const errorMessage = `Error en búsqueda de visitantes: ${
        error instanceof Error ? error.message : String(error)
      }`;
      this.logger.error(errorMessage);
      return err(new VisitorV2PersistenceError(errorMessage));
    }
  }

  private mapFilters(
    dto: SearchVisitorsQuery['filters'],
  ): VisitorSearchFilters {
    return {
      // Dominio/Mongo persisten lifecycle en minúsculas (anon, lead, …)
      lifecycle: dto.lifecycle?.map((value) => value.toLowerCase()),
      connectionStatus: dto.connectionStatus,
      hasAcceptedPrivacyPolicy: dto.hasAcceptedPrivacyPolicy,
      createdFrom: dto.createdFrom ? new Date(dto.createdFrom) : undefined,
      createdTo: dto.createdTo ? new Date(dto.createdTo) : undefined,
      lastActivityFrom: dto.lastActivityFrom
        ? new Date(dto.lastActivityFrom)
        : undefined,
      lastActivityTo: dto.lastActivityTo
        ? new Date(dto.lastActivityTo)
        : undefined,
      siteIds: dto.siteIds,
      currentUrlContains: dto.currentUrlContains,
      hasActiveSessions: dto.hasActiveSessions,
      minTotalSessionsCount: dto.minTotalSessionsCount,
      maxTotalSessionsCount: dto.maxTotalSessionsCount,
      ipAddress: dto.ipAddress,
      isInternal: dto.isInternal,
    };
  }

  private mapSort(dto: SearchVisitorsQuery['sort']): VisitorSearchSort {
    const fieldMap: Record<VisitorSortField, VisitorSearchSort['field']> = {
      [VisitorSortField.CREATED_AT]: 'createdAt',
      [VisitorSortField.UPDATED_AT]: 'updatedAt',
      [VisitorSortField.LAST_ACTIVITY]: 'updatedAt',
      [VisitorSortField.LIFECYCLE]: 'lifecycle',
      [VisitorSortField.CONNECTION_STATUS]: 'connectionStatus',
    };

    return {
      field: fieldMap[dto.field] || 'updatedAt',
      direction: dto.direction === SortDirection.ASC ? 'ASC' : 'DESC',
    };
  }

  private mapPagination(
    dto: SearchVisitorsQuery['pagination'],
  ): VisitorSearchPagination {
    return {
      page: dto.page || 1,
      limit: dto.limit || 20,
    };
  }
}
