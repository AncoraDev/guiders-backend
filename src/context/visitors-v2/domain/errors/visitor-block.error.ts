import { DomainError } from '../../../shared/domain/domain.error';

export class VisitorBlockForbiddenError extends DomainError {
  constructor() {
    super('No puedes desbloquear a este visitante');
    this.name = 'VisitorBlockForbiddenError';
  }
}

export class VisitorBlockedError extends DomainError {
  constructor() {
    super('El chat no está disponible');
    this.name = 'VisitorBlockedError';
  }
}
