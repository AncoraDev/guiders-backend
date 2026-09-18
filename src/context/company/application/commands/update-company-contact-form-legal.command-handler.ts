import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { UpdateCompanyContactFormLegalCommand } from './update-company-contact-form-legal.command';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import {
  CompanyContactFormLegal,
  ContactFormLegalPrimitives,
} from '../../domain/value-objects/company-contact-form-legal';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { Result, err, ok } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { CompanyNotFoundError } from '../../domain/errors/company.error';
import { InvalidCompanyDataError } from '../errors/company-platform.errors';

@CommandHandler(UpdateCompanyContactFormLegalCommand)
export class UpdateCompanyContactFormLegalCommandHandler
  implements ICommandHandler<UpdateCompanyContactFormLegalCommand>
{
  private readonly logger = new Logger(
    UpdateCompanyContactFormLegalCommandHandler.name,
  );

  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
  ) {}

  async execute(
    command: UpdateCompanyContactFormLegalCommand,
  ): Promise<Result<ContactFormLegalPrimitives, DomainError>> {
    if (!Uuid.validate(command.companyId)) {
      return err(new InvalidCompanyDataError('ID de empresa no válido'));
    }

    const found = await this.companyRepository.findById(
      new Uuid(command.companyId),
    );
    if (found.isErr()) {
      return err(new CompanyNotFoundError());
    }

    let legal: CompanyContactFormLegal;
    try {
      legal = CompanyContactFormLegal.fromInput({
        ...found.unwrap().getContactFormLegal(),
        ...command.legal,
      });
    } catch (error) {
      return err(
        new InvalidCompanyDataError(
          error instanceof Error ? error.message : 'Datos legales no válidos',
        ),
      );
    }

    const updated = found.unwrap().updateContactFormLegal(legal.getValue());
    const saveResult = await this.companyRepository.updateContactFormLegal(
      updated.getId(),
      updated.getContactFormLegal(),
    );
    if (saveResult.isErr()) {
      this.logger.error(
        `Error guardando textos legales de company ${command.companyId}: ${saveResult.error.message}`,
      );
      return err(saveResult.error);
    }

    return ok(updated.getContactFormLegal());
  }
}
