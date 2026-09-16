import { PrimitiveValueObject } from 'src/context/shared/domain/primitive-value-object';

/**
 * Tipos de mensaje en el sistema V2
 */
export enum MessageTypeEnum {
  TEXT = 'TEXT',
  FILE = 'FILE',
  IMAGE = 'IMAGE',
  SYSTEM = 'SYSTEM', // Mensajes del sistema
  TRANSFER = 'TRANSFER', // Notificación de transferencia
  ASSIGNMENT = 'ASSIGNMENT', // Notificación de asignación
  AI = 'AI', // Mensajes generados por IA
  INTERACTIVE = 'INTERACTIVE', // Formularios / acciones en el hilo
}

/**
 * Value object para el tipo de mensaje V2
 */
export class MessageType extends PrimitiveValueObject<string> {
  // Tipos estáticos para facilitar comparaciones
  static readonly TEXT = new MessageType(MessageTypeEnum.TEXT);
  static readonly FILE = new MessageType(MessageTypeEnum.FILE);
  static readonly IMAGE = new MessageType(MessageTypeEnum.IMAGE);
  static readonly SYSTEM = new MessageType(MessageTypeEnum.SYSTEM);
  static readonly TRANSFER = new MessageType(MessageTypeEnum.TRANSFER);
  static readonly ASSIGNMENT = new MessageType(MessageTypeEnum.ASSIGNMENT);
  static readonly AI = new MessageType(MessageTypeEnum.AI);
  static readonly INTERACTIVE = new MessageType(MessageTypeEnum.INTERACTIVE);

  constructor(value: string) {
    super(
      value,
      (val: string) =>
        Object.values(MessageTypeEnum).includes(val as MessageTypeEnum),
      'El tipo de mensaje debe ser uno de los valores válidos',
    );
  }

  /**
   * Verifica si es un mensaje de texto
   */
  isText(): boolean {
    return this.value === MessageTypeEnum.TEXT.toString();
  }

  /**
   * Verifica si es un mensaje con archivo
   */
  isFile(): boolean {
    return this.value === MessageTypeEnum.FILE.toString();
  }

  /**
   * Verifica si es una imagen
   */
  isImage(): boolean {
    return this.value === MessageTypeEnum.IMAGE.toString();
  }

  /**
   * Verifica si es un mensaje del sistema
   */
  isSystem(): boolean {
    return (
      this.value === MessageTypeEnum.SYSTEM.toString() ||
      this.value === MessageTypeEnum.TRANSFER.toString() ||
      this.value === MessageTypeEnum.ASSIGNMENT.toString()
    );
  }

  /**
   * Verifica si es un mensaje generado por IA
   */
  isAI(): boolean {
    return this.value === MessageTypeEnum.AI.toString();
  }

  /**
   * Verifica si es un mensaje que el visitante puede ver
   */
  isVisibleToVisitor(): boolean {
    // Los mensajes del sistema generalmente no son visibles para el visitante
    return !this.isSystem();
  }

  /**
   * Verifica si requiere adjunto
   */
  requiresAttachment(): boolean {
    return (
      this.value === MessageTypeEnum.FILE.toString() ||
      this.value === MessageTypeEnum.IMAGE.toString()
    );
  }

  /**
   * Verifica si el tipo de mensaje requiere contenido de texto
   */
  requiresContent(): boolean {
    return (
      this.value === MessageTypeEnum.TEXT.toString() ||
      this.value === MessageTypeEnum.SYSTEM.toString() ||
      this.value === MessageTypeEnum.TRANSFER.toString() ||
      this.value === MessageTypeEnum.ASSIGNMENT.toString() ||
      this.value === MessageTypeEnum.AI.toString() ||
      this.value === MessageTypeEnum.INTERACTIVE.toString()
    );
  }

  /**
   * Verifica si el tipo de mensaje puede tener adjuntos
   */
  canHaveAttachment(): boolean {
    return (
      this.value === MessageTypeEnum.FILE.toString() ||
      this.value === MessageTypeEnum.IMAGE.toString()
    );
  }
}
