import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { UpdateCompanyCannedRepliesCommand } from './update-company-canned-replies.command';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import { CompanyCannedReplies } from '../../domain/value-objects/company-canned-replies';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { Result, err, ok } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { CompanyNotFoundError } from '../../domain/errors/company.error';
import { InvalidCompanyDataError } from '../errors/company-platform.errors';
import { CannedReplyPrimitives } from 'src/context/shared/domain/canned-reply';

@CommandHandler(UpdateCompanyCannedRepliesCommand)
export class UpdateCompanyCannedRepliesCommandHandler
  implements ICommandHandler<UpdateCompanyCannedRepliesCommand>
{
  private readonly logger = new Logger(
    UpdateCompanyCannedRepliesCommandHandler.name,
  );

  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
  ) {}

  async execute(
    command: UpdateCompanyCannedRepliesCommand,
  ): Promise<Result<CannedReplyPrimitives[], DomainError>> {
    if (!Uuid.validate(command.companyId)) {
      return err(new InvalidCompanyDataError('ID de empresa no válido'));
    }

    let replies: CompanyCannedReplies;
    try {
      replies = CompanyCannedReplies.fromInput(command.items);
    } catch (error) {
      return err(
        new InvalidCompanyDataError(
          error instanceof Error ? error.message : 'Frases no válidas',
        ),
      );
    }

    const found = await this.companyRepository.findById(
      new Uuid(command.companyId),
    );
    if (found.isErr()) {
      return err(new CompanyNotFoundError());
    }

    const updated = found.unwrap().updateCannedReplies(replies.getValue());
    const saveResult = await this.companyRepository.updateCannedReplies(
      updated.getId(),
      updated.getCannedReplies(),
    );
    if (saveResult.isErr()) {
      this.logger.error(
        `Error guardando frases de company ${command.companyId}: ${saveResult.error.message}`,
      );
      return err(saveResult.error);
    }

    return ok(updated.getCannedReplies());
  }
}
