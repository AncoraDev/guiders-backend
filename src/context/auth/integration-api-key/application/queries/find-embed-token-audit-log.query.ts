import { QueryEmbedTokenAuditLogDto } from '../dtos/query-embed-token-audit-log.dto';

/**
 * Query para buscar eventos del audit log de embed tokens (Story 2.2, Task 7.3).
 *
 * Companion de `QueryEmbedTokenAuditLogDto` — el controller convierte
 * el DTO HTTP a este command antes de ejecutar el handler.
 */
export interface FindEmbedTokenAuditLogQueryParams {
  companyId: string;
  userId?: string;
  fromDate?: Date;
  toDate?: Date;
  result?: 'success' | 'failure';
  limit?: number;
  skip?: number;
}

export class FindEmbedTokenAuditLogQuery {
  constructor(public readonly params: FindEmbedTokenAuditLogQueryParams) {}

  static fromDto(dto: QueryEmbedTokenAuditLogDto): FindEmbedTokenAuditLogQuery {
    return new FindEmbedTokenAuditLogQuery({
      companyId: dto.companyId,
      userId: dto.userId,
      fromDate: dto.fromDate,
      toDate: dto.toDate,
      result: dto.result,
      limit: dto.limit,
      skip: dto.skip,
    });
  }
}
