import { PrimitiveValueObject } from 'src/context/shared/domain/primitive-value-object';

/**
 * Estados posibles para un chat V2 en el sistema comercial-visitante
 */
export enum ChatStatusEnum {
  PENDING = 'PENDING', // Esperando asignación
  ASSIGNED = 'ASSIGNED', // Comerciales asignados pero no activo
  ACTIVE = 'ACTIVE', // Chat activo con un comercial
  CLOSED = 'CLOSED', // Chat finalizado
  TRANSFERRED = 'TRANSFERRED', // Transferido a otro comercial
  ABANDONED = 'ABANDONED', // Visitante se fue sin respuesta
}

/**
 * Value object para el estado del chat V2
 * Valida que el estado sea uno de los valores permitidos
 */
export class ChatStatus extends PrimitiveValueObject<string> {
  // Estados estáticos para facilitar comparaciones
  static readonly PENDING = new ChatStatus(ChatStatusEnum.PENDING);
  static readonly ASSIGNED = new ChatStatus(ChatStatusEnum.ASSIGNED);
  static readonly ACTIVE = new ChatStatus(ChatStatusEnum.ACTIVE);
  static readonly CLOSED = new ChatStatus(ChatStatusEnum.CLOSED);
  static readonly TRANSFERRED = new ChatStatus(ChatStatusEnum.TRANSFERRED);
  static readonly ABANDONED = new ChatStatus(ChatStatusEnum.ABANDONED);

  constructor(value: string) {
    super(
      value,
      (val: string) =>
        Object.values(ChatStatusEnum).includes(val as ChatStatusEnum),
      'El estado del chat debe ser uno de los valores válidos',
    );
  }

  /**
   * Verifica si el chat está en estado pendiente
   */
  isPending(): boolean {
    return this.value === ChatStatusEnum.PENDING.toString();
  }

  /**
   * Verifica si el chat está activo
   */
  isActive(): boolean {
    return this.value === ChatStatusEnum.ACTIVE.toString();
  }

  /**
   * Verifica si el chat está cerrado
   */
  isClosed(): boolean {
    return this.value === ChatStatusEnum.CLOSED.toString();
  }

  /**
   * Verifica si el chat puede recibir mensajes
   */
  canReceiveMessages(): boolean {
    return (
      this.value === ChatStatusEnum.ACTIVE.toString() ||
      this.value === ChatStatusEnum.ASSIGNED.toString()
    );
  }

  /**
   * Verifica si el chat puede ser asignado
   */
  canBeAssigned(): boolean {
    return this.value === ChatStatusEnum.PENDING.toString();
  }

  /**
   * Verifica si el chat puede transferirse a otro comercial
   */
  canBeTransferred(): boolean {
    return (
      this.value === ChatStatusEnum.ASSIGNED.toString() ||
      this.value === ChatStatusEnum.ACTIVE.toString() ||
      this.value === ChatStatusEnum.TRANSFERRED.toString()
    );
  }
}
