import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ListCompaniesQuery } from './list-companies.query';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import {
  PROVIDER_REPOSITORY,
  ProviderRepository,
} from '../../domain/provider.repository';
import {
  PROVIDER_COMPANY_LINK_REPOSITORY,
  ProviderCompanyLinkRepository,
} from 'src/context/auth/integration-api-key/domain/repository/provider-company-link.repository';
import { PlatformCompanySummaryDto } from '../dtos/platform-company.dto';

@QueryHandler(ListCompaniesQuery)
export class ListCompaniesQueryHandler
  implements IQueryHandler<ListCompaniesQuery, PlatformCompanySummaryDto[]>
{
  private readonly logger = new Logger(ListCompaniesQueryHandler.name);

  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
    @Inject(PROVIDER_REPOSITORY)
    private readonly providers: ProviderRepository,
    @Inject(PROVIDER_COMPANY_LINK_REPOSITORY)
    private readonly links: ProviderCompanyLinkRepository,
  ) {}

  async execute(
    _query: ListCompaniesQuery,
  ): Promise<PlatformCompanySummaryDto[]> {
    const result = await this.companyRepository.findAll();
    if (result.isErr()) {
      this.logger.error(`Error listando companies: ${result.error.message}`);
      return [];
    }

    const companies = result.unwrap();
    const providerCompanyIds = new Set(await this.providers.companyIds());
    const names = new Map(
      companies.map((company) => [
        company.getId().getValue(),
        company.toPrimitives().companyName,
      ]),
    );
    const providerByChild = new Map(
      (await this.links.findAll()).map((link) => [
        link.childCompanyId,
        link.providerCompanyId,
      ]),
    );

    return companies
      .filter((company) => !providerCompanyIds.has(company.getId().getValue()))
      .map((company) => {
        const dto = PlatformCompanySummaryDto.fromPrimitives(
          company.toPrimitives(),
        );
        const providerCompanyId = providerByChild.get(dto.id) ?? null;
        dto.providerId = providerCompanyId;
        dto.providerName = providerCompanyId
          ? (names.get(providerCompanyId) ?? null)
          : null;
        return dto;
      })
      .sort((a, b) => a.companyName.localeCompare(b.companyName, 'es'));
  }
}
