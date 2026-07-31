import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { GetPlatformCompanyDetailQuery } from './get-platform-company-detail.query';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import { PlatformCompanyDetailDto } from '../dtos/platform-company.dto';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

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

    return PlatformCompanyDetailDto.fromPrimitives(
      result.unwrap().toPrimitives(),
    );
  }
}
