import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { UpdateCompanyLeadCaptureNotifyCommand } from './update-company-lead-capture-notify.command';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import { LeadCaptureNotifyEmail } from '../../domain/value-objects/lead-capture-notify-email';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { Result, err, ok } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { CompanyNotFoundError } from '../../domain/errors/company.error';
import { InvalidCompanyDataError } from '../errors/company-platform.errors';

@CommandHandler(UpdateCompanyLeadCaptureNotifyCommand)
export class UpdateCompanyLeadCaptureNotifyCommandHandler
  implements ICommandHandler<UpdateCompanyLeadCaptureNotifyCommand>
{
  private readonly logger = new Logger(
    UpdateCompanyLeadCaptureNotifyCommandHandler.name,
  );

  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
  ) {}

  async execute(
    command: UpdateCompanyLeadCaptureNotifyCommand,
  ): Promise<Result<string, DomainError>> {
    if (!Uuid.validate(command.companyId)) {
      return err(new InvalidCompanyDataError('ID de empresa no válido'));
    }

    const found = await this.companyRepository.findById(
      new Uuid(command.companyId),
    );
    if (found.isErr()) {
      return err(new CompanyNotFoundError());
    }

    let email: LeadCaptureNotifyEmail;
    try {
      email = LeadCaptureNotifyEmail.fromInput(command.email);
    } catch (error) {
      return err(
        new InvalidCompanyDataError(
          error instanceof Error
            ? error.message
            : 'Email de avisos no válido',
        ),
      );
    }

    const updated = found
      .unwrap()
      .updateLeadCaptureNotifyEmail(email.value);
    const saveResult =
      await this.companyRepository.updateLeadCaptureNotifyEmail(
        updated.getId(),
        updated.getLeadCaptureNotifyEmail(),
      );
    if (saveResult.isErr()) {
      this.logger.error(
        `Error guardando email de avisos de company ${command.companyId}: ${saveResult.error.message}`,
      );
      return err(saveResult.error);
    }

    return ok(updated.getLeadCaptureNotifyEmail());
  }
}
