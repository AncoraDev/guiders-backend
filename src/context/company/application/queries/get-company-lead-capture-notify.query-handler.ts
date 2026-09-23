import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetCompanyLeadCaptureNotifyQuery } from './get-company-lead-capture-notify.query';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

@QueryHandler(GetCompanyLeadCaptureNotifyQuery)
export class GetCompanyLeadCaptureNotifyQueryHandler
  implements IQueryHandler<GetCompanyLeadCaptureNotifyQuery>
{
  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
  ) {}

  async execute(query: GetCompanyLeadCaptureNotifyQuery): Promise<string | null> {
    if (!Uuid.validate(query.companyId)) {
      return null;
    }
    const found = await this.companyRepository.findById(
      new Uuid(query.companyId),
    );
    if (found.isErr()) {
      return null;
    }
    return found.unwrap().getLeadCaptureNotifyEmail();
  }
}
