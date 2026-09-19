import { Result } from 'src/context/shared/domain/result';
import { LeadCaptureSession } from './entities/lead-capture-session';
import { LeadCaptureError } from './errors/lead-capture.error';

export interface LeadCaptureSessionRepository {
  /**
   * Captación del visitante, o null si nunca entró en el guion. Hay una por
   * visitante: el chat puede cambiar, el progreso no.
   */
  findByVisitorId(
    visitorId: string,
  ): Promise<Result<LeadCaptureSession | null, LeadCaptureError>>;

  /** Upsert idempotente: el asistente guarda en cada avance. */
  save(session: LeadCaptureSession): Promise<Result<void, LeadCaptureError>>;
}

export const LEAD_CAPTURE_SESSION_REPOSITORY = Symbol(
  'LeadCaptureSessionRepository',
);
