import { DomainEvent } from '../../../shared/domain/domain-event';

export interface VisitorUnblockedEventPayload {
  readonly visitorId: string;
  readonly tenantId: string;
  readonly unblockedAt: string;
  readonly unblockedBy: string;
  readonly unblockedByName: string;
}

/**
 * Se levanta el bloqueo. El chat cerrado no se reabre.
 */
export class VisitorUnblockedEvent extends DomainEvent<VisitorUnblockedEventPayload> {
  constructor(payload: VisitorUnblockedEventPayload) {
    super(payload);
  }
}
