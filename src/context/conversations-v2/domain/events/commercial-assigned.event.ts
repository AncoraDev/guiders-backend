import { DomainEvent } from 'src/context/shared/domain/domain-event';

/**
 * Datos del comercial asignado
 */
export interface CommercialAssignedData {
  chatId: string;
  commercialId: string;
  visitorId: string;
  previousStatus: string;
  newStatus: string;
  assignedAt: Date;
  assignmentReason?: string; // auto, manual, transfer
  /** Comercial anterior en transferencias */
  previousCommercialId?: string;
  transferredBy?: string;
}

/**
 * Evento de dominio que se dispara cuando se asigna un comercial a un chat
 */
export class CommercialAssignedEvent extends DomainEvent<{
  assignment: CommercialAssignedData;
}> {
  constructor(data: { assignment: CommercialAssignedData }) {
    super(data);
  }

  /**
   * Nombre del evento para identificación
   */
  static eventName = 'chat.v2.commercial.assigned';

  /**
   * Obtiene los datos de la asignación
   */
  getAssignmentData(): CommercialAssignedData {
    return this.attributes.assignment;
  }

  /**
   * Obtiene el ID del chat
   */
  getChatId(): string {
    return this.attributes.assignment.chatId;
  }

  /**
   * Obtiene el ID del comercial
   */
  getCommercialId(): string {
    return this.attributes.assignment.commercialId;
  }

  /**
   * Obtiene el ID del visitante
   */
  getVisitorId(): string {
    return this.attributes.assignment.visitorId;
  }

  /**
   * Verifica si fue una asignación automática
   */
  isAutoAssignment(): boolean {
    return this.attributes.assignment.assignmentReason === 'auto';
  }

  /**
   * Verifica si fue una transferencia
   */
  isTransfer(): boolean {
    return this.attributes.assignment.assignmentReason === 'transfer';
  }
}
