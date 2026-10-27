import { DomainError } from 'src/context/shared/domain/domain.error';

/**
 * Error para cuando falta un campo requerido para crear un chat
 */
export class ChatMissingRequiredFieldError extends DomainError {
  constructor(field: string) {
    super(`El campo '${field}' es requerido para crear un chat`);
  }
}

/**
 * Error cuando el chat no se encuentra en el repositorio
 */
export class ChatNotFoundError extends DomainError {
  constructor(chatId: string) {
    super(`Chat ${chatId} no encontrado`);
    this.name = 'ChatNotFoundError';
  }
}

/**
 * Error cuando el chat no pertenece al tenant del usuario que solicita la operación
 */
export class ChatTenantMismatchError extends DomainError {
  constructor(chatId: string, requestedBy: string) {
    super(
      `El chat ${chatId} no pertenece al tenant del usuario ${requestedBy}`,
    );
    this.name = 'ChatTenantMismatchError';
  }
}

/**
 * Error cuando el chatId proporcionado no tiene un formato UUID válido
 */
export class ChatInvalidIdError extends DomainError {
  constructor(chatId: string) {
    super(`El chatId '${chatId}' no tiene un formato UUID válido`);
    this.name = 'ChatInvalidIdError';
  }
}

/**
 * Un comercial intenta abrir chat con un visitante que ya atiende otro.
 */
export class ChatAttendedByOtherCommercialError extends DomainError {
  constructor() {
    super('Este visitante ya está en conversación con otro comercial');
    this.name = 'ChatAttendedByOtherCommercialError';
  }
}
