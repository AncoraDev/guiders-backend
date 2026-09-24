import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { GetPlatformCompanyDetailQuery } from './get-platform-company-detail.query';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import { PlatformCompanyDetailDto } from '../dtos/platform-company.dto';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import {
  PROVIDER_COMPANY_LINK_REPOSITORY,
  ProviderCompanyLinkRepository,
} from 'src/context/auth/integration-api-key/domain/repository/provider-company-link.repository';

@QueryHandler(GetPlatformCompanyDetailQuery)
export class GetPlatformCompanyDetailQueryHandler
  implements
    IQueryHandler<
      GetPlatformCompanyDetailQuery,
      PlatformCompanyDetailDto | null
    >
{
  private readonly logger = new Logger(
    GetPlatformCompanyDetailQueryHandler.name,
  );

  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
    @Inject(PROVIDER_COMPANY_LINK_REPOSITORY)
    private readonly links: ProviderCompanyLinkRepository,
  ) {}

  async execute(
    query: GetPlatformCompanyDetailQuery,
  ): Promise<PlatformCompanyDetailDto | null> {
    if (!Uuid.validate(query.companyId)) {
      this.logger.warn(`ID de empresa inválido: ${query.companyId}`);
      return null;
    }

    const result = await this.companyRepository.findById(
      new Uuid(query.companyId),
    );
    if (result.isErr()) {
      return null;
    }

    const dto = PlatformCompanyDetailDto.fromPrimitives(
      result.unwrap().toPrimitives(),
    );
    const link = await this.links.findByChild(dto.id);
    if (!link) return dto;

    const provider = await this.companyRepository.findById(
      new Uuid(link.providerCompanyId),
    );
    dto.providerId = link.providerCompanyId;
    dto.providerName = provider.isOk()
      ? provider.unwrap().toPrimitives().companyName
      : null;
    return dto;
  }
}
