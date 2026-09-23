/**
 * Repository interface para embed_token_audit_log (Story 2.2, Task 2.2).
 *
 * Define el contrato entre la capa de application y la implementación
 * Mongo (infrastructure/). Sigue el patrón `I*Repository` + Symbol
 * del proyecto (shared/AGENTS.md "Inyección de dependencias por Symbol").
 */

import { Result } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';

export interface EmbedTokenAuditLogPrimitives {
  id: string;
  companyId: string;
  userId?: string;
  origin: string;
  timestamp: Date;
  ipAddressHash: string;
  userAgent: string;
  endpoint: string;
  result: 'success' | 'failure';
  failureReason?: string;
  failureDetail?: string;
  // TD-1 fix: createdAt y updatedAt NO se incluyen en primitives —
  // Mongoose los maneja automáticamente vía `timestamps: true` en el schema.
  // El handler NO setea estos campos manualmente (antes sobreescribía
  // el valor de Mongoose con su propio tiempo, causando timestamps drifted).
}

export interface EmbedTokenAuditLogQuery {
  companyId: string; // required
  userId?: string;
  fromDate?: Date;
  toDate?: Date;
  result?: 'success' | 'failure';
  limit?: number; // default 100, max 1000
  skip?: number; // default 0
}

export interface EmbedTokenAuditLogQueryResult {
  events: EmbedTokenAuditLogPrimitives[];
  total: number;
}

export interface IEmbedTokenAuditLogRepository {
  save(event: EmbedTokenAuditLogPrimitives): Promise<Result<void, DomainError>>;

  findByQuery(
    query: EmbedTokenAuditLogQuery,
  ): Promise<Result<EmbedTokenAuditLogQueryResult, DomainError>>;
}

export const EMBED_TOKEN_AUDIT_LOG_REPOSITORY = Symbol(
  'EmbedTokenAuditLogRepository',
);
