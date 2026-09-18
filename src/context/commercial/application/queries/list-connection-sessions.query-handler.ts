import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { Result } from 'src/context/shared/domain/result';
import {
  USER_ACCOUNT_REPOSITORY,
  UserAccountRepository,
} from 'src/context/auth/auth-user/domain/user-account.repository';
import {
  COMMERCIAL_CONNECTION_SESSION_REPOSITORY,
  CommercialConnectionSessionRepository,
  ConnectionSessionSearchResult,
} from '../../domain/commercial-connection-session.repository';
import { ListConnectionSessionsQuery } from './list-connection-sessions.query';

const ADMIN_ROLES = ['admin', 'supervisor'];

/**
 * Devuelve el registro de conexiones de la empresa aplicando el alcance del
 * solicitante.
 *
 * La Console abre la sesión con el id de Keycloak del comercial, mientras que
 * el usuario autenticado llega con su id interno. Para un comercial se buscan
 * los dos identificadores, porque si no nunca vería sus propias conexiones.
 */
@QueryHandler(ListConnectionSessionsQuery)
export class ListConnectionSessionsQueryHandler
  implements
    IQueryHandler<
      ListConnectionSessionsQuery,
      Result<ConnectionSessionSearchResult, DomainError>
    >
{
  private readonly logger = new Logger(ListConnectionSessionsQueryHandler.name);

  constructor(
    @Inject(COMMERCIAL_CONNECTION_SESSION_REPOSITORY)
    private readonly sessionRepository: CommercialConnectionSessionRepository,
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly userAccountRepository: UserAccountRepository,
  ) {}

  async execute(
    query: ListConnectionSessionsQuery,
  ): Promise<Result<ConnectionSessionSearchResult, DomainError>> {
    const isAdmin = query.requesterRoles.some((role) =>
      ADMIN_ROLES.includes(role),
    );

    const commercialIds = isAdmin
      ? query.filters.commercialId
        ? [query.filters.commercialId]
        : undefined
      : await this.resolveOwnIds(query.requesterId);

    return this.sessionRepository.search({
      companyId: query.companyId,
      commercialIds,
      from: query.filters.from,
      to: query.filters.to,
      endReason: query.filters.endReason,
      status: query.filters.status,
      page: query.filters.page,
      limit: query.filters.limit,
    });
  }

  /** Id interno y de Keycloak del comercial, sin duplicados. */
  private async resolveOwnIds(requesterId: string): Promise<string[]> {
    const ids = new Set<string>([requesterId]);

    try {
      const userAccount =
        await this.userAccountRepository.findById(requesterId);
      const keycloakId = userAccount?.keycloakId.getOrNull();
      if (keycloakId) {
        ids.add(keycloakId.value);
      }
    } catch (error) {
      this.logger.warn(
        `No se pudo resolver el id de Keycloak de ${requesterId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return Array.from(ids);
  }
}
