import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { Result, err, ok } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { UpdateLeadFollowUpCommand } from './update-lead-follow-up.command';
import {
  ILeadContactDataRepository,
  LEAD_CONTACT_DATA_REPOSITORY,
} from '../../domain/lead-contact-data.repository';
import { LeadContactDataPrimitives } from '../../domain/services/crm-sync.service';
import { LeadContactDataNotFoundError } from '../../domain/errors/leads.error';

@CommandHandler(UpdateLeadFollowUpCommand)
export class UpdateLeadFollowUpCommandHandler
  implements ICommandHandler<UpdateLeadFollowUpCommand>
{
  private readonly logger = new Logger(UpdateLeadFollowUpCommandHandler.name);

  constructor(
    @Inject(LEAD_CONTACT_DATA_REPOSITORY)
    private readonly repository: ILeadContactDataRepository,
  ) {}

  async execute(
    command: UpdateLeadFollowUpCommand,
  ): Promise<Result<LeadContactDataPrimitives, DomainError>> {
    const { visitorId, companyId, commercialId, status } = command.input;

    const existingResult = await this.repository.findByVisitorId(
      visitorId,
      companyId,
    );
    if (existingResult.isErr()) {
      return err(existingResult.error);
    }

    const existing = existingResult.unwrap();
    if (!existing) {
      return err(new LeadContactDataNotFoundError(visitorId));
    }

    const updated: LeadContactDataPrimitives = {
      ...existing,
      followUpStatus: status,
      followUpAt: new Date(),
      followUpBy: commercialId,
    };

    const updateResult = await this.repository.update(updated);
    if (updateResult.isErr()) {
      return err(updateResult.error);
    }

    this.logger.log(
      `Seguimiento del visitor ${visitorId} → ${status} por ${commercialId}`,
    );
    return ok(updated);
  }
}
