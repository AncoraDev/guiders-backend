import { DomainEvent } from '../../../shared/domain/domain-event';
import { VisitorBlockReason } from '../value-objects/visitor-block';

export interface VisitorBlockedEventPayload {
  readonly visitorId: string;
  readonly tenantId: string;
  readonly blockedAt: string;
  readonly blockedBy: string;
  readonly blockedByName: string;
  readonly reason: VisitorBlockReason;
  readonly note?: string;
}

/**
 * El visitante queda bloqueado para toda la empresa.
 */
export class VisitorBlockedEvent extends DomainEvent<VisitorBlockedEventPayload> {
  constructor(payload: VisitorBlockedEventPayload) {
    super(payload);
  }
}
