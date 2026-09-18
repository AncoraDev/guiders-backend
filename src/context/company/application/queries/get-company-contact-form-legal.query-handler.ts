import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetCompanyContactFormLegalQuery } from './get-company-contact-form-legal.query';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import {
  CompanyContactFormLegal,
  ContactFormLegalPrimitives,
} from '../../domain/value-objects/company-contact-form-legal';

@QueryHandler(GetCompanyContactFormLegalQuery)
export class GetCompanyContactFormLegalQueryHandler
  implements IQueryHandler<GetCompanyContactFormLegalQuery>
{
  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
  ) {}

  async execute(
    query: GetCompanyContactFormLegalQuery,
  ): Promise<ContactFormLegalPrimitives | null> {
    if (!Uuid.validate(query.companyId)) {
      return null;
    }
    const found = await this.companyRepository.findById(
      new Uuid(query.companyId),
    );
    if (found.isErr()) {
      return null;
    }
    return (
      found.unwrap().getContactFormLegal() ??
      CompanyContactFormLegal.empty().getValue()
    );
  }
}
