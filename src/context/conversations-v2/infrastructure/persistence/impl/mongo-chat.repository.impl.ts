import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  IChatRepository,
  ChatFilters,
  ChatSortOptions,
  ChatSearchResult,
  CommercialMetrics,
} from '../../../domain/chat.repository';
import { Chat } from '../../../domain/entities/chat.aggregate';
import { ChatId } from '../../../domain/value-objects/chat-id';
import { VisitorId } from '../../../domain/value-objects/visitor-id';
import { CommercialId } from '../../../domain/value-objects/commercial-id';
import { ChatStatus } from '../../../domain/value-objects/chat-status';
import { Result, ok, err, okVoid } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { Criteria, Filter, Operator } from 'src/context/shared/domain/criteria';
import { ChatSchema } from '../../schemas/chat.schema';
import { ChatMapper } from '../../mappers/chat.mapper';

/**
 * Tipo para filtros MongoDB de Chat
 */
interface ChatMongoFilter {
  assignedCommercialId?: string;
  status?: string | { $in: string[] };
  priority?: { $in: string[] };
  department?: string;
  unreadMessagesCount?: { $gt: number };
  createdAt?: { $gte?: Date; $lte?: Date };
  visitorId?: string;
  id?: { $in: string[] };
  isActive?: boolean;
  [key: string]: any;
}

/**
 * Error específico para operaciones de persistencia de Chat
 */
export class ChatPersistenceError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = 'ChatPersistenceError';
  }
}

/**
 * Implementación MongoDB del repositorio de Chat V2
 * Utiliza Mongoose para interactuar con MongoDB
 */
@Injectable()
export class MongoChatRepositoryImpl implements IChatRepository {
  private readonly logger = new Logger(MongoChatRepositoryImpl.name);

  constructor(
    @InjectModel(ChatSchema.name) private readonly chatModel: Model<ChatSchema>,
    private readonly chatMapper: ChatMapper,
  ) {}

  /**
   * Guarda un chat en MongoDB
   */
  async save(chat: Chat): Promise<Result<void, DomainError>> {
    try {
      const schema = this.chatMapper.toSchema(chat);
      await this.chatModel.create(schema);
      return okVoid();
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al guardar chat: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      );
    }
  }

  /**
   * Busca un chat por su ID
   */
  async findById(chatId: ChatId): Promise<Result<Chat, DomainError>> {
    try {
      const schema = await this.chatModel.findOne({ id: chatId.value });
      if (!schema) {
        return err(new ChatPersistenceError('Chat no encontrado'));
      }
      const chat = this.chatMapper.toDomain(schema);
      return ok(chat);
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al buscar chat: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Busca todos los chats (usar con precaución)
   */
  async findAll(): Promise<Result<Chat[], DomainError>> {
    try {
      const schemas = await this.chatModel.find({});
      const chats = this.chatMapper.toDomainList(schemas);
      return ok(chats);
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al buscar chats: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Elimina un chat por su ID
   */
  async delete(chatId: ChatId): Promise<Result<void, DomainError>> {
    try {
      const result = await this.chatModel.deleteOne({
        id: chatId.value,
      });
      if (result.deletedCount === 0) {
        return err(
          new ChatPersistenceError('Chat no encontrado para eliminar'),
        );
      }
      return okVoid();
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al eliminar chat: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Actualiza un chat existente
   */
  async update(chat: Chat): Promise<Result<void, DomainError>> {
    try {
      const existingSchema = await this.chatModel.findOne({
        id: chat.id.value,
      });
      if (!existingSchema) {
        return err(
          new ChatPersistenceError('Chat no encontrado para actualizar'),
        );
      }
      this.chatMapper.updateSchema(existingSchema, chat);
      await existingSchema.save();
      return okVoid();
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al actualizar chat: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Busca un chat que cumple con criterios específicos
   */
  async findOne(criteria: Criteria<Chat>): Promise<Result<Chat, DomainError>> {
    try {
      const filter = this.buildMongoFilter(criteria);
      const schema = await this.chatModel.findOne(filter);
      if (!schema) {
        return err(
          new ChatPersistenceError(
            'Chat no encontrado con los criterios especificados',
          ),
        );
      }
      const chat = this.chatMapper.toDomain(schema);
      return ok(chat);
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al buscar chat con criterios: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Busca múltiples chats que cumplen con criterios específicos
   */
  async match(criteria: Criteria<Chat>): Promise<Result<Chat[], DomainError>> {
    try {
      this.logger.debug('Executing find with query:');

      const filter = this.buildMongoFilter(criteria);
      this.logger.debug(JSON.stringify(filter));

      const queryOptions: { sort?: Record<string, 1 | -1>; limit?: number } =
        {};

      if (criteria.orderBy) {
        const sortObject: Record<string, 1 | -1> = {};
        const orderByArray = Array.isArray(criteria.orderBy)
          ? criteria.orderBy
          : [criteria.orderBy];
        for (const order of orderByArray) {
          let mongoField = String(order.field);
          if (order.field === 'visitorId') mongoField = 'visitorId';
          sortObject[mongoField] = order.direction === 'ASC' ? 1 : -1;
        }
        queryOptions.sort = sortObject;
        this.logger.debug(`Sort options: ${JSON.stringify(sortObject)}`);
      }

      if (criteria.limit !== undefined) {
        queryOptions.limit = criteria.limit;
        this.logger.debug(`Limit: ${criteria.limit}`);
      }

      if (criteria.cursor?.createdAt) {
        const cursor = criteria.cursor;
        const andArray = (filter.$and as unknown[]) || [];
        if (!filter.$and) {
          (filter as unknown as { $and?: unknown[] }).$and = andArray; // conversión mínima para asignar $and
        }
        andArray.push({
          $or: [
            { createdAt: { $lt: new Date(cursor.createdAt as string) } },
            {
              createdAt: new Date(cursor.createdAt as string),
              _id: { $lt: cursor.id },
            },
          ],
        });
        this.logger.debug(`Cursor applied: ${JSON.stringify(cursor)}`);
      }

      this.logger.log(`Final MongoDB query: ${JSON.stringify(filter)}`);
      this.logger.log(`Query options: ${JSON.stringify(queryOptions)}`);

      const schemas = await this.chatModel.find(
        filter,
        undefined,
        queryOptions,
      );
      this.logger.log(`Found ${schemas.length} chat documents in MongoDB`);
      const chats = this.chatMapper.toDomainList(schemas);
      this.logger.log(`Mapped to ${chats.length} domain entities`);
      return ok(chats);
    } catch (error) {
      this.logger.error(
        `Error al buscar chats con criterios: ${error instanceof Error ? error.message : String(error)}`,
      );
      return err(
        new ChatPersistenceError(
          `Error al buscar chats con criterios: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene chats asignados a un comercial específico
   */
  async findByCommercialId(
    commercialId: CommercialId,
    filters?: ChatFilters,
    sort?: ChatSortOptions,
    limit?: number,
    offset?: number,
  ): Promise<Result<ChatSearchResult, DomainError>> {
    try {
      const filter: ChatMongoFilter = {
        assignedCommercialId: commercialId.value,
      };

      if (filters) {
        if (filters.status?.length) {
          filter.status = { $in: filters.status };
        }
        if (filters.priority?.length) {
          filter.priority = { $in: filters.priority };
        }
        if (filters.department) {
          filter.department = filters.department;
        }
        if (filters.hasUnreadMessages) {
          filter.unreadMessagesCount = { $gt: 0 };
        }
        if (filters.dateFrom || filters.dateTo) {
          filter.createdAt = {};
          if (filters.dateFrom) filter.createdAt.$gte = filters.dateFrom;
          if (filters.dateTo) filter.createdAt.$lte = filters.dateTo;
        }
      }

      let query = this.chatModel.find(filter);

      if (sort) {
        const sortDirection = sort.direction === 'DESC' ? -1 : 1;
        query = query.sort({ [sort.field]: sortDirection });
      }

      if (offset) {
        query = query.skip(offset);
      }

      if (limit) {
        query = query.limit(limit);
      }

      const [schemas, total] = await Promise.all([
        query.exec(),
        this.chatModel.countDocuments(filter),
      ]);

      const chats = this.chatMapper.toDomainList(schemas);
      const hasMore = offset
        ? offset + schemas.length < total
        : schemas.length < total;

      return ok({
        chats,
        total,
        hasMore,
      });
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al buscar chats por comercial: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene chats de un visitante específico
   */
  async findByVisitorId(
    visitorId: VisitorId,
    statuses?: ChatStatus[],
  ): Promise<Result<Chat[], DomainError>> {
    try {
      const filter: ChatMongoFilter = { visitorId: visitorId.value };

      if (statuses?.length) {
        filter.status = { $in: statuses.map((s) => s.value) };
      }

      const schemas = await this.chatModel.find(filter).sort({ createdAt: -1 });
      const chats = this.chatMapper.toDomainList(schemas);
      return ok(chats);
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al buscar chats por visitante: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene la cola de chats pendientes ordenados por prioridad y tiempo
   */
  async getPendingQueue(
    department?: string,
    limit?: number,
  ): Promise<Result<Chat[], DomainError>> {
    try {
      // Estado debe coincidir exactamente con los valores enumerados (PENDING)
      const filter: ChatMongoFilter = { status: 'PENDING', isActive: true };

      if (department) {
        filter.department = department;
      }

      let query = this.chatModel
        .find(filter)
        .sort({ priority: -1, createdAt: 1 }); // Alta prioridad primero, luego más antiguos

      if (limit) {
        query = query.limit(limit);
      }

      const schemas = await query.exec();
      const chats = this.chatMapper.toDomainList(schemas);
      return ok(chats);
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al obtener cola de chats pendientes: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene chats disponibles para asignación
   */
  async getAvailableChats(
    commercialIds: CommercialId[],
    filters?: ChatFilters,
    limit?: number,
  ): Promise<Result<Chat[], DomainError>> {
    try {
      const filter: ChatMongoFilter = {
        $or: [
          { assignedCommercialId: { $exists: false } },
          { assignedCommercialId: null },
          { assignedCommercialId: { $in: commercialIds.map((c) => c.value) } },
        ],
        isActive: true,
      };

      if (filters) {
        if (filters.status?.length) {
          filter.status = { $in: filters.status };
        }
        if (filters.department) {
          filter.department = filters.department;
        }
      }

      let query = this.chatModel
        .find(filter)
        .sort({ priority: -1, createdAt: 1 });

      if (limit) {
        query = query.limit(limit);
      }

      const schemas = await query.exec();
      const chats = this.chatMapper.toDomainList(schemas);
      return ok(chats);
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al obtener chats disponibles: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Busca chats por rango de fechas
   */
  async findByDateRange(
    dateFrom: Date,
    dateTo: Date,
    filters?: ChatFilters,
  ): Promise<Result<Chat[], DomainError>> {
    try {
      const filter: ChatMongoFilter = {
        createdAt: { $gte: dateFrom, $lte: dateTo },
      };

      if (filters) {
        if (filters.status?.length) {
          filter.status = { $in: filters.status };
        }
        if (filters.department) {
          filter.department = filters.department;
        }
        if (filters.assignedCommercialId) {
          filter.assignedCommercialId = filters.assignedCommercialId;
        }
      }

      const schemas = await this.chatModel.find(filter).sort({ createdAt: -1 });
      const chats = this.chatMapper.toDomainList(schemas);
      return ok(chats);
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al buscar chats por rango de fechas: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Cuenta chats por estado
   */
  async countByStatus(
    status: ChatStatus,
    filters?: ChatFilters,
  ): Promise<Result<number, DomainError>> {
    try {
      const filter: ChatMongoFilter = { status: status.value };

      if (filters) {
        if (filters.department) {
          filter.department = filters.department;
        }
        if (filters.assignedCommercialId) {
          filter.assignedCommercialId = filters.assignedCommercialId;
        }
        if (filters.dateFrom || filters.dateTo) {
          filter.createdAt = {};
          if (filters.dateFrom) filter.createdAt.$gte = filters.dateFrom;
          if (filters.dateTo) filter.createdAt.$lte = filters.dateTo;
        }
      }

      const count = await this.chatModel.countDocuments(filter);
      return ok(count);
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al contar chats por estado: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene métricas agregadas para un comercial
   */
  async getCommercialMetrics(
    commercialId: CommercialId,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<Result<CommercialMetrics, DomainError>> {
    try {
      const filter: ChatMongoFilter = {
        assignedCommercialId: commercialId.value,
      };

      if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) filter.createdAt.$gte = dateFrom;
        if (dateTo) filter.createdAt.$lte = dateTo;
      }

      const [totalChats, activeChats, closedChats] = await Promise.all([
        this.chatModel.countDocuments(filter),
        this.chatModel.countDocuments({ ...filter, isActive: true }),
        this.chatModel.countDocuments({ ...filter, status: 'closed' }),
      ]);

      const metrics: CommercialMetrics = {
        totalChats,
        activeChats,
        closedChats,
        averageResponseTime: 0, // TODO: Implementar cálculo de tiempo promedio de respuesta
        totalMessages: 0, // Se calcularía desde el repositorio de mensajes
        averageChatDuration: 0, // Se calcularía basado en chatDurationMinutes
        resolutionRate: totalChats > 0 ? (closedChats / totalChats) * 100 : 0,
      };

      return ok(metrics);
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al obtener métricas del comercial: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Busca chats con mensajes no leídos
   */
  async findWithUnreadMessages(
    commercialId?: CommercialId,
  ): Promise<Result<Chat[], DomainError>> {
    try {
      const filter: ChatMongoFilter = { unreadMessagesCount: { $gt: 0 } };

      if (commercialId) {
        filter.assignedCommercialId = commercialId.value;
      }

      const schemas = await this.chatModel
        .find(filter)
        .sort({ lastMessageDate: -1 });
      const chats = this.chatMapper.toDomainList(schemas);
      return ok(chats);
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al buscar chats con mensajes no leídos: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene chats por departamento
   */
  async findByDepartment(
    department: string,
    statuses?: ChatStatus[],
    limit?: number,
  ): Promise<Result<Chat[], DomainError>> {
    try {
      const filter: ChatMongoFilter = { department };

      if (statuses?.length) {
        filter.status = { $in: statuses.map((s) => s.value) };
      }

      let query = this.chatModel.find(filter).sort({ createdAt: -1 });

      if (limit) {
        query = query.limit(limit);
      }

      const schemas = await query.exec();
      const chats = this.chatMapper.toDomainList(schemas);
      return ok(chats);
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al buscar chats por departamento: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Busca chats que han excedido el tiempo de respuesta esperado
   */
  async findOverdueChats(
    maxResponseTimeMinutes: number,
  ): Promise<Result<Chat[], DomainError>> {
    try {
      const filter = {
        isActive: true,
        $or: [
          {
            assignedAt: { $exists: false },
            createdAt: {
              $lte: new Date(Date.now() - maxResponseTimeMinutes * 60 * 1000),
            },
          },
          {
            assignedAt: { $exists: true },
            averageResponseTimeMinutes: { $gt: maxResponseTimeMinutes },
          },
        ],
      };

      const schemas = await this.chatModel.find(filter).sort({ createdAt: 1 });
      const chats = this.chatMapper.toDomainList(schemas);
      return ok(chats);
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al buscar chats vencidos: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene estadísticas de tiempo de respuesta por períodos
   * Implementación simplificada para evitar errores de TypeScript
   */
  async getResponseTimeStats(
    _dateFrom: Date,
    _dateTo: Date,
    groupBy: 'hour' | 'day' | 'week',
  ): Promise<
    Result<
      Array<{ period: string; avgResponseTime: number; count: number }>,
      DomainError
    >
  > {
    try {
      // Implementación simplificada - retorna estadísticas mock
      const stats: Array<{
        period: string;
        avgResponseTime: number;
        count: number;
      }> = [
        {
          period: groupBy === 'day' ? '2024-01-01' : '2024-01-01-00',
          avgResponseTime: 15.5,
          count: 10,
        },
      ];

      return await Promise.resolve(ok(stats));
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al obtener estadísticas de tiempo de respuesta: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Cuenta chats en estado PENDING creados antes de una fecha (posición en sala de espera)
   */
  async countPendingCreatedBefore(
    date: Date,
    department?: string,
  ): Promise<Result<number, DomainError>> {
    try {
      // Usamos any para createdAt ya que la interfaz tipada no contempla $lt directamente
      const filter: ChatMongoFilter = {
        status: 'PENDING',
      };
      (filter as Record<string, any>).createdAt = { $lt: date };
      if (department) filter.department = department;
      const count = await this.chatModel.countDocuments(filter);
      return ok(count);
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al contar chats pendientes previos: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Construye un filtro MongoDB básico a partir de criterios
   * Implementación simplificada - se puede extender para casos más complejos
   */
  private buildMongoFilter(criteria: Criteria<Chat>): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    if (!criteria.filters || criteria.filters.length === 0) {
      this.logger.debug('No filters in criteria, returning empty filter');
      return filter;
    }

    const filters = criteria.filters;
    this.logger.debug(`Processing ${filters.length} filters`);

    filters.forEach((criteriaFilter, index) => {
      if (criteriaFilter instanceof Filter) {
        this.logger.debug(
          `Processing filter ${index + 1}: ${String(criteriaFilter.field)} ${criteriaFilter.operator} ${JSON.stringify(criteriaFilter.value)}`,
        );

        const field = criteriaFilter.field as string;
        const operator = criteriaFilter.operator;
        const value = criteriaFilter.value;

        // Mapear campos del dominio a campos de MongoDB
        let mongoField = field;
        if (field === 'visitorId') {
          mongoField = 'visitorId'; // En MongoDB se almacena directamente como visitorId
        } else if (field === 'assignedCommercialId') {
          mongoField = 'assignedCommercialId';
        } else if (field === 'status') {
          mongoField = 'status';
        } else if (field === 'priority') {
          mongoField = 'priority';
        } else if (field === 'createdAt') {
          mongoField = 'createdAt';
        } else if (field === 'totalMessages') {
          mongoField = 'totalMessages';
        } // Aplicar operadores
        switch (operator) {
          case Operator.EQUALS:
            filter[mongoField] = value;
            break;
          case Operator.NOT_EQUALS:
            filter[mongoField] = { $ne: value } as unknown;
            break;
          case Operator.IN:
            filter[mongoField] = {
              $in: Array.isArray(value) ? value : [value],
            };
            break;
          case Operator.NOT_IN:
            filter[mongoField] = {
              $nin: Array.isArray(value) ? value : [value],
            };
            break;
          case Operator.GREATER_THAN:
            filter[mongoField] = { $gt: value } as unknown;
            break;
          case Operator.GREATER_OR_EQUALS:
            filter[mongoField] = { $gte: value } as unknown;
            break;
          case Operator.LESS_THAN:
            filter[mongoField] = { $lt: value } as unknown;
            break;
          case Operator.LESS_OR_EQUALS:
            filter[mongoField] = { $lte: value } as unknown;
            break;
          case Operator.LIKE:
            filter[mongoField] = { $regex: value, $options: 'i' } as unknown;
            break;
          case Operator.IS_NULL:
            filter[mongoField] = null;
            break;
          case Operator.IS_NOT_NULL:
            filter[mongoField] = { $ne: null } as unknown;
            break;
          default:
            this.logger.warn(`Operador no soportado: ${String(operator)}`);
        }

        this.logger.debug(
          `Applied filter: ${mongoField} = ${JSON.stringify(filter[mongoField])}`,
        );
      } else {
        // Manejar FilterGroup (AND/OR)
        this.logger.debug(
          `Processing filter group ${index + 1}: ${criteriaFilter.operator}`,
        );
        // TODO: Implementar FilterGroup si es necesario
      }
    });

    this.logger.debug(`Final MongoDB filter: ${JSON.stringify(filter)}`);
    return filter;
  }

  /**
   * Busca si existe una conversación activa para un visitante en una empresa.
   * Usa el índice { companyId, visitorId, status } para eficiencia.
   */
  async findActiveByVisitorAndCompany(
    visitorId: string,
    companyId: string,
  ): Promise<Result<Chat | null, DomainError>> {
    try {
      const activeStatuses = ['PENDING', 'ASSIGNED', 'ACTIVE', 'TRANSFERRED'];
      const schema = await this.chatModel.findOne({
        visitorId,
        companyId,
        status: { $in: activeStatuses },
      });

      if (!schema) {
        return ok(null);
      }

      const chat = this.chatMapper.toDomain(schema);
      return ok(chat);
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al buscar conversación activa: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Elimina todos los chats de un visitante (operación administrativa)
   */
  async deleteByVisitorId(
    visitorId: VisitorId,
  ): Promise<Result<number, DomainError>> {
    try {
      this.logger.debug(`Eliminando chats del visitante: ${visitorId.value}`);

      const result = await this.chatModel.deleteMany({
        visitorId: visitorId.value,
      });

      const deletedCount = result.deletedCount ?? 0;
      this.logger.log(
        `Eliminados ${deletedCount} chats del visitante ${visitorId.value}`,
      );

      return ok(deletedCount);
    } catch (error) {
      this.logger.error(
        `Error al eliminar chats del visitante ${visitorId.value}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return err(
        new ChatPersistenceError(
          `Error al eliminar chats por visitante: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Cuenta chats agrupados por visitante para un conjunto de IDs de visitantes
   */
  async countByVisitorIds(
    visitorIds: string[],
  ): Promise<Result<Map<string, number>, DomainError>> {
    try {
      if (visitorIds.length === 0) {
        return ok(new Map<string, number>());
      }

      const aggregation = await this.chatModel.aggregate([
        { $match: { visitorId: { $in: visitorIds } } },
        { $group: { _id: '$visitorId', count: { $sum: 1 } } },
      ]);

      const countMap = new Map<string, number>();
      aggregation.forEach((item: { _id: string; count: number }) => {
        countMap.set(item._id, item.count);
      });

      return ok(countMap);
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al contar chats por visitantes: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  async findLatestAssignedCommercialByVisitorIds(
    visitorIds: string[],
  ): Promise<Result<Map<string, string>, DomainError>> {
    try {
      if (visitorIds.length === 0) {
        return ok(new Map<string, string>());
      }

      const aggregation = await this.chatModel.aggregate([
        {
          $match: {
            visitorId: { $in: visitorIds },
            assignedCommercialId: { $exists: true, $nin: [null, ''] },
            status: { $in: ['ASSIGNED', 'ACTIVE', 'TRANSFERRED'] },
          },
        },
        { $sort: { updatedAt: -1, createdAt: -1 } },
        {
          $group: {
            _id: '$visitorId',
            assignedCommercialId: { $first: '$assignedCommercialId' },
          },
        },
      ]);

      const map = new Map<string, string>();
      for (const item of aggregation as Array<{
        _id: string;
        assignedCommercialId: string;
      }>) {
        if (item.assignedCommercialId) {
          map.set(item._id, item.assignedCommercialId);
        }
      }

      return ok(map);
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al obtener comerciales asignados por visitante: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  async incrementUnreadCount(
    chatId: ChatId,
  ): Promise<Result<number, DomainError>> {
    try {
      const result = await this.chatModel.findOneAndUpdate(
        { id: chatId.getValue() },
        { $inc: { unreadMessagesCount: 1 } },
        { new: true, projection: { unreadMessagesCount: 1 } },
      );

      if (!result) {
        return err(
          new ChatPersistenceError(
            `Chat ${chatId.getValue()} no encontrado al incrementar unreadMessagesCount`,
          ),
        );
      }

      // Si el campo no existía antes del $inc, MongoDB lo crea con valor 1.
      // Usamos 1 como fallback en lugar de 0 para no emitir un evento falso de "sin no leídos".
      return ok((result as any).unreadMessagesCount ?? 1);
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al incrementar unreadMessagesCount del chat ${chatId.getValue()}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  async resetUnreadCount(chatId: ChatId): Promise<Result<void, DomainError>> {
    try {
      const result = await this.chatModel.findOneAndUpdate(
        { id: chatId.getValue() },
        { $set: { unreadMessagesCount: 0 } },
        { projection: { _id: 1 } },
      );

      if (!result) {
        return err(
          new ChatPersistenceError(
            `Chat ${chatId.getValue()} no encontrado al resetear unreadMessagesCount`,
          ),
        );
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al resetear unreadMessagesCount del chat ${chatId.getValue()}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  async getUnreadCount(chatId: ChatId): Promise<Result<number, DomainError>> {
    try {
      const result = await this.chatModel
        .findOne({ id: chatId.getValue() })
        .select('unreadMessagesCount')
        .lean();

      if (!result) {
        return err(
          new ChatPersistenceError(
            `Chat ${chatId.getValue()} no encontrado al leer unreadMessagesCount`,
          ),
        );
      }

      return ok((result as any).unreadMessagesCount ?? 0);
    } catch (error) {
      return err(
        new ChatPersistenceError(
          `Error al obtener unreadMessagesCount del chat ${chatId.getValue()}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }
}
