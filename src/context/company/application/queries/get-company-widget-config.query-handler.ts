import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetCompanyWidgetConfigQuery } from './get-company-widget-config.query';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import {
  CompanyWidgetConfig,
  WidgetConfigPrimitives,
} from '../../domain/value-objects/company-widget-config';

@QueryHandler(GetCompanyWidgetConfigQuery)
export class GetCompanyWidgetConfigQueryHandler
  implements IQueryHandler<GetCompanyWidgetConfigQuery>
{
  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
  ) {}

  async execute(
    query: GetCompanyWidgetConfigQuery,
  ): Promise<WidgetConfigPrimitives | null> {
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
      found.unwrap().getWidgetConfig() ??
      CompanyWidgetConfig.empty().getValue()
    );
  }
}
