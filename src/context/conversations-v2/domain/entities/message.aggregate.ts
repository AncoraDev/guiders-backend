import { AggregateRoot } from '@nestjs/cqrs';
import { MessageId } from '../value-objects/message-id';
import { MessageType } from '../value-objects/message-type';
import { MessageContent } from '../value-objects/message-content';
import { ChatId } from '../value-objects/chat-id';
import { MessageSentEvent } from '../events/message-sent.event';

/**
 * Datos del sistema para mensajes especiales
 */
export interface SystemData {
  action?: string; // 'assigned', 'transferred', 'joined', 'left'
  fromUserId?: string;
  toUserId?: string;
  reason?: string;
}

/**
 * Metadatos para mensajes generados por IA
 */
export interface AIMetadata {
  model?: string; // Modelo de IA usado (ej: 'gpt-4', 'claude-3')
  confidence?: number; // Nivel de confianza 0-1
  suggestedActions?: string[]; // Acciones sugeridas al usuario
  processingTimeMs?: number; // Tiempo de procesamiento
  context?: Record<string, unknown>; // Contexto adicional
}

/**
 * Datos de adjuntos
 */
export interface AttachmentData {
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

/**
 * Interfaz para los datos primitivos del mensaje V2
 */
export interface MessagePrimitives {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  type: string;
  systemData?: SystemData;
  attachment?: AttachmentData;
  isInternal: boolean;
  isFirstResponse: boolean;
  isRead: boolean;
  readAt?: Date;
  readBy?: string;
  isAI: boolean;
  aiMetadata?: AIMetadata;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Propiedades para crear un mensaje
 */
export interface MessageProperties {
  id: MessageId;
  chatId: ChatId;
  senderId: string;
  content: MessageContent;
  type: MessageType;
  systemData?: SystemData;
  attachment?: AttachmentData;
  isInternal: boolean;
  isFirstResponse: boolean;
  isRead?: boolean;
  readAt?: Date;
  readBy?: string;
  isAI?: boolean;
  aiMetadata?: AIMetadata;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Entidad Message V2 - Optimizada para el sistema comercial-visitante
 */
export class Message extends AggregateRoot {
  private constructor(
    private readonly _id: MessageId,
    private readonly _chatId: ChatId,
    private readonly _senderId: string,
    private readonly _content: MessageContent,
    private readonly _type: MessageType,
    private readonly _systemData: SystemData | null,
    private readonly _attachment: AttachmentData | null,
    private readonly _isInternal: boolean,
    private readonly _isFirstResponse: boolean,
    private readonly _isRead: boolean,
    private readonly _readAt: Date | null,
    private readonly _readBy: string | null,
    private readonly _isAI: boolean,
    private readonly _aiMetadata: AIMetadata | null,
    private readonly _createdAt: Date,
    private readonly _updatedAt: Date,
  ) {
    super();
  }

  /**
   * Método de fábrica para crear un mensaje desde value objects
   */
  public static create(props: MessageProperties): Message {
    const message = new Message(
      props.id,
      props.chatId,
      props.senderId,
      props.content,
      props.type,
      props.systemData || null,
      props.attachment || null,
      props.isInternal,
      props.isFirstResponse,
      props.isRead || false,
      props.readAt || null,
      props.readBy || null,
      props.isAI || false,
      props.aiMetadata || null,
      props.createdAt,
      props.updatedAt,
    );

    // Aplica el evento de dominio al crear el mensaje
    message.apply(
      new MessageSentEvent({
        message: {
          messageId: message._id.getValue(),
          chatId: message._chatId.getValue(),
          senderId: message._senderId,
          content: message._content.value,
          type: message._type.value,
          isFirstResponse: message._isFirstResponse,
          isInternal: message._isInternal,
          sentAt: message._createdAt,
          systemData: message._systemData || undefined,
          attachment: message._attachment || undefined,
          isAI: message._isAI,
          aiMetadata: message._aiMetadata || undefined,
        },
      }),
    );

    return message;
  }

  /**
   * Método de fábrica para reconstruir desde datos primitivos
   */
  public static fromPrimitives(params: MessagePrimitives): Message {
    return new Message(
      MessageId.create(params.id),
      ChatId.create(params.chatId),
      params.senderId,
      new MessageContent(params.content),
      new MessageType(params.type),
      params.systemData || null,
      params.attachment || null,
      params.isInternal,
      params.isFirstResponse,
      params.isRead || false,
      params.readAt || null,
      params.readBy || null,
      params.isAI || false,
      params.aiMetadata || null,
      params.createdAt,
      params.updatedAt,
    );
  }

  /**
   * Crea un mensaje de texto regular
   */
  public static createTextMessage(params: {
    chatId: string;
    senderId: string;
    content: string;
    isInternal?: boolean;
    isFirstResponse?: boolean;
  }): Message {
    const now = new Date();

    return Message.create({
      id: MessageId.generate(),
      chatId: ChatId.create(params.chatId),
      senderId: params.senderId,
      content: new MessageContent(params.content),
      type: MessageType.TEXT,
      isInternal: params.isInternal || false,
      isFirstResponse: params.isFirstResponse || false,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Crea un mensaje del sistema
   */
  public static createSystemMessage(params: {
    chatId: string;
    action: string;
    fromUserId?: string;
    toUserId?: string;
    reason?: string;
    /** Texto visible; si no se indica, se genera según action. */
    content?: string;
    /**
     * Por defecto true (solo comerciales).
     * Transferencias visibles en el hilo: pasar false.
     */
    isInternal?: boolean;
  }): Message {
    const now = new Date();

    // Generar contenido descriptivo basado en la acción
    let content = params.content?.trim() || '';
    if (!content) {
      switch (params.action) {
        case 'assigned':
          content = `Comercial asignado al chat`;
          break;
        case 'transferred':
          content = `Chat transferido a otro comercial`;
          break;
        case 'joined':
          content = `Usuario se unió al chat`;
          break;
        case 'left':
          content = `Usuario abandonó el chat`;
          break;
        default:
          content = `Acción del sistema: ${params.action}`;
      }
    }

    return Message.create({
      id: MessageId.generate(),
      chatId: ChatId.create(params.chatId),
      senderId: 'system',
      content: new MessageContent(content),
      type: MessageType.SYSTEM,
      systemData: {
        action: params.action,
        fromUserId: params.fromUserId,
        toUserId: params.toUserId,
        reason: params.reason,
      },
      isInternal: params.isInternal ?? true,
      isFirstResponse: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Crea un mensaje con archivo adjunto
   */
  public static createFileMessage(params: {
    chatId: string;
    senderId: string;
    fileName: string;
    attachment: AttachmentData;
    isInternal?: boolean;
  }): Message {
    const now = new Date();
    const content = `Archivo adjunto: ${params.fileName}`;

    return Message.create({
      id: MessageId.generate(),
      chatId: ChatId.create(params.chatId),
      senderId: params.senderId,
      content: new MessageContent(content),
      type: params.attachment.mimeType.startsWith('image/')
        ? MessageType.IMAGE
        : MessageType.FILE,
      attachment: params.attachment,
      isInternal: params.isInternal || false,
      isFirstResponse: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Crea un mensaje generado por IA
   */
  public static createAIMessage(params: {
    chatId: string;
    content: string;
    aiMetadata?: AIMetadata;
  }): Message {
    const now = new Date();

    return Message.create({
      id: MessageId.generate(),
      chatId: ChatId.create(params.chatId),
      senderId: 'ai',
      content: new MessageContent(params.content),
      type: MessageType.AI,
      isInternal: false,
      isFirstResponse: false,
      isAI: true,
      aiMetadata: params.aiMetadata,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Serializa la entidad a un objeto plano
   */
  public toPrimitives(): MessagePrimitives {
    return {
      id: this._id.getValue(),
      chatId: this._chatId.getValue(),
      senderId: this._senderId,
      content: this._content.value,
      type: this._type.value,
      systemData: this._systemData || undefined,
      attachment: this._attachment || undefined,
      isInternal: this._isInternal,
      isFirstResponse: this._isFirstResponse,
      isRead: this._isRead,
      readAt: this._readAt || undefined,
      readBy: this._readBy || undefined,
      isAI: this._isAI,
      aiMetadata: this._aiMetadata || undefined,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }

  // Getters de solo lectura
  get id(): MessageId {
    return this._id;
  }

  get chatId(): ChatId {
    return this._chatId;
  }

  get senderId(): string {
    return this._senderId;
  }

  get content(): MessageContent {
    return this._content;
  }

  get type(): MessageType {
    return this._type;
  }

  get systemData(): SystemData | null {
    return this._systemData;
  }

  get attachment(): AttachmentData | null {
    return this._attachment;
  }

  get isInternal(): boolean {
    return this._isInternal;
  }

  get isFirstResponse(): boolean {
    return this._isFirstResponse;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get isRead(): boolean {
    return this._isRead;
  }

  get readAt(): Date | null {
    return this._readAt;
  }

  get readBy(): string | null {
    return this._readBy;
  }

  get isAI(): boolean {
    return this._isAI;
  }

  get aiMetadata(): AIMetadata | null {
    return this._aiMetadata;
  }

  /**
   * Verifica si es un mensaje del sistema
   */
  public isSystemMessage(): boolean {
    return this._type.isSystem();
  }

  /**
   * Verifica si es visible para el visitante
   */
  public isVisibleToVisitor(): boolean {
    return !this._isInternal && this._type.isVisibleToVisitor();
  }

  /**
   * Verifica si tiene adjunto
   */
  public hasAttachment(): boolean {
    return Boolean(this._attachment);
  }

  /**
   * Obtiene el resumen del contenido
   */
  public getContentSummary(): string {
    return this._content.getSummary();
  }

  /**
   * Verifica si el mensaje fue leído por un usuario específico
   */
  public isReadBy(userId: string): boolean {
    return this._isRead && this._readBy === userId;
  }

  /**
   * Verifica si el mensaje debe ser marcado como no leído para un usuario
   * (mensajes enviados por otros usuarios que aún no han sido leídos)
   */
  public isUnreadFor(userId: string): boolean {
    return !this._isRead && this._senderId !== userId;
  }

  /**
   * Verifica si es un mensaje generado por IA
   */
  public isAIMessage(): boolean {
    return this._isAI || this._type.isAI();
  }
}
