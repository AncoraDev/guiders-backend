import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ListCompaniesQuery } from './list-companies.query';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import { PlatformCompanySummaryDto } from '../dtos/platform-company.dto';

@QueryHandler(ListCompaniesQuery)
export class ListCompaniesQueryHandler
  implements IQueryHandler<ListCompaniesQuery, PlatformCompanySummaryDto[]>
{
  private readonly logger = new Logger(ListCompaniesQueryHandler.name);

  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
  ) {}

  async execute(
    _query: ListCompaniesQuery,
  ): Promise<PlatformCompanySummaryDto[]> {
    const result = await this.companyRepository.findAll();
    if (result.isErr()) {
      this.logger.error(
        `Error listando companies: ${result.error.message}`,
      );
      return [];
    }

    return result
      .unwrap()
      .map((company) =>
        PlatformCompanySummaryDto.fromPrimitives(company.toPrimitives()),
      )
      .sort((a, b) => a.companyName.localeCompare(b.companyName, 'es'));
  }
}
