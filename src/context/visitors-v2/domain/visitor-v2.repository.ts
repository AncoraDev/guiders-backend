import { VisitorV2 } from './visitor-v2.aggregate';
import { VisitorId } from './value-objects/visitor-id';
import { SiteId } from './value-objects/site-id';
import { TenantId } from './value-objects/tenant-id';
import { VisitorFingerprint } from './value-objects/visitor-fingerprint';
import { SessionId } from './value-objects/session-id';
import { Result } from '../../shared/domain/result';
import { DomainError } from '../../shared/domain/domain.error';

export const VISITOR_V2_REPOSITORY = Symbol('VisitorV2Repository');

/**
 * Opciones de filtrado para búsqueda avanzada de visitantes
 */
export interface VisitorSearchFilters {
  lifecycle?: string[];
  connectionStatus?: string[];
  hasAcceptedPrivacyPolicy?: boolean;
  createdFrom?: Date;
  createdTo?: Date;
  lastActivityFrom?: Date;
  lastActivityTo?: Date;
  siteIds?: string[];
  currentUrlContains?: string;
  hasActiveSessions?: boolean;
  minTotalSessionsCount?: number;
  maxTotalSessionsCount?: number;
  isInternal?: boolean;
  /** true = solo bloqueados; false = excluir bloqueados */
  blocked?: boolean;
  ipAddress?: string;
  /** Incluir solo visitantes con estos IDs (para filtros cross-collection) */
  visitorIds?: string[];
  /** Excluir visitantes con estos IDs (para filtros cross-collection inversos) */
  excludeVisitorIds?: string[];
}

/**
 * Opciones de ordenamiento
 */
export interface VisitorSearchSort {
  field: 'createdAt' | 'updatedAt' | 'lifecycle' | 'connectionStatus';
  direction: 'ASC' | 'DESC';
}

/**
 * Opciones de paginación
 */
export interface VisitorSearchPagination {
  page: number;
  limit: number;
}

/**
 * Resultado de búsqueda con metadatos de paginación
 */
export interface VisitorSearchResult {
  visitors: VisitorV2[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Resultado paginado con count total para queries con paginación
 */
export interface PaginatedVisitorsResult {
  visitors: VisitorV2[];
  totalCount: number;
}

/**
 * Repositorio de dominio para VisitorV2
 * Define los métodos principales del repositorio de visitantes V2
 */
export interface VisitorV2Repository {
  /**
   * Guarda un visitante en el repositorio
   */
  save(visitor: VisitorV2): Promise<Result<void, DomainError>>;

  /**
   * Busca un visitante por su ID
   */
  findById(id: VisitorId): Promise<Result<VisitorV2, DomainError>>;

  /**
   * De una lista de ids, devuelve los que tienen bloqueo activo.
   */
  findBlockedIds(visitorIds: string[]): Promise<string[]>;

  /**
   * Busca un visitante por su fingerprint y siteId
   */
  findByFingerprintAndSite(
    fingerprint: VisitorFingerprint,
    siteId: SiteId,
  ): Promise<Result<VisitorV2, DomainError>>;

  /**
   * Busca todos los visitantes con un fingerprint específico
   */
  findByFingerprint(
    fingerprint: string,
  ): Promise<Result<VisitorV2[], DomainError>>;

  /**
   * Busca un visitante por sessionId
   */
  findBySessionId(
    sessionId: SessionId,
  ): Promise<Result<VisitorV2, DomainError>>;

  /**
   * Busca todos los visitantes de un sitio
   */
  findBySiteId(siteId: SiteId): Promise<Result<VisitorV2[], DomainError>>;

  /**
   * Busca todos los visitantes de un tenant
   */
  findByTenantId(tenantId: TenantId): Promise<Result<VisitorV2[], DomainError>>;

  /**
   * Elimina un visitante por su ID
   */
  delete(id: VisitorId): Promise<Result<void, DomainError>>;

  /**
   * Busca todos los visitantes
   */
  findAll(): Promise<Result<VisitorV2[], DomainError>>;

  /**
   * Actualiza un visitante existente
   */
  update(visitor: VisitorV2): Promise<Result<void, DomainError>>;

  /**
   * Busca visitantes que tienen sesiones activas (sin endedAt)
   */
  findWithActiveSessions(options?: {
    tenantId?: TenantId;
    limit?: number;
  }): Promise<Result<VisitorV2[], DomainError>>;

  /**
   * Busca visitantes de un sitio con información extendida para reportes
   * Retorna los visitantes paginados y el count total de registros
   */
  findBySiteIdWithDetails(
    siteId: SiteId,
    options?: {
      includeOffline?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<Result<PaginatedVisitorsResult, DomainError>>;

  /**
   * Busca visitantes de un sitio que tienen chats no asignados
   */
  findWithUnassignedChatsBySiteId(
    siteId: SiteId,
    options?: {
      maxWaitTimeMinutes?: number;
      limit?: number;
      offset?: number;
    },
  ): Promise<Result<VisitorV2[], DomainError>>;

  /**
   * Busca visitantes de un sitio que tienen chats en cola (PENDING)
   */
  findWithQueuedChatsBySiteId(
    siteId: SiteId,
    options?: {
      priorityFilter?: string[];
      limit?: number;
      offset?: number;
    },
  ): Promise<Result<VisitorV2[], DomainError>>;

  /**
   * Busca visitantes de un tenant con información extendida para reportes
   * Retorna los visitantes paginados y el count total de registros
   */
  findByTenantIdWithDetails(
    tenantId: TenantId,
    options?: {
      includeOffline?: boolean;
      limit?: number;
      offset?: number;
      sortBy?: string;
      sortOrder?: string;
    },
  ): Promise<Result<PaginatedVisitorsResult, DomainError>>;

  /**
   * Busca visitantes de un tenant que tienen chats no asignados
   */
  findWithUnassignedChatsByTenantId(
    tenantId: TenantId,
    options?: {
      maxWaitTimeMinutes?: number;
      limit?: number;
      offset?: number;
    },
  ): Promise<Result<VisitorV2[], DomainError>>;

  /**
   * Busca visitantes de un tenant que tienen chats en cola (PENDING)
   */
  findWithQueuedChatsByTenantId(
    tenantId: TenantId,
    options?: {
      priorityFilter?: string[];
      limit?: number;
      offset?: number;
    },
  ): Promise<Result<VisitorV2[], DomainError>>;

  /**
   * Busca visitantes con filtros complejos, ordenamiento y paginación
   */
  searchWithFilters(
    tenantId: TenantId,
    filters: VisitorSearchFilters,
    sort: VisitorSearchSort,
    pagination: VisitorSearchPagination,
  ): Promise<Result<VisitorSearchResult, DomainError>>;

  /**
   * Cuenta visitantes que coinciden con los filtros (para estadísticas de filtros rápidos)
   */
  countWithFilters(
    tenantId: TenantId,
    filters: VisitorSearchFilters,
  ): Promise<Result<number, DomainError>>;
}
