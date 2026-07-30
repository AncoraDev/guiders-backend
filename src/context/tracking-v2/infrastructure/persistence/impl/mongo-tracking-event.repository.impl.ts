import { Injectable, Logger } from '@nestjs/common';
import {
  TrackingEventRepository,
  PaginatedEventsResult,
  EventStats,
  VisitorEventStats,
  EventQueryOptions,
} from '../../../domain/tracking-event.repository';
import { TrackingEvent } from '../../../domain/tracking-event.aggregate';
import {
  TrackingEventId,
  VisitorId,
  SessionId,
  TenantId,
  SiteId,
  EventType,
} from '../../../domain/value-objects';
import { Result, ok, err, okVoid } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain.error';
import { Criteria } from '../../../../shared/domain/criteria';
import { TrackingEventMapper } from '../mappers/tracking-event.mapper';
import { PartitionRouterService } from '../services/partition-router.service';

/**
 * Error específico para operaciones de persistencia de TrackingEvent
 */
export class TrackingEventPersistenceError extends DomainError {
  constructor(message: string) {
    super(`Error de persistencia de tracking events: ${message}`);
  }
}

/**
 * Implementación MongoDB del repositorio de TrackingEvent
 * Usa particionamiento por mes y bulkWrite para máximo rendimiento
 */
@Injectable()
export class MongoTrackingEventRepositoryImpl
  implements TrackingEventRepository
{
  private readonly logger = new Logger(MongoTrackingEventRepositoryImpl.name);

  constructor(private readonly partitionRouter: PartitionRouterService) {}

  /**
   * Guarda un único evento
   * NOTA: Para mejor rendimiento, usa saveBatch()
   */
  async save(event: TrackingEvent): Promise<Result<void, DomainError>> {
    try {
      const model = this.partitionRouter.getModelForDate(
        event.getOccurredAt().value,
      );
      const doc = TrackingEventMapper.toPersistence(event);

      await model.create(doc);

      this.logger.debug(
        `Evento guardado: ${event.getId().getValue()} en ${model.collection.name}`,
      );

      return okVoid();
    } catch (error) {
      return err(
        new TrackingEventPersistenceError(
          `Error al guardar evento: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Guarda múltiples eventos en batch usando bulkWrite
   * Este es el método optimizado para ingesta masiva
   */
  async saveBatch(events: TrackingEvent[]): Promise<Result<void, DomainError>> {
    if (events.length === 0) {
      return okVoid();
    }

    try {
      // Agrupar eventos por partición (mes)
      const eventsByPartition = this.groupEventsByPartition(events);

      // Escribir cada partición en su collection correspondiente
      for (const [date, partitionEvents] of eventsByPartition.entries()) {
        const model = this.partitionRouter.getModelForDate(date);
        const docs = TrackingEventMapper.toPersistenceArray(partitionEvents);

        // Usar bulkWrite para máximo rendimiento
        const operations = docs.map((doc) => ({
          insertOne: { document: doc },
        }));

        await model.bulkWrite(operations, { ordered: false });

        this.logger.debug(
          `Batch guardado: ${partitionEvents.length} eventos en ${model.collection.name}`,
        );
      }

      this.logger.log(
        `Batch completo: ${events.length} eventos guardados en ${eventsByPartition.size} particiones`,
      );

      return okVoid();
    } catch (error) {
      return err(
        new TrackingEventPersistenceError(
          `Error al guardar batch: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Busca un evento por su ID
   * NOTA: Puede ser lento si no se conoce la partición
   */
  async findById(
    id: TrackingEventId,
  ): Promise<Result<TrackingEvent, DomainError>> {
    try {
      // Buscar en todas las collections (menos eficiente, pero necesario)
      const allCollections =
        await this.partitionRouter.getAllEventCollections();

      for (const collectionName of allCollections) {
        const collectionDate =
          this.parseCollectionDate(collectionName) || new Date();
        const model = this.partitionRouter.getModelForDate(collectionDate);

        const doc = await model.findOne({ id: id.getValue() }).exec();

        if (doc) {
          const event = TrackingEventMapper.fromPersistence(doc);
          return ok(event);
        }
      }

      return err(
        new TrackingEventPersistenceError(
          `Evento no encontrado: ${id.getValue()}`,
        ),
      );
    } catch (error) {
      return err(
        new TrackingEventPersistenceError(
          `Error al buscar evento: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Busca eventos que cumplen con criterios específicos
   * TODO: Implementar cuando se necesite Criteria pattern
   */
  match(
    _criteria: Criteria<TrackingEvent>,
  ): Promise<Result<TrackingEvent[], DomainError>> {
    // Placeholder para futura implementación
    return Promise.resolve(
      err(
        new TrackingEventPersistenceError('Match con Criteria no implementado'),
      ),
    );
  }

  /**
   * Cuenta eventos que cumplen con criterios específicos
   */
  count(
    _criteria: Criteria<TrackingEvent>,
  ): Promise<Result<number, DomainError>> {
    // Placeholder para futura implementación
    return Promise.resolve(
      err(
        new TrackingEventPersistenceError('Count con Criteria no implementado'),
      ),
    );
  }

  /**
   * Busca eventos de un visitante específico
   */
  async findByVisitorId(
    visitorId: VisitorId,
    options?: EventQueryOptions,
  ): Promise<Result<PaginatedEventsResult, DomainError>> {
    try {
      const filter: any = { visitorId: visitorId.getValue() };
      if (options?.eventType) {
        filter.eventType = options.eventType;
      }
      return await this.executeQuery(filter, options);
    } catch (error) {
      return err(
        new TrackingEventPersistenceError(
          `Error al buscar eventos por visitante: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Busca eventos de una sesión específica
   */
  async findBySessionId(
    sessionId: SessionId,
    options?: EventQueryOptions,
  ): Promise<Result<PaginatedEventsResult, DomainError>> {
    try {
      const filter: any = { sessionId: sessionId.getValue() };
      return await this.executeQuery(filter, options);
    } catch (error) {
      return err(
        new TrackingEventPersistenceError(
          `Error al buscar eventos por sesión: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Busca eventos de un tenant (empresa)
   */
  async findByTenantId(
    tenantId: TenantId,
    options?: EventQueryOptions,
  ): Promise<Result<PaginatedEventsResult, DomainError>> {
    try {
      const filter: any = { tenantId: tenantId.getValue() };
      return await this.executeQuery(filter, options);
    } catch (error) {
      return err(
        new TrackingEventPersistenceError(
          `Error al buscar eventos por tenant: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Busca eventos de un sitio específico
   */
  async findBySiteId(
    siteId: SiteId,
    options?: EventQueryOptions,
  ): Promise<Result<PaginatedEventsResult, DomainError>> {
    try {
      const filter: any = { siteId: siteId.getValue() };
      return await this.executeQuery(filter, options);
    } catch (error) {
      return err(
        new TrackingEventPersistenceError(
          `Error al buscar eventos por sitio: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Busca eventos por tipo
   */
  async findByEventType(
    eventType: EventType,
    options?: EventQueryOptions,
  ): Promise<Result<PaginatedEventsResult, DomainError>> {
    try {
      const filter: any = { eventType: eventType.getValue() };
      return await this.executeQuery(filter, options);
    } catch (error) {
      return err(
        new TrackingEventPersistenceError(
          `Error al buscar eventos por tipo: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Busca eventos en un rango de fechas
   */
  async findByDateRange(
    dateFrom: Date,
    dateTo: Date,
    options?: EventQueryOptions,
  ): Promise<Result<PaginatedEventsResult, DomainError>> {
    try {
      const filter: any = {
        occurredAt: { $gte: dateFrom, $lte: dateTo },
      };
      return await this.executeQuery(filter, options, dateFrom, dateTo);
    } catch (error) {
      return err(
        new TrackingEventPersistenceError(
          `Error al buscar eventos por rango de fechas: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene estadísticas de eventos para un tenant
   */
  async getStatsByTenant(
    tenantId: TenantId,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<Result<EventStats, DomainError>> {
    try {
      const filter: any = { tenantId: tenantId.getValue() };

      if (dateFrom && dateTo) {
        filter.occurredAt = { $gte: dateFrom, $lte: dateTo };
      }

      return await this.aggregateStats(filter, dateFrom, dateTo);
    } catch (error) {
      return err(
        new TrackingEventPersistenceError(
          `Error al obtener estadísticas: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene estadísticas de eventos para un sitio
   */
  async getStatsBySite(
    siteId: SiteId,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<Result<EventStats, DomainError>> {
    try {
      const filter: any = { siteId: siteId.getValue() };

      if (dateFrom && dateTo) {
        filter.occurredAt = { $gte: dateFrom, $lte: dateTo };
      }

      return await this.aggregateStats(filter, dateFrom, dateTo);
    } catch (error) {
      return err(
        new TrackingEventPersistenceError(
          `Error al obtener estadísticas por sitio: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene estadísticas de eventos para un visitante
   */
  async getStatsByVisitor(
    visitorId: VisitorId,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<Result<VisitorEventStats, DomainError>> {
    try {
      const filter: any = { visitorId: visitorId.getValue() };

      if (dateFrom && dateTo) {
        filter.occurredAt = { $gte: dateFrom, $lte: dateTo };
      }

      const models = this.getModelsForDateRange(dateFrom, dateTo);
      const allResults: any[] = [];

      for (const model of models) {
        const results = await model.aggregate([
          { $match: filter },
          {
            $group: {
              _id: '$eventType',
              count: { $sum: '$count' },
            },
          },
        ]);

        allResults.push(...results);
      }

      // Consolidar resultados
      const eventsByType: Record<string, number> = {};
      allResults.forEach((result) => {
        eventsByType[result._id] =
          (eventsByType[result._id] || 0) + result.count;
      });

      const totalEvents = Object.values(eventsByType).reduce(
        (sum, count) => sum + count,
        0,
      );

      // Obtener primera y última fecha de evento
      const firstEvent = await this.getFirstEvent(filter, models);
      const lastEvent = await this.getLastEvent(filter, models);

      // Contar sesiones únicas
      const sessionsCount = await this.countUniqueSessions(filter, models);

      const stats: VisitorEventStats = {
        visitorId: visitorId.getValue(),
        totalEvents,
        eventsByType,
        sessionsCount,
        firstEventAt: firstEvent?.occurredAt || new Date(),
        lastEventAt: lastEvent?.occurredAt || new Date(),
      };

      return ok(stats);
    } catch (error) {
      return err(
        new TrackingEventPersistenceError(
          `Error al obtener estadísticas del visitante: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Elimina eventos antiguos (para limpieza periódica)
   */
  async deleteOlderThan(date: Date): Promise<Result<number, DomainError>> {
    try {
      const droppedCollections =
        await this.partitionRouter.dropCollectionsOlderThan(date);

      this.logger.warn(
        `Eliminadas ${droppedCollections.length} collections antiguas: ${droppedCollections.join(', ')}`,
      );

      // Retornar un número aproximado (no sabemos cuántos docs había)
      return ok(droppedCollections.length * 1000); // Estimación
    } catch (error) {
      return err(
        new TrackingEventPersistenceError(
          `Error al eliminar eventos antiguos: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Cuenta eventos por tipo en un rango de fechas
   */
  async countByType(
    tenantId: TenantId,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<Result<Record<string, number>, DomainError>> {
    try {
      const filter: any = { tenantId: tenantId.getValue() };

      if (dateFrom && dateTo) {
        filter.occurredAt = { $gte: dateFrom, $lte: dateTo };
      }

      const models = this.getModelsForDateRange(dateFrom, dateTo);
      const allResults: any[] = [];

      for (const model of models) {
        const results = await model.aggregate([
          { $match: filter },
          {
            $group: {
              _id: '$eventType',
              count: { $sum: '$count' },
            },
          },
        ]);

        allResults.push(...results);
      }

      // Consolidar resultados
      const countByType: Record<string, number> = {};
      allResults.forEach((result) => {
        countByType[result._id] = (countByType[result._id] || 0) + result.count;
      });

      return ok(countByType);
    } catch (error) {
      return err(
        new TrackingEventPersistenceError(
          `Error al contar por tipo: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  // ============================================
  // Métodos privados auxiliares
  // ============================================

  /**
   * Agrupa eventos por partición (mes)
   */
  private groupEventsByPartition(
    events: TrackingEvent[],
  ): Map<Date, TrackingEvent[]> {
    const map = new Map<string, TrackingEvent[]>();

    events.forEach((event) => {
      const occurredAt = event.getOccurredAt().value;
      const key = `${occurredAt.getFullYear()}-${occurredAt.getMonth()}`;

      if (!map.has(key)) {
        map.set(key, []);
      }

      map.get(key)!.push(event);
    });

    // Convertir keys a fechas
    const result = new Map<Date, TrackingEvent[]>();

    map.forEach((eventList, key) => {
      const [year, month] = key.split('-').map(Number);
      const date = new Date(year, month, 1);
      result.set(date, eventList);
    });

    return result;
  }

  /**
   * Obtiene modelos para un rango de fechas
   */
  private getModelsForDateRange(dateFrom?: Date, dateTo?: Date): any[] {
    if (!dateFrom || !dateTo) {
      // Si no hay rango, usar mes actual
      return [this.partitionRouter.getModelForDate(new Date())];
    }

    return this.partitionRouter.getModelsForDateRange(dateFrom, dateTo);
  }

  /**
   * Ejecuta una query en múltiples particiones
   */
  private async executeQuery(
    filter: any,
    options?: EventQueryOptions,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<Result<PaginatedEventsResult, DomainError>> {
    // Añadir filtro de fechas si existe en options
    if (options?.dateFrom && options?.dateTo) {
      filter.occurredAt = {
        $gte: options.dateFrom,
        $lte: options.dateTo,
      };
      dateFrom = options.dateFrom;
      dateTo = options.dateTo;
    }

    const models = this.getModelsForDateRange(dateFrom, dateTo);
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;
    const sortField = options?.sortBy || 'occurredAt';
    const sortOrder = options?.sortOrder === 'ASC' ? 1 : -1;

    const allDocs: any[] = [];

    for (const model of models) {
      const docs = await model
        .find(filter)
        .sort({ [sortField]: sortOrder })
        .exec();

      allDocs.push(...docs);
    }

    // Ordenar y paginar en memoria (no ideal, pero necesario para multi-collection)
    allDocs.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      if (aValue < bValue) return sortOrder === 1 ? -1 : 1;
      if (aValue > bValue) return sortOrder === 1 ? 1 : -1;
      return 0;
    });

    const totalCount = allDocs.length;
    const paginatedDocs = allDocs.slice(offset, offset + limit);

    const events = TrackingEventMapper.fromPersistenceArray(paginatedDocs);

    return ok({
      events,
      totalCount,
      hasMore: offset + limit < totalCount,
    });
  }

  /**
   * Agrega estadísticas en múltiples particiones
   */
  private async aggregateStats(
    filter: any,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<Result<EventStats, DomainError>> {
    const models = this.getModelsForDateRange(dateFrom, dateTo);
    const allResults: any[] = [];

    for (const model of models) {
      const results = await model.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$eventType',
            count: { $sum: '$count' },
            visitors: { $addToSet: '$visitorId' },
            sessions: { $addToSet: '$sessionId' },
          },
        },
      ]);

      allResults.push(...results);
    }

    // Consolidar resultados
    const eventsByType: Record<string, number> = {};
    const uniqueVisitors = new Set<string>();
    const uniqueSessions = new Set<string>();

    allResults.forEach((result) => {
      eventsByType[result._id] = (eventsByType[result._id] || 0) + result.count;
      result.visitors.forEach((v: string) => uniqueVisitors.add(v));
      result.sessions.forEach((s: string) => uniqueSessions.add(s));
    });

    const totalEvents = Object.values(eventsByType).reduce(
      (sum, count) => sum + count,
      0,
    );

    const stats: EventStats = {
      totalEvents,
      eventsByType,
      uniqueVisitors: uniqueVisitors.size,
      uniqueSessions: uniqueSessions.size,
      dateRange: {
        from: dateFrom || new Date(0),
        to: dateTo || new Date(),
      },
    };

    return ok(stats);
  }

  /**
   * Obtiene el primer evento de un filtro
   */
  private async getFirstEvent(filter: any, models: any[]): Promise<any> {
    for (const model of models) {
      const doc = await model.findOne(filter).sort({ occurredAt: 1 }).exec();

      if (doc) {
        return doc;
      }
    }

    return null;
  }

  /**
   * Obtiene el último evento de un filtro
   */
  private async getLastEvent(filter: any, models: any[]): Promise<any> {
    const reversedModels = [...models].reverse();

    for (const model of reversedModels) {
      const doc = await model.findOne(filter).sort({ occurredAt: -1 }).exec();

      if (doc) {
        return doc;
      }
    }

    return null;
  }

  /**
   * Cuenta sesiones únicas
   */
  private async countUniqueSessions(
    filter: any,
    models: any[],
  ): Promise<number> {
    const sessions = new Set<string>();

    for (const model of models) {
      const docs = await model.find(filter).select('sessionId').exec();
      docs.forEach((doc) => sessions.add(doc.sessionId));
    }

    return sessions.size;
  }

  /**
   * Parsea el nombre de una collection para obtener su fecha
   */
  private parseCollectionDate(collectionName: string): Date | null {
    const match = collectionName.match(/tracking_events_(\d{4})_(\d{2})/);

    if (!match) {
      return null;
    }

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;

    return new Date(year, month, 1);
  }
}
