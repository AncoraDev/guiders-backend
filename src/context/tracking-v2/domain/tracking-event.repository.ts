import { TrackingEvent } from './tracking-event.aggregate';
import {
  TrackingEventId,
  VisitorId,
  SessionId,
  TenantId,
  SiteId,
  EventType,
} from './value-objects';
import { Result } from '../../shared/domain/result';
import { DomainError } from '../../shared/domain/domain.error';
import { Criteria } from '../../shared/domain/criteria';

export const TRACKING_EVENT_REPOSITORY = Symbol('TrackingEventRepository');

/**
 * Opciones para consultas de eventos
 */
export interface EventQueryOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'occurredAt' | 'eventType';
  sortOrder?: 'ASC' | 'DESC';
  dateFrom?: Date;
  dateTo?: Date;
  /** Filtrar por tipo de evento (p. ej. PAGE_VIEW) */
  eventType?: string;
}

/**
 * Resultado paginado de eventos
 */
export interface PaginatedEventsResult {
  events: TrackingEvent[];
  totalCount: number;
  hasMore: boolean;
}

/**
 * Estadísticas de eventos
 */
export interface EventStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  uniqueVisitors: number;
  uniqueSessions: number;
  dateRange: {
    from: Date;
    to: Date;
  };
}

/**
 * Estadísticas de eventos por visitante
 */
export interface VisitorEventStats {
  visitorId: string;
  totalEvents: number;
  eventsByType: Record<string, number>;
  sessionsCount: number;
  firstEventAt: Date;
  lastEventAt: Date;
}

/**
 * Repositorio de dominio para TrackingEvent
 * Define los métodos principales del repositorio de eventos de tracking
 */
export interface TrackingEventRepository {
  /**
   * Guarda un único evento en el repositorio
   */
  save(event: TrackingEvent): Promise<Result<void, DomainError>>;

  /**
   * Guarda múltiples eventos en batch (operación optimizada)
   * Este es el método principal para ingesta de eventos
   */
  saveBatch(events: TrackingEvent[]): Promise<Result<void, DomainError>>;

  /**
   * Busca un evento por su ID
   */
  findById(id: TrackingEventId): Promise<Result<TrackingEvent, DomainError>>;

  /**
   * Busca eventos que cumplen con criterios específicos
   */
  match(
    criteria: Criteria<TrackingEvent>,
  ): Promise<Result<TrackingEvent[], DomainError>>;

  /**
   * Cuenta eventos que cumplen con criterios específicos
   */
  count(
    criteria: Criteria<TrackingEvent>,
  ): Promise<Result<number, DomainError>>;

  /**
   * Busca eventos de un visitante específico
   */
  findByVisitorId(
    visitorId: VisitorId,
    options?: EventQueryOptions,
  ): Promise<Result<PaginatedEventsResult, DomainError>>;

  /**
   * Busca eventos de una sesión específica
   */
  findBySessionId(
    sessionId: SessionId,
    options?: EventQueryOptions,
  ): Promise<Result<PaginatedEventsResult, DomainError>>;

  /**
   * Busca eventos de un tenant (empresa)
   */
  findByTenantId(
    tenantId: TenantId,
    options?: EventQueryOptions,
  ): Promise<Result<PaginatedEventsResult, DomainError>>;

  /**
   * Busca eventos de un sitio específico
   */
  findBySiteId(
    siteId: SiteId,
    options?: EventQueryOptions,
  ): Promise<Result<PaginatedEventsResult, DomainError>>;

  /**
   * Busca eventos por tipo
   */
  findByEventType(
    eventType: EventType,
    options?: EventQueryOptions,
  ): Promise<Result<PaginatedEventsResult, DomainError>>;

  /**
   * Busca eventos en un rango de fechas
   */
  findByDateRange(
    dateFrom: Date,
    dateTo: Date,
    options?: EventQueryOptions,
  ): Promise<Result<PaginatedEventsResult, DomainError>>;

  /**
   * Obtiene estadísticas de eventos para un tenant
   */
  getStatsByTenant(
    tenantId: TenantId,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<Result<EventStats, DomainError>>;

  /**
   * Obtiene estadísticas de eventos para un sitio
   */
  getStatsBySite(
    siteId: SiteId,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<Result<EventStats, DomainError>>;

  /**
   * Obtiene estadísticas de eventos para un visitante
   */
  getStatsByVisitor(
    visitorId: VisitorId,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<Result<VisitorEventStats, DomainError>>;

  /**
   * Elimina eventos antiguos (para limpieza periódica)
   * Retorna el número de eventos eliminados
   */
  deleteOlderThan(date: Date): Promise<Result<number, DomainError>>;

  /**
   * Cuenta eventos por tipo en un rango de fechas
   */
  countByType(
    tenantId: TenantId,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<Result<Record<string, number>, DomainError>>;
}
