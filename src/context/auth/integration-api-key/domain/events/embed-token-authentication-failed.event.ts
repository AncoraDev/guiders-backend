/**
 * Evento de dominio emitido cuando una autenticación de embed token
 * FALLA. Complementa a `EmbedTokenAuthenticatedEvent` con `failureReason`
 * y `failureDetail` (sanitizado antes de persistir).
 *
 * Se persiste a MongoDB por `PersistEmbedTokenAuthenticationFailedEventHandler`
 * con `result: "failure"` en la misma colección `embed_token_audit_log`.
 */

import { DomainEvent } from 'src/context/shared/domain/domain-event';
import { EmbedAuthFailureReason } from './embed-auth-failure-reason.enum';

export interface EmbedTokenAuthenticationFailedEventAttributes {
  companyId: string;
  userId: string | null; // null si el token no se pudo parsear
  origin: string;
  timestamp: string; // ISO 8601
  ipAddress: string; // raw (se hashea en el handler)
  userAgent: string;
  endpoint: string;
  failureReason: EmbedAuthFailureReason;
  failureDetail: string; // mensaje del error (max 500 chars, sanitized)
}

export class EmbedTokenAuthenticationFailedEvent extends DomainEvent<EmbedTokenAuthenticationFailedEventAttributes> {
  public static readonly EVENT_NAME = 'EmbedTokenAuthenticationFailedEvent';
}
