/**
 * Evento de dominio emitido cuando una autenticación de embed token
 * es exitosa (cualquier endpoint: /start, /refresh, /authenticate-session).
 *
 * Se persiste a MongoDB por `PersistEmbedTokenAuthenticatedEventHandler`
 * (Story 2.2) con TTL 12 meses (NFR-S7 GDPR).
 *
 * Shape:
 * - companyId, userId: identidad del usuario autenticado
 * - origin, ipAddress, userAgent: contexto de la request
 * - endpoint: qué endpoint de embed fue autenticado
 * - timestamp: cuándo ocurrió
 *
 * Story 2.3: campos opcionales para eventos de logout:
 * - logoutTimestamp: timestamp específico del logout
 * - cascadingResult: 'success' | 'partial' | 'not_found' | 'failure'
 * - embedTokenRevoked: si el embed token padre fue revocado OK
 * - failureDetail: solo presente en cascadingResult='partial'
 *
 * NOTA: ipAddress es la IP raw — el handler la hashea con SHA-256 antes
 * de persistir (GDPR Art. 4(1) compliance).
 */

import { DomainEvent } from 'src/context/shared/domain/domain-event';

export interface EmbedTokenAuthenticatedEventAttributes {
  companyId: string;
  userId: string;
  origin: string;
  timestamp: string; // ISO 8601
  ipAddress: string; // raw (se hashea en el handler)
  userAgent: string;
  endpoint: string;
  // Story 2.3 — logout-specific (opcional, presente en eventos de logout)
  logoutTimestamp?: string;
  cascadingResult?: 'success' | 'partial' | 'not_found' | 'failure';
  embedTokenRevoked?: boolean;
  failureDetail?: string;
}

export class EmbedTokenAuthenticatedEvent extends DomainEvent<EmbedTokenAuthenticatedEventAttributes> {
  public static readonly EVENT_NAME = 'EmbedTokenAuthenticatedEvent';
}
