import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetCompanyWidgetConfigByDomainQuery } from './get-company-widget-config-by-domain.query';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import {
  CompanyWidgetConfig,
  WidgetConfigPrimitives,
} from '../../domain/value-objects/company-widget-config';

@QueryHandler(GetCompanyWidgetConfigByDomainQuery)
export class GetCompanyWidgetConfigByDomainQueryHandler
  implements IQueryHandler<GetCompanyWidgetConfigByDomainQuery>
{
  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
  ) {}

  async execute(
    query: GetCompanyWidgetConfigByDomainQuery,
  ): Promise<WidgetConfigPrimitives | null> {
    const found = await this.companyRepository.findByDomain(query.domain);
    if (found.isErr()) {
      return null;
    }
    return (
      found.unwrap().getWidgetConfig() ??
      CompanyWidgetConfig.empty().getValue()
    );
  }
}
