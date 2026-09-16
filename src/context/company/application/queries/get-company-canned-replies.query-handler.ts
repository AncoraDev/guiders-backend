import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetCompanyCannedRepliesQuery } from './get-company-canned-replies.query';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { CannedReplyPrimitives } from 'src/context/shared/domain/canned-reply';

@QueryHandler(GetCompanyCannedRepliesQuery)
export class GetCompanyCannedRepliesQueryHandler
  implements IQueryHandler<GetCompanyCannedRepliesQuery>
{
  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
  ) {}

  async execute(
    query: GetCompanyCannedRepliesQuery,
  ): Promise<CannedReplyPrimitives[] | null> {
    if (!Uuid.validate(query.companyId)) {
      return null;
    }
    const found = await this.companyRepository.findById(
      new Uuid(query.companyId),
    );
    if (found.isErr()) {
      return null;
    }
    return found.unwrap().getCannedReplies();
  }
}
