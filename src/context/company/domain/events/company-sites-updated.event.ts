import { DomainEvent } from 'src/context/shared/domain/domain-event';
import { SitePrimitives } from '../entities/site';

export interface CompanySitesUpdatedPayload {
  id: string;
  companyName: string;
  sites: SitePrimitives[];
  createdAt: string;
  updatedAt: string;
}

/** Sitios de una empresa ya existente: dominio canónico y aliases. */
export class CompanySitesUpdatedEvent extends DomainEvent<CompanySitesUpdatedPayload> {
  constructor(payload: CompanySitesUpdatedPayload) {
    super(payload);
  }
}
