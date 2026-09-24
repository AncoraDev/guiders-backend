import { Inject, Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import {
  INTEGRATION_API_KEY_REPOSITORY,
  IntegrationApiKeyRepository,
} from 'src/context/auth/integration-api-key/domain/repository/integration-api-key.repository';
import { IntegrationApiKeyCompanyId } from 'src/context/auth/integration-api-key/domain/model/integration-api-key-company-id';
import {
  PROVIDER_COMPANY_LINK_REPOSITORY,
  ProviderCompanyLinkRepository,
} from 'src/context/auth/integration-api-key/domain/repository/provider-company-link.repository';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import {
  PROVIDER_REPOSITORY,
  ProviderRepository,
} from '../../domain/provider.repository';

export class ListProvidersQuery {}

export interface ProviderListItem {
  id: string;
  companyId: string;
  name: string;
  token: string;
  tokenPrefix: string;
  status: string;
  demoAdminEmail: string;
  demoAdminPassword: string;
  createdAt: string;
  clientCount: number;
}

@Injectable()
@QueryHandler(ListProvidersQuery)
export class ListProvidersQueryHandler
  implements IQueryHandler<ListProvidersQuery, ProviderListItem[]>
{
  constructor(
    @Inject(PROVIDER_REPOSITORY)
    private readonly providers: ProviderRepository,
    @Inject(COMPANY_REPOSITORY)
    private readonly companies: CompanyRepository,
    @Inject(INTEGRATION_API_KEY_REPOSITORY)
    private readonly integrationKeys: IntegrationApiKeyRepository,
    @Inject(PROVIDER_COMPANY_LINK_REPOSITORY)
    private readonly links: ProviderCompanyLinkRepository,
  ) {}

  async execute(_query: ListProvidersQuery): Promise<ProviderListItem[]> {
    const rows = await this.providers.findAll();
    const items: ProviderListItem[] = [];

    for (const row of rows) {
      const found = await this.companies.findById(new Uuid(row.companyId));
      const name = found.isOk()
        ? found.unwrap().getCompanyName().getValue()
        : '—';
      const keys = await this.integrationKeys.findByCompanyId(
        IntegrationApiKeyCompanyId.create(row.companyId),
      );
      const active = keys.find((key) => key.status.isActive());
      const shown = active ?? keys[0];
      items.push({
        id: row.id,
        companyId: row.companyId,
        name,
        token: row.accessToken,
        tokenPrefix: shown?.tokenPrefix ?? '—',
        status: shown?.status.getValue() ?? 'revoked',
        demoAdminEmail: row.demoAdminEmail,
        demoAdminPassword: row.demoAdminPassword,
        createdAt: row.createdAt.toISOString(),
        clientCount: await this.links.countByProvider(row.companyId),
      });
    }

    return items.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }
}
