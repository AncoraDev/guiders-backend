import { LeadFollowUpStatus } from '../../domain/lead-follow-up';

/**
 * El comercial marca un lead automático como contactado o descartado.
 */
export class UpdateLeadFollowUpCommand {
  constructor(
    public readonly input: {
      visitorId: string;
      companyId: string;
      commercialId: string;
      status: LeadFollowUpStatus;
    },
  ) {}
}
