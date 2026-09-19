import { DomainError } from 'src/context/shared/domain/domain.error';

export class LeadCaptureError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = 'LeadCaptureError';
  }
}

/** El guion no cumple las reglas que lo hacen recorrible por el visitante. */
export class InvalidLeadCaptureFlowError extends LeadCaptureError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLeadCaptureFlowError';
  }
}

export class LeadCaptureFlowPersistenceError extends LeadCaptureError {
  constructor(message: string) {
    super(message);
    this.name = 'LeadCaptureFlowPersistenceError';
  }
}

/** El progreso que manda el asistente no es aprovechable. */
export class InvalidLeadCaptureSessionError extends LeadCaptureError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLeadCaptureSessionError';
  }
}

export class LeadCaptureSessionPersistenceError extends LeadCaptureError {
  constructor(message: string) {
    super(message);
    this.name = 'LeadCaptureSessionPersistenceError';
  }
}
