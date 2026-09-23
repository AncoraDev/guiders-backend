import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query DTO para GET /v2/integration/embed/audit-log (Story 2.2, Task 7.1).
 *
 * - companyId: SIEMPRE requerido (multi-tenant)
 * - userId/fromDate/toDate/result: opcionales
 * - limit: default 100, max 1000
 * - skip: default 0
 */
export class QueryEmbedTokenAuditLogDto {
  @IsUUID('4')
  companyId!: string;

  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsISO8601()
  fromDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsISO8601()
  toDate?: Date;

  @IsOptional()
  @IsEnum(['success', 'failure'])
  result?: 'success' | 'failure';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
