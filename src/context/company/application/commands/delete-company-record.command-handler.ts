import { Inject, Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Result, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import { CompanyNotFoundError } from '../../domain/errors/company.error';
import { InvalidCompanyDataError } from '../errors/company-platform.errors';
import { DeleteCompanyRecordCommand } from './delete-company-record.command';

@Injectable()
@CommandHandler(DeleteCompanyRecordCommand)
export class DeleteCompanyRecordCommandHandler
  implements ICommandHandler<DeleteCompanyRecordCommand>
{
  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companies: CompanyRepository,
  ) {}

  async execute(
    command: DeleteCompanyRecordCommand,
  ): Promise<Result<void, DomainError>> {
    if (!Uuid.validate(command.companyId)) {
      return err(new InvalidCompanyDataError('ID de empresa no válido'));
    }
    const found = await this.companies.findById(new Uuid(command.companyId));
    if (found.isErr()) return err(new CompanyNotFoundError());
    return this.companies.delete(new Uuid(command.companyId));
  }
}
