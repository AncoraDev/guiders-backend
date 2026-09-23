/**
 * Persiste EmbedTokenAuthenticatedEvent a MongoDB (Story 2.2, Task 3.1).
 *
 * CRITICAL (AC7): si el repository falla, NO propaga el error al flujo
 * principal (la request HTTP ya respondió 200 al usuario). Loggea WARN
 * con el payload para recuperación manual.
 *
 * PII sanitization (AC8):
 * - IP se hashea con SHA-256 prefix 16 chars
 * - userAgent se trunca a 500 chars
 * - failureDetail se trunca y sanitiza (no aplica en success pero
 *   el helper es seguro de llamar)
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { EmbedTokenAuthenticatedEvent } from '../../domain/events/embed-token-authenticated.event';
import {
  IEmbedTokenAuditLogRepository,
  EMBED_TOKEN_AUDIT_LOG_REPOSITORY,
  EmbedTokenAuditLogPrimitives,
} from '../../domain/repositories/embed-token-audit-log.repository';
import { hashIp, truncateUserAgent } from '../utils/pii-sanitizer.util';

@Injectable()
@EventsHandler(EmbedTokenAuthenticatedEvent)
export class PersistEmbedTokenAuthenticatedEventHandler
  implements IEventHandler<EmbedTokenAuthenticatedEvent>
{
  private readonly logger = new Logger(
    PersistEmbedTokenAuthenticatedEventHandler.name,
  );

  constructor(
    @Inject(EMBED_TOKEN_AUDIT_LOG_REPOSITORY)
    private readonly repository: IEmbedTokenAuditLogRepository,
  ) {}

  async handle(event: EmbedTokenAuthenticatedEvent): Promise<void> {
    // TD-1 fix: NO seteamos createdAt/updatedAt manualmente.
    // Mongoose los maneja vía `timestamps: true` en el schema.
    const primitives: EmbedTokenAuditLogPrimitives = {
      id: event.id.value,
      companyId: event.attributes.companyId,
      userId: event.attributes.userId,
      origin: event.attributes.origin,
      timestamp: new Date(event.attributes.timestamp),
      ipAddressHash: hashIp(event.attributes.ipAddress),
      userAgent: truncateUserAgent(event.attributes.userAgent),
      endpoint: event.attributes.endpoint,
      result: 'success',
    };

    const result = await this.repository.save(primitives);

    if (result.isErr()) {
      // AC7: el flujo de auth ya respondió al cliente. El error de
      // Mongo NO debe romper la auditoría (best effort). Loggear
      // y continuar.
      this.logger.warn(
        `[Audit log persistence failed] event_id=${event.id.value} ` +
          `companyId=${primitives.companyId} endpoint=${primitives.endpoint} ` +
          `error=${result.error.message}`,
      );
    }
  }
}
