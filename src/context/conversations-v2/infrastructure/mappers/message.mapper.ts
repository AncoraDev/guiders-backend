import { Injectable } from '@nestjs/common';
import { Message } from '../../domain/entities/message.aggregate';
import { MessageSchema } from '../schemas/message.schema';

/**
 * Mapper para convertir entre entidades Message del dominio y esquemas MongoDB
 */
@Injectable()
export class MessageMapper {
  /**
   * Convierte una entidad de dominio Message a esquema MongoDB
   */
  toSchema(message: Message): MessageSchema {
    const schema = new MessageSchema();
    const messagePrimitives = message.toPrimitives();

    schema.id = message.id.value;
    schema.chatId = message.chatId.value;
    schema.type = message.type.value;
    schema.senderId = messagePrimitives.senderId;
    schema.senderType = this.determineSenderType(messagePrimitives.senderId);
    schema.sentAt = messagePrimitives.createdAt;
    schema.readAt = messagePrimitives.readAt;
    schema.readBy = messagePrimitives.readBy;
    schema.isRead = messagePrimitives.isRead;
    schema.isEdited = false;
    schema.editedAt = undefined;
    schema.isDeleted = false;
    schema.deletedAt = undefined;
    schema.sequenceNumber = 0; // Se actualizará en el repositorio
    schema.replyToMessageId = undefined;
    schema.isInternal = messagePrimitives.isInternal;
    schema.tags = [];

    // Mapear contenido
    schema.content = {
      text: messagePrimitives.content,
      metadata: messagePrimitives.systemData || {},
      attachments: messagePrimitives.attachment
        ? [
            {
              id: `${message.id.value}-attachment`,
              name: messagePrimitives.attachment.fileName,
              url: messagePrimitives.attachment.url,
              type: messagePrimitives.attachment.mimeType,
              size: messagePrimitives.attachment.fileSize,
              mimeType: messagePrimitives.attachment.mimeType,
            },
          ]
        : undefined,
    };

    // Campos adicionales según el tipo de mensaje
    if (message.type.isFile() && messagePrimitives.attachment) {
      schema.fileInfo = {
        originalName: messagePrimitives.attachment.fileName,
        mimeType: messagePrimitives.attachment.mimeType,
        size: messagePrimitives.attachment.fileSize,
        url: messagePrimitives.attachment.url,
        downloadCount: 0,
      };
    }

    // Para mensajes de imagen también establecer fileInfo
    if (message.type.isImage() && messagePrimitives.attachment) {
      schema.fileInfo = {
        originalName: messagePrimitives.attachment.fileName,
        mimeType: messagePrimitives.attachment.mimeType,
        size: messagePrimitives.attachment.fileSize,
        url: messagePrimitives.attachment.url,
        downloadCount: 0,
      };
    }

    // Para mensajes del sistema / interactivos
    if (messagePrimitives.systemData) {
      schema.systemInfo = {
        action: messagePrimitives.systemData.action || 'unknown',
        previousValue: undefined,
        newValue: undefined,
        triggeredBy: messagePrimitives.systemData.fromUserId,
        automationRule: messagePrimitives.systemData.reason,
      };
    }

    // Para mensajes de IA
    schema.isAI = messagePrimitives.isAI || false;
    if (messagePrimitives.aiMetadata) {
      schema.aiInfo = {
        model: messagePrimitives.aiMetadata.model,
        confidence: messagePrimitives.aiMetadata.confidence,
        suggestedActions: messagePrimitives.aiMetadata.suggestedActions,
        processingTimeMs: messagePrimitives.aiMetadata.processingTimeMs,
        context: messagePrimitives.aiMetadata.context,
      };
    }

    // Texto de búsqueda
    schema.searchableText = messagePrimitives.content.toLowerCase();

    return schema;
  }

  /**
   * Convierte un esquema MongoDB a entidad de dominio Message
   */
  toDomain(schema: MessageSchema): Message {
    return Message.fromPrimitives({
      id: schema.id,
      chatId: schema.chatId,
      senderId: schema.senderId,
      content: schema.content.text,
      type: schema.type,
      systemData: this.mapSystemData(schema),
      attachment: schema.fileInfo
        ? {
            url: schema.fileInfo.url,
            fileName: schema.fileInfo.originalName,
            fileSize: schema.fileInfo.size,
            mimeType: schema.fileInfo.mimeType,
          }
        : undefined,
      isInternal: schema.isInternal,
      isFirstResponse: false, // Se determinará en la lógica de negocio
      isRead: schema.isRead,
      readAt: schema.readAt,
      readBy: schema.readBy,
      isAI: schema.isAI || false,
      aiMetadata: schema.aiInfo
        ? {
            model: schema.aiInfo.model,
            confidence: schema.aiInfo.confidence,
            suggestedActions: schema.aiInfo.suggestedActions,
            processingTimeMs: schema.aiInfo.processingTimeMs,
            context: schema.aiInfo.context,
          }
        : undefined,
      createdAt: schema.sentAt,
      updatedAt: schema.updatedAt || schema.sentAt,
    });
  }

  /**
   * Convierte múltiples esquemas a entidades de dominio
   */
  toDomainList(schemas: MessageSchema[]): Message[] {
    return schemas.map((schema) => this.toDomain(schema));
  }

  /**
   * Convierte múltiples entidades de dominio a esquemas
   */
  toSchemaList(messages: Message[]): MessageSchema[] {
    return messages.map((message) => this.toSchema(message));
  }

  /**
   * Actualiza un esquema existente con datos de una entidad de dominio
   */
  updateSchema(existingSchema: MessageSchema): MessageSchema {
    // Los mensajes son inmutables, solo se pueden marcar como leídos/editados/eliminados
    // Esto se manejará a través de métodos específicos en el repositorio
    existingSchema.updatedAt = new Date();
    return existingSchema;
  }

  /**
   * Marca un mensaje como leído
   */
  markAsRead(
    schema: MessageSchema,
    readBy: string,
    readAt: Date = new Date(),
  ): MessageSchema {
    schema.isRead = true;
    schema.readBy = readBy;
    schema.readAt = readAt;
    schema.updatedAt = new Date();
    return schema;
  }

  /**
   * Marca un mensaje como eliminado
   */
  markAsDeleted(
    schema: MessageSchema,
    deletedAt: Date = new Date(),
  ): MessageSchema {
    schema.isDeleted = true;
    schema.deletedAt = deletedAt;
    schema.updatedAt = new Date();
    return schema;
  }

  private mapSystemData(schema: MessageSchema) {
    const metadata = schema.content?.metadata;
    if (
      metadata &&
      typeof metadata === 'object' &&
      Object.keys(metadata).length > 0
    ) {
      return metadata as {
        action?: string;
        fromUserId?: string;
        toUserId?: string;
        reason?: string;
        requestId?: string;
        status?: 'pending' | 'submitted' | 'confirmed' | 'cancelled';
        data?: {
          nombre?: string;
          apellidos?: string;
          email?: string;
          telefono?: string;
          poblacion?: string;
          comentarios?: string;
        };
      };
    }
    if (!schema.systemInfo) {
      return undefined;
    }
    return {
      action: schema.systemInfo.action,
      fromUserId: schema.systemInfo.triggeredBy,
      reason: schema.systemInfo.automationRule,
    };
  }

  /**
   * Determina el tipo de remitente basado en el ID
   */
  private determineSenderType(senderId: string): string {
    if (senderId === 'system') {
      return 'system';
    }
    if (senderId === 'ai') {
      return 'ai';
    }
    // Aquí podríamos implementar lógica más sofisticada
    // Por ahora asumimos que si no es 'system' o 'ai', es un visitante o comercial
    // En un caso real, consultaríamos la base de datos o tendríamos un prefijo en el ID
    return senderId.startsWith('commercial_') ? 'commercial' : 'visitor';
  }

  /**
   * Métodos helper para crear mensajes desde el mapper
   */
  createTextMessageSchema(
    chatId: string,
    senderId: string,
    text: string,
    sequenceNumber: number,
  ): MessageSchema {
    const message = Message.createTextMessage({
      chatId,
      senderId,
      content: text,
      isInternal: false,
      isFirstResponse: false,
    });
    const schema = this.toSchema(message);
    schema.sequenceNumber = sequenceNumber;
    return schema;
  }

  createSystemMessageSchema(
    chatId: string,
    action: string,
    details?: Record<string, unknown>,
  ): MessageSchema {
    const message = Message.createSystemMessage({
      chatId,
      action,
      fromUserId: details?.fromUserId as string,
      toUserId: details?.toUserId as string,
      reason: details?.reason as string,
    });
    return this.toSchema(message);
  }

  createFileMessageSchema(
    chatId: string,
    senderId: string,
    fileName: string,
    fileUrl: string,
    fileType: string,
    fileSize: number,
  ): MessageSchema {
    const message = Message.createFileMessage({
      chatId,
      senderId,
      fileName,
      attachment: {
        url: fileUrl,
        fileName,
        fileSize,
        mimeType: fileType,
      },
    });
    return this.toSchema(message);
  }
}
