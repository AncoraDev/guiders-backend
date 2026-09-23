/**
 * Persiste EmbedTokenAuthenticationFailedEvent a MongoDB (Story 2.2, Task 3.2).
 *
 * CRITICAL (AC7): si el repository falla, NO propaga el error.
 * Loggea WARN con el payload (failureReason incluido) para
 * recuperación manual. Ver también `PersistEmbedTokenAuthenticatedEventHandler`.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { EmbedTokenAuthenticationFailedEvent } from '../../domain/events/embed-token-authentication-failed.event';
import {
  IEmbedTokenAuditLogRepository,
  EMBED_TOKEN_AUDIT_LOG_REPOSITORY,
  EmbedTokenAuditLogPrimitives,
} from '../../domain/repositories/embed-token-audit-log.repository';
import {
  hashIp,
  truncateUserAgent,
  sanitizeFailureDetail,
} from '../utils/pii-sanitizer.util';

@Injectable()
@EventsHandler(EmbedTokenAuthenticationFailedEvent)
export class PersistEmbedTokenAuthenticationFailedEventHandler
  implements IEventHandler<EmbedTokenAuthenticationFailedEvent>
{
  private readonly logger = new Logger(
    PersistEmbedTokenAuthenticationFailedEventHandler.name,
  );

  constructor(
    @Inject(EMBED_TOKEN_AUDIT_LOG_REPOSITORY)
    private readonly repository: IEmbedTokenAuditLogRepository,
  ) {}

  async handle(event: EmbedTokenAuthenticationFailedEvent): Promise<void> {
    // TD-1 fix: NO seteamos createdAt/updatedAt manualmente.
    // Mongoose los maneja vía `timestamps: true` en el schema.
    const primitives: EmbedTokenAuditLogPrimitives = {
      id: event.id.value,
      companyId: event.attributes.companyId,
      userId: event.attributes.userId ?? undefined,
      origin: event.attributes.origin,
      timestamp: new Date(event.attributes.timestamp),
      ipAddressHash: hashIp(event.attributes.ipAddress),
      userAgent: truncateUserAgent(event.attributes.userAgent),
      endpoint: event.attributes.endpoint,
      result: 'failure',
      failureReason: event.attributes.failureReason,
      failureDetail: sanitizeFailureDetail(event.attributes.failureDetail),
    };

    const result = await this.repository.save(primitives);

    if (result.isErr()) {
      this.logger.warn(
        `[Audit log persistence failed] event_id=${event.id.value} ` +
          `companyId=${primitives.companyId} endpoint=${primitives.endpoint} ` +
          `failureReason=${primitives.failureReason} ` +
          `error=${result.error.message}`,
      );
    }
  }
}
