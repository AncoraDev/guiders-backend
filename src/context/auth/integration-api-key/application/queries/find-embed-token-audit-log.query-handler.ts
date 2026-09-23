import { Inject, Injectable } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Result } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { FindEmbedTokenAuditLogQuery } from './find-embed-token-audit-log.query';
import {
  IEmbedTokenAuditLogRepository,
  EMBED_TOKEN_AUDIT_LOG_REPOSITORY,
  EmbedTokenAuditLogQueryResult,
} from '../../domain/repositories/embed-token-audit-log.repository';

@Injectable()
@QueryHandler(FindEmbedTokenAuditLogQuery)
export class FindEmbedTokenAuditLogQueryHandler
  implements IQueryHandler<FindEmbedTokenAuditLogQuery>
{
  constructor(
    @Inject(EMBED_TOKEN_AUDIT_LOG_REPOSITORY)
    private readonly repository: IEmbedTokenAuditLogRepository,
  ) {}

  async execute(
    query: FindEmbedTokenAuditLogQuery,
  ): Promise<Result<EmbedTokenAuditLogQueryResult, DomainError>> {
    return this.repository.findByQuery(query.params);
  }
}
