import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Esquema MongoDB para el contenido del mensaje
 */
@Schema({ _id: false })
export class MessageContentSchema {
  @Prop({ required: true, type: String })
  text: string;

  @Prop({ required: false, type: Object })
  metadata?: Record<string, any>;

  @Prop({ required: false, type: [Object] })
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
    mimeType: string;
  }>;
}

export const MessageContentSchemaDefinition =
  SchemaFactory.createForClass(MessageContentSchema);

/**
 * Esquema MongoDB para el Message V2
 * Optimizado para consultas de chat en tiempo real
 */
@Schema({
  collection: 'messages_v2',
  timestamps: true,
  toJSON: {
    transform: (_doc: any, ret: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      ret.id = ret._id?.toString();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      delete ret._id;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      delete ret.__v;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return ret;
    },
  },
})
export class MessageSchema {
  @Prop({
    type: String,
    required: true,
    unique: true,
    index: true,
  })
  id: string;

  @Prop({
    type: String,
    required: true,
    index: true,
  })
  chatId: string;

  @Prop({
    type: String,
    required: true,
    enum: [
      'TEXT',
      'SYSTEM',
      'FILE',
      'IMAGE',
      'TRANSFER',
      'ASSIGNMENT',
      'AI',
      'INTERACTIVE',
    ],
    index: true,
  })
  type: string;

  @Prop({
    type: MessageContentSchemaDefinition,
    required: true,
  })
  content: MessageContentSchema;

  @Prop({
    type: String,
    required: true,
    index: true,
  })
  senderId: string;

  @Prop({
    type: String,
    required: true,
    enum: ['visitor', 'commercial', 'system', 'ai'],
    index: true,
  })
  senderType: string;

  @Prop({
    type: Date,
    required: true,
    index: true,
  })
  sentAt: Date;

  @Prop({
    type: Date,
    required: false,
    index: true,
    sparse: true,
  })
  readAt?: Date;

  @Prop({
    type: String,
    required: false,
    index: true,
    sparse: true,
  })
  readBy?: string;

  @Prop({
    type: Boolean,
    required: true,
    default: false,
    index: true,
  })
  isRead: boolean;

  @Prop({
    type: Boolean,
    required: true,
    default: false,
    index: true,
  })
  isEdited: boolean;

  @Prop({
    type: Date,
    required: false,
  })
  editedAt?: Date;

  @Prop({
    type: Boolean,
    required: true,
    default: false,
  })
  isDeleted: boolean;

  @Prop({
    type: Date,
    required: false,
  })
  deletedAt?: Date;

  // Campos adicionales para optimización
  @Prop({
    type: Number,
    required: true,
    index: true,
  })
  sequenceNumber: number;

  @Prop({
    type: String,
    required: false,
    index: true,
    sparse: true,
  })
  replyToMessageId?: string;

  @Prop({
    type: Boolean,
    required: true,
    default: false,
    index: true,
  })
  isInternal: boolean;

  @Prop({
    type: [String],
    required: false,
    index: true,
  })
  tags?: string[];

  @Prop({
    type: Object,
    required: false,
  })
  analytics?: {
    deliveryTime?: number;
    readTime?: number;
    responseTime?: number;
    sentiment?: 'positive' | 'neutral' | 'negative';
    priority?: number;
  };

  // Campos para búsqueda de texto
  @Prop({
    type: String,
    required: false,
    index: 'text',
  })
  searchableText?: string;

  @Prop({
    type: Date,
    required: false,
  })
  updatedAt?: Date;

  // Información de archivos para mensajes de tipo file
  @Prop({
    type: Object,
    required: false,
  })
  fileInfo?: {
    originalName: string;
    mimeType: string;
    size: number;
    url: string;
    thumbnailUrl?: string;
    downloadCount?: number;
  };

  // Información de sistema para mensajes automáticos
  @Prop({
    type: Object,
    required: false,
  })
  systemInfo?: {
    action: string;
    previousValue?: any;
    newValue?: any;
    triggeredBy?: string;
    automationRule?: string;
  };

  // Campos para mensajes de IA
  @Prop({
    type: Boolean,
    required: true,
    default: false,
    index: true,
  })
  isAI: boolean;

  @Prop({
    type: Object,
    required: false,
  })
  aiInfo?: {
    model?: string; // Modelo de IA usado
    confidence?: number; // Nivel de confianza 0-1
    suggestedActions?: string[]; // Acciones sugeridas
    processingTimeMs?: number; // Tiempo de procesamiento
    context?: Record<string, unknown>; // Contexto adicional
  };
}

export type MessageDocument = HydratedDocument<MessageSchema>;
export const MessageSchemaDefinition =
  SchemaFactory.createForClass(MessageSchema);

// Índices compuestos para optimización de consultas frecuentes
MessageSchemaDefinition.index({ chatId: 1, sentAt: 1 });
MessageSchemaDefinition.index({ chatId: 1, sequenceNumber: 1 });
MessageSchemaDefinition.index({ chatId: 1, isRead: 1, senderType: 1 });
MessageSchemaDefinition.index({ senderId: 1, sentAt: -1 });
MessageSchemaDefinition.index({ type: 1, sentAt: -1 });
MessageSchemaDefinition.index({ chatId: 1, type: 1, sentAt: 1 });
MessageSchemaDefinition.index({ isRead: 1, readAt: 1 });

// Índices para consultas de tiempo real
MessageSchemaDefinition.index({ chatId: 1, sentAt: -1, isDeleted: 1 });
MessageSchemaDefinition.index({ chatId: 1, senderType: 1, sentAt: -1 });

// Índices para análisis y métricas
MessageSchemaDefinition.index({ senderType: 1, sentAt: 1, type: 1 });
MessageSchemaDefinition.index({ sentAt: 1, type: 1, 'analytics.sentiment': 1 });

// Índice de texto completo para búsqueda
MessageSchemaDefinition.index({
  searchableText: 'text',
  'content.text': 'text',
});

// Pre-hooks para mantener campos derivados
MessageSchemaDefinition.pre('save', function (next) {
  if (this.isModified()) {
    this.updatedAt = new Date();
  }

  // Generar texto de búsqueda
  if (this.content?.text) {
    this.searchableText = this.content.text.toLowerCase();
  }

  // Marcar como leído si se asigna readAt
  if (this.readAt && !this.isRead) {
    this.isRead = true;
  }

  // Establecer tiempo de edición
  if (this.isModified('content') && this.isNew === false) {
    this.isEdited = true;
    this.editedAt = new Date();
  }

  next();
});

// Middleware para actualizar contadores en Chat
MessageSchemaDefinition.post('save', async function () {
  // Aquí se podría actualizar el contador de mensajes en el chat
  // pero lo manejaremos en el servicio de aplicación para mantener
  // la separación de responsabilidades
});

MessageSchemaDefinition.post('deleteOne', async function () {
  // Manejar limpieza post-eliminación si es necesario
});
