/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  IMessageRepository,
  MessageFilters,
  MessageSortOptions,
  MessageSearchResult,
  ConversationStats,
  MessageMetrics,
} from '../../../domain/message.repository';
import { Message } from '../../../domain/entities/message.aggregate';
import { MessageId } from '../../../domain/value-objects/message-id';
import { ChatId } from '../../../domain/value-objects/chat-id';
import { MessageType } from '../../../domain/value-objects/message-type';
import { VisitorId } from '../../../domain/value-objects/visitor-id';
import { CommercialId } from '../../../domain/value-objects/commercial-id';
import { Result, ok, err, okVoid } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { Criteria, Filter, Operator } from 'src/context/shared/domain/criteria';
import { MessageSchema } from '../../schemas/message.schema';
import { ChatSchema } from '../../schemas/chat.schema';
import { MessageMapper } from '../../mappers/message.mapper';

/**
 * Error específico para operaciones de persistencia de Message
 */
export class MessagePersistenceError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = 'MessagePersistenceError';
  }
}

/**
 * Implementación MongoDB del repositorio de Message V2
 * Utiliza Mongoose para interactuar con MongoDB
 */
@Injectable()
export class MongoMessageRepositoryImpl implements IMessageRepository {
  constructor(
    @InjectModel(MessageSchema.name)
    private readonly messageModel: Model<MessageSchema>,
    @InjectModel(ChatSchema.name)
    private readonly chatModel: Model<ChatSchema>,
    private readonly messageMapper: MessageMapper,
  ) {}

  /**
   * Guarda un mensaje en MongoDB
   */
  async save(message: Message): Promise<Result<void, DomainError>> {
    try {
      const schema = this.messageMapper.toSchema(message);

      // Obtener el siguiente número de secuencia para el chat
      const lastMessage = await this.messageModel
        .findOne({ chatId: message.chatId.value })
        .sort({ sequenceNumber: -1 });

      schema.sequenceNumber = lastMessage ? lastMessage.sequenceNumber + 1 : 1;
      schema.senderType = await this.resolveSenderType(
        message.chatId.value,
        schema.senderId,
        schema.senderType,
      );

      await this.messageModel.create(schema);
      return okVoid();
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al guardar mensaje: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Resuelve si el remitente es el visitante del chat o un comercial.
   *
   * El dominio solo guarda senderId, y el mapper no puede distinguir roles a
   * partir de un UUID: comparar contra el visitorId del chat es la única fuente
   * fiable. Sin esto todos los mensajes se guardaban como 'visitor', lo que
   * rompía los contadores de no leídos y el renderizado en Console y el SDK.
   */
  private async resolveSenderType(
    chatId: string,
    senderId: string,
    mappedType: string,
  ): Promise<string> {
    if (mappedType === 'system' || mappedType === 'ai') {
      return mappedType;
    }

    const chat = await this.chatModel.findOne({ id: chatId }, { visitorId: 1 });
    if (!chat) {
      return mappedType;
    }

    return chat.visitorId === senderId ? 'visitor' : 'commercial';
  }

  /**
   * Busca un mensaje por su ID
   */
  async findById(messageId: MessageId): Promise<Result<Message, DomainError>> {
    try {
      const schema = await this.messageModel.findOne({
        id: messageId.value,
        isDeleted: false,
      });
      if (!schema) {
        return err(new MessagePersistenceError('Mensaje no encontrado'));
      }

      const message = this.messageMapper.toDomain(schema);
      return ok(message);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al buscar mensaje: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Busca todos los mensajes (usar con precaución)
   */
  async findAll(): Promise<Result<Message[], DomainError>> {
    try {
      const schemas = await this.messageModel.find({ isDeleted: false });
      const messages = this.messageMapper.toDomainList(schemas);
      return ok(messages);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al buscar mensajes: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Elimina un mensaje por su ID (marca como eliminado)
   */
  async delete(messageId: MessageId): Promise<Result<void, DomainError>> {
    try {
      const result = await this.messageModel.updateOne(
        { id: messageId.value },
        {
          isDeleted: true,
          deletedAt: new Date(),
          updatedAt: new Date(),
        },
      );

      if (result.matchedCount === 0) {
        return err(
          new MessagePersistenceError('Mensaje no encontrado para eliminar'),
        );
      }

      return okVoid();
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al eliminar mensaje: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Actualiza un mensaje existente (simplificado)
   */
  async update(message: Message): Promise<Result<void, DomainError>> {
    try {
      const result = await this.messageModel.updateOne(
        { id: message.id.value, isDeleted: false },
        { updatedAt: new Date() },
      );

      if (result.matchedCount === 0) {
        return err(
          new MessagePersistenceError('Mensaje no encontrado para actualizar'),
        );
      }

      return okVoid();
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al actualizar mensaje: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  } /**
   * Busca un mensaje que cumple con criterios específicos
   */
  async findOne(
    criteria: Criteria<Message>,
  ): Promise<Result<Message, DomainError>> {
    try {
      const filter = this.buildMongoFilter(criteria);
      filter.isDeleted = false;

      const schema = await this.messageModel.findOne(filter);

      if (!schema) {
        return err(
          new MessagePersistenceError(
            'Mensaje no encontrado con los criterios especificados',
          ),
        );
      }

      const message = this.messageMapper.toDomain(schema);
      return ok(message);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al buscar mensaje con criterios: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Busca múltiples mensajes que cumplen con criterios específicos
   */
  async match(
    criteria: Criteria<Message>,
  ): Promise<Result<Message[], DomainError>> {
    try {
      const mongoFilter = this.buildMongoFilter(criteria);
      mongoFilter.isDeleted = false;

      const schemas = await this.messageModel.find(mongoFilter);
      const messages = this.messageMapper.toDomainList(schemas);
      return ok(messages);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al buscar mensajes con criterios: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Cuenta mensajes que cumplen con criterios específicos
   */
  async count(
    criteria: Criteria<Message>,
  ): Promise<Result<number, DomainError>> {
    try {
      const mongoFilter = this.buildMongoFilter(criteria);
      mongoFilter.isDeleted = false;

      const count = await this.messageModel.countDocuments(mongoFilter);
      return ok(count);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al contar mensajes con criterios: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene todos los mensajes de un chat ordenados cronológicamente
   */
  async findByChatId(
    chatId: ChatId,
    filters?: MessageFilters,
    sort?: MessageSortOptions,
    limit?: number,
    offset?: number,
  ): Promise<Result<MessageSearchResult, DomainError>> {
    try {
      const filter: any = {
        chatId: chatId.value,
        isDeleted: false,
      };

      if (filters) {
        if (filters.types?.length) {
          filter.type = { $in: filters.types };
        }
        if (filters.senderId) {
          filter.senderId = filters.senderId;
        }
        if (filters.senderType) {
          filter.senderType = filters.senderType;
        }
        if (filters.isRead !== undefined) {
          filter.isRead = filters.isRead;
        }
        if (filters.hasAttachments) {
          filter.fileInfo = { $exists: true };
        }
        if (filters.keyword) {
          filter.$or = [
            { 'content.text': { $regex: filters.keyword, $options: 'i' } },
            {
              searchableText: {
                $regex: filters.keyword.toLowerCase(),
                $options: 'i',
              },
            },
          ];
        }
        if (filters.dateFrom || filters.dateTo) {
          filter.sentAt = {};
          if (filters.dateFrom) filter.sentAt.$gte = filters.dateFrom;
          if (filters.dateTo) filter.sentAt.$lte = filters.dateTo;
        }
      }

      let query = this.messageModel.find(filter);

      if (sort) {
        const sortDirection = sort.direction === 'DESC' ? -1 : 1;
        query = query.sort({ [sort.field]: sortDirection });
      } else {
        query = query.sort({ sequenceNumber: 1 }); // Orden cronológico por defecto
      }

      if (offset) {
        query = query.skip(offset);
      }

      if (limit) {
        query = query.limit(limit);
      }

      const [schemas, total] = await Promise.all([
        query.exec(),
        this.messageModel.countDocuments(filter),
      ]);

      const messages = this.messageMapper.toDomainList(schemas);

      // Para paginación por cursor, hasMore es true si:
      // 1. Se obtuvieron exactamente 'limit' registros (indica que hay más)
      // 2. O si el offset + registros obtenidos < total
      const hasMore = limit ? schemas.length === limit : schemas.length < total;

      return ok({
        messages,
        total,
        hasMore,
      });
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al buscar mensajes por chat: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene mensajes enviados por un visitante específico
   */
  async findByVisitorId(
    visitorId: VisitorId,
    chatId?: ChatId,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<Result<Message[], DomainError>> {
    try {
      const filter: any = {
        senderId: visitorId.value,
        senderType: 'visitor',
        isDeleted: false,
      };

      if (chatId) {
        filter.chatId = chatId.value;
      }

      if (dateFrom || dateTo) {
        filter.sentAt = {};
        if (dateFrom) filter.sentAt.$gte = dateFrom;
        if (dateTo) filter.sentAt.$lte = dateTo;
      }

      const schemas = await this.messageModel.find(filter).sort({ sentAt: 1 });
      const messages = this.messageMapper.toDomainList(schemas);
      return ok(messages);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al buscar mensajes por visitante: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene mensajes enviados por un comercial específico
   */
  async findByCommercialId(
    commercialId: CommercialId,
    chatId?: ChatId,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<Result<Message[], DomainError>> {
    try {
      const filter: any = {
        senderId: commercialId.value,
        senderType: 'commercial',
        isDeleted: false,
      };

      if (chatId) {
        filter.chatId = chatId.value;
      }

      if (dateFrom || dateTo) {
        filter.sentAt = {};
        if (dateFrom) filter.sentAt.$gte = dateFrom;
        if (dateTo) filter.sentAt.$lte = dateTo;
      }

      const schemas = await this.messageModel.find(filter).sort({ sentAt: 1 });
      const messages = this.messageMapper.toDomainList(schemas);
      return ok(messages);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al buscar mensajes por comercial: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene mensajes no leídos de un chat
   */
  async getUnreadMessages(
    chatId: ChatId,
    forRole?: 'visitor' | 'commercial',
  ): Promise<Result<Message[], DomainError>> {
    try {
      const filter: any = {
        chatId: chatId.value,
        isRead: false,
        isDeleted: false,
      };

      if (forRole) {
        // Si buscamos no leídos para visitante, buscamos mensajes de comerciales
        // Si buscamos no leídos para comercial, buscamos mensajes de visitantes
        filter.senderType = forRole === 'visitor' ? 'commercial' : 'visitor';
      }

      const schemas = await this.messageModel.find(filter).sort({ sentAt: 1 });
      const messages = this.messageMapper.toDomainList(schemas);
      return ok(messages);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al buscar mensajes no leídos: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Marca mensajes como leídos (actualizado para simplificar)
   * @param messageIds - Array de IDs de mensajes en formato string
   * @param readBy - ID del usuario que marca como leído (string)
   * @returns Number de mensajes marcados como leídos
   */
  async markAsRead(
    messageIds: string[],
    readBy: string,
  ): Promise<Result<number, DomainError>> {
    try {
      const now = new Date();

      const result = await this.messageModel.updateMany(
        { id: { $in: messageIds }, isDeleted: false },
        {
          isRead: true,
          readBy: readBy,
          readAt: now,
          updatedAt: now,
        },
      );

      return ok(result.modifiedCount);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al marcar mensajes como leídos: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene el último mensaje de un chat
   */
  async getLastMessage(chatId: ChatId): Promise<Result<Message, DomainError>> {
    try {
      const schema = await this.messageModel
        .findOne({
          chatId: chatId.value,
          isDeleted: false,
        })
        .sort({ sentAt: -1, sequenceNumber: -1 });

      if (!schema) {
        return err(
          new MessagePersistenceError(
            'No se encontró ningún mensaje en el chat',
          ),
        );
      }

      const message = this.messageMapper.toDomain(schema);
      return ok(message);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al obtener último mensaje: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene el primer mensaje de un chat
   */
  async getFirstMessage(chatId: ChatId): Promise<Result<Message, DomainError>> {
    try {
      const schema = await this.messageModel
        .findOne({
          chatId: chatId.value,
          isDeleted: false,
        })
        .sort({ sentAt: 1, sequenceNumber: 1 });

      if (!schema) {
        return err(
          new MessagePersistenceError(
            'No se encontró ningún mensaje en el chat',
          ),
        );
      }

      const message = this.messageMapper.toDomain(schema);
      return ok(message);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al obtener primer mensaje: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Busca mensajes por tipo
   */
  async findByType(
    messageType: MessageType,
    chatId?: ChatId,
    limit?: number,
  ): Promise<Result<Message[], DomainError>> {
    try {
      const filter: any = {
        type: messageType.value,
        isDeleted: false,
      };

      if (chatId) {
        filter.chatId = chatId.value;
      }

      let query = this.messageModel.find(filter).sort({ sentAt: -1 });

      if (limit) {
        query = query.limit(limit);
      }

      const schemas = await query.exec();
      const messages = this.messageMapper.toDomainList(schemas);
      return ok(messages);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al buscar mensajes por tipo: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Busca mensajes por contenido (búsqueda de texto)
   */
  async searchByContent(
    keyword: string,
    chatId?: ChatId,
    filters?: MessageFilters,
  ): Promise<Result<Message[], DomainError>> {
    try {
      const filter: any = {
        $or: [
          { 'content.text': { $regex: keyword, $options: 'i' } },
          { searchableText: { $regex: keyword.toLowerCase(), $options: 'i' } },
        ],
        isDeleted: false,
      };

      if (chatId) {
        filter.chatId = chatId.value;
      }

      if (filters) {
        if (filters.types?.length) {
          filter.type = { $in: filters.types };
        }
        if (filters.senderId) {
          filter.senderId = filters.senderId;
        }
        if (filters.senderType) {
          filter.senderType = filters.senderType;
        }
        if (filters.dateFrom || filters.dateTo) {
          filter.sentAt = {};
          if (filters.dateFrom) filter.sentAt.$gte = filters.dateFrom;
          if (filters.dateTo) filter.sentAt.$lte = filters.dateTo;
        }
      }

      const schemas = await this.messageModel.find(filter).sort({ sentAt: -1 });
      const messages = this.messageMapper.toDomainList(schemas);
      return ok(messages);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al buscar mensajes por contenido: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene mensajes con archivos adjuntos
   */
  async findWithAttachments(
    chatId?: ChatId,
    fileTypes?: string[],
  ): Promise<Result<Message[], DomainError>> {
    try {
      const filter: any = {
        fileInfo: { $exists: true },
        isDeleted: false,
      };

      if (chatId) {
        filter.chatId = chatId.value;
      }

      if (fileTypes?.length) {
        filter['fileInfo.mimeType'] = { $in: fileTypes };
      }

      const schemas = await this.messageModel.find(filter).sort({ sentAt: -1 });
      const messages = this.messageMapper.toDomainList(schemas);
      return ok(messages);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al buscar mensajes con archivos: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Cuenta mensajes por chat
   */
  async countByChatId(
    chatId: ChatId,
    filters?: MessageFilters,
  ): Promise<Result<number, DomainError>> {
    try {
      const filter: any = {
        chatId: chatId.value,
        isDeleted: false,
      };

      if (filters) {
        if (filters.types?.length) {
          filter.type = { $in: filters.types };
        }
        if (filters.senderId) {
          filter.senderId = filters.senderId;
        }
        if (filters.senderType) {
          filter.senderType = filters.senderType;
        }
        if (filters.isRead !== undefined) {
          filter.isRead = filters.isRead;
        }
        if (filters.dateFrom || filters.dateTo) {
          filter.sentAt = {};
          if (filters.dateFrom) filter.sentAt.$gte = filters.dateFrom;
          if (filters.dateTo) filter.sentAt.$lte = filters.dateTo;
        }
      }

      const count = await this.messageModel.countDocuments(filter);
      return ok(count);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al contar mensajes: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene estadísticas de conversación
   */
  async getConversationStats(
    chatId: ChatId,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<Result<ConversationStats, DomainError>> {
    try {
      const filter: any = {
        chatId: chatId.value,
        isDeleted: false,
      };

      if (dateFrom || dateTo) {
        filter.sentAt = {};
        if (dateFrom) filter.sentAt.$gte = dateFrom;
        if (dateTo) filter.sentAt.$lte = dateTo;
      }

      const [
        totalMessages,
        messagesByType,
        unreadCount,
        lastActivity,
        participantCount,
      ] = await Promise.all([
        this.messageModel.countDocuments(filter),
        this.messageModel.aggregate([
          { $match: filter },
          { $group: { _id: '$type', count: { $sum: 1 } } },
        ]),
        this.messageModel.countDocuments({ ...filter, isRead: false }),
        this.messageModel.findOne(filter, { sentAt: 1 }).sort({ sentAt: -1 }),
        this.messageModel.distinct('senderId', filter),
      ]);

      const stats: ConversationStats = {
        totalMessages,
        messagesByType: Object.fromEntries(
          messagesByType.map((m) => [m._id, m.count]),
        ),
        averageResponseTime: 0, // Se calcularía con lógica más compleja
        unreadCount,
        lastActivity: lastActivity?.sentAt || new Date(),
        participantCount: participantCount.length,
      };

      return ok(stats);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al obtener estadísticas de conversación: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene métricas de mensajería por período
   */
  async getMessageMetrics(
    dateFrom: Date,
    dateTo: Date,
    groupBy: 'hour' | 'day' | 'week',
    chatId?: ChatId,
  ): Promise<Result<MessageMetrics[], DomainError>> {
    try {
      let groupFormat: string;
      switch (groupBy) {
        case 'hour':
          groupFormat = '%Y-%m-%d %H:00:00';
          break;
        case 'day':
          groupFormat = '%Y-%m-%d';
          break;
        case 'week':
          groupFormat = '%Y-W%V';
          break;
      }

      const matchStage: any = {
        sentAt: { $gte: dateFrom, $lte: dateTo },
        isDeleted: false,
      };

      if (chatId) {
        matchStage.chatId = chatId.value;
      }

      const pipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: {
              period: {
                $dateToString: { format: groupFormat, date: '$sentAt' },
              },
              type: '$type',
            },
            count: { $sum: 1 },
            avgLength: { $avg: { $strLenCP: '$content.text' } },
          },
        },
        {
          $group: {
            _id: '$_id.period',
            totalMessages: { $sum: '$count' },
            messagesByType: {
              $push: {
                k: '$_id.type',
                v: '$count',
              },
            },
            averageLength: { $avg: '$avgLength' },
          },
        },
        { $sort: { _id: 1 as const } },
      ];

      const results = await this.messageModel.aggregate(pipeline);
      const metrics = results.map((r) => ({
        period: r._id,
        totalMessages: r.totalMessages,
        messagesByType: Object.fromEntries(
          (r.messagesByType as Array<{ k: string; v: number }>).map((m) => [
            m.k,
            m.v,
          ]),
        ),
        averageLength: r.averageLength,
        responseTimeMinutes: 0, // Se calcularía con lógica adicional
      }));

      return ok(metrics);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al obtener métricas de mensajería: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene el tiempo promedio de respuesta entre mensajes
   */
  async getAverageResponseTime(
    chatId: ChatId,
    between?: 'visitor-commercial' | 'commercial-visitor',
  ): Promise<Result<number, DomainError>> {
    try {
      // Esta implementación requiere lógica compleja para calcular tiempos de respuesta
      // Se podría implementar usando agregaciones de MongoDB más avanzadas

      const filter: any = {
        chatId: chatId.value,
        isDeleted: false,
      };

      if (between === 'visitor-commercial') {
        filter.senderType = 'commercial';
      } else if (between === 'commercial-visitor') {
        filter.senderType = 'visitor';
      }

      // Implementación simplificada - retorna 0 por ahora
      // En una implementación real, se calcularían los tiempos entre mensajes consecutivos

      return await Promise.resolve(ok(0));
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al calcular tiempo promedio de respuesta: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Busca mensajes por rango de fechas
   */
  async findByDateRange(
    dateFrom: Date,
    dateTo: Date,
    chatId?: ChatId,
    filters?: MessageFilters,
  ): Promise<Result<Message[], DomainError>> {
    try {
      const filter: any = {
        sentAt: { $gte: dateFrom, $lte: dateTo },
        isDeleted: false,
      };

      if (chatId) {
        filter.chatId = chatId.value;
      }

      if (filters) {
        if (filters.types?.length) {
          filter.type = { $in: filters.types };
        }
        if (filters.senderId) {
          filter.senderId = filters.senderId;
        }
        if (filters.senderType) {
          filter.senderType = filters.senderType;
        }
      }

      const schemas = await this.messageModel.find(filter).sort({ sentAt: 1 });
      const messages = this.messageMapper.toDomainList(schemas);
      return ok(messages);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al buscar mensajes por rango de fechas: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene mensajes del sistema para un chat
   */
  async getSystemMessages(
    chatId: ChatId,
    limit?: number,
  ): Promise<Result<Message[], DomainError>> {
    try {
      const filter = {
        chatId: chatId.value,
        type: 'system',
        isDeleted: false,
      };

      let query = this.messageModel.find(filter).sort({ sentAt: -1 });

      if (limit) {
        query = query.limit(limit);
      }

      const schemas = await query.exec();
      const messages = this.messageMapper.toDomainList(schemas);
      return ok(messages);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al obtener mensajes del sistema: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Busca el último mensaje leído por un usuario
   */
  async getLastReadMessage(
    chatId: ChatId,
    userId: VisitorId | CommercialId,
  ): Promise<Result<Message, DomainError>> {
    try {
      const schema = await this.messageModel
        .findOne({
          chatId: chatId.value,
          readBy: userId.value,
          isRead: true,
          isDeleted: false,
        })
        .sort({ readAt: -1 });

      if (!schema) {
        return err(
          new MessagePersistenceError(
            'No se encontró ningún mensaje leído por el usuario',
          ),
        );
      }

      const message = this.messageMapper.toDomain(schema);
      return ok(message);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al obtener último mensaje leído: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Obtiene la secuencia de mensajes entre dos fechas
   */
  async getMessageSequence(
    chatId: ChatId,
    fromMessageId?: MessageId,
    toMessageId?: MessageId,
  ): Promise<Result<Message[], DomainError>> {
    try {
      const filter: any = {
        chatId: chatId.value,
        isDeleted: false,
      };

      if (fromMessageId || toMessageId) {
        // Obtener números de secuencia de los mensajes límite
        let fromSeqNum: number | undefined;
        let toSeqNum: number | undefined;

        if (fromMessageId) {
          const fromMessage = await this.messageModel.findOne(
            { id: fromMessageId.value },
            { sequenceNumber: 1 },
          );
          fromSeqNum = fromMessage?.sequenceNumber;
        }

        if (toMessageId) {
          const toMessage = await this.messageModel.findOne(
            { id: toMessageId.value },
            { sequenceNumber: 1 },
          );
          toSeqNum = toMessage?.sequenceNumber;
        }

        // Implementación simplificada para evitar errores de TypeScript
        // En una implementación completa se manejarían los números de secuencia
        if (fromSeqNum) {
          // filter.sequenceNumber = { $gte: fromSeqNum };
        }
        if (toSeqNum) {
          // filter.sequenceNumber = {
          //   ...filter.sequenceNumber,
          //   $lte: toSeqNum,
          // };
        }

        // TODO: Implementar filtro por números de secuencia
        void fromSeqNum; // Evitar warning de variable no usada
        void toSeqNum; // Evitar warning de variable no usada
      }

      const schemas = await this.messageModel
        .find(filter)
        .sort({ sequenceNumber: 1 });
      const messages = this.messageMapper.toDomainList(schemas);
      return ok(messages);
    } catch (error) {
      return err(
        new MessagePersistenceError(
          `Error al obtener secuencia de mensajes: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Construye un filtro MongoDB básico a partir de criterios
   * Implementación simplificada - se puede extender para casos más complejos
   */

  private buildMongoFilter(criteria: Criteria<Message>): Record<string, any> {
    const filter: Record<string, any> = {};

    if (!criteria.filters || criteria.filters.length === 0) {
      return filter;
    }

    const filters = criteria.filters;

    filters.forEach((criteriaFilter) => {
      if (criteriaFilter instanceof Filter) {
        const field = criteriaFilter.field as string;
        const operator = criteriaFilter.operator;
        const value = criteriaFilter.value;

        // Mapear campos del dominio a campos de MongoDB
        let mongoField = field;
        if (field === 'chatId') {
          mongoField = 'chatId';
        } else if (field === 'senderId') {
          mongoField = 'senderId';
        } else if (field === 'senderType') {
          mongoField = 'senderType';
        } else if (field === 'type') {
          mongoField = 'type';
        } else if (field === 'content') {
          mongoField = 'content';
        } else if (field === 'sentAt') {
          mongoField = 'sentAt';
        } else if (field === 'readAt') {
          mongoField = 'readAt';
        } else if (field === 'isRead') {
          mongoField = 'isRead';
        }

        // Aplicar operadores
        switch (operator) {
          case Operator.EQUALS:
            filter[mongoField] = value;
            break;
          case Operator.NOT_EQUALS:
            filter[mongoField] = { $ne: value };
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
            filter[mongoField] = { $gt: value };
            break;
          case Operator.GREATER_OR_EQUALS:
            filter[mongoField] = { $gte: value };
            break;
          case Operator.LESS_THAN:
            filter[mongoField] = { $lt: value };
            break;
          case Operator.LESS_OR_EQUALS:
            filter[mongoField] = { $lte: value };
            break;
          case Operator.LIKE:
            filter[mongoField] = { $regex: value, $options: 'i' };
            break;
          default:
            filter[mongoField] = value;
            break;
        }
      }
    });

    return filter;
  }
}
